# Prompt for Archie: Miami-Dade School Navigator

You are building **Miami-Dade School Navigator** from scratch: a map-based, trustworthy school-finding tool for Miami-Dade County families, covering infant care through 12th grade (public, charter, magnet, private, and early learning). It has a FastAPI backend with a tool-calling chat agent ("Navi") and a React frontend. It must work end to end, be grounded in real data with visible sources, and be fully usable in English, Spanish, and Haitian Creole.

Work in the phases below, in order. Finish each phase and run its checks before starting the next. After each phase, give me a short status: what works, what you could not verify, and anything you need from me. Never fake data, a test result, or a source URL. If something is blocked (for example a download that needs a browser), stop and tell me exactly what to do.

I attached `Backend-Spec.md`, the original brief. Treat it as the source of truth for the data sources, trust rules, API list, and golden tests. This prompt adds the product, frontend, and account details.

---

## 0. Non-negotiable principles

1. **Trust rules.** Every metric returned by the API is a `Field`: `{value, status, source, url, as_of, method}` with `status` in `official | derived | reported_by_school | curated | not_available`. Missing data is never guessed. It comes back as `not_available` with `why` and `suggested_action` (for example "Ask the school"), and school detail includes a `questions_to_ask` list. Never invent tuition, ratings, reviews, aftercare hours, photos, student-teacher ratios, or "safe" walking routes.
2. **Privacy.** No scraping. No Google services (use OpenStreetMap/Leaflet and the Census geocoder fallback). Never ingest or return email, director, or principal fields (add a test that scans the database for `@`). Run uvicorn with `--no-access-log` because query strings can contain addresses. Geocode lookups are cached in memory only (about 1 hour), never written to disk or logs. Secrets live in environment variables only, with a `.env.example` and no real keys in the repo.
3. **Handlers never call county servers.** Ingest once into SQLite and committed gzip snapshots. Snapshots double as the "county is down" fallback.
4. **Match score is not a black box.** Return every factor in `score_breakdown` with `reasons[]`. Factors that cannot apply are left out of `possible`, not counted as 0.
5. **Language never changes logic.** Filtering, scoring, ranking, counts, statuses, and dates are identical in every language. Only the text differs.
6. **Tests are offline** and must pass before each phase is called done.

## 1. Stack

- **Backend:** Python 3.11, FastAPI (auto OpenAPI, exported to `backend/openapi.json`), SQLite, Shapely (STRtree), httpx, pandas, openpyxl, xlrd, pydantic v2, pytest. Dockerfile included.
- **Frontend:** React 18, Vite, React Router, Leaflet, vitest. Plain CSS with design tokens and light/dark theme. Self-host the fonts (Outfit for headings, Figtree for body). No UI framework is required.
- **Layout:** monorepo with `backend/` and `frontend/`, a root `README.md`, and per-folder READMEs. The Vite dev server on :5173 proxies `/api` to the backend on :8000.
- **LLM:** any OpenAI-compatible `/chat/completions` endpoint with native tool calling, chosen by env vars. Default is Gemma via Google's OpenAI-compatible Gemini endpoint (`LLM_PROVIDER=gemini`, `GEMINI_API_KEY`). Also support `groq`, `openrouter`, `together`, `nvidia`, `cerebras`, `openai`, `ollama`, `vllm`, and `custom` (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`).

## 2. Phase 1: Backend foundation and data ingest

Build `backend/app/` with `main.py`, `config.py`, `db.py`, `schemas.py`, `domain.py`, `routes.py`, `services/`, and `ingest/`.

**Ingest** (`python -m app.ingest.build [--refresh]`; auto-run on first start when `AUTO_INGEST=true`):
- Miami-Dade County GIS open data (ArcGIS REST, request `outSR=4326`, paginate with `resultOffset` because MaxRecordCount is 1000):
  - Public schools, charters, private schools, daycare, Head Start, libraries, and municipal libraries from `CommunityServices/MD_Educational`.
  - Elementary, middle, and high attendance zones from the same service.
  - County and municipal parks from `MD_RecreationCulture`.
  - ZIP polygons and county address points from `AddressSearchMap_PropertiesWithZip`.
  - **Verify every endpoint and layer id in a browser or with a probe first.** Do not assume the layer numbers. Record what you actually found.
