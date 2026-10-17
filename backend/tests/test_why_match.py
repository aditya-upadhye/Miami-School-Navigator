import json

import pytest
from fastapi.testclient import TestClient

from app.chat.llm import LlmUnavailable, make_turn
from app.i18n import use_lang
from app.main import app
from app.schemas import WhyMatchRequest
from app.services import why_match as wm
from tests.conftest import WYNWOOD

LAT, LON = WYNWOOD


class FakeLlm:
    def __init__(self, *turns):
        self.turns, self.calls = list(turns), []

    def create(self, *, system, messages, tools, force_no_tools=False):
        self.calls.append({"system": system, "messages": messages, "tools": tools})
        t = self.turns.pop(0)
        if isinstance(t, Exception):
            raise t
        return make_turn(t)


@pytest.fixture(scope="module")
def client(bare_nav):
    with TestClient(app) as c:
        app.state.nav = bare_nav
        yield c


@pytest.fixture(autouse=True)
def _fresh_cache():
    wm._CACHE.clear()
    yield
    wm._CACHE.clear()


def _school(client):
    return client.get("/api/schools", params={"lat": LAT, "lon": LON, "radius_mi": 3, "limit": 1}).json()["results"][0]["id"]


def test_model_gets_only_the_score_facts_and_no_tools(client, bare_nav):
    sid = _school(client)
    llm = FakeLlm("It is close to home and strong on your top priorities. Families here rate its programs well.")
    r = wm.explain(bare_nav, sid, WhyMatchRequest(lat=LAT, lon=LON, priorities=["STEM"]), llm)
    assert r.ai and r.summary.count(".") == 2 and r.match_score >= 0
    call = llm.calls[0]
    facts = json.loads(call["messages"][0]["content"])
    assert call["tools"] == [] and facts["score_factors"] and facts["family_priorities"] == ["STEM"]
    assert "English" in call["system"] and "1 or 2 short sentences" in call["system"]


def test_answer_is_cut_to_two_sentences_and_cleaned(client, bare_nav):
    sid = _school(client)
    r = wm.explain(bare_nav, sid, WhyMatchRequest(lat=LAT, lon=LON), FakeLlm("**Close to home.** Zoned for you! A third one. And a fourth."))
    assert r.summary == "Close to home. Zoned for you!"


def test_second_open_comes_from_the_cache_and_language_is_respected(client, bare_nav):
    sid = _school(client)
    req = WhyMatchRequest(lat=LAT, lon=LON)
    llm = FakeLlm("Está cerca de su casa.")
    with use_lang("es"):
        a = wm.explain(bare_nav, sid, req, llm)
        b = wm.explain(bare_nav, sid, req, FakeLlm())  # would raise if it called the model
    assert a == b and "Spanish" in llm.calls[0]["system"]


@pytest.mark.parametrize("turn", [LlmUnavailable("no key"), "It costs $9,999 a year and is the best school."])
def test_falls_back_to_the_score_reasons_when_the_model_fails_or_invents_a_price(client, bare_nav, turn):
    sid = _school(client)
    r = wm.explain(bare_nav, sid, WhyMatchRequest(lat=LAT, lon=LON), FakeLlm(turn))
    assert r.ai is False and "9,999" not in r.summary and "best school" not in r.summary
    assert wm._CACHE == {}  # a fallback is never cached


def test_route(client, monkeypatch):
    sid = _school(client)
    monkeypatch.setattr(wm, "default_llm", lambda cfg=None: FakeLlm("A short reason."))
    j = client.post(f"/api/schools/{sid}/why-match", json={"lat": LAT, "lon": LON}).json()
    assert j == {"id": sid, "summary": "A short reason.", "ai": True, "match_score": j["match_score"]}
    assert client.post("/api/schools/pub-nope/why-match", json={"lat": LAT, "lon": LON}).status_code == 404
    assert client.post(f"/api/schools/{sid}/why-match", json={"lat": 95, "lon": LON}).status_code == 422
