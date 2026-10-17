"""Florida Department of Education spreadsheets (downloaded manually in a browser: fldoe.org blocks scripted access).

Drop the files into data/raw/fldoe/ (any file name that contains the keywords below; .xlsx, .xls or .csv):

    *grade*            2026 School Grades            -> state_grade, state_grade_year
    *gain*             Learning Gains by School      -> gains_ela, gains_math
    *charter*          Charter school directory      -> helps join charters whose county ID is not the state number
    *private*          Private School Directory      -> scholarship_flags, ese_signal (matched by name + address + ZIP)

The real column headers were not known when this was written, so readers find the header row and the columns by
fuzzy name matching rather than by position. Anything they cannot find is reported (never guessed) and the affected
API fields come back as `not_available`. District 13 is Miami-Dade; a school's state ID is (13, school number).
"""
from __future__ import annotations

import difflib
import json
import logging
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from ..domain import norm_text
from .datasets import FLDOE_PAGES

log = logging.getLogger("ingest.fldoe")
MIAMI_DADE_DISTRICT = 13
NAME_MISMATCH_BELOW = 0.6  # county vs state name similarity under which a number-based join is flagged
LOW_CONFIDENCE = 0.7
TRUTHY = {"y", "yes", "x", "1", "true", "t"}
VALID_GRADES = set("ABCDF")


# ---------- generic spreadsheet reading ----------
def _norm(h) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", str(h).lower())).strip()


def _col_index(ref: str) -> int:
    """'AB12' -> 27 (zero-based column of an Excel cell reference)."""
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _xlsx_raw(path: Path) -> pd.DataFrame:
    """Read the first sheet straight from the workbook XML. FLDOE's web exports sometimes carry a style table that openpyxl rejects
    ('expected Fill'), even though the data is fine. Handles inline strings, shared strings, numbers and booleans."""
    import xml.etree.ElementTree as ET
    import zipfile

    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        shared: list[str] = []
        if "xl/sharedStrings.xml" in names:
            shared = ["".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t")) for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns)]
        sheet = sorted(n for n in names if n.startswith("xl/worksheets/sheet") and n.endswith(".xml"))[0]
        rows: list[dict[int, object]] = []
        for row in ET.fromstring(z.read(sheet)).iter(f"{{{ns['m']}}}row"):
            cells: dict[int, object] = {}
            col = -1
            for c in row.findall("m:c", ns):
                t, ref = c.get("t"), c.get("r")
                # Some exports omit the cell reference and write empty cells as empty elements: position then comes from counting
                # every <c>, empty or not. Skipping empties would shift every later column left.
                col = _col_index(ref) if ref else col + 1
                if t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter(f"{{{ns['m']}}}t"))
                else:
                    v = c.find("m:v", ns)
                    val = None if v is None or v.text is None else (shared[int(v.text)] if t == "s" else v.text)
                if val is not None and val != "":
                    cells[col] = val
            rows.append(cells)
    width = max((max(r) + 1 for r in rows if r), default=0)
    return pd.DataFrame([[r.get(i) for i in range(width)] for r in rows], dtype=object)


def _html_table(path: Path) -> pd.DataFrame:
    """Some FLDOE 'Excel' downloads are really HTML tables saved as .xls. Parse <tr>/<th>/<td> with the standard library."""
    from html.parser import HTMLParser

    class P(HTMLParser):
        def __init__(self):
            super().__init__()
            self.rows, self.row, self.cell = [], None, None

        def handle_starttag(self, tag, attrs):
            if tag == "tr":
                self.row = []
            elif tag in ("td", "th") and self.row is not None:
                self.cell = []

        def handle_endtag(self, tag):
            if tag in ("td", "th") and self.cell is not None and self.row is not None:
                self.row.append(re.sub(r"\s+", " ", "".join(self.cell)).strip() or None)
                self.cell = None
            elif tag == "tr" and self.row is not None:
                self.rows.append(self.row)
                self.row = None

        def handle_data(self, data):
            if self.cell is not None:
                self.cell.append(data)

    p = P()
    p.feed(path.read_bytes().decode("utf-8", errors="replace"))
    width = max((len(r) for r in p.rows), default=0)
    return pd.DataFrame([r + [None] * (width - len(r)) for r in p.rows], dtype=object)


