"""The match score: what a family values most, school popularity (how full it is), and distance no longer deciding everything."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import schools as sc
from tests.conftest import WYNWOOD

LAT, LON = WYNWOOD


def place(**kw):
    base = {"id": "x", "kind": "public", "name": "Test Elementary", "state_grade": None, "state_grade_year": None, "themes": [], "scholarships": None,
            "enrollment": None, "capacity": None}
    return {**base, **kw}


def points(factors, name):
    f = next(x for x in factors if x.factor == name)
    return f.points, f.max_points


def test_distance_carries_less_than_before():
    assert sc.W_DISTANCE == 15 and sc.W_DISTANCE < sc.W_GRADE


def test_popularity_is_how_full_the_school_is():
    _, full, _ = sc.score(place(enrollment=900, capacity=900), 1, 3, None, False, [], False)
    _, half, _ = sc.score(place(enrollment=450, capacity=900), 1, 3, None, False, [], False)
    assert points(full, "popularity") == (sc.W_POPULARITY, sc.W_POPULARITY)
    assert points(half, "popularity")[0] == 0
    _, mid, _ = sc.score(place(enrollment=675, capacity=900), 1, 3, None, False, [], False)
    assert points(mid, "popularity")[0] == pytest.approx(sc.W_POPULARITY / 2, abs=0.1)


def test_missing_numbers_count_as_neutral_not_zero_and_not_hidden():
    _, factors, _ = sc.score(place(enrollment=None, capacity=900), 1, 3, None, False, [], False)
    assert points(factors, "popularity") == (sc.W_POPULARITY / 2, sc.W_POPULARITY)  # visible in the breakdown, at half


def test_a_school_with_no_data_cannot_beat_a_known_good_one_on_distance_alone():
    unknown = place(kind="early_learning")  # no state grade exists for this kind, no enrollment numbers
    good = place(state_grade="A", state_grade_year=2026, enrollment=900, capacity=900)
    pts_unknown, *_ = sc.score(unknown, 0.1, 3, None, False, [], False)
    pts_good, *_ = sc.score(good, 1.5, 3, None, False, [], False)
    assert pts_good > pts_unknown


def test_values_make_those_factors_count_more():
    p = place(state_grade="A", state_grade_year=2026, enrollment=900, capacity=900)
    _, plain, _ = sc.score(p, 1, 3, None, False, [], False)
    _, academics, _ = sc.score(p, 1, 3, None, False, [], False, ["academics"])
    _, popular, _ = sc.score(p, 1, 3, None, False, [], False, ["popularity"])
    assert points(academics, "state_grade")[1] == sc.W_GRADE * 2.5 > points(plain, "state_grade")[1]
    assert points(popular, "popularity")[1] == sc.W_POPULARITY * 3 > points(plain, "popularity")[1]
    assert points(academics, "popularity") == points(plain, "popularity")  # only what was named changes


def test_a_stronger_school_farther_away_can_outrank_the_closest_one():
    close = place(id="close", state_grade="C", state_grade_year=2026)
    far = place(id="far", state_grade="A", state_grade_year=2026)
    pts_close, *_ = sc.score(close, 0.3, 3, None, False, [], False, ["academics"])
    pts_far, *_ = sc.score(far, 2.4, 3, None, False, [], False, ["academics"])
    assert pts_far > pts_close
    # and with nothing valued in particular, the A school is still not buried by its distance
    plain_close, *_ = sc.score(close, 0.3, 3, None, False, [], False)
    plain_far, *_ = sc.score(far, 2.4, 3, None, False, [], False)
    assert plain_far >= plain_close - 10


def test_proximity_value_favours_the_nearest():
    near = place(id="near", state_grade="C", state_grade_year=2026)
    far = place(id="far", state_grade="A", state_grade_year=2026)
    a, *_ = sc.score(near, 0.2, 3, None, False, [], False, ["proximity"])
    b, *_ = sc.score(far, 2.8, 3, None, False, [], False, ["proximity"])
    assert a > b


@pytest.fixture(scope="module")
def client(bare_nav):
    with TestClient(app) as c:
        app.state.nav = bare_nav
        yield c


def test_api_accepts_values_and_reports_them(client):
    j = client.get("/api/schools", params={"lat": LAT, "lon": LON, "radius_mi": 5, "values": "academics,popularity"}).json()
    assert j["meta"]["filters_applied"]["values"] == ["academics", "popularity"]
    assert any("popularity" in " ".join(n.lower() for n in j["meta"]["notes"]) for _ in [0])
    popular = [s for s in j["results"] if any(f["factor"] == "popularity" for f in s["score_breakdown"])]
    assert popular, "public schools with enrollment and capacity get a popularity factor"
    for s in j["results"]:
        earned = sum(f["points"] for f in s["score_breakdown"])
        possible = sum(f["max_points"] for f in s["score_breakdown"])
        assert s["match_score"] == round(100 * earned / possible)


def test_api_rejects_an_unknown_value_in_the_request_language(client):
    r = client.get("/api/schools", params={"lat": LAT, "lon": LON, "values": "luck"}, headers={"X-Lang": "es"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_values"
    assert "luck" in r.json()["error"]["message"] and "Elija entre" in r.json()["error"]["suggested_action"]


def test_default_search_is_unchanged_in_shape(client):
    j = client.get("/api/schools", params={"lat": LAT, "lon": LON}).json()
    assert j["meta"]["filters_applied"]["values"] == []
