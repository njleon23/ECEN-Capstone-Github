"""Analysis endpoints end to end: Nick's agenda upload, the sources, then analysis."""

from api_helpers import (
    add_demo_sources,
    api,  # noqa: F401
    attach_all_sources_to_item,
    item_id,
    run_analysis,
    set_approval,
    upload_agenda,
)

from app.analysis.errors import DependencyUnavailable
from app.analysis.llm_client import OfflineExtractiveProvider
from app.analysis.service import AnalysisService, set_service


class DownProvider:
    model_id = "down"

    def complete_json(self, **_):
        raise DependencyUnavailable("provider is down")


def test_full_flow_upload_sources_analyze_and_ask(api):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    drainage = item_id(agenda, "4.4")

    job = run_analysis(api, drainage)
    assert job["state"] == "completed"
    assert job["priority"]["score"] is not None
    assert job["briefing"]["status"] == "draft"
    assert job["briefing"]["key_facts"]
    assert all(c["support"] == "supported" for c in job["briefing"]["key_facts"])

    b = api.get(f"/api/v1/items/{drainage}/briefing")
    assert b.status_code == 200 and b.json()["item_id"] == drainage

    q = api.post(f"/api/v1/items/{drainage}/questions",
                 json={"question": "Why did the drainage project estimate go up?"})
    assert q.status_code == 200
    body = q.json()
    assert body["status"] == "answered"
    assert "12.8 million" in body["answer"] or "12,800,000" in body["answer"]
    assert body["citations"]


def test_unapproved_sources_are_never_used(api):
    agenda = upload_agenda(api)
    add_demo_sources(api, approve=False)                    # everything stays unapproved
    job = run_analysis(api, item_id(agenda, "4.4"))
    assert job["state"] == "degraded"
    assert job["error"]["code"] == "INSUFFICIENT_EVIDENCE"
    assert job["priority"]["score"] is None
    assert job["briefing"]["incomplete"] is True


def test_approval_can_be_withdrawn(api):
    agenda = upload_agenda(api)
    ids = add_demo_sources(api)
    drainage = item_id(agenda, "4.4")
    assert run_analysis(api, drainage)["state"] == "completed"
    for key in ("min-2025-06", "bud-drain", "chk-civil", "bud-fire"):
        set_approval(api, ids[key], False)
    assert run_analysis(api, drainage)["state"] == "degraded"


def test_procedural_item_is_completed_without_a_score(api):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    job = run_analysis(api, item_id(agenda, "3.1"))
    assert job["state"] == "completed"
    assert job["priority"]["score"] is None
    assert job["briefing"]["warnings"][0].startswith("Procedural item")


def test_agenda_batch_analysis_and_priority_list(api):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    for agenda_item in agenda["items"]:
        attach_all_sources_to_item(
            api,
            agenda_item["item_id"],
        )
    before = api.get(f"/api/v1/agendas/{agenda['agenda_id']}/priorities").json()
    assert {r["state"] for r in before["items"]} == {"not_analyzed"}

    r = api.post(f"/api/v1/agendas/{agenda['agenda_id']}/analyses")
    assert r.status_code == 202
    assert len(r.json()["jobs"]) == len(agenda["items"])

    rows = {x["item_number"]: x for x in
            api.get(f"/api/v1/agendas/{agenda['agenda_id']}/priorities").json()["items"]}
    assert rows["4.4"]["priority"]["score"] is not None
    assert rows["7"]["procedural"] is True and rows["7"]["priority"]["score"] is None
    assert all(x["state"] in ("completed", "degraded") for x in rows.values())


def test_idempotency_key_returns_same_job(api):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    iid = item_id(agenda, "4.4")
    a = api.post(f"/api/v1/items/{iid}/analyses", headers={"Idempotency-Key": "k1"}).json()
    b = api.post(f"/api/v1/items/{iid}/analyses", headers={"Idempotency-Key": "k1"}).json()
    assert a["job_id"] == b["job_id"]


def test_questions_refusal_and_insufficient_evidence(api):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    iid = item_id(agenda, "4.1")
    r = api.post(f"/api/v1/items/{iid}/questions", json={"question": "How should I vote?"})
    assert (r.status_code, r.json()["status"]) == (200, "refused")
    r = api.post(f"/api/v1/items/{iid}/questions",
                 json={"question": "What is the runway length at the airport?"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INSUFFICIENT_EVIDENCE"
    # An empty question fails FastAPI's own validation (422, not the project error envelope).
    assert api.post(f"/api/v1/items/{iid}/questions", json={"question": ""}).status_code == 422


def test_provider_outage_degrades_the_job_and_keeps_the_score(api):
    set_service(AnalysisService(DownProvider()))
    agenda = upload_agenda(api)
    add_demo_sources(api)
    job = run_analysis(api, item_id(agenda, "4.4"))
    assert job["state"] == "degraded"
    assert job["priority"]["score"] is not None
    assert job["briefing"] is None
    assert job["error"]["code"] == "DEPENDENCY_UNAVAILABLE"


def test_not_found_responses_use_the_project_error_envelope(api):
    for r in (api.post("/api/v1/items/nope/analyses"), api.get("/api/v1/jobs/nope"),
              api.get("/api/v1/items/nope/briefing"),
              api.post("/api/v1/agendas/nope/analyses"),
              api.get("/api/v1/agendas/nope/priorities"),
              api.post("/api/v1/items/nope/questions", json={"question": "hello there"})):
        assert r.status_code == 404, r.text
        err = r.json()["error"]
        assert err["code"] == "NOT_FOUND" and err["request_id"] and err["retry_guidance"]
