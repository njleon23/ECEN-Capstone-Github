from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter

from app.models import SourceCreate, SourceResponse
from app.routers.agendas import error_response
from app.services.source_repository import (
    SourceRepositoryError,
    list_sources as list_stored_sources,
    save_source,
)


router = APIRouter(prefix="/api/v1", tags=["sources"])


@router.post(
    "/sources",
    response_model=SourceResponse,
    status_code=201,
)
def create_source(source: SourceCreate):
    response = SourceResponse(
        **source.model_dump(),
        source_id=str(uuid4()),
        ingested_at=datetime.now(timezone.utc),
    )

    try:
        save_source(response)
    except SourceRepositoryError:
        return error_response(
            503,
            "STORAGE_UNAVAILABLE",
            "The source could not be saved.",
            "Try the request again after storage service is restored.",
        )

    return response


@router.get(
    "/sources",
    response_model=list[SourceResponse],
)
def get_sources():
    try:
        return list_stored_sources()
    except SourceRepositoryError:
        return error_response(
            503,
            "STORAGE_UNAVAILABLE",
            "The sources could not be retrieved.",
            "Try the request again after storage service is restored.",
        )