from io import BytesIO
from pathlib import Path

import pytest
from pypdf import PdfWriter
from api_helpers import api, upload_agenda  # noqa: F401
from app.services.agenda_repository import get_agenda

from sqlalchemy.exc import SQLAlchemyError

from app import main as main_module
from app.routers import agendas

SAMPLE_AGENDA = (
    Path(__file__).resolve().parents[2]
    / "council-brief"
    / "examples"
    / "Sample_City_Council_Agenda_2026-10-08.txt"
)


def test_health_endpoint(api):
    response = api.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    assert response.json()["database"] == "connected"

def test_upload_and_retrieve_agenda(api):
    with SAMPLE_AGENDA.open("rb") as agenda_file:
        response = api.post(
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

    retrieval_response = api.get(f"/api/v1/agendas/{agenda_id}")

    assert retrieval_response.status_code == 200
    assert retrieval_response.json()["agenda_id"] == agenda_id
    stored_agenda = get_agenda(agenda_id)

    assert stored_agenda is not None
    assert stored_agenda.agenda_id == agenda_id
    assert len(stored_agenda.items) == 15


def test_reject_unsupported_file(api):
    response = api.post(
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


@pytest.mark.parametrize(
    ("name", "content", "status", "code"),
    [
        ("broken.pdf", b"not a PDF", 400, "INVALID_REQUEST"),
        ("empty.md", b"", 400, "INVALID_REQUEST"),
    ],
)
def test_invalid_upload_does_not_change_agendas(api, name, content, status, code):
    upload_agenda(api)
    before = api.get("/api/v1/agendas").json()
    response = api.post("/api/v1/agendas", files={"file": (name, content)})
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert api.get("/api/v1/agendas").json() == before


def test_pdf_without_searchable_text_requests_ocr(api):
    pdf = PdfWriter()
    pdf.add_blank_page(width=612, height=792)
    buffer = BytesIO()
    pdf.write(buffer)

    response = api.post(
        "/api/v1/agendas",
        files={"file": ("no-text.pdf", buffer.getvalue(), "application/pdf")},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "OCR_REQUIRED"
    assert api.get("/api/v1/agendas").json() == []


def test_agenda_upload_size_boundary(api, monkeypatch):
    content = b"1. Call to Order\n"
    monkeypatch.setattr(agendas, "MAX_FILE_SIZE", len(content))
    accepted = api.post("/api/v1/agendas", files={"file": ("agenda.txt", content)})
    assert accepted.status_code == 201
    before = api.get("/api/v1/agendas").json()

    rejected = api.post("/api/v1/agendas", files={"file": ("agenda.txt", content + b" ")})
    assert rejected.status_code == 413
    assert rejected.json()["error"]["code"] == "FILE_TOO_LARGE"
    assert api.get("/api/v1/agendas").json() == before


def test_markdown_upload_preserves_50_numbered_items(api):
    content = "\n\n".join(
        f"## Item {number}: Council business {number}\n\nStaff discussion."
        for number in range(1, 51)
    ).encode("utf-8-sig")
    response = api.post(
        "/api/v1/agendas",
        files={"file": ("work-session.md", content, "text/markdown")},
    )

    assert response.status_code == 201
    uploaded = response.json()
    stored = api.get(f"/api/v1/agendas/{uploaded['agenda_id']}").json()
    assert stored["items"] == uploaded["items"]
    assert [item["item_number"] for item in stored["items"]] == [
        str(number) for number in range(1, 51)
    ]
    assert stored["items"][0]["title"] == "Council business 1"
    assert "Staff discussion." in stored["items"][0]["source_text"]
    assert all(item["agenda_id"] == stored["agenda_id"] for item in stored["items"])


def test_list_agendas(api):
    with SAMPLE_AGENDA.open("rb") as agenda_file:
        upload_response = api.post(
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
    response = api.get("/api/v1/agendas")

    assert response.status_code == 200

    agendas = response.json()
    agenda_ids = [agenda["agenda_id"] for agenda in agendas]

    assert uploaded_agenda["agenda_id"] in agenda_ids


def test_create_and_list_sources(api):
    source_payload = {
        "title": "FY 2027 Proposed Budget",
        "source_type": "budget",
        "text": "The proposed budget describes planned City spending.",
        "source_date": "2026-10-18",
        "source_url": "https://example.com/fy27-budget",
        "file_name": "fy27-budget.txt",
        "approved": True,
    }

    create_response = api.post(
        "/api/v1/sources",
        json=source_payload,
    )

    assert create_response.status_code == 201

    created_source = create_response.json()

    assert created_source["title"] == source_payload["title"]
    assert created_source["source_type"] == "budget"
    # Even an authenticated caller must use the approval endpoint separately.
    assert created_source["approved"] is False
    assert created_source["source_id"]
    assert created_source["ingested_at"]

    list_response = api.get("/api/v1/sources")

    assert list_response.status_code == 200

    sources = list_response.json()
    source_ids = [source["source_id"] for source in sources]

    assert created_source["source_id"] in source_ids


def test_reject_invalid_source_type(api):
    response = api.post(
        "/api/v1/sources",
        json={
            "title": "Invalid Source",
            "source_type": "unsupported_type",
            "text": "Example text",
        },
    )

    assert response.status_code == 422


def test_health_endpoint_reports_database_failure(api, monkeypatch):
    def fail_connection():
        raise SQLAlchemyError("Database unavailable")

    # Restore the real connection before fixture cleanup runs.
    with monkeypatch.context() as patch:
        patch.setattr(
            main_module.engine,
            "connect",
            fail_connection,
        )

        response = api.get("/api/v1/health")

    assert response.status_code == 503
    assert response.json()["status"] == "unhealthy"
    assert response.json()["database"] == "unavailable"
