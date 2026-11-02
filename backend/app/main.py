import os
from fastapi import FastAPI, Response, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.database import engine
from fastapi.middleware.cors import CORSMiddleware

from app.routers.agendas import router as agendas_router
from app.routers.sources import router as sources_router

from app.routers.source_associations import (
    router as source_associations_router,
)


app = FastAPI(
    title="Council Brief API",
    version="0.1.0",
)

CORS_ORIGINS_ENV = "CORS_ORIGINS"

DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def get_cors_origins() -> list[str]:
    configured_origins = os.getenv(CORS_ORIGINS_ENV)

    if not configured_origins:
        return DEFAULT_CORS_ORIGINS

    return [
        origin.strip().rstrip("/")
        for origin in configured_origins.split(",")
        if origin.strip()
    ]



app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agendas_router)
app.include_router(sources_router)
app.include_router(source_associations_router)


@app.get("/api/v1/health")
def health_check(response: Response):
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

        return {
            "status": "unhealthy",
            "service": "Council Brief API",
            "database": "unavailable",
        }

    return {
        "status": "healthy",
        "service": "Council Brief API",
        "database": "connected",
    }