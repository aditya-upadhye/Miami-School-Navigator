"""Geocoder fallbacks with mocked HTTP (deterministic, offline)."""
import httpx
import pytest

from app.services import geocode as gc
from app.services.errors import ApiError


@pytest.fixture(autouse=True)
def clear_cache():
    gc._CACHE.clear()


def make_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


COUNTY_HIT = {"features": [{"attributes": {"HSE_NUM": 2250, "SNAME": "NW 2ND AVE", "ZIP": 33127, "MUNIC_NAME": "MIAMI"}, "geometry": {"x": -80.2, "y": 25.8}}]}
CENSUS_HIT = {"result": {"addressMatches": [{"coordinates": {"x": -80.19, "y": 25.79}, "matchedAddress": "1 MAIN ST, MIAMI, FL, 33130"}]}}


@pytest.mark.parametrize("text,expected", [
    ("2250 NW 2nd Avenue, Miami, FL 33127", ("2250", "NW 2ND AVE")),
    ("1450 Northeast 2nd Ave Miami 33132", ("1450", "NE 2ND AVE")),
    ("100 S.W. 8th Street", ("100", "S W 8TH ST")),
    ("Wynwood", (None, None)), ("33127", (None, None)),
])
def test_street_key(text, expected):
    assert gc._street_key(text) == expected


def test_county_address_point_first(bare_nav):
    seen = []

    def handler(req):
        seen.append(str(req.url))
        return httpx.Response(200, json=COUNTY_HIT)

    g = gc.geocode(bare_nav, "2250 NW 2nd Avenue, Miami FL 33127", make_client(handler))
    assert g.precision == "address" and g.confidence == 0.95 and "county" in g.source.lower()
    assert "HSE_NUM%3D2250" in seen[0] and "NW+2ND+AVE" in seen[0] and "ZIP%3D33127" in seen[0]
    assert len(seen) == 1  # Census never called


def test_falls_back_to_census_when_county_is_down(bare_nav):
    def handler(req):
        if "miamidade" in req.url.host:
            return httpx.Response(503)
        return httpx.Response(200, json=CENSUS_HIT)

    g = gc.geocode(bare_nav, "1 Main St, Miami FL", make_client(handler))
    assert "Census" in g.source and g.confidence == 0.8


def test_zip_centroid_is_low_confidence_and_flagged(bare_nav):
    g = gc.geocode(bare_nav, "33127", make_client(lambda r: httpx.Response(500)))
    assert g.precision == "zip" and g.confidence <= 0.5 and "approximate" in g.note and gc.in_county(g.lat, g.lon)


def test_everything_down_and_no_zip(bare_nav):
    with pytest.raises(ApiError) as e:
        gc.geocode(bare_nav, "5 Nowhere Rd, Somewhere", make_client(lambda r: httpx.Response(500)))
    assert e.value.status == 404 and e.value.suggested_action


def test_outside_county_rejected(bare_nav):
    nyc = {"result": {"addressMatches": [{"coordinates": {"x": -74.0, "y": 40.7}, "matchedAddress": "1 BROADWAY, NEW YORK, NY"}]}}

    def handler(req):
        return httpx.Response(500) if "miamidade" in req.url.host else httpx.Response(200, json=nyc)

    with pytest.raises(ApiError) as e:
        gc.geocode(bare_nav, "1 Broadway, New York", make_client(handler))
    assert e.value.code == "outside_county"


def test_results_are_cached_in_memory_only(bare_nav):
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(200, json=COUNTY_HIT)

    c = make_client(handler)
    gc.geocode(bare_nav, "2250 NW 2nd Ave 33127", c)
    gc.geocode(bare_nav, "2250 NW 2nd Ave 33127", c)
    assert len(calls) == 1


def test_sql_quote_in_street_is_escaped(bare_nav):
    seen = []

    def handler(req):
        seen.append(str(req.url))
        return httpx.Response(200, json={"features": []})

    with pytest.raises(ApiError):
        gc.geocode(bare_nav, "12 O'Brien Rd", make_client(lambda r: (seen.append(str(r.url)), httpx.Response(200, json={"features": [], "result": {"addressMatches": []}}))[1]))
    assert any("O%27%27BRIEN" in u for u in seen)
