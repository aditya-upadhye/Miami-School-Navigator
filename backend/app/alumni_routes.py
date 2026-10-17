"""Alumni survey: signed-in alumni say what field they work in today; the school page shows the split once enough people answered.

Why a survey: no public dataset says what graduates of a given school do for a living. This builds a real one, honestly labelled as
self-reported. Privacy: one answer per person per school (an answer can be changed or deleted), only a field from a fixed list and an
optional year are stored (no name, no free text), and the split is shown only once MIN_RESPONSES people answered, so no one can be
picked out. Answers live in the accounts database, not in the school database.
"""
from __future__ import annotations

import sqlite3
import time
from typing import Literal

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field as PField

from .auth import User, current_user, get_users_db
from .routes import get_nav
from .services.context import Navigator
from .services.errors import ApiError
from .services.schools import get_place

FIELDS = ["technology", "healthcare", "education", "business_finance", "engineering", "arts_media", "law_government",
          "skilled_trades", "military_safety", "science_research", "hospitality_retail", "other", "student_or_not_working"]
MIN_RESPONSES = 10
MAX_SCHOOLS_PER_PERSON = 10
SCHEMA = """
CREATE TABLE IF NOT EXISTS alumni_survey (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, place_id TEXT NOT NULL, field TEXT NOT NULL,
  grad_year INTEGER, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, place_id)
);
"""

router = APIRouter(prefix="/api", tags=["alumni survey"])


class SurveyAnswer(BaseModel):
    field: Literal[tuple(FIELDS)]  # type: ignore[valid-type]
    grad_year: int | None = PField(None, ge=1950, le=2100, description="The year they graduated or left. Optional.")


class SurveyShare(BaseModel):
    field: str
    count: int
    pct: float


class SurveyResponse(BaseModel):
    place_id: str
    responses: int
    min_responses: int = MIN_RESPONSES
    enough: bool = PField(description="False until `min_responses` people answered; the split is withheld until then.")
    breakdown: list[SurveyShare] = PField(default_factory=list, description="Share of answers per field, largest first. Empty until `enough`.")
    mine: SurveyAnswer | None = PField(None, description="The signed-in person's own answer, if any.")
    fields: list[str] = FIELDS


def _ready(db: sqlite3.Connection) -> None:
    db.executescript(SCHEMA)


def _school(nav: Navigator, school_id: str) -> dict:
    p = get_place(nav, school_id)
    if not {"elementary", "middle", "high"} & set(p["stages"]):
        raise ApiError(422, "survey_not_k12", params={"id": school_id})
    return p


def _summary(db: sqlite3.Connection, place_id: str, user_id: int | None) -> SurveyResponse:
    _ready(db)
    rows = db.execute("SELECT field, COUNT(*) n FROM alumni_survey WHERE place_id=? GROUP BY field ORDER BY n DESC", (place_id,)).fetchall()
    total = sum(r["n"] for r in rows)
    enough = total >= MIN_RESPONSES
    mine = None
    if user_id is not None:
        r = db.execute("SELECT field, grad_year FROM alumni_survey WHERE user_id=? AND place_id=?", (user_id, place_id)).fetchone()
        mine = SurveyAnswer(field=r["field"], grad_year=r["grad_year"]) if r else None
    return SurveyResponse(place_id=place_id, responses=total, enough=enough, mine=mine,
                          breakdown=[SurveyShare(field=r["field"], count=r["n"], pct=round(100 * r["n"] / total, 1)) for r in rows] if enough else [])


def _optional_user(authorization: str | None = Header(None), db: sqlite3.Connection = Depends(get_users_db)) -> int | None:
    try:
        return current_user(authorization, db).id
    except ApiError:
        return None


@router.get("/schools/{school_id}/alumni-survey", response_model=SurveyResponse)
def get_survey(school_id: str, user_id: int | None = Depends(_optional_user), db: sqlite3.Connection = Depends(get_users_db),
               nav: Navigator = Depends(get_nav)):
    """The split of alumni answers for a school (once enough people answered), and the caller's own answer if signed in."""
    return _summary(db, _school(nav, school_id)["id"], user_id)


@router.put("/schools/{school_id}/alumni-survey", response_model=SurveyResponse)
def put_survey(school_id: str, body: SurveyAnswer, user: User = Depends(current_user), db: sqlite3.Connection = Depends(get_users_db),
               nav: Navigator = Depends(get_nav)):
    """Add or change your own answer for a school. Signed-in only; one answer per person per school."""
    pid = _school(nav, school_id)["id"]
    _ready(db)
    exists = db.execute("SELECT 1 FROM alumni_survey WHERE user_id=? AND place_id=?", (user.id, pid)).fetchone()
    if not exists and db.execute("SELECT COUNT(*) FROM alumni_survey WHERE user_id=?", (user.id,)).fetchone()[0] >= MAX_SCHOOLS_PER_PERSON:
        raise ApiError(409, "survey_limit", params={"max": MAX_SCHOOLS_PER_PERSON})
    db.execute("INSERT INTO alumni_survey (user_id, place_id, field, grad_year, created_at) VALUES (?,?,?,?,?) "
               "ON CONFLICT(user_id, place_id) DO UPDATE SET field=excluded.field, grad_year=excluded.grad_year",
               (user.id, pid, body.field, body.grad_year, int(time.time())))
    db.commit()
    return _summary(db, pid, user.id)


@router.delete("/schools/{school_id}/alumni-survey", response_model=SurveyResponse)
def delete_survey(school_id: str, user: User = Depends(current_user), db: sqlite3.Connection = Depends(get_users_db),
                  nav: Navigator = Depends(get_nav)):
    """Remove your own answer."""
    pid = _school(nav, school_id)["id"]
    _ready(db)
    db.execute("DELETE FROM alumni_survey WHERE user_id=? AND place_id=?", (user.id, pid))
    db.commit()
    return _summary(db, pid, user.id)
