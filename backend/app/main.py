import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import LogEntry
from .schemas import AggregateResponse, DailyCount, LogCreate, LogRead, LogUpdate, PaginatedLogs


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Logs Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def apply_filters(
    statement,
    *,
    search: str | None,
    severity: str | None,
    source: str | None,
    start_date: datetime | None,
    end_date: datetime | None,
):
    if search:
        pattern = f"%{search.strip()}%"
        statement = statement.where(or_(LogEntry.message.ilike(pattern), LogEntry.source.ilike(pattern)))
    if severity:
        statement = statement.where(LogEntry.severity == severity)
    if source:
        statement = statement.where(LogEntry.source == source)
    if start_date:
        statement = statement.where(LogEntry.timestamp >= start_date)
    if end_date:
        statement = statement.where(LogEntry.timestamp <= end_date)
    return statement


def seed_logs(session: Session) -> None:
    if session.scalar(select(func.count()).select_from(LogEntry)):
        return

    now = datetime.now(timezone.utc)
    sample_logs = [
        LogEntry(timestamp=now - timedelta(hours=8), message="API started cleanly", severity="info", source="api"),
        LogEntry(timestamp=now - timedelta(hours=7), message="User signed in", severity="info", source="web"),
        LogEntry(timestamp=now - timedelta(hours=6), message="Cache miss on dashboard", severity="warning", source="worker"),
        LogEntry(timestamp=now - timedelta(hours=5), message="Webhook retry succeeded", severity="info", source="worker"),
        LogEntry(timestamp=now - timedelta(hours=4), message="Rate limit reached briefly", severity="warning", source="api"),
        LogEntry(timestamp=now - timedelta(hours=3), message="Database connection reset", severity="error", source="db"),
        LogEntry(timestamp=now - timedelta(hours=2), message="Background job resumed", severity="debug", source="worker"),
        LogEntry(timestamp=now - timedelta(hours=1), message="Frontend requested metrics", severity="info", source="web"),
    ]
    session.add_all(sample_logs)
    session.commit()
    logger.info("Seeded sample logs")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    with Session(bind=engine) as session:
        seed_logs(session)


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/logs", response_model=PaginatedLogs)
def list_logs(
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    search: str | None = None,
    severity: str | None = None,
    source: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    sort_by: str = Query(default="timestamp", pattern="^(timestamp|severity|source)$"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> PaginatedLogs:
    sort_column = getattr(LogEntry, sort_by)
    statement = apply_filters(
        select(LogEntry),
        search=search,
        severity=severity,
        source=source,
        start_date=start_date,
        end_date=end_date,
    )
    order_expression = sort_column.asc() if sort_order == "asc" else sort_column.desc()
    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    items = db.scalars(statement.order_by(order_expression).offset((page - 1) * page_size).limit(page_size)).all()
    return PaginatedLogs(items=items, total=total, page=page, page_size=page_size)


@app.get("/api/logs/query/raw", response_model=list[LogRead])
def raw_logs(
    db: Annotated[Session, Depends(get_db)],
    search: str | None = None,
    severity: str | None = None,
    source: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> list[LogRead]:
    statement = apply_filters(
        select(LogEntry).order_by(LogEntry.timestamp.desc()),
        search=search,
        severity=severity,
        source=source,
        start_date=start_date,
        end_date=end_date,
    )
    return list(db.scalars(statement).all())


@app.get("/api/logs/query/aggregate", response_model=AggregateResponse)
def aggregate_logs(
    db: Annotated[Session, Depends(get_db)],
    search: str | None = None,
    severity: str | None = None,
    source: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> AggregateResponse:
    statement = apply_filters(
        select(LogEntry),
        search=search,
        severity=severity,
        source=source,
        start_date=start_date,
        end_date=end_date,
    )
    items = db.scalars(statement.order_by(LogEntry.timestamp.asc())).all()
    by_severity: dict[str, int] = defaultdict(int)
    by_source: dict[str, int] = defaultdict(int)
    by_day: dict[str, int] = defaultdict(int)

    for item in items:
        by_severity[item.severity] += 1
        by_source[item.source] += 1
        by_day[item.timestamp.strftime("%Y-%m-%d")] += 1

    return AggregateResponse(
        total=len(items),
        by_severity=dict(by_severity),
        by_source=dict(by_source),
        daily_counts=[DailyCount(bucket=key, count=value) for key, value in sorted(by_day.items())],
    )


@app.post("/api/logs", response_model=LogRead, status_code=201)
def create_log(payload: LogCreate, db: Annotated[Session, Depends(get_db)]) -> LogRead:
    item = LogEntry(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@app.get("/api/logs/{log_id}", response_model=LogRead)
def get_log(log_id: int, db: Annotated[Session, Depends(get_db)]) -> LogRead:
    item = db.get(LogEntry, log_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Log not found")
    return item


@app.put("/api/logs/{log_id}", response_model=LogRead)
def update_log(log_id: int, payload: LogUpdate, db: Annotated[Session, Depends(get_db)]) -> LogRead:
    item = db.get(LogEntry, log_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Log not found")

    for field, value in payload.model_dump().items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item


@app.delete("/api/logs/{log_id}", status_code=204)
def delete_log(log_id: int, db: Annotated[Session, Depends(get_db)]) -> Response:
    item = db.get(LogEntry, log_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Log not found")

    db.delete(item)
    db.commit()
    return Response(status_code=204)
