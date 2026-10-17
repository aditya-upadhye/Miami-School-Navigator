"""The REST contract against a real database. Every response is walked to prove each Field has status, source and as_of."""
import re

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.context import load_navigator
from tests.conftest import WYNWOOD, assert_fields

LAT, LON = WYNWOOD


@pytest.fixture(scope="module")
def client(bare_nav):
    with TestClient(app) as c:
        app.state.nav = bare_nav  # use the snapshot-built test database
        yield c


@pytest.fixture(scope="module")
def rclient(rich_nav):
    with TestClient(app) as c:
        app.state.nav = rich_nav
        yield c


def test_health(client):
    assert client.get("/api/health").json()["database"] is True


def test_zones_for_wynwood(client):
    j = client.get("/api/zones", params={"lat": LAT, "lon": LON}).json()
    assert [e["school_name"] for e in j["elementary"]] == ["Paul Laurence Dunbar K-8 Center"]
    assert j["middle"] and j["high"] and j["elementary"][0]["place_id"].startswith("pub-")
    assert_fields(j)


def test_zones_outside_county_rejected(client):
    r = client.get("/api/zones", params={"lat": 40.7, "lon": -74.0})
    assert r.status_code == 422 and r.json()["error"]["code"] == "outside_county"


def test_search_shape_and_provenance(client):
    r = client.get("/api/schools", params={"lat": LAT, "lon": LON, "stage": "pre_k,elementary", "free_only": True, "priorities": "STEM", "limit": 10})
    assert r.status_code == 200
    j = r.json()
    assert_fields(j)
    assert j["results"][0]["zoned"]["value"] == {"zoned": True, "level": "elementary"}  # zoned school ranks first
    assert all(s["kind"] in ("public", "charter") for s in j["results"])  # free_only
    assert j["meta"]["excluded"]["free_only"] > 0
    assert 0 <= j["results"][0]["match_score"] <= 100


def test_score_is_auditable(client):
    j = client.get("/api/schools", params={"lat": LAT, "lon": LON, "radius_mi": 2, "limit": 5}).json()
    for s in j["results"]:
        earned = sum(f["points"] for f in s["score_breakdown"])
        possible = sum(f["max_points"] for f in s["score_breakdown"])
        assert s["match_score"] == round(100 * earned / possible) and s["reasons"]


def test_no_state_grade_means_not_available_not_guessed(client):
    j = client.get("/api/schools", params={"lat": LAT, "lon": LON, "kinds": "public"}).json()
    sg = j["results"][0]["state_grade"]
    assert sg["status"] == "not_available" and sg["value"] is None and "FLDOE" in sg["suggested_action"] + sg["why"] + sg["source"]


def test_private_tuition_is_never_invented(client):
    j = client.get("/api/schools", params={"lat": LAT, "lon": LON, "kinds": "private", "radius_mi": 3}).json()
    assert j["results"]
    for s in j["results"]:
        assert s["tuition"]["status"] == "not_available" and s["tuition"]["value"] is None
        assert "Ask the school" in s["tuition"]["suggested_action"]
        assert s["aftercare"]["status"] == "not_available"
    pub = client.get("/api/schools", params={"lat": LAT, "lon": LON, "kinds": "public"}).json()["results"][0]
    assert pub["tuition"]["value"] == 0 and pub["tuition"]["status"] == "derived"


def test_filters(client):
    base = dict(lat=LAT, lon=LON, radius_mi=3, limit=100)
    assert client.get("/api/schools", params={**base, "kinds": "early_learning"}).json()["meta"]["total_matching"] > 0
    j = client.get("/api/schools", params={**base, "stage": "high", "sort": "distance"}).json()
    campus = [s for s in j["results"] if "online_school" not in s["flags"]]
    ds = [s["distance_mi"]["value"] for s in campus]
    assert ds == sorted(ds) and all("high" in s["stages"]["value"] for s in j["results"])
    assert [s["id"] for s in j["results"][: len(campus)]] == [s["id"] for s in campus]  # online schools come after every campus
    g = client.get("/api/schools", params={**base, "grade_min": "B"}).json()
    assert g["meta"]["total_matching"] == 0 and any("grade" in n.lower() for n in g["meta"]["notes"])  # no FLDOE data loaded
    assert client.get("/api/schools", params={**base, "grade_min": "Z"}).status_code == 422
    assert client.get("/api/schools", params={**base, "stage": "college"}).status_code == 422
    assert client.get("/api/schools", params={**base, "sort": "vibes"}).status_code == 422


