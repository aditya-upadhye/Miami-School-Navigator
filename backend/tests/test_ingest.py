"""Ingestion: county snapshots -> SQLite, FLDOE spreadsheets (synthetic), curated magnets, quality checks."""
import json

import re

import pytest


def test_counts_and_no_email(bare_nav):
    kinds = {r["kind"]: r["n"] for r in bare_nav.conn.execute("SELECT kind, COUNT(*) n FROM places GROUP BY kind")}
    assert kinds["public"] > 300 and kinds["charter"] > 150 and kinds["private"] > 900 and kinds["early_learning"] > 1500
    cols = [r["name"] for r in bare_nav.conn.execute("PRAGMA table_info(places)")]
    assert not any("email" in c.lower() for c in cols)
    # Some county website cells contain email addresses; they must be dropped. (Names such as "iTech@Thomas A. Edison" are fine.)
    leaked = [r["id"] for r in bare_nav.conn.execute("SELECT id, website FROM places WHERE website LIKE '%@%'")]
    assert not leaked, leaked
    email = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
    for r in bare_nav.conn.execute("SELECT * FROM places"):
        for k, v in dict(r).items():
            assert not (isinstance(v, str) and email.search(v)), (r["id"], k, v)


def test_non_instructional_sites_excluded(bare_nav):
    types = {r[0] for r in bare_nav.conn.execute("SELECT DISTINCT site_type FROM places WHERE kind='public'")}
    assert not types & {"A", "O", "PLC", "U"}


def test_zone_self_check_meets_target(bare_nav):
    z = bare_nav.quality["zone_self_check"]
    assert z["meets_target"] and z["pct"] >= 95.0, z


def test_without_fldoe_files_grades_are_missing_not_guessed(bare_nav):
    assert bare_nav.conn.execute("SELECT COUNT(*) FROM places WHERE state_grade IS NOT NULL").fetchone()[0] == 0
    assert bare_nav.quality["join_coverage"]["public"]["matched_to_state_record"] == 0
    assert "fldoe_school_grades" not in bare_nav.datasets


def test_fldoe_grades_join_on_district_13_and_number(rich):
    nav, picks, report = rich
    g = report["fldoe"]["fldoe_school_grades"]
    assert g["year"] == 2026 and g["grade_column"] == "2026 school grade", g
    rows = {r["source_id"]: r for r in nav.conn.execute("SELECT * FROM places WHERE kind='public'")}
    first = rows[picks["elem"][0]["source_id"]]
    # the district-14 'Impostor' row has the same school number and grade F: it must NOT override district 13's grade A
    assert first["state_grade"] == "A" and first["state_key"] == f"13-{int(first['source_id']):04d}" and first["state_grade_year"] == 2026
    assert [rows[p["source_id"]]["state_grade"] for p in picks["elem"]] == ["A", "B", "C", "D", "F"]


def test_charter_joined_by_name_with_lower_confidence(rich):
    nav, picks, _ = rich
    ch = nav.conn.execute("SELECT * FROM places WHERE id=?", (picks["charter"]["id"],)).fetchone()
    assert ch["state_grade"] == "B" and 0.8 < ch["join_confidence"] < 1.0


def test_learning_gains_fractions_become_percent_and_l25_ignored(rich):
    nav, picks, report = rich
    assert report["fldoe"]["fldoe_learning_gains"]["ela_column"] == "ela learning gains"
    r = nav.conn.execute("SELECT gains_ela, gains_math FROM places WHERE id=?", (picks["elem"][0]["id"],)).fetchone()
    assert r["gains_ela"] == 55.0 and r["gains_math"] == 50.0


def test_private_directory_match_scholarship_and_ese(rich):
    nav, picks, report = rich
    p = nav.conn.execute("SELECT * FROM places WHERE id=?", (picks["private"]["id"],)).fetchone()
    assert json.loads(p["scholarship_flags"]) == ["FES Educational Options"] and p["ese_signal"] == "directory_flag"
    assert p["join_confidence"] and p["join_confidence"] >= 0.75


def test_curated_magnet_entry_applied(rich):
    nav, picks, report = rich
    p = nav.conn.execute("SELECT is_magnet, magnet_themes FROM places WHERE id=?", (picks["elem"][0]["id"],)).fetchone()
    assert p["is_magnet"] == 1 and json.loads(p["magnet_themes"]) == ["STEM", "Arts"]
    assert report["curated"]["magnet_themes"]["matched"] == 1


def test_join_coverage_report_lists_unmatched(rich):
    nav, _, _ = rich
    cov = nav.quality["join_coverage"]["public"]
    assert cov["matched_to_state_record"] == 5 and cov["unmatched"] and cov["matched_pct"] < 5


