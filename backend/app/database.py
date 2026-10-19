import os
from collections.abc import Generator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env", override=False)

DATABASE_URL_ENV = "DATABASE_URL"


def get_database_url() -> str:
    database_url = os.getenv(DATABASE_URL_ENV)

    if not database_url:
        raise RuntimeError(
            f"{DATABASE_URL_ENV} is not configured. "
            "Create .env from .env.example."
        )

    return database_url


class Base(DeclarativeBase):
    pass


engine = create_engine(
    get_database_url(),
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    database = SessionLocal()

    try:
        yield database
    finally:
        database.close()