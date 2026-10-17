#!/usr/bin/env python3
"""Turn the alumni research spreadsheet (miami_schools_alumni_enriched.csv) into data/outcomes/alumni_enriched.json, keyed by school id.

Each spreadsheet row has two kinds of information, kept apart because they are not equally reliable:
* `official`: numbers from FLDOE / NCES files (graduation rate, school grade, what graduates did next, program focus), with their source links.
* `linkedin`: how many people list the school on LinkedIn and what they studied and do now. Self-reported, only people who joined LinkedIn
  and named the school, so it is shown as a sample, never as a statistic. Rows whose school match is "uncertain" are kept in the file but
  never shown. (The spreadsheet's small people-search samples are mostly staff, not alumni, so they are not used at all.)

A row is joined to our schools by the FLDOE school number in its notes (state_key "13-<number>"; campuses of the same school share it), and
for private schools by an exact normalised name. Rows that match nothing are listed at the end and left out.

Usage: python backend/scripts/merge_alumni_enriched.py [path/to/miami_schools_alumni_enriched.csv]
"""
from __future__ import annotations

import csv
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "navigator.db"
OUT = ROOT / "data" / "outcomes" / "alumni_enriched.json"
DEFAULT_CSV = Path.home() / "Downloads" / "miami_schools_alumni_enriched.csv"


def num(v: str):
    v = (v or "").strip().replace(",", "")
    try:
        return int(v) if re.fullmatch(r"-?\d+", v) else float(v)
    except ValueError:
        return None


def norm(s: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", (s or "").lower().replace("&", " and ")).split())


def confidence(note: str) -> str:
    n = (note or "").lower()
    for key in ("not found", "uncertain", "likely", "match"):
        if n.startswith(key):
            return key
    return "uncertain"


def ranked(row: dict, prefix: str) -> list[dict]:
    out = []
    for i in range(1, 6):
        name, count = (row.get(f"{prefix}_{i}") or "").strip(), num(row.get(f"{prefix}_{i}_count"))
        if name and count:
            out.append({"name": name, "count": count})
    return out


def build(row: dict) -> dict:
    sources = [s.strip().split(" (")[0] for s in re.split(r"\s\|\s", row.get("official_sources") or "") if s.strip().startswith("http")]
    official = {
        "school_type": row["official_school_type"] or None, "grades": row["official_grades"] or None,
        "enrollment": num(row["official_enrollment"]), "enrollment_year": row["official_enrollment_year"] or None,
        "grad_rate": num(row["official_grad_rate"]), "grad_rate_year": row["official_grad_rate_year"] or None,
        "school_grade": row["official_school_grade"] or None, "school_grade_year": row["official_school_grade_year"] or None,
        "fetpip_year": row["official_fetpip_year"] or None, "pct_continuing_ed": num(row["official_pct_continuing_ed"]),
        "pct_employed": num(row["official_pct_employed"]), "pct_military": num(row["official_pct_military"]),
        "earnings": row["official_earnings"] or None, "program_focus": row["official_program_focus"] or None,
        "sources": sources, "notes": row["official_notes"] or None,
    }
    official = {k: v for k, v in official.items() if v not in (None, "", [])}
    li = {"page": row["linkedin_page"], "url": row["linkedin_url"], "page_type": row["page_type"], "alumni_count": num(row["alumni_count"]),
          "studied": ranked(row, "studied"), "does": ranked(row, "does")}
    li = li if li["alumni_count"] or li["studied"] or li["does"] else None
    return {"confidence": confidence(row["match_note"]), "official": official or None, "linkedin": li}


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    rows = list(csv.DictReader(open(path, newline="", encoding="utf-8")))
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    by_num: dict[str, list[str]] = {}
    for r in db.execute("select p.id, p.kind, p.source_id from places p where p.kind in ('public','charter') and p.source_id is not null"):
        by_num.setdefault(r["source_id"], []).append((r["id"], r["kind"]))
    private = {}
    for r in db.execute("select id, name from places where kind='private'"):
        private.setdefault(norm(r["name"]), []).append(r["id"])
    out, unmatched = {}, []
    for row in rows:
        m = re.search(r"FLDOE school #(\d{4})", row.get("official_notes") or "")
        ids = [i for i, _ in by_num.get(m.group(1), [])] if m else []
        if not ids:
            ids = private.get(norm(row["school"]), []) if (row.get("official_school_type") or "").lower().startswith("private") else []
        if not ids:
            unmatched.append(row["school"])
            continue
        rec = build(row)
        rec["school"] = row["school"]
        for i in ids:
            out[i] = rec
    OUT.write_text(json.dumps({"note": "Alumni research (LinkedIn page counts and official FLDOE/NCES figures) joined to schools by FLDOE number or exact name; see scripts/merge_alumni_enriched.py.",
                               "schools": out}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(rows)} rows -> {len(set(r['school'] for r in out.values()))} schools ({len(out)} school records) in {OUT}")
    print("not matched to a school (left out):", "; ".join(unmatched) or "none")


if __name__ == "__main__":
    main()
