"""Researched school data: normalised on ingest, shown with its own source, and the closed/duplicate records stay out of search."""
import json
import shutil

import pytest

from app.config import ROOT, Settings
from app.i18n import use_lang
from app.ingest.build import build_database
from app.ingest.research import _extract
from app.services.compare import compare
from app.services.context import load_navigator
from app.services.schools import get_place, search, summarize
from tests.conftest import WYNWOOD, assert_fields

LAT, LON = WYNWOOD


def cited(value, *, source_type="official", url="https://cdn.fldoe.org/file/1/SchoolGrades26.xlsx", year=None, confidence="high", note=None):
    return {"value": value, "year": year, "source_type": source_type, "source_url": url, "as_of": "2026-09-01", "confidence": confidence, "note": note}


def school(pid, **fields):
    return {"id": pid, "researched_on": "2026-10-17", **fields}


def test_extract_normalises_values_and_drops_what_it_cannot_trust():
    obj = school("x", state_grade=cited("b", year="2025-26"), gains_ela=cited(61.0), gains_math=cited(None), enrollment=cited(924),
                 phone=cited(" 305-763-6257 "), website=cited("not a url"), specialties=cited(["STEM", "Arts"]),
                 ese=cited({"offers_ese": True, "details": "Inclusion classes"}, source_type="school"),
                 aftercare=cited({"before_care": True, "after_care": True, "hours": None, "cost": "varies, contact school", "provider": None}, source_type="school"),
                 is_magnet=cited(True), magnet_themes=cited(["Engineering*", "SpaceHUB"]),
                 optional={"proficiency_ela": {"value": 78.0, "year": "2025-26", "source_url": "https://cdn.fldoe.org/x.xlsx", "as_of": "2026-09-01"},
                           "school_hours": {"value": "8:00am-3:00pm", "source_url": "https://school.example/hours", "as_of": "2026-10-17"}})
    r, cols = _extract(obj, "public")
    assert cols["state_grade"] == "B" and cols["state_grade_year"] == 2026 and cols["gains_ela"] == 61.0 and "gains_math" not in cols
    assert cols["enrollment"] == 924 and cols["phone"] == "305-763-6257" and "website" not in cols
    assert cols["is_magnet"] == 1 and json.loads(cols["magnet_themes"]) == ["Engineering", "SpaceHUB"]
    assert cols["ese_signal"] == "researched"
    assert r["state_grade"]["status"] == "official" and r["state_grade"]["source"] == "Florida Department of Education"
    assert r["ese"]["status"] == "reported_by_school" and r["ese"]["value"] is True and r["ese"]["details"] == "Inclusion classes"
    assert r["aftercare"]["value"] == {"before_care": True, "after_care": True, "cost": "varies, contact school"}  # nulls are dropped
    assert r["proficiency_ela"]["status"] == "official" and r["proficiency_ela"]["value"] == 78.0
    assert r["school_hours"]["status"] == "reported_by_school" and r["school_hours"]["source"] == "school.example (school website)"
    assert "gains_math" not in r and "website" not in r


def test_extract_ignores_empty_tags_invalid_grades_and_charter_magnet_claims():
    obj = school("x", state_grade=cited("E"), specialties=cited([]), is_magnet=cited(False), enrollment=cited(0))
    r, cols = _extract(obj, "charter")
    assert r == {} and cols == {}
    pub, _ = _extract(obj, "public")
    assert pub["is_magnet"]["value"] is False and "specialties" not in pub  # a verified "not a magnet" is kept; empty tags are not "none"


@pytest.fixture(scope="module")
def nav(tmp_path_factory):
    root = tmp_path_factory.mktemp("research")
    (root / "snapshots").symlink_to(ROOT / "data" / "snapshots")
    shutil.copytree(ROOT / "data" / "curated", root / "curated")
    magnets = json.loads((root / "curated" / "magnet_themes.json").read_text())
    magnets["schools"] = []
    (root / "curated" / "magnet_themes.json").write_text(json.dumps(magnets))
    doc = {"as_of": "2026-10-17", "source": {"title": "Test research"}, "hidden": {"pub-4081": "closed", "chr-6015-135": "duplicate"},
           "schools": [
               school("pub-1441", state_grade=cited("B", year="2025-26"), gains_ela=cited(54.0), gains_math=cited(73.0), enrollment=cited(311),
                      specialties=cited(["STEM"], source_type="school", url="https://dunbark8.net/"), is_magnet=cited(False),
                      ese=cited({"offers_ese": True, "details": "Inclusion and self-contained classes"}, source_type="school", url="https://dunbark8.net/"),
                      aftercare=cited({"before_care": True, "after_care": True, "hours": "6:30am-6:00pm", "cost": "varies, contact school", "provider": "school-run"},
                                      source_type="school", url="https://dunbark8.net/"),
                      optional={"proficiency_ela": {"value": 41.0, "source_url": "https://cdn.fldoe.org/x.xlsx", "as_of": "2026-09-01"}}),
               school("pub-7581", is_magnet=cited(True), magnet_themes=cited(["Int'l Education/Global Focus"]), state_grade=cited("A", year="2025-26")),
               school("chr-7059-159", state_grade=cited("A", year="2025-26"), is_magnet=cited(False), gains_ela=cited(65.0)),
           ]}
    (root / "curated" / "school_research.json").write_text(json.dumps(doc))
    s = Settings(data_dir=root, db_path=root / "t.db")
    report = build_database(s)
    assert report["research"]["school_research"]["matched"] == 3
    n = load_navigator(s)
    yield n
    n.conn.close()


