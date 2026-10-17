"""Child fit note: signed-in only, grade fit computed from age and the school's grades, model text only when it is grounded."""
import json

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.chat.llm import LlmUnavailable, make_turn
from app.main import app
from app.schemas import ChildFitRequest
from app.services import child_fit as cf
from app.services import why_match as wm

LAT, LON = 25.7617, -80.1918


class FakeLlm:
    def __init__(self, *turns):
        self.turns, self.calls = list(turns), []

    def create(self, *, system, messages, tools, force_no_tools=False):
        self.calls.append({"system": system, "messages": messages, "tools": tools})
        t = self.turns.pop(0)
        if isinstance(t, Exception):
            raise t
        return make_turn(t)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("USERS_DB_PATH", str(tmp_path / "users.db"))
    auth._failures.clear()
    cf._CACHE.clear()
    with TestClient(app) as c:
        yield c


def _headers(client):
    r = client.post("/api/auth/signup", json={"name": "Pat", "email": "pat@example.com", "password": "correct horse", "zip": "33127"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _school(client, stage="elementary"):
    return client.get("/api/schools", params={"lat": LAT, "lon": LON, "radius_mi": 5, "kinds": "public", "stages": stage, "limit": 1}).json()["results"][0]["id"]


def test_grade_fit_from_age_and_grade_range():
    assert cf._grade_fit(7, "PK-5", ["pre_k", "elementary"])["fit"] == "serves"
    assert cf._grade_fit(7, "PK-5", [])["years_left"] == 4  # grade 2 -> grades 2..5
    assert cf._grade_fit(4, "K-5", ["elementary"])["fit"] == "later"
    assert cf._grade_fit(13, "K-5", ["elementary"])["fit"] == "ended"
    assert cf._grade_fit(6, None, ["elementary"])["fit"] == "serves"  # no grade range: fall back to the stage
    assert cf._grade_fit(1, None, ["elementary"])["fit"] == "later"
    assert cf._grade_fit(7, None, [])["fit"] == "unknown"


def test_signed_in_family_with_a_child_gets_the_note_and_the_model_only_sees_facts(client, monkeypatch):
    sid, h = _school(client), _headers(client)
    llm = FakeLlm("Leo would enter grade 2, which this school serves, and it is close to home.")
    monkeypatch.setattr(wm, "default_llm", lambda cfg=None: llm)
    j = client.post(f"/api/schools/{sid}/child-fit", json={"children": [{"age": 7, "name": "Leo"}], "lat": LAT, "lon": LON}, headers=h).json()
    assert j["ai"] is True and j["summary"].startswith("Leo would enter")
    facts = json.loads(llm.calls[0]["messages"][0]["content"])
    assert facts["children"][0]["fit"] in ("serves", "later", "ended", "unknown") and facts["children"][0]["age"] == 7 and llm.calls[0]["tools"] == []


def test_instant_mode_never_calls_the_model(client, monkeypatch):
    sid, h = _school(client), _headers(client)
    monkeypatch.setattr(wm, "default_llm", lambda cfg=None: pytest.fail("the model must not be called"))
    j = client.post(f"/api/schools/{sid}/child-fit", json={"children": [{"age": 7}], "ai": False}, headers=h).json()
    assert j["ai"] is False and j["summary"]


@pytest.mark.parametrize("turn", [LlmUnavailable("timed out"), "Tuition is only $12,345 and it is perfect."])
def test_falls_back_to_the_grade_fit_sentence(client, monkeypatch, turn):
    sid, h = _school(client), _headers(client)
    monkeypatch.setattr(wm, "default_llm", lambda cfg=None: FakeLlm(turn))
    j = client.post(f"/api/schools/{sid}/child-fit", json={"children": [{"age": 7, "name": "Leo"}]}, headers=h).json()
    assert j["ai"] is False and "12,345" not in j["summary"] and j["summary"].startswith("Leo")


def test_sign_in_and_a_child_are_both_required(client):
    sid = _school(client)
    assert client.post(f"/api/schools/{sid}/child-fit", json={"children": [{"age": 7}]}).status_code == 401
    h = _headers(client)
    assert client.post(f"/api/schools/{sid}/child-fit", json={"children": []}, headers=h).status_code == 422
    assert client.post("/api/schools/pub-nope/child-fit", json={"children": [{"age": 7}]}, headers=h).status_code == 404


def test_answer_is_cached_per_family_facts(client, monkeypatch):
    sid = _school(client)
    req = ChildFitRequest(children=[{"age": 7, "name": "Leo"}])
    nav = app.state.nav
    a = cf.explain(nav, sid, req, FakeLlm("Leo fits."))
    b = cf.explain(nav, sid, req, FakeLlm())  # would raise if it called the model
    c = cf.explain(nav, sid, ChildFitRequest(children=[{"age": 9, "name": "Leo"}]), FakeLlm("Different."))
    assert a == b and c.summary == "Different."
