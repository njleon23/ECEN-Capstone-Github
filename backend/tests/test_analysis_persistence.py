from api_helpers import (
    add_demo_sources,
    api,  # noqa: F401
    item_id,
    upload_agenda,
    attach_all_sources_to_item,
)

from app.analysis.errors import DependencyUnavailable
from app.analysis.service import AnalysisService, set_service


class DownProvider:
    model_id = "down"

    def complete_json(self, **_):
        raise DependencyUnavailable("provider is down")


def submit_analysis(
    client,
    agenda_item_id: str,
    idempotency_key: str,
) -> str:
    attach_all_sources_to_item(
    client,
    agenda_item_id,
)
    response = client.post(
        f"/api/v1/items/{agenda_item_id}/analyses",
        headers={
            "Idempotency-Key": idempotency_key,
        },
    )

    assert response.status_code == 202

    return response.json()["job_id"]


def test_job_and_briefing_survive_service_restart(api):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    agenda_item_id = item_id(agenda, "4.4")

    job_id = submit_analysis(
        api,
        agenda_item_id,
        "persistent-job",
    )

    original_job = api.get(
        f"/api/v1/jobs/{job_id}"
    ).json()

    assert original_job["state"] == "completed"
    assert original_job["priority"]["score"] is not None
    assert original_job["briefing"] is not None

    briefing_id = original_job["briefing"]["briefing_id"]

    # Simulate restarting FastAPI and losing in-memory jobs.
    set_service(None)

    restored_response = api.get(
        f"/api/v1/jobs/{job_id}"
    )

    assert restored_response.status_code == 200

    restored_job = restored_response.json()

    assert restored_job["job_id"] == job_id
    assert restored_job["state"] == "completed"
    assert restored_job["priority"] == original_job["priority"]
    assert (
        restored_job["briefing"]["briefing_id"]
        == briefing_id
    )

    restored_briefing = api.get(
        f"/api/v1/items/{agenda_item_id}/briefing"
    )

    assert restored_briefing.status_code == 200
    assert (
        restored_briefing.json()["briefing_id"]
        == briefing_id
    )

    # The same key must still return the original job after restart.
    replay = api.post(
        f"/api/v1/items/{agenda_item_id}/analyses",
        headers={
            "Idempotency-Key": "persistent-job",
        },
    )

    assert replay.status_code == 202
    assert replay.json()["job_id"] == job_id


def test_briefing_revision_increases_after_restart(api):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    agenda_item_id = item_id(agenda, "4.4")

    first_job_id = submit_analysis(
        api,
        agenda_item_id,
        "revision-one",
    )
    first_job = api.get(
        f"/api/v1/jobs/{first_job_id}"
    ).json()

    assert first_job["briefing"]["revision"] == 1

    set_service(None)

    second_job_id = submit_analysis(
        api,
        agenda_item_id,
        "revision-two",
    )
    second_job = api.get(
        f"/api/v1/jobs/{second_job_id}"
    ).json()

    assert second_job_id != first_job_id
    assert second_job["briefing"]["revision"] == 2

    set_service(None)

    latest_briefing = api.get(
        f"/api/v1/items/{agenda_item_id}/briefing"
    )

    assert latest_briefing.status_code == 200
    assert latest_briefing.json()["revision"] == 2
    assert (
        latest_briefing.json()["briefing_id"]
        == second_job["briefing"]["briefing_id"]
    )


def test_provider_failure_does_not_replace_last_good_briefing(
    api,
):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    agenda_item_id = item_id(agenda, "4.4")

    successful_job_id = submit_analysis(
        api,
        agenda_item_id,
        "successful-analysis",
    )
    successful_job = api.get(
        f"/api/v1/jobs/{successful_job_id}"
    ).json()

    good_briefing_id = (
        successful_job["briefing"]["briefing_id"]
    )

    set_service(AnalysisService(DownProvider()))

    failed_job_id = submit_analysis(
        api,
        agenda_item_id,
        "provider-outage",
    )
    failed_job = api.get(
        f"/api/v1/jobs/{failed_job_id}"
    ).json()

    assert failed_job["state"] == "degraded"
    assert failed_job["error"]["code"] == (
        "DEPENDENCY_UNAVAILABLE"
    )
    assert failed_job["briefing"] is None

    set_service(None)

    latest_briefing = api.get(
        f"/api/v1/items/{agenda_item_id}/briefing"
    )

    assert latest_briefing.status_code == 200
    assert (
        latest_briefing.json()["briefing_id"]
        == good_briefing_id
    )

    restored_failed_job = api.get(
        f"/api/v1/jobs/{failed_job_id}"
    ).json()

    assert restored_failed_job["state"] == "degraded"
    assert restored_failed_job["briefing"] is None