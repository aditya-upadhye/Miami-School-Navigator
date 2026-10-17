"""Build the SQLite database from county snapshots (or live county servers), then layer on state and curated data.

    python -m app.ingest.build            # use snapshots; download any that are missing
    python -m app.ingest.build --refresh  # re-download every county layer first (falls back to the snapshot)

Request handlers never call county servers for data: everything they serve is built here, once.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import httpx
from shapely.geometry import shape
from shapely import wkb

from .. import db
from ..config import Settings, get_settings
from ..domain import parse_grades, stages_for_grades
from . import arcgis, curated, fldoe, quality, research
from .datasets import ARCGIS_DATASETS, ArcGisDataset

log = logging.getLogger("ingest")

# SchoolSite TYPE codes that are not K-12 instruction sites (adult ed, admin buildings, pre-K annexes "PLC", unknown).
NON_INSTRUCTIONAL_SITE_TYPES = {"A", "O", "PLC", "U"}


# ---------- helpers ----------
def _s(v) -> str | None:
    if v is None:
        return None
    t = re.sub(r"\s+", " ", str(v)).strip()
    return t or None


def _website(v) -> str | None:
    """The county's website column occasionally holds an email address; the spec forbids exposing email, so those are dropped."""
    t = _s(v)
    if not t or "@" in t or " " in t:
        return None
    if not re.match(r"^https?://", t, re.I):
        t = "https://" + t
    return t if "." in t else None


def _zip(v) -> str | None:
    if v in (None, "", 0):
        return None
    digits = re.sub(r"\D", "", str(v))
    return digits.zfill(5)[:5] if digits else None


def _int(v) -> int | None:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def _epoch_ms_to_date(v) -> str | None:
    try:
        return datetime.fromtimestamp(int(v) / 1000, tz=timezone.utc).date().isoformat()
    except (TypeError, ValueError, OSError):
        return None


def _point(feature: dict) -> tuple[float, float] | None:
    g = feature.get("geometry") or {}
    if g.get("type") == "Point" and g.get("coordinates"):
        lon, lat = g["coordinates"][:2]
        return float(lat), float(lon)
    p = feature.get("properties", {})
    if p.get("LAT") and p.get("LON"):
        return float(p["LAT"]), float(p["LON"])
    return None


def _strip_prefix(props: dict) -> dict:
    """Joined layers prefix every field ('psde2.MDC.ElementaryAttendanceBoundary.NAME'); keep the first occurrence of each short
    name, which is the layer's own field (the joined SchoolSite columns come last)."""
    out: dict = {}
    for k, v in props.items():
        out.setdefault(k.split(".")[-1], v)
    return out


def _addr(p: dict) -> str | None:
    a = _s(p.get("ADDRESS"))
    u = _s(p.get("UNIT"))
    return f"{a} {u}" if a and u else a


def _private_id(p: dict) -> str:
    key = "|".join(_s(p.get(k)) or "" for k in ("NAME", "ADDRESS", "ZIPCODE")).lower()
    return hashlib.sha1(key.encode()).hexdigest()[:10]


# ---------- dataset loading ----------
def load_dataset(s: Settings, ds: ArcGisDataset, refresh: bool, client: httpx.Client | None) -> tuple[dict, list[dict]] | None:
    path = s.snapshot_dir / f"{ds.key}.json.gz"
    if refresh or not path.exists():
        try:
            feats = arcgis.fetch_features(ds, client)
            meta = arcgis.write_snapshot(path, ds, feats)
            log.info("%s: downloaded %s records", ds.key, meta["record_count"])
            return meta, feats
        except Exception as exc:  # county down -> fall back to the snapshot on disk
            log.warning("%s: live fetch failed (%s)", ds.key, exc)
    if path.exists():
        meta, feats = arcgis.read_snapshot(path)
        log.info("%s: using snapshot from %s (%s records)", ds.key, meta["retrieved_at"], meta["record_count"])
        return meta, feats
    log.error("%s: no snapshot and live fetch failed; dataset unavailable", ds.key)
    return None


