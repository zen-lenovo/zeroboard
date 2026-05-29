# Logs Dashboard

This is a minimal full-stack logs dashboard built from the assignment brief in the root requirements file.

## Stack

- FastAPI for the REST API
- PostgreSQL for relational storage
- React with Vite for the frontend
- Docker Compose to run the whole app

## Features

- CRUD endpoints for logs
- Filtered log queries by date range, severity, source, and search text
- Aggregated log metrics and a simple trend chart
- Log list page with search, filtering, sorting, and pagination
- Log detail page with edit and delete actions
- Log creation page
- Seed data on first startup so the UI is not empty

## Run with Docker

```bash
docker compose up --build
```

Open these URLs after startup:

- Frontend: http://localhost:8080
- Backend docs: http://localhost:8000/docs

## Run locally

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set DATABASE_URL=postgresql+psycopg://logs:logs@localhost:5432/logs_dashboard
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Notes

- The frontend is intentionally small and plain. The goal was to satisfy the assignment without adding heavy state management or extra charting libraries.
- The dashboard trend is rendered with a lightweight SVG line chart to keep dependencies low.
- Validation is handled by Pydantic on the backend, with basic error responses for missing records and bad input.