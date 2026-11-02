"""Read agenda items (stored by the agenda upload endpoint) as analysis ``AgendaItem``s.

Reads the backend's ``agenda_items`` table (PostgreSQL, through SQLAlchemy) and never changes
it. A database failure is raised as the backend's own ``AgendaRepositoryError`` so the
endpoints can answer with the project's 503 error envelope.
"""

from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.db_models import AgendaItemRecord
from app.services.agenda_repository import AgendaRepositoryError

from .models import AgendaItem


def _to_item(row: AgendaItemRecord) -> AgendaItem:
    return AgendaItem(
        item_id=row.item_id, agenda_id=row.agenda_id, item_number=row.item_number,
        title=row.title, source_text=row.source_text, order=row.item_order,
        review_status=row.review_status)


def get_item(item_id: str) -> Optional[AgendaItem]:
    try:
        with SessionLocal() as db:
            row = db.get(AgendaItemRecord, item_id)
            return _to_item(row) if row is not None else None
    except SQLAlchemyError as error:
        raise AgendaRepositoryError("The agenda item could not be retrieved.") from error


def list_items(agenda_id: str) -> List[AgendaItem]:
    statement = (select(AgendaItemRecord)
                 .where(AgendaItemRecord.agenda_id == agenda_id)
                 .order_by(AgendaItemRecord.item_order))
    try:
        with SessionLocal() as db:
            return [_to_item(r) for r in db.scalars(statement).all()]
    except SQLAlchemyError as error:
        raise AgendaRepositoryError("The agenda items could not be retrieved.") from error
