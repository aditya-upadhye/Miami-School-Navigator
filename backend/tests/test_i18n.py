"""Spanish and Haitian Creole for the planner: complete catalogs, no English leaking through, and identical logic in every language."""
import re
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.i18n import LANGS, MESSAGES, date_text, month_day_text, placeholders, t
from app.main import app
from app.schemas import PlanChild, PlanRequest
from app.services.plan import plan
from tests.conftest import WYNWOOD

LAT, LON = WYNWOOD
TODAY = date(2026, 10, 16)
FAMILY = [PlanChild(age=3, name="Leo"), PlanChild(age=7, name="Maya"), PlanChild(age=1, name="Baby"), PlanChild(age=10, name="Sam"),
          PlanChild(age=5, birth_date=date(2022, 9, 1), name="Kay")]

# Strings that are legitimately identical in every language (product names, acronyms)
SAME_EVERYWHERE = {"entering.prek3", "entering.vpk"}


def run(nav, lang, children=FAMILY, free_only=False):
    return plan(nav, PlanRequest(lat=LAT, lon=LON, children=children, free_only=free_only, lang=lang), today=TODAY)


# ----------------------------------------------------------------------------------------------------------- the catalog
def test_every_message_exists_in_all_three_languages_with_matching_placeholders():
    for key, row in MESSAGES.items():
        assert len(row) == 3 and all(s.strip() for s in row), key
        assert placeholders(row[0]) == placeholders(row[1]) == placeholders(row[2]), f"{key}: placeholders differ across languages"


def test_translations_are_actually_translated():
    for key, (en, es, ht) in MESSAGES.items():
        if key in SAME_EVERYWHERE:
            continue
        assert es != en and ht != en and es != ht, f"{key} looks untranslated"


def test_unknown_language_falls_back_to_english_and_t_fills_placeholders():
    assert t("child", "fr", n=2) == "Child 2" == t("child", "en", n=2)
    assert t("child", "es", n=2) == "Niño 2" and t("child", "ht", n=2) == "Timoun 2"


def test_dates_are_written_the_local_way():
    d = date(2027, 9, 1)
    assert date_text(d, "en") == "September 1, 2027" and month_day_text(d, "en") == "September 1"
    assert date_text(d, "es") == "1 de septiembre de 2027" and month_day_text(d, "es") == "1 de septiembre"
    assert date_text(d, "ht") == "1ye septanm 2027" and month_day_text(d, "ht") == "1ye septanm"
    assert date_text(date(2027, 1, 15), "ht") == "15 janvye 2027" and date_text(date(2027, 1, 15), "es") == "15 de enero de 2027"


def test_every_curated_rule_and_date_has_both_translations(bare_nav):
    for r in bare_nav.rules["rules"]:
        en = r["text"]
        for lang in ("es", "ht"):
            tr = r["i18n"][lang]["text"]
            assert tr.strip() and tr != en, f"{r['id']} {lang}"
            # numbers carry the legal substance (ages, days, programs): they must survive translation
            assert sorted(re.findall(r"\d+", en)) == sorted(re.findall(r"\d+", tr)), f"{r['id']} {lang}: numbers differ: {en!r} vs {tr!r}"
    for d in bare_nav.rules["dates"]:
        for lang in ("es", "ht"):
            lab = d["i18n"][lang]["label"]
            assert lab.strip() and lab != d["label"], f"{d['id']} {lang}"
            assert sorted(re.findall(r"\d+", d["label"])) == sorted(re.findall(r"\d+", lab))


# ----------------------------------------------------------------------------------------------------------- the plan
ENGLISH_FRAGMENTS = ["Turns 4 on or before", "Turns 5 on or before", "First qualifies", "Not 4 by", "Not 5 by", "Apply for", "Consider ", "Your zoned",
                     "Pick a VPK", "Find licensed", "Plan for free", "is starting", "is moving up", "Some children are planned", "Some steps rely",
                     "Choose a Pre-K", "estimate from age only", "A zoned school is the default", "Even if you are zoned", "Magnet results"]


def all_text(resp):
    out = []
    for c in resp.children:
        out += [c.entering, c.transition_note or ""]
        for e in c.eligibility:
            out += [e.label, e.explanation, e.field.value or ""]
        for it in c.items:
            out += [it.title, it.detail, it.field.value if isinstance(it.field.value, str) else ""]
            out += [it.deadline.label] if it.deadline else []
    out += resp.notes + [k.label for k in resp.key_dates] + [g.program for g in resp.scholarship_guide] + [g.summary.value for g in resp.scholarship_guide]
    return "\n".join(x for x in out if x)


@pytest.mark.parametrize("lang", ["es", "ht"])
def test_no_english_template_text_leaks_into_other_languages(bare_nav, lang):
    text = all_text(run(bare_nav, lang))
    leaks = [f for f in ENGLISH_FRAGMENTS if f in text]
    assert not leaks, f"{lang}: English text leaked: {leaks}"


@pytest.mark.parametrize("lang,expected", [
    ("es", ["Cumple 4 años", "Califica por primera vez", "Solicite el VPK gratuito", "Considere las escuelas chárter", "Su escuela primaria asignada por zona",
            "Abren las solicitudes magnet", "Grado 3", "Kínder"]),
    ("ht", ["Li fè 4 an", "kalifye pou premye fwa", "Aplike pou VPK gratis", "Konsidere lekòl charter", "Lekòl primè ki asiyen pou ou a", "Aplikasyon magnet louvri",
            "Klas 3", "Kindègatèn"]),
])
def test_expected_translated_phrases_appear(bare_nav, lang, expected):
    text = all_text(run(bare_nav, lang))
    missing = [x for x in expected if x not in text]
    assert not missing, f"{lang}: missing {missing}"


def test_the_language_never_changes_the_logic(bare_nav):
    """Same statuses, ids, deadlines, eligibility results, exactness, years and counts in all three languages."""
    def skeleton(r):
        return [(c.child_index, c.age_now, c.age_at_cutoff, c.age_basis, c.stage, c.zoned.school_name if c.zoned else None,
                 [(e.key, e.result, e.exact, e.year) for e in c.eligibility],
                 [(i.id, i.status, i.deadline.date if i.deadline else None, i.deadline.days_until if i.deadline else None, i.rule_ids, i.link, i.field.status) for i in c.items])
                for c in r.children], [(k.id, k.date, k.days_until, k.approximate) for k in r.key_dates], [(g.id, g.schools_nearby, g.flag_labels) for g in r.scholarship_guide], len(r.notes)
    base = skeleton(run(bare_nav, "en"))
    assert skeleton(run(bare_nav, "es")) == base and skeleton(run(bare_nav, "ht")) == base


def test_dates_inside_sentences_are_localized(bare_nav):
    leo = lambda lang: run(bare_nav, lang, [PlanChild(age=3, name="Leo")]).children[0]
    assert "1 de septiembre de 2027" in leo("es").eligibility[0].explanation
    assert "1ye septanm 2027" in leo("ht").eligibility[0].explanation
    maya = lambda lang: next(i for i in run(bare_nav, lang, [PlanChild(age=7)]).children[0].items if i.id == "magnet")
    assert "15 de enero de 2027" in maya("es").detail and "15 janvye 2027" in maya("ht").detail
    assert "January 15, 2027" in maya("en").detail


def test_transition_notes_use_the_childs_name_in_each_language(bare_nav):
    kids = [PlanChild(age=10, name="Sam")]
    assert "Sam pasa a la escuela intermedia" in run(bare_nav, "es", kids).children[0].transition_note
    assert "Sam ap monte nan lekòl entèmedyè" in run(bare_nav, "ht", kids).children[0].transition_note
    assert run(bare_nav, "ht", [PlanChild(age=10)]).children[0].transition_note.startswith("Timoun 1 ")
    assert run(bare_nav, "es", [PlanChild(age=10)]).children[0].transition_note.startswith("Niño 1 ")
    assert run(bare_nav, "en", [PlanChild(age=10)]).children[0].transition_note.startswith("Child 1 ")


def test_provenance_and_verification_survive_translation(bare_nav):
    for lang in ("es", "ht"):
        r = run(bare_nav, lang, [PlanChild(age=7)])
        magnet = next(i for i in r.children[0].items if i.id == "magnet")
        assert magnet.field.status == "curated" and "single_secondary_source" in magnet.field.method and magnet.field.url
        assert any("unconfirmed" in (k.field.method or "") for k in r.key_dates)  # the "not confirmed" level still travels with the date


def test_scholarship_guide_is_localized_but_still_matches_english_flags(rich):
    nav, picks, _ = rich
    p = picks["private"]
    en = plan(nav, PlanRequest(lat=p["lat"], lon=p["lon"], children=[PlanChild(age=7)], lang="en"), today=TODAY)
    for lang, name in (("es", "FES Habilidades Únicas (FES-UA)"), ("ht", "FES Kapasite Inik (FES-UA)")):
        r = plan(nav, PlanRequest(lat=p["lat"], lon=p["lon"], children=[PlanChild(age=7)], lang=lang), today=TODAY)
        assert name in [g.program for g in r.scholarship_guide]
        assert [g.schools_nearby for g in r.scholarship_guide] == [g.schools_nearby for g in en.scholarship_guide]
        assert [g.flag_labels for g in r.scholarship_guide] == [g.flag_labels for g in en.scholarship_guide]


def test_missing_translation_falls_back_to_english_instead_of_failing(bare_nav):
    r = bare_nav.rules["rules"][0]
    saved = r.pop("i18n")
    try:
        assert bare_nav.rule_text(r["id"], "es") == r["text"]
    finally:
        r["i18n"] = saved


# ----------------------------------------------------------------------------------------------------------- the API
def test_endpoint_language_parameter(bare_nav):
    with TestClient(app) as c:
        app.state.nav = bare_nav
        body = {"lat": LAT, "lon": LON, "children": [{"age": 3, "name": "Leo"}]}
        assert c.post("/api/plan", json=body).json()["lang"] == "en"
        es = c.post("/api/plan", json={**body, "lang": "es"}).json()
        assert es["lang"] == "es" and es["children"][0]["entering"] == "VPK (Pre-K 4)" and "Cumple 4 años" in es["children"][0]["eligibility"][0]["explanation"]
        ht = c.post("/api/plan", json={**body, "lang": "ht"}).json()
        assert ht["lang"] == "ht" and "Li fè 4 an" in ht["children"][0]["eligibility"][0]["explanation"]
        assert c.post("/api/plan", json={**body, "lang": "fr"}).status_code == 422
        assert [k["label"] for k in es["key_dates"]][0].startswith("Abren las solicitudes magnet")


def test_dates_endpoint_stays_english_by_default(bare_nav):
    with TestClient(app) as c:
        app.state.nav = bare_nav
        assert c.get("/api/dates").json()["dates"][0]["label"] == "Magnet applications open (2027-28)"
