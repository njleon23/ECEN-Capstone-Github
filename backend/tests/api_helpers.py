"""Helpers and the ``api`` fixture shared by analysis API tests.

Successful-analysis helpers explicitly attach the sources they create to the
agenda item. This mirrors the production source-association boundary instead
of relying on the old global-source behavior.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.analysis.demo_sources import demo_sources
from app.analysis.llm_client import OfflineExtractiveProvider
from app.analysis.service import AnalysisService, set_service
from app.database import SessionLocal
from app.db_models import (
    AgendaItemRecord,
    AgendaItemSourceRecord,
    AgendaRecord,
    SourceRecord,
)
from app.main import app


SAMPLE_AGENDA = (
    Path(__file__).resolve().parents[2]
    / "council-brief"
    / "examples"
    / "Sample_City_Council_Agenda_2026-10-08.txt"
)


def _clear_tables():
    """Empty the test database so each test sees only its own rows."""
    with SessionLocal.begin() as database:
        for table in (
            AgendaItemSourceRecord,
            SourceRecord,
            AgendaItemRecord,
            AgendaRecord,
        ):
            database.execute(delete(table))


@pytest.fixture()
def api(monkeypatch):
    """TestClient using the isolated PostgreSQL test database."""
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    _clear_tables()
    set_service(AnalysisService(OfflineExtractiveProvider()))
    yield TestClient(app)
    set_service(None)
    _clear_tables()


def upload_agenda(client):
    with SAMPLE_AGENDA.open("rb") as agenda_file:
        response = client.post(
            "/api/v1/agendas",
            files={
                "file": (
                    SAMPLE_AGENDA.name,
                    agenda_file,
                    "text/plain",
                )
            },
            data={
                "meeting_title": "Regular Meeting",
                "meeting_date": "2026-10-08",
            },
        )

    assert response.status_code == 201
    return response.json()


def item_id(agenda, number):
    return next(
        item["item_id"]
        for item in agenda["items"]
        if item["item_number"] == number
    )


def set_approval(client, source_id, approved):
    response = client.patch(
        f"/api/v1/sources/{source_id}/approval",
        json={"approved": approved},
    )

    assert response.status_code == 200
    return response.json()


def add_demo_sources(client, approve=True):
    """Add fictional sources and optionally approve their approved fixtures."""
    ids = {}

    for source in demo_sources():
        response = client.post(
            "/api/v1/sources",
            json={
                "title": source.title,
                "source_type": source.source_type,
                "text": source.text,
                "source_date": source.source_date,
            },
        )

        assert response.status_code == 201
        assert response.json()["approved"] is False

        ids[source.source_id] = response.json()["source_id"]

        if approve and source.approved:
            set_approval(
                client,
                ids[source.source_id],
                True,
            )

    return ids


def attach_sources_to_item(client, agenda_item_id, source_ids):
    """Attach the given sources, accepting already-existing associations."""
    for source_id in dict.fromkeys(source_ids):
        response = client.post(
            f"/api/v1/agenda-items/{agenda_item_id}"
            f"/sources/{source_id}"
        )

        assert response.status_code == 200
        assert response.json()["item_id"] == agenda_item_id
        assert response.json()["source_id"] == source_id


def attach_all_sources_to_item(client, agenda_item_id):
    response = client.get("/api/v1/sources")
    assert response.status_code == 200

    attach_sources_to_item(
        client,
        agenda_item_id,
        [source["source_id"] for source in response.json()],
    )


def run_analysis(client, agenda_item_id, **headers):
    """Attach current test sources, run analysis, and return its final job."""
    attach_all_sources_to_item(client, agenda_item_id)

    response = client.post(
        f"/api/v1/items/{agenda_item_id}/analyses",
        headers=headers,
    )

    assert response.status_code == 202

    # TestClient completes FastAPI background tasks before returning.
    return client.get(response.json()["status_url"]).json()
