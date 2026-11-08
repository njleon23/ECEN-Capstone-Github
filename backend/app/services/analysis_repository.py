from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.analysis.models import (
    AnalysisJob,
    AnticipatedQuestion,
    Briefing,
    Citation,
    Claim,
    Factor,
    PriorityResult,
)
from app.database import SessionLocal
from app.db_models import AnalysisJobRecord, BriefingRecord


class AnalysisRepositoryError(Exception):
    """Raised when analysis data cannot be stored or retrieved."""


def _parse_datetime(value: str | None) -> datetime | None:
    if value is None:
        return None

    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed


def _format_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None

    return (
        value.astimezone(timezone.utc)
        .strftime("%Y-%m-%dT%H:%M:%SZ")
    )


def _priority_from_dict(
    payload: dict | None,
) -> PriorityResult | None:
    if payload is None:
        return None

    priority_data = dict(payload)
    priority_data["factors"] = [
        Factor(**factor)
        for factor in priority_data.get("factors", [])
    ]

    return PriorityResult(**priority_data)


def _briefing_record_to_model(
    record: BriefingRecord,
) -> Briefing:
    return Briefing(
        briefing_id=record.briefing_id,
        item_id=record.item_id,
        revision=record.revision,
        status=record.status,
        summary=record.summary,
        key_facts=[
            Claim(**claim)
            for claim in record.key_facts
        ],
        concerns=[
            Claim(**claim)
            for claim in record.concerns
        ],
        anticipated_questions=[
            AnticipatedQuestion(**question)
            for question in record.anticipated_questions
        ],
        talking_points=[
            Claim(**point)
            for point in record.talking_points
        ],
        citations=[
            Citation(**citation)
            for citation in record.citations
        ],
        generated_at=(
            _format_datetime(record.generated_at)
            or ""
        ),
        model_id=record.model_id,
        prompt_version=record.prompt_version,
        configuration_version=record.configuration_version,
        source_ids=list(record.source_ids),
        incomplete=record.incomplete,
        warnings=list(record.warnings),
    )


def _job_record_to_model(
    record: AnalysisJobRecord,
    briefing: Briefing | None,
) -> AnalysisJob:
    return AnalysisJob(
        job_id=record.job_id,
        item_id=record.item_id,
        state=record.state,
        progress_message=record.progress_message,
        created_at=(
            _format_datetime(record.created_at)
            or ""
        ),
        completed_at=_format_datetime(record.completed_at),
        error=dict(record.error) if record.error else None,
        priority=_priority_from_dict(record.priority),
        briefing=briefing,
        idempotency_key=record.idempotency_key,
        fingerprint=record.fingerprint,
    )


def _save_briefing(
    database: Session,
    briefing: Briefing,
) -> BriefingRecord:
    record = database.get(
        BriefingRecord,
        briefing.briefing_id,
    )

    if record is None:
        latest_revision = database.scalar(
            select(func.max(BriefingRecord.revision))
            .where(BriefingRecord.item_id == briefing.item_id)
        )

        if (
            latest_revision is not None
            and briefing.revision <= latest_revision
        ):
            briefing.revision = latest_revision + 1

        record = BriefingRecord(
            briefing_id=briefing.briefing_id,
            item_id=briefing.item_id,
            revision=briefing.revision,
            status=briefing.status,
            summary=briefing.summary,
            key_facts=[
                claim.to_dict()
                for claim in briefing.key_facts
            ],
            concerns=[
                claim.to_dict()
                for claim in briefing.concerns
            ],
            anticipated_questions=[
                question.to_dict()
                for question in briefing.anticipated_questions
            ],
            talking_points=[
                point.to_dict()
                for point in briefing.talking_points
            ],
            citations=[
                citation.to_dict()
                for citation in briefing.citations
            ],
            source_ids=list(briefing.source_ids),
            warnings=list(briefing.warnings),
            generated_at=_parse_datetime(
                briefing.generated_at
            ),
            model_id=briefing.model_id,
            prompt_version=briefing.prompt_version,
            configuration_version=(
                briefing.configuration_version
            ),
            incomplete=briefing.incomplete,
        )
        database.add(record)
    else:
        record.status = briefing.status
        record.summary = briefing.summary
        record.key_facts = [
            claim.to_dict()
            for claim in briefing.key_facts
        ]
        record.concerns = [
            claim.to_dict()
            for claim in briefing.concerns
        ]
        record.anticipated_questions = [
            question.to_dict()
            for question in briefing.anticipated_questions
        ]
        record.talking_points = [
            point.to_dict()
            for point in briefing.talking_points
        ]
        record.citations = [
            citation.to_dict()
            for citation in briefing.citations
        ]
        record.source_ids = list(briefing.source_ids)
        record.warnings = list(briefing.warnings)
        record.generated_at = _parse_datetime(
            briefing.generated_at
        )
        record.model_id = briefing.model_id
        record.prompt_version = briefing.prompt_version
        record.configuration_version = (
            briefing.configuration_version
        )
        record.incomplete = briefing.incomplete

    database.flush()

    return record