def test_real_school_grades_layout_single_workbook(tmp_path, bare_nav):
    """The real 2026 School Grades workbook: title rows, 55 columns spelled out in full (no 'ELA' abbreviation), a 'Grade 2026'
    column beside earlier years, zero-padded numbers as text, and the learning gains in the same file. Headers copied from the real
    file; the rows are made up."""
    import shutil

    from openpyxl import Workbook

    from app.config import ROOT, Settings
    from app.ingest.build import build_database
    from app.services.context import load_navigator

    root = tmp_path / "data"
    root.mkdir()
    (root / "snapshots").symlink_to(ROOT / "data" / "snapshots")
    shutil.copytree(ROOT / "data" / "curated", root / "curated")
    (root / "curated" / "school_research.json").unlink(missing_ok=True)  # this test is about the FLDOE workbook alone
    fl = root / "raw" / "fldoe"
    fl.mkdir(parents=True)
    header = ["District Number", "District Name", "School Number", "Virtual Provider Number", "School Name",
              "English Language Arts Achievement", "English Language Arts Learning Gains", "English Language Arts Learning Gains of the Lowest 25%",
              "Mathematics Achievement", "Mathematics Learning Gains", "Mathematics Learning Gains of the Lowest 25%",
              "Total Points Earned", "Percent of Total Possible Points", "Percent Tested", "Grade 2026", "Grade 2025", "Grade 2024", "Charter School"]
    dunbar = bare_nav.conn.execute("SELECT source_id, name FROM places WHERE id='pub-1441'").fetchone()
    wb = Workbook()
    ws = wb.active
    ws.title = "School Grades 2026"
    ws.append([None, None, "2025-26 School Grades as of July 2026"])
    ws.append([None, None, "Note: the grading scale ..."])
    ws.append([])
    ws.append(header)
    ws.append(["13", "MIAMI-DADE", dunbar["source_id"], None, dunbar["name"].upper(), 41, 62, 55, 38, 57, 49, 400, 50, 99, "B", "C", "C", "NO"])
    wheatley = bare_nav.conn.execute("SELECT source_id FROM places WHERE id='pub-5931'").fetchone()
    ws.append(["13", "MIAMI-DADE", wheatley["source_id"], None, "K12 FLORIDA, LLC", 40, 50, 45, 40, 50, 45, 300, 50, 99, "A", "A", "A", "NO"])
    ws.append(["13", "MIAMI-DADE", "9998", None, "SOME SCHOOL WITHOUT A COUNTY RECORD", 41, 62, 55, 38, 57, 49, 400, 50, 99, "A", "A", "A", "NO"])
    ws.append(["14", "OTHER DISTRICT", dunbar["source_id"], None, "IMPOSTOR", 1, 1, 1, 1, 1, 1, 1, 1, 99, "F", "F", "F", "NO"])
    wb.save(fl / "SchoolGrades26.xlsx")

    s = Settings(data_dir=root, db_path=root / "t.db")
    report = build_database(s)
    g, gains = report["fldoe"]["fldoe_school_grades"], report["fldoe"]["fldoe_learning_gains"]
    assert g["grade_column"] == "grade 2026" and g["year"] == 2026 and g["matched"] == 2
    assert gains["ela_column"] == "english language arts learning gains"  # not the 'lowest 25%' column
    assert gains["math_column"] == "mathematics learning gains" and gains["updated"] == 2
    nav = load_navigator(s)
    try:
        r = nav.conn.execute("SELECT state_grade, state_grade_year, gains_ela, gains_math, join_confidence FROM places WHERE id='pub-1441'").fetchone()
        assert (r["state_grade"], r["state_grade_year"], r["gains_ela"], r["gains_math"], r["join_confidence"]) == ("B", 2026, 62.0, 57.0, 1.0)
        # same school number but a very different official name: grade kept, confidence lowered, and the doubt is shown on the Field
        from app.services.schools import get_place, summarize

        w = summarize(nav, get_place(nav, "pub-5931"))
        assert w.state_grade.value == "A" and "K12 FLORIDA" in w.state_grade.method and "Confirm it is the same school" in w.state_grade.method
        low = nav.quality["join_coverage"]["public"]["low_confidence"]
        assert [x["source_id"] for x in low] == [wheatley["source_id"]] and low[0]["confidence"] == 0.7
        assert "Check:" not in summarize(nav, get_place(nav, "pub-1441")).state_grade.method
    finally:
        nav.conn.close()


