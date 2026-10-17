"""The API contract (pydantic models, exported as OpenAPI at /openapi.json and backend/openapi.json).

Trust rule: every metric is a `Field` carrying its status and provenance. Missing data is never guessed; it comes back as
status `not_available` with a reason and a suggested next step.
"""
from __future__ import annotations

import datetime as _dt
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field as PField

Status = Literal["official", "derived", "reported_by_school", "curated", "not_available"]
Kind = Literal["public", "charter", "private", "early_learning"]
Stage = Literal["infant_toddler", "pre_k", "elementary", "middle", "high"]


class Field(BaseModel):
    """One value plus where it came from."""

    value: Any = None
    status: Status
    source: str = PField(description="Dataset or rule the value comes from (for not_available: where we looked).")
    url: str | None = None
    as_of: str | None = PField(None, description="Date the underlying data is current to (or was retrieved).")
    method: str | None = PField(None, description="How the value was obtained or computed.")
    why: str | None = PField(None, description="not_available only: why the value is missing.")
    suggested_action: str | None = PField(None, description="not_available only: what the family can do next.")


class Provenance(BaseModel):
    source: str
    url: str | None = None
    as_of: str | None = None


class GeocodeResult(BaseModel):
    lat: float
    lon: float
    matched_address: str
    source: str
    url: str | None = None
    confidence: float = PField(description="0-1. Address-point matches are high; a ZIP centroid is deliberately low.")
    precision: Literal["address", "zip"]
    method: str
    as_of: str | None = None
    note: str | None = None


class ZoneEntry(BaseModel):
    school_source_id: str
    school_name: str | None
    place_id: str | None = PField(None, description="Matching id in /api/schools, when the school is in the database.")
    field: Field


class ZonesResult(BaseModel):
    lat: float
    lon: float
    elementary: list[ZoneEntry]
    middle: list[ZoneEntry]
    high: list[ZoneEntry]
    note: str


class ZoneShapes(BaseModel):
    """GeoJSON FeatureCollection of the attendance zones that contain a location, for drawing on a map."""

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[dict[str, Any]] = PField(description="Each feature: a (Multi)Polygon plus properties level, school_name, school_source_id, place_id, source, url, as_of, method.")
    note: str


class ScoreFactor(BaseModel):
    factor: str
    points: float
    max_points: float
    detail: str


class SchoolSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: Kind
    name: str
    address: str | None
    city: str | None
    zip: str | None
    lat: float
    lon: float
    identity_source: Provenance
    stages: Field
    grades: Field
    distance_mi: Field | None = None
    zoned: Field | None = None
    state_grade: Field
    gains_ela: Field
    gains_math: Field
    enrollment: Field
    tuition: Field
    aftercare: Field
    is_magnet: Field
    specialties: Field
    ese: Field
    scholarship: Field
    phone: Field
    website: Field
    license: Field | None = None
    flags: list[Literal["online_school", "grade_match_unverified"]] = PField(
        default_factory=list,
        description="online_school: a virtual school with no campus to visit (its distance is only the office address). grade_match_unverified: the state grade was joined on a school number whose official names differ; confirm it is the same school.")
    match_score: int | None = None
    score_breakdown: list[ScoreFactor] = []
    reasons: list[str] = []


class SearchMeta(BaseModel):
    origin: dict[str, float]
    total_matching: int
    returned: int
    filters_applied: dict[str, Any]
    excluded: dict[str, int] = PField(default_factory=dict, description="How many candidates each hard filter removed.")
    notes: list[str] = []
    zones: ZonesResult | None = None
    data_available: dict[str, bool] = PField(default_factory=dict, description="Which optional datasets are loaded, e.g. state_grades, learning_gains, scholarship_flags, magnet_themes, ese_signals; lets a client disable a filter that cannot match.")


class SearchResponse(BaseModel):
    results: list[SchoolSummary]
    meta: SearchMeta


class ApplyStep(BaseModel):
    text: str
    rule_id: str
    field: Field


class Nearby(BaseModel):
    kind: Literal["park", "library"]
    name: str
    address: str | None
    distance_mi: Field


class SchoolDetail(BaseModel):
    school: SchoolSummary
    how_to_apply: list[ApplyStep]
    nearby_parks: list[Nearby]
    nearby_libraries: list[Nearby]
    questions_to_ask: list[str]
    links: dict[str, str]
    zones: ZonesResult | None = None
    notes: list[str] = []


class CompareRequest(BaseModel):
    ids: list[str] = PField(min_length=1, max_length=3)
    lat: float | None = None
    lon: float | None = None


class CompareRow(BaseModel):
    key: str
    label: str
    cells: list[Field]
    best_index: int | None = PField(None, description="Only set for numeric official fields where more is better.")
    best_rule: str | None = None


class CompareResponse(BaseModel):
    schools: list[dict[str, Any]]
    rows: list[CompareRow]
    notes: list[str] = []


class Child(BaseModel):
    age: int = PField(ge=0, le=21)
    name: str | None = None


