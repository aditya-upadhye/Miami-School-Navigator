"""Choice planner: eligibility on the September 1 cut-off, transition years, deadline statuses, and honesty about estimates."""
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas import PlanChild, PlanRequest
from app.services.errors import ApiError
from app.services.plan import age_on, first_year_at_age, plan
from tests.conftest import WYNWOOD, assert_fields

LAT, LON = WYNWOOD
TODAY = date(2026, 10, 16)
CUTOFF = date(2027, 9, 1)


def run(nav, *children, today=TODAY, free_only=False):
    return plan(nav, PlanRequest(lat=LAT, lon=LON, children=list(children), free_only=free_only), today=today)


def child(nav, **kw):
    return run(nav, PlanChild(age=kw.pop("age", 5), **kw)).children[0]


def titles(c):
    return [i.title for i in c.items]


def test_age_on():
    assert age_on(date(2023, 9, 1), CUTOFF) == 4          # turns 4 on the cut-off itself
    assert age_on(date(2023, 9, 2), CUTOFF) == 3          # one day too late
    assert age_on(date(2020, 2, 29), date(2021, 2, 28)) == 0 and age_on(date(2020, 2, 29), date(2021, 3, 1)) == 1


def test_vpk_boundary_is_exact_with_a_birth_date(bare_nav):
    on = child(bare_nav, birth_date=date(2023, 9, 1))
    assert on.age_at_cutoff == 4 and on.eligibility[0].result == "eligible" and on.eligibility[0].exact and on.entering == "VPK (Pre-K 4)"
    late = child(bare_nav, birth_date=date(2023, 9, 2))
    assert late.age_at_cutoff == 3 and late.eligibility[0].result == "later" and late.eligibility[0].year == "2028-29"
    old = child(bare_nav, birth_date=date(2022, 9, 1))     # 5 on the cut-off: kindergarten, past VPK
    assert old.eligibility[0].result == "not_eligible" and old.entering == "Kindergarten"
    assert [e for e in old.eligibility if e.key == "kindergarten"][0].result == "eligible"
    just_missed = child(bare_nav, birth_date=date(2022, 9, 2))  # 4 on the cut-off: VPK again, kindergarten next year
    assert just_missed.eligibility[0].result == "eligible"
    assert [e for e in just_missed.eligibility if e.key == "kindergarten"][0].year == "2028-29"


def test_estimates_from_age_are_labelled_and_not_exact(bare_nav):
    c = child(bare_nav, age=3)
    assert c.age_basis == "estimated_from_age" and c.age_at_cutoff == 4 and not any(e.exact for e in c.eligibility)
    assert all("estimate" in e.explanation for e in c.eligibility)
    r = run(bare_nav, PlanChild(age=3), PlanChild(age=3, birth_date=date(2023, 3, 3)))
    assert any("birth date" in n for n in r.notes)
    assert "estimate" not in " ".join(e.explanation for e in r.children[1].eligibility)


def test_first_year_at_age():
    assert first_year_at_age(date(2024, 5, 3), 2, CUTOFF, 4) == "2028-29"
    assert first_year_at_age(None, 2, CUTOFF, 4) == "2028-29"  # age 2 now -> 3 at the cut-off -> 4 a year later
    assert first_year_at_age(date(2022, 9, 2), 4, CUTOFF, 5) == "2028-29"


@pytest.mark.parametrize("age_now,entering,transition", [(10, "Grade 6", "middle school"), (13, "Grade 9", "high school"), (4, "Kindergarten", "kindergarten")])
def test_transition_years_are_flagged(bare_nav, age_now, entering, transition):
    c = child(bare_nav, age=age_now, name="Sam")
    assert c.entering == entering and c.transition_note and transition in c.transition_note and "Sam" in c.transition_note


def test_ordinary_year_has_no_transition_note_and_past_12th_has_no_steps(bare_nav):
    assert child(bare_nav, age=7).transition_note is None
    done = child(bare_nav, age=18)
    assert done.stage == "past" and done.items == [] and done.entering.startswith("Past 12th")


def test_zoned_school_is_the_right_level(bare_nav):
    elem, mid, high = (child(bare_nav, age=a) for a in (7, 11, 15))
    assert elem.zoned.school_name.startswith("Paul Laurence Dunbar") and "elementary" in elem.items[0].title
    assert mid.zoned.school_name == "Jose De Diego Middle" and high.zoned.school_name.startswith("Booker T. Washington")
    assert elem.zoned.field.status == "official"


@pytest.mark.parametrize("today,status", [(date(2026, 9, 1), "upcoming"), (date(2026, 10, 16), "open"), (date(2026, 12, 20), "closes_soon"),
                                          (date(2027, 1, 15), "closes_soon"), (date(2027, 2, 1), "closed")])
