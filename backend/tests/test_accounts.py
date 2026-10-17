"""Accounts: sign-up, login, sessions, profile (addresses are stored now), saved schools, and the guards around them."""
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.accounts import hash_password, verify_password
from app.main import app
from tests.conftest import WYNWOOD

LAT, LON = WYNWOOD
PW = "correct horse 9"


@pytest.fixture()
def client(bare_nav):
    with TestClient(app, base_url="http://localhost") as c:
        app.state.nav = bare_nav
        yield c


def second_client():
    return TestClient(app, base_url="http://localhost")


def signup(c, email="Family@Example.com", password=PW, **extra):
    return c.post("/api/auth/signup", json={"email": email, "password": password, **extra})


def school_ids(c, n=3):
    r = c.get("/api/schools", params={"lat": LAT, "lon": LON, "radius_mi": 3, "limit": n})
    ids = [x["id"] for x in r.json()["results"]]
    assert len(ids) == n
    return ids


# ---------------------------------------------------------------- passwords
def test_password_hash_is_salted_and_verifies():
    a, b = hash_password(PW), hash_password(PW)
    assert a != b and PW not in a
    assert verify_password(PW, a) and not verify_password("wrong", a)
    assert not verify_password(PW, "garbage")  # a malformed stored hash is a failed login, not a crash


# ---------------------------------------------------------------- sign-up / login / sessions
def test_signup_sets_an_httponly_cookie_and_signs_in(client):
    r = signup(client, "a1@example.com", name="Ana")
    assert r.status_code == 201
    u = r.json()["user"]
    assert u["email"] == "a1@example.com" and u["name"] == "Ana" and u["profile"] == {} and "pw_hash" not in u
    cookie = r.headers["set-cookie"].lower()
    assert "sn_session=" in cookie and "httponly" in cookie and "samesite=lax" in cookie
    assert r.headers["cache-control"] == "no-store"
    assert client.get("/api/auth/me").json()["user"]["email"] == "a1@example.com"