# ---------- place builders ----------
def _place(source_layer: str, source_id: str, kind: str, p: dict, pt: tuple[float, float], *, pid: str, **kw) -> dict:
    row = {
        "id": pid, "source_layer": source_layer, "source_id": source_id, "kind": kind,
        "name": _s(p.get("NAME")) or "(unnamed)", "address": _addr(p), "city": _s(p.get("CITY")),
        "zip": _zip(p.get("ZIPCODE")), "phone": _s(p.get("PHONE")), "website": None,
        "lat": pt[0], "lon": pt[1], "grades_text": None, "stage_flags": "[]", "enrollment": None,
        "is_magnet": None, "magnet_themes": None, "state_grade": None, "state_grade_year": None,
        "gains_ela": None, "gains_math": None, "ese_signal": None, "scholarship_flags": None,
        "site_type": None, "capacity": None, "state_key": None, "join_confidence": None, "extra": "{}",
    }
    row.update(kw)
    return row


def build_public(feats: list[dict]) -> tuple[list[dict], dict]:
    rows: list[dict] = []
    seen: dict[str, int] = {}
    skipped = {"non_instructional": 0, "no_grades": 0, "no_geometry": 0}
    for f in feats:
        p = f["properties"]
        pt = _point(f)
        if not pt:
            skipped["no_geometry"] += 1
            continue
        stype = _s(p.get("TYPE"))
        if stype in NON_INSTRUCTIONAL_SITE_TYPES:
            skipped["non_instructional"] += 1
            continue
        grades = _s(p.get("GRADES"))
        flags = stages_for_grades(parse_grades(grades))
        if not flags:
            skipped["no_grades"] += 1
            continue
        sid = _s(p.get("ID")) or f"oid{p.get('OBJECTID')}"
        seen[sid] = seen.get(sid, 0) + 1
        # a few schools list several campuses under one ID: keep the first as "pub-<id>", suffix the rest
        pid = f"pub-{sid}" if seen[sid] == 1 else f"pub-{sid}-{p.get('OBJECTID')}"
        extra = {"campus": _s(p.get("CAMPUS")), "region": _s(p.get("REGION"))}
        rows.append(_place(
            "county_school_sites", sid, "public", p, pt, pid=pid, grades_text=grades,
            stage_flags=json.dumps(flags), enrollment=_int(p.get("ENROLLMNT")), site_type=stype,
            capacity=_int(p.get("CAPACITY")), extra=json.dumps({k: v for k, v in extra.items() if v}),
            ese_signal="special_center" if stype == "SPC" else None,
        ))
    return rows, skipped


def build_charter(feats: list[dict]) -> list[dict]:
    rows, seen = [], {}
    for f in feats:
        p, pt = f["properties"], _point(f)
        if not pt:
            continue
        sid = _s(p.get("ID")) or f"oid{p.get('OBJECTID')}"
        seen[sid] = seen.get(sid, 0) + 1
        pid = f"chr-{sid}" if seen[sid] == 1 else f"chr-{sid}-{p.get('OBJECTID')}"
        grades = _s(p.get("GRADE"))
        rows.append(_place(
            "county_charter_schools", sid, "charter", p, pt, pid=pid, grades_text=grades,
            stage_flags=json.dumps(stages_for_grades(parse_grades(grades))), enrollment=_int(p.get("ENROLLMNT")),
            capacity=_int(p.get("CAPACITY")), website=_website(p.get("WEBSITE")),
        ))
    return rows


def build_private(feats: list[dict]) -> list[dict]:
    rows = []
    for f in feats:
        p, pt = f["properties"], _point(f)
        if not pt:
            continue
        status = (_s(p.get("STATUS")) or "").lower()
        if status in {"closed", "inactive"}:
            continue
        grades = _s(p.get("GRDLEVEL"))
        sid = _private_id(p)
        rows.append(_place(
            "county_private_schools", sid, "private", p, pt, pid=f"prv-{sid}", grades_text=grades,
            stage_flags=json.dumps(stages_for_grades(parse_grades(grades))), enrollment=_int(p.get("ENROLLMENT")),
            website=_website(p.get("WEBSITE")), extra=json.dumps({"county_status": _s(p.get("STATUS"))}),
        ))
    return rows


