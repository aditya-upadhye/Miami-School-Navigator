"""Accounts API: /api/auth/* (sign up, log in, who am I, log out, change password, delete account) and /api/me/* (profile, saved schools).

Sessions are an HttpOnly cookie (`sn_session`); JSON bodies are required for every write, so a cross-site form cannot post here, and
SameSite=Lax keeps the cookie off cross-site requests. Responses are `Cache-Control: no-store`.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field as PField

from .accounts import MAX_PROFILE_BYTES, MAX_SAVED, Accounts, normalize_email, valid_email
from .config import get_settings
from .routes import get_nav
from .schemas import SchoolSummary
from .services import schools as schools_svc
from .services.context import Navigator
from .services.errors import ApiError

router = APIRouter(prefix="/api", tags=["accounts"])
COOKIE = "sn_session"


class Signup(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = PField(max_length=254)
    password: str = PField(min_length=8, max_length=128)
    name: str = PField("", max_length=100)
    profile: dict | None = PField(None, description="Optional: the profile the family built as a guest, saved with the new account.")


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = PField(max_length=254)
    password: str = PField(min_length=1, max_length=128)


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = PField(min_length=1, max_length=128)
    new_password: str = PField(min_length=8, max_length=128)


class PasswordConfirm(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: str = PField(min_length=1, max_length=128)


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile: dict = PField(description="Opaque to the API (address, children, priorities, language...). At most 16 KB of JSON.")
    name: str | None = PField(None, max_length=100)


class SaveBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note: str | None = PField(None, max_length=500)


class MergeBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ids: list[str] = PField(max_length=200, description="School ids saved as a guest; unknown ids are skipped.")


class User(BaseModel):
    id: int
    email: str
    name: str
    created_at: str
    profile: dict


class MeResponse(BaseModel):
    user: User | None


class SavedItem(BaseModel):
    place_id: str
    note: str
    saved_at: str
    school: SchoolSummary | None = PField(None, description="Null when the school is no longer in the dataset.")


class SavedResponse(BaseModel):
    items: list[SavedItem]
    limit: int


def accounts(request: Request) -> Accounts:
    acc = getattr(request.app.state, "accounts", None)
    if acc is None:
        raise ApiError(503, "data_unavailable")
    return acc


def optional_user(request: Request, acc: Accounts = Depends(accounts)) -> int | None:
    return acc.session_user(request.cookies.get(COOKIE))


def require_user(user_id: int | None = Depends(optional_user)) -> int:
    if user_id is None:
        raise ApiError(401, "not_signed_in")
    return user_id


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


def _set_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(COOKIE, token, max_age=30 * 86400, httponly=True, samesite=s.cookie_samesite, secure=s.cookie_secure, path="/")


def _client_key(request: Request, email: str) -> str:
    return f"{email}|{request.client.host if request.client else '?'}"


def _clean_profile(profile: dict) -> dict:
    if len(json.dumps(profile, separators=(",", ":"))) > MAX_PROFILE_BYTES:
        raise ApiError(422, "profile_too_large")
    return profile


# ---------------------------------------------------------------- auth
@router.post("/auth/signup", response_model=MeResponse, status_code=201)
def signup(body: Signup, response: Response, acc: Accounts = Depends(accounts)):
    _no_store(response)
    email = normalize_email(body.email)
    if not valid_email(email):
        raise ApiError(422, "invalid_email")
    profile = _clean_profile(body.profile) if body.profile else None
    uid = acc.create_user(email, body.password, body.name)
    if uid is None:
        raise ApiError(409, "email_taken")
    if profile:
        acc.set_profile(uid, profile)
    _set_cookie(response, acc.start_session(uid))
    return {"user": acc.user(uid)}


@router.post("/auth/login", response_model=MeResponse)
def login(body: Login, request: Request, response: Response, acc: Accounts = Depends(accounts)):
    _no_store(response)
    email = normalize_email(body.email)
    key = _client_key(request, email)
    if acc.throttle.blocked(key):
        raise ApiError(429, "too_many_attempts")
    uid = acc.check_login(email, body.password)
    if uid is None:  # same answer for an unknown email and a wrong password
        acc.throttle.fail(key)
        raise ApiError(401, "invalid_credentials")
    acc.throttle.clear(key)
    _set_cookie(response, acc.start_session(uid))
    return {"user": acc.user(uid)}


@router.get("/auth/me", response_model=MeResponse)
def me(response: Response, user_id: int | None = Depends(optional_user), acc: Accounts = Depends(accounts)):
    """Signed out is a normal answer ({"user": null}), not an error."""
    _no_store(response)
    return {"user": acc.user(user_id) if user_id else None}


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, acc: Accounts = Depends(accounts)):
    acc.end_session(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE, path="/")
    _no_store(response)
    response.status_code = 204
    return response


@router.post("/auth/password", status_code=204)
def change_password(body: PasswordChange, request: Request, response: Response, user_id: int = Depends(require_user),
                    acc: Accounts = Depends(accounts)):
    """Other devices are signed out; this one stays."""
    user = acc.user(user_id)
    if acc.check_login(user["email"], body.current_password) is None:
        raise ApiError(403, "wrong_password")
    acc.change_password(user_id, body.new_password, keep_token=request.cookies.get(COOKIE))
    _no_store(response)
    response.status_code = 204
    return response


@router.post("/auth/delete-account", status_code=204)
def delete_account(body: PasswordConfirm, response: Response, user_id: int = Depends(require_user), acc: Accounts = Depends(accounts)):
    """Deletes the account, its saved schools, its profile (including any address) and every session."""
    user = acc.user(user_id)
    if acc.check_login(user["email"], body.password) is None:
        raise ApiError(403, "wrong_password")
    acc.delete_user(user_id)
    response.delete_cookie(COOKIE, path="/")
    _no_store(response)
    response.status_code = 204
    return response


# ---------------------------------------------------------------- profile and saved schools
@router.put("/me/profile", response_model=MeResponse)
def put_profile(body: ProfileUpdate, response: Response, user_id: int = Depends(require_user), acc: Accounts = Depends(accounts)):
    _no_store(response)
    acc.set_profile(user_id, _clean_profile(body.profile), body.name)
    return {"user": acc.user(user_id)}


@router.get("/me/saved", response_model=SavedResponse)
def list_saved(response: Response, lat: float | None = Query(None, ge=-90, le=90), lon: float | None = Query(None, ge=-180, le=180),
               user_id: int = Depends(require_user), acc: Accounts = Depends(accounts), nav: Navigator = Depends(get_nav)):
    """Saved schools, newest first, each with the same summary the search returns (distance when lat/lon are given)."""
    _no_store(response)
    origin = (lat, lon) if lat is not None and lon is not None else None
    items = []
    for row in acc.saved(user_id):
        try:
            school = schools_svc.summarize(nav, schools_svc.get_place(nav, row["place_id"]), origin=origin)
        except ApiError:  # the dataset changed under it: keep the row so the family can remove it
            school = None
        items.append({**row, "school": school})
    return {"items": items, "limit": MAX_SAVED}


@router.put("/me/saved/{school_id}", response_model=SavedResponse)
def save_school(school_id: str, response: Response, body: SaveBody | None = None, user_id: int = Depends(require_user),
                acc: Accounts = Depends(accounts), nav: Navigator = Depends(get_nav)):
    """Save (or update the note on) a school. Idempotent."""
    schools_svc.get_place(nav, school_id)  # 404 school_not_found for an unknown id
    if acc.save(user_id, school_id, body.note if body else None) == "limit":
        raise ApiError(409, "saved_limit")
    return list_saved(response, None, None, user_id, acc, nav)


@router.delete("/me/saved/{school_id}", response_model=SavedResponse)
def unsave_school(school_id: str, response: Response, user_id: int = Depends(require_user), acc: Accounts = Depends(accounts),
                  nav: Navigator = Depends(get_nav)):
    acc.unsave(user_id, school_id)
    return list_saved(response, None, None, user_id, acc, nav)


@router.post("/me/saved/merge", response_model=SavedResponse)
def merge_saved(body: MergeBody, response: Response, user_id: int = Depends(require_user), acc: Accounts = Depends(accounts),
                nav: Navigator = Depends(get_nav)):
    """Add the schools a family saved as a guest. Unknown ids and anything over the limit are skipped; existing notes are kept."""
    for sid in dict.fromkeys(body.ids):
        try:
            schools_svc.get_place(nav, sid)
        except ApiError:
            continue
        if acc.save(user_id, sid) == "limit":
            break
    return list_saved(response, None, None, user_id, acc, nav)
