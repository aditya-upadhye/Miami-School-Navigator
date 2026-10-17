"""Family accounts: sign up, sign in, who am I, sign out.

Accounts live in their own SQLite file (`USERS_DB_PATH`, default data/users.db), never in the read-only school database, and are
never part of the committed data. Passwords are stored only as salted scrypt hashes. A sign-in returns an opaque random session
token; only its SHA-256 is stored, so a leaked database cannot be replayed as sessions. The client sends it as
`Authorization: Bearer <token>`. No account data goes into logs, and every auth response is `Cache-Control: no-store`.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import sqlite3
import threading
import time
from typing import Iterator

from fastapi import APIRouter, Depends, Header, Response
from pydantic import BaseModel, Field, field_validator

from .config import get_settings
from .services.errors import ApiError

SESSION_SECONDS = 30 * 24 * 3600
MAX_FAILURES, FAILURE_WINDOW = 5, 15 * 60  # failed sign-ins per email per window before a pause
_SCRYPT = {"n": 2**14, "r": 8, "p": 1, "maxmem": 64 * 1024 * 1024, "dklen": 32}
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, zip TEXT,
  password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
"""

router = APIRouter(prefix="/api/auth", tags=["accounts"])
_failures: dict[str, list[float]] = {}
_failures_lock = threading.Lock()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"scrypt${salt.hex()}${hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT).hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        parts = stored.split("$")
        if len(parts) == 6:  # older accounts: scrypt$n$r$p$<base64 salt>$<base64 digest> (see _migrate_legacy_users)
            _, n, r, p, salt, digest = parts
            got = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32)
            return hmac.compare_digest(got, base64.b64decode(digest))
        _, salt, digest = parts
        got = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), **_SCRYPT)
        return hmac.compare_digest(got, bytes.fromhex(digest))
    except ValueError:
        return False


_DUMMY_HASH = hash_password("not-a-real-password")  # checked when the email is unknown, so timing does not reveal which emails exist


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _migrate_legacy_users(conn: sqlite3.Connection) -> None:
    """An earlier version of the accounts code made `users` with `pw_hash` (no `zip`, text timestamps) in the same file. CREATE TABLE IF NOT
    EXISTS leaves that table alone, so every sign-in crashed on the missing `password_hash` column. Rebuild the table in the current shape,
    keep the accounts (their password hashes still verify), and drop the old sessions: those people simply sign in again."""
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
    if not cols or "password_hash" in cols or "pw_hash" not in cols:
        return
    conn.execute("PRAGMA foreign_keys=OFF")
    try:
        with conn:
            conn.execute("DROP TABLE IF EXISTS sessions")
            conn.execute("ALTER TABLE users RENAME TO users_legacy")
            conn.executescript(SCHEMA)
            conn.execute("INSERT INTO users (id, email, name, zip, password_hash, created_at) "
                         "SELECT id, lower(email), CASE WHEN trim(name) = '' THEN substr(email, 1, instr(email, '@') - 1) ELSE name END, NULL, pw_hash, "
                         "COALESCE(CAST(strftime('%s', created_at) AS INTEGER), CAST(strftime('%s', 'now') AS INTEGER)) FROM users_legacy")
            conn.execute("DROP TABLE users_legacy")
    finally:
        conn.execute("PRAGMA foreign_keys=ON")


def get_users_db() -> Iterator[sqlite3.Connection]:
    path = get_settings().users_db_path
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)  # FastAPI can run setup, route and teardown on different threads
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    _migrate_legacy_users(conn)
    conn.executescript(SCHEMA)
    try:
        yield conn
    finally:
        conn.close()


class SignupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80, description="Display name, shown in the header after sign-in.")
    email: str = Field(..., max_length=254)
    password: str = Field(..., min_length=8, max_length=128)
    zip: str | None = Field(None, max_length=40, description="Optional ZIP or neighborhood.")

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL.match(v):
            raise ValueError("not an email address")
        return v

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("empty name")
        return v


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=254)
    password: str = Field(..., max_length=128)


class User(BaseModel):
    id: int
    name: str
    email: str
    zip: str | None = None


class AuthResponse(BaseModel):
    token: str = Field(..., description="Opaque session token: send as `Authorization: Bearer <token>`.")
    expires_at: int = Field(..., description="Unix time when the session ends.")
    user: User


def _user(row: sqlite3.Row) -> User:
    return User(id=row["id"], name=row["name"], email=row["email"], zip=row["zip"])


def _new_session(db: sqlite3.Connection, user_id: int) -> tuple[str, int]:
    token, now = secrets.token_urlsafe(32), int(time.time())
    db.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
    db.execute("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
               (_token_hash(token), user_id, now, now + SESSION_SECONDS))
    db.commit()
    return token, now + SESSION_SECONDS


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None


def current_user(authorization: str | None = Header(None), db: sqlite3.Connection = Depends(get_users_db)) -> User:
    token = _bearer(authorization)
    row = token and db.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
        (_token_hash(token), int(time.time()))).fetchone()
    if not row:
        raise ApiError(401, "unauthenticated")
    return _user(row)


def _recent_failures(email: str) -> list[float]:
    cutoff = time.time() - FAILURE_WINDOW
    with _failures_lock:
        recent = [t for t in _failures.get(email, []) if t > cutoff]
        _failures[email] = recent
        return recent


@router.post("/signup", response_model=AuthResponse, status_code=201)
def signup(body: SignupRequest, response: Response, db: sqlite3.Connection = Depends(get_users_db)):
    response.headers["Cache-Control"] = "no-store"
    try:
        cur = db.execute("INSERT INTO users (email, name, zip, password_hash, created_at) VALUES (?,?,?,?,?)",
                         (body.email, body.name, (body.zip or "").strip() or None, hash_password(body.password), int(time.time())))
    except sqlite3.IntegrityError:
        raise ApiError(409, "email_taken") from None
    db.commit()
    row = db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    token, expires = _new_session(db, row["id"])
    return AuthResponse(token=token, expires_at=expires, user=_user(row))


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, response: Response, db: sqlite3.Connection = Depends(get_users_db)):
    response.headers["Cache-Control"] = "no-store"
    email = body.email.strip().lower()
    if len(_recent_failures(email)) >= MAX_FAILURES:
        raise ApiError(429, "too_many_attempts")
    row = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    ok = verify_password(body.password, row["password_hash"] if row else _DUMMY_HASH)
    if not (row and ok):
        with _failures_lock:
            _failures.setdefault(email, []).append(time.time())
        raise ApiError(401, "invalid_credentials")
    with _failures_lock:
        _failures.pop(email, None)
    token, expires = _new_session(db, row["id"])
    return AuthResponse(token=token, expires_at=expires, user=_user(row))


@router.get("/me", response_model=User)
def me(response: Response, user: User = Depends(current_user)):
    response.headers["Cache-Control"] = "no-store"
    return user


@router.post("/logout", status_code=204)
def logout(authorization: str | None = Header(None), db: sqlite3.Connection = Depends(get_users_db)):
    token = _bearer(authorization)
    if token:
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))
        db.commit()
    return Response(status_code=204, headers={"Cache-Control": "no-store"})
