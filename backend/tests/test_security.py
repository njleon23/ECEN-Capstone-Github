import pytest

from app.security import (
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)


# Fictional test value, not an actual account password.
TEST_PASSWORD = "fictional-test-password-2026"


def test_password_is_hashed_and_verified():
    password_hash = hash_password(TEST_PASSWORD)

    assert password_hash != TEST_PASSWORD
    assert password_hash.startswith("$argon2id$")
    assert verify_password(TEST_PASSWORD, password_hash)
    assert not verify_password("incorrect-password", password_hash)


def test_password_hashes_use_random_salts():
    first_hash = hash_password(TEST_PASSWORD)
    second_hash = hash_password(TEST_PASSWORD)

    assert first_hash != second_hash
    assert verify_password(TEST_PASSWORD, first_hash)
    assert verify_password(TEST_PASSWORD, second_hash)


@pytest.mark.parametrize("password", ["", "short", "x" * 129])
def test_invalid_password_lengths_are_rejected(password):
    with pytest.raises(ValueError):
        hash_password(password)


def test_invalid_stored_password_hash_is_rejected():
    assert not verify_password(TEST_PASSWORD, "not-a-valid-hash")


def test_password_spaces_are_preserved():
    password = "  fictional test password  "
    password_hash = hash_password(password)

    assert verify_password(password, password_hash)
    assert not verify_password(password.strip(), password_hash)


def test_session_tokens_are_random():
    first_token = generate_session_token()
    second_token = generate_session_token()

    assert len(first_token) == 43
    assert len(second_token) == 43
    assert first_token != second_token


def test_session_token_hash_is_stable_and_not_the_token():
    token = generate_session_token()
    token_hash = hash_session_token(token)

    assert len(token_hash) == 64
    assert token_hash != token
    assert hash_session_token(token) == token_hash
    assert hash_session_token(generate_session_token()) != token_hash