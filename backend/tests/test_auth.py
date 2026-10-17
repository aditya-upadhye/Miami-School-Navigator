"""Accounts: sign up, sign in, session, sign out, and that passwords and tokens are never stored in the clear."""
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.main import app

GOOD = {"name": "Ana Rivera", "email": "Ana@Example.com", "password": "correct horse", "zip": "33127"}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("USERS_DB_PATH", str(tmp_path / "users.db"))
    auth._failures.clear()
    with TestClient(app) as c:
        c.db_path = tmp_path / "users.db"
        yield c


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_signup_returns_a_session_and_the_user(client):
    r = client.post("/api/auth/signup", json=GOOD)
    assert r.status_code == 201 and r.headers["cache-control"] == "no-store"
    j = r.json()
    assert j["user"]["name"] == "Ana Rivera" and j["user"]["email"] == "ana@example.com" and j["user"]["zip"] == "33127"
    assert client.get("/api/auth/me", headers=_auth(j["token"])).json()["name"] == "Ana Rivera"


def test_password_and_token_are_not_stored_in_the_clear(client):
    token = client.post("/api/auth/signup", json=GOOD).json()["token"]
    raw = client.db_path.read_bytes()
    assert b"correct horse" not in raw and token.encode() not in raw
    stored = sqlite3.connect(client.db_path).execute("SELECT password_hash FROM users").fetchone()[0]
    assert stored.startswith("scrypt$")


def test_signin_with_right_and_wrong_password(client):
    client.post("/api/auth/signup", json=GOOD)
    ok = client.post("/api/auth/login", json={"email": " ANA@example.com ", "password": "correct horse"})
    assert ok.status_code == 200 and ok.json()["token"]
    bad = client.post("/api/auth/login", json={"email": "ana@example.com", "password": "wrong password"})
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "invalid_credentials"
    unknown = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "whatever1"})
    assert unknown.status_code == 401 and unknown.json()["error"] == bad.json()["error"]  # same answer: does not reveal which emails exist


def test_duplicate_email_and_bad_input(client):
    assert client.post("/api/auth/signup", json=GOOD).status_code == 201
    dup = client.post("/api/auth/signup", json={**GOOD, "email": "ana@EXAMPLE.com"})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "email_taken"
    assert client.post("/api/auth/signup", json={**GOOD, "email": "not-an-email"}).status_code == 422
    assert client.post("/api/auth/signup", json={**GOOD, "email": "b@example.com", "password": "short"}).status_code == 422
    assert client.post("/api/auth/signup", json={**GOOD, "email": "c@example.com", "name": "   "}).status_code == 422


def test_me_needs_a_valid_session_and_logout_ends_it(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=_auth("made-up")).status_code == 401
    token = client.post("/api/auth/signup", json=GOOD).json()["token"]
    assert client.post("/api/auth/logout", headers=_auth(token)).status_code == 204
    assert client.get("/api/auth/me", headers=_auth(token)).status_code == 401


def test_expired_session_is_rejected(client):
    token = client.post("/api/auth/signup", json=GOOD).json()["token"]
    with sqlite3.connect(client.db_path) as db:
        db.execute("UPDATE sessions SET expires_at = 1")
    assert client.get("/api/auth/me", headers=_auth(token)).status_code == 401


def test_repeated_wrong_passwords_pause_sign_in(client):
    client.post("/api/auth/signup", json=GOOD)
    for _ in range(auth.MAX_FAILURES):
        assert client.post("/api/auth/login", json={"email": "ana@example.com", "password": "nope nope"}).status_code == 401
    locked = client.post("/api/auth/login", json={"email": "ana@example.com", "password": "correct horse"})
    assert locked.status_code == 429 and locked.json()["error"]["code"] == "too_many_attempts"


def test_errors_follow_the_request_language(client):
    r = client.post("/api/auth/login", json={"email": "x@example.com", "password": "whatever1"}, headers={"X-Lang": "es"})
    assert "no son correctos" in r.json()["error"]["message"]


def test_an_older_users_table_is_migrated_and_its_password_still_works(tmp_path, monkeypatch):
    """The same file once held `users(pw_hash, ...)` from an earlier accounts module; sign-in used to crash on `password_hash`."""
    from app.accounts import hash_password as legacy_hash

    path = tmp_path / "users.db"
    old = sqlite3.connect(path)
    old.executescript("""
        CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '',
                            pw_hash TEXT NOT NULL, created_at TEXT NOT NULL, profile TEXT NOT NULL DEFAULT '{}');
        CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at REAL NOT NULL);
    """)
    old.execute("INSERT INTO users (email, name, pw_hash, created_at) VALUES (?,?,?,?)",
                ("Alex@Gmail.com", "", legacy_hash("old password 1"), "2026-10-17T16:29:21Z"))
    old.execute("INSERT INTO sessions VALUES ('x', 1, '2026-10-17T16:29:21Z', 9999999999)")
    old.commit()
    old.close()
    monkeypatch.setenv("USERS_DB_PATH", str(path))
    auth._failures.clear()
    with TestClient(app) as c:
        bad = c.post("/api/auth/login", json={"email": "alex@gmail.com", "password": "wrong password"})
        assert bad.status_code == 401
        ok = c.post("/api/auth/login", json={"email": "alex@gmail.com", "password": "old password 1"})
        assert ok.status_code == 200 and ok.json()["user"]["email"] == "alex@gmail.com" and ok.json()["user"]["name"] == "Alex"
        new = c.post("/api/auth/signup", json=GOOD)  # the rebuilt table accepts new sign-ups
        assert new.status_code == 201
