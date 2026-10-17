**Built with Archie**

# Miami-Dade School Navigator

**Pathway to your child's future.** One AI-guided map of every school and early-learning program in Miami-Dade County, from infant care to 12th grade, in **English, Español and Kreyòl ayisyen**, built around each family's children.

Open source under the [MIT License](backend/LICENSE). Contributions, translations and data fixes are welcome.

Choosing a school is hard when the data is scattered across county maps, state spreadsheets and district PDFs, and harder still if English is not your first language. The Navigator pulls it into one place, explains it in plain words, and tells every family what to do next.

## Languages first

- The whole app and everything the AI says come in **English, Spanish and Haitian Creole**, switchable on every screen.
- It covers the interface, the AI assistant's replies, "why this school" notes, eligibility rules, dates (`15 de enero de 2027`, `15 janvye 2027`), error messages and the planner.
- The language never changes the logic: search, scoring and ranking are identical in all three, and tests enforce it.
- The Spanish and Creole text was drafted with AI and still needs native-speaker review. Pull requests are welcome.

## Built around your kids

- Add each child's name and age. Every search, match score, pathway and deadline is then personalised **per child**.
- **How it fits your child**: a short note on how each school suits a specific child, with an instant grade-fit check.
- **Pathway** for each child from infant care to high school, and a **Planner** with VPK and kindergarten eligibility from the September 1 cut-off.
- Special-needs (ESE/IEP) filters, free-only and scholarship filters, and "what matters most" sliders.

## AI-driven, and honest about it

- **Jarvis, the AI assistant**, answers in your language and decides which tools to use (search, zoning, school details, compare, dates, pathway). Every claim carries a citation, and it never makes up tuition, ratings or rules.
- **AI filters**: say "show only free charter schools with STEM" and Jarvis sets the map filters. Special-needs, program, cost and school-type wishes become real filters.
- **AI matching**: every school gets a transparent 0-100 **match score** with the reasons behind it, and a short AI-written "why this match" for your family.
- **Memory**: Jarvis remembers children, preferences and schools you liked or ruled out, and saves them to your profile.
- **Exact answers**: ask for "the top 3" or "10 options" and you get exactly that many.
- **Guardrails in code, not just prompts**: capped tool calls, citation checks, dollar amounts checked against data, and a structured fallback when the model is down.
- **Bring any model**: Gemma 4 or Gemini by default, or Groq, OpenRouter, Together, Ollama and vLLM (local, no key) through one setting.

## Compare and the map

- **Compare up to 3 schools side by side**, with the best value flagged only on official numeric data (such as learning gains).
- **3D interactive map** with your home, the travel-distance ring, numbered school pins and your **elementary, middle and high attendance zones**.
- Everything on the map matches the chat and the list, and it keeps working if map tiles fail to load.

## Alumni and insights

- **Where graduates go**: share of graduates in college or employed (Florida FETPIP).
- **Course paths**: AP, IB, dual enrollment and advanced math and science (U.S. Dept. of Education CRDC).
- **Notable alumni** from Wikidata, plus a **LinkedIn sample**, clearly labelled as a sample, not a statistic.
- **Alumni survey**: signed-in alumni say what field they work in today. Results appear only once 10 people answer, so no one can be identified.
- **At a glance**: state grades, learning gains, enrollment, specialties, magnet themes and tuition (where published). Missing data says "not available", why, and what to ask the school.

## Career paths, nearby places and next actions

- **Preschool-to-career view**: pathway stages per child, plus the fields graduates go into (technology, healthcare, engineering, trades and more).
- **Nearby parks and libraries** for each school.
- **Next actions**: how to apply (with sources), questions to ask the school, a dated checklist that shows open or closing status, and an **Add to my calendar (.ics)** download with reminders.
- Save schools, create an account, and pick up where you left off.

## Trust and privacy

Every number shows its **source, date and how we got it**. Nothing is scraped or guessed. County email and contact-name fields are never loaded, and addresses are not stored or logged.

## Tech we used

| | | |
| --- | --- | --- |
| React 18 | Vite | React Router |
| MapLibre GL (3D map) | OpenFreeMap / OpenStreetMap | FastAPI |
| Python | Pydantic | SQLite |
| Shapely (zone geometry) | pandas + openpyxl | httpx |
| Gemma 4 / Gemini API | OpenAI-compatible tool calling | Wikidata SPARQL |
| Miami-Dade County GIS (ArcGIS) | FLDOE and NCES/CRDC open data | US Census Geocoder |
| Vitest + pytest | Docker | |

## Run it

You need **Python 3.11+** and **Node 20.19+**.

```bash
# 1. Backend (API on http://localhost:8000, docs at /docs)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env              # add GEMINI_API_KEY to turn on the AI chat
.venv/bin/uvicorn app.main:app --no-access-log

# 2. Frontend (http://localhost:5173, proxies /api to the backend)
cd frontend
npm install
npm run dev
```

- The school database is included and rebuilds from the committed county snapshots on first start.
- **No API key?** Everything works except the chat, which falls back to structured results. Get a free key at [Google AI Studio](https://aistudio.google.com/apikey), or run a local model with `LLM_PROVIDER=ollama` in `backend/.env`.
- **Tests:** `cd backend && .venv/bin/python -m pytest` and `cd frontend && npm test`.
- **Docker:** `cd backend && docker build -t navigator . && docker run -p 8000:8000 -e GEMINI_API_KEY navigator`.
- Deeper docs: [backend/README.md](backend/README.md) (data sources, match score, chat agent) and [frontend/README.md](frontend/README.md).

## License

[MIT](backend/LICENSE). This covers the code only. Check Miami-Dade County GIS, FLDOE and the other data publishers' terms before redistributing their data.