- Save each layer as `backend/data/snapshots/county_<name>.json.gz` and store `retrieved_at` and `record_count` per dataset in a `datasets` table.
- **FLDOE Excel files** (fldoe.org blocks scripted downloads, so STOP and ask me to download them in a browser into `backend/data/raw/fldoe/`): the 2025-26 school grades workbook (with ELA and math learning gains), the Miami-Dade private school directory (with scholarship flags, grade levels, accreditation), and the charter school list (an HTML table saved as .xls). Detect each file by content, not filename. Join M-DCPS schools on state school number (district 13 plus number). Charters need a name-similarity guard: reject a number match whose names do not resemble each other and list it under `charter_number_matches_rejected_for_name_mismatch` in `/api/meta/quality`. Match private schools by name, address, and ZIP with a confidence score. Unmatched schools stay `not_available`.
- **Curated files** in `backend/data/curated/`:
  - `rules.json`: magnet window (opens Oct 1, closes Jan 15 for the 2027-28 cycle, to be confirmed on dadeschools.net), lottery, up to 5 programs at up to 5 schools, must apply even if zoned, results around Mar 15, VPK requires age 4 by Sept 1, scholarships through Step Up For Students / AAA, charters run their own lotteries. Every entry has `source`, `url`, `verified_on`, `verification` (`confirmed_district_source | single_secondary_source | unconfirmed_project_spec | other_district_policies`), and `i18n.es` / `i18n.ht` text.
  - `magnet_themes.json`: ships empty on purpose. Magnet status is `not_available` until a human adds 20-30 verified schools. Specialty matching otherwise falls back to keywords in the official school name, labelled `derived`.

**Data model:** `places`, `zones`, `pois`, `datasets`, as in `Backend-Spec.md`.

**Phase 1 checks:** `/api/health`, `/api/meta/quality` (dataset freshness, counts, zone self-check, FLDOE join coverage, rule verification levels, active LLM provider/model, never the key). Zone self-check: each public elementary school's own point falls inside its own zone (target >= 95%). Report join coverage for public and charter schools.

## 3. Phase 2: Core API