def save_analysis_job(job: AnalysisJob) -> None:
    try:
        with SessionLocal.begin() as database:
            briefing_record = None

            if job.briefing is not None:
                briefing_record = _save_briefing(
                    database,
                    job.briefing,
                )

            record = database.get(
                AnalysisJobRecord,
                job.job_id,
            )

            priority_payload = (
                job.priority.to_dict()
                if job.priority is not None
                else None
            )

            values = {
                "item_id": job.item_id,
                "state": job.state,
                "progress_message": job.progress_message,
                "score": (
                    job.priority.score
                    if job.priority is not None
                    else None
                ),
                "category": (
                    job.priority.category
                    if job.priority is not None
                    else None
                ),
                "evidence_level": (
                    job.priority.evidence_level
                    if job.priority is not None
                    else None
                ),
                "priority": priority_payload,
                "error": (
                    dict(job.error)
                    if job.error is not None
                    else None
                ),
                "idempotency_key": job.idempotency_key,
                "fingerprint": job.fingerprint,
                "created_at": _parse_datetime(job.created_at),
                "completed_at": _parse_datetime(
                    job.completed_at
                ),
                "briefing_id": (
                    briefing_record.briefing_id
                    if briefing_record is not None
                    else None
                ),
            }

            if record is None:
                record = AnalysisJobRecord(
                    job_id=job.job_id,
                    **values,
                )
                database.add(record)
            else:
                for field_name, value in values.items():
                    setattr(record, field_name, value)

    except (SQLAlchemyError, ValueError, TypeError) as error:
        raise AnalysisRepositoryError(
            "The analysis job could not be saved."
        ) from error


def get_analysis_job(
    job_id: str,
) -> AnalysisJob | None:
    try:
        with SessionLocal() as database:
            record = database.get(
                AnalysisJobRecord,
                job_id,
            )

            if record is None:
                return None

            briefing = None

            if record.briefing_id is not None:
                briefing_record = database.get(
                    BriefingRecord,
                    record.briefing_id,
                )

                if briefing_record is not None:
                    briefing = _briefing_record_to_model(
                        briefing_record
                    )

            return _job_record_to_model(
                record,
                briefing,
            )

    except (SQLAlchemyError, ValueError, TypeError) as error:
        raise AnalysisRepositoryError(
            "The analysis job could not be retrieved."
        ) from error


def get_latest_analysis_job(
    item_id: str,
) -> AnalysisJob | None:
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
        with SessionLocal() as database:
            record = database.scalar(statement)

            if record is None:
                return None

            briefing = None

            if record.briefing_id is not None:
                briefing_record = database.get(
                    BriefingRecord,
                    record.briefing_id,
                )

                if briefing_record is not None:
                    briefing = _briefing_record_to_model(
                        briefing_record
                    )

            return _job_record_to_model(
                record,
                briefing,
            )

    except (SQLAlchemyError, ValueError, TypeError) as error:
        raise AnalysisRepositoryError(
            "The latest analysis job could not be retrieved."
        ) from error


def get_analysis_job_by_idempotency_key(
    item_id: str,
    idempotency_key: str,
) -> AnalysisJob | None:
    statement = (
        select(AnalysisJobRecord)
        .where(
            AnalysisJobRecord.item_id == item_id,
            AnalysisJobRecord.idempotency_key
            == idempotency_key,
        )
        .order_by(AnalysisJobRecord.created_at.desc())
        .limit(1)
    )

    try:
        with SessionLocal() as database:
            record = database.scalar(statement)

            if record is None:
                return None

            briefing = None

            if record.briefing_id is not None:
                briefing_record = database.get(
                    BriefingRecord,
                    record.briefing_id,
                )

                if briefing_record is not None:
                    briefing = _briefing_record_to_model(
                        briefing_record
                    )

            return _job_record_to_model(
                record,
                briefing,
            )

    except (SQLAlchemyError, ValueError, TypeError) as error:
        raise AnalysisRepositoryError(
            "The idempotent analysis job could not be retrieved."
        ) from error


def get_latest_briefing(
    item_id: str,
) -> Briefing | None:
    statement = (
        select(BriefingRecord)
        .where(BriefingRecord.item_id == item_id)
        .order_by(
            BriefingRecord.revision.desc(),
            BriefingRecord.generated_at.desc(),
        )
        .limit(1)
    )

    try:
        with SessionLocal() as database:
            record = database.scalar(statement)

            return (
                _briefing_record_to_model(record)
                if record is not None
                else None
            )

    except (SQLAlchemyError, ValueError, TypeError) as error:
        raise AnalysisRepositoryError(
            "The latest briefing could not be retrieved."
        ) from error