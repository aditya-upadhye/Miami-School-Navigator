# Miami-Dade School Navigator: backend

A trusted API for a map-based school navigator (infancy to 12th grade; public, charter, magnet, private, early learning) for
Miami-Dade County. FastAPI + SQLite + Shapely, with a tool-calling chat agent. Built from `Backend-Spec.md`.

**Trust rules, enforced in code and tests.** Every metric is a `Field` `{value, status, source, url, as_of, method}` with status
`official | derived | reported_by_school | curated | not_available`. Missing data is never guessed: it comes back as
`not_available` with `why` and `suggested_action`, plus a `questions_to_ask` list on school detail. Tuition, ratings, aftercare
hours, photos and walking routes are never invented. No scraping, no Google services, no email fields, no stored addresses.

## Run it

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env                  # add GEMINI_API_KEY for the chat agent (everything else works without it)
.venv/bin/python scripts/llm_check.py   # confirm the model can do tool calling
.venv/bin/uvicorn app.main:app --no-access-log      # http://localhost:8000/docs
.venv/bin/python -m pytest                           # 320 tests, offline
```

The database (`data/navigator.db`) is built on first start from the committed county snapshots in `data/snapshots/`
(`AUTO_INGEST=true`), or explicitly with `python -m app.ingest.build`. `--no-access-log` matters: access logs would record
addresses from query strings. Docker: `docker build -t navigator . && docker run -p 8000:8000 -e GEMINI_API_KEY navigator`.

## What you need to add (two manual steps)

1. **FLDOE spreadsheets** (loaded 2026-10-16; fldoe.org blocks scripted downloads, so they were downloaded in a browser into `data/raw/fldoe/`):
   `SchoolGrades26.xlsx` (2025-26 school grades, which also carries ELA and math learning gains), `PrivateSchools_Filtered.xlsx` (Miami-Dade
   private schools with FES-EO, FTC, FES-UA and PEP scholarship flags, grade levels and accreditation), and `SchoolList.xls` (an HTML table
   of Miami-Dade charters with state school codes). The loader detects each by content, reads Excel files with stripped-down styles and
   HTML "xls" files, and **never reads the email, director or principal columns** (a test scans the database for addresses). Re-run
   `python -m app.ingest.build` after replacing a file.
   **Result:** 92.9% of public and 75.9% of charter schools matched to a 2026 grade (285 A, 115 B, 55 C, 1 D among matched), 451 with learning
   gains, 419 of 676 private schools matched to scholarship flags. Unmatched schools show `not_available`, never a guess.
   **Matching safeguard:** for M-DCPS schools the state number equals the county ID, so a number match is kept (with lower confidence if the
   names differ a lot, e.g. "MAST Academy"). For charters it is not guaranteed, so a number match whose names do not resemble each other is
   **rejected** rather than risk showing another school's grade; those are listed under `fldoe_school_grades.charter_number_matches_rejected_for_name_mismatch`
   in `/api/meta/quality` for a human to resolve (7 today, e.g. "BridgePrep Academy of Miami-Dade" vs "BridgePrep Academy of Doral").
2. **Magnet themes** (`data/curated/magnet_themes.json`): add 20-30 schools after checking each against the district's magnet
   catalog. It ships empty on purpose (nothing is guessed): magnet status is `not_available` until you do. Specialty matching otherwise
   falls back to keywords in the official school name, labelled `derived`.

Also re-verify the rules marked `single_secondary_source` / `unconfirmed_project_spec` in `data/curated/rules.json` on dadeschools.net
(listed in `/api/meta/quality` notes). The 2026-27 cycle dates were confirmed by an M-DCPS release; the 2027-28 window
(Oct 1, 2026 to Jan 15, 2027) comes from one school's page.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/geocode?q=` | lat, lon, matched address, source, confidence. County address points, then Census fallback, then ZIP centroid (confidence 0.4, flagged approximate) |
| `GET /api/zones?lat&lon` | zoned elementary, middle, high (point-in-polygon on county attendance zones) |
| `GET /api/zones/geojson?lat&lon` | the zone polygons containing a location as a GeoJSON FeatureCollection (simplified to ~5 m, about 5 KB), each with source, date and method, for drawing on a map |
| `GET /api/schools?lat&lon&radius_mi&kinds&stage&free_only&grade_min&specialties&ese&scholarship&sort&limit` | search; response `{results, meta}`; extras: `priorities` (boosts score, no filtering) and `q` (name lookup) |
| `GET /api/schools/{id}?lat&lon` | detail, `how_to_apply`, nearby parks and libraries, `questions_to_ask`, links |
| `POST /api/compare` `{ids<=3}` | aligned rows; `best_index` only on numeric official fields (learning gains) |
| `POST /api/pathway` `{lat,lon,children[{age}]}` | stages with options and key dates; middle/high options labelled *estimated from overlapping attendance zones* |
| `POST /api/plan` `{lat,lon,lang?,children[{age,name,birth_date?}],free_only}` | the choice planner: for the planning year (2027-28, from `rules.json`) each child's entering grade, VPK and kindergarten eligibility on the September 1 cut-off (exact with a birth date, labelled an estimate from age alone), a dated checklist (magnet window with open/closing/closed status, VPK, charters, private), the zoned school, key dates, and a scholarship guide with counts of nearby private schools listing each program |
| `GET /api/dates` | key dates from `rules.json`, each with source, verification level and `days_until` |
| `POST /api/chat` `{messages, profile, lang?}` | `{answer, citations[], filters_applied, results[]}` (+ `tool_calls`, `degraded`, `warnings`) |
| `GET /api/meta/quality` | dataset freshness and counts, zone self-check, FLDOE join coverage, rule verification |
| `GET /api/health` | liveness |
| `POST /api/auth/signup` `{email,password,name?,profile?}` / `login` / `logout` | accounts: sets an HttpOnly `sn_session` cookie. Passwords are hashed with scrypt; the same 401 answers an unknown email and a wrong password; 5 failed logins per email and client per 15 minutes returns 429 |
| `GET /api/auth/me` | `{user}` or `{user: null}` when signed out (not an error) |
| `POST /api/auth/password`, `POST /api/auth/delete-account` | change password (other devices are signed out) / delete the account, profile (including the address), saved schools and sessions. Both need the current password |
| `PUT /api/me/profile` `{profile, name?}` | the family's profile (address, children, priorities, language), stored as opaque JSON up to 16 KB |
| `GET /api/me/saved?lat&lon`, `PUT/DELETE /api/me/saved/{id}`, `POST /api/me/saved/merge {ids}` | saved schools (max 200, optional note), each returned with the same `SchoolSummary` as search; `merge` adds guest saves after sign-in |

The contract is exported to [openapi.json](openapi.json) (`python scripts/export_openapi.py`) and served at `/openapi.json`. Errors are
always `{"error": {"code", "message", "suggested_action"}}`, in the request language (see Languages below).

## Accounts and privacy

Accounts live in their own SQLite file (`USERS_DB_PATH`, default `data/users.db`, git-ignored), so rebuilding the school database can never
delete families' data. Signed-in families' profiles, **including the address they typed**, are stored server-side so they follow them to
another device; the account can be deleted at any time (`POST /api/auth/delete-account`) and that removes the address with it. Guests are
unchanged: nothing is stored. The school endpoints still never return an email field; the only email stored is the family's own sign-in email.
For an https deployment set `COOKIE_SECURE=true`; for a frontend on another site set `COOKIE_SAMESITE=none` (needs secure) and list its origin
in `CORS_ORIGINS`. Not built: password reset by email (no mail service), social login, and the login throttle is per process (in memory).

## Data sources (ingested once; handlers never call county servers)

| Dataset | Source | Notes |
| --- | --- | --- |
| Public schools, charters, private schools, daycare, Head Start | Miami-Dade County GIS, `CommunityServices/MD_Educational` layers 2, 3, 8, 1, 5 | Daycare is in this service (layer 1), not `MD_Emaps` 36 |
| Attendance zones (elementary / middle / high) | same service, layers 9 / 11 / 10 | joined layers; multi-polygon schools handled |
| Parks | `CommunityServices/MD_RecreationCulture` layers 0 (municipal) and 1 (county) | resolves the spec's "unresolved" parks endpoint |
| Libraries | `MD_Educational` layers 6, 7 | |
| ZIP polygons (for ZIP-only queries) | `AddressSearchMap_PropertiesWithZip` layer 2 | |
| Geocoder | county address points (`AddressSearchMap_PropertiesWithZip` layer 0), then US Census Geocoder | no public county GeocodeServer was found |
| State grades, gains, directories | FLDOE Excel files (you provide) | district 13; joined on school number, private by name + address + ZIP confidence |
| Rules and dates | `data/curated/rules.json` | every entry has a URL, `verified_on` and a `verification` level |

