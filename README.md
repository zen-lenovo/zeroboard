# Logs Dashboard

## Stack

- FastAPI for the REST API
- SQLite for relational storage in a local file
- React with Vite for the frontend
- PowerShell launcher script for the fastest local startup

## Features

- CRUD endpoints for logs
- Filtered log queries by date range, severity, source, and search text
- Aggregated log metrics and a simple trend chart
- Log list page with search, filtering, sorting, and pagination
- Log detail page with edit and delete actions
- Log creation page
- Seed data on first startup so the UI is not empty

## Quick start

From the repo root on Windows:

```powershell
.\run-local.ps1
```

If you prefer double-clicking or `cmd.exe`:

```bat
run-local.bat
```

What the launcher does:

- Creates `backend/.venv` if it does not exist yet
- Installs backend dependencies the first time, or anytime you run `./run-local.ps1 -Install`
- Installs frontend dependencies the first time, or anytime you run `./run-local.ps1 -Install`
- Starts the backend on `http://127.0.0.1:8000`
- Starts the frontend on `http://127.0.0.1:5173`
- Records service PIDs in `.local-run/` so they can be stopped cleanly later
- Waits for both services to be reachable before exiting
- Writes startup logs to `.local-run/backend.log` and `.local-run/frontend.log`

The local launcher uses `127.0.0.1` consistently for both apps to avoid browser CORS mismatches between `localhost` and `127.0.0.1`.

The SQLite database file is stored at `backend/logs.db`.

To stop both local services:

```powershell
.\stop-local.ps1
```

Open these URLs after startup:

- Frontend: http://127.0.0.1:5173
- Backend docs: http://127.0.0.1:8000/docs

## Run locally

Backend:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

No extra database service is required. The backend defaults to SQLite automatically.

## Optional Docker run

Docker Compose now uses the same SQLite-backed backend for a lightweight containerized run:

```bash
docker compose up --build
```

Open these URLs after startup:

- Frontend: http://localhost:8080
- Backend docs: http://localhost:8000/docs

The Docker setup uses a named volume for SQLite, so log data survives container recreation.

## Notes

- Validation is handled by Pydantic on the backend, with basic error responses for missing records and bad input.