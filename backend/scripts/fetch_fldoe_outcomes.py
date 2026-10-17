"""Download FLDOE/FETPIP "Public High School Graduates - Standard Diploma, Annual Report by District and School" PDFs
and normalise the Miami-Dade (district 13) schools to data/outcomes/fldoe_outcomes.json.gz.

Usage (from backend/):  python scripts/fetch_fldoe_outcomes.py [--no-download]

Source index page: https://www.fldoe.org/accountability/fl-edu-training-placement-info-program/high-school-reports.stml
Note: www.fldoe.org answers 403 to scripted clients, but the same paths on https://origin.fldoe.org work with a browser User-Agent.

Each PDF has one page per school (a district page order, alphabetical by district). A page holds the FETPIP findings for that
school's standard-diploma graduates: total individuals, total with outcome data, continuing education (unduplicated and by sector),
employment, and (older years only) military. Suppressed cells (small n, shown as ****) are NOT emitted: nothing is guessed.
Requires PyMuPDF (pip install pymupdf).

Record: school_name, fldoe_school_number (6 digits: 2-digit district + 4-digit school), district_school_id (our places.id or null),
year (graduating class, ending year of the school year, e.g. 2024 = 2023-24), metric, value (a count), denominator, source_url.
denominator = students with outcome data (for the two total_* metrics: total individuals for outcome data, none for individuals).
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
import sqlite3
import sys
import urllib.request
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
OUT_DIR = BACKEND / "data" / "outcomes"
RAW_DIR = OUT_DIR / "fldoe"
OUT_FILE = OUT_DIR / "fldoe_outcomes.json.gz"
DB = BACKEND / "data" / "navigator.db"
BASE = "https://origin.fldoe.org/file/7592/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

# graduating-class year (end of school year) -> file name on the FLDOE site
FILES = {
    2024: "2324HS-SDGrad656ByDistBySchl.pdf",
    2023: "2223HS-SDGrad656ByDistBySchl.pdf",
    2022: "2122HS-SDGrad656ByDistBySchl.pdf",
    2021: "2021HSAORDistrictSCHL.pdf",
    2020: "1920AR-DistSch.pdf",
    2019: "1819HSAORTEXTDistrictSCHL.pdf",
    2018: "1718HSAORDistrictSchl.pdf",
    2017: "1617HSR-AORByDistrictSchool.pdf",
    2016: "1516HSR-AORByDistrictSchool.pdf",
    2015: "141ARDistSchool.pdf",  # file name as published; its pages are checked for the year below
    2014: "2013-14HSR_AORByDistrictSchool.pdf",
    2013: "12-13-Annual-Report-by-District-and-School.pdf",
}

V = r"(-|\*{4}|\d[\d,]*)"
METRICS = [  # (metric, regex of label; value token follows)
    ("graduates_total", r"TOTAL INDIVIDUALS"),
    ("graduates_with_outcome_data", r"TOTAL WITH OUTCOME DATA"),
    ("enrolled_any_postsecondary", r"TOTAL CONT(?:INUING|\.) THEIR EDUCATION \(Unduplicated\)"),
    ("enrolled_district_postsecondary", r"IN DISTRICT POSTSECONDARY"),
    ("enrolled_florida_college_system", r"IN FLORIDA COLLEGE SYSTEM"),
    ("enrolled_state_university", r"IN STATE UNIVERSITY SYSTEM"),
    ("enrolled_private_college_or_university", r"IN PRIVATE COLLEGE OR UNIVERSITY"),
    ("employed_florida", r"(?:(?<!QTR )EMPLOYED/ALL|(?<!/)FOUND EMPLOYED(?:/ALL)?)"),
    ("employed_not_continuing_education", r"(?:FOUND )?EMPLOYED/NOT CONTINUING EDUCATION"),
    ("enrolled_and_employed", r"(?:TOTAL CONTINUING EDUCATION/FOUND EMPLOYED|OF TOTAL CONT\. ED\. THOSE FOUND EMPLOYED)"),
    ("military", r"FOUND IN THE MILITARY"),
]


def download() -> None:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for name in FILES.values():
        dest = RAW_DIR / name
        if dest.exists() and dest.stat().st_size > 0:
            continue
        req = urllib.request.Request(BASE + name, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
            f.write(r.read())
        print("downloaded", name, dest.stat().st_size)


def page_rows(page) -> list[str]:
    """Text rows of a page. Landscape pages (rotation 90) store the layout as vertical columns, read bottom to top."""
    words = [(*w[:4], w[4].replace("\xa0", " ")) + tuple(w[5:]) for w in page.get_text("words")]
    rows: list[str] = []
    if page.rotation == 90:
        words.sort(key=lambda w: w[0])
        groups: list[list] = []
        for w in words:
            if groups and w[0] - groups[-1][-1][0] <= 4:
                groups[-1].append(w)
            else:
                groups.append([w])
        for g in groups:
            rows.append(" ".join(w[4] for w in sorted(g, key=lambda w: -w[1])))
    else:
        words.sort(key=lambda w: (w[1] + w[3]) / 2)
        groups = []
        for w in words:
            if groups and (w[1] + w[3]) / 2 - (groups[-1][-1][1] + groups[-1][-1][3]) / 2 <= 3:
                groups[-1].append(w)
            else:
                groups.append([w])
        for g in groups:
            rows.append(" ".join(w[4] for w in sorted(g, key=lambda w: w[0])))
    return rows


def parse_page(page) -> dict | None:
    text = page.get_text().replace("\xa0", " ")
    m = re.search(r"^\s*(\d{6})[ \t]+(.+?)\s*$", text, re.M)
    if not m or "TOTAL INDIVIDUALS" not in text:
        return None
    number, name = m.group(1), re.sub(r"\s+", " ", m.group(2))
    if not number.startswith("13"):
        return {"number": number, "name": name, "metrics": {}, "skip": True}
    found: dict[str, int] = {}
    suppressed: set[str] = set()
    for row in page_rows(page):
        for metric, label in METRICS:
            if metric in found or metric in suppressed:
                continue
            mm = re.search(label + r"\s+" + V, row)
            if not mm:
                continue
            tok = mm.group(1)
            if tok[0].isdigit():
                found[metric] = int(tok.replace(",", ""))
            else:
                suppressed.add(metric)
    return {"number": number, "name": name, "metrics": found, "suppressed": sorted(suppressed)}


def parse_year(year: int) -> list[dict]:
    import fitz  # PyMuPDF

    doc = fitz.open(RAW_DIR / FILES[year])
    out = []
    for page in doc:
        # cheap pre-filter before the word-level work
        head = page.get_text()[:400].replace("\xa0", " ")
        if not re.search(r"\n\s*13\d{4}\s", "\n" + head):
            continue
        rec = parse_page(page)
        if rec and not rec.get("skip"):
            hy = re.search(r"(20\d\d)-(\d\d)", page.get_text()[:600])
            rec["year_in_header"] = (int(hy.group(1)) + 1) if hy else None
            out.append(rec)
    return out


# ---------- matching to places (same approach as app/ingest/fldoe.py: school number == county source_id for M-DCPS schools;
# charters only by close name because the county charter id is not the state number; mismatched names are not joined) ----------
def build_index():
    from app.domain import norm_text

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT id, source_id, name, kind FROM places WHERE kind IN ('public','charter')").fetchall()
    by_num = {}
    for r in rows:
        try:
            n = int(r["source_id"])
        except (TypeError, ValueError):
            continue
        if r["id"].count("-") <= 1:  # skip suffixed duplicate campuses
            by_num.setdefault((r["kind"], n), r)
    names = {norm_text(r["name"]): r for r in rows}
    return by_num, names, norm_text


def match(rec, by_num, names, norm_text):
    import difflib

    num = int(rec["number"][2:])
    name = rec["name"]
    key = norm_text(name)
    # number match, accepted only when the two official names resemble each other (a charter's county id is not guaranteed
    # to be the state number, so a bare number match could be a different school)
    for kind in ("public", "charter"):
        p = by_num.get((kind, num))
        if p is not None and difflib.SequenceMatcher(None, norm_text(p["name"]), key).ratio() >= 0.6:
            return p["id"], "number"
    if key in names:
        return names[key]["id"], "name"
    close = difflib.get_close_matches(key, list(names), n=1, cutoff=0.9)
    if close:
        return names[close[0]]["id"], "name~"
    return None, "none"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-download", action="store_true")
    args = ap.parse_args()
    if not args.no_download:
        download()
    by_num, names, norm_text = build_index()
    records, stats = [], {}
    for year in sorted(FILES):
        if not (RAW_DIR / FILES[year]).exists():
            continue
        url = BASE + FILES[year]
        schools = parse_year(year)
        matched = 0
        for s in schools:
            if s["year_in_header"] and s["year_in_header"] != year:
                print(f"WARNING year mismatch {FILES[year]}: header {s['year_in_header']} vs {year}")
            pid, how = match(s, by_num, names, norm_text)
            s["pid"] = pid
            matched += pid is not None
            outcome = s["metrics"].get("graduates_with_outcome_data")
            total = s["metrics"].get("graduates_total")
            for metric, value in s["metrics"].items():
                den = None if metric == "graduates_total" else (total if metric == "graduates_with_outcome_data" else outcome)
                records.append({"school_name": s["name"], "fldoe_school_number": s["number"], "district_school_id": pid,
                                "year": year, "metric": metric, "value": value, "denominator": den, "source_url": url})
        stats[year] = (len(schools), matched)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with gzip.open(OUT_FILE, "wt", encoding="utf-8") as f:
        json.dump(records, f, separators=(",", ":"))
    print("records", len(records))
    for y, (n, m) in stats.items():
        print(y, "schools", n, "matched", m)


if __name__ == "__main__":
    main()
