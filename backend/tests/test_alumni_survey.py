"""Alumni survey: sign-in required, one answer per person per school, split withheld until enough people answered."""
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.alumni_routes import FIELDS, MAX_SCHOOLS_PER_PERSON, MIN_RESPONSES
from app.main import app

LAT, LON = 25.7617, -80.1918


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("USERS_DB_PATH", str(tmp_path / "users.db"))
    auth._failures.clear()
    with TestClient(app) as c:
        c.db_path = tmp_path / "users.db"
        yield c


def _signup(client, n):
    r = client.post("/api/auth/signup", json={"name": f"Alum {n}", "email": f"a{n}@example.com", "password": "correct horse", "zip": "33127"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _k12(client, kinds="public", stage="high", limit=1):
    return [r["id"] for r in client.get("/api/schools", params={"lat": LAT, "lon": LON, "radius_mi": 25, "kinds": kinds, "stages": stage, "limit": limit}).json()["results"]]


def test_sign_in_is_required_to_answer_but_not_to_read(client):
    sid = _k12(client)[0]
    assert client.put(f"/api/schools/{sid}/alumni-survey", json={"field": "technology"}).status_code == 401
    j = client.get(f"/api/schools/{sid}/alumni-survey").json()
    assert j["responses"] == 0 and j["enough"] is False and j["breakdown"] == [] and j["mine"] is None and j["fields"] == FIELDS


def test_split_is_withheld_until_enough_people_answered(client):
    sid = _k12(client)[0]
    fields = ["healthcare"] * 6 + ["technology"] * 3 + ["education"] * 2
    for i, f in enumerate(fields):
        h = _signup(client, i)
        j = client.put(f"/api/schools/{sid}/alumni-survey", json={"field": f, "grad_year": 2015}, headers=h).json()
        if i + 1 < MIN_RESPONSES:
            assert j["enough"] is False and j["breakdown"] == [] and j["responses"] == i + 1  # nothing to pick anyone out with
        assert j["mine"]["field"] == f
    pub = client.get(f"/api/schools/{sid}/alumni-survey").json()  # a signed-out reader
    assert pub["enough"] and pub["responses"] == 11 and pub["mine"] is None
    assert [(s["field"], s["count"]) for s in pub["breakdown"]] == [("healthcare", 6), ("technology", 3), ("education", 2)]
    assert pub["breakdown"][0]["pct"] == round(100 * 6 / 11, 1)


def test_one_answer_per_person_can_be_changed_and_removed(client):
    sid = _k12(client)[0]
    h = _signup(client, 1)
    client.put(f"/api/schools/{sid}/alumni-survey", json={"field": "technology"}, headers=h)
    j = client.put(f"/api/schools/{sid}/alumni-survey", json={"field": "healthcare", "grad_year": 2010}, headers=h).json()
    assert j["responses"] == 1 and j["mine"] == {"field": "healthcare", "grad_year": 2010}
    j = client.delete(f"/api/schools/{sid}/alumni-survey", headers=h).json()
    assert j["responses"] == 0 and j["mine"] is None


def test_only_a_fixed_field_and_year_are_stored_no_name(client):
    sid = _k12(client)[0]
    h = _signup(client, 1)
    assert client.put(f"/api/schools/{sid}/alumni-survey", json={"field": "my free text"}, headers=h).status_code == 422
    assert client.put(f"/api/schools/{sid}/alumni-survey", json={"field": "other", "grad_year": 1800}, headers=h).status_code == 422
    client.put(f"/api/schools/{sid}/alumni-survey", json={"field": "other"}, headers=h)
    cols = [r[1] for r in sqlite3.connect(client.db_path).execute("PRAGMA table_info(alumni_survey)")]
    assert cols == ["user_id", "place_id", "field", "grad_year", "created_at"]


def test_only_k12_schools_and_a_cap_per_person(client):
    h = _signup(client, 1)
    ecl = _k12(client, "early_learning", "pre_k")[0]
    assert client.put(f"/api/schools/{ecl}/alumni-survey", json={"field": "other"}, headers=h).status_code == 422
    assert client.put("/api/schools/pub-nope/alumni-survey", json={"field": "other"}, headers=h).status_code == 404
    ids = _k12(client, "public,charter", "high", limit=MAX_SCHOOLS_PER_PERSON + 1)
    for sid in ids[:MAX_SCHOOLS_PER_PERSON]:
        assert client.put(f"/api/schools/{sid}/alumni-survey", json={"field": "other"}, headers=h).status_code == 200
    assert client.put(f"/api/schools/{ids[-1]}/alumni-survey", json={"field": "other"}, headers=h).status_code == 409
    assert client.put(f"/api/schools/{ids[0]}/alumni-survey", json={"field": "technology"}, headers=h).status_code == 200  # changing is still fine
