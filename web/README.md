# MyfAInance Web

Local PWA dashboard over the JSON DB. FastAPI backend + Vite/React/Tailwind frontend.

## First-time setup

```bash
# Backend (creates a .venv automatically if you re-run init)
cd web/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

## Dev (two terminals)

```bash
# terminal A: backend on :8000
cd web/backend
.venv/bin/uvicorn main:app --reload --port 8000

# terminal B: frontend dev server on :5173 (proxies /api -> :8000)
cd web/frontend
npm run dev
```

Open http://localhost:5173.

## Build for "production" (still localhost)

```bash
cd web/frontend
npm run build
# the backend now serves the built bundle at http://localhost:8000
cd ../backend
.venv/bin/uvicorn main:app --port 8000
```

## API

- `GET /api/state` overview counts and account list
- `GET /api/reports` list periods with summary
- `GET /api/reports/{YYYY-MM}` full structured report (matches `core/db-schema.md`)
- `GET /api/transactions?period=...&category=...&account=...` filtered txns
- `GET /api/categories`, `/api/merchants`, `/api/subscriptions`, `/api/anomalies`
- `POST /api/anomalies/{id}/review` body `{ "action": "kept" | "dismissed" | "investigated" }`

## Layout

```
web/
  backend/           FastAPI app, single main.py + venv
    main.py
    requirements.txt
    .venv/           (gitignored)
  frontend/          Vite + React + TS + Tailwind
    src/
      components/    Period switcher, hero, category breakdown, top merchants, bottom nav
      lib/           api client + formatting helpers
    public/          manifest.webmanifest, icon.svg
    dist/            (gitignored, built assets)
  deploy/            (placeholder; launchd plist and tunnel config land here)
```