# The county child-care layer also lists school-age programs that are not early learning: extended programs at schools "(EP)",
# "A/S" and "B/A" (after/before-school) listings, after-school programs and camps. Real VPK providers say "(VPK)" and are kept.
NOT_EARLY_LEARNING = re.compile(
    r"\(EP\)|\bA/S\b|\bB/A\b|\bafter[- ]?school\b|\bbefore and after\b|\bsummer camp\b|\bGirl Scouts\b|\b\w+ camp$", re.I)


def is_school_age_program(name: str | None) -> bool:
    return bool(name and NOT_EARLY_LEARNING.search(name.strip()))


def build_early_learning(daycare: list[dict], head_start: list[dict]) -> tuple[list[dict], list[str]]:
    """Returns (rows, names of school-age programs and camps that were left out)."""
    rows = []
    left_out: list[str] = []
    for f in daycare:
        p, pt = f["properties"], _point(f)
        if not pt:
            continue
        if is_school_age_program(_s(p.get("NAME"))):
            left_out.append(_s(p.get("NAME")))
            continue
        sid = _s(p.get("DACRID")) or f"oid{p.get('OBJECTID')}"
        extra = {"license_number": _s(p.get("LICNUM")), "license_expires": _epoch_ms_to_date(p.get("LICEXP"))}
        # The county layer lists licensed child care without an age range, so the stage flags are an assumption we label as such.
        rows.append(_place(
            "county_daycare", sid, "early_learning", p, pt, pid=f"elc-{sid}",
            stage_flags=json.dumps(["infant_toddler", "pre_k"]), capacity=_int(p.get("CAPACITY")),
            extra=json.dumps({k: v for k, v in extra.items() if v}),
        ))
    for f in head_start:
        p, pt = f["properties"], _point(f)
        if not pt:
            continue
        sid = f"oid{p.get('OBJECTID')}"
        rows.append(_place(
            "county_head_start", sid, "early_learning", p, pt, pid=f"hs-{sid}",
            stage_flags=json.dumps(["infant_toddler", "pre_k"]) if _s(p.get("EARLYHS")) else json.dumps(["pre_k"]),
            website=_website(p.get("WEBSITE")), extra=json.dumps({"head_start": True, "early_head_start": _s(p.get("EARLYHS"))}),
        ))
    return rows, left_out


def build_pois(parks_m, parks_c, libs, mlibs) -> list[dict]:
    out = []
    for layer, feats, kind in (("county_parks_municipal", parks_m, "park"), ("county_parks_county", parks_c, "park"),
                               ("county_libraries", libs, "library"), ("county_municipal_libraries", mlibs, "library")):
        for f in feats:
            p, pt = f["properties"], _point(f)
            if not pt:
                continue
            name = _s(p.get("NAME")) or _s(p.get("BRANCH"))
            if not name:
                continue
            out.append({"kind": kind, "name": name, "address": _addr(p), "lat": pt[0], "lon": pt[1],
                        "source_layer": layer, "source_id": _s(p.get("ID")) or f"oid{p.get('OBJECTID')}"})
    return out


def build_zones(level: str, feats: list[dict]) -> list[dict]:
    out = []
    for f in feats:
        if not f.get("geometry"):
            continue
        p = _strip_prefix(f["properties"])
        sid = _s(p.get("ID"))
        if sid is None:
            continue
        if level == "middle":
            sid = sid.zfill(4)  # middle-school IDs are stored as small integers by the county
        geom = shape(f["geometry"])
        if not geom.is_valid:
            geom = geom.buffer(0)
        out.append({"level": level, "school_source_id": sid, "school_name": _s(p.get("NAME")) or _s(p.get("DISPLAYNAME")),
                    "geometry": wkb.dumps(geom)})
    return out


def build_zip_centroids(feats: list[dict]) -> list[dict]:
    out = {}
    for f in feats:
        if not f.get("geometry"):
            continue
        z = _zip(f["properties"].get("ZIPCODE") or f["properties"].get("ZIP"))
        if not z:
            continue
        pt = shape(f["geometry"]).representative_point()  # always inside the polygon, unlike the centroid
        out[z] = {"zip": z, "lat": pt.y, "lon": pt.x}
    return list(out.values())


# ---------- orchestration ----------
def _insert(conn: sqlite3.Connection, table: str, rows: list[dict]) -> None:
    if not rows:
        return
    cols = list(rows[0].keys())
    conn.executemany(f"INSERT OR REPLACE INTO {table} ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                     [tuple(r[c] for c in cols) for r in rows])


def build_database(settings: Settings | None = None, refresh: bool = False) -> dict:
    s = settings or get_settings()
    s.db_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(str(s.db_path) + ".building")
    tmp.unlink(missing_ok=True)
    conn = db.connect(tmp)
    db.init_schema(conn)

    client = httpx.Client(timeout=90, headers={"User-Agent": "miami-dade-school-navigator/0.1"}) if refresh else None
    loaded: dict[str, tuple[dict, list[dict]]] = {}
    try:
        for ds in ARCGIS_DATASETS.values():
            res = load_dataset(s, ds, refresh, client if refresh or not (s.snapshot_dir / f"{ds.key}.json.gz").exists() else None)
            if res:
                loaded[ds.key] = res
    finally:
        if client:
            client.close()

    def feats(key: str) -> list[dict]:
        return loaded[key][1] if key in loaded else []

    report: dict = {"datasets": {}, "skipped_public": {}}
    for key, (meta, _) in loaded.items():
        conn.execute("INSERT OR REPLACE INTO datasets (name,title,url,retrieved_at,record_count,as_of,notes) VALUES (?,?,?,?,?,?,?)",
                     (key, meta["title"], meta["url"], meta["retrieved_at"], meta["record_count"], meta["retrieved_at"][:10], None))
        report["datasets"][key] = meta["record_count"]
    report["missing_datasets"] = sorted(set(ARCGIS_DATASETS) - set(loaded))

    public, report["skipped_public"] = build_public(feats("county_school_sites"))
    early, left_out = build_early_learning(feats("county_daycare"), feats("county_head_start"))
    report["left_out_school_age_programs"] = {"count": len(left_out), "examples": left_out[:15]}
    places = public + build_charter(feats("county_charter_schools")) + build_private(feats("county_private_schools")) + early
    _insert(conn, "places", places)
    _insert(conn, "pois", build_pois(feats("county_parks_municipal"), feats("county_parks_county"),
                                     feats("county_libraries"), feats("county_municipal_libraries")))
    for level in ("elementary", "middle", "high"):
        _insert(conn, "zones", build_zones(level, feats(f"county_zone_{level}")))
    _insert(conn, "zip_centroids", build_zip_centroids(feats("county_zip_codes")))
    conn.commit()
    report["places"] = conn.execute("SELECT kind, COUNT(*) n FROM places GROUP BY kind").fetchall()
    report["places"] = {r["kind"]: r["n"] for r in report["places"]}

    report["fldoe"] = fldoe.apply(conn, s.fldoe_dir)
    report["curated"] = curated.apply(conn, s.curated_dir)
    report["research"] = research.apply(conn, s.curated_dir)
    quality.compute(conn, report)
    conn.commit()
    conn.close()
    os.replace(tmp, s.db_path)  # atomic: a running server never sees a half-built database
    log.info("database ready at %s: %s", s.db_path, report["places"])
    return report


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="re-download county layers (falls back to snapshots on failure)")
    args = ap.parse_args()
    report = build_database(refresh=args.refresh)
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