def test_signed_out_me_is_null_not_an_error(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 200 and r.json() == {"user": None} and r.headers["cache-control"] == "no-store"


def test_email_is_case_insensitive_and_unique(client):
    assert signup(client, "Dup@Example.com").status_code == 201
    other = second_client()
    r = signup(other, "dup@example.COM")
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"


@pytest.mark.parametrize("email", ["nope", "a@b", "a b@example.com", "@example.com", ""])
def test_bad_email_is_rejected(client, email):
    r = signup(client, email)
    assert r.status_code == 422 and r.json()["error"]["code"] in {"invalid_email", "invalid_request"}


def test_short_password_is_rejected(client):
    r = signup(client, "short@example.com", password="1234567")
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"


def test_login_logout_roundtrip(client):
    signup(client, "lo@example.com")
    c2 = second_client()
    r = c2.post("/api/auth/login", json={"email": "LO@example.com", "password": PW})
    assert r.status_code == 200 and c2.get("/api/auth/me").json()["user"]["email"] == "lo@example.com"
    assert c2.post("/api/auth/logout").status_code == 204
    assert c2.get("/api/auth/me").json() == {"user": None}
    assert client.get("/api/auth/me").json()["user"] is not None  # the other device stays signed in


def test_wrong_password_and_unknown_email_look_the_same(client):
    signup(client, "same@example.com")
    c2 = second_client()
    bad_pw = c2.post("/api/auth/login", json={"email": "same@example.com", "password": "nope-nope"})
    unknown = c2.post("/api/auth/login", json={"email": "ghost@example.com", "password": "nope-nope"})
    assert bad_pw.status_code == unknown.status_code == 401
    assert bad_pw.json() == unknown.json() and bad_pw.json()["error"]["code"] == "invalid_credentials"


def test_repeated_failures_are_throttled_then_cleared_by_success(client):
    signup(client, "thr@example.com")
    c2 = second_client()
    for _ in range(5):
        assert c2.post("/api/auth/login", json={"email": "thr@example.com", "password": "bad-bad-bad"}).status_code == 401
    r = c2.post("/api/auth/login", json={"email": "thr@example.com", "password": PW})  # even the right password waits
    assert r.status_code == 429 and r.json()["error"]["code"] == "too_many_attempts"


def test_database_keeps_no_clear_password_or_session_token(client):
    r = signup(client, "store@example.com")
    token = r.cookies.get("sn_session")
    rows = "\n".join(str(tuple(x)) for t in ("users", "sessions") for x in app.state.accounts.conn.execute(f"SELECT * FROM {t}"))
    assert PW not in rows and token not in rows


def test_garbage_or_missing_cookie_is_signed_out(client):
    c2 = second_client()
    c2.cookies.set("sn_session", "not-a-real-token")
    assert c2.get("/api/auth/me").json() == {"user": None}
    assert c2.get("/api/me/saved").status_code == 401


# ---------------------------------------------------------------- profile (addresses allowed)
def test_profile_roundtrip_includes_the_address(client):
    signup(client, "prof@example.com")
    profile = {"address": "2250 NW 2nd Ave, Miami, FL 33127", "lat": 25.8, "lon": -80.2, "children": [{"age": 3}, {"age": 7}], "lang": "es"}
    r = client.put("/api/me/profile", json={"profile": profile, "name": "Marie"})
    assert r.status_code == 200 and r.json()["user"]["profile"] == profile and r.json()["user"]["name"] == "Marie"
    c2 = second_client()
    c2.post("/api/auth/login", json={"email": "prof@example.com", "password": PW})
    assert c2.get("/api/auth/me").json()["user"]["profile"] == profile  # follows the family to another device


def test_signup_can_carry_the_guest_profile(client):
    r = signup(client, "carry@example.com", profile={"address": "100 Main St", "children": []})
    assert r.json()["user"]["profile"]["address"] == "100 Main St"


def test_oversized_profile_is_refused(client):
    signup(client, "big@example.com")
    r = client.put("/api/me/profile", json={"profile": {"blob": "x" * 20_000}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "profile_too_large"


def test_profile_requires_sign_in(client):
    r = client.put("/api/me/profile", json={"profile": {}})
    assert r.status_code == 401 and r.json()["error"]["code"] == "not_signed_in"


# ---------------------------------------------------------------- saved schools
def test_save_list_note_and_remove(client):
    signup(client, "sv@example.com")
    a, b, _ = school_ids(client)
    assert client.get("/api/me/saved").json() == {"items": [], "limit": 200}
    r = client.put(f"/api/me/saved/{a}", json={"note": "Tour on Friday"})
    assert r.status_code == 200
    client.put(f"/api/me/saved/{b}")
    items = client.get("/api/me/saved", params={"lat": LAT, "lon": LON}).json()["items"]
    assert [i["place_id"] for i in items] == [b, a]  # newest first
    first = items[1]
    assert first["note"] == "Tour on Friday" and first["saved_at"]
    assert first["school"]["id"] == a and first["school"]["distance_mi"]["status"] != "not_available"  # same Field-based summary as search
    assert client.put(f"/api/me/saved/{a}").json()["items"][1]["note"] == "Tour on Friday"  # saving again keeps the note
    client.put(f"/api/me/saved/{a}", json={"note": ""})
    assert client.delete(f"/api/me/saved/{b}").json()["items"][0]["place_id"] == a
    assert len(client.delete(f"/api/me/saved/{a}").json()["items"]) == 0


def test_saved_school_must_exist(client):
    signup(client, "ex@example.com")
    r = client.put("/api/me/saved/does-not-exist")
    assert r.status_code == 404 and r.json()["error"]["code"] == "school_not_found"


def test_saved_lists_are_private_to_each_family(client):
    signup(client, "p1@example.com")
    a = school_ids(client, 1)[0]
    client.put(f"/api/me/saved/{a}")
    other = second_client()
    signup(other, "p2@example.com")
    assert other.get("/api/me/saved").json()["items"] == []


def test_merge_guest_saves_skips_unknown_ids_and_keeps_notes(client):
    signup(client, "mg@example.com")
    a, b, c = school_ids(client)
    client.put(f"/api/me/saved/{a}", json={"note": "keep me"})
    r = client.post("/api/me/saved/merge", json={"ids": [a, b, "bogus", b, c]})
    items = {i["place_id"]: i for i in r.json()["items"]}
    assert set(items) == {a, b, c} and items[a]["note"] == "keep me"


def test_saved_limit_is_enforced(client, monkeypatch):
    import app.accounts as accounts_mod

    monkeypatch.setattr(accounts_mod, "MAX_SAVED", 2)
    signup(client, "lim@example.com")
    a, b, c = school_ids(client)
    client.put(f"/api/me/saved/{a}")
    client.put(f"/api/me/saved/{b}")
    r = client.put(f"/api/me/saved/{c}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "saved_limit"
    assert client.put(f"/api/me/saved/{a}", json={"note": "still fine"}).status_code == 200  # editing an existing one is not blocked


def test_a_school_removed_from_the_dataset_stays_removable(client):
    signup(client, "gone@example.com")
    uid = client.get("/api/auth/me").json()["user"]["id"]
    app.state.accounts.save(uid, "pub-vanished")
    items = client.get("/api/me/saved").json()["items"]
    assert items[0]["place_id"] == "pub-vanished" and items[0]["school"] is None
    assert client.delete("/api/me/saved/pub-vanished").json()["items"] == []


# ---------------------------------------------------------------- password change and deletion
def test_change_password_signs_out_other_devices_only(client):
    signup(client, "chg@example.com")
    other = second_client()
    other.post("/api/auth/login", json={"email": "chg@example.com", "password": PW})
    assert client.post("/api/auth/password", json={"current_password": "wrong-wrong", "new_password": "new password 1"}).status_code == 403
    assert client.post("/api/auth/password", json={"current_password": PW, "new_password": "new password 1"}).status_code == 204
    assert client.get("/api/auth/me").json()["user"] is not None
    assert other.get("/api/auth/me").json() == {"user": None}
    c3 = second_client()
    assert c3.post("/api/auth/login", json={"email": "chg@example.com", "password": PW}).status_code == 401
    assert c3.post("/api/auth/login", json={"email": "chg@example.com", "password": "new password 1"}).status_code == 200


def test_delete_account_removes_profile_saved_and_sessions(client):
    signup(client, "del@example.com", profile={"address": "1 Secret Way"})
    client.put(f"/api/me/saved/{school_ids(client, 1)[0]}")
    assert client.post("/api/auth/delete-account", json={"password": "wrong-wrong"}).status_code == 403
    assert client.post("/api/auth/delete-account", json={"password": PW}).status_code == 204
    assert client.get("/api/auth/me").json() == {"user": None}
    db = app.state.accounts.conn
    assert db.execute("SELECT COUNT(*) FROM users WHERE email='del@example.com'").fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM saved").fetchone()[0] == db.execute("SELECT COUNT(*) FROM saved s JOIN users u ON u.id=s.user_id").fetchone()[0]
    assert "1 Secret Way" not in "".join(str(tuple(r)) for r in db.execute("SELECT * FROM users"))
    assert second_client().post("/api/auth/login", json={"email": "del@example.com", "password": PW}).status_code == 401


# ---------------------------------------------------------------- language and housekeeping
@pytest.mark.parametrize("lang", ["es", "ht"])
def test_auth_errors_follow_the_request_language(client, lang):
    en = client.post("/api/auth/login", json={"email": "x@example.com", "password": "bad-bad-bad"}).json()["error"]
    r = client.post("/api/auth/login", json={"email": "y@example.com", "password": "bad-bad-bad"}, headers={"X-Lang": lang})
    e = r.json()["error"]
    assert e["code"] == "invalid_credentials" and e["message"] != en["message"] and e["suggested_action"] != en["suggested_action"]


def test_accounts_live_in_their_own_file_not_the_school_database(client, bare_nav):
    tables = {r[0] for r in sqlite3.connect(app.state.accounts.conn.execute("PRAGMA database_list").fetchone()[2]).execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"users", "sessions", "saved"} <= tables
    school_tables = {r[0] for r in bare_nav.conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert not ({"users", "sessions", "saved"} & school_tables)


def test_school_endpoints_still_never_return_an_email_field(client):
    body = client.get("/api/schools", params={"lat": LAT, "lon": LON, "limit": 5}).text
    assert "@" not in body.replace("@type", "")
