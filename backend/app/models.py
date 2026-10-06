from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class AgendaItem(BaseModel):
    item_id: str
    agenda_id: str
    item_number: str
    title: str
    source_text: str
    order: int = Field(ge=0)
    review_status: Literal["needs_review", "confirmed"] = "needs_review"


class AgendaResponse(BaseModel):
    agenda_id: str
    meeting_title: str | None
    meeting_date: date | None
    version_id: str
    original_file_name: str
    uploader: str
    source_url: str | None
    client_version: str | None
    uploaded_at: datetime
    parsing_status: Literal[
        "completed",
        "completed_with_warnings",
        "failed",
    ]
    warnings: list[str]
    items: list[AgendaItem]


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str
    details: dict | None = None
    retry_guidance: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail