from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


Severity = Literal["debug", "info", "warning", "error"]


class LogBase(BaseModel):
    timestamp: datetime
    message: str = Field(min_length=1, max_length=2000)
    severity: Severity
    source: str = Field(min_length=1, max_length=120)


class LogCreate(LogBase):
    pass


class LogUpdate(LogBase):
    pass


class LogRead(LogBase):
    id: int

    model_config = {"from_attributes": True}


class PaginatedLogs(BaseModel):
    items: list[LogRead]
    total: int
    page: int
    page_size: int


class DailyCount(BaseModel):
    bucket: str
    count: int


class AggregateResponse(BaseModel):
    total: int
    by_severity: dict[str, int]
    by_source: dict[str, int]
    daily_counts: list[DailyCount]
