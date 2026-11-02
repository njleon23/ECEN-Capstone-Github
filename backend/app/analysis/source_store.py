"""Read-only access to the team's ``sources`` table.

Sources are added and approved through the backend's own endpoints
(``POST /api/v1/sources`` and ``PATCH /api/v1/sources/{source_id}/approval``), which store
them in PostgreSQL through ``app.services.source_repository``. This module does not create a
second source library and never writes to the table: it reads the same rows and converts each
one to the analysis ``SourceRecord``. Only approved sources may ever be retrieved for analysis
(FSR SRC-007); the approved flag is taken from the table as it stands.
"""

from __future__ import annotations

from typing import List, Optional

from app.services.source_repository import get_source as _get_backend_source
from app.services.source_repository import list_sources as _list_backend_sources

from .models import SourceRecord


def _to_record(source) -> SourceRecord:
    """Convert the backend's SourceResponse into the analysis SourceRecord."""
    return SourceRecord(
        source_id=source.source_id, title=source.title, source_type=source.source_type,
        text=source.text,
        source_date=source.source_date.isoformat() if source.source_date else None,
        source_url=source.source_url, file_name=source.file_name,
        approved=bool(source.approved), ingested_at=source.ingested_at.isoformat())


def list_sources() -> List[SourceRecord]:
    """Every source in the table, oldest first (a stable order for retrieval)."""
    rows = sorted(_list_backend_sources(), key=lambda s: (s.ingested_at, s.source_id))
    return [_to_record(s) for s in rows]


def get_source(source_id: str) -> Optional[SourceRecord]:
    source = _get_backend_source(source_id)
    return _to_record(source) if source is not None else None