def test_ese_filter_is_honest(client):
    j = client.get("/api/schools", params={"lat": LAT, "lon": LON, "radius_mi": 6, "ese": True, "limit": 50}).json()
    assert any("ask schools directly" in n.lower() for n in j["meta"]["notes"])
    assert all(s["ese"]["status"] != "not_available" for s in j["results"])


def test_detail_and_questions(client):
    pid = client.get("/api/zones", params={"lat": LAT, "lon": LON}).json()["elementary"][0]["place_id"]
    j = client.get(f"/api/schools/{pid}", params={"lat": LAT, "lon": LON}).json()
    assert_fields(j)
    assert j["school"]["name"].startswith("Paul Laurence Dunbar") and j["questions_to_ask"] and j["links"]["data_source"]
    assert {s["rule_id"] for s in j["how_to_apply"]} >= {"magnet_window", "magnet_zoned_must_apply", "magnet_how_to_apply"}
    assert j["school"]["is_magnet"]["status"] == "not_available" and any("magnet" in n.lower() for n in j["notes"])
    assert j["nearby_parks"] and j["nearby_parks"][0]["distance_mi"]["status"] == "derived"
    assert client.get("/api/schools/pub-nope").status_code == 404


def test_early_learning_detail_has_license_and_vpk(client):
    j = client.get("/api/schools", params={"lat": LAT, "lon": LON, "kinds": "early_learning", "limit": 1}).json()["results"][0]
    d = client.get(f"/api/schools/{j['id']}").json()
    assert_fields(d)
    assert {s["rule_id"] for s in d["how_to_apply"]} >= {"vpk_age"}
    assert "Which ages" in " ".join(d["questions_to_ask"])


def test_compare_best_only_on_numeric_official(rclient, rich):
    _, picks, _ = rich
    ids = [p["id"] for p in picks["elem"][:3]]
    j = rclient.post("/api/compare", json={"ids": ids, "lat": LAT, "lon": LON}).json()
    assert_fields(j)
    rows = {r["key"]: r for r in j["rows"]}
    assert rows["gains_ela"]["best_index"] == 2 and rows["gains_math"]["best_index"] == 2  # test data rises with index
    assert all(r["best_index"] is None for k, r in rows.items() if k not in ("gains_ela", "gains_math"))
    assert rows["state_grade"]["cells"][0]["value"] == "A"


def test_compare_validation(client):
    assert client.post("/api/compare", json={"ids": ["a", "b", "c", "d"]}).status_code == 422
    assert client.post("/api/compare", json={"ids": ["pub-nope"]}).status_code == 404


def test_pathway_ranks_real_schools_within_radius(client):
    j = client.post("/api/pathway", json={"lat": LAT, "lon": LON, "radius_mi": 3, "children": [{"age": 3, "name": "Leo"}, {"age": 7, "name": "Maya"}]}).json()
    assert_fields(j)
    leo, maya = j["children"]
    assert leo["current_stage"] == "pre_k" and maya["current_stage"] == "elementary" and maya["grade_label"] == "Grade 2"
    for st in maya["stages"]:
        assert st["estimate_note"] is None  # nothing is estimated any more
        scores = [o["match_score"] for o in st["options"]]
        assert scores == sorted(scores, reverse=True) and len(scores) <= 3
        for o in st["options"]:
            assert o["place_id"] and o["label"]["value"] <= 3
    assert next(s for s in maya["stages"] if s["stage"] == "elementary")["options"]
    assert next(s for s in maya["stages"] if s["stage"] == "infant_toddler")["status"] == "past"
    free = client.post("/api/pathway", json={"lat": LAT, "lon": LON, "children": [{"age": 1}], "free_only": True}).json()
    assert next(s for s in free["children"][0]["stages"] if s["stage"] == "infant_toddler")["options"] == []
    assert client.post("/api/pathway", json={"lat": LAT, "lon": LON, "radius_mi": 99, "children": [{"age": 1}]}).status_code == 422


def test_dates_carry_verification(client):
    j = client.get("/api/dates").json()
    assert_fields(j)
    ids = {d["id"]: d for d in j["dates"]}
    assert ids["magnet_closes"]["date"] == "2027-01-15" and "single_secondary_source" in ids["magnet_closes"]["field"]["method"]
    assert ids["magnet_results"]["approximate"] is True and j["notes"]


def test_quality_endpoint(client):
    j = client.get("/api/meta/quality").json()
    assert j["zone_self_check"]["pct"] >= 95 and j["datasets"] and j["places_by_kind"]["public"] > 300
    assert any("FLDOE" in n for n in j["notes"])
    assert all(d["retrieved_at"] for d in j["datasets"])


