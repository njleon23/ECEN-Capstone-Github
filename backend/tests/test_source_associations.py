from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.services.source_association_repository import (
    AgendaItemNotFoundError,
    SourceNotFoundError,
    attach_source_to_item,
    detach_source_from_item,
    list_sources_for_item,
)
from app.services.source_repository import (
    get_source,
    set_source_approval,
)


client = TestClient(app)

SAMPLE_AGENDA = (
    Path(__file__).resolve().parents[2]
    / "council-brief"
    / "examples"
    / "Sample_City_Council_Agenda_2026-10-08.txt"
)


def create_test_item() -> str:
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
            data={"meeting_title": "Association Test Agenda"},
        )

    assert response.status_code == 201
    return response.json()["items"][0]["item_id"]


def create_test_source() -> str:
    response = client.post(
        "/api/v1/sources",
        json={
            "title": "Association Test Source",
            "source_type": "minutes",
            "text": "Supporting information for an agenda item.",
            "approved": False,
        },
    )

    assert response.status_code == 201
    return response.json()["source_id"]


def test_source_approval_persists():
    source_id = create_test_source()

    updated_source = set_source_approval(source_id, True)

    assert updated_source is not None
    assert updated_source.approved is True

    stored_source = get_source(source_id)

    assert stored_source is not None
    assert stored_source.approved is True


def test_attach_list_and_detach_source():
    item_id = create_test_item()
    source_id = create_test_source()

    assert attach_source_to_item(item_id, source_id) is True
    assert attach_source_to_item(item_id, source_id) is False

    attached_sources = list_sources_for_item(item_id)

    assert len(attached_sources) == 1
    assert attached_sources[0].source_id == source_id

    assert detach_source_from_item(item_id, source_id) is True
    assert detach_source_from_item(item_id, source_id) is False
    assert list_sources_for_item(item_id) == []


def test_source_association_rejects_missing_records():
    item_id = create_test_item()
    source_id = create_test_source()

    try:
        attach_source_to_item("missing-item", source_id)
        assert False, "Expected AgendaItemNotFoundError"
    except AgendaItemNotFoundError:
        pass

    try:
        attach_source_to_item(item_id, "missing-source")
        assert False, "Expected SourceNotFoundError"
    except SourceNotFoundError:
        pass

def test_source_approval_endpoint():
    source_id = create_test_source()

    response = client.patch(
        f"/api/v1/sources/{source_id}/approval",
        json={"approved": True},
    )

    assert response.status_code == 200
    assert response.json()["source_id"] == source_id
    assert response.json()["approved"] is True

    missing_response = client.patch(
        "/api/v1/sources/missing-source/approval",
        json={"approved": True},
    )

    assert missing_response.status_code == 404
    assert (
        missing_response.json()["error"]["code"]
        == "SOURCE_NOT_FOUND"
    )


def test_source_association_endpoints():
    item_id = create_test_item()
    source_id = create_test_source()

    attach_response = client.post(
        f"/api/v1/agenda-items/{item_id}/sources/{source_id}"
    )

    assert attach_response.status_code == 200
    assert attach_response.json() == {
        "item_id": item_id,
        "source_id": source_id,
        "created": True,
    }

    duplicate_response = client.post(
        f"/api/v1/agenda-items/{item_id}/sources/{source_id}"
    )

    assert duplicate_response.status_code == 200
    assert duplicate_response.json()["created"] is False

    list_response = client.get(
        f"/api/v1/agenda-items/{item_id}/sources"
    )

    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["source_id"] == source_id

    detach_response = client.delete(
        f"/api/v1/agenda-items/{item_id}/sources/{source_id}"
    )

    assert detach_response.status_code == 200
    assert detach_response.json()["removed"] is True

    repeated_detach_response = client.delete(
        f"/api/v1/agenda-items/{item_id}/sources/{source_id}"
    )

    assert repeated_detach_response.status_code == 200
    assert repeated_detach_response.json()["removed"] is False


def test_source_association_endpoints_return_not_found():
    item_id = create_test_item()
    source_id = create_test_source()

    missing_item_response = client.post(
        f"/api/v1/agenda-items/missing-item/sources/{source_id}"
    )

    assert missing_item_response.status_code == 404
    assert (
        missing_item_response.json()["error"]["code"]
        == "AGENDA_ITEM_NOT_FOUND"
    )

    missing_source_response = client.post(
        f"/api/v1/agenda-items/{item_id}/sources/missing-source"
    )

    assert missing_source_response.status_code == 404
    assert (
        missing_source_response.json()["error"]["code"]
        == "SOURCE_NOT_FOUND"
    )