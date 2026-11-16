from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.exc import OperationalError

from app.database import SessionLocal
from app.db_models import AuthSessionRecord, UserRecord
from app.main import app
from app.security import generate_session_token, hash_session_token
from app.services import authentication_service
from app.services.user_repository import (
    UsernameAlreadyExistsError,
    create_user,
)

from app.login_rate_limit import (
    account_login_limiter,
    client_login_limiter,
    enforce_login_limits,
)
from fastapi import HTTPException

# Fictional test credentials, not your actual account.
TEST_USERNAME = "auth-test-admin"
TEST_PASSWORD = "fictional-auth-test-password-2026"


def clear_auth_tables():
    # tests/conftest.py selects the isolated test database.
    with SessionLocal.begin() as database:
        database.execute(delete(AuthSessionRecord))
        database.execute(delete(UserRecord))


@pytest.fixture
def auth_client():
    clear_auth_tables()
    account_login_limiter.clear()
    client_login_limiter.clear()

    try:
        with TestClient(app) as client:
            yield client
    finally:
        clear_auth_tables()
        account_login_limiter.clear()
        client_login_limiter.clear()


@pytest.fixture
def account(auth_client):
    return create_user(
        username=TEST_USERNAME,
        display_name="Test Administrator",
        password=TEST_PASSWORD,
        role="admin",
    )


def login_token(client):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD,
        },
    )

    assert response.status_code == 200
    return response.json()["access_token"]