Attribution: Miami-Dade County GIS Open Data and the Florida Department of Education. **Check each publisher's terms** before
redistributing; the MIT license covers this code only. Each layer was pulled with `outSR=4326` and paginated by `resultOffset`;
snapshots (gzip GeoJSON, 1.2 MB) double as the "county down" fallback. Refresh with `python -m app.ingest.build --refresh` (falls back to
the snapshot on failure); schedule it nightly if you like.

Privacy: county `EMAIL` and daycare contact-name fields are never ingested, and email addresses found in other county cells (two
private-school "website" values) are dropped. Geocode lookups are cached in memory for an hour and never written to disk or logs.

## Match score (no black box)

`score = 100 x earned / possible`, summed over the factors that *apply* to a school; every factor is returned in `score_breakdown`
with `reasons[]`. Factors that cannot be scored (e.g. no state grade) are left out of `possible` rather than counted as zero.

| Factor | Max | Applies to |
| --- | --- | --- |
| Zoned for this address | 25 | public schools |
| Distance (linear over the search radius) | 30 | all |
| State grade (A 1.0, B 0.75, C 0.4, D 0.15, F 0) | 20 | public and charter with a grade |
| Priority matches (share of requested priorities) | 15 | when `priorities` is given |
| Accepts scholarships | 10 | private, when `scholarship=true` |

Hard filters: stage (age fit), free-only (keeps public and charter; private and child care have no public prices), grade floor, specialties,
ESE, scholarship. `meta.excluded` reports how many candidates each removed, and `meta.notes` states each filter's limits.

## Chat agent

`app/chat/`: an LLM with tools `geocode, get_zones, search_schools, get_school, compare, get_dates, get_pathway` (the same services as the
REST API). The system prompt requires answers only from tool results, a citation after every claim, honest handling of `not_available`, no
rankings beyond the official A-F grade, no "safe" claims, replies in EN/ES/HT with school names and official terms unchanged, and at most 4
tool calls per turn.

**Any OpenAI-compatible model, chosen by environment variables** (`app/chat/llm.py`, details in `.env.example`). The default is **Gemma 4 26B (`gemma-4-26b-a4b-it`)
through Google's OpenAI-compatible Gemini endpoint**; the adapter speaks the standard `/chat/completions` + tools protocol, so switching
needs no code change:

| Goal | Settings |
| --- | --- |
| Gemma 4 (default) | `GEMINI_API_KEY=...` |
| Gemini Flash | `GEMINI_API_KEY=... LLM_MODEL=<Gemini Flash model id>` |
| Hosted open model | `LLM_PROVIDER=groq` (or `openrouter`, `together`), `<PROVIDER>_API_KEY=...`, `LLM_MODEL=<id>` |
| Local, no key | `LLM_PROVIDER=ollama LLM_MODEL=<tag>` or `LLM_PROVIDER=vllm LLM_MODEL=<name>` |
| Anything else | `LLM_PROVIDER=custom LLM_BASE_URL=... LLM_API_KEY=... LLM_MODEL=...` |

Other knobs: `LLM_TEMPERATURE` (default 0.1, per the spec; empty = model default), `LLM_MAX_TOKENS`, `LLM_TIMEOUT`, `LLM_SYSTEM_MODE`
(`auto` retries with the instructions folded into the first user message if a model rejects a system role), `LLM_EXTRA_BODY` (JSON merged
into each request). The adapter also drops `temperature` or `tool_choice` automatically if a provider rejects them, retries 429/5xx, strips
`<think>` blocks, and tolerates missing tool-call ids. **The chat needs a model with native tool calling**; run
`python scripts/llm_check.py` after changing settings to verify that, plus a quick Spanish and Haitian Creole sample.

