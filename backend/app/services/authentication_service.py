"""Authenticate users and manage expiring database sessions."""

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.db_models import AuthSessionRecord, UserRecord
from app.security import (
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)
from app.services.user_repository import UserSummary


SESSION_LIFETIME = timedelta(hours=1)

# Verify a hash even when a username does not exist.
# This reduces timing differences between failed login attempts.
_DUMMY_PASSWORD_HASH = hash_password(generate_session_token())


class AuthenticationError(Exception):
    """Raised for invalid credentials or an invalid session."""


class AuthenticationStorageError(Exception):
    """Raised when authentication storage is unavailable."""


@dataclass(frozen=True)
class LoginSession:
    token: str = field(repr=False)
    expires_at: datetime
    user: UserSummary


def _user_summary(user: UserRecord) -> UserSummary:
    return UserSummary(
        user_id=user.user_id,
        username=user.username,
        display_name=user.display_name,
        role=user.role,
        is_active=user.is_active,
    )


def _valid_token_format(token: str) -> bool:
    return re.fullmatch(r"[A-Za-z0-9_-]{43}", token) is not None


def login(
    username: str,
    password: str,
) -> LoginSession:
    username = username.strip().lower()

    if not username or len(username) > 128:
        raise AuthenticationError("Invalid username or password.")

    try:
        with SessionLocal.begin() as database:
            user = database.scalar(
                select(UserRecord).where(
                    UserRecord.username == username,
                )
            )

            password_hash = (
                user.password_hash
                if user is not None
                else _DUMMY_PASSWORD_HASH
            )
            password_matches = verify_password(
                password,
                password_hash,
            )

            if (
                user is None
                or not password_matches
                or not user.is_active
            ):
                raise AuthenticationError(
                    "Invalid username or password."
                )

            now = datetime.now(timezone.utc)
            expires_at = now + SESSION_LIFETIME
            token = generate_session_token()

            database.add(
                AuthSessionRecord(
                    session_id=str(uuid4()),
                    user_id=user.user_id,
                    token_hash=hash_session_token(token),
                    created_at=now,
                    expires_at=expires_at,
                )
            )

            return LoginSession(
                token=token,
                expires_at=expires_at,
                user=_user_summary(user),
            )
    except SQLAlchemyError as error:
        raise AuthenticationStorageError(
            "Authentication storage is unavailable."
        ) from error


def get_session_user(token: str) -> UserSummary:
    if not _valid_token_format(token):
        raise AuthenticationError("Invalid or expired session.")

    statement = (
        select(UserRecord)
        .join(
            AuthSessionRecord,
            AuthSessionRecord.user_id == UserRecord.user_id,
        )
        .where(
            AuthSessionRecord.token_hash == hash_session_token(token),
            AuthSessionRecord.revoked_at.is_(None),
            AuthSessionRecord.expires_at > datetime.now(timezone.utc),
            UserRecord.is_active.is_(True),
        )
    )

    try:
        with SessionLocal() as database:
            user = database.scalar(statement)

            if user is None:
                raise AuthenticationError(
                    "Invalid or expired session."
                )

            return _user_summary(user)
    except SQLAlchemyError as error:
        raise AuthenticationStorageError(
            "Authentication storage is unavailable."
        ) from error


def logout(token: str) -> None:
    # Logging out an unknown or already-revoked token is harmless.
    if not _valid_token_format(token):
        return

    statement = (
        update(AuthSessionRecord)
        .where(
            AuthSessionRecord.token_hash == hash_session_token(token),
            AuthSessionRecord.revoked_at.is_(None),
        )
        .values(
            revoked_at=datetime.now(timezone.utc),
        )
    )

    try:
        with SessionLocal.begin() as database:
            database.execute(statement)
    except SQLAlchemyError as error:
        raise AuthenticationStorageError(
            "Authentication storage is unavailable."
        ) from error