from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.db_models import (
    AgendaItemRecord,
    AgendaItemSourceRecord,
    SourceRecord,
)
from app.models import SourceResponse
from app.services.source_repository import source_record_to_response


class SourceAssociationRepositoryError(Exception):
    """Raised when a source association operation fails."""


class AgendaItemNotFoundError(SourceAssociationRepositoryError):
    """Raised when an agenda item does not exist."""


class SourceNotFoundError(SourceAssociationRepositoryError):
    """Raised when a source does not exist."""


def attach_source_to_item(
    item_id: str,
    source_id: str,
) -> bool:
    """Attach a source to an item.

    Returns True when created and False when it already exists.
    """
    try:
        with SessionLocal.begin() as database:
            agenda_item = database.get(AgendaItemRecord, item_id)

            if agenda_item is None:
                raise AgendaItemNotFoundError(
                    f"Agenda item {item_id} was not found."
                )

            source = database.get(SourceRecord, source_id)

            if source is None:
                raise SourceNotFoundError(
                    f"Source {source_id} was not found."
                )

            existing = database.get(
                AgendaItemSourceRecord,
                (item_id, source_id),
            )

            if existing is not None:
                return False

            database.add(
                AgendaItemSourceRecord(
                    item_id=item_id,
                    source_id=source_id,
                )
            )

            return True
    except SQLAlchemyError as error:
        raise SourceAssociationRepositoryError(
            "The source could not be attached to the agenda item."
        ) from error


def list_sources_for_item(
    item_id: str,
) -> list[SourceResponse]:
    try:
        with SessionLocal() as database:
            agenda_item = database.get(AgendaItemRecord, item_id)

            if agenda_item is None:
                raise AgendaItemNotFoundError(
                    f"Agenda item {item_id} was not found."
                )

            statement = (
                select(SourceRecord)
                .join(
                    AgendaItemSourceRecord,
                    AgendaItemSourceRecord.source_id
                    == SourceRecord.source_id,
                )
                .where(
                    AgendaItemSourceRecord.item_id == item_id
                )
                .order_by(SourceRecord.ingested_at.desc())
            )

            sources = database.scalars(statement).all()

            return [
                source_record_to_response(source)
                for source in sources
            ]
    except SQLAlchemyError as error:
        raise SourceAssociationRepositoryError(
            "The agenda item sources could not be retrieved."
        ) from error


def detach_source_from_item(
    item_id: str,
    source_id: str,
) -> bool:
    """Detach a source from an item.

    Returns True when removed and False when no association existed.
    """
    try:
        with SessionLocal.begin() as database:
            agenda_item = database.get(AgendaItemRecord, item_id)

            if agenda_item is None:
                raise AgendaItemNotFoundError(
                    f"Agenda item {item_id} was not found."
                )

            source = database.get(SourceRecord, source_id)

            if source is None:
                raise SourceNotFoundError(
                    f"Source {source_id} was not found."
                )

            association = database.get(
                AgendaItemSourceRecord,
                (item_id, source_id),
            )

            if association is None:
                return False

            database.delete(association)

            return True
    except SQLAlchemyError as error:
        raise SourceAssociationRepositoryError(
            "The source could not be detached from the agenda item."
        ) from error