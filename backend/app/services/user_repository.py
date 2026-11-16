"""Create user accounts without exposing password hashes."""

import re
from dataclasses import dataclass
from uuid import uuid4

from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.database import SessionLocal
from app.db_models import UserRecord
from app.security import hash_password


class UserRepositoryError(Exception):
    """Raised when user storage is unavailable."""


class UsernameAlreadyExistsError(Exception):
    """Raised when the requested username is already taken."""


@dataclass(frozen=True)
class UserSummary:
    user_id: str
    username: str
    display_name: str
    role: str
    is_active: bool


def create_user(
    *,
    username: str,
    display_name: str,
    password: str,
    role: str = "reviewer",
) -> UserSummary:
    username = username.strip().lower()
    display_name = display_name.strip()

    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{2,127}", username):
        raise ValueError(
            "Username must contain 3 to 128 characters: "
            "letters, numbers, periods, underscores, or hyphens. "
            "It must start with a letter or number."
        )

    if not display_name or len(display_name) > 128:
        raise ValueError(
            "Display name must contain 1 to 128 characters."
        )

    if role not in {"admin", "reviewer"}:
        raise ValueError("Role must be admin or reviewer.")

    # Hash before opening a database transaction.
    password_hash = hash_password(password)

    user = UserRecord(
        user_id=str(uuid4()),
        username=username,
        display_name=display_name,
        password_hash=password_hash,
        role=role,
        is_active=True,
    )

    try:
        with SessionLocal.begin() as database:
            database.add(user)
            database.flush()

            return UserSummary(
                user_id=user.user_id,
                username=user.username,
                display_name=user.display_name,
                role=user.role,
                is_active=user.is_active,
            )
    except IntegrityError as error:
        diagnostic = getattr(error.orig, "diag", None)
        constraint_name = getattr(
            diagnostic,
            "constraint_name",
            None,
        )

        if constraint_name == "uq_users_username":
            raise UsernameAlreadyExistsError(
                "That username already exists."
            ) from error

        raise UserRepositoryError(
            "The user account could not be created."
        ) from error
    except SQLAlchemyError as error:
        raise UserRepositoryError(
            "The user account could not be created."
        ) from error