Privacy note: free tiers of hosted APIs may use prompts to improve their products (Google's does, per its published terms; check the current
terms). Chat prompts can contain a family's address, so use a paid tier, a provider with no-training terms, or a local model for real users;
the fictional demo family is fine anywhere. `/api/meta/quality` shows the active provider and model, never the key.

Server-side checks, not just prompting, so a weaker model stays verifiable: a hard 4-call budget (extra calls get an error result and the final
model call has tools disabled); tool results are compact JSON where every field carries a `cite` id, citation markers are validated against
that registry and renumbered `[1]..[n]` (unknown ids stripped); any dollar amount that no tool returned triggers one rewrite, then
redaction; if the model is unavailable, unconfigured, or fails mid-turn, `/api/chat` returns structured results with `degraded: true`.

**Outages and backup models.** The free Google endpoint sometimes answers `500 INTERNAL` for a while (seen on 2026-10-16). Each route retries three times; then the next route is tried:

1. the main model (`LLM_MODEL`; `LLM_FALLBACK_MODEL` adds a second model on the same provider),
2. the routes in `LLM_BACKUPS`, e.g. `nvidia:google/gemma-4-31b-it,cerebras:qwen-3.8-27b@600` (`provider:model[@max calls per UTC day]`).

Each backup uses its own provider's key (`NVIDIA_API_KEY`, `CEREBRAS_API_KEY`, ...), never the main key. A failed route is skipped for 60 s (10 minutes after a bad key or unknown model). Paid providers (cerebras, openai, together, openrouter) default to a **600 calls a day** cap so a loop cannot drain credit (`@0` removes it); the counters live in the process and reset on restart or at 00:00 UTC. The chain is built once and shared by all requests, so cooldowns and caps are remembered. `GET /api/health` lists the routes (never keys); `python scripts/llm_check.py --backups` checks each one. If every route fails the chat degrades to a structured list that still reads a ZIP, street address and children's ages from what the family typed; it never invents an answer. Checked on 2026-10-17: with the main model deliberately broken, NVIDIA's `google/gemma-4-31b-it` alone and Cerebras' `qwen-3.8-27b` alone each passed all 10 golden cases.

**Tested against a real model (2026-10-15):** with `gemma-4-26b-a4b-it` on Google's free tier and `LLM_RPM=15`, all 10 golden cases in
`scripts/golden.py` passed in one run (about 2 s per model call), including Spanish and Haitian Creole. That is one run, not a guarantee:
the cases check behaviour with regexes, free-tier quotas throttle per minute (hence `LLM_RPM` and `--pause`), and Haitian Creole quality
needs a native speaker's review. Earlier runs found and fixed real gaps: answering rules from memory (rules are now returned by `get_dates`
and the prompt forbids memory answers), skipping the "not yet confirmed" caveat, and not saying grades are unavailable.
`google/gemma-4-31b-it` on NVIDIA (`LLM_PROVIDER=nvidia`) works but was too slow (>90 s on some turns); on Google's free tier it did not respond.
**Quota is about tokens, not requests.** Google's free Gemma tier allows 30 requests but only **16K tokens per minute**, and a chat turn uses
5K-14K tokens (about 2K of that is the fixed prompt and tool schemas, resent on every model call). Set `LLM_TPM=14000` (and `LLM_RPM`): the
adapter then waits for the one-minute window to clear instead of triggering 429s, at the cost of latency when turns come back to back
(a compare turn took ~70 s while waiting). `/api/chat` returns `usage` (model calls, input and output tokens) per turn so you can see this. A paid tier,
or a model with a larger token limit, removes the wait. `gemma-4-31b-it` has the same 16K cap and did not respond on Google's free tier.

Run `python scripts/llm_check.py`, then `python scripts/golden.py` (hourly via cron with `--base-url`) after any model change.

## Languages (English, Spanish, Haitian Creole)

Send `X-Lang: en | es | ht` on any request (the frontend does this on every call), or `?lang=` (the query parameter wins over the header). Every
sentence the API generates then comes back in that language. A missing or unknown value (`fr`, empty, ...) means English and is never an error;
`es-US` and `ES` are read as `es`. `POST /api/plan` and `POST /api/chat` also take a `lang` body field, which wins for that request; without it
the header applies. Responses carry `Content-Language` and `Vary: X-Lang` so caches never serve one language to another.

