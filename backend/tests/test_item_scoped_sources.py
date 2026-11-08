from api_helpers import (
    add_demo_sources,
    api,  # noqa: F401
    attach_sources_to_item,
    item_id,
    upload_agenda,
)


def run_direct_analysis(
    client,
    agenda_item_id: str,
    body: dict | None = None,
):
    request_arguments = {}

    if body is not None:
        request_arguments["json"] = body

    response = client.post(
        f"/api/v1/items/{agenda_item_id}/analyses",
        **request_arguments,
    )

    assert response.status_code == 202

    return client.get(response.json()["status_url"]).json()


def test_no_attached_sources_produces_insufficient_evidence(api):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    drainage_item_id = item_id(agenda, "4.4")

    job = run_direct_analysis(api, drainage_item_id)

    assert job["state"] == "degraded"
    assert job["error"]["code"] == "INSUFFICIENT_EVIDENCE"
    assert job["priority"]["score"] is None
    assert job["priority"]["evidence_level"] == "insufficient"


def test_attached_approved_sources_are_used(api):
    agenda = upload_agenda(api)
    source_ids = add_demo_sources(api)
    drainage_item_id = item_id(agenda, "4.4")

    attach_sources_to_item(
        api,
        drainage_item_id,
        source_ids.values(),
    )

    job = run_direct_analysis(api, drainage_item_id)

    assert job["state"] == "completed"
    assert job["priority"]["score"] is not None
    assert job["briefing"] is not None
    assert job["briefing"]["source_ids"]
    attached_response = api.get(
        f"/api/v1/agenda-items/{drainage_item_id}/sources"
    )

    assert attached_response.status_code == 200

    attached_source_ids = {
        source["source_id"]
        for source in attached_response.json()
    }

    assert set(job["briefing"]["source_ids"]).issubset(
        attached_source_ids
    )


def test_attached_unapproved_sources_are_excluded(api):
    agenda = upload_agenda(api)
    source_ids = add_demo_sources(api, approve=False)
    drainage_item_id = item_id(agenda, "4.4")

    attach_sources_to_item(
        api,
        drainage_item_id,
        source_ids.values(),
    )

    job = run_direct_analysis(api, drainage_item_id)

    assert job["state"] == "degraded"
    assert job["error"]["code"] == "INSUFFICIENT_EVIDENCE"
    assert job["priority"]["score"] is None


def test_explicit_unattached_source_is_rejected(api):
    agenda = upload_agenda(api)
    source_ids = add_demo_sources(api)
    drainage_item_id = item_id(agenda, "4.4")
    unattached_source_id = next(iter(source_ids.values()))

    response = api.post(
        f"/api/v1/items/{drainage_item_id}/analyses",
        json={
            "source_ids": [unattached_source_id],
        },
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_explicit_empty_source_scope_uses_no_sources(api):
    agenda = upload_agenda(api)
    source_ids = add_demo_sources(api)
    drainage_item_id = item_id(agenda, "4.4")

    attach_sources_to_item(
        api,
        drainage_item_id,
        source_ids.values(),
    )

    job = run_direct_analysis(
        api,
        drainage_item_id,
        body={"source_ids": []},
    )

    assert job["state"] == "degraded"
    assert job["error"]["code"] == "INSUFFICIENT_EVIDENCE"
    assert job["priority"]["score"] is None


def test_followup_cannot_use_sources_attached_to_another_item(api):
    agenda = upload_agenda(api)
    source_ids = add_demo_sources(api)
    drainage_item_id = item_id(agenda, "4.4")
    other_item_id = item_id(agenda, "4.5")

    attach_sources_to_item(
        api,
        other_item_id,
        source_ids.values(),
    )

    response = api.post(
        f"/api/v1/items/{drainage_item_id}/questions",
        json={
            "question": (
                "Why did the drainage project estimate go up?"
            )
        },
    )

    assert response.status_code == 422
    assert (
        response.json()["error"]["code"]
        == "INSUFFICIENT_EVIDENCE"
    )


def test_batch_analysis_resolves_each_items_sources_separately(api):
    agenda = upload_agenda(api)
    source_ids = add_demo_sources(api)
    drainage_item_id = item_id(agenda, "4.4")

    attach_sources_to_item(
        api,
        drainage_item_id,
        source_ids.values(),
    )

    response = api.post(
        f"/api/v1/agendas/{agenda['agenda_id']}/analyses"
    )

    assert response.status_code == 202

    priorities_response = api.get(
        f"/api/v1/agendas/{agenda['agenda_id']}/priorities"
    )

    assert priorities_response.status_code == 200

    priorities = {
        row["item_number"]: row
        for row in priorities_response.json()["items"]
    }

    assert priorities["4.4"]["priority"]["score"] is not None
    assert priorities["4.5"]["priority"]["score"] is None
    assert priorities["4.5"]["state"] == "degraded"