def test_no_email_fields_anywhere(client):
    j = client.get("/api/schools", params={"lat": LAT, "lon": LON, "radius_mi": 5, "limit": 100}).text.lower()
    assert '"email"' not in j and not re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", j)


def test_error_shape_and_cache_header(client):
    r = client.get("/api/geocode", params={"q": "ab"})
    assert r.status_code == 422 and set(r.json()["error"]) == {"code", "message", "suggested_action"}
    ok = client.get("/api/dates")
    assert ok.headers["cache-control"] == "private, max-age=300"
    assert client.get("/api/zones").json()["error"]["code"] == "invalid_request"


def test_openapi_documents_contract(client):
    spec = client.get("/openapi.json").json()
    paths = set(spec["paths"])
    assert {"/api/geocode", "/api/zones", "/api/zones/geojson", "/api/schools", "/api/schools/{school_id}", "/api/compare", "/api/pathway", "/api/dates",
            "/api/chat", "/api/meta/quality"} <= paths


def test_search_by_name(client):
    j = client.get("/api/schools", params={"lat": LAT, "lon": LON, "radius_mi": 25, "q": "Cushman", "kinds": "private"}).json()
    assert [s["name"] for s in j["results"]] == ["The Cushman School"]
    assert j["results"][0]["tuition"]["status"] == "not_available"  # the 'tuition at <private school>' golden case
    assert j["meta"]["filters_applied"]["q"] == "Cushman" and j["meta"]["excluded"]["name"] > 0


def test_zone_geojson_contains_the_point_and_carries_provenance(client):
    from shapely.geometry import Point, shape

    r = client.get("/api/zones/geojson", params={"lat": LAT, "lon": LON})
    assert r.status_code == 200
    j = r.json()
    assert j["type"] == "FeatureCollection" and {f["properties"]["level"] for f in j["features"]} == {"elementary", "middle", "high"}
    for f in j["features"]:
        g = shape(f["geometry"])
        assert f["geometry"]["type"] in ("Polygon", "MultiPolygon") and g.is_valid and g.buffer(0.0003).contains(Point(LON, LAT))
        p = f["properties"]
        assert p["school_name"] and p["source"] and p["as_of"] and p["url"] and "simplified" in p["method"]
    elem = next(f for f in j["features"] if f["properties"]["level"] == "elementary")
    assert elem["properties"]["school_name"].startswith("Paul Laurence Dunbar") and elem["properties"]["place_id"].startswith("pub-")
    assert len(r.text) < 150_000  # simplified: small enough to fetch on every address change


def test_zone_geojson_agrees_with_zones_endpoint(client):
    names = {lv: [e["school_name"] for e in client.get("/api/zones", params={"lat": LAT, "lon": LON}).json()[lv]] for lv in ("elementary", "middle", "high")}
    feats = client.get("/api/zones/geojson", params={"lat": LAT, "lon": LON}).json()["features"]
    for lv, expected in names.items():
        assert sorted(f["properties"]["school_name"] for f in feats if f["properties"]["level"] == lv) == sorted(expected)


def test_zone_geojson_outside_county_rejected(client):
    r = client.get("/api/zones/geojson", params={"lat": 40.7, "lon": -74.0})
    assert r.status_code == 422 and r.json()["error"]["code"] == "outside_county"


def test_online_schools_are_flagged_and_never_ranked_closest(rclient, rich_nav):
    j = rclient.get("/api/schools", params={"lat": 25.7889, "lon": -80.1908, "radius_mi": 5, "kinds": "public", "stage": "high", "sort": "distance", "limit": 50}).json()
    names = [s["name"] for s in j["results"]]
    online = [s for s in j["results"] if "online_school" in s["flags"]]
    assert online and all(("online" in s["name"].lower() or "virtual" in s["name"].lower()) for s in online)
    first_online = min(names.index(s["name"]) for s in online)
    assert all("online_school" in s["flags"] for s in j["results"][first_online:])  # online schools sort after every campus
    assert "office address" in online[0]["distance_mi"]["method"]
    assert not any(f["factor"] == "distance" for f in online[0]["score_breakdown"]) and "Online school: distance does not apply" in online[0]["reasons"]


def test_search_reports_which_optional_data_is_loaded(client, rclient, bare_nav, rich_nav):
    # both clients share one app, so point it at each database explicitly
    app.state.nav = bare_nav
    bare = client.get("/api/schools", params={"lat": LAT, "lon": LON, "limit": 1}).json()["meta"]["data_available"]
    assert bare["state_grades"] is False and bare["magnet_themes"] is False and bare["scholarship_flags"] is False
    app.state.nav = rich_nav
    rich = client.get("/api/schools", params={"lat": LAT, "lon": LON, "limit": 1}).json()["meta"]["data_available"]
    assert rich["state_grades"] and rich["learning_gains"] and rich["scholarship_flags"] and rich["magnet_themes"]


