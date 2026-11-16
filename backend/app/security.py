"""Password hashing and random login-session tokens."""

import hashlib
import secrets

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError


MIN_PASSWORD_LENGTH = 15
MAX_PASSWORD_LENGTH = 128

_password_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=19456,
    parallelism=1,
    type=Type.ID,
)


def hash_password(password: str) -> str:
    """Return a salted Argon2id hash, never the original password."""
    if not MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH:
        raise ValueError(
            f"Password must contain {MIN_PASSWORD_LENGTH} "
            f"to {MAX_PASSWORD_LENGTH} characters."
        )

    return _password_hasher.hash(password)


def verify_password(
    password: str,
    password_hash: str,
) -> bool:
    """Return False for an incorrect password or invalid stored hash."""
    if not password or len(password) > MAX_PASSWORD_LENGTH:
        return False

    try:
        return _password_hasher.verify(
            password_hash,
            password,
        )
    except (InvalidHashError, VerificationError):
        return False


def generate_session_token() -> str:
    """Generate a random token containing 256 bits of randomness."""
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    """Return the token fingerprint that will be stored in PostgreSQL."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()