def test_magnet_deadline_status_follows_the_calendar(bare_nav, today, status):
    c = run(bare_nav, PlanChild(age=7), today=today).children[0]
    magnet = next(i for i in c.items if i.id == "magnet")
    assert magnet.status == status and magnet.deadline.date == "2027-01-15"
    assert magnet.deadline.days_until == (date(2027, 1, 15) - today).days


def test_magnet_item_carries_the_caveats(bare_nav):
    magnet = next(i for i in child(bare_nav, age=7).items if i.id == "magnet")
    assert "own application" in magnet.detail and "dadeschools.net" in magnet.detail
    assert set(magnet.rule_ids) >= {"magnet_window", "magnet_zoned_must_apply", "magnet_how_to_apply"}
    assert magnet.field.status == "curated" and "single_secondary_source" in magnet.field.method
    res = next(i for i in child(bare_nav, age=7).items if i.id == "magnet-results")
    assert "unconfirmed_project_spec" in res.field.method


def test_vpk_item_and_free_only(bare_nav):
    c = run(bare_nav, PlanChild(age=3)).children[0]
    vpk = next(i for i in c.items if i.id == "vpk-apply")
    assert vpk.deadline.date == "2027-01-15" and "first-come" in vpk.detail and vpk.field.method.endswith("confirmed_district_source")
    school = run(bare_nav, PlanChild(age=7)).children[0]
    assert "private" in " ".join(titles(school)).lower()
    assert "private" not in " ".join(titles(run(bare_nav, PlanChild(age=7), free_only=True).children[0])).lower()


def test_infant_plan_counts_providers_with_provenance(bare_nav):
    c = child(bare_nav, age=1)
    care = next(i for i in c.items if i.id == "find-care")
    assert care.field.status == "derived" and care.field.value > 0 and "license" in care.detail
    assert next(i for i in c.items if i.id == "plan-vpk").title == "Plan for free VPK in 2029-30"


def test_every_field_has_a_source_and_date(bare_nav):
    r = run(bare_nav, PlanChild(age=3, name="Leo"), PlanChild(age=7), PlanChild(age=1))
    assert_fields(r.model_dump(mode="json"))


def test_validation(bare_nav):
    with pytest.raises(ApiError) as e:
        child(bare_nav, birth_date=date(2027, 1, 1))
    assert e.value.code == "birth_date_in_future"
    with pytest.raises(ApiError) as e2:
        plan(bare_nav, PlanRequest(lat=40.7, lon=-74.0, children=[PlanChild(age=5)]), today=TODAY)
    assert e2.value.code == "outside_county"


def test_scholarship_guide_counts_nearby_schools_that_list_each_program(rich):
    nav, picks, _ = rich
    p = picks["private"]
    r = plan(nav, PlanRequest(lat=p["lat"], lon=p["lon"], children=[PlanChild(age=7)]), today=TODAY)
    guide = {g.id: g for g in r.scholarship_guide}
    assert set(guide) == {"scholarship_fes_eo_ftc", "scholarship_fes_ua", "scholarship_pep"}
    assert guide["scholarship_fes_eo_ftc"].schools_nearby >= 1 and guide["scholarship_pep"].schools_nearby == 0
    assert guide["scholarship_fes_ua"].summary.status == "curated" and "single_secondary_source" in guide["scholarship_fes_ua"].summary.method
    assert r.scholarship_intro and "unconfirmed" in r.scholarship_intro.method


def test_endpoint(bare_nav):
    with TestClient(app) as c:
        app.state.nav = bare_nav
        r = c.post("/api/plan", json={"lat": LAT, "lon": LON, "children": [{"age": 3, "name": "Leo"}, {"age": 7, "birth_date": "2019-04-02"}]})
        assert r.status_code == 200
        j = r.json()
        assert j["school_year"] == "2027-28" and j["cutoff_date"] == "2027-09-01" and len(j["children"]) == 2
        assert j["children"][1]["age_basis"] == "birth_date" and j["key_dates"] and j["scholarship_guide"]
        assert c.post("/api/plan", json={"lat": LAT, "lon": LON, "children": []}).status_code == 422
        assert c.post("/api/plan", json={"lat": LAT, "lon": LON, "children": [{"age": 5, "birth_date": "2999-01-01"}]}).json()["error"]["code"] == "birth_date_in_future"


def test_school_age_children_have_no_vpk_row_but_kindergarten_age_does(bare_nav):
    assert child(bare_nav, age=7).eligibility == []                       # a 7-year-old does not need VPK status
    five = child(bare_nav, birth_date=date(2022, 9, 1))                   # 5 on the cut-off: kindergarten year, past VPK
    assert [e.key for e in five.eligibility] == ["vpk", "kindergarten"] and five.eligibility[0].result == "not_eligible"
