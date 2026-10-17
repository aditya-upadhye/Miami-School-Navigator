#!/usr/bin/env python3
"""Download public federal per-school data and normalise college/career-readiness indicators.

Sources (aggregated, school-level, public; no individual data):
  * U.S. Dept of Education Civil Rights Data Collection (CRDC) public-use school files,
    https://civilrightsdata.ed.gov/assets/ocr/docs/<year>-crdc-data.zip   (2015-16 ... 2023-24)
  * NCES Common Core of Data (CCD) school directory (crosswalk NCESSCH -> state school id/address),
    https://nces.ed.gov/ccd/Data/zip/ccd_sch_029_2425_w_1a_073025.zip

Only Miami-Dade County Public Schools rows (NCES LEAID 1200390, which also holds the
district's charter schools) are kept. Output:
  data/outcomes/federal/crdc_<year>/<table>.csv   filtered raw rows (reproducible cache)
  data/outcomes/federal/ccd_directory_miami_dade.csv
  data/outcomes/federal/crosswalk_db.json         NCESSCH -> places.id (when navigator.db exists; diagnostics only)
  data/outcomes/federal_crosswalk.json            NCESSCH -> state school number (committed; what the app joins on)
  data/outcomes/federal_readiness.json.gz         records {school_name, ncessch, year, metric,
                                                  value, denominator, source_url}

CRDC suppression / not-applicable codes are negative numbers (-3, -5, -9 ...); they are
never emitted as values. denominator = school total enrollment (TOT_ENR) for that year,
when that is itself valid. Nothing is imputed.

Usage:  python -I scripts/fetch_federal_readiness.py [--skip-download] [--years 2015-16 ...]
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import re
import sqlite3
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
OUT_DIR = BACKEND / "data" / "outcomes"
RAW_DIR = OUT_DIR / "federal"
OUT_FILE = OUT_DIR / "federal_readiness.json.gz"
DB_PATH = BACKEND / "data" / "navigator.db"

LEAID = "1200390"  # Miami-Dade County Public Schools
UA = "Mozilla/5.0 (school-navigator research fetch)"
CRDC_URL = "https://civilrightsdata.ed.gov/assets/ocr/docs/{y}-crdc-data.zip"
CCD_URL = "https://nces.ed.gov/ccd/Data/zip/ccd_sch_029_2425_w_1a_073025.zip"
YEARS = ["2015-16", "2017-18", "2020-21", "2021-22", "2023-24"]

# metric -> (table file stem, [column bases summed]); each base expands to _M,_F (+_X when present)
ENROLL = ("Enrollment", ["TOT_ENR"])
METRICS = {
    "enrollment_total": ENROLL,
    "ap_enrolled": ("Advanced Placement", ["TOT_APENR"]),
    "ap_math_enrolled": ("Advanced Placement", ["TOT_APMATHENR"]),
    "ap_science_enrolled": ("Advanced Placement", ["TOT_APSCIENR"]),
    "ap_computer_science_enrolled": ("Advanced Placement", ["TOT_APCOMPENR"]),
    "ib_enrolled": ("International Baccalaureate", ["TOT_IBENR"]),
    "dual_enrolled": ("Dual Enrollment", ["TOT_DUAL", "TOT_DUALENR"]),
    "sat_act_takers": ("SAT and ACT", ["TOT_SATACT"]),
    "algebra1_enrolled_grade8": ("Algebra I", ["TOT_ALGENR_G08"]),
    "algebra1_enrolled_grade7_8": ("Algebra I", ["TOT_ALGENR_G0708"]),
    "algebra1_enrolled_grades9_12": ("Algebra I", ["TOT_ALGENR_GS0910", "TOT_ALGENR_GS1112"]),
    "geometry_enrolled": ("Geometry", ["TOT_MATHENR_GEOM"]),
    "algebra2_enrolled": ("Algebra II", ["TOT_MATHENR_ALG2"]),
    "advanced_math_enrolled": ("Advanced Mathematics", ["TOT_MATHENR_ADVM"]),
    "calculus_enrolled": ("Calculus", ["TOT_MATHENR_CALC"]),
    "biology_enrolled": ("Biology", ["TOT_SCIENR_BIOL"]),
    "chemistry_enrolled": ("Chemistry", ["TOT_SCIENR_CHEM"]),
    "physics_enrolled": ("Physics", ["TOT_SCIENR_PHYS"]),
    "computer_science_enrolled": ("Computer Science", ["TOT_COMPENR_CSCI"]),
    "data_science_enrolled": ("Data Science", ["TOT_DATAENR_DSCI"]),
}
# single-column counts (no M/F split); denominator left empty
COUNTS = {"ap_courses_offered": ("Advanced Placement", "SCH_APCOURSES")}
TABLES = sorted({t for t, _ in METRICS.values()} | {t for t, _ in COUNTS.values()} | {"School Characteristics"})
ID_COLS = ["LEAID", "SCHID", "SCH_NAME", "COMBOKEY"]
WIDE_2015 = "CRDC 2015-16 School Data.csv"  # 2015-16 ships one wide school file


def download(url: str, dest: Path) -> None:
    # curl is used (not urllib) because some Python builds lack a CA bundle; UA avoids ed.gov 403s
    subprocess.run(["curl", "-sSfL", "-A", UA, "-o", str(dest), url], check=True)


def _rows(zf: zipfile.ZipFile, member: str):
    with zf.open(member) as raw:
        yield from csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline=""))


def _school_members(zf: zipfile.ZipFile) -> dict[str, str]:
    """table stem -> zip member for school-level CSVs (skips LEA files)."""
    out = {}
    for n in zf.namelist():
        parts = n.replace("\\", "/").split("/")
        if not n.lower().endswith(".csv") or "__MACOSX" in n or "LEA" in parts[:-1]:
            continue
        if "LEA" in parts[-1] and "School" not in parts[-1]:
            continue
        out[Path(n).stem] = n
    return out


def fetch_crdc_year(year: str) -> None:
    ydir = RAW_DIR / f"crdc_{year}"
    ydir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        zpath = Path(td) / "crdc.zip"
        print(f"[crdc {year}] downloading {CRDC_URL.format(y=year)}", flush=True)
        download(CRDC_URL.format(y=year), zpath)
        with zipfile.ZipFile(zpath) as zf:
            members = _school_members(zf)
            if year == "2015-16":
                wide = members.get(Path(WIDE_2015).stem)
                if not wide:
                    sys.exit("2015-16 wide school file not found in zip")
                rows = [r for r in _rows(zf, wide) if r.get("LEAID") == LEAID]
                _write(ydir / "School Data.csv", rows)
                print(f"  School Data: {len(rows)} Miami-Dade rows")
                return
            for t in TABLES:
                m = members.get(t)
                if not m:
                    print(f"  (no {t} table in {year})")
                    continue
                rows = [r for r in _rows(zf, m) if r.get("LEAID") == LEAID]
                _write(ydir / f"{t}.csv", rows)
                print(f"  {t}: {len(rows)} rows")


def _write(path: Path, rows: list[dict]) -> None:
    if not rows:
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def fetch_ccd() -> None:
    with tempfile.TemporaryDirectory() as td:
        zpath = Path(td) / "ccd.zip"
        print(f"[ccd] downloading {CCD_URL}", flush=True)
        download(CCD_URL, zpath)
        with zipfile.ZipFile(zpath) as zf:
            name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
            with zf.open(name) as raw:
                rd = csv.DictReader(io.TextIOWrapper(raw, encoding="latin-1", newline=""))
                rows = [r for r in rd if r.get("LEAID") == LEAID]
    _write(RAW_DIR / "ccd_directory_miami_dade.csv", rows)
    print(f"  CCD directory: {len(rows)} Miami-Dade rows")


def _num(v):
    try:
        x = float(str(v).strip())
    except (TypeError, ValueError):
        return None
    return None if x < 0 else x  # negative = CRDC suppression / not-applicable code


def _total(row: dict, bases: list[str]):
    """Sum M+F(+X) over all bases of the first spelling family present; None if any part invalid."""
    for base in bases:
        if f"{base}_M" in row and f"{base}_F" in row:
            vals = [_num(row[f"{base}_M"]), _num(row[f"{base}_F"])]
            if any(v is None for v in vals):
                return None
            # 2021-22+ add a non-binary (_X) column that is fully suppressed (-10) in Miami-Dade;
            # it is added only when it holds a valid count, otherwise ignored.
            x = _num(row.get(f"{base}_X"))
            return sum(vals) + (x or 0)
    return None


def _total_multi(row: dict, bases: list[str], alts: bool):
    # bases are either alternative spellings (dual) or parts to add (algebra 9-12)
    if alts:
        return _total(row, bases)
    vals = [_total(row, [b]) for b in bases]
    return None if any(v is None for v in vals) else sum(vals)


def _read(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:  # 2015-16 COMBOKEY is mangled to scientific notation ("1.20039E+11"); rebuild it
        r["COMBOKEY"] = f"{r['LEAID']}{r['SCHID'].zfill(5)}"
    return rows


def _clean(x: float):
    return int(x) if float(x).is_integer() else x


def normalise(years: list[str]) -> list[dict]:
    records = []
    for year in years:
        ydir = RAW_DIR / f"crdc_{year}"
        url = CRDC_URL.format(y=year)
        wide = year == "2015-16"
        tables: dict[str, dict[str, dict]] = {}
        for t in TABLES:
            p = ydir / ("School Data.csv" if wide else f"{t}.csv")
            tables[t] = {r["COMBOKEY"]: r for r in _read(p)}
        enr_rows = tables["Enrollment"]
        names = {}
        for t in tables.values():
            for k, r in t.items():
                names.setdefault(k, r.get("SCH_NAME", ""))
        for metric, (table, bases) in METRICS.items():
            alts = metric == "dual_enrolled"
            for key, row in tables[table].items():
                v = _total_multi(row, bases, alts)
                if v is None:
                    continue
                den = None
                if metric != "enrollment_total":
                    er = enr_rows.get(key)
                    den = _total(er, ["TOT_ENR"]) if er else None
                    den = _clean(den) if den else None
                records.append({"school_name": names.get(key) or row.get("SCH_NAME"), "ncessch": key, "year": year,
                                "metric": metric, "value": _clean(v), "denominator": den,
                                "source_url": f"{url}#{table}"})
        for metric, (table, col) in COUNTS.items():
            for key, row in tables[table].items():
                v = _num(row.get(col))
                if v is not None:
                    records.append({"school_name": names.get(key), "ncessch": key, "year": year, "metric": metric,
                                    "value": _clean(v), "denominator": None, "source_url": f"{url}#{table}"})
    return records


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def write_committed_crosswalk(ccd: list[dict]) -> None:
    """NCESSCH -> state school number, committed so the app can join CRDC rows to places.source_id without the raw CCD file."""
    m = {r["NCESSCH"]: r["ST_SCHID"][-4:] for r in ccd if r.get("ST_SCHID", "").startswith("FL-13-")}
    out = {"source": f"NCES Common Core of Data school directory 2024-25 ({CCD_URL})",
           "note": "NCESSCH -> Florida state school number (ST_SCHID FL-13-NNNN, last 4 digits) = places.source_id. Written by scripts/fetch_federal_readiness.py.",
           "map": dict(sorted(m.items()))}
    (OUT_DIR / "federal_crosswalk.json").write_text(json.dumps(out, indent=0) + "\n")


def build_crosswalk() -> dict | None:
    """NCESSCH -> places.id via CCD ST_SCHID (FL-13-NNNN) == places.source_id; fall back to exact name."""
    ccd = _read(RAW_DIR / "ccd_directory_miami_dade.csv")
    if ccd:
        write_committed_crosswalk(ccd)
    if not ccd or not DB_PATH.exists():
        return None
    db = sqlite3.connect(DB_PATH)
    places = db.execute("SELECT id, kind, source_id, name FROM places WHERE kind IN ('public','charter')").fetchall()
    db.close()
    by_num = {str(p[2]).zfill(4): p for p in places}
    by_name = {}
    for p in places:
        by_name.setdefault(_norm(p[3]), []).append(p)
    xw, used = {}, set()
    for r in ccd:
        p, how = by_num.get(r["ST_SCHID"][-4:]), "state_school_number"
        if p is None:
            c = by_name.get(_norm(r["SCH_NAME"]), [])
            p, how = (c[0], "name") if len(c) == 1 else (None, None)
        if p and p[0] not in used:
            used.add(p[0])
            xw[r["NCESSCH"]] = {"place_id": p[0], "method": how, "st_schid": r["ST_SCHID"], "name": r["SCH_NAME"]}
    stats = {"db_schools": len(places), "ccd_schools": len(ccd), "matched_db": len(xw),
             "db_match_rate": round(len(xw) / len(places), 3)}
    (RAW_DIR / "crosswalk_db.json").write_text(json.dumps({"stats": stats, "map": xw}, indent=1))
    return stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-download", action="store_true", help="reuse files already in data/outcomes/federal")
    ap.add_argument("--years", nargs="*", default=YEARS)
    a = ap.parse_args()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    if not a.skip_download:
        for y in a.years:
            fetch_crdc_year(y)
        fetch_ccd()
    recs = normalise(a.years)
    with gzip.open(OUT_FILE, "wt", encoding="utf-8") as f:
        json.dump(recs, f, separators=(",", ":"))
    print(f"wrote {len(recs)} records -> {OUT_FILE}")
    print("crosswalk:", build_crosswalk())


if __name__ == "__main__":
    main()
