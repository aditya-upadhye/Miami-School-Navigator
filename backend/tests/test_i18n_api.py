"""Every sentence the API generates comes back in the family's language (X-Lang header or ?lang=), and the language never changes the logic.

The Spanish and Haitian Creole texts are AI-written and have NOT been reviewed by a native speaker; these tests prove they are complete,
keep every number and placeholder, and never leak English template text, not that they are good Spanish or Creole.
"""
import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.chat import agent
from app.chat.citations import CitationBook
from app.chat.tools import ToolBox
from app.i18n import LANGS, MESSAGES, current_lang, normalize_lang, placeholders, t, use_lang
from app.main import app
from app.schemas import ChatMessage, ChatProfile, ChatRequest
from tests.conftest import WYNWOOD
from tests.test_chat import FakeLlm, say, uses

LAT, LON = WYNWOOD
APP_DIR = Path(__file__).resolve().parent.parent / "app"
SAME_EVERYWHERE = {"entering.prek3", "entering.vpk"}  # product names (same exemption as test_i18n.py)
PROVENANCE_KEYS = {"source", "url", "method", "as_of", "identity_source"}


@pytest.fixture(scope="module")
def client(bare_nav):
    with TestClient(app) as c:
        app.state.nav = bare_nav
        yield c


@pytest.fixture(scope="module")
def rclient(rich_nav):
    with TestClient(app) as c:
        app.state.nav = rich_nav
        yield c


def hdr(lang):
    return {"X-Lang": lang}


def prose(obj):
    """The response without provenance (`source`, `url`, `method`, ... stay English on purpose), as text, for leak scans."""
    def strip(o):
        if isinstance(o, dict):
            return {k: strip(v) for k, v in o.items() if k not in PROVENANCE_KEYS}
        if isinstance(o, list):
            return [strip(v) for v in o]
        return o

    return json.dumps(strip(obj), ensure_ascii=False)


def assert_no_english(obj, fragments, where=""):
    text = prose(obj)
    leaked = [f for f in fragments if f.lower() in text.lower()]
    assert not leaked, f"{where}: English text leaked: {leaked}"


# English template fragments that must never show up in a Spanish or Haitian Creole response.
FRAGMENTS = [
    "Ask the school", "Ask the facility", "No county or state", "No public dataset", "The county listing", "in the county listing", "No website",
    "not been loaded", "could not be matched", "published no A-F", "Zoned elementary", "Zoned middle", "Zoned high", "mi away", "of 3 mi radius",
    "State grade", "Free-only", "Attendance boundaries", "Needs your location", "Provide lat/lon", "Pass lat/lon", "Compare 1 to 3",
    "Could not find a location", "Field required", "Not confirmed", "Estimated from overlapping", "Distance from your location",
    "Infant & toddler", "Ages 0-2", "Grades 6-8", "Specialty matching", "The ESE filter", "arrival and dismissal", "Can I tour",
    "outside Miami-Dade", "Enter a street address", "Specializes in", "Before & after care", "higher is better", "Zoned for your address",
    "Do you accept", "Do you offer", "Reports accepting", "Online school", "Magnet programs are", "Magnet status is only",
    "Private-school scholarships apply", "No action needed", "Some public/charter", "Some dates are", "'Best' is only",
    "We have not verified", "Try 3", "Use an id", "Unknown stage", "Use one of",
]


# ----------------------------------------------------------------------------------------------------------------- the catalog
def test_catalog_parity_every_key_has_three_real_translations():
    for key, row in MESSAGES.items():
        assert len(row) == 3 and all(isinstance(s, str) and s.strip() for s in row), key
        assert placeholders(row[0]) == placeholders(row[1]) == placeholders(row[2]), f"{key}: placeholders differ across languages"
        en, es, ht = row
        if len(en.split()) > 2 and key not in SAME_EVERYWHERE:
            assert es != en and ht != en, f"{key} looks untranslated"
            assert es != ht, f"{key}: es and ht identical"


def test_every_catalog_template_formats_with_its_own_placeholders():
    for key, row in MESSAGES.items():
        for lang, text in zip(LANGS, row):
            assert text.format(**{p: "X" for p in placeholders(text)}), (key, lang)


def test_new_api_keys_are_grouped_by_prefix():
    prefixes = {k.split(".")[0] for k in MESSAGES}
    assert {"na", "act", "score", "note", "q", "cmp", "path", "zone", "geo", "dates", "chat", "err", "val"} <= prefixes


def test_every_api_error_code_in_the_code_base_has_localized_message_and_action():
    """Scan app/ for ApiError raises (and the 503 / validation handlers): each code needs err.<key>.message and, where the English
    has a suggested action, err.<key>.action in all three languages."""
    src = "\n".join(p.read_text() for p in APP_DIR.rglob("*.py"))
    raises = re.findall(r'ApiError\(\s*\d+,\s*"(\w+)"([^)]*)\)', src)
    assert len(raises) >= 14
    for code, rest in raises:
        m = re.search(r'key="([\w.]+)"', rest)
        key = m.group(1) if m else code
        assert f"err.{key}.message" in MESSAGES, key
        assert f"err.{key}.action" in MESSAGES, key
    for key in ("data_unavailable", "invalid_request"):
        assert f"err.{key}.action" in MESSAGES


def test_unknown_language_and_header_forms_normalize():
    assert [normalize_lang(x) for x in (None, "", "fr", "ES", " ht ", "es-US", "ht-HT", "es,en;q=0.8", "xx")] == [
        "en", "en", "en", "es", "ht", "es", "ht", "es", "en"]
    assert t("child", n=1) == "Child 1"  # default = current request language = English outside a request
    with use_lang("es"):
        assert current_lang() == "es" and t("child", n=1) == "Niño 1"
        with use_lang("ht"):
            assert t("child", n=1) == "Timoun 1"
        assert t("child", n=1) == "Niño 1"
        with use_lang(None):
            assert current_lang() == "es"
    assert current_lang() == "en"


