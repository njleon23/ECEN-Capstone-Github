"""Helpers and the ``api`` fixture shared by the AI and Analytics API tests.

This is not a conftest.py on purpose: the backend's own ``tests/conftest.py`` prepares the
dedicated PostgreSQL test database, and these tests reuse that setup. Test files import what
they need, for example ``from api_helpers import api, add_demo_sources``.
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.analysis.demo_sources import demo_sources
from app.analysis.llm_client import OfflineExtractiveProvider
from app.analysis.service import AnalysisService, set_service
from app.database import SessionLocal
from app.db_models import (AgendaItemRecord, AgendaItemSourceRecord, AgendaRecord,
                           SourceRecord)
from app.main import app

SAMPLE_AGENDA = (Path(__file__).resolve().parents[2] / "council-brief" / "examples"
                 / "Sample_City_Council_Agenda_2026-10-08.txt")


def _clear_tables():
    """Empty the test database so each test sees only the rows it creates."""
    with SessionLocal.begin() as db:
        for table in (AgendaItemSourceRecord, SourceRecord, AgendaItemRecord, AgendaRecord):
            db.execute(delete(table))


@pytest.fixture()
def api(monkeypatch):
    """A TestClient on the test database, with empty tables and a fresh analysis service."""
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    _clear_tables()
    set_service(AnalysisService(OfflineExtractiveProvider()))
    yield TestClient(app)
    set_service(None)
    _clear_tables()


def upload_agenda(client):
    with SAMPLE_AGENDA.open("rb") as f:
        r = client.post("/api/v1/agendas", files={"file": (SAMPLE_AGENDA.name, f, "text/plain")},
                        data={"meeting_title": "Regular Meeting", "meeting_date": "2026-10-08"})
    assert r.status_code == 201
    return r.json()


def item_id(agenda, number):
    return next(i["item_id"] for i in agenda["items"] if i["item_number"] == number)


def set_approval(client, source_id, approved):
    r = client.patch(f"/api/v1/sources/{source_id}/approval", json={"approved": approved})
    assert r.status_code == 200
    return r.json()


def add_demo_sources(client, approve=True):
    """Add the fictional sources through the backend's own endpoint, then approve them."""
    ids = {}
    for s in demo_sources():
        r = client.post("/api/v1/sources", json={
            "title": s.title, "source_type": s.source_type, "text": s.text,
            "source_date": s.source_date})
        assert r.status_code == 201
        assert r.json()["approved"] is False              # always starts unapproved
        ids[s.source_id] = r.json()["source_id"]
        if approve and s.approved:
            set_approval(client, ids[s.source_id], True)
    return ids


def run_analysis(client, iid, **headers):
    r = client.post(f"/api/v1/items/{iid}/analyses", headers=headers)
    assert r.status_code == 202
    # TestClient runs background tasks before returning, so the job is finished.
    return client.get(r.json()["status_url"]).json()
