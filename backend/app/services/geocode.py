"""Address -> coordinates. Order: county address points, Census Geocoder, ZIP centroid (low confidence).

Google services are deliberately not used. Queries contain addresses, so results are cached in memory only (short TTL) and
never written to disk or logs.
"""
from __future__ import annotations

import re
import time
from datetime import date

import httpx

from ..i18n import current_lang, t
from ..ingest.datasets import (ADDRESS_POINTS_TITLE, ADDRESS_POINTS_URL, CENSUS_GEOCODER_URL)
from ..schemas import GeocodeResult
from .context import Navigator
from .errors import ApiError

# Rough bounding box of Miami-Dade County; points outside it are rejected rather than silently mis-served.
COUNTY_BBOX = (25.13, 25.98, -80.90, -80.10)
_CACHE: dict[str, tuple[float, GeocodeResult]] = {}
_TTL = 3600.0

_SUFFIX = {"STREET": "ST", "AVENUE": "AVE", "BOULEVARD": "BLVD", "ROAD": "RD", "DRIVE": "DR", "COURT": "CT", "PLACE": "PL",
           "TERRACE": "TER", "LANE": "LN", "HIGHWAY": "HWY", "PARKWAY": "PKWY", "CIRCLE": "CIR", "TRAIL": "TRL", "WAY": "WAY"}
_DIR = {"NORTHWEST": "NW", "NORTHEAST": "NE", "SOUTHWEST": "SW", "SOUTHEAST": "SE", "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W"}
_ZIP_ONLY = re.compile(r"^\s*(\d{5})(?:-\d{4})?\s*$")
_ZIP_ANY = re.compile(r"\b(\d{5})(?:-\d{4})?\b")


def in_county(lat: float, lon: float) -> bool:
    return COUNTY_BBOX[0] <= lat <= COUNTY_BBOX[1] and COUNTY_BBOX[2] <= lon <= COUNTY_BBOX[3]


def _street_key(text: str) -> tuple[str | None, str | None]:
    """'2250 NW 2nd Avenue, Miami FL 33127' -> ('2250', 'NW 2ND AVE')."""
    t = _ZIP_ANY.sub(" ", text.upper())
    t = re.split(r",|\bMIAMI\b|\bFL\b|\bFLORIDA\b", t)[0]
    t = re.sub(r"[.#]", " ", t)
    m = re.match(r"\s*(\d+)\s+(.+)", t)
    if not m:
        return None, None
    words = [(_DIR.get(w) or _SUFFIX.get(w) or w) for w in m.group(2).split()]
    return m.group(1), " ".join(words)


def _county_address(client: httpx.Client, house: str, street: str, zip_code: str | None) -> tuple[float, float, str] | None:
    safe_street = street.replace("'", "''")
    where = f"HSE_NUM={int(house)} AND SNAME='{safe_street}'"
    if zip_code:
        where += f" AND ZIP={int(zip_code)}"
    r = client.get(f"{ADDRESS_POINTS_URL}/query", params={
        "where": where, "outFields": "HSE_NUM,SNAME,ZIP,MUNIC_NAME", "outSR": 4326, "returnGeometry": "true", "f": "json",
        "resultRecordCount": 5})
    r.raise_for_status()
    feats = r.json().get("features", [])
    if not feats:
        return None
    f = feats[0]
    a = f["attributes"]
    label = f"{a['HSE_NUM']} {a['SNAME']}, {(a.get('MUNIC_NAME') or 'MIAMI-DADE').title()}, FL {a['ZIP']}"
    return f["geometry"]["y"], f["geometry"]["x"], label


def _census(client: httpx.Client, q: str) -> tuple[float, float, str] | None:
    r = client.get(CENSUS_GEOCODER_URL, params={"address": q, "benchmark": "Public_AR_Current", "format": "json"})
    r.raise_for_status()
    matches = r.json().get("result", {}).get("addressMatches", [])
    if not matches:
        return None
    m = matches[0]
    return m["coordinates"]["y"], m["coordinates"]["x"], m["matchedAddress"].title().replace("Fl,", "FL,")


def geocode(nav: Navigator, q: str, client: httpx.Client | None = None) -> GeocodeResult:
    q = (q or "").strip()
    if len(q) < 3:
        raise ApiError(422, "query_too_short")
    key = f"{current_lang()}|{q.lower()}"  # the cached result carries translated text, so the language is part of the key
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < _TTL:
        return hit[1]

    today = date.today().isoformat()
    own = client is None
    client = client or httpx.Client(timeout=8, headers={"User-Agent": "miami-dade-school-navigator/0.1"})
    result: GeocodeResult | None = None
    try:
        zip_only = _ZIP_ONLY.match(q)
        if not zip_only:
            house, street = _street_key(q)
            zm = _ZIP_ANY.search(q)
            if house and street:
                try:
                    found = _county_address(client, house, street, zm.group(1) if zm else None) or (
                        _county_address(client, house, street, None) if zm else None)
                except (httpx.HTTPError, ValueError):
                    found = None  # county down or slow: fall through to the Census geocoder
                if found:
                    result = GeocodeResult(lat=found[0], lon=found[1], matched_address=found[2], source=ADDRESS_POINTS_TITLE,
                                           url=ADDRESS_POINTS_URL, confidence=0.95, precision="address", as_of=today,
                                           method=t("m.geo.county"))
            if result is None:
                try:
                    found = _census(client, q)
                except (httpx.HTTPError, ValueError):
                    found = None
                if found:
                    result = GeocodeResult(lat=found[0], lon=found[1], matched_address=found[2], source="US Census Bureau Geocoder (Public_AR_Current)",
                                           url="https://geocoding.geo.census.gov/", confidence=0.8, precision="address", as_of=today,
                                           method=t("m.geo.census"))
    finally:
        if own:
            client.close()

    if result is None:
        z = zip_only.group(1) if zip_only else (_ZIP_ANY.search(q).group(1) if _ZIP_ANY.search(q) else None)
        row = nav.conn.execute("SELECT lat, lon FROM zip_centroids WHERE zip=?", (z,)).fetchone() if z else None
        if row:
            p = nav.prov("county_zip_codes")
            result = GeocodeResult(lat=row["lat"], lon=row["lon"], matched_address=t("geo.zip.address", zip=z),
                                   source=p.source, url=p.url, confidence=0.4, precision="zip", as_of=p.as_of,
                                   method=t("m.geo.zip"),
                                   note=t("geo.zip.note"))
    if result is None:
        raise ApiError(404, "geocode_not_found", params={"q": q[:60]})
    if not in_county(result.lat, result.lon):
        raise ApiError(422, "outside_county", key="outside_county.address")
    _CACHE[key] = (time.time(), result)
    if len(_CACHE) > 2000:
        _CACHE.pop(next(iter(_CACHE)))
    return result
