from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from .schemas import (ChatRequest, ChatResponse, CompareRequest, CompareResponse, DatesResponse, GeocodeResult, LookupResponse, OutcomesResponse, PathwayRequest,
                      PathwayResponse, PlanRequest, PlanResponse, SchoolDetail, SearchResponse, ZoneShapes, ZonesResult)
from .services import compare as compare_svc
from .services import dates as dates_svc
from .services import geocode as geocode_svc
from .services import meta as meta_svc
from .services import outcomes as outcomes_svc
from .services import pathway as pathway_svc
from .services import plan as plan_svc
from .services import schools as schools_svc
from .services import zones as zones_svc
from .chat.llm import LlmConfig
from .i18n import current_lang, use_lang
from .services.context import Navigator
from .services.errors import ApiError

router = APIRouter(prefix="/api")


def get_nav(request: Request) -> Navigator:
    nav = getattr(request.app.state, "nav", None)
    if nav is None:
        raise ApiError(503, "data_unavailable")
    return nav


def _csv(v: str | None) -> list[str]:
    return [x.strip() for x in v.split(",") if x.strip()] if v else []


@router.get("/health", tags=["meta"])
def health(request: Request):
    nav = getattr(request.app.state, "nav", None)
    llm = LlmConfig.from_env().describe()
    return {"status": "ok" if nav else "degraded", "database": bool(nav), "llm_configured": llm["configured"], "llm": {k: llm[k] for k in ("provider", "model")}}


@router.get("/geocode", response_model=GeocodeResult, tags=["location"])
def geocode(q: str = Query(..., description="Street address or 5-digit ZIP"), nav: Navigator = Depends(get_nav)):
    return geocode_svc.geocode(nav, q)


@router.get("/zones", response_model=ZonesResult, tags=["location"])
def zones(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), nav: Navigator = Depends(get_nav)):
    return zones_svc.zoned_for(nav, lat, lon)


@router.get("/zones/geojson", response_model=ZoneShapes, tags=["location"])
def zones_geojson(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), nav: Navigator = Depends(get_nav)):
    return zones_svc.zone_shapes(nav, lat, lon)


@router.get("/schools", response_model=SearchResponse, tags=["schools"])
def schools(
    lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180),
    radius_mi: float = Query(3.0, gt=0, le=25),
    kinds: str | None = Query(None, description="csv of public,charter,private,early_learning"),
    stage: str | None = Query(None, description="csv of infant_toddler,pre_k,elementary,middle,high"),
    free_only: bool = False,
    grade_min: str | None = Query(None, description="A-F; public/charter only"),
    specialties: str | None = Query(None, description="csv hard filter, e.g. STEM,Arts"),
    ese: bool = False, scholarship: bool = False,
    sort: str = Query("match", description="match | distance | grade | name"),
    limit: int = Query(20, ge=1, le=100),
    priorities: str | None = Query(None, description="csv; boosts the match score without filtering"),
    values: str | None = Query(None, description="csv of what matters most, from academics,programs,popularity,proximity; counts those factors extra in the match score without filtering"),
    q: str | None = Query(None, description="school-name text filter (use a large radius_mi to search the whole county)"),
    nav: Navigator = Depends(get_nav),
):
    return schools_svc.search(nav, lat=lat, lon=lon, radius_mi=radius_mi, kinds=_csv(kinds) or None, stages=_csv(stage) or None,
                              free_only=free_only, grade_min=grade_min, specialties=_csv(specialties) or None, ese=ese,
                              scholarship=scholarship, sort=sort, limit=limit, priorities=_csv(priorities) or None, q=q, values=_csv(values) or None)


@router.get("/schools/lookup", response_model=LookupResponse, tags=["schools"])
def school_lookup(q: str = Query(..., min_length=1, max_length=100, description="Words from the school's name."),
                  lat: float | None = None, lon: float | None = None, limit: int = Query(8, ge=1, le=20), nav: Navigator = Depends(get_nav)):
    """Find schools by name across the whole county, best match first. Used by the map's search box to jump to a school."""
    return schools_svc.lookup(nav, q, lat, lon, limit)


@router.get("/schools/{school_id}", response_model=SchoolDetail, tags=["schools"])
def school_detail(school_id: str, lat: float | None = Query(None, ge=-90, le=90), lon: float | None = Query(None, ge=-180, le=180),
                  nav: Navigator = Depends(get_nav)):
    return schools_svc.detail(nav, school_id, lat, lon)


@router.get("/schools/{school_id}/outcomes", response_model=OutcomesResponse, tags=["schools"])
def school_outcomes(school_id: str, nav: Navigator = Depends(get_nav)):
    """What graduates of this school go on to do: college and employment trend, course participation, notable alumni. Empty lists where a source has nothing."""
    return outcomes_svc.outcomes(nav, school_id)


@router.post("/compare", response_model=CompareResponse, tags=["schools"])
def compare(body: CompareRequest, nav: Navigator = Depends(get_nav)):
    return compare_svc.compare(nav, body.ids, body.lat, body.lon, body.radius_mi, body.priorities, body.values)


@router.post("/pathway", response_model=PathwayResponse, tags=["planning"])
def pathway(body: PathwayRequest, nav: Navigator = Depends(get_nav)):
    return pathway_svc.pathway(nav, body)


@router.post("/plan", response_model=PlanResponse, tags=["planning"])
def plan(body: PlanRequest, nav: Navigator = Depends(get_nav)):
    with use_lang(body.lang or current_lang()):  # an explicit body `lang` wins over the X-Lang header for this endpoint
        return plan_svc.plan(nav, body)


@router.get("/dates", response_model=DatesResponse, tags=["planning"])
def dates(nav: Navigator = Depends(get_nav)):
    return dates_svc.get_dates(nav)


@router.post("/chat", response_model=ChatResponse, tags=["assistant"])
def chat(body: ChatRequest, nav: Navigator = Depends(get_nav)):
    from .chat.agent import run_chat

    with use_lang(body.lang or current_lang()):
        return run_chat(nav, body)


@router.get("/meta/quality", tags=["meta"])
def quality(nav: Navigator = Depends(get_nav)):
    return meta_svc.quality_report(nav)