def test_researched_values_carry_their_own_source(nav):
    s = summarize(nav, get_place(nav, "pub-1441"))
    assert s.state_grade.value == "B" and s.state_grade.status == "official" and s.state_grade.url.endswith("SchoolGrades26.xlsx")
    assert s.gains_math.value == 73.0 and s.enrollment.value == 311
    assert s.specialties.value == ["STEM"] and s.specialties.status == "reported_by_school" and s.specialties.url == "https://dunbark8.net/"
    assert s.is_magnet.value is False and s.is_magnet.status == "official" and s.magnet_themes.value == []
    assert s.ese.value == "Inclusion and self-contained classes"
    assert s.aftercare.value == {"before_care": True, "after_care": True, "hours": "6:30am-6:00pm", "cost": "varies, contact school", "provider": "school-run"}
    assert s.proficiency_ela.value == 41.0 and s.proficiency_math.status == "not_available"
    assert "confidence: high" in s.state_grade.method
    assert_fields(s.model_dump())


def test_researched_values_are_language_neutral_and_only_the_method_is_translated(nav):
    with use_lang("es"):
        es = summarize(nav, get_place(nav, "pub-1441"))
    en = summarize(nav, get_place(nav, "pub-1441"))
    assert es.aftercare.value == en.aftercare.value and es.application_method.value == en.application_method.value
    assert "confianza: alta" in es.state_grade.method and "confidence: high" in en.state_grade.method


def test_charters_do_not_get_a_magnet_answer_and_magnets_list_their_themes(nav):
    assert summarize(nav, get_place(nav, "chr-7059-159")).is_magnet.status == "not_available"
    s = summarize(nav, get_place(nav, "pub-7581"))
    assert s.is_magnet.value is True and s.magnet_themes.value == ["Int'l Education/Global Focus"]
    assert s.specialties.value == ["Int'l Education/Global Focus"]  # no tags researched: falls back to the themes


def test_researched_specialties_feed_the_filter_and_score(nav):
    r = search(nav, lat=LAT, lon=LON, radius_mi=3, specialties=["STEM"], limit=100)
    assert "pub-1441" in {x.id for x in r.results}


def test_hidden_records_leave_search_but_stay_reachable_by_id(nav):
    r = search(nav, lat=LAT, lon=LON, radius_mi=5, limit=100)
    ids = {x.id for x in r.results}
    assert "pub-4081" not in ids and "chr-6015-135" not in ids and "pub-1441" in ids
    assert summarize(nav, get_place(nav, "pub-4081")).name  # a saved or shared link still resolves


def test_compare_has_the_researched_rows_and_best_marks(nav):
    j = compare(nav, ["pub-1441", "pub-7581", "chr-7059-159"], LAT, LON)
    assert_fields(j.model_dump())
    rows = {r.key: r for r in j.rows}
    assert {"proficiency_ela", "proficiency_math", "school_hours", "magnet_themes", "application_method"} <= set(rows)
    assert rows["gains_ela"].best_index == 2  # Miami Arts Charter's 65.0 beats Dunbar's 54.0; iPrep has none
    assert rows["state_grade"].cells[1].value == "A"


def test_private_school_tuition_and_scholarships_load_from_research():
    obj = school("x", tuition=cited(11500, source_type="school", url="https://school.example/tuition", note="K-5 range $11,500-$12,800"),
                 scholarships=cited(["FES Educational Options", "Florida Tax Credit (FTC)"], source_type="official", url="https://www.fldoe.org/x"),
                 enrollment=cited(180, source_type="school", url="https://school.example/"))
    r, cols = _extract(obj, "private")
    assert r["tuition"]["value"] == 11500.0 and r["tuition"]["status"] == "reported_by_school"
    assert r["scholarships"]["value"] == ["FES Educational Options", "Florida Tax Credit (FTC)"]
    assert json.loads(cols["scholarship_flags"]) == r["scholarships"]["value"] and cols["enrollment"] == 180
    none, cols2 = _extract(school("y", scholarships=cited([])), "private")
    assert none["scholarships"]["value"] == [] and cols2["scholarship_flags"] == "[]"  # "accepts none" is an answer, not a gap
    assert "tuition" not in _extract(obj, "charter")[0]  # public and charter schools are free by law; nothing to load
