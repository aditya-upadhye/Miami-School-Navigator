"""Shared fixtures. The database is built from the committed county snapshots (no network). FLDOE spreadsheets are SYNTHETIC test
fixtures written here, because the real files cannot be downloaded by script; they mimic the layout (title rows, header row,
district + school number) but contain made-up grades."""
from __future__ import annotations

import os

os.environ["NAVIGATOR_SKIP_DOTENV"] = "1"  # tests must never pick up a real key from .env
import tempfile

os.environ["USERS_DB_PATH"] = os.path.join(tempfile.mkdtemp(prefix="users-"), "users.db")  # tests never touch a real accounts database

import json
import shutil
from pathlib import Path

import pytest
from openpyxl import Workbook

from app.config import ROOT, Settings
from app.ingest.build import build_database
from app.services.context import load_navigator

REAL_DATA = ROOT / "data"


def _xlsx(path: Path, title: str | None, header: list[str], rows: list[list]) -> None:
    wb = Workbook()
    ws = wb.active
    if title:
        ws.append([title])
        ws.append([])
    ws.append(header)
    for r in rows:
        ws.append(r)
    wb.save(path)


@pytest.fixture(scope="session")
def bare_nav(tmp_path_factory):
    """Database with county data only (no FLDOE files, no curated magnets): the 'not_available' paths."""
    root = tmp_path_factory.mktemp("bare")
    (root / "snapshots").symlink_to(REAL_DATA / "snapshots")
    shutil.copytree(REAL_DATA / "curated", root / "curated")
    s = Settings(data_dir=root, db_path=root / "bare.db")
    build_database(s)
    nav = load_navigator(s)
    yield nav
    nav.conn.close()


@pytest.fixture(scope="session")
def rich_data(tmp_path_factory, bare_nav):
    """Data dir with synthetic FLDOE files + one curated magnet entry. Returns (settings, picks)."""
    root = tmp_path_factory.mktemp("rich")
    (root / "snapshots").symlink_to(REAL_DATA / "snapshots")
    shutil.copytree(REAL_DATA / "curated", root / "curated")
    fl = root / "raw" / "fldoe"
    fl.mkdir(parents=True)
    c = bare_nav.conn
    elem = c.execute("SELECT * FROM places WHERE kind='public' AND site_type='E' AND id NOT LIKE 'pub-%-%' ORDER BY id LIMIT 5").fetchall()
    charter = c.execute("SELECT * FROM places WHERE kind='charter' AND id NOT LIKE 'chr-%-%' ORDER BY id LIMIT 1").fetchone()
    private = c.execute("SELECT * FROM places WHERE kind='private' ORDER BY id LIMIT 1").fetchone()
    letters = ["A", "B", "C", "D", "F"]
    rows = [[13, "MIAMI-DADE", int(p["source_id"]), p["name"], "No", 500 - 10 * i, 99, letters[i]] for i, p in enumerate(elem)]
    rows.append([13, "MIAMI-DADE", 9999, charter["name"].upper(), "Yes", 420, 98, "B"])  # wrong number -> must join by name
    rows.append([14, "OTHER DISTRICT", int(elem[0]["source_id"]), "Impostor", "No", 100, 90, "F"])  # other district: must be ignored
    _xlsx(fl / "SchoolGrades26.xlsx", "2026 School Grades (SYNTHETIC TEST DATA)",
          ["District Number", "District Name", "School Number", "School Name", "Charter School?", "Total Points Earned", "Percent Tested", "2026 School Grade"], rows)
    _xlsx(fl / "LearningGainsBySchool.xlsx", None,
          ["District Number", "School Number", "School Name", "ELA Learning Gains", "Math Learning Gains", "ELA Learning Gains of the Lowest 25%"],
          [[13, int(p["source_id"]), p["name"], 0.55 + 0.05 * i, 0.50 + 0.02 * i, 0.10] for i, p in enumerate(elem)])
    _xlsx(fl / "PrivateSchoolDirectory.xlsx", "Private schools (SYNTHETIC TEST DATA)",
          ["District Number", "School Name", "Street Address", "Zip Code", "FES-EO Scholarship", "Special Education Services"],
          [[13, private["name"], private["address"], private["zip"], "Y", "Y"]])
    magnets = json.loads((root / "curated" / "magnet_themes.json").read_text())
    magnets["as_of"] = "2026-10-15"
    magnets["schools"] = [{"source_id": elem[0]["source_id"], "name": elem[0]["name"], "themes": ["STEM", "Arts"],
                           "verified_by": "test", "verified_on": "2026-10-15", "catalog_url": "https://www.miamimagnets.org/"}]
    (root / "curated" / "magnet_themes.json").write_text(json.dumps(magnets))
    return Settings(data_dir=root, db_path=root / "rich.db"), {"elem": elem, "charter": charter, "private": private}


@pytest.fixture(scope="session")
def rich(rich_data):
    s, picks = rich_data
    report = build_database(s)
    nav = load_navigator(s)
    yield nav, picks, report
    nav.conn.close()


@pytest.fixture(scope="session")
def rich_nav(rich):
    return rich[0]


WYNWOOD = (25.79866, -80.19998)  # 2250 NW 2nd Ave, 33127 (county address point)


def assert_fields(obj, path="$"):
    """Walk any API response: every Field must carry status + source + as_of; not_available must explain itself."""
    if isinstance(obj, dict):
        if "status" in obj and "value" in obj and "source" in obj:
            assert obj["status"] in {"official", "derived", "reported_by_school", "curated", "not_available"}, path
            assert obj["source"], f"{path}: empty source"
            assert obj["as_of"], f"{path}: empty as_of ({obj['source']})"
            if obj["status"] == "not_available":
                assert obj["why"] and obj["suggested_action"], f"{path}: not_available needs why + suggested_action"
                assert obj["value"] is None, path
        for k, v in obj.items():
            assert_fields(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            assert_fields(v, f"{path}[{i}]")
