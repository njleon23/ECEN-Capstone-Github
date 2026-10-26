import os
from collections.abc import Generator
from pathlib import Path

import pytest
from dotenv import dotenv_values
from sqlalchemy.engine import make_url


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
settings = dotenv_values(REPOSITORY_ROOT / ".env")

test_database_url = (
    os.getenv("TEST_DATABASE_URL")
    or settings.get("TEST_DATABASE_URL")
)

if not test_database_url:
    raise RuntimeError(
        "TEST_DATABASE_URL is not configured."
    )

test_database_name = make_url(test_database_url).database or ""

if "test" not in test_database_name.lower():
    raise RuntimeError(
        "Tests must use a dedicated database containing "
        "'test' in its name."
    )

# This must happen before app.database is imported.
os.environ["DATABASE_URL"] = test_database_url

from app import db_models  # noqa: E402, F401
from app.database import Base, engine  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def prepare_test_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    yield

    Base.metadata.drop_all(bind=engine)
    engine.dispose()