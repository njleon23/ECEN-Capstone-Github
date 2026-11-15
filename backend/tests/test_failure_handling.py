"""Whole-system failure handling (FSR REL-002, REL-003).

Each test breaks one dependency, a slow or rate-limited model, a bad model
response, or the database, and checks that the API gives a clear message, keeps
the last good briefing, and never returns an unhandled error.
"""

import pytest
from sqlalchemy.exc import OperationalError

from api_helpers import (
    add_demo_sources,
    api,  # noqa: F401
    attach_all_sources_to_item,
    item_id,
    run_analysis,
    upload_agenda,
)

from app.analysis.errors import DependencyUnavailable, RateLimited
from app.analysis.llm_client import ProviderResponse
from app.analysis.service import AnalysisService, set_service


class BrokenProvider:
    model_id = "test-broken-provider"

    def __init__(self, failure=None, text=None):
        self.failure = failure
        self.text = text

    def complete_json(self, **_):
        if self.failure is not None:
            raise self.failure
        return ProviderResponse(text=self.text, model_id=self.model_id, request_id="r", usage={})


def use_provider(provider):
    service = AnalysisService(provider)
    service.pipeline.sleep = lambda _seconds: None
    set_service(service)


def good_analysis(api):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    agenda_item_id = item_id(agenda, "4.4")
    job = run_analysis(api, agenda_item_id)
    assert job["state"] == "completed"
    return agenda_item_id, job


def rerun(api, agenda_item_id):
    response = api.post(f"/api/v1/items/{agenda_item_id}/analyses")
    assert response.status_code == 202
    return api.get(response.json()["status_url"]).json()


@pytest.mark.parametrize(
    "provider, code",
    [
        (BrokenProvider(failure=DependencyUnavailable("The model service timed out.")),
         "DEPENDENCY_UNAVAILABLE"),
        (BrokenProvider(failure=RateLimited("The model service is busy.", retry_after=1)),
         "RATE_LIMITED"),
        (BrokenProvider(text="this is not json at all"), "PROVIDER_ERROR"),
        (BrokenProvider(text='{"summary": 5}'), "PROVIDER_ERROR"),
    ],
    ids=["timeout", "rate-limited", "not-json", "wrong-shape"],
)
def test_model_failure_gives_clear_message_and_keeps_last_good_briefing(api, provider, code):
    agenda_item_id, good_job = good_analysis(api)
    good_briefing_id = good_job["briefing"]["briefing_id"]

    use_provider(provider)
    failed = rerun(api, agenda_item_id)

    assert failed["state"] == "degraded"
    assert failed["error"]["code"] == code
    assert failed["error"]["message"]
    assert "manual preparation" in failed["progress_message"]
    assert failed["briefing"] is None
    # The score is still computed from the sources, so staff keep it.
    assert failed["priority"]["score"] == good_job["priority"]["score"]

    # The page can still load the last good briefing.
    set_service(None)
    latest = api.get(f"/api/v1/items/{agenda_item_id}/briefing")
    assert latest.status_code == 200
    assert latest.json()["briefing_id"] == good_briefing_id

    # A failed run never changes the stored good briefing.
    assert latest.json()["summary"] == good_job["briefing"]["summary"]


def test_failed_model_run_is_still_visible_after_restart(api):
    agenda_item_id, _ = good_analysis(api)
    use_provider(BrokenProvider(failure=DependencyUnavailable("The model service timed out.")))
    failed = rerun(api, agenda_item_id)

    set_service(AnalysisService(BrokenProvider(text="unused")))
    restored = api.get(f"/api/v1/items/{agenda_item_id}/analysis").json()

    assert restored["job_id"] == failed["job_id"]
    assert restored["state"] == "degraded"
    assert restored["error"]["code"] == "DEPENDENCY_UNAVAILABLE"