def test_xlsx_export_without_cell_refs_keeps_columns_aligned(tmp_path):
    """Some FLDOE exports omit cell references (r="A1") and write empty cells as empty elements; the direct XML reader must still
    count empty cells or every later column shifts left (this once put phone numbers in the ZIP column)."""
    import zipfile

    from app.ingest import fldoe

    def row(*vals):
        return "<x:row>" + "".join(f'<x:c t="str"><x:v>{v}</x:v></x:c>' for v in vals) + "</x:row>"

    sheet = ('<?xml version="1.0"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>'
             + row("District", "School Name", "Address 1", "Address 2", "City", "Zip")
             + row("Dade", "Acme Academy", "1 Main St", "", "Miami", "33127")
             + "</x:sheetData></x:worksheet>")
    p = tmp_path / "Private_export.xlsx"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr("xl/workbook.xml", "<workbook/>")
        z.writestr("xl/styles.xml", "<styleSheet/>")  # openpyxl rejects this one, forcing the fallback
        z.writestr("xl/worksheets/sheet1.xml", sheet)
    df = fldoe.read_table(p)
    r = df.iloc[0]
    assert (r["address 1"], r["city"], r["zip"]) == ("1 Main St", "Miami", "33127") and r["address 2"] in (None, "") or str(r["address 2"]) == "nan"


@pytest.mark.parametrize("col,label", [
    ("fes educational options participant", "FES Educational Options"), ("ftc participant", "Florida Tax Credit (FTC)"),
    ("fes unique abilities participant", "FES Unique Abilities"), ("pep participant", "PEP Hybrid"), ("florida tax credit scholarship program participant", "Florida Tax Credit (FTC)"),
    ("some new scholarship participant", "Some New Scholarship"),
])
def test_scholarship_labels(col, label):
    from app.ingest.fldoe import scholarship_label

    assert scholarship_label(col) == label


def test_charter_number_match_with_a_different_name_is_rejected_not_graded(tmp_path):
    """The county's charter ID is not guaranteed to equal the state number: a number match whose names differ must not grade the
    school (it could be a different school), while the same situation for an M-DCPS school keeps the grade at lower confidence."""
    import sqlite3

    from app import db
    from app.ingest.fldoe import PlaceIndex, _resolve

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    db.init_schema(conn)
    def add(pid, sid, name, kind):
        conn.execute("INSERT INTO places (id,source_layer,source_id,kind,name,lat,lon,extra) VALUES (?,?,?,?,?,25.8,-80.2,'{}')", (pid, "x", sid, kind, name))
    add("chr-5028", "5028", "BridgePrep Academy of Miami-Dade", "charter")
    add("pub-7161", "7161", "Maritime & Science Technology Academy", "public")
    add("chr-1111", "1111", "Sunshine Prep Academy", "charter")
    rows = conn.execute("SELECT id, source_id, name, address, zip, extra FROM places").fetchall()
    idx = PlaceIndex(rows)
    import pandas as pd

    def row(num, name):
        return pd.Series({"School Number": str(num), "School Name": name})

    place, conf, _, how, review = _resolve(idx, row("5028", "BRIDGEPREP ACADEMY OF DORAL ELEMENTARY SCHOOL"), "School Number", "School Name")
    assert place is None and review and review["county_name"] == "BridgePrep Academy of Miami-Dade"  # rejected, listed for review
    place, conf, state_name, how, _ = _resolve(idx, row("7161", "MAST ACADEMY"), "School Number", "School Name")
    assert place["id"] == "pub-7161" and conf == 0.7 and state_name == "MAST ACADEMY"  # public: number is authoritative, doubt recorded
    place, conf, _, how, _ = _resolve(idx, row("1111", "SUNSHINE PREP ACADEMY"), "School Number", "School Name")
    assert place["id"] == "chr-1111" and conf == 1.0 and how == "number"


def test_directory_emails_are_never_read(bare_nav):
    from app.ingest import fldoe

    src = open(fldoe.__file__).read()
    assert "email" not in src.lower().replace("never", "")  # the loader has no code path that touches email columns


@pytest.mark.parametrize("name,out", [
    ("Summer Camp at Frost Science", True), ("YMCA Miami Lakes Elementary A/S (EP)", True), ("YWCA Citrus Grove Elementary B/A (EP)", True),
    ("CitiKidz After-School Program", True), ("Oak Grove Park Camp", True), ("Scott Park (EP)", True),
    ("St Paul Before and After School Care Program", True),
    ("MDCPS Holmes Elementary (VPK)", False),                 # a real VPK provider: kept
    ("Cambridge Academy and Camp Learning Center", False),    # a child-care center that happens to have "Camp" in the middle
    ("Little Palms Early Learning Center", False), ("Happy Children of Overtown", False),
])
def test_school_age_programs_are_not_early_learning(name, out):
    from app.ingest.build import is_school_age_program

    assert is_school_age_program(name) is out


def test_no_camps_or_after_school_in_early_learning(bare_nav):
    from app.ingest.build import is_school_age_program

    bad = [r["name"] for r in bare_nav.conn.execute("SELECT name FROM places WHERE kind='early_learning'") if is_school_age_program(r["name"])]
    assert not bad, bad[:5]
    assert bare_nav.conn.execute("SELECT COUNT(*) FROM places WHERE kind='early_learning'").fetchone()[0] > 1500
