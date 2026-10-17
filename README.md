# Miami-Dade School Navigator

A map-based navigator for Miami-Dade families, from infant care to 12th grade. `backend/` is a FastAPI service over county and state data with a tool-calling chat agent; `frontend/` is the React app.

```bash
# 1. backend (API on :8000). Put GEMINI_API_KEY in backend/.env for the chat; everything else works without it.
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --no-access-log

# 2. frontend (on :5173, proxies /api to the backend)
cd frontend && npm install && npm run dev
```

See `backend/README.md` (data sources, trust rules, match score, chat agent, what you still need to add: FLDOE spreadsheets and curated magnet themes) and `frontend/README.md`. `Backend-Spec.md` is the original brief.