# ----------------------------------------------------------------------------------------------------------------- selecting the language
def zone_note(client, **kw):
    return client.get("/api/zones", params={"lat": LAT, "lon": LON, **kw.pop("params", {})}, **kw).json()["note"]


def test_header_selects_language_and_response_is_marked(client):
    en = client.get("/api/zones", params={"lat": LAT, "lon": LON})
    es = client.get("/api/zones", params={"lat": LAT, "lon": LON}, headers=hdr("es"))
    ht = client.get("/api/zones", params={"lat": LAT, "lon": LON}, headers=hdr("ht"))
    assert en.json()["note"].startswith("Attendance boundaries")
    assert es.json()["note"].startswith("Los límites de asistencia") and ht.json()["note"].startswith("Limit zòn lekòl")
    assert (en.headers["content-language"], es.headers["content-language"], ht.headers["content-language"]) == ("en", "es", "ht")
    assert "X-Lang" in es.headers["vary"]  # caches must not serve one language to another


def test_query_param_wins_over_header(client):
    assert zone_note(client, headers=hdr("es"), params={"lang": "ht"}).startswith("Limit zòn lekòl")
    assert zone_note(client, headers=hdr("ht"), params={"lang": "es"}).startswith("Los límites")
    assert zone_note(client, params={"lang": "es"}).startswith("Los límites")
    assert zone_note(client, headers=hdr("es"), params={"lang": "en"}).startswith("Attendance boundaries")


@pytest.mark.parametrize("value", ["fr", "", "xx", "123", "espanol"])
def test_unknown_language_is_english_never_an_error(client, value):
    assert zone_note(client, headers=hdr(value)).startswith("Attendance boundaries")
    r = client.get("/api/zones", params={"lat": LAT, "lon": LON, "lang": value})
    assert r.status_code == 200 and r.json()["note"].startswith("Attendance boundaries")


def test_header_is_case_and_region_tolerant(client):
    assert zone_note(client, headers=hdr("ES")).startswith("Los límites")
    assert zone_note(client, headers=hdr("ht-HT")).startswith("Limit zòn lekòl")


def test_language_does_not_leak_between_requests(client):
    es = zone_note(client, headers=hdr("es"))
    assert zone_note(client).startswith("Attendance boundaries") and zone_note(client, headers=hdr("es")) == es


def test_sync_endpoints_running_in_the_threadpool_see_the_language(client):
    # /api/dates and /api/schools are plain `def` endpoints: they run in anyio's worker threads
    d = client.get("/api/dates", headers=hdr("es")).json()
    assert d["dates"][0]["label"] != client.get("/api/dates").json()["dates"][0]["label"]
    assert "Algunas fechas" in " ".join(d["notes"]) or d["notes"] == []


def test_all_api_routes_get_the_language_including_post(client):
    r = client.post("/api/compare", json={"ids": ["pub-does-not-exist"]}, headers=hdr("es"))
    assert r.status_code == 404 and r.json()["error"]["message"] == t("err.school_not_found.message", "es", id="pub-does-not-exist")
    assert client.get("/api/health", headers=hdr("es")).headers["content-language"] == "es"


# ----------------------------------------------------------------------------------------------------------------- errors
def err(client, method, url, lang, **kw):
    r = getattr(client, method)(url, headers=hdr(lang), **kw)
    assert r.status_code >= 400
    e = r.json()["error"]
    assert set(e) == {"code", "message", "suggested_action"}
    return r.status_code, e


ERROR_CASES = [  # (method, url, kwargs, status, code)
    ("get", "/api/geocode", {"params": {"q": "x"}}, 422, "query_too_short"),
    ("get", "/api/geocode", {"params": {"q": "99999 Nowhere Boulevard zzz"}}, 404, "geocode_not_found"),
    ("get", "/api/zones", {"params": {"lat": 40.7, "lon": -74.0}}, 422, "outside_county"),
    ("get", "/api/zones/geojson", {"params": {"lat": 40.7, "lon": -74.0}}, 422, "outside_county"),
    ("get", "/api/schools/pub-does-not-exist", {}, 404, "school_not_found"),
    ("get", "/api/schools", {"params": {"lat": LAT, "lon": LON, "grade_min": "Z"}}, 422, "bad_grade"),
    ("get", "/api/schools", {"params": {"lat": LAT, "lon": LON, "stage": "kindergarten"}}, 422, "bad_stage"),
    ("get", "/api/schools", {"params": {"lat": LAT, "lon": LON, "sort": "cheapest"}}, 422, "bad_sort"),
    ("post", "/api/compare", {"json": {"ids": ["pub-does-not-exist"]}}, 404, "school_not_found"),
    ("post", "/api/plan", {"json": {"lat": LAT, "lon": LON, "children": [{"age": 5, "birth_date": "2999-01-01"}]}}, 422, "birth_date_in_future"),
]


@pytest.mark.parametrize("method,url,kw,status,code", ERROR_CASES)
def test_api_errors_are_localized_and_keep_code_and_status(client, method, url, kw, status, code):
    s_en, en = err(client, method, url, "en", **kw)
    assert (s_en, en["code"]) == (status, code)
    for lang in ("es", "ht"):
        s, e = err(client, method, url, lang, **kw)
        assert (s, e["code"]) == (status, code)
        assert e["message"] != en["message"] and e["suggested_action"] != en["suggested_action"], (code, lang)
        assert_no_english(e, FRAGMENTS, f"{code} {lang}")