def _looks_like_html(path: Path) -> bool:
    return path.read_bytes()[:400].lstrip().lower().startswith((b"<table", b"<html", b"<!doctype", b"<?xml"))


def _frames(path: Path) -> list[pd.DataFrame]:
    if path.suffix.lower() == ".csv":
        return [pd.read_csv(path, header=None, dtype=object)]
    if _looks_like_html(path):
        return [_html_table(path)]
    try:
        return list(pd.read_excel(path, header=None, dtype=object, sheet_name=None).values())
    except Exception as exc:  # malformed styles etc.: fall back to reading the data directly
        if path.suffix.lower() == ".xlsx":
            log.warning("%s: standard reader failed (%s); reading the sheet XML directly", path.name, exc)
            return [_xlsx_raw(path)]
        raise


def _with_header(raw: pd.DataFrame) -> pd.DataFrame | None:
    """FLDOE sheets often start with title rows: find the first row that looks like a header (mentions school and district)."""
    for i in range(min(30, len(raw))):
        cells = [_norm(c) for c in raw.iloc[i].tolist()]
        if any("school" in c for c in cells) and any("district" in c for c in cells):
            df = raw.iloc[i + 1:].copy()
            names, seen = [], {}
            for c in cells:
                c = c or "unnamed"
                seen[c] = seen.get(c, 0) + 1
                names.append(c if seen[c] == 1 else f"{c} {seen[c]}")
            df.columns = names
            return df.dropna(how="all").reset_index(drop=True)
    return None


def read_table(path: Path) -> pd.DataFrame | None:
    for raw in _frames(path):
        df = _with_header(raw)
        if df is not None and len(df):
            return df
    return None


def pick(df: pd.DataFrame, *patterns: str, exclude: str | None = None) -> str | None:
    """First column whose normalized header matches a pattern (patterns are tried in priority order)."""
    for pat in patterns:
        for col in df.columns:
            if re.search(pat, col) and not (exclude and re.search(exclude, col)):
                return col
    return None


_PLAIN_NUMBER = re.compile(r"^-?\d+(?:\.\d+)?$")


