# Miami-Dade School Navigator: frontend

React 18 + Vite + React Router. Every screen reads live data from the backend (`../backend`, contract in `backend/openapi.json`).

```bash
npm install
npm run dev        # http://localhost:5173  (proxies /api to http://localhost:8000)
npm test           # unit tests (field formatting, map helpers, API client, calendar export, verification labels)
npm run build
```

Start the backend first (`backend/README.md`). For a deployed build set `VITE_API_BASE_URL` to the API's public URL (`.env.example`).

## Screens

| Route | What it does |
| --- | --- |
| `/` | Landing. The language buttons switch the whole site and the language Navi replies in. |
| `/onboarding` | Chat with Navi, or a form: the address is geocoded, and children, free-only and priorities are saved as the family profile. |
| `/explore` | Search (`/api/schools`), filters, real map with zone boundaries, result cards, side-by-side compare (`/api/compare`), key dates (`/api/dates`), floating Navi chat (`/api/chat`). The header box geocodes a new address or ZIP. |
| `/school/:id` | School detail (`/api/schools/:id`): every field with its status and source, how to apply, nearby parks and libraries, questions to ask. |
| `/planner` | Choice plan for 2027-28 (`/api/plan`): per child, what they enter next year, VPK and kindergarten eligibility (add a birth date for an exact answer), a dated checklist with open / closes-in-N-days / closed status, a plain-language scholarship guide, and an **Add dates to my calendar (.ics)** download with 7-day reminders. Every step shows how well its rule is confirmed. |
| `/login`, `/signup`, `/account` | Family accounts (`/api/auth/*`): sign up, sign in (`?next=` supported), change password, delete account. `/account` needs a session. |
| `/saved` | Saved schools with a note on each (`/api/me/saved`). Guests can save too; the ids are kept in the browser and merged into the account at sign-in. |
| `/pathway` | Per-child pathway from infant care to 12th grade (`/api/pathway`). Middle and high school are labelled as estimates. |

## Languages

The **EN / ES / HT** switcher is in the header on every screen (and on the landing page). The language is kept for the tab (`sessionStorage`), sets `<html lang>`, and is sent to the API on every request as `X-Lang` (and in the body of `/api/plan` and `/api/chat`). **Every page is translated** (Landing, Onboarding, Explore incl. map, School, Pathway, Planner), and so is the text the API generates (notes, reasons, "not available" explanations, questions to ask, tooltips, errors). Interface text lives in `src/i18n/catalog/*.js`, one file per area, with rules and a glossary in `src/i18n/README.md`; tests check the three languages have identical keys and `{placeholders}`.

**Stays in English on purpose:** the brand "School Navigator", school and place names, addresses, official programme names and acronyms (M-DCPS, VPK, ESE, FES, ...), dataset/source names, the browser's own date-picker text, and a few API data values (for example the compare "Type" cell, scholarship flags, `/api/meta/quality`).

**The Spanish and Haitian Creole text was written by an AI assistant and has not been reviewed by a native speaker.** Get it reviewed before real families rely on it, especially the Creole and the legal-sounding text (deadlines, eligibility, scholarships).

## How data is shown

* Every backend metric is a *Field*. The UI shows its status (official, derived, reported by school, hand-verified, not available) with the source, date and method on hover (`FieldBadge`), and a missing value is shown as missing with the next step, never guessed.
* The family profile (`src/profile/ProfileProvider.jsx`) lives in `sessionStorage` for guests, so the address is gone when the tab closes. **Signed-in families' profile (including the address and children) is stored on the server** so it follows them to other devices, and is deleted with the account. Guest saves keep only school ids in `localStorage`; passwords and the session cookie (HttpOnly) never touch browser storage. Until a family enters theirs, a labelled **demo family** (2 kids, ages 3 and 7, near 33127, free only, STEM) is used.
* The map is a real map (Leaflet + OpenStreetMap tiles, no Google): your home, the travel-distance ring, numbered school pins, and **your elementary, middle and high attendance-zone boundaries** (`/api/zones/geojson`, toggle each below the map). It frames your home and the schools shown. The dark theme inverts the tiles. If tiles fail to load, a notice appears and pins and zones still work. OSM's public tile server is for light use: for real traffic set `VITE_MAP_TILE_URL` (and `VITE_MAP_ATTRIBUTION`) to a tile provider.

## Removed from the original prototype (no data behind them)

Parent ratings and reviews, students per teacher, "what parents say", the campus walk, "typical day", walking-route and neighborhood-safety notes, the career picker and outcomes charts, sample open-house dates, and the voice buttons. The School page lists what we do not have. Priorities in onboarding are limited to what the backend can score (STEM, Arts, Bilingual, IB, Montessori).

## Known limits

* Accounts are email and password only: no password reset (no mail service) and no social login.
* Spanish and Haitian Creole are not native-reviewed (see Languages).
* For a deployed frontend on a different site from the API, set `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true` on the backend (see the backend README).