def bearer_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_returns_safe_user_and_stores_hashed_token(
    auth_client,
    account,
):
    response = auth_client.post(
        "/api/v1/auth/login",
        json={
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD,
        },
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"

    body = response.json()
    token = body["access_token"]

    assert body["token_type"] == "bearer"
    assert body["user"]["user_id"] == account.user_id
    assert body["user"]["role"] == "admin"
    assert "password" not in body["user"]
    assert "password_hash" not in body["user"]

    with SessionLocal() as database:
        session = database.scalar(
            select(AuthSessionRecord).where(
                AuthSessionRecord.user_id == account.user_id
            )
        )

        assert session is not None
        assert session.token_hash == hash_session_token(token)
        assert session.token_hash != token
        assert session.revoked_at is None

    current_user = auth_client.get(
        "/api/v1/auth/me",
        headers=bearer_headers(token),
    )

    assert current_user.status_code == 200
    assert current_user.json()["username"] == TEST_USERNAME
    assert "password_hash" not in current_user.json()


def test_current_user_requires_authentication(auth_client):
    response = auth_client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "username, password",
    [
        ("missing-user", TEST_PASSWORD),
        (TEST_USERNAME, "incorrect-password"),
    ],
)
def test_invalid_credentials_return_same_generic_error(
    auth_client,
    account,
    username,
    password,
):
    response = auth_client.post(
        "/api/v1/auth/login",
        json={
            "username": username,
            "password": password,
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"]["message"] == (
        "Invalid username or password."
    )


@pytest.mark.parametrize(
    "token",
    [
        "not-a-valid-token",
        "x" * 43,
        "x" * 200,
    ],
)
def test_invalid_or_unknown_session_is_rejected(
    auth_client,
    token,
):
    response = auth_client.get(
        "/api/v1/auth/me",
        headers=bearer_headers(token),
    )

    assert response.status_code == 401


def test_logout_revokes_session(auth_client, account):
    token = login_token(auth_client)

    response = auth_client.post(
        "/api/v1/auth/logout",
        headers=bearer_headers(token),
    )

    assert response.status_code == 204
    assert response.content == b""

    with SessionLocal() as database:
        session = database.scalar(
            select(AuthSessionRecord).where(
                AuthSessionRecord.token_hash
                == hash_session_token(token)
            )
        )

        assert session is not None
        assert session.revoked_at is not None

    response = auth_client.get(
        "/api/v1/auth/me",
        headers=bearer_headers(token),
    )

    assert response.status_code == 401


def test_expired_session_is_rejected(auth_client, account):
    token = login_token(auth_client)
    now = datetime.now(timezone.utc)

    with SessionLocal.begin() as database:
        session = database.scalar(
            select(AuthSessionRecord).where(
                AuthSessionRecord.token_hash
                == hash_session_token(token)
            )
        )

        # Preserve the database rule: expires_at > created_at.
        session.created_at = now - timedelta(hours=2)
        session.expires_at = now - timedelta(hours=1)

    response = auth_client.get(
        "/api/v1/auth/me",
        headers=bearer_headers(token),
    )

    assert response.status_code == 401


def test_disabled_account_cannot_login_or_use_existing_session(
    auth_client,
    account,
):
    token = login_token(auth_client)

    with SessionLocal.begin() as database:
        user = database.get(UserRecord, account.user_id)
        user.is_active = False

    current_user = auth_client.get(
        "/api/v1/auth/me",
        headers=bearer_headers(token),
    )

    assert current_user.status_code == 401

    new_login = auth_client.post(
        "/api/v1/auth/login",
        json={
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD,
        },
    )

    assert new_login.status_code == 401


def test_current_role_is_read_from_database(auth_client, account):
    token = login_token(auth_client)

    with SessionLocal.begin() as database:
        user = database.get(UserRecord, account.user_id)
        user.role = "reviewer"

    response = auth_client.get(
        "/api/v1/auth/me",
        headers=bearer_headers(token),
    )

    assert response.status_code == 200
    assert response.json()["role"] == "reviewer"


def test_duplicate_normalized_username_is_rejected(
    auth_client,
    account,
):
    with pytest.raises(UsernameAlreadyExistsError):
        create_user(
            username=f"  {TEST_USERNAME.upper()}  ",
            display_name="Duplicate User",
            password=TEST_PASSWORD,
        )


class BrokenSessionFactory:
    def _fail(self, *args, **kwargs):
        raise OperationalError(
            "SELECT 1",
            {},
            Exception("Test database unavailable"),
        )

    __call__ = _fail
    begin = _fail


@pytest.mark.parametrize(
    "method, path",
    [
        ("POST", "/api/v1/auth/login"),
        ("GET", "/api/v1/auth/me"),
        ("POST", "/api/v1/auth/logout"),
    ],
)
def test_auth_database_failure_returns_503(
    auth_client,
    monkeypatch,
    method,
    path,
):
    monkeypatch.setattr(
        authentication_service,
        "SessionLocal",
        BrokenSessionFactory(),
    )

    arguments = {
        "headers": bearer_headers(generate_session_token()),
    }

    if path.endswith("/login"):
        arguments["json"] = {
            "username": TEST_USERNAME,
            "password": TEST_PASSWORD,
        }

    response = auth_client.request(
        method,
        path,
        **arguments,
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == (
        "STORAGE_UNAVAILABLE"
    )


def test_repeated_login_attempts_return_429(auth_client):
    for _ in range(5):
        response = auth_client.post(
            "/api/v1/auth/login",
            json={
                "username": "missing-user",
                "password": TEST_PASSWORD,
            },
        )
        assert response.status_code == 401

    response = auth_client.post(
        "/api/v1/auth/login",
        json={
            "username": "  MISSING-USER  ",
            "password": TEST_PASSWORD,
        },
    )

    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "RATE_LIMITED"
    assert int(response.headers["retry-after"]) >= 1


def test_changing_address_does_not_bypass_account_limit(auth_client):
    for number in range(5):
        enforce_login_limits(
            username=TEST_USERNAME,
            client_address=f"192.0.2.{number + 1}",
        )

    with pytest.raises(HTTPException) as caught:
        enforce_login_limits(
            username=TEST_USERNAME.upper(),
            client_address="192.0.2.99",
        )

    assert caught.value.status_code == 429