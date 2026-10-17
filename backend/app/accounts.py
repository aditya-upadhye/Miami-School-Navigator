"""Family accounts: sign-up, login, server-side sessions, a saved profile and saved schools.

Kept in its OWN SQLite file (USERS_DB_PATH, default data/users.db) so rebuilding the read-only school database with
`python -m app.ingest.build` can never delete families' data. Passwords are hashed with scrypt (stdlib, per-user salt) and never
stored or logged in clear; a session cookie holds a random token whose SHA-256 is all the database keeps. Nothing here is exposed by
the school endpoints, and school contact emails are still never returned (this is the family's own sign-in email only).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import threading
import time
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '',
  pw_hash TEXT NOT NULL, created_at TEXT NOT NULL, profile TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, expires_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS saved (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, place_id TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, PRIMARY KEY (user_id, place_id)
);
"""

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
SESSION_DAYS = 30
MAX_SAVED = 200
MAX_PROFILE_BYTES = 16_384
MAX_NOTE = 500
SCRYPT = {"n": 2**14, "r": 8, "p": 1}


def normalize_email(email: str) -> str:
    return email.strip().lower()


def valid_email(email: str) -> bool:
    return len(email) <= 254 and bool(EMAIL_RE.match(email))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **SCRYPT, dklen=32)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return f"scrypt${SCRYPT['n']}${SCRYPT['r']}${SCRYPT['p']}${b64(salt)}${b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, digest = stored.split("$")
        got = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(got, base64.b64decode(digest))
    except Exception:  # malformed hash: treat as a failed login, never a crash
        return False


# A real hash of a throwaway password, checked when the email is unknown so both outcomes take the same time.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(8))


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class LoginThrottle:
    """In-memory brake on password guessing: MAX failures per key (email + client) inside WINDOW seconds. Resets on restart; a
    production deployment would put this in a shared store."""

    MAX, WINDOW = 5, 15 * 60

    def __init__(self):
        self._fails: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str) -> list[float]:
        cutoff = time.time() - self.WINDOW
        recent = [t for t in self._fails.get(key, []) if t > cutoff]
        self._fails[key] = recent
        return recent

    def blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._recent(key)) >= self.MAX

    def fail(self, key: str) -> None:
        with self._lock:
            self._recent(key).append(time.time())

    def clear(self, key: str) -> None:
        with self._lock:
            self._fails.pop(key, None)


class Accounts:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.executescript(SCHEMA)
        self.lock = threading.Lock()  # one connection shared by the threadpool: serialize writes
        self.throttle = LoginThrottle()

    def close(self) -> None:
        self.conn.close()

    # ---------------------------------------------------------------- users
    def create_user(self, email: str, password: str, name: str = "") -> int | None:
        """New user id, or None when the email is already registered."""
        with self.lock:
            try:
                cur = self.conn.execute("INSERT INTO users(email, name, pw_hash, created_at) VALUES (?,?,?,?)",
                                        (email, name.strip()[:100], hash_password(password), _now_iso()))
                self.conn.commit()
                return cur.lastrowid
            except sqlite3.IntegrityError:
                return None

    def check_login(self, email: str, password: str) -> int | None:
        row = self.conn.execute("SELECT id, pw_hash FROM users WHERE email=?", (email,)).fetchone()
        ok = verify_password(password, row["pw_hash"] if row else _DUMMY_HASH)
        return row["id"] if row and ok else None

    def user(self, user_id: int) -> dict | None:
        r = self.conn.execute("SELECT id, email, name, created_at, profile FROM users WHERE id=?", (user_id,)).fetchone()
        if r is None:
            return None
        return {"id": r["id"], "email": r["email"], "name": r["name"], "created_at": r["created_at"], "profile": json.loads(r["profile"])}

    def set_profile(self, user_id: int, profile: dict, name: str | None = None) -> None:
        with self.lock:
            self.conn.execute("UPDATE users SET profile=? WHERE id=?", (json.dumps(profile, separators=(",", ":")), user_id))
            if name is not None:
                self.conn.execute("UPDATE users SET name=? WHERE id=?", (name.strip()[:100], user_id))
            self.conn.commit()

    def change_password(self, user_id: int, new_password: str, keep_token: str | None = None) -> None:
        with self.lock:
            self.conn.execute("UPDATE users SET pw_hash=? WHERE id=?", (hash_password(new_password), user_id))
            keep = _hash_token(keep_token) if keep_token else ""
            self.conn.execute("DELETE FROM sessions WHERE user_id=? AND token_hash<>?", (user_id, keep))  # other devices sign out
            self.conn.commit()

    def delete_user(self, user_id: int) -> None:
        with self.lock:  # sessions and saved rows go with the user (ON DELETE CASCADE)
            self.conn.execute("DELETE FROM users WHERE id=?", (user_id,))
            self.conn.commit()

    # ---------------------------------------------------------------- sessions
    def start_session(self, user_id: int) -> str:
        token = secrets.token_urlsafe(32)
        with self.lock:
            self.conn.execute("DELETE FROM sessions WHERE expires_at < ?", (time.time(),))  # tidy expired rows as we go
            self.conn.execute("INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
                              (_hash_token(token), user_id, _now_iso(), time.time() + SESSION_DAYS * 86400))
            self.conn.commit()
        return token

    def session_user(self, token: str | None) -> int | None:
        if not token:
            return None
        r = self.conn.execute("SELECT user_id, expires_at FROM sessions WHERE token_hash=?", (_hash_token(token),)).fetchone()
        return r["user_id"] if r and r["expires_at"] > time.time() else None

    def end_session(self, token: str | None) -> None:
        if token:
            with self.lock:
                self.conn.execute("DELETE FROM sessions WHERE token_hash=?", (_hash_token(token),))
                self.conn.commit()

    # ---------------------------------------------------------------- saved schools
    def saved(self, user_id: int) -> list[dict]:
        rows = self.conn.execute("SELECT place_id, note, created_at FROM saved WHERE user_id=? ORDER BY created_at DESC, rowid DESC",
                                 (user_id,)).fetchall()
        return [{"place_id": r["place_id"], "note": r["note"], "saved_at": r["created_at"]} for r in rows]

    def save(self, user_id: int, place_id: str, note: str | None = None) -> str:
        """Add or update a saved school. Returns 'ok' or 'limit' (too many saved)."""
        with self.lock:
            exists = self.conn.execute("SELECT 1 FROM saved WHERE user_id=? AND place_id=?", (user_id, place_id)).fetchone()
            if not exists:
                n = self.conn.execute("SELECT COUNT(*) FROM saved WHERE user_id=?", (user_id,)).fetchone()[0]
                if n >= MAX_SAVED:
                    return "limit"
                self.conn.execute("INSERT INTO saved(user_id, place_id, note, created_at) VALUES (?,?,?,?)",
                                  (user_id, place_id, (note or "")[:MAX_NOTE], _now_iso()))
            elif note is not None:
                self.conn.execute("UPDATE saved SET note=? WHERE user_id=? AND place_id=?", (note[:MAX_NOTE], user_id, place_id))
            self.conn.commit()
            return "ok"

    def unsave(self, user_id: int, place_id: str) -> None:
        with self.lock:
            self.conn.execute("DELETE FROM saved WHERE user_id=? AND place_id=?", (user_id, place_id))
            self.conn.commit()