def test_service_level_errors_that_fastapi_validation_pre_empts_are_localized(bare_nav):
    """bad_radius / bad_ids are validated by FastAPI first over HTTP (422 invalid_request); direct callers (and the chat tools) reach the
    service-level check, so those raise ApiError with the same localized text."""
    from app.services import compare as compare_svc
    from app.services import schools as schools_svc
    from app.services.errors import ApiError

    for lang in LANGS:
        with use_lang(lang):
            for call, code in ((lambda: schools_svc.search(bare_nav, lat=LAT, lon=LON, radius_mi=0), "bad_radius"),
                               (lambda: compare_svc.compare(bare_nav, []), "bad_ids")):
                with pytest.raises(ApiError) as exc:
                    call()
                m, a = exc.value.localized()
                assert exc.value.code == code and exc.value.message == t(f"err.{code}.message", "en")  # `.message` stays English
                assert (m, a) == (t(f"err.{code}.message", lang), t(f"err.{code}.action", lang))
                if lang != "en":
                    assert m != exc.value.message


def test_error_params_are_filled_in_every_language(client):
    for lang in ("en", "es", "ht"):
        _, e = err(client, "get", "/api/geocode", lang, params={"q": "99999 Nowhere Boulevard zzz"})
        assert "99999 Nowhere Boulevard zzz" in e["message"]  # the user's own query, verbatim
        _, e = err(client, "get", "/api/schools/pub-does-not-exist", lang)
        assert "pub-does-not-exist" in e["message"]
        _, e = err(client, "get", "/api/schools", lang, params={"lat": LAT, "lon": LON, "stage": "kindergarten"})
        assert "kindergarten" in e["message"] and "infant_toddler, pre_k, elementary, middle, high" in e["suggested_action"]


def test_english_errors_are_unchanged(client):
    _, e = err(client, "get", "/api/geocode", "en", params={"q": "99999 Nowhere Boulevard zzz"})
    assert e["message"] == "Could not find a location for '99999 Nowhere Boulevard zzz'."
    assert e["suggested_action"] == "Try a full street address with ZIP (e.g. '2250 NW 2nd Ave, Miami 33127') or just a 5-digit ZIP code."
    _, e = err(client, "get", "/api/zones", "en", params={"lat": 40.7, "lon": -74.0})
    assert (e["message"], e["suggested_action"]) == ("That location is outside Miami-Dade County.", "Enter an address in Miami-Dade County.")


def test_outside_county_geocode_variant_has_its_own_text(bare_nav, monkeypatch):
    from app.services import geocode as gc
    from app.services.errors import ApiError

    gc._CACHE.clear()
    for lang in LANGS:
        with use_lang(lang):
            e = ApiError(422, "outside_county", key="outside_county.address")
            m, a = e.localized()
        assert "outside_county.address" not in m
        if lang == "en":
            assert m == "That address is outside Miami-Dade County, which this service covers."
        else:
            assert m != "That address is outside Miami-Dade County, which this service covers."


def test_validation_errors_are_localized_by_type(client):
    cases = [
        ("get", "/api/zones", {"params": {"lat": "abc", "lon": LON}}, "float_parsing"),
        ("get", "/api/zones", {"params": {"lon": LON}}, "missing"),
        ("get", "/api/zones", {"params": {"lat": 95, "lon": LON}}, "le"),
        ("get", "/api/schools", {"params": {"lat": LAT, "lon": LON, "limit": "x"}}, "int_parsing"),
        ("post", "/api/plan", {"json": {"lat": LAT, "lon": LON, "children": []}}, "too_short"),
        ("post", "/api/plan", {"json": {"lat": LAT, "lon": LON, "lang": "fr", "children": [{"age": 3}]}}, "literal_error"),
        ("post", "/api/pathway", {"content": "not json", "headers": {"content-type": "application/json"}}, "json_invalid"),
    ]
    english_msgs = set()
    for method, url, kw, _typ in cases:
        extra = kw.pop("headers", {})
        r_en = getattr(client, method)(url, headers={**hdr("en"), **extra}, **kw)
        assert r_en.status_code == 422 and r_en.json()["error"]["code"] == "invalid_request"
        english_msgs.add(r_en.json()["error"]["message"])
        for lang in ("es", "ht"):
            r = getattr(client, method)(url, headers={**hdr(lang), **extra}, **kw)
            e = r.json()["error"]
            assert r.status_code == 422 and e["code"] == "invalid_request"
            assert e["message"] != r_en.json()["error"]["message"], (_typ, lang)
            assert e["suggested_action"] != "See /docs for parameters."
            assert_no_english(e, ["Input should", "Field required", "should have", "valid number", "See /docs", "unable to parse", "JSON decode"], _typ)
    assert any(m.endswith("Field required") for m in english_msgs)  # English keeps pydantic's own wording, byte for byte


def test_validation_message_keeps_the_field_path_and_the_limit(client):
    e = client.get("/api/zones", params={"lat": 95, "lon": LON}, headers=hdr("es")).json()["error"]
    assert e["message"].startswith("lat: ") and "90" in e["message"]
    e = client.get("/api/zones", params={"lat": 95, "lon": LON}, headers=hdr("ht")).json()["error"]
    assert e["message"].startswith("lat: ") and "90" in e["message"]


