"""Shared data objects for the AI and Analytics subsystem.

Field names follow the Interface Control Document (ICD) section 6.4.4 so that
the backend owner can persist and return these objects without translation.
All objects are plain dataclasses with a ``to_dict`` helper that returns
JSON-safe values (lower-case snake_case keys).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def utc_now() -> str:
    """ISO 8601 UTC timestamp ending in Z (ICD definition of 'UTC timestamp')."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Serializable:
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)  # type: ignore[arg-type]


# --------------------------------------------------------------------------
# Inputs: agenda items and sources
# --------------------------------------------------------------------------

# Same values as the backend's ``AgendaItem.review_status`` (backend/app/models.py).
REVIEW_STATUSES = ("needs_review", "confirmed")

# The only three category labels the analysis backend returns. The frontend displays them
# as given and never recomputes thresholds.
PRIORITY_CATEGORIES = ("Low", "Moderate", "High")


@dataclass
class AgendaItem(Serializable):
    """Mirror of ``app.models.AgendaItem`` (same field names, same review statuses)."""
    item_id: str
    agenda_id: str
    item_number: str
    title: str
    source_text: str
    order: int = 0
    review_status: str = "needs_review"

    def __post_init__(self) -> None:
        if self.review_status not in REVIEW_STATUSES:
            raise ValueError(
                f"review_status must be one of {REVIEW_STATUSES}, got {self.review_status!r}")
        if self.order < 0:
            raise ValueError("order must be 0 or greater")


SOURCE_TYPES = (
    "agenda", "minutes", "transcript", "budget", "checkbook", "vendor",
    "contract", "survey", "comment", "news", "public_discussion", "other",
)


@dataclass
class SourceRecord(Serializable):
    source_id: str
    title: str
    source_type: str
    text: str
    source_date: Optional[str] = None
    source_url: Optional[str] = None
    file_name: Optional[str] = None
    approved: bool = False
    ingested_at: str = field(default_factory=utc_now)


@dataclass
class Passage(Serializable):
    """A retrievable piece of an approved source (FSR SRC-004)."""
    passage_id: str
    source_id: str
    source_title: str
    source_type: str
    source_date: Optional[str]
    location: str
    text: str
    checksum: str


@dataclass
class RetrievedPassage(Serializable):
    passage: Passage
    relevance: float  # normalized to 0..1 within a single query


@dataclass
class Citation(Serializable):
    citation_id: str
    source_id: str
    source_title: str
    source_location: str
    excerpt: str
    source_date: Optional[str] = None


# --------------------------------------------------------------------------
# Priority score
# --------------------------------------------------------------------------

@dataclass
class Factor(Serializable):
    key: str
    label: str
    explanation: str
    raw_value: float            # 0..1
    weight: float
    contribution: float         # points on the 0..10 scale
    citations: List[str] = field(default_factory=list)  # source_ids


@dataclass
class PriorityResult(Serializable):
    item_id: str
    score: Optional[float]      # 0..10, None when suppressed (insufficient evidence)
    category: Optional[str]     # "Low" | "Moderate" | "High" | None (None when suppressed)
    configuration_version: str
    factors: List[Factor]
    evidence_level: str         # strong | limited | insufficient
    incomplete: bool = False
    manual_adjustment: Optional[Dict[str, Any]] = None
    computed_at: str = field(default_factory=utc_now)


# --------------------------------------------------------------------------
# Briefing
# --------------------------------------------------------------------------

@dataclass
class Claim(Serializable):
    """A statement in a briefing with the evidence that supports it."""
    text: str
    citation_ids: List[str] = field(default_factory=list)   # ids of Citation objects
    # supported = cited and checked; unsupported = no usable citation;
    # uncertain = cited but a figure could not be matched in the cited text
    support: str = "supported"
    kind: str = "fact"          # fact | interpretation


@dataclass
class AnticipatedQuestion(Serializable):
    question: str
    draft_response: Optional[str] = None
    citation_ids: List[str] = field(default_factory=list)
    confirm_with: List[str] = field(default_factory=list)


@dataclass
class Briefing(Serializable):
    briefing_id: str
    item_id: str
    revision: int
    status: str                  # draft | in_review | approved | rejected
    summary: str
    key_facts: List[Claim]
    concerns: List[Claim]
    anticipated_questions: List[AnticipatedQuestion]
    talking_points: List[Claim]
    citations: List[Citation]
    generated_at: str = field(default_factory=utc_now)
    model_id: str = ""
    prompt_version: str = ""
    configuration_version: str = ""
    source_ids: List[str] = field(default_factory=list)
    incomplete: bool = False
    warnings: List[str] = field(default_factory=list)


# --------------------------------------------------------------------------
# Jobs
# --------------------------------------------------------------------------

JOB_STATES = ("queued", "running", "completed", "degraded", "failed")


@dataclass
class AnalysisJob(Serializable):
    job_id: str
    item_id: str
    state: str = "queued"
    progress_message: str = ""
    created_at: str = field(default_factory=utc_now)
    completed_at: Optional[str] = None
    error: Optional[Dict[str, Any]] = None
    priority: Optional[PriorityResult] = None
    briefing: Optional[Briefing] = None
    idempotency_key: Optional[str] = None
    # Hash of everything that affects the result. If it changes, the stored
    # briefing is stale (FSR REV-004).
    fingerprint: Optional[str] = None


@dataclass
class AnswerResult(Serializable):
    status: str                  # answered | insufficient_evidence | refused | failed
    answer: str = ""
    citations: List[Citation] = field(default_factory=list)
    error_code: Optional[str] = None
    message: str = ""
