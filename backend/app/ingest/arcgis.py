"""Paginated ArcGIS REST client. Used only at ingest time; request handlers never call county servers for data."""
from __future__ import annotations

import gzip
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from .datasets import ArcGisDataset

log = logging.getLogger(__name__)
PAGE_SIZE = 1000  # the county MapServer's MaxRecordCount


def _get_json(client: httpx.Client, url: str, params: dict, retries: int = 3) -> dict:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(f"ArcGIS error from {url}: {data['error']}")
            return data
        except (httpx.HTTPError, ValueError, RuntimeError) as exc:  # network blips, 5xx, bad JSON
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last}")


def fetch_features(ds: ArcGisDataset, client: httpx.Client | None = None) -> list[dict]:
    """Return every GeoJSON feature of a layer (WGS84), paginating with resultOffset."""
    own = client is None
    client = client or httpx.Client(timeout=90, headers={"User-Agent": "miami-dade-school-navigator/0.1"})
    try:
        count = _get_json(client, f"{ds.url}/query", {"where": "1=1", "returnCountOnly": "true", "f": "json"})["count"]
        features: list[dict] = []
        offset = 0
        while True:
            params = {
                "where": "1=1",
                "outFields": ds.out_fields,
                "outSR": 4326,
                "f": "geojson",
                "returnGeometry": "true",
                "geometryPrecision": 6,
                "resultOffset": offset,
                "resultRecordCount": PAGE_SIZE,
            }
            if ds.order_by:
                params["orderByFields"] = ds.order_by
            page = _get_json(client, f"{ds.url}/query", params)
            batch = page.get("features", [])
            if not batch:
                break
            features.extend(batch)
            offset += len(batch)
            # Joined layers report a different count than they return, so rely on the transfer-limit flag instead.
            exceeded = page.get("exceededTransferLimit") or page.get("properties", {}).get("exceededTransferLimit")
            if len(batch) < PAGE_SIZE and not exceeded:
                break
        if len(features) < min(count, 1):
            log.warning("%s: layer reported %s records but none were returned", ds.key, count)
        return features
    finally:
        if own:
            client.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def write_snapshot(path: Path, ds: ArcGisDataset, features: list[dict]) -> dict:
    meta = {"key": ds.key, "title": ds.title, "url": ds.url, "retrieved_at": now_iso(), "record_count": len(features)}
    path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        json.dump({"meta": meta, "features": features}, fh, separators=(",", ":"))
    return meta


def read_snapshot(path: Path) -> tuple[dict, list[dict]]:
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        data = json.load(fh)
    return data["meta"], data["features"]