def test_http_errors_and_503_are_localized(client, bare_nav):
    import asyncio

    from fastapi import HTTPException

    from app.main import http_error

    def handled(status, detail, lang):
        with use_lang(lang):
            r = asyncio.run(http_error(None, HTTPException(status, detail)))
        return json.loads(r.body)["error"]

    assert handled(404, "Not Found", "es") == {"code": "http_error", "message": "No encontrado", "suggested_action": None}
    assert handled(404, "Not Found", "ht")["message"] == "Pa jwenn" and handled(404, "Not Found", "en")["message"] == "Not Found"
    assert handled(405, "Method Not Allowed", "es")["message"] == "Método no permitido"
    assert handled(404, "Custom detail written by a developer", "es")["message"] == "Custom detail written by a developer"  # only standard phrases
    assert handled(418, "I'm a teapot", "ht")["message"] == "I'm a teapot"
    app.state.nav = None
    try:
        out = {lang: client.get("/api/zones", params={"lat": LAT, "lon": LON}, headers=hdr(lang)) for lang in LANGS}
    finally:
        app.state.nav = bare_nav
    assert all(r.status_code == 503 and r.json()["error"]["code"] == "data_unavailable" for r in out.values())
    assert out["en"].json()["error"]["message"] == "The school database is not built yet."
    assert out["en"].json()["error"]["suggested_action"] == "Run `python -m app.ingest.build` on the server."
    for lang in ("es", "ht"):
        e = out[lang].json()["error"]
        assert e["message"] != out["en"].json()["error"]["message"] and "python -m app.ingest.build" in e["suggested_action"]


# ----------------------------------------------------------------------------------------------------------------- endpoints
def search(c, lang, **kw):
    params = {"lat": LAT, "lon": LON, "radius_mi": 3, "limit": 100, **kw}
    r = c.get("/api/schools", params=params, headers=hdr(lang))
    assert r.status_code == 200
    return r.json()


FILTERED = {"free_only": True, "grade_min": "B", "ese": True, "specialties": "STEM", "priorities": "STEM"}


def test_search_prose_is_translated_with_numbers_intact(rclient):
    en = search(rclient, "en", priorities="STEM")
    assert en["results"]
    for lang in ("es", "ht"):
        j = search(rclient, lang, priorities="STEM")
        assert len(j["results"]) == len(en["results"])
        for a, b in zip(en["results"], j["results"]):
            assert a["id"] == b["id"]
            for ra, rb in zip(a["reasons"], b["reasons"]):
                assert ra != rb, (lang, ra)
                assert re.findall(r"\d+(?:\.\d+)?", ra) == re.findall(r"\d+(?:\.\d+)?", rb), (ra, rb)  # distances and years survive
            for fa, fb in zip(a["score_breakdown"], b["score_breakdown"]):
                assert (fa["factor"], fa["points"], fa["max_points"]) == (fb["factor"], fb["points"], fb["max_points"])
                assert fa["detail"] != fb["detail"] and re.findall(r"\d+(?:\.\d+)?", fa["detail"]) == re.findall(r"\d+(?:\.\d+)?", fb["detail"])
        assert_no_english(j, FRAGMENTS, f"search {lang}")


def test_search_notes_are_translated(rclient):
    en = search(rclient, "en", **FILTERED)["meta"]["notes"]
    assert len(en) >= 4
    for lang in ("es", "ht"):
        j = search(rclient, lang, **FILTERED)
        assert len(j["meta"]["notes"]) == len(en) and all(a != b for a, b in zip(en, j["meta"]["notes"]))
        assert j["meta"]["zones"]["note"] != search(rclient, "en")["meta"]["zones"]["note"]
        assert_no_english(j, FRAGMENTS, f"filtered search {lang}")


def test_search_not_available_explanations_are_translated(client):
    j = search(client, "es", kinds="private,early_learning,charter,public")
    whys = {f["why"] for r in j["results"] for f in (r["state_grade"], r["tuition"], r["aftercare"], r["ese"], r["phone"], r["website"]) if f["status"] == "not_available"}
    assert len(whys) >= 5
    assert_no_english(j, FRAGMENTS, "search bare es")
    assert_no_english(search(client, "ht", kinds="private,early_learning,charter,public"), FRAGMENTS, "search bare ht")


def school_ids(c, kinds):
    return [r["id"] for r in search(c, "en", kinds=kinds, limit=40)["results"]]


@pytest.mark.parametrize("kind", ["public", "charter", "private", "early_learning"])
def test_detail_is_translated_for_every_kind(rclient, kind):
    ids = school_ids(rclient, kind)[:8]
    assert ids
    for lang in ("es", "ht"):
        for sid in ids:
            j = rclient.get(f"/api/schools/{sid}", params={"lat": LAT, "lon": LON}, headers=hdr(lang)).json()
            assert j["questions_to_ask"] and j["questions_to_ask"][-1] == t("q.tour", lang)
            assert_no_english(j, FRAGMENTS, f"detail {kind} {sid} {lang}")
            if j["how_to_apply"]:  # curated rule text comes from rules.json i18n
                en = rclient.get(f"/api/schools/{sid}", params={"lat": LAT, "lon": LON}).json()
                assert [a["rule_id"] for a in en["how_to_apply"]] == [a["rule_id"] for a in j["how_to_apply"]]
                assert all(a["text"] != b["text"] for a, b in zip(en["how_to_apply"], j["how_to_apply"]))


def test_detail_notes_are_translated(rclient):
    pub = [s for s in school_ids(rclient, "public")]
    notes = {}
    for lang in LANGS:
        for sid in pub:
            j = rclient.get(f"/api/schools/{sid}", headers=hdr(lang)).json()
            if j["notes"]:
                notes.setdefault(sid, {})[lang] = j["notes"]
    assert notes
    for by_lang in list(notes.values())[:5]:
        assert by_lang["es"] != by_lang["en"] and by_lang["ht"] != by_lang["en"]


