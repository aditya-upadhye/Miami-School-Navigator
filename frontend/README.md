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
| `/` | Welcome page. One pastel top section holds the header, the headline with a drawn laptop-and-map illustration (hidden on phones), and **How would you like to start?** as three cards, so the choices are visible without scrolling: **Explore schools** (`/explore`), **Talk to the AI assistant** (`/onboarding`) and **Fill a quick form** (`/onboarding?mode=form`). Below: **What you can do** (four short cards) and a closing band with **Create an account** / **Sign in** (`/account`, `?tab=signup`). EN / ES / HT buttons are in the header. |
| `/menu` | Every page and starting option as buttons (Home, assistant, quick form, skip, Explore, Compare, Pathways, Plan, Saved, account). Reached from the **Menu** button in every header. |
| `/account` | Sign in or create an account (`?tab=signup`, `?next=/path`). Needs the backend `/api/auth` routes. |
| `/onboarding` | Chat with Jarvis, or a form: the address is geocoded, and children, free-only and priorities are saved as the family profile. |
| `/explore` | Map first. A slim fixed header (logo, address search, **Talk to Jarvis** top-right, **Menu**, account), the map filling the screen, and one side panel with two tabs: **Matches** (compact ranked list: details, compare, save, why this match) and **Filters** (active filters, distance, type, specialties, switches, attendance zones, map key). The panel can be hidden. As soon as a school is added to compare, a bar appears at the bottom with who is in the comparison and a **Compare now** button that scrolls down to the side-by-side table. The table stays on the page below the map (no pop-up), together with the key dates; **Back** floats at the bottom-left. Language, light/dark and forgetting the saved family are in **Menu → Settings**. Data from `/api/schools`, `/api/compare`, `/api/dates`, `/api/chat`. |
| `/school/:id` | School detail (`/api/schools/:id`): every field with its status and source, how to apply, nearby parks and libraries, questions to ask. |
| `/planner` | Choice plan for 2027-28 (`/api/plan`): per child, what they enter next year, VPK and kindergarten eligibility (add a birth date for an exact answer), a dated checklist with open / closes-in-N-days / closed status, a plain-language scholarship guide, and an **Add dates to my calendar (.ics)** download with 7-day reminders. Every step shows how well its rule is confirmed. |
| `/saved` | Schools the family saved with the Save button (cards and school page), loaded from `/api/schools/:id`. Stored in `localStorage` as ids and names only. |
| `/pathway` | Per-child pathway from infant care to 12th grade (`/api/pathway`). Middle and high school are labelled as estimates. |

## Languages

The **EN / ES / HT** switcher is in the header on every screen (and on the landing page). The language is kept for the tab (`sessionStorage`), sets `<html lang>`, and is sent to the API on every request as `X-Lang` (and in the body of `/api/plan` and `/api/chat`). **Every page is translated** (Landing, Onboarding, Explore incl. map, School, Pathway, Planner), and so is the text the API generates (notes, reasons, "not available" explanations, questions to ask, tooltips, errors). Interface text lives in `src/i18n/catalog/*.js`, one file per area, with rules and a glossary in `src/i18n/README.md`; tests check the three languages have identical keys and `{placeholders}`.

**Stays in English on purpose:** the brand "School Navigator", school and place names, addresses, official programme names and acronyms (M-DCPS, VPK, ESE, FES, ...), dataset/source names, the browser's own date-picker text, and a few API data values (for example the compare "Type" cell, scholarship flags, `/api/meta/quality`).

**The Spanish and Haitian Creole text was written by an AI assistant and has not been reviewed by a native speaker.** Get it reviewed before real families rely on it, especially the Creole and the legal-sounding text (deadlines, eligibility, scholarships).

## How data is shown

* Every backend metric is a *Field*. The UI shows its status (official, derived, reported by school, hand-verified, not available) with the source, date and method on hover (`FieldBadge`), and a missing value is shown as missing with the next step, never guessed.
* The family profile (`src/profile/ProfileProvider.jsx`) lives in `sessionStorage`, so addresses are gone when the tab closes, unless the family ticks **Remember me on this device** in onboarding: then it is also kept in `localStorage` (only once an address has been entered) until they click **Forget my info** (in onboarding) or **Reset** (top of `/explore`, shown only while a family's own details are in use). Both clear the profile and start empty again; saved schools and the account are kept. There is no sample family: until an address is entered, Explore shows the whole county with a "Where do you live?" prompt, and Pathway and Plan ask for the family's details.
* The map is a 3D map (MapLibre GL over free OpenFreeMap vector tiles built from OpenStreetMap data, no Google): a tilted camera, extruded buildings, your home, the travel-distance ring, numbered school pins standing on light beams, and **your elementary, middle and high attendance-zone boundaries** raised in tiers (`/api/zones/geojson`, toggle each in the Filters tab). It frames your home and the schools shown and eases to a school when you select it. Controls: zoom, center on home, reset north, tilt between 3D and 2D, and slow auto-rotate. The map follows the light/dark theme. If tiles fail to load (or the browser has WebGL turned off) a notice appears and pins, zones and the list still work. OpenFreeMap's public server is for light use: for real traffic set `VITE_MAP_TILES_URL` (and `VITE_MAP_GLYPHS_URL`, `VITE_MAP_ATTRIBUTION`) to a tile provider.

## Look and feel

The original blue-purple design: a violet accent (`#6b54c9`) with a pink-violet gradient on buttons and pins, a yellow call-to-action (`--cta`) for the main landing buttons, frosted-glass panels and soft shadows. **Dark is the default** (as in the original); light is in Menu → Settings and the choice is remembered. All colours are tokens at the top of `src/styles/global.css` (`--accent`, `--accent-ink`, `--page`, `--surface`, ...), once for the light theme and once for the dark one, so the whole app restyles from there.

The landing page uses a pastel set (`--pastel-pink`, `--pastel-lav`, `--pastel-yellow`, `--pastel-mint`, `--hero-grad`) tinted to this palette. Its illustration is hand-drawn SVG (`src/pages/Landing/HeroArt.jsx`); there are no photos.

## Getting around

Every page except the landing has a **Back** button (previous page, or a sensible start page when the tab has no history) and a **Menu** button that opens `/menu`. The onboarding page has a switcher above the assistant or form: **Talk to the AI assistant**, **Fill a quick form**, **Skip, just explore**. The mode is in the URL (`?mode=chat` or `?mode=form`), so the browser's own Back button works there too.

## Guest and signed-in

Everyone starts as a guest: the top-right control reads **Sign in**. After signing in or creating an account it becomes a yellow button with the family's initials and a menu (name, email, **Sign out**). The session token is sent as a Bearer header on every API call (`src/api/client.js`, `src/auth/`).

## Not included (no data behind them)

Parent ratings and reviews, students per teacher, "what parents say", the campus walk, "typical day", walking-route and neighborhood-safety notes, the career picker and outcomes charts, sample open-house dates, and the voice buttons. The School page lists what we do not have. Priorities in onboarding are limited to what the backend can score (STEM, Arts, Bilingual, IB, Montessori).

## Known limits

* Accounts hold only name, email and ZIP. The family profile (address, children) is not stored on the account yet, so it stays in the browser. No password reset or email verification. The session token is kept in `localStorage`.
* Spanish and Haitian Creole are not native-reviewed (see Languages).
* Saved schools are kept in this browser only (`localStorage`), not in an account, so they do not follow the family to another device.