def _num(v) -> float | None:
    """Plain decimal numbers only: float() would also accept 'inf', 'nan' and '1e5', which appear in names and hashed ids."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return None if v != v or v in (float("inf"), float("-inf")) else float(v)
    t = str(v).replace("%", "").replace(",", "").strip()
    return float(t) if _PLAIN_NUMBER.match(t) else None


def _year(text: str) -> int | None:
    m = re.search(r"(20\d\d)", text)
    if m:
        return int(m.group(1))
    m = re.search(r"(?<!\d)(\d{2})(?!\d)", text)
    return 2000 + int(m.group(1)) if m else None


def _district_filter(df: pd.DataFrame) -> pd.DataFrame:
    col = pick(df, r"^district (number|no|id|code)$", r"^district$", r"district (number|no)")
    if not col:
        return df
    nums = df[col].map(_num)
    # keep Miami-Dade; if the column is not numeric at all (e.g. names), keep everything rather than guess
    return df[nums == MIAMI_DADE_DISTRICT] if nums.notna().any() else df


def _school_no(df: pd.DataFrame) -> str | None:
    return pick(df, r"^school (number|no|id|code)$", r"^school (number|no)", r"^school$", r"school number")


def _name_col(df: pd.DataFrame) -> str | None:
    return pick(df, r"^school name$", r"school name", r"^name$")


def _as_int(v) -> int | None:
    n = _num(v)
    return int(n) if n is not None else None


def find_files(directory: Path) -> dict[str, Path]:
    found: dict[str, Path] = {}
    if not directory.exists():
        return found
    for p in sorted(directory.iterdir()):
        if p.suffix.lower() not in {".xlsx", ".xls", ".csv"} or p.name.startswith(("~", ".")):
            continue
        n = p.name.lower()
        if not any(k in n for k in ("private", "charter", "gain", "grade")) and _looks_like_html(p):
            # an unnamed download: a table with a "School Code" and "Principal" column is the charter school contact list
            head = p.read_bytes()[:3000].decode("utf-8", errors="replace").lower()
            if "school code" in head:
                found["fldoe_charter_directory"] = p
            continue
        if "private" in n:
            found["fldoe_private_directory"] = p
        elif "charter" in n:
            found["fldoe_charter_directory"] = p
        elif "gain" in n:
            found["fldoe_learning_gains"] = p
        elif "grade" in n:
            found["fldoe_school_grades"] = p
    return found


# ---------- matching ----------
class PlaceIndex:
    """Places of one kind, searchable by county id and by normalized name."""

    def __init__(self, rows: list[sqlite3.Row]):
        self.rows = rows
        self.by_num: dict[int, sqlite3.Row] = {}
        for r in rows:
            n = _as_int(r["source_id"])
            if n is not None and not r["id"].count("-") > 1:  # skip the suffixed duplicate campuses
                self.by_num.setdefault(n, r)
        self.names = {norm_text(r["name"]): r for r in rows}

    def add_number_aliases(self, name_to_number: dict[str, int]) -> int:
        """Link places to state school numbers via a directory (charters often have a county ID that differs)."""
        added = 0
        for name, num in name_to_number.items():
            place = self.names.get(name)
            if place is not None and num not in self.by_num:
                self.by_num[num] = place
                added += 1
        return added

    def by_name(self, name: str, cutoff: float = 0.9) -> tuple[sqlite3.Row, float] | None:
        key = norm_text(name)
        if key in self.names:
            return self.names[key], 0.97
        close = difflib.get_close_matches(key, list(self.names), n=1, cutoff=cutoff)
        if close:
            ratio = difflib.SequenceMatcher(None, key, close[0]).ratio()
            return self.names[close[0]], round(ratio * 0.9, 2)
        return None


def _dataset_row(conn: sqlite3.Connection, key: str, path: Path, records: int, as_of: str | None, notes: str) -> None:
    title, url = FLDOE_PAGES[key]
    mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).replace(microsecond=0).isoformat()
    conn.execute("INSERT OR REPLACE INTO datasets (name,title,url,retrieved_at,record_count,as_of,notes) VALUES (?,?,?,?,?,?,?)",
                 (key, title, url, mtime, records, as_of, f"{path.name}. {notes}"))


# ---------- appliers ----------
def _resolve(idx: PlaceIndex, row, num_c: str | None, name_c: str | None):
    """Find the county place for one state-file row. Returns (place, confidence, state_name, how, review).

    * A school-number match is authoritative for M-DCPS schools (county ID = state school number); if the two official names barely
      resemble each other (a virtual school under its provider, "MAST" for a long name) the grade is kept with lower confidence.
    * Charters are different: the county's charter ID is not guaranteed to be the state number, so a number match whose names do
      not resemble each other is NOT used (it could be a different school). It goes to `review`, and only an exact or very close
      name match can link the row instead. A missing grade is better than another school's grade.
    """
    n = _as_int(row[num_c]) if num_c else None
    state_name = str(row[name_c]).strip() if name_c else ""
    place = idx.by_num.get(n) if n is not None else None
    if place is not None:
        low = bool(state_name) and difflib.SequenceMatcher(None, norm_text(place["name"]), norm_text(state_name)).ratio() < NAME_MISMATCH_BELOW
        if not low:
            return place, 1.0, None, "number", None
        if not str(place["id"]).startswith("chr-"):
            return place, LOW_CONFIDENCE, state_name, "number", None
        review = {"county_id": place["source_id"], "county_name": place["name"], "state_number": n, "state_name": state_name}
        place = None
    else:
        review = None
    if state_name and norm_text(state_name):
        hit = idx.by_name(state_name)
        if hit:
            return hit[0], hit[1], None, "name", review
    return None, 0.0, None, "none", review


def _apply_grades(conn, path: Path, idx: PlaceIndex) -> dict:
    df = read_table(path)
    if df is None:
        return {"error": "could not find a header row mentioning school and district"}
    df = _district_filter(df)
    num_c, name_c = _school_no(df), _name_col(df)
    grade_cols = [(c, _year(c)) for c in df.columns if re.search(r"^(20\d\d )?(overall |final )?(school )?grades?( 20\d\d)?$", c)]
    if not (num_c and grade_cols):
        return {"error": f"missing columns (school number: {num_c}, grade: {[c for c, _ in grade_cols]})"}
    grade_col, gyear = max(grade_cols, key=lambda cy: cy[1] or 0)
    gyear = gyear or _year(path.name)
    pts_c = pick(df, r"total points", r"percent of total possible points", r"^points")
    tested_c = pick(df, r"percent tested")

    matched = by_name = 0
    needs_review: list[dict] = []
    seen_nums: set[int] = set()
    for _, row in df.iterrows():
        n = _as_int(row[num_c])
        if n is None:
            continue
        seen_nums.add(n)
        place, conf, state_name, how, review = _resolve(idx, row, num_c, name_c)
        if review:
            needs_review.append(review)
        if place is None:
            continue
        by_name += how == "name"
        letter = str(row[grade_col]).strip().upper().rstrip("*")
        letter = letter if letter in VALID_GRADES else None
        extra = json.loads(place["extra"] or "{}")
        state = {k: v for k, v in {"total_points": _num(row[pts_c]) if pts_c else None,
                                   "percent_tested": _num(row[tested_c]) if tested_c else None,
                                   "state_school_number": n}.items() if v is not None}
        if letter is None:
            state["grade_note"] = f"state grade value '{row[grade_col]}' is not A-F"
        if state_name:
            state["state_school_name"] = state_name
        extra["state"] = {**extra.get("state", {}), **state}
        conn.execute("UPDATE places SET state_grade=?, state_grade_year=?, state_key=?, join_confidence=?, extra=? WHERE id=?",
                     (letter, gyear if letter else None, f"{MIAMI_DADE_DISTRICT}-{n:04d}", conf, json.dumps(extra), place["id"]))
        matched += 1
    _dataset_row(conn, "fldoe_school_grades", path, len(df), str(gyear) if gyear else None,
                 f"grade column '{grade_col}'; joined on district 13 + school number ({by_name} by name fallback)")
    return {"rows": len(df), "matched": matched, "matched_by_name_fallback": by_name, "grade_column": grade_col, "year": gyear,
            "charter_number_matches_rejected_for_name_mismatch": needs_review}


def _apply_gains(conn, path: Path, idx: PlaceIndex) -> dict:
    df = read_table(path)
    if df is None:
        return {"error": "could not find a header row mentioning school and district"}
    df = _district_filter(df)
    num_c, name_c = _school_no(df), _name_col(df)
    excl = r"25|lowest|l25|achiev"
    ela = pick(df, r"^ela (learning )?gains?$", r"^english language arts learning gains$", r"ela.*learning gains",
               r"english language arts.*learning gains", r"^ela.*\bgains?\b", exclude=excl)
    math = pick(df, r"^math(ematics)? (learning )?gains?$", r"math.*learning gains", r"^math.*\bgains?\b", exclude=excl)
    if not num_c or not (ela or math):
        return {"error": f"missing columns (school number: {num_c}, ela: {ela}, math: {math})"}
    series = {c: df[c].map(_num) for c in (ela, math) if c}
    # values published as fractions (0-1) are converted to percent so the API always reports percent
    scale = {c: (100.0 if v.dropna().max() <= 1.0 else 1.0) for c, v in series.items() if v.notna().any()}

    def value(col: str | None, i) -> float | None:
        if not col:
            return None
        v = series[col].get(i)
        return None if v is None or v != v else round(v * scale.get(col, 1.0), 1)

    updated = 0
    for i, row in df.iterrows():
        place = _resolve(idx, row, num_c, name_c)[0]
        if place is None:
            continue
        conn.execute("UPDATE places SET gains_ela=?, gains_math=? WHERE id=?", (value(ela, i), value(math, i), place["id"]))
        updated += 1
    _dataset_row(conn, "fldoe_learning_gains", path, len(df), _year(path.name) and str(_year(path.name)),
                 f"ELA column '{ela}', math column '{math}' (percent of students making learning gains)")
    return {"rows": len(df), "updated": updated, "ela_column": ela, "math_column": math}


def _charter_numbers(path: Path) -> tuple[dict[str, int], dict]:
    df = read_table(path)
    if df is None:
        return {}, {"error": "could not find a header row"}
    df = _district_filter(df)
    num_c, name_c = _school_no(df), _name_col(df)
    if not (num_c and name_c):
        return {}, {"error": f"missing columns (school number: {num_c}, name: {name_c})"}
    out = {norm_text(str(r[name_c])): _as_int(r[num_c]) for _, r in df.iterrows() if _as_int(r[num_c]) is not None}
    return out, {"rows": len(df)}


SCHOLARSHIP_LABELS = [
    (r"fes[ -]*(educational|eo)|family empowerment.*educational", "FES Educational Options"),
    (r"unique abilities|\bfes[ -]*ua\b", "FES Unique Abilities"),
    (r"\bftc\b|tax credit", "Florida Tax Credit (FTC)"),
    (r"\bpep\b|personalized education", "PEP Hybrid"),
    (r"mckay", "McKay"),
    (r"gardiner", "Gardiner"),
]


def scholarship_label(column: str) -> str:
    """Readable name for a directory column such as 'fes educational options participant'."""
    for pat, label in SCHOLARSHIP_LABELS:
        if re.search(pat, column):
            return label
    return re.sub(r"\s*(participant|program)\b", "", column).strip().title()


def _apply_private(conn, path: Path, idx: PlaceIndex) -> dict:
    df = read_table(path)
    if df is None:
        return {"error": "could not find a header row"}
    df = _district_filter(df)
    name_c = _name_col(df) or pick(df, r"school name|^name$")
    zip_c = pick(df, r"^zip", r"zip code", r"postal")
    addr_c = pick(df, r"^(physical |street |mailing )?address( 1| line 1)?$", r"address")
    if not name_c:
        return {"error": "no school-name column"}
    sch_cols = [c for c in df.columns if re.search(r"scholarship|\bfes\b|\bftc\b|mckay|gardiner|\bpep\b|step up", c)]
    ese_cols = [c for c in df.columns if re.search(r"\bese\b|special (ed|needs)|exceptional|disabilit", c)]
    by_zip: dict[str, list[sqlite3.Row]] = {}
    for r in idx.rows:
        by_zip.setdefault(r["zip"] or "", []).append(r)

    def streetnum(a) -> str:
        m = re.match(r"\s*(\d+)", str(a or ""))
        return m.group(1) if m else ""

    matched, low, unmatched = 0, [], []
    for _, row in df.iterrows():
        name = str(row[name_c])
        z = re.sub(r"\D", "", str(row[zip_c]))[:5] if zip_c else ""
        pool = by_zip.get(z) or idx.rows
        best, score = None, 0.0
        for cand in pool:
            nm = difflib.SequenceMatcher(None, norm_text(name), norm_text(cand["name"])).ratio()
            s = 0.6 * nm + (0.2 if z and cand["zip"] == z else 0) + (0.2 if addr_c and streetnum(row[addr_c]) and streetnum(row[addr_c]) == streetnum(cand["address"]) else 0)
            if s > score:
                best, score = cand, s
        if best is None or score < 0.75:  # confidence threshold; below it we leave the school unmatched
            unmatched.append(name)
            continue
        flags = [scholarship_label(str(c)) for c in sch_cols if str(row[c]).strip().lower() in TRUTHY]
        ese = any(str(row[c]).strip().lower() in TRUTHY for c in ese_cols)
        extra = json.loads(best["extra"] or "{}")
        extra["private_directory_match"] = {"name": name, "confidence": round(score, 2)}
        conn.execute("UPDATE places SET scholarship_flags=?, ese_signal=COALESCE(?, ese_signal), join_confidence=?, extra=? WHERE id=?",
                     (json.dumps(flags) if sch_cols else None, "directory_flag" if ese else None, round(score, 2), json.dumps(extra), best["id"]))
        matched += 1
        if score < 0.9:
            low.append({"directory_name": name, "matched_to": best["name"], "confidence": round(score, 2)})
    _dataset_row(conn, "fldoe_private_directory", path, len(df), None,
                 f"matched by name + address + ZIP with a confidence score (threshold 0.75); scholarship columns: {sch_cols}")
    return {"rows": len(df), "matched": matched, "unmatched": unmatched[:50], "unmatched_count": len(unmatched),
            "low_confidence_matches": low[:50], "scholarship_columns": sch_cols, "ese_columns": ese_cols}


def apply(conn: sqlite3.Connection, directory: Path) -> dict:
    files = find_files(directory)
    report: dict = {"directory": str(directory), "files": {k: v.name for k, v in files.items()},
                    "missing": sorted(set(FLDOE_PAGES) - set(files) - ({"fldoe_learning_gains"} if "fldoe_school_grades" in files else set()))}
    if not files:
        report["note"] = f"No FLDOE files found in {directory}. State grades and learning gains will be 'not_available'."
        return report
    rows_by_kind = {k: conn.execute("SELECT id, source_id, name, address, zip, extra FROM places WHERE kind=?", (k,)).fetchall()
                    for k in ("public", "charter", "private")}
    state_idx = PlaceIndex(rows_by_kind["public"] + rows_by_kind["charter"])
    steps = [
        ("fldoe_school_grades", lambda p: _apply_grades(conn, p, state_idx)),
        ("fldoe_learning_gains", lambda p: _apply_gains(conn, p, state_idx)),
        ("fldoe_private_directory", lambda p: _apply_private(conn, p, PlaceIndex(rows_by_kind["private"]))),
    ]
    if "fldoe_charter_directory" in files:
        try:
            numbers, info = _charter_numbers(files["fldoe_charter_directory"])
            info["aliases_added"] = state_idx.add_number_aliases(numbers)
            report["fldoe_charter_directory"] = info
        except Exception as exc:
            log.exception("charter directory failed")
            report["fldoe_charter_directory"] = {"error": f"{type(exc).__name__}: {exc}"}
    # The School Grades workbook itself carries the ELA/math learning-gains columns, so it also feeds the gains step
    # unless a separate learning-gains file was supplied.
    source_for = dict(files)
    if "fldoe_learning_gains" not in source_for and "fldoe_school_grades" in source_for:
        source_for["fldoe_learning_gains"] = source_for["fldoe_school_grades"]
    for key, fn in steps:
        if key in source_for:
            try:
                report[key] = fn(source_for[key])
            except Exception as exc:  # a malformed spreadsheet must not take the whole build down
                log.exception("%s failed", key)
                report[key] = {"error": f"{type(exc).__name__}: {exc}"}
    conn.commit()
    return report
