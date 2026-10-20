from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload

from app.database import SessionLocal
from app.db_models import AgendaItemRecord, AgendaRecord
from app.models import AgendaItem, AgendaResponse


class AgendaRepositoryError(Exception):
    """Raised when an agenda cannot be stored or retrieved."""


def agenda_record_to_response(
    agenda: AgendaRecord,
) -> AgendaResponse:
    items = [
        AgendaItem(
            item_id=item.item_id,
            agenda_id=item.agenda_id,
            item_number=item.item_number,
            title=item.title,
            source_text=item.source_text,
            order=item.item_order,
            review_status=item.review_status,
        )
        for item in agenda.items
    ]

    return AgendaResponse(
        agenda_id=agenda.agenda_id,
        meeting_title=agenda.meeting_title,
        meeting_date=agenda.meeting_date,
        version_id=agenda.version_id,
        original_file_name=agenda.original_file_name,
        uploader=agenda.uploader,
        source_url=agenda.source_url,
        client_version=agenda.client_version,
        uploaded_at=agenda.uploaded_at,
        parsing_status=agenda.parsing_status,
        warnings=agenda.warnings or [],
        items=items,
    )


def save_agenda(agenda: AgendaResponse) -> None:
    agenda_record = AgendaRecord(
        agenda_id=agenda.agenda_id,
        meeting_title=agenda.meeting_title,
        meeting_date=agenda.meeting_date,
        version_id=agenda.version_id,
        original_file_name=agenda.original_file_name,
        uploader=agenda.uploader,
        source_url=agenda.source_url,
        client_version=agenda.client_version,
        uploaded_at=agenda.uploaded_at,
        parsing_status=agenda.parsing_status,
        warnings=agenda.warnings,
        items=[
            AgendaItemRecord(
                item_id=item.item_id,
                agenda_id=item.agenda_id,
                item_number=item.item_number,
                title=item.title,
                source_text=item.source_text,
                item_order=item.order,
                review_status=item.review_status,
            )
            for item in agenda.items
        ],
    )

    try:
        with SessionLocal.begin() as database:
            database.add(agenda_record)
    except SQLAlchemyError as error:
        raise AgendaRepositoryError(
            "The agenda could not be saved."
        ) from error


def get_agenda(agenda_id: str) -> AgendaResponse | None:
    statement = (
        select(AgendaRecord)
        .options(selectinload(AgendaRecord.items))
        .where(AgendaRecord.agenda_id == agenda_id)
    )

    try:
        with SessionLocal() as database:
            agenda = database.scalar(statement)

            if agenda is None:
                return None

            return agenda_record_to_response(agenda)
    except SQLAlchemyError as error:
        raise AgendaRepositoryError(
            "The agenda could not be retrieved."
        ) from error


def list_agendas() -> list[AgendaResponse]:
    statement = (
        select(AgendaRecord)
        .options(selectinload(AgendaRecord.items))
        .order_by(AgendaRecord.uploaded_at.desc())
    )

    try:
        with SessionLocal() as database:
            agendas = database.scalars(statement).unique().all()

            return [
                agenda_record_to_response(agenda)
                for agenda in agendas
            ]
    except SQLAlchemyError as error:
        raise AgendaRepositoryError(
            "The agendas could not be retrieved."
        ) from error