def test_compare_is_translated(rclient):
    ids = school_ids(rclient, "public")[:2] + school_ids(rclient, "private")[:1]
    en = rclient.post("/api/compare", json={"ids": ids}).json()
    assert [r["label"] for r in en["rows"]][:3] == ["Type", "Grades", "Distance from your location"]
    for lang in ("es", "ht"):
        j = rclient.post("/api/compare", json={"ids": ids}, headers=hdr(lang)).json()
        assert [r["key"] for r in j["rows"]] == [r["key"] for r in en["rows"]]
        assert all(a["label"] != b["label"] for a, b in zip(en["rows"], j["rows"]))
        assert j["notes"] != en["notes"] and len(j["notes"]) == 2
        assert any("Necesita" in c["why"] or "Se necesita" in c["why"] or "Sa mande" in c["why"] for r in j["rows"] for c in r["cells"] if c["status"] == "not_available")
        assert_no_english(j, FRAGMENTS, f"compare {lang}")
    located = rclient.post("/api/compare", json={"ids": ids, "lat": LAT, "lon": LON}, headers=hdr("es")).json()
    assert len(located["notes"]) == 1
    best = [r for r in located["rows"] if r["best_index"] is not None]
    assert all(r["best_rule"] and r["best_rule"] != "higher is better (official numeric field)" for r in best)


def test_pathway_is_translated(client):
    body = {"lat": LAT, "lon": LON, "children": [{"age": 1}, {"age": 4}, {"age": 8}, {"age": 12}, {"age": 19}], "free_only": True}
    en = client.post("/api/pathway", json=body).json()
    assert en["children"][1]["grade_label"] == "VPK (Pre-K 4)" and en["children"][0]["stages"][0]["label"] == "Infant & toddler care"
    for lang in ("es", "ht"):
        j = client.post("/api/pathway", json=body, headers=hdr(lang)).json()
        assert [c["grade_label"] is None for c in j["children"]] == [c["grade_label"] is None for c in en["children"]]
        assert j["children"][3]["grade_label"] == t("entering.grade", lang, n=7)
        for ce, cj in zip(en["children"], j["children"]):
            for se, sj in zip(ce["stages"], cj["stages"]):
                assert (se["stage"], se["status"]) == (sj["stage"], sj["status"])
                assert se["label"] != sj["label"]
                assert (sj["ages"] != se["ages"]) or se["stage"] == "elementary"
                assert (se["estimate_note"] is None) == (sj["estimate_note"] is None)
        assert j["notes"] and j["notes"] != en["notes"]
        assert_no_english(j, FRAGMENTS, f"pathway {lang}")


def test_zones_and_shapes_translated(client):
    for path in ("/api/zones", "/api/zones/geojson"):
        en = client.get(path, params={"lat": LAT, "lon": LON}).json()["note"]
        for lang in ("es", "ht"):
            note = client.get(path, params={"lat": LAT, "lon": LON}, headers=hdr(lang)).json()["note"]
            assert note != en and "M-DCPS" in note and "K-8" in note and "6-12" in note  # official names and grade spans survive


def test_geocode_zip_result_is_translated_and_cached_per_language(client):
    from app.services import geocode as gc

    gc._CACHE.clear()
    en = client.get("/api/geocode", params={"q": "33127"}).json()
    assert en["matched_address"] == "ZIP 33127 (inside the ZIP area, not a street address)" and en["precision"] == "zip"
    for lang in ("es", "ht"):
        for _ in range(2):  # the second call is served from the cache and must stay in the same language
            j = client.get("/api/geocode", params={"q": "33127"}, headers=hdr(lang)).json()
            assert "33127" in j["matched_address"] and j["matched_address"] != en["matched_address"] and j["note"] != en["note"]
            assert_no_english(j, FRAGMENTS, f"geocode {lang}")
        assert (j["lat"], j["lon"], j["confidence"], j["precision"]) == (en["lat"], en["lon"], en["confidence"], en["precision"])
    assert client.get("/api/geocode", params={"q": "33127"}).json()["matched_address"] == en["matched_address"]


def test_dates_are_translated_and_unchanged_in_substance(client):
    en = client.get("/api/dates").json()
    for lang in ("es", "ht"):
        j = client.get("/api/dates", headers=hdr(lang)).json()
        assert [(d["id"], d["date"], d["approximate"], d["days_until"]) for d in j["dates"]] == [(d["id"], d["date"], d["approximate"], d["days_until"]) for d in en["dates"]]
        assert all(a["label"] != b["label"] for a, b in zip(en["dates"], j["dates"]))
        assert j["notes"] and j["notes"] != en["notes"] and "dadeschools.net" in j["notes"][0]
        assert_no_english(j, FRAGMENTS, f"dates {lang}")


def test_plan_follows_header_and_body_lang_wins(client):
    body = {"lat": LAT, "lon": LON, "children": [{"age": 3, "name": "Leo"}]}
    en = client.post("/api/plan", json=body).json()
    assert en["lang"] == "en"
    via_header = client.post("/api/plan", json=body, headers=hdr("es")).json()
    assert via_header["lang"] == "es" and via_header["children"][0]["eligibility"][0]["label"] == t("elig.vpk.label", "es")
    assert via_header["notes"] == client.post("/api/plan", json={**body, "lang": "es"}).json()["notes"]
    body_wins = client.post("/api/plan", json={**body, "lang": "ht"}, headers=hdr("es")).json()
    assert body_wins["lang"] == "ht" and body_wins["notes"] == client.post("/api/plan", json={**body, "lang": "ht"}).json()["notes"]
    assert client.post("/api/plan", json={**body, "lang": "en"}, headers=hdr("es")).json()["lang"] == "en"
    e = client.post("/api/plan", json={**body, "lang": "ht", "children": [{"age": 5, "birth_date": "2999-01-01"}]}, headers=hdr("es")).json()["error"]
    assert e["message"] == t("err.birth_date_in_future.message", "ht")  # errors follow the body language too


# ----------------------------------------------------------------------------------------------------------------- chat
def req(text="Find schools", lang=None, **profile):
    return ChatRequest(messages=[ChatMessage(role="user", content=text)], profile=ChatProfile(**profile), lang=lang)


def test_chat_tools_stay_english_but_response_results_follow_the_language(rich_nav):
    nav = rich_nav
    sid = school_ids_nav(nav, "private")[0]
    for request_lang in ("es", "ht"):
        with use_lang(request_lang):  # a request in Spanish / Creole
            box = ToolBox(nav, CitationBook(), ChatProfile(lat=LAT, lon=LON), lang=request_lang)
            assert current_lang() == request_lang
            school = box.run("get_school", {"school_id": sid})
            assert current_lang() == request_lang  # restored after the English run
        assert school["tuition"]["why"] == t("na.tuition.private.why", "en")  # what the model reads: English
        assert school["questions_to_ask"][-1] == t("q.tour", "en")
        assert box.results[0].tuition.why == t("na.tuition.private.why", request_lang)  # what the family's cards show
        found = box.run("search_schools", {"limit": 5, "kinds": ["private", "early_learning"]})
        assert box.results and "No public dataset" in json.dumps(found)  # the model's view is English
        assert_no_english([r.model_dump() for r in box.results], FRAGMENTS, f"toolbox results {request_lang}")  # the cards are not
        err_out = box.run("get_school", {"school_id": "pub-nope"})
        assert err_out["error"] == "No school with id 'pub-nope'." and err_out["next"] == "Use an id returned by /api/schools."
        cmp_out = box.run("compare", {"ids": [sid]})
        assert cmp_out["rows"][0]["label"] == "Type" and cmp_out["notes"][0].startswith("'Best' is only")


def school_ids_nav(nav, kind):
    return [r["id"] for r in nav.conn.execute("SELECT id FROM places WHERE kind=? ORDER BY id LIMIT 10", (kind,))]


def test_toolbox_localization_does_not_change_model_citations(rich_nav):
    sid = school_ids_nav(rich_nav, "private")[0]
    outs = []
    for lang in ("en", "es"):
        box = ToolBox(rich_nav, CitationBook(), ChatProfile(lat=LAT, lon=LON), lang=lang)
        outs.append((json.dumps(box.run("get_school", {"school_id": sid})), dict(box.book.entries), [c["tool"] for c in box.calls]))
    assert outs[0] == outs[1]


def test_chat_warnings_follow_the_request_language(rich_nav, monkeypatch):
    def run(lang_body, header_lang):
        llm = FakeLlm([uses(("get_zones", {"lat": LAT, "lon": LON})), say("Su escuela asignada es Dunbar."), ])
        with use_lang(header_lang):
            return agent.run_chat(rich_nav, req(lang=lang_body, lat=LAT, lon=LON), llm)

    assert run(None, "en").warnings == ["this answer has no sources attached, so treat it as general guidance"]
    assert run(None, "es").warnings == [t("chat.warn.no_citations", "es")]
    assert run("ht", "es").warnings == [t("chat.warn.no_citations", "ht")]  # body lang wins
    llm = FakeLlm([uses(("get_dates", {})), lambda m: say("Mire [c99] y también [c1].")])
    with use_lang("ht"):
        r = agent.run_chat(rich_nav, req(), llm)
    assert t("chat.warn.unknown_citation", "ht", id="c99") in r.warnings and "removed unknown" not in " ".join(r.warnings)
    llm = FakeLlm([say("It costs $9,500."), say("Still $9,500 a year.")])
    with use_lang("es"):
        r = agent.run_chat(rich_nav, req(), llm)
    assert "[monto no verificado]" in r.answer and r.warnings[0].startswith("el primer borrador")
    llm = FakeLlm([say("The application deadline is in January.")])
    with use_lang("es"):
        r = agent.run_chat(rich_nav, req(), llm)
    assert t("chat.warn.rules", "es") in r.warnings


def test_chat_fallback_text_follows_header_and_body(rich_nav, monkeypatch):
    for k in ("LLM_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "LLM_PROVIDER", "LLM_BASE_URL", "LLM_MODEL"):
        monkeypatch.delenv(k, raising=False)
    with TestClient(app) as c:
        app.state.nav = rich_nav
        body = {"messages": [{"role": "user", "content": "hola"}], "profile": {"lat": LAT, "lon": LON}}
        en = c.post("/api/chat", json=body).json()
        es = c.post("/api/chat", json=body, headers=hdr("es")).json()
        ht = c.post("/api/chat", json={**body, "lang": "ht"}, headers=hdr("es")).json()
        assert en["degraded"] and es["degraded"] and ht["degraded"]
        assert en["answer"].startswith(agent.UNAVAILABLE["en"]) and es["answer"].startswith(agent.UNAVAILABLE["es"])
        assert ht["answer"].startswith(agent.UNAVAILABLE["ht"])
        assert en["warnings"][0].startswith("AI assistant unavailable:") and es["warnings"][0].startswith("Asistente de IA no disponible:")
        assert "(pública)" in es["answer"] or "(chárter)" in es["answer"] or "(privada)" in es["answer"] or "(educación temprana)" in es["answer"]
        assert [r["id"] for r in en["results"]] == [r["id"] for r in es["results"]]  # same schools, only prose differs
        assert_no_english(es["results"], FRAGMENTS, "chat results es")
        need = c.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]}, headers=hdr("ht")).json()
        assert need["answer"] == agent.NEED_LOCATION["ht"]


# ----------------------------------------------------------------------------------------------------------------- logic never changes
MASKED = {"why", "suggested_action", "reasons", "detail", "notes", "note", "questions_to_ask", "label", "best_rule", "text", "estimate_note", "ages",
          "explanation", "title", "transition_note", "grade_label", "entering", "matched_address", "program", "lang"}
ISO = re.compile(r"\d{4}-\d{2}-\d{2}$")
VERIFICATION = re.compile(r"verification: \w+")


