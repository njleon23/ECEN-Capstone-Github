import json
import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.models import AgendaItem, AgendaResponse


DATABASE_PATH_ENV = "COUNCIL_BRIEF_DB_PATH"
DEFAULT_DATABASE_PATH = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "council_brief.db"
)


class AgendaRepositoryError(Exception):
    """Raised when an agenda cannot be stored or retrieved."""


def get_database_path() -> Path:
    configured_path = os.getenv(DATABASE_PATH_ENV)

    return (
        Path(configured_path).expanduser()
        if configured_path
        else DEFAULT_DATABASE_PATH
    )


@contextmanager
def database_connection() -> Iterator[sqlite3.Connection]:
    database_path = get_database_path()

    try:
        database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(database_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
    except (OSError, sqlite3.Error) as error:
        raise AgendaRepositoryError(
            "The agenda database could not be opened."
        ) from error

    try:
        yield connection
        connection.commit()
    except sqlite3.Error as error:
        connection.rollback()
        raise AgendaRepositoryError(
            "The agenda database operation failed."
        ) from error
    finally:
        connection.close()


def initialize_database() -> None:
    with database_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS agendas (
                agenda_id TEXT PRIMARY KEY,
                meeting_title TEXT,
                meeting_date TEXT,
                version_id TEXT NOT NULL,
                original_file_name TEXT NOT NULL,
                uploader TEXT NOT NULL,
                source_url TEXT,
                client_version TEXT,
                uploaded_at TEXT NOT NULL,
                parsing_status TEXT NOT NULL,
                warnings_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agenda_items (
                item_id TEXT PRIMARY KEY,
                agenda_id TEXT NOT NULL,
                item_number TEXT NOT NULL,
                title TEXT NOT NULL,
                source_text TEXT NOT NULL,
                item_order INTEGER NOT NULL,
                review_status TEXT NOT NULL,
                FOREIGN KEY (agenda_id)
                    REFERENCES agendas (agenda_id)
                    ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_agenda_items_agenda_id
                ON agenda_items (agenda_id, item_order);
            """
        )


def save_agenda(agenda: AgendaResponse) -> None:
    initialize_database()

    with database_connection() as connection:
        connection.execute(
            """
            INSERT INTO agendas (
                agenda_id,
                meeting_title,
                meeting_date,
                version_id,
                original_file_name,
                uploader,
                source_url,
                client_version,
                uploaded_at,
                parsing_status,
                warnings_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                agenda.agenda_id,
                agenda.meeting_title,
                agenda.meeting_date.isoformat()
                if agenda.meeting_date
                else None,
                agenda.version_id,
                agenda.original_file_name,
                agenda.uploader,
                agenda.source_url,
                agenda.client_version,
                agenda.uploaded_at.isoformat(),
                agenda.parsing_status,
                json.dumps(agenda.warnings),
            ),
        )

        connection.executemany(
            """
            INSERT INTO agenda_items (
                item_id,
                agenda_id,
                item_number,
                title,
                source_text,
                item_order,
                review_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    item.item_id,
                    item.agenda_id,
                    item.item_number,
                    item.title,
                    item.source_text,
                    item.order,
                    item.review_status,
                )
                for item in agenda.items
            ],
        )


def get_agenda(agenda_id: str) -> AgendaResponse | None:
    initialize_database()

    with database_connection() as connection:
        agenda_row = connection.execute(
            "SELECT * FROM agendas WHERE agenda_id = ?",
            (agenda_id,),
        ).fetchone()

        if agenda_row is None:
            return None

        item_rows = connection.execute(
            """
            SELECT *
            FROM agenda_items
            WHERE agenda_id = ?
            ORDER BY item_order
            """,
            (agenda_id,),
        ).fetchall()

    items = [
        AgendaItem(
            item_id=row["item_id"],
            agenda_id=row["agenda_id"],
            item_number=row["item_number"],
            title=row["title"],
            source_text=row["source_text"],
            order=row["item_order"],
            review_status=row["review_status"],
        )
        for row in item_rows
    ]

    return AgendaResponse(
        agenda_id=agenda_row["agenda_id"],
        meeting_title=agenda_row["meeting_title"],
        meeting_date=agenda_row["meeting_date"],
        version_id=agenda_row["version_id"],
        original_file_name=agenda_row["original_file_name"],
        uploader=agenda_row["uploader"],
        source_url=agenda_row["source_url"],
        client_version=agenda_row["client_version"],
        uploaded_at=agenda_row["uploaded_at"],
        parsing_status=agenda_row["parsing_status"],
        warnings=json.loads(agenda_row["warnings_json"]),
        items=items,
    )


def list_agendas() -> list[AgendaResponse]:
    initialize_database()

    with database_connection() as connection:
        agenda_rows = connection.execute(
            """
            SELECT agenda_id
            FROM agendas
            ORDER BY uploaded_at DESC
            """
        ).fetchall()

    agendas: list[AgendaResponse] = []

    for row in agenda_rows:
        agenda = get_agenda(row["agenda_id"])

        if agenda is not None:
            agendas.append(agenda)

    return agendas