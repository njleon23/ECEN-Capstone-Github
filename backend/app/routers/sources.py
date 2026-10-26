from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter

from app.models import (
    SourceApprovalUpdate,
    SourceCreate,
    SourceResponse,
)
from app.routers.agendas import error_response
from app.services.source_repository import (
    SourceRepositoryError,
    list_sources as list_stored_sources,
    save_source,
    set_source_approval,
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


@router.patch(
    "/sources/{source_id}/approval",
    response_model=SourceResponse,
)
def update_source_approval(
    source_id: str,
    update: SourceApprovalUpdate,
):
    try:
        source = set_source_approval(
            source_id,
            update.approved,
        )
    except SourceRepositoryError:
        return error_response(
            503,
            "STORAGE_UNAVAILABLE",
            "The source approval state could not be updated.",
            "Try the request again after storage service is restored.",
        )

    if source is None:
        return error_response(
            404,
            "SOURCE_NOT_FOUND",
            "The requested source was not found.",
            "Confirm the source identifier and try again.",
        )

    return source