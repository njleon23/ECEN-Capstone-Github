from api_helpers import (
    add_demo_sources,
    api,  # noqa: F401
    item_id,
    run_analysis,
    upload_agenda,
)

from app.analysis.service import set_service


def create_briefing(client):
    agenda = upload_agenda(client)
    add_demo_sources(client)
    agenda_item_id = item_id(agenda, "4.4")
    job = run_analysis(client, agenda_item_id)

    assert job["state"] == "completed"
    assert job["briefing"] is not None

    return agenda_item_id, job["briefing"]


def test_approved_review_survives_restart(api):
    agenda_item_id, briefing = create_briefing(api)
    briefing_id = briefing["briefing_id"]

    response = api.patch(
        f"/api/v1/briefings/{briefing_id}/review",
        json={
            "status": "approved",
            "reviewer": "Test Reviewer",
            "comments": "Verified against the approved sources.",
        },
    )

    assert response.status_code == 200

    review = response.json()

    assert review["briefing_id"] == briefing_id
    assert review["status"] == "approved"
    assert review["reviewer"] == "Test Reviewer"
    assert review["comments"] == (
        "Verified against the approved sources."
    )
    assert review["review_id"]
    assert review["reviewed_at"]

    current_briefing = api.get(
        f"/api/v1/items/{agenda_item_id}/briefing"
    )

    assert current_briefing.status_code == 200
    assert current_briefing.json()["status"] == "approved"

    # Remove the process-wide in-memory analysis service.
    set_service(None)

    restored_briefing = api.get(
        f"/api/v1/items/{agenda_item_id}/briefing"
    )

    assert restored_briefing.status_code == 200
    assert restored_briefing.json()["status"] == "approved"

    restored_history = api.get(
        f"/api/v1/briefings/{briefing_id}/reviews"
    )

    assert restored_history.status_code == 200
    assert len(restored_history.json()) == 1
    assert restored_history.json()[0]["status"] == "approved"


def test_review_history_preserves_each_transition(api):
    agenda_item_id, briefing = create_briefing(api)
    briefing_id = briefing["briefing_id"]

    transitions = [
        {
            "status": "in_review",
            "comments": "Beginning staff review.",
        },
        {
            "status": "approved",
            "comments": "Approved for internal use.",
        },
        {
            "status": "rejected",
            "comments": "Reopened after a source changed.",
        },
        {
            "status": "draft",
            "comments": "Returned to draft for regeneration.",
        },
    ]

    for transition in transitions:
        response = api.patch(
            f"/api/v1/briefings/{briefing_id}/review",
            json={
                "status": transition["status"],
                "reviewer": "Test Reviewer",
                "comments": transition["comments"],
            },
        )

        assert response.status_code == 200

    history_response = api.get(
        f"/api/v1/briefings/{briefing_id}/reviews"
    )

    assert history_response.status_code == 200

    history = history_response.json()

    assert [review["status"] for review in history] == [
        "in_review",
        "approved",
        "rejected",
        "draft",
    ]
    assert len({
        review["review_id"]
        for review in history
    }) == 4

    current_briefing = api.get(
        f"/api/v1/items/{agenda_item_id}/briefing"
    )

    assert current_briefing.status_code == 200
    assert current_briefing.json()["status"] == "draft"


def test_review_validation_and_missing_briefing(api):
    missing_update = api.patch(
        "/api/v1/briefings/missing/review",
        json={
            "status": "approved",
            "reviewer": "Test Reviewer",
            "comments": "",
        },
    )

    assert missing_update.status_code == 404
    assert (
        missing_update.json()["error"]["code"]
        == "NOT_FOUND"
    )

    missing_history = api.get(
        "/api/v1/briefings/missing/reviews"
    )

    assert missing_history.status_code == 404
    assert (
        missing_history.json()["error"]["code"]
        == "NOT_FOUND"
    )

    invalid_status = api.patch(
        "/api/v1/briefings/missing/review",
        json={
            "status": "published",
            "reviewer": "Test Reviewer",
        },
    )

    assert invalid_status.status_code == 422

    missing_reviewer = api.patch(
        "/api/v1/briefings/missing/review",
        json={
            "status": "approved",
            "reviewer": "",
        },
    )

    assert missing_reviewer.status_code == 422