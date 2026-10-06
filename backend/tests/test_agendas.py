from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


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