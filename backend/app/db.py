"""SQLite access. One read-mostly database built by app.ingest.build; handlers only SELECT."""
from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE places (
  id TEXT PRIMARY KEY, source_layer TEXT NOT NULL, source_id TEXT NOT NULL, kind TEXT NOT NULL,
  name TEXT NOT NULL, address TEXT, city TEXT, zip TEXT, phone TEXT, website TEXT,
  lat REAL NOT NULL, lon REAL NOT NULL, grades_text TEXT, stage_flags TEXT NOT NULL DEFAULT '[]',
  enrollment INTEGER, is_magnet INTEGER, magnet_themes TEXT,
  state_grade TEXT, state_grade_year INTEGER, gains_ela REAL, gains_math REAL,
  ese_signal TEXT, scholarship_flags TEXT,
  site_type TEXT, capacity INTEGER, state_key TEXT, join_confidence REAL, extra TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX ix_places_geo ON places(lat, lon);
CREATE INDEX ix_places_kind ON places(kind);
CREATE TABLE zones (level TEXT NOT NULL, school_source_id TEXT NOT NULL, school_name TEXT, geometry BLOB NOT NULL);
CREATE TABLE pois (kind TEXT NOT NULL, name TEXT NOT NULL, address TEXT, lat REAL NOT NULL, lon REAL NOT NULL,
  source_layer TEXT NOT NULL, source_id TEXT);
CREATE INDEX ix_pois_geo ON pois(lat, lon);
CREATE TABLE datasets (name TEXT PRIMARY KEY, title TEXT, url TEXT, retrieved_at TEXT, record_count INTEGER,
  as_of TEXT, notes TEXT);
CREATE TABLE zip_centroids (zip TEXT PRIMARY KEY, lat REAL NOT NULL, lon REAL NOT NULL);
CREATE TABLE quality (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""


def connect(path: Path, readonly: bool = False) -> sqlite3.Connection:
    if readonly:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, check_same_thread=False)
    else:
        conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