Implement these endpoints. Errors are always `{"error": {"code", "message", "suggested_action"}}`.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/geocode?q=` | County address points, then Census geocoder, then ZIP centroid (confidence 0.4, flagged approximate). Returns lat, lon, matched address, source, confidence. |
| `GET /api/zones?lat&lon` | Zoned elementary, middle, and high school (point-in-polygon). |
| `GET /api/zones/geojson?lat&lon` | The zone polygons for that location as GeoJSON, simplified to about 5 m, each with source, date, and method. |
| `GET /api/schools?lat&lon&radius_mi&kinds&stage&free_only&grade_min&specialties&ese&scholarship&sort&limit&priorities&q` | Search. Returns `{results, meta}`. `meta.excluded` counts what each hard filter removed, and `meta.notes` states each filter's limits. `priorities` boosts the score but never filters. `q` is a name lookup. |
| `GET /api/schools/{id}?lat&lon` | Detail: Field-wrapped metrics, `how_to_apply`, nearby parks and libraries, `questions_to_ask`, links. |
| `POST /api/compare {ids<=3}` | Aligned rows. `best_index` is set only on numeric official fields (learning gains). |
| `POST /api/pathway {lat,lon,children[{age}]}` | Stages with options and key dates. Middle and high options are labelled "estimated from overlapping attendance zones". |
| `POST /api/plan {lat,lon,lang?,children[{age,name,birth_date?}],free_only}` | Planner for the 2027-28 year, with the planning year read from `rules.json`. Per child: entering grade, VPK and kindergarten eligibility on the Sept 1 cut-off (exact with a birth date, labelled an estimate from age alone), a dated checklist (magnet window with open/closing/closed status, VPK, charters, private), the zoned school, key dates, and a scholarship guide with counts of nearby private schools per program. |
| `GET /api/dates` | Key dates from `rules.json` with `days_until`, source, and verification level. |

**Match score** (`score = 100 x earned / possible`): zoned for this address 25 (public only), distance 30 (linear over the radius), state grade 20 (A 1.0, B 0.75, C 0.4, D 0.15, F 0; public and charter with a grade), priority matches 15 (when `priorities` is given), accepts scholarships 10 (private, when `scholarship=true`). Hard filters: stage (age fit), free-only (keeps public and charter), grade floor, specialties, ESE, scholarship.

Write pytest coverage for the geocoder, zones, search filters, score breakdown, compare, pathway, plan, dates, and the not_available behavior.

## 4. Phase 3: Languages (EN / ES / HT)

- A pure-ASGI `LanguageMiddleware` reads `X-Lang: en | es | ht` (or `?lang=`, which wins) into a contextvar. A missing or unknown value means English and is never an error. `es-US` and `ES` are read as `es`. Responses carry `Content-Language` and `Vary: X-Lang`.
- One catalog in `app/i18n.py` with `(en, es, ht)` tuples per key, using prefixes such as `na.*`, `act.*`, `score.*`, `note.*`, `q.*`, `cmp.*`, `path.*`, `zone.*`, `geo.*`, `dates.*`, `m.*`, `chat.*`, `err.*`, `val.*`. `t(key, lang=None, **vars)` is the single translation function. English output stays identical to the untranslated version.
- Translate: every `why` and `suggested_action`, score reasons, notes, questions to ask, how-to-apply text, compare row labels, pathway labels, error messages (including 422 validation errors), planner output, and dates written the local way (`15 de enero de 2027`, `15 janvye 2027`).
- Leave in English on purpose: `Field.source`, `Field.url`, dataset titles, school and place names, addresses, official acronyms (M-DCPS, VPK, ESE, FES), and `/api/meta/quality`.
- Tests: all three languages have identical keys and `{placeholders}`, and a test confirms that results are identical across languages apart from the text.
- Mark the ES and HT text in the README as AI-written and not yet reviewed by a native speaker.

## 5. Phase 4: Chat agent ("Navi")

Build `backend/app/chat/` with `agent.py`, `llm.py`, `tools.py`, and `citations.py`. `POST /api/chat {messages, profile, lang}` returns `{answer, citations[], filters_applied, results[], usage, degraded?, warnings?}`.

- **Tools:** `geocode, get_zones, search_schools, get_school, compare, get_dates, get_pathway`. They call the same services as the REST API. Tools run in English so grounding is language-independent. The model writes the final answer in `lang`.
- **System prompt rules:** answer ONLY from tool results; cite every claim; for `not_available`, say so and give the next step; never answer rules or dates from memory (always call `get_dates`); no rankings beyond the official A-F grade; never call a school or route "safe"; keep school names and official terms unchanged; at most 4 tool calls per turn; low temperature (0.1).
- **Server-side enforcement** (do not rely on prompting alone):
  - A hard 4-call budget. Extra calls get an error result, and the last model call has tools disabled.
  - Compact JSON tool results where every field carries a `cite` id. Validate citation markers against that registry, strip unknown ids, and renumber them `[1]..[n]`.
  - Any dollar amount that no tool returned triggers one rewrite, then redaction.
  - School cards returned beside the answer are rebuilt in the family's language.
- **LLM adapter:** speaks standard `/chat/completions` with tools. It drops `temperature` or `tool_choice` if a provider rejects them, retries 429/5xx, strips `<think>` blocks, tolerates missing tool-call ids, and falls back to folding the system prompt into the first user message (`LLM_SYSTEM_MODE=auto|system|fold`). It supports client-side `LLM_RPM` and `LLM_TPM` throttles (the free Gemma tier is about 16K tokens per minute) and `LLM_EXTRA_BODY`.
- **Resilience:** each route retries 3 times, then falls through to the next route: the main model, then `LLM_FALLBACK_MODEL`, then `LLM_BACKUPS` (`provider:model[@max calls per UTC day]`, each using its own provider's key). A failed route is skipped for 60 s (10 minutes after a bad key). Paid providers default to a 600 calls/day cap. If every route fails, return `degraded: true` with structured results, and still parse a ZIP, street address, and children's ages from what the family typed. Never invent an answer.
- **Scripts:** `scripts/llm_check.py` (tool-calling check, plus an ES and HT sample, plus `--backups`) and `scripts/golden.py` with the 10 golden cases from `Backend-Spec.md`. Also add `scripts/check_addresses.py`, `scripts/export_openapi.py`, and `scripts/snapshot_county.py`.
- Chat tests must run offline with a fake model, covering the call budget, citation validation, amount redaction, degraded mode, and the "is it safe to walk to school" refusal.

## 6. Phase 5: Accounts

A separate SQLite file (`USERS_DB_PATH`, default `data/users.db`, git-ignored) so rebuilding the school database never deletes family data.

- Endpoints: `POST /api/auth/signup | login | logout`, `GET /api/auth/me` (returns `{user: null}` when signed out, which is not an error), `POST /api/auth/password`, `POST /api/auth/delete-account`, `PUT /api/me/profile` (opaque JSON up to 16 KB), `GET /api/me/saved`, `PUT|DELETE /api/me/saved/{id}` (max 200, optional note), `POST /api/me/saved/merge {ids}`.
- Security: scrypt password hashing; an HttpOnly `sn_session` cookie; the same 401 for an unknown email and a wrong password; at most 5 failed logins per email and client per 15 minutes, then 429; changing the password signs out other devices; deleting the account removes the profile (including the address), saved schools, and sessions; both need the current password. Support `COOKIE_SECURE` and `COOKIE_SAMESITE` env vars.
- Out of scope: password reset by email, social login. List these as known limits.
- Guests store nothing on the server.

## 7. Phase 6: Frontend

React app under `frontend/src/` with `api/`, `auth/`, `components/`, `hooks/`, `i18n/`, `pages/`, and `profile/`. Design goal: warm, clear, family-friendly, and mobile-first, with a Miami identity (skyline illustration on the landing page, a sunny palette), light and dark themes, and WCAG-minded contrast, focus states, and labels.

**Routes:**

| Route | Behavior |
| --- | --- |
| `/` | Landing: hero, address signup card, skyline, language buttons. |
| `/onboarding` | Chat with Navi OR a form. The address is geocoded, then children (ages), free-only, and priorities (STEM, Arts, Bilingual, IB, Montessori only, because the backend can only score those) are saved as the family profile. |
| `/explore` | The main screen. Filters panel and active filter chips, result cards with match score and expandable reasons, a Leaflet map (home pin, travel-radius ring, numbered school pins, toggleable elementary/middle/high zone boundaries from `/api/zones/geojson`), side-by-side compare of up to 3 schools, a key-dates list, a floating Navi chat, and a header box that geocodes a new address or ZIP. |
| `/school/:id` | Detail: every field with its status badge, how to apply, nearby parks and libraries, questions to ask, and an explicit list of what we do not have. |
| `/pathway` | Per-child timeline from infant care to 12th grade. Middle and high school are labelled as estimates. |
| `/planner` | The `/api/plan` result, with optional birth dates for an exact answer, a dated checklist, a scholarship guide, and an **Add dates to my calendar (.ics)** download with 7-day reminders. Each step shows how well its rule is confirmed. |
| `/login`, `/signup`, `/account` | Family accounts, with `?next=` support. `/account` needs a session and offers change password and delete account. |
| `/saved` | Saved schools, each with a note. Guests can save too (ids in `localStorage`, merged into the account at sign-in). |

**Cross-cutting requirements:**
- A `FieldBadge` shows each Field's status, with source, date, and method on hover. Missing data is shown as missing, with the next step.
- An EN / ES / HT switcher in the header of every screen. The language is kept per tab (`sessionStorage`), sets `<html lang>`, and is sent as `X-Lang` on every request. Interface text lives in `src/i18n/catalog/*.js`, one file per area, with a glossary README. Tests check identical keys and placeholders across the 3 languages, and that no used key is missing.
- The family profile uses `sessionStorage` for guests (the address is gone when the tab closes) and is stored server-side for signed-in families. Until a family enters theirs, use a clearly labelled **demo family** (2 kids, ages 3 and 7, near 33127, free only, STEM).
- Map: Leaflet + OpenStreetMap tiles, no Google. The dark theme inverts the tiles. Show a notice if tiles fail, with pins and zones still working. Make `VITE_MAP_TILE_URL` and `VITE_MAP_ATTRIBUTION` configurable. `VITE_API_BASE_URL` sets the API for deployed builds.
- **Do NOT build** parent ratings or reviews, students-per-teacher, "what parents say", a campus walk, neighborhood-safety notes, walking routes, a career picker or outcomes charts, sample open-house dates, or voice buttons. No data stands behind them.
- Loading, empty, and error states on every data screen. Keyboard-navigable map controls and cards.
- vitest tests for field formatting, the API client, map helpers, calendar (.ics) export, account logic, i18n parity, and explore filter logic.

## 8. Phase 7: Hardening, docs, and delivery

- Fallbacks: county down falls back to the snapshot, the geocoder falls back to Census and then the ZIP centroid, and the LLM falls back to structured results only.
- Dockerfile for the backend (`docker run -p 8000:8000 -e GEMINI_API_KEY ...`). Use an MIT license for the code, and note that county and FLDOE data terms need checking and attribution.
- READMEs: root (quickstart), backend (data sources table, trust rules, API table, match-score table, chat agent, languages, what I must add manually), frontend (screens table, languages, how data is shown, known limits).
- Final report: how many tests pass in each package, the zone self-check percentage, the FLDOE join coverage, the golden-case results, and an honest list of limitations (unreviewed ES/HT, unverified rules, an empty magnet list, an in-memory login throttle).

## Definition of done

- `pytest` and `npm test` both pass, and `npm run build` succeeds.
- A fresh clone runs with the two quickstart commands, and everything except the chat works without an LLM key.
- Every number shown in the UI traces back to a Field with a source and date.
- The 10 golden cases pass against a real model, or you tell me exactly which ones did not and why.
- `/api/meta/quality` and the README honestly state what is verified and what is not.

**Start with Phase 1. First probe and list the county endpoints you will use and the exact FLDOE files you need me to download. Wait for my go-ahead before writing code.**