def test_missing_evidence_gives_no_score_and_a_clear_message(api):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    agenda_item_id = item_id(agenda, "4.4")

    # Sources exist and are approved, but none is attached to this item.
    job = rerun(api, agenda_item_id)

    assert job["state"] == "degraded"
    assert job["error"]["code"] == "INSUFFICIENT_EVIDENCE"
    assert job["priority"]["score"] is None
    assert "Insufficient evidence" in job["progress_message"]
    assert job["briefing"]["incomplete"] is True
    assert any("Insufficient evidence" in w for w in job["briefing"]["warnings"])


def test_follow_up_with_no_evidence_is_refused_not_invented(api):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    agenda_item_id = item_id(agenda, "4.4")
    attach_all_sources_to_item(api, agenda_item_id)

    response = api.post(
        f"/api/v1/items/{agenda_item_id}/questions",
        json={"question": "What is the runway length at the airport?"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INSUFFICIENT_EVIDENCE"


class BrokenSessionFactory:
    """Stands in for SessionLocal when the database is down."""

    def _fail(self, *_args, **_kwargs):
        raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    __call__ = _fail
    begin = _fail


def break_database(monkeypatch):
    from app.analysis import item_store
    from app.services import (
        agenda_repository,
        analysis_repository,
        briefing_review_repository,
        priority_adjustment_repository,
        source_association_repository,
    )

    for module in (
        agenda_repository,
        analysis_repository,
        briefing_review_repository,
        priority_adjustment_repository,
        source_association_repository,
        item_store,
    ):
        monkeypatch.setattr(module, "SessionLocal", BrokenSessionFactory())


def assert_storage_unavailable(response):
    assert response.status_code == 503, response.text
    error = response.json()["error"]
    assert error["code"] == "STORAGE_UNAVAILABLE"
    assert error["message"]
    assert error["retry_guidance"]


def test_database_outage_gives_a_clear_503_on_every_analysis_endpoint(api, monkeypatch):
    agenda_item_id, job = good_analysis(api)
    briefing_id = job["briefing"]["briefing_id"]
    agenda_id = api.get("/api/v1/agendas").json()[0]["agenda_id"]

    break_database(monkeypatch)

    assert_storage_unavailable(api.post(f"/api/v1/items/{agenda_item_id}/analyses"))
    assert_storage_unavailable(api.get(f"/api/v1/items/{agenda_item_id}/analysis"))
    assert_storage_unavailable(api.get(f"/api/v1/items/{agenda_item_id}/briefing"))
    assert_storage_unavailable(api.get(f"/api/v1/jobs/{job['job_id']}"))
    assert_storage_unavailable(api.get(f"/api/v1/agendas/{agenda_id}/priorities"))
    assert_storage_unavailable(api.post(
        f"/api/v1/items/{agenda_item_id}/questions", json={"question": "Why?"}))
    assert_storage_unavailable(api.post(
        f"/api/v1/items/{agenda_item_id}/priority/adjustments",
        json={"factor_key": "public_discussion", "new_raw_value": 0.5,
              "reason": "test", "reviewer": "analyst-1"}))
    assert_storage_unavailable(api.get(f"/api/v1/items/{agenda_item_id}/priority/adjustments"))
    assert_storage_unavailable(api.patch(
        f"/api/v1/briefings/{briefing_id}/review",
        json={"status": "approved", "reviewer": "analyst-1"}))
    assert_storage_unavailable(api.get(f"/api/v1/briefings/{briefing_id}/reviews"))


def test_service_recovers_after_the_database_comes_back(api, monkeypatch):
    agenda_item_id, job = good_analysis(api)

    with monkeypatch.context() as broken:
        break_database(broken)
        assert api.get(f"/api/v1/items/{agenda_item_id}/briefing").status_code == 503

    restored = api.get(f"/api/v1/items/{agenda_item_id}/briefing")
    assert restored.status_code == 200
    assert restored.json()["briefing_id"] == job["briefing"]["briefing_id"]