def mask_method(m):
    """`method` is translated, but `verification: <level>` and the `Check:` marker are parsed by code and the frontend: they must survive verbatim."""
    return "§" + "".join(VERIFICATION.findall(m)) + (" Check:" if "Check:" in m else "")


def skeleton(o):
    """The response with every translated sentence replaced by a marker: what is left is the logic (ids, statuses, values, counts, order)."""
    if isinstance(o, dict):
        rule_text = o.get("status") == "curated" and "verification: " in str(o.get("method", "")) and isinstance(o.get("value"), str) and not ISO.match(o["value"])
        return {k: (mask_method(v) if k == "method" and isinstance(v, str) else
                    "§" if (k in MASKED and isinstance(v, str)) or (k == "value" and rule_text) else
                    ["§" if isinstance(x, str) else skeleton(x) for x in v] if k in MASKED and isinstance(v, list) else skeleton(v))
                for k, v in o.items()}
    if isinstance(o, list):
        return [skeleton(x) for x in o]
    return o


def three(call):
    return [skeleton(call(lang)) for lang in LANGS]


def test_skeleton_helper_masks_prose_only():
    sk = skeleton({"why": "x", "reasons": ["a", "b"], "value": 3, "status": "official", "label": None, "id": "pub-1"})
    assert sk == {"why": "§", "reasons": ["§", "§"], "value": 3, "status": "official", "label": None, "id": "pub-1"}


@pytest.mark.parametrize("params", [
    {}, {"sort": "distance"}, {"sort": "grade"}, {"sort": "name"}, FILTERED, {"kinds": "private", "scholarship": True},
    {"kinds": "early_learning", "stage": "pre_k"}, {"q": "academy", "radius_mi": 25}, {"stage": "middle,high", "radius_mi": 6, "priorities": "STEM,Arts"},
    {"free_only": True, "grade_min": "C"},
])
def test_search_logic_is_identical_in_every_language(rclient, params):
    en, es, ht = three(lambda lang: search(rclient, lang, **params))
    assert en == es == ht
    if params in ({}, {"sort": "distance"}, {"sort": "name"}, {"kinds": "early_learning", "stage": "pre_k"}):
        assert en["results"]  # the comparison is not vacuous


def test_detail_logic_is_identical_in_every_language(rclient):
    ids = [i for kind in ("public", "charter", "private", "early_learning") for i in school_ids(rclient, kind)[:6]]
    for sid in ids:
        for origin in ({}, {"lat": LAT, "lon": LON}):
            sk = three(lambda lang: rclient.get(f"/api/schools/{sid}", params=origin, headers=hdr(lang)).json())
            assert sk[0] == sk[1] == sk[2], sid


def test_compare_logic_is_identical_in_every_language(rclient):
    groups = [school_ids(rclient, "public")[:3], school_ids(rclient, "private")[:2], school_ids(rclient, "early_learning")[:1] + school_ids(rclient, "charter")[:1]]
    for ids in groups:
        for origin in ({}, {"lat": LAT, "lon": LON}):
            sk = three(lambda lang: rclient.post("/api/compare", json={"ids": ids, **origin}, headers=hdr(lang)).json())
            assert sk[0] == sk[1] == sk[2]


@pytest.mark.parametrize("body", [
    {"children": [{"age": 0}, {"age": 3}, {"age": 4}, {"age": 9}, {"age": 13}, {"age": 18}]},
    {"children": [{"age": 5}, {"age": 15}], "free_only": True},
])
def test_pathway_logic_is_identical_in_every_language(rclient, body):
    sk = three(lambda lang: rclient.post("/api/pathway", json={"lat": LAT, "lon": LON, **body}, headers=hdr(lang)).json())
    assert sk[0] == sk[1] == sk[2]


@pytest.mark.parametrize("body", [
    {"children": [{"age": 1}, {"age": 3, "name": "Leo"}, {"age": 4}, {"age": 7}, {"age": 12}]},
    {"children": [{"age": 5, "birth_date": "2022-09-01"}, {"age": 4, "birth_date": "2023-08-15"}], "free_only": True},
])
def test_plan_logic_is_identical_in_every_language(rclient, body):
    sk = three(lambda lang: rclient.post("/api/plan", json={"lat": LAT, "lon": LON, **body}, headers=hdr(lang)).json())
    assert sk[0] == sk[1] == sk[2]


def test_zones_dates_and_geocode_logic_is_identical(client):
    for call in (lambda lang: client.get("/api/zones", params={"lat": LAT, "lon": LON}, headers=hdr(lang)).json(),
                 lambda lang: client.get("/api/zones/geojson", params={"lat": LAT, "lon": LON}, headers=hdr(lang)).json(),
                 lambda lang: client.get("/api/dates", headers=hdr(lang)).json()):
        sk = three(call)
        assert sk[0] == sk[1] == sk[2]
    from app.services import geocode as gc

    gc._CACHE.clear()
    sk = three(lambda lang: client.get("/api/geocode", params={"q": "33127"}, headers=hdr(lang)).json())
    assert sk[0] == sk[1] == sk[2]


def walk_methods(o, path=""):
    out = {}
    if isinstance(o, dict):
        if isinstance(o.get("method"), str):
            out[path] = o["method"]
        for k, v in o.items():
            out.update(walk_methods(v, f"{path}.{k}"))
    elif isinstance(o, list):
        for i, v in enumerate(o):
            out.update(walk_methods(v, f"{path}[{i}]"))
    return out


