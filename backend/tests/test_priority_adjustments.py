"""Reviewer adjustment of priority factors (FSR ANA-007) and the saved analysis."""

from api_helpers import (
    add_demo_sources,
    authenticate_test_client,
    api,  # noqa: F401
    item_id,
    run_analysis,
    upload_agenda,
)

from app.analysis.service import AnalysisService, set_service
from app.analysis.llm_client import OfflineExtractiveProvider


def analyzed_item(api, number="4.4"):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    agenda_item_id = item_id(agenda, number)
    job = run_analysis(api, agenda_item_id)
    assert job["state"] == "completed"
    return agenda, agenda_item_id, job


def adjust(api, agenda_item_id, **overrides):
    body = {
        "factor_key": "public_discussion",
        "new_raw_value": 1.0,
        "reason": "Residents organized a petition that is not in the approved sources.",
        "reviewer": "analyst-1",
    }
    body.update(overrides)
    return api.post(
        f"/api/v1/items/{agenda_item_id}/priority/adjustments",
        json=body,
    )


def test_adjustment_changes_score_and_is_recorded(api):
    _, agenda_item_id, job = analyzed_item(api)
    before = job["priority"]

    response = adjust(api, agenda_item_id)

    assert response.status_code == 201
    saved = response.json()
    assert saved["factor_key"] == "public_discussion"
    assert saved["old_score"] == before["score"]
    assert saved["new_score"] > before["score"]
    assert saved["reviewer"] == "test-reviewer"
    assert "petition" in saved["reason"]

    updated = api.get(f"/api/v1/jobs/{job['job_id']}").json()["priority"]
    assert updated["score"] == saved["new_score"]
    assert updated["category"] == saved["new_category"]
    assert updated["manual_adjustment"]["reviewer_id"] == "test-reviewer"
    factor = next(f for f in updated["factors"] if f["key"] == "public_discussion")
    assert factor["raw_value"] == 1.0
    assert "adjusted by reviewer" in factor["explanation"]


def test_adjustment_survives_restart_and_shows_in_heat_list(api):
    agenda, agenda_item_id, job = analyzed_item(api)
    saved = adjust(api, agenda_item_id).json()

    # A new service object has no in-memory jobs, so reads must come from PostgreSQL.
    set_service(AnalysisService(OfflineExtractiveProvider()))

    latest = api.get(f"/api/v1/items/{agenda_item_id}/analysis").json()
    assert latest["priority"]["score"] == saved["new_score"]
    assert latest["priority"]["manual_adjustment"]["reason"] == saved["reason"]

    rows = api.get(f"/api/v1/agendas/{agenda['agenda_id']}/priorities").json()["items"]
    row = next(r for r in rows if r["item_id"] == agenda_item_id)
    assert row["priority"]["score"] == saved["new_score"]


def test_reason_is_required(api):
    _, agenda_item_id, job = analyzed_item(api)

    assert adjust(api, agenda_item_id, reason="   ").status_code == 400
    assert adjust(api, agenda_item_id, reason="").status_code == 422

    unchanged = api.get(f"/api/v1/jobs/{job['job_id']}").json()["priority"]
    assert unchanged["score"] == job["priority"]["score"]
    assert unchanged["manual_adjustment"] is None
    assert api.get(f"/api/v1/items/{agenda_item_id}/priority/adjustments").json() == []


def test_bad_factor_value_and_reviewer_are_rejected(api):
    _, agenda_item_id, _ = analyzed_item(api)

    assert adjust(api, agenda_item_id, new_raw_value=1.5).status_code == 422
    assert adjust(api, agenda_item_id, new_raw_value=-0.1).status_code == 422
    assert adjust(api, agenda_item_id, reviewer="").status_code == 422
    bad_factor = adjust(api, agenda_item_id, factor_key="made_up")
    assert bad_factor.status_code == 400
    assert bad_factor.json()["error"]["code"] == "INVALID_REQUEST"


def test_history_keeps_every_adjustment_in_order(api):
    _, agenda_item_id, _ = analyzed_item(api)

    first = adjust(api, agenda_item_id, new_raw_value=1.0, reviewer="analyst-1").json()
    authenticate_test_client(api, username="analyst-2")
    second = adjust(
        api,
        agenda_item_id,
        factor_key="cost_exposure",
        new_raw_value=0.2,
        reason="Cost estimate was revised down.",
        reviewer="analyst-2",
    ).json()

    history = api.get(f"/api/v1/items/{agenda_item_id}/priority/adjustments").json()

    assert [h["adjustment_id"] for h in history] == [
        first["adjustment_id"],
        second["adjustment_id"],
    ]
    assert history[1]["old_score"] == first["new_score"]
    assert [h["reviewer"] for h in history] == ["test-reviewer", "analyst-2"]


def test_new_analysis_starts_unadjusted_but_history_is_kept(api):
    _, agenda_item_id, first_job = analyzed_item(api)
    adjust(api, agenda_item_id)

    second_job = run_analysis(api, agenda_item_id)

    assert second_job["job_id"] != first_job["job_id"]
    assert second_job["priority"]["manual_adjustment"] is None
    assert second_job["priority"]["score"] == first_job["priority"]["score"]
    assert len(api.get(f"/api/v1/items/{agenda_item_id}/priority/adjustments").json()) == 1


def test_item_without_a_score_cannot_be_adjusted(api):
    agenda = upload_agenda(api)
    agenda_item_id = item_id(agenda, "4.4")

    # No analysis yet.
    assert adjust(api, agenda_item_id).status_code == 404

    # Analysis with no attached sources gives no score.
    response = api.post(f"/api/v1/items/{agenda_item_id}/analyses")
    assert response.status_code == 202
    job = api.get(response.json()["status_url"]).json()
    assert job["priority"]["score"] is None

    refused = adjust(api, agenda_item_id)
    assert refused.status_code == 400
    assert "no priority score" in refused.json()["error"]["message"]


def test_unknown_item_returns_not_found(api):
    assert adjust(api, "does-not-exist").status_code == 404
    assert api.get("/api/v1/items/does-not-exist/priority/adjustments").status_code == 404
    assert api.get("/api/v1/items/does-not-exist/analysis").status_code == 404


def test_latest_analysis_endpoint(api):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    agenda_item_id = item_id(agenda, "4.4")

    assert api.get(f"/api/v1/items/{agenda_item_id}/analysis").status_code == 404

    job = run_analysis(api, agenda_item_id)
    set_service(AnalysisService(OfflineExtractiveProvider()))

    latest = api.get(f"/api/v1/items/{agenda_item_id}/analysis")
    assert latest.status_code == 200
    assert latest.json()["job_id"] == job["job_id"]
    assert latest.json()["briefing"]["briefing_id"] == job["briefing"]["briefing_id"]
