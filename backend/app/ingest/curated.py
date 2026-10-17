"""Hand-curated, human-verified data (data/curated/*.json). Nothing here is scraped or guessed.

magnet_themes.json lists the magnet programs someone has verified against the district's magnet catalog. Schools not in
the file stay `not_available` for magnet status: we do not infer magnet programs.
"""
from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path

from ..domain import norm_text

log = logging.getLogger("ingest.curated")
MAGNET_FILE = "magnet_themes.json"


def apply(conn: sqlite3.Connection, directory: Path) -> dict:
    path = directory / MAGNET_FILE
    if not path.exists():
        return {"magnet_themes": "file missing"}
    doc = json.loads(path.read_text())
    entries = doc.get("schools", [])
    by_id = {r["source_id"]: r for r in conn.execute("SELECT id, source_id, name, extra, kind FROM places WHERE kind IN ('public','charter')")}
    by_name = {norm_text(r["name"]): r for r in by_id.values()}
    matched, unmatched = 0, []
    for e in entries:
        place = by_id.get(str(e.get("source_id", ""))) or by_name.get(norm_text(e.get("name")))
        if place is None or not e.get("themes"):
            unmatched.append(e.get("name") or e.get("source_id"))
            continue
        extra = json.loads(place["extra"] or "{}")
        extra["magnet"] = {k: e.get(k) for k in ("verified_by", "verified_on", "catalog_url") if e.get(k)}
        conn.execute("UPDATE places SET is_magnet=1, magnet_themes=?, extra=? WHERE id=?",
                     (json.dumps(e["themes"]), json.dumps(extra), place["id"]))
        matched += 1
    src = doc.get("source", {})
    conn.execute("INSERT OR REPLACE INTO datasets (name,title,url,retrieved_at,record_count,as_of,notes) VALUES (?,?,?,?,?,?,?)",
                 ("curated_magnet_themes", src.get("title", "Curated magnet themes"), src.get("url"),
                  doc.get("as_of") or "", matched, doc.get("as_of"), doc.get("_readme", "")[:300]))
    conn.commit()
    return {"magnet_themes": {"entries": len(entries), "matched": matched, "unmatched": unmatched}}