class PathwayRequest(BaseModel):
    lat: float
    lon: float
    children: list[Child] = PField(min_length=1, max_length=6)
    free_only: bool = False


class PathwayOption(BaseModel):
    place_id: str | None = None
    name: str
    kind: str | None = None
    label: Field


class KeyDate(BaseModel):
    id: str
    label: str
    date: str
    approximate: bool
    days_until: int = PField(description="Negative once the date has passed.")
    applies_to: list[str]
    field: Field


class DatesResponse(BaseModel):
    dates: list[KeyDate]
    as_of: str | None = None
    notes: list[str] = []


class PathwayStage(BaseModel):
    stage: Stage
    label: str
    ages: str
    status: Literal["past", "current", "future"]
    options: list[PathwayOption]
    estimate_note: str | None = None
    key_dates: list[KeyDate] = []


class ChildPathway(BaseModel):
    child_index: int
    age: int
    name: str | None
    current_stage: Stage | None
    grade_label: str | None
    stages: list[PathwayStage]


class PathwayResponse(BaseModel):
    children: list[ChildPathway]
    zones: ZonesResult
    notes: list[str] = []


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatProfile(BaseModel):
    """What the family has already told us. Held for the request only; nothing is stored."""

    address: str | None = None
    lat: float | None = None
    lon: float | None = None
    children: list[Child] = []
    free_only: bool = False
    priorities: list[str] = []
    values: list[str] = []  # what matters most: academics, programs, popularity, proximity


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = PField(min_length=1)
    profile: ChatProfile = PField(default_factory=ChatProfile)
    lang: Literal["en", "es", "ht"] | None = PField(None, description="Language of the answer. Omit to use the X-Lang header (English when absent). Translations are AI-written and not yet reviewed by a native speaker.")


class Citation(BaseModel):
    id: str
    source: str
    url: str | None = None
    as_of: str | None = None
    status: str | None = None


class ChatResponse(BaseModel):
    answer: str
    citations: list[Citation]
    filters_applied: dict[str, Any]
    results: list[SchoolSummary]
    tool_calls: list[dict[str, Any]] = []
    usage: dict[str, int] = PField(default_factory=dict, description="Model calls and tokens used by this turn (for quota monitoring).")
    degraded: bool = PField(False, description="True when the AI model was unavailable and only structured results are returned.")
    warnings: list[str] = []


# ---------------------------------------------------------------------------------------------------------------- choice planner
class PlanChild(BaseModel):
    age: int = PField(ge=0, le=21, description="Age today. Ignored when birth_date is given.")
    name: str | None = None
    birth_date: _dt.date | None = PField(None, description="Optional. Exact eligibility depends on the September 1 cut-off, so a birth date gives exact answers; without it everything is estimated from age and labelled so.")


class PlanRequest(BaseModel):
    lat: float
    lon: float
    lang: Literal["en", "es", "ht"] | None = PField(None, description="Language of the generated text. Omit to use the X-Lang header (English when absent). Translations are AI-written and not yet reviewed by a native speaker; English is authoritative.")
    children: list[PlanChild] = PField(min_length=1, max_length=6)
    free_only: bool = False


class PlanItem(BaseModel):
    id: str
    title: str
    detail: str
    status: Literal["open", "closes_soon", "upcoming", "closed", "rolling", "info"]
    deadline: KeyDate | None = None
    rule_ids: list[str] = []
    field: Field = PField(description="Provenance of the main claim in `detail` (curated rule with its verification level, or an official/derived data field).")
    link: Literal["explore", "pathway", "scholarships"] | None = None


class Eligibility(BaseModel):
    key: Literal["vpk", "kindergarten"]
    label: str
    result: Literal["eligible", "later", "not_eligible"]
    exact: bool = PField(description="False when computed from age only; the September 1 cut-off then makes it an estimate.")
    year: str | None = PField(None, description="School year the child first qualifies, for result=later.")
    explanation: str
    field: Field


class ChildPlan(BaseModel):
    child_index: int
    name: str | None
    age_now: int
    age_at_cutoff: int
    age_basis: Literal["birth_date", "estimated_from_age"]
    entering: str = PField(description="What the child is doing in the planning year, e.g. 'Kindergarten', 'VPK (Pre-K 4)', 'Grade 2', 'Past 12th grade'.")
    stage: str
    transition_note: str | None = None
    zoned: ZoneEntry | None = None
    eligibility: list[Eligibility]
    items: list[PlanItem]


class GuideEntry(BaseModel):
    id: str
    program: str
    flag_labels: list[str]
    summary: Field
    schools_nearby: int = PField(description="Private schools within 5 miles whose FLDOE directory entry lists this program.")


class PlanResponse(BaseModel):
    lang: Literal["en", "es", "ht"] = "en"
    school_year: str
    cutoff_date: str
    today: str
    children: list[ChildPlan]
    key_dates: list[KeyDate]
    scholarship_guide: list[GuideEntry]
    scholarship_intro: Field | None = None
    notes: list[str] = []
