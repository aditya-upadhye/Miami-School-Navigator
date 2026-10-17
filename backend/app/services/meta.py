from __future__ import annotations

from datetime import datetime, timezone

from ..chat.llm import LlmConfig
from .context import Navigator


def _age_days(iso: str | None) -> int | None:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso if "T" in iso else iso + "T00:00:00+00:00")
    except ValueError:
        return None
    return (datetime.now(timezone.utc) - dt).days


def quality_report(nav: Navigator) -> dict:
    ingest = nav.quality.get("ingest_report", {})
    datasets = [{"name": d["name"], "title": d["title"], "url": d["url"], "retrieved_at": d["retrieved_at"], "as_of": d["as_of"],
                 "record_count": d["record_count"], "age_days": _age_days(d["retrieved_at"]), "notes": d["notes"]}
                for d in sorted(nav.datasets.values(), key=lambda d: d["name"])]
    per_kind = {r["kind"]: r["n"] for r in nav.conn.execute("SELECT kind, COUNT(*) n FROM places GROUP BY kind")}
    fldoe = ingest.get("fldoe", {})
    notes = []
    missing = fldoe.get("missing", [])
    if "fldoe_school_grades" in missing:
        notes.append("FLDOE School Grades file is missing, so state grades and learning gains are not_available. Place it in backend/data/raw/fldoe/ and rebuild (python -m app.ingest.build).")
    optional = [m for m in missing if m != "fldoe_school_grades"]
    if optional:
        notes.append("Optional FLDOE files not loaded: " + ", ".join(optional) + " (private-school scholarship flags and charter number matching are weaker without them).")
    if not nav.datasets.get("curated_magnet_themes", {}).get("record_count"):
        notes.append("No magnet themes have been curated yet (data/curated/magnet_themes.json is empty), so magnet status is not_available.")
    unconfirmed = [r["id"] for r in nav.rules.get("rules", []) if r["verification"] != "confirmed_district_source"]
    if unconfirmed:
        notes.append("Curated rules not yet confirmed against a district source: " + ", ".join(unconfirmed))
    return {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "places_by_kind": per_kind,
        "datasets": datasets,
        "zone_self_check": nav.quality.get("zone_self_check"),
        "join_coverage": nav.quality.get("join_coverage"),
        "fldoe": {"files": fldoe.get("files", {}), "missing": fldoe.get("missing", []),
                  "details": {k: v for k, v in fldoe.items() if k.startswith("fldoe_")}},
        "curated": ingest.get("curated"),
        "rules": [{"id": r["id"], "verification": r["verification"], "verified_on": r["verified_on"], "url": r["url"]} for r in nav.rules.get("rules", [])],
        "provenance_rule": "Every returned metric is a Field with status, source, url, as_of and method; missing data is status not_available with why and suggested_action.",
        "llm": LlmConfig.from_env().describe(),
        "notes": notes,
    }
