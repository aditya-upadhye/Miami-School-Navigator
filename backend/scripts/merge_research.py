"""Merge Grok research output into data/curated/school_research.json, then rebuild the database.

    python scripts/merge_research.py batch_01.md batch_02.md      # accepts the raw answer: it finds the JSON array in it
    python scripts/merge_research.py out.json --prefer-new        # new non-null values replace existing ones
    python -m app.ingest.build                                    # load the merged file

A value that is already filled is kept (conflicts are counted and listed) unless --prefer-new is given; a null never replaces a value.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "data" / "curated" / "school_research.json"
EMPTY_MEANS_NOTHING = {"specialties", "magnet_themes"}  # [] there means "nothing documented", not a verified "none"
SKIP = {"id", "researched_on"}


def extract_array(text: str) -> list[dict]:
    fenced = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, re.S)
    candidates = [fenced.group(1)] if fenced else []
    if "[" in text and "]" in text:
        candidates.append(text[text.index("["):text.rindex("]") + 1])
    for c in candidates:
        try:
            data = json.loads(c)
            if isinstance(data, list) and all(isinstance(x, dict) and "id" in x for x in data):
                return data
        except json.JSONDecodeError:
            continue
    raise ValueError("no JSON array of school objects found")


def filled(key: str, v) -> bool:
    if not isinstance(v, dict) or "value" not in v:
        return v not in (None, "", [], {})
    val = v["value"]
    if val is None or val == "":
        return False
    return not (val == [] and key in EMPTY_MEANS_NOTHING)


def merge_school(old: dict, new: dict, prefer_new: bool, conflicts: list, school_id: str) -> int:
    changed = 0
    for key, nv in new.items():
        if key in SKIP:
            continue
        if key == "optional" and isinstance(nv, dict):
            opt = old.setdefault("optional", {})
            for k2, v2 in nv.items():
                if filled(k2, v2) and (not filled(k2, opt.get(k2)) or prefer_new):
                    changed += not filled(k2, opt.get(k2))
                    opt[k2] = v2
            continue
        if key in ("identity_note", "name_verified"):
            if nv and not old.get(key):
                old[key] = nv
            continue
        if not filled(key, nv):
            old.setdefault(key, nv)
            continue
        if not filled(key, old.get(key)):
            old[key], changed = nv, changed + 1
        elif old[key] != nv:
            conflicts.append((school_id, key))
            if prefer_new:
                old[key] = nv
    return changed


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--prefer-new", action="store_true")
    args = ap.parse_args()

    doc = json.loads(TARGET.read_text())
    schools = {s["id"]: s for s in doc["schools"]}
    db = ROOT / "data" / "navigator.db"
    known = {r[0] for r in sqlite3.connect(db).execute("SELECT id FROM places")} if db.exists() else set()
    shutil.copy(TARGET, TARGET.with_suffix(".json.bak"))

    added = filled_fields = 0
    conflicts: list[tuple[str, str]] = []
    unknown: list[str] = []
    for f in args.files:
        try:
            rows = extract_array(f.read_text())
        except ValueError as exc:
            print(f"{f}: {exc}", file=sys.stderr)
            return 1
        for row in rows:
            sid = row["id"]
            if known and sid not in known:
                unknown.append(sid)
                continue
            if sid not in schools:
                schools[sid] = {"id": sid, "researched_on": row.get("researched_on")}
                added += 1
            filled_fields += merge_school(schools[sid], row, args.prefer_new, conflicts, sid)
    doc["schools"] = list(schools.values())
    TARGET.write_text(json.dumps(doc, indent=1, ensure_ascii=False))
    print(f"schools in file: {len(schools)} (+{added} new) | newly filled fields: {filled_fields} | conflicts: {len(conflicts)} | unknown ids skipped: {len(unknown)}")
    for sid, key in conflicts[:30]:
        print(f"  conflict kept existing: {sid} {key}")
    if unknown:
        print("  unknown ids:", ", ".join(unknown[:20]))
    print("next: python -m app.ingest.build")
    return 0


if __name__ == "__main__":
    sys.exit(main())