**How it works.** `LanguageMiddleware` (`app/i18n.py`, pure ASGI) puts the language in a contextvar for every `/api` route; sync endpoints running in the
threadpool see it too. `t(key, lang=None, **vars)` defaults to it. All text lives in one catalog (`MESSAGES` in `app/i18n.py`, one `(en, es, ht)` tuple per key)
with prefixes: `na.*`/`act.*` ("not available" why and next step), `score.*`, `note.*`, `q.*` (questions to ask), `cmp.*`, `path.*`, `zone.*`, `geo.*`,
`dates.*`, `m.*` (`Field.method`), `chat.*`, `err.*`, `val.*`. English is byte-identical to what the API returned before translation. `ApiError` carries the English
`message` and `suggested_action` plus optional `params`; the handler in `app/main.py` localizes them by code (`err.<code>.message` / `.action`, placeholders from `params`, e.g. the
user's own query in `geocode_not_found`). Validation errors (422) are localized by pydantic error type (English keeps pydantic's own wording), and the standard
HTTP phrases (`Not Found`, ...) are translated for errors raised through `HTTPException`. Curated rules and dates carry `i18n.es/ht` in `rules.json`; dates are written the
local way (`15 de enero de 2027`, `15 janvye 2027`).

**Translated:** school-field `why` / `suggested_action` for every `not_available`, match-score `detail` and `reasons`, search/detail/compare/pathway/dates/zones notes,
`questions_to_ask`, `how_to_apply` text, compare row labels, pathway stage labels, ages and estimate note, geocode notes and ZIP-centroid label, error messages and next
steps, chat `warnings` and the replacement text for ungrounded amounts, and the planner.
`Field.method` (the "how we got this value" tooltip text, keys `m.*`) is translated too; two parts stay literal in every language because code and the frontend parse them: `verification: <level>` (level names stay English) and the `Check:` marker of the state-grade name-mismatch note.
**Not translated, on purpose:** `Field.source`, `Field.url` and dataset titles (English provenance),
school and place names, addresses, magnet themes and other data values (including the FLDOE scholarship flag labels and the compare "Type" cell), rule `source` strings,
and `/api/meta/quality` (technical report). Unknown-route 404/405 and unhandled 500 responses are Starlette's own English bodies.

**Chat.** Tools run in English so the model always grounds on the same text (and the golden tests do not depend on the family's language); the model writes its answer in
`lang` through its prompt. The school cards returned next to the answer are rebuilt in the family's language, and `warnings` follow it too.

**The language never changes the logic.** Filtering, scoring, ranking, counts, statuses, dates and which fields are available are identical in every language; tests
compare the structure of search, detail, compare, pathway, plan, zones and dates across `en`/`es`/`ht` with every sentence masked. Tests also check that every
catalog key has three non-empty strings with identical `{placeholders}`, that every `ApiError` code has a localized message and action, that numbers and
ids from the family's input survive translation, and that no English template text leaks into Spanish or Creole responses. A missing translation falls back to English.

**The Spanish and Haitian Creole were written by an AI assistant and have NOT been reviewed by a native speaker.** Official names (M-DCPS, VPK, ESE, IEP, STEM, IB,
FLDOE, FES, FTC, PEP, Step Up For Students) are kept as written. Get them reviewed before real families rely on them, especially the Creole and the legal-sounding
texts (rules, eligibility, "confirm with the district" caveats, error messages).

## Data quality checks (show in the demo)

* Own-point-in-own-zone: **99.6%** of public schools' points fall inside their own attendance zone (target 95%); failures are listed in
  `/api/meta/quality`.
* FLDOE join coverage for public and charter schools (92.9% and 75.9%), with the unmatched and low-confidence lists.
* Every returned `Field` has `source` and `as_of`: `tests/conftest.py::assert_fields` walks every API response to prove it.
* `python scripts/check_addresses.py` prints zoned schools for five addresses to compare with the district's school locator
  (not yet compared by a person).

## Not built

P2 items: OSM points of interest, voice, scheduled refresh job. Not covered by any dataset (so reported as `not_available`): tuition,
aftercare hours and prices, ESE services (only a special-center flag and any self-reported directory flag), photos, walking routes, magnet
status until curated. Middle/high pathway steps are estimates from zone overlap; the county publishes no feeder patterns.