def test_compare_returns_score_breakdown_that_matches_search(client):
    top = client.get("/api/schools", params={"lat": LAT, "lon": LON, "radius_mi": 3, "sort": "match", "limit": 2}).json()["results"]
    ids = [r["id"] for r in top]
    j = client.post("/api/compare", json={"ids": ids, "lat": LAT, "lon": LON, "radius_mi": 3}).json()
    assert [s["id"] for s in j["scores"]] == ids
    for r, sc in zip(top, j["scores"]):
        assert sc["match_score"] == r["match_score"] and sc["breakdown"] and all(f["points"] <= f["max_points"] for f in sc["breakdown"])
    assert client.post("/api/compare", json={"ids": ids}).json()["scores"] == []  # no location, no distance, no score


def test_outcomes_shape_and_percentages(client):
    from app.services import outcomes as svc
    fl, fed, alumni = svc._data()
    if not fl:
        import pytest
        pytest.skip("outcome files not built (run scripts/fetch_*.py)")
    pid = next(p for p, years in fl.items() if len(years) >= 3)
    j = client.get(f"/api/schools/{pid}/outcomes").json()
    assert j["place_id"] == pid and j["college"] and j["sources"][0]["key"] == "fldoe"
    years = [c["year"] for c in j["college"]]
    assert years == sorted(years)
    for c in j["college"]:
        for k in ("enrolled_pct", "florida_college_pct", "state_university_pct", "private_college_pct", "employed_pct"):
            assert c[k] is None or 0 <= c[k] <= 100
    assert all(len(j["alumni"]) <= 12 for _ in [0])


def test_outcomes_unknown_school_and_school_without_data(client):
    assert client.get("/api/schools/pub-nope/outcomes").status_code == 404
    kinder = client.get("/api/schools", params={"lat": LAT, "lon": LON, "radius_mi": 3, "kinds": "early_learning", "limit": 1}).json()["results"][0]["id"]
    j = client.get(f"/api/schools/{kinder}/outcomes").json()
    assert j["college"] == [] and j["readiness"] == [] and j["alumni"] == [] and j["sources"] == []


def test_outcomes_cover_every_k12_kind_and_explain_gaps(client):
    from app.services import outcomes as svc
    fl, fed, _ = svc._data()
    if not fl:
        import pytest
        pytest.skip("outcome files not built")
    def first(kind, stage):
        return client.get("/api/schools", params={"lat": LAT, "lon": LON, "radius_mi": 25, "kinds": kind, "stages": stage, "limit": 100}).json()["results"]
    private = client.get(f"/api/schools/{first('private', 'elementary')[0]['id']}/outcomes").json()
    assert private["applies"] and private["empty_reason"] and "Private" in private["empty_reason"]
    elem = next(client.get(f"/api/schools/{r['id']}/outcomes").json() for r in first("public", "elementary") if not {"middle", "high"} & set(r["stages"]["value"]))
    assert elem["applies"] and elem["college"] == [] and elem["readiness"] == [] and elem["empty_reason"]
    mid = [client.get(f"/api/schools/{r['id']}/outcomes").json() for r in first("public", "middle") if "high" not in r["stages"]["value"]]
    assert any(m["readiness"] and m["readiness"][-1]["metrics"][0]["metric"] == "algebra1" for m in mid)
    ecl = client.get(f"/api/schools/{first('early_learning', 'pre_k')[0]['id']}/outcomes").json()
    assert ecl["applies"] is False and ecl["empty_reason"] is None


def test_school_lookup_by_name(client):
    j = client.get("/api/schools/lookup", params={"q": "coral reef", "lat": LAT, "lon": LON}).json()
    assert j["total"] >= 1 and all("coral" in r["name"].lower() and "reef" in r["name"].lower() for r in j["results"])
    assert all(r["distance_mi"] is not None for r in j["results"])
    first = j["results"][0]
    assert client.get("/api/schools/lookup", params={"q": first["name"].upper()}).json()["results"][0]["id"] == first["id"]  # case-insensitive, exact name first
    assert client.get("/api/schools/lookup", params={"q": "zzzz-no-such-school"}).json() == {"results": [], "total": 0}
    assert client.get("/api/schools/lookup", params={"q": "  !!  "}).status_code == 422
