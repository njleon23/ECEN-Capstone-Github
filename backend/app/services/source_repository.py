from app.models import SourceResponse
from app.services.agenda_repository import (
    AgendaRepositoryError,
    database_connection,
)


class SourceRepositoryError(Exception):
    """Raised when a source cannot be stored or retrieved."""


def initialize_source_table() -> None:
    try:
        with database_connection() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS sources (
                    source_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    text TEXT NOT NULL,
                    source_date TEXT,
                    source_url TEXT,
                    file_name TEXT,
                    approved INTEGER NOT NULL,
                    ingested_at TEXT NOT NULL
                )
                """
            )
    except AgendaRepositoryError as error:
        raise SourceRepositoryError(
            "The source database could not be initialized."
        ) from error


def save_source(source: SourceResponse) -> None:
    initialize_source_table()

    try:
        with database_connection() as connection:
            connection.execute(
                """
                INSERT INTO sources (
                    source_id,
                    title,
                    source_type,
                    text,
                    source_date,
                    source_url,
                    file_name,
                    approved,
                    ingested_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    source.source_id,
                    source.title,
                    source.source_type,
                    source.text,
                    (
                        source.source_date.isoformat()
                        if source.source_date
                        else None
                    ),
                    source.source_url,
                    source.file_name,
                    int(source.approved),
                    source.ingested_at.isoformat(),
                ),
            )
    except AgendaRepositoryError as error:
        raise SourceRepositoryError(
            "The source could not be saved."
        ) from error


def list_sources() -> list[SourceResponse]:
    initialize_source_table()

    try:
        with database_connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM sources
                ORDER BY ingested_at DESC
                """
            ).fetchall()
    except AgendaRepositoryError as error:
        raise SourceRepositoryError(
            "The sources could not be retrieved."
        ) from error

    return [
        SourceResponse(
            source_id=row["source_id"],
            title=row["title"],
            source_type=row["source_type"],
            text=row["text"],
            source_date=row["source_date"],
            source_url=row["source_url"],
            file_name=row["file_name"],
            approved=bool(row["approved"]),
            ingested_at=row["ingested_at"],
        )
        for row in rows
    ]