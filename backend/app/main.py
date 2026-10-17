"""FastAPI app. Run: uvicorn app.main:app --no-access-log   (access logs would record addresses in query strings)."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .alumni_routes import router as alumni_router
from .auth import router as auth_router
from .fit_routes import router as fit_router
from .config import get_settings
from .i18n import MESSAGES, LanguageMiddleware, current_lang, t
from .routes import router
from .services.context import load_navigator
from .services.errors import ApiError

log = logging.getLogger("app")
CACHEABLE = ("/api/schools", "/api/zones", "/api/dates", "/api/meta")


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    if not s.db_path.exists() and s.auto_ingest:
        from .ingest.build import build_database

        log.info("No database at %s: building from snapshots / county servers", s.db_path)
        try:
            build_database(s)
        except Exception:  # keep serving /api/health so the failure is visible
            log.exception("database build failed")
    owned = load_navigator(s) if s.db_path.exists() else None
    app.state.nav = owned
    yield
    if owned:  # close only the connection this lifespan opened
        owned.conn.close()


app = FastAPI(
    title="Miami-Dade School Navigator API",
    version="0.1.0",
    description=("Map-based school navigator for Miami-Dade County (infancy to 12th grade). Every metric is a `Field` with status, source, "
                 "url, as_of and method; missing data is returned as `not_available` with a reason and a next step. "
                 "Data: Miami-Dade County GIS, FLDOE, curated rules (see /api/meta/quality).\n\n"
                 "**Language.** Send `X-Lang: en | es | ht` on any request (or `?lang=`, which wins over the header) and the API writes its own "
                 "text (notes, `why` / `suggested_action` explanations, score reasons, questions to ask, compare labels, errors) in English, Spanish "
                 "or Haitian Creole. Missing or unknown values mean English. `POST /api/plan` and `POST /api/chat` also take a `lang` body field, "
                 "which wins for that request. `Field.method` is translated, but `verification: <level>` and the `Check:` marker inside it stay literal. `source`, `url`, school and place names, addresses and data values are never "
                 "translated. The Spanish and Haitian Creole texts are AI-written and have not been reviewed by a native speaker; English is authoritative."),
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=list(get_settings().cors_origins), allow_methods=["GET", "POST"], allow_headers=["*"])
app.add_middleware(LanguageMiddleware)  # added last = outermost: every /api handler, dependency and error handler sees the request language


@app.middleware("http")
async def privacy_headers(request: Request, call_next):
    resp = await call_next(request)
    # `private`: responses depend on a family's location, so shared caches must not store them.
    if request.method == "GET" and request.url.path.startswith(CACHEABLE) and resp.status_code == 200:
        resp.headers["Cache-Control"] = "private, max-age=300"
    return resp


@app.exception_handler(ApiError)
async def api_error(_: Request, exc: ApiError):
    message, action = exc.localized()
    return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": message, "suggested_action": action}})


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    message = str(exc.detail)
    key = f"err.http.{exc.status_code}"
    if key in MESSAGES and message == t(key, "en"):  # only the standard phrase ("Not Found") is translated; custom details stay as written
        message = t(key)
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": "http_error", "message": message, "suggested_action": None}})


def _validation_text(err: dict) -> str:
    """One pydantic error as text. English keeps pydantic's own wording; es/ht use the catalog (by error type) so no English leaks."""
    lang = current_lang()
    if lang == "en":
        return err.get("msg", "invalid value")
    typ, ctx = err.get("type", ""), err.get("ctx") or {}
    simple = {"missing": "val.missing", "float_parsing": "val.number", "float_type": "val.number", "int_parsing": "val.integer",
              "int_type": "val.integer", "int_from_float": "val.integer", "bool_parsing": "val.boolean", "bool_type": "val.boolean",
              "string_type": "val.string", "list_type": "val.list", "json_invalid": "val.json", "date_parsing": "val.date",
              "date_type": "val.date", "date_from_datetime_parsing": "val.date"}
    if typ in simple:
        return t(simple[typ])
    for typ_, key, ctx_key in (("greater_than_equal", "val.ge", "ge"), ("greater_than", "val.gt", "gt"), ("less_than_equal", "val.le", "le"),
                               ("less_than", "val.lt", "lt"), ("too_short", "val.too_short", "min_length"), ("too_long", "val.too_long", "max_length")):
        if typ == typ_ and ctx_key in ctx:
            return t(key, limit=ctx[ctx_key])
    if typ == "literal_error" and "expected" in ctx:
        expected = str(ctx["expected"])
        head, sep, last = expected.rpartition(" or ")
        return t("val.literal", expected=f"{head} {t('val.or')} {last}" if sep else expected)
    return t("val.invalid")


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(x) for x in first.get("loc", [])[1:])
    return JSONResponse(status_code=422, content={"error": {"code": "invalid_request", "message": f"{where}: {_validation_text(first)}".strip(": "),
                                                              "suggested_action": t("err.invalid_request.action")}})


app.include_router(router)
app.include_router(auth_router)
app.include_router(alumni_router)
app.include_router(fit_router)
