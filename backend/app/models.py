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


class SourceCreate(BaseModel):
    title: str = Field(min_length=1)
    source_type: Literal[
        "agenda",
        "minutes",
        "transcript",
        "budget",
        "checkbook",
        "vendor",
        "contract",
        "survey",
        "comment",
        "news",
        "public_discussion",
        "other",
    ] = "other"
    text: str = ""
    source_date: date | None = None
    source_url: str | None = None
    file_name: str | None = None
    approved: bool = False


class SourceResponse(SourceCreate):
    source_id: str
    ingested_at: datetime


class SourceApprovalUpdate(BaseModel):
    approved: bool


class SourceAttachmentResponse(BaseModel):
    item_id: str
    source_id: str
    created: bool


class SourceDetachmentResponse(BaseModel):
    item_id: str
    source_id: str
    removed: bool


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str
    details: dict | None = None
    retry_guidance: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail