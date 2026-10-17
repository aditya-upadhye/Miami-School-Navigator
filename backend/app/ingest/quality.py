"""Data-quality checks computed at build time and shown by /api/meta/quality (and in the demo)."""
from __future__ import annotations

import json
import sqlite3

from shapely import wkb
from shapely.geometry import Point
from shapely.strtree import STRtree

# county SchoolSite TYPE code -> attendance-zone level that school should be zoned for
LEVEL_FOR_SITE_TYPE = {"E": "elementary", "M": "middle", "S": "high"}


def zone_self_check(conn: sqlite3.Connection) -> dict:
    """Each public school's own point should fall inside its own attendance zone (target >= 95%)."""
    out: dict = {"target_pct": 95.0, "levels": {}}
    total_ok = total = 0
    for site_type, level in LEVEL_FOR_SITE_TYPE.items():
        zones: dict[str, list] = {}
        for r in conn.execute("SELECT school_source_id, geometry FROM zones WHERE level=?", (level,)):
            zones.setdefault(r["school_source_id"], []).append(wkb.loads(r["geometry"]))
        schools = conn.execute("SELECT source_id, name, lat, lon FROM places WHERE kind='public' AND site_type=? "
                               "AND id NOT LIKE 'pub-%-%'", (site_type,)).fetchall()
        checked = ok = 0
        failures = []
        for sc in schools:
            polys = zones.get(sc["source_id"])
            if not polys:
                continue  # schools without a zone of their own (e.g. magnet-only sites) are not part of this check
            checked += 1
            pt = Point(sc["lon"], sc["lat"])
            if any(p.contains(pt) for p in polys):
                ok += 1
            else:
                failures.append({"source_id": sc["source_id"], "name": sc["name"]})
        total, total_ok = total + checked, total_ok + ok
        out["levels"][level] = {"checked": checked, "inside_own_zone": ok,
                                "pct": round(100 * ok / checked, 1) if checked else None, "failures": failures[:40],
                                "schools_without_zone": len(schools) - checked}
    out["pct"] = round(100 * total_ok / total, 1) if total else None
    out["meets_target"] = bool(total) and 100 * total_ok / total >= out["target_pct"]
    return out


def join_coverage(conn: sqlite3.Connection) -> dict:
    """Share of public and charter schools matched to FLDOE records, and with an A-F grade."""
    out: dict = {}
    for kind in ("public", "charter"):
        rows = conn.execute("SELECT name, source_id, state_key, state_grade, join_confidence, extra FROM places WHERE kind=? AND id NOT LIKE '%-%-%'", (kind,)).fetchall()
        matched = [r for r in rows if r["state_key"]]
        graded = [r for r in rows if r["state_grade"]]
        out[kind] = {
            "schools": len(rows), "matched_to_state_record": len(matched), "with_state_grade": len(graded),
            "matched_pct": round(100 * len(matched) / len(rows), 1) if rows else None,
            "graded_pct": round(100 * len(graded) / len(rows), 1) if rows else None,
            "unmatched": [{"source_id": r["source_id"], "name": r["name"]} for r in rows if not r["state_key"]][:200],
            # joined on school number, but the official names differ a lot: worth a human look
            "low_confidence": [{"source_id": r["source_id"], "county_name": r["name"], "state_name": json.loads(r["extra"] or "{}").get("state", {}).get("state_school_name") or "(matched by name similarity)",
                                "confidence": r["join_confidence"]} for r in rows if r["state_key"] and (r["join_confidence"] or 1) < 1][:200],
        }
    return out


def compute(conn: sqlite3.Connection, report: dict) -> None:
    checks = {"zone_self_check": zone_self_check(conn), "join_coverage": join_coverage(conn)}
    for k, v in checks.items():
        conn.execute("INSERT OR REPLACE INTO quality (key, value) VALUES (?, ?)", (k, json.dumps(v)))
    conn.execute("INSERT OR REPLACE INTO quality (key, value) VALUES (?, ?)", ("ingest_report", json.dumps(report, default=str)))
    report["quality"] = {"zone_self_check_pct": checks["zone_self_check"]["pct"]}
