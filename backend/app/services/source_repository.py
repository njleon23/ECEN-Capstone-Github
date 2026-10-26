from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.db_models import SourceRecord
from app.models import SourceResponse


class SourceRepositoryError(Exception):
    """Raised when a source cannot be stored or retrieved."""


def source_record_to_response(
    source: SourceRecord,
) -> SourceResponse:
    return SourceResponse(
        source_id=source.source_id,
        title=source.title,
        source_type=source.source_type,
        text=source.text,
        source_date=source.source_date,
        source_url=source.source_url,
        file_name=source.file_name,
        approved=source.approved,
        ingested_at=source.ingested_at,
    )


def save_source(source: SourceResponse) -> None:
    source_record = SourceRecord(
        source_id=source.source_id,
        title=source.title,
        source_type=source.source_type,
        text=source.text,
        source_date=source.source_date,
        source_url=source.source_url,
        file_name=source.file_name,
        approved=source.approved,
        ingested_at=source.ingested_at,
    )

    try:
        with SessionLocal.begin() as database:
            database.add(source_record)
    except SQLAlchemyError as error:
        raise SourceRepositoryError(
            "The source could not be saved."
        ) from error


def list_sources() -> list[SourceResponse]:
    statement = (
        select(SourceRecord)
        .order_by(SourceRecord.ingested_at.desc())
    )

    try:
        with SessionLocal() as database:
            sources = database.scalars(statement).all()

            return [
                source_record_to_response(source)
                for source in sources
            ]
    except SQLAlchemyError as error:
        raise SourceRepositoryError(
            "The sources could not be retrieved."
        ) from error

def get_source(source_id: str) -> SourceResponse | None:
    try:
        with SessionLocal() as database:
            source = database.get(SourceRecord, source_id)

            if source is None:
                return None

            return source_record_to_response(source)
    except SQLAlchemyError as error:
        raise SourceRepositoryError(
            "The source could not be retrieved."
        ) from error


def set_source_approval(
    source_id: str,
    approved: bool,
) -> SourceResponse | None:
    try:
        with SessionLocal.begin() as database:
            source = database.get(SourceRecord, source_id)

            if source is None:
                return None

            source.approved = approved
            database.flush()

            return source_record_to_response(source)
    except SQLAlchemyError as error:
        raise SourceRepositoryError(
            "The source approval state could not be updated."
        ) from error