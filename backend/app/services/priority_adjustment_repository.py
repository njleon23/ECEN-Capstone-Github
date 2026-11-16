"""Stores reviewer adjustments to a priority score (FSR ANA-007).

An adjustment is applied to the item's latest analysis job. The job keeps the
adjusted score so the heat list and the item page both show it, and every
adjustment is also written to its own history row with the reviewer and the
reason. Running a new analysis creates a new job with an unadjusted score,
because the evidence may have changed; the history of earlier adjustments is
kept.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.analysis.config import DEFAULT_SCORE_CONFIG, ScoreConfig
from app.analysis.errors import InvalidRequest
from app.analysis.scoring import apply_manual_adjustment
from app.database import SessionLocal
from app.db_models import AnalysisJobRecord, PriorityAdjustmentRecord
from app.models import PriorityAdjustmentResponse
from app.services.analysis_repository import _priority_from_dict


class PriorityAdjustmentRepositoryError(Exception):
    """Raised when adjustment data cannot be stored or read."""


class NoAnalysisToAdjustError(Exception):
    """Raised when the item has no analysis job yet."""


def _to_response(record: PriorityAdjustmentRecord) -> PriorityAdjustmentResponse:
    return PriorityAdjustmentResponse(
        adjustment_id=record.adjustment_id,
        item_id=record.item_id,
        job_id=record.job_id,
        factor_key=record.factor_key,
        old_value=record.old_value,
        new_value=record.new_value,
        old_score=record.old_score,
        new_score=record.new_score,
        new_category=record.new_category,
        reason=record.reason,
        reviewer=record.reviewer,
        created_at=record.created_at,
    )


def save_priority_adjustment(
    item_id: str,
    factor_key: str,
    new_raw_value: float,
    reason: str,
    reviewer: str,
    config: ScoreConfig = DEFAULT_SCORE_CONFIG,
) -> PriorityAdjustmentResponse:
    """Adjust one factor on the item's latest analysis and save the history row.

    Raises InvalidRequest (missing reason, unknown factor, no score to adjust)
    or NoAnalysisToAdjustError. The job update and the history row commit
    together or not at all.
    """
    statement = (
        select(AnalysisJobRecord)
        .where(AnalysisJobRecord.item_id == item_id)
        .order_by(
            AnalysisJobRecord.created_at.desc(),
            AnalysisJobRecord.job_id.desc(),
        )
        .limit(1)
    )

    try:
        with SessionLocal.begin() as database:
            job = database.scalar(statement)

            if job is None:
                raise NoAnalysisToAdjustError(item_id)

            current = _priority_from_dict(job.priority)

            if current is None or current.score is None:
                raise InvalidRequest(
                    "This item has no priority score to adjust. "
                    "Approve and attach evidence, then analyze it again."
                )

            adjusted = apply_manual_adjustment(
                current,
                factor_key=factor_key,
                new_raw_value=new_raw_value,
                reason=reason,
                reviewer_id=reviewer.strip(),
                config=config,
            )
            details = adjusted.manual_adjustment or {}

            job.priority = adjusted.to_dict()
            job.score = adjusted.score
            job.category = adjusted.category

            record = PriorityAdjustmentRecord(
                adjustment_id=str(uuid4()),
                item_id=item_id,
                job_id=job.job_id,
                factor_key=factor_key,
                old_value=float(details["old_value"]),
                new_value=float(details["new_value"]),
                old_score=float(current.score),
                new_score=float(adjusted.score),
                new_category=adjusted.category,
                reason=reason.strip(),
                reviewer=reviewer.strip(),
                created_at=datetime.now(timezone.utc),
            )
            database.add(record)
            database.flush()

            return _to_response(record)

    except SQLAlchemyError as error:
        raise PriorityAdjustmentRepositoryError(
            "The priority adjustment could not be saved."
        ) from error


def list_priority_adjustments(
    item_id: str,
) -> list[PriorityAdjustmentResponse]:
    statement = (
        select(PriorityAdjustmentRecord)
        .where(PriorityAdjustmentRecord.item_id == item_id)
        .order_by(
            PriorityAdjustmentRecord.created_at.asc(),
            PriorityAdjustmentRecord.adjustment_id.asc(),
        )
    )

    try:
        with SessionLocal() as database:
            return [
                _to_response(record)
                for record in database.scalars(statement)
            ]
    except SQLAlchemyError as error:
        raise PriorityAdjustmentRepositoryError(
            "The priority adjustments could not be retrieved."
        ) from error
