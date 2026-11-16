"""Authentication boundaries use real sessions in the isolated test DB."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from api_helpers import (
    add_demo_sources,
    api,  # noqa: F401
    authenticate_test_client,
    item_id,
    run_analysis,
    upload_agenda,
)
from app.auth_dependencies import require_admin
from app.database import SessionLocal
from app.db_models import AuthSessionRecord, UserRecord
from app.main import app
from app.security import hash_session_token
from app.services import authentication_service
from app.services.user_repository import UserSummary


WRITE_REQUESTS = [
    ("POST", "/api/v1/agendas", {
        "files": {"file": ("agenda.txt", b"1. Call to Order", "text/plain")},
    }),
    ("POST", "/api/v1/sources", {
        "json": {"title": "Example", "text": "Evidence", "approved": True},
    }),
    ("PATCH", "/api/v1/sources/missing/approval", {"json": {"approved": True}}),
    ("POST", "/api/v1/agenda-items/missing/sources/missing", {}),
    ("DELETE", "/api/v1/agenda-items/missing/sources/missing", {}),
    ("POST", "/api/v1/items/missing/analyses", {}),
    ("POST", "/api/v1/agendas/missing/analyses", {}),
    ("POST", "/api/v1/items/missing/questions", {"json": {"question": "Why?"}}),
    ("PATCH", "/api/v1/briefings/missing/review", {"json": {"status": "approved"}}),
    ("POST", "/api/v1/items/missing/priority/adjustments", {
        "json": {"factor_key": "public_discussion", "new_raw_value": 1.0,
                 "reason": "Additional public input."},
    }),
]


@pytest.mark.parametrize("method,path,arguments", WRITE_REQUESTS)
@pytest.mark.parametrize("token", [None, "x" * 43], ids=["anonymous", "unknown-token"])
def test_write_endpoints_reject_missing_or_unknown_sessions(api, method, path, arguments, token):
    with TestClient(app) as anonymous:
        headers = {} if token is None else {"Authorization": f"Bearer {token}"}
        response = anonymous.request(method, path, headers=headers, **arguments)

    assert response.status_code == 401, response.text
    assert response.headers["www-authenticate"] == "Bearer"


def test_read_only_demo_endpoints_remain_public(api):
    with TestClient(app) as anonymous:
        for path in ("/api/v1/health", "/api/v1/agendas", "/api/v1/sources"):
            assert anonymous.get(path).status_code == 200


def test_source_creation_cannot_bypass_separate_approval(api):
    response = api.post("/api/v1/sources", json={
        "title": "Not automatically approved", "text": "Example evidence", "approved": True,
    })
    assert response.status_code == 201
    source = response.json()
    assert source["approved"] is False

    approved = api.patch(f"/api/v1/sources/{source['source_id']}/approval", json={"approved": True})
    assert approved.status_code == 200
    assert approved.json()["approved"] is True


def test_upload_records_logged_in_username(api):
    assert upload_agenda(api)["uploader"] == "test-reviewer"


def analyzed_item(api):
    agenda = upload_agenda(api)
    add_demo_sources(api)
    identifier = item_id(agenda, "4.4")
    job = run_analysis(api, identifier)
    assert job["state"] == "completed"
    return identifier, job


@pytest.mark.parametrize("claimed_reviewer", [None, "Someone Else"])
def test_review_uses_session_identity_not_browser_name(api, claimed_reviewer):
    _, job = analyzed_item(api)
    identifier = job["briefing"]["briefing_id"]
    body = {"status": "approved", "comments": "Checked the sources."}
    if claimed_reviewer is not None:
        body["reviewer"] = claimed_reviewer

    response = api.patch(f"/api/v1/briefings/{identifier}/review", json=body)
    assert response.status_code == 200
    assert response.json()["reviewer"] == "test-reviewer"
    history = api.get(f"/api/v1/briefings/{identifier}/reviews").json()
    assert history[-1]["reviewer"] == "test-reviewer"


@pytest.mark.parametrize("claimed_reviewer", [None, "Someone Else"])
def test_adjustment_uses_session_identity_not_browser_name(api, claimed_reviewer):
    identifier, job = analyzed_item(api)
    body = {"factor_key": "public_discussion", "new_raw_value": 1.0,
            "reason": "Additional public input was reviewed."}
    if claimed_reviewer is not None:
        body["reviewer"] = claimed_reviewer

    response = api.post(f"/api/v1/items/{identifier}/priority/adjustments", json=body)
    assert response.status_code == 201
    assert response.json()["reviewer"] == "test-reviewer"
    priority = api.get(f"/api/v1/jobs/{job['job_id']}").json()["priority"]
    assert priority["manual_adjustment"]["reviewer_id"] == "test-reviewer"


def admin_test_app():
    # Test the admin-only dependency without adding a production endpoint.
    test_app = FastAPI()

    @test_app.get("/admin-check")
    def admin_check(user: UserSummary = Depends(require_admin)):
        return {"username": user.username}

    return test_app


@pytest.mark.parametrize("role,expected", [("reviewer", 403), ("admin", 200)])
def test_admin_permission_checks_database_role(api, role, expected):
    user = authenticate_test_client(api, username=f"permission-{role}", role=role)
    with TestClient(admin_test_app()) as client:
        response = client.get("/admin-check", headers={"Authorization": api.headers["Authorization"]})
    assert response.status_code == expected
    if expected == 200:
        assert response.json()["username"] == user.username


@pytest.mark.parametrize("state", ["expired", "revoked", "disabled"])
def test_unusable_sessions_cannot_change_data(api, state):
    token = api.headers["Authorization"].split(" ", 1)[1]
    now = datetime.now(timezone.utc)
    with SessionLocal.begin() as database:
        session = database.scalar(select(AuthSessionRecord).where(
            AuthSessionRecord.token_hash == hash_session_token(token)
        ))
        if state == "expired":
            session.created_at = now - timedelta(hours=2)
            session.expires_at = now - timedelta(hours=1)
        elif state == "revoked":
            session.revoked_at = now
        else:
            database.get(UserRecord, session.user_id).is_active = False

    response = api.post("/api/v1/sources", json={"title": "Must not be created"})
    assert response.status_code == 401
    assert api.get("/api/v1/sources").json() == []


def test_authentication_storage_failure_denies_write(api, monkeypatch):
    class BrokenSessionFactory:
        def __call__(self, *args, **kwargs):
            raise OperationalError("SELECT 1", {}, Exception("test storage outage"))

    monkeypatch.setattr(authentication_service, "SessionLocal", BrokenSessionFactory())
    response = api.post("/api/v1/sources", json={"title": "Must not be created"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "STORAGE_UNAVAILABLE"
    assert api.get("/api/v1/sources").json() == []


@pytest.mark.parametrize("payload", [
    {"password": "test-only-secret-must-not-be-echoed"},
    {"username": "example", "password": {"secret": "test-only-secret-must-not-be-echoed"}},
])
def test_login_validation_never_echoes_password_input(api, payload):
    with TestClient(app) as anonymous:
        response = anonymous.post("/api/v1/auth/login", json=payload)
    assert response.status_code == 422
    assert "test-only-secret-must-not-be-echoed" not in response.text
    assert response.headers["cache-control"] == "no-store"
