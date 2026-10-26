from pathlib import Path

from fastapi.testclient import TestClient


from app.main import app
from app.services.agenda_repository import get_agenda

client = TestClient(app)

SAMPLE_AGENDA = (
    Path(__file__).resolve().parents[2]
    / "council-brief"
    / "examples"
    / "Sample_City_Council_Agenda_2026-10-08.txt"
)


def test_health_endpoint():
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_upload_and_retrieve_agenda():
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
                "meeting_title": "Fictional City Council Regular Meeting",
                "meeting_date": "2026-10-08",
                "client_version": "0.1.0",
            },
        )

    assert response.status_code == 201

    agenda = response.json()

    assert agenda["meeting_date"] == "2026-10-08"
    assert agenda["parsing_status"] == "completed"
    assert len(agenda["items"]) == 15
    assert agenda["items"][0]["item_number"] == "1"
    assert agenda["items"][0]["title"] == (
        "Call to Order and Announcement of a Quorum"
    )

    agenda_id = agenda["agenda_id"]

    retrieval_response = client.get(f"/api/v1/agendas/{agenda_id}")

    assert retrieval_response.status_code == 200
    assert retrieval_response.json()["agenda_id"] == agenda_id
    stored_agenda = get_agenda(agenda_id)

    assert stored_agenda is not None
    assert stored_agenda.agenda_id == agenda_id
    assert len(stored_agenda.items) == 15


def test_reject_unsupported_file():
    response = client.post(
        "/api/v1/agendas",
        files={
            "file": (
                "agenda.csv",
                b"number,title\n1,Call to Order",
                "text/csv",
            )
        },
    )

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"


def test_list_agendas():
    with SAMPLE_AGENDA.open("rb") as agenda_file:
        upload_response = client.post(
            "/api/v1/agendas",
            files={
                "file": (
                    SAMPLE_AGENDA.name,
                    agenda_file,
                    "text/plain",
                )
            },
            data={
                "meeting_title": "Agenda Listing Test",
                "meeting_date": "2026-10-08",
            },
        )

    assert upload_response.status_code == 201

    uploaded_agenda = upload_response.json()
    response = client.get("/api/v1/agendas")

    assert response.status_code == 200

    agendas = response.json()
    agenda_ids = [agenda["agenda_id"] for agenda in agendas]

    assert uploaded_agenda["agenda_id"] in agenda_ids


def test_create_and_list_sources():
    source_payload = {
        "title": "FY 2027 Proposed Budget",
        "source_type": "budget",
        "text": "The proposed budget describes planned City spending.",
        "source_date": "2026-10-18",
        "source_url": "https://example.com/fy27-budget",
        "file_name": "fy27-budget.txt",
        "approved": True,
    }

    create_response = client.post(
        "/api/v1/sources",
        json=source_payload,
    )

    assert create_response.status_code == 201

    created_source = create_response.json()

    assert created_source["title"] == source_payload["title"]
    assert created_source["source_type"] == "budget"
    assert created_source["approved"] is True
    assert created_source["source_id"]
    assert created_source["ingested_at"]

    list_response = client.get("/api/v1/sources")

    assert list_response.status_code == 200

    sources = list_response.json()
    source_ids = [source["source_id"] for source in sources]

    assert created_source["source_id"] in source_ids


def test_reject_invalid_source_type():
    response = client.post(
        "/api/v1/sources",
        json={
            "title": "Invalid Source",
            "source_type": "unsupported_type",
            "text": "Example text",
        },
    )

    assert response.status_code == 422