def test_source_url_as_of_and_names_are_never_translated(rclient):
    def keep(o):
        if isinstance(o, dict):
            return {k: (v if k in ("source", "url", "as_of") else keep(v)) for k, v in o.items() if k in ("source", "url", "as_of") or isinstance(v, (dict, list))}
        return [keep(x) for x in o] if isinstance(o, list) else None

    for sid in school_ids(rclient, "private")[:3] + school_ids(rclient, "public")[:3]:
        en = rclient.get(f"/api/schools/{sid}", params={"lat": LAT, "lon": LON}).json()
        for lang in ("es", "ht"):
            j = rclient.get(f"/api/schools/{sid}", params={"lat": LAT, "lon": LON}, headers=hdr(lang)).json()
            assert keep(j) == keep(en)
            assert j["school"]["name"] == en["school"]["name"] and j["school"]["address"] == en["school"]["address"]


# ----------------------------------------------------------------------------------------------------------------- Field.method
def method_responses(c, lang):
    """Responses that between them hit every Field.method call site."""
    h = hdr(lang)
    ids = [i for kind in ("public", "charter", "private", "early_learning") for i in school_ids(c, kind)[:12]]
    out = [c.get(f"/api/schools/{i}", params={"lat": LAT, "lon": LON}, headers=h).json() for i in ids]
    out.append(c.get("/api/schools", params={"lat": LAT, "lon": LON, "radius_mi": 4, "limit": 100}, headers=h).json())
    out.append(c.post("/api/compare", json={"ids": ids[:3], "lat": LAT, "lon": LON}, headers=h).json())
    out.append(c.post("/api/pathway", json={"lat": LAT, "lon": LON, "children": [{"age": 1}, {"age": 4}, {"age": 8}, {"age": 12}]}, headers=h).json())
    out.append(c.post("/api/plan", json={"lat": LAT, "lon": LON, "children": [{"age": 1}, {"age": 3}, {"age": 7}]}, headers=h).json())
    out.append(c.get("/api/zones", params={"lat": LAT, "lon": LON}, headers=h).json())
    out.append(c.get("/api/zones/geojson", params={"lat": LAT, "lon": LON}, headers=h).json())
    out.append(c.get("/api/dates", headers=h).json())
    return out


def test_every_method_is_translated_in_es_and_ht_and_english_is_unchanged(rclient):
    en = method_responses(rclient, "en")
    seen = set()
    for lang in ("es", "ht"):
        for a, b in zip(en, method_responses(rclient, lang)):
            ma, mb = walk_methods(a), walk_methods(b)
            assert ma.keys() == mb.keys()
            for path, text in ma.items():
                assert mb[path] != text, (lang, path, text)  # no method equals the English text
                assert mask_method(mb[path]).endswith(mask_method(text)[1:]), (path, text, mb[path])  # verification level / Check: marker intact
                seen.add(text)
    assert len(seen) >= 22  # the run reached most call sites
    assert "Straight-line (great-circle) miles from the searched location to the school's county-listed point; not a travel time" in seen
    assert any(m.startswith("Curated rule '") and "; verification: " in m for m in seen)
    assert "Checked the datasets listed in `source`; no value found." in seen


def test_method_texts_keep_their_dynamic_values(rclient):
    en = method_responses(rclient, "en")
    for lang in ("es", "ht"):
        for a, b in zip(en, method_responses(rclient, lang)):
            for (path, ta), tb in zip(walk_methods(a).items(), walk_methods(b).values()):
                for token in re.findall(r"(?<!\w)'([^']+)'(?!\w)", ta) + re.findall(r"verification: \w+", ta):
                    assert token in tb, (lang, path, token)  # grade range, rule id, school names, verification level
        assert any("'PK-5'" in m or "'K-5'" in m or "'PK-8'" in m or "'6-8'" in m or "'K-8'" in m
                   for r in method_responses(rclient, lang) for m in walk_methods(r).values())


def test_state_grade_check_marker_stays_parseable_in_every_language(rich):
    """No fixture school has a state/county name mismatch, so build one: a graded public school whose state record carries another name."""
    from app.schemas import Field
    from app.services import schools as schools_svc

    nav, picks, _ = rich
    place = schools_svc.get_place(nav, picks["elem"][0]["id"])
    assert place["state_grade"]
    place["extra"] = {**place["extra"], "state": {"state_school_name": "MAST ACADEMY"}}
    methods = {}
    for lang in LANGS:
        with use_lang(lang):
            f = schools_svc.summarize(nav, place).state_grade
        methods[lang] = f.method
        assert ". Check: " in f.method and "MAST ACADEMY" in f.method and place["name"] in f.method
        before, after = f.method.split("Check:", 1)  # what the frontend does
        assert after.strip() and "verification" not in before
        assert CitationBook().field(Field(**f.model_dump()))["check"] == after.strip()  # what the chat citation book does
    assert methods["en"].startswith("State A-F school grade as published for ")
    assert methods["es"] != methods["en"] and methods["ht"] != methods["en"] and methods["es"] != methods["ht"]
    assert methods["en"].split("Check:", 1)[1].strip().startswith("the state lists this school number as 'MAST ACADEMY'")


def test_method_catalog_keys_follow_the_m_prefix_and_chat_tools_keep_english(rich_nav):
    assert sum(1 for k in MESSAGES if k.startswith("m.")) >= 30
    sid = school_ids_nav(rich_nav, "private")[0]
    with use_lang("es"):
        box = ToolBox(rich_nav, CitationBook(), ChatProfile(lat=LAT, lon=LON), lang="es")
        out = box.run("get_school", {"school_id": sid})
        dates = box.run("get_dates", {})
    assert out["how_to_apply"][0]["verification"].startswith("Curated rule '")  # the model still reads English methods
    assert dates["dates"][0]["verification"].startswith("Curated rule '")
    assert box.results[0].tuition.status == "not_available"
    assert box.results[0].tuition.method == t("m.na_default", "es")  # while the cards in the response are Spanish
