from fastapi import APIRouter

from app.models import (
    SourceAttachmentResponse,
    SourceDetachmentResponse,
    SourceResponse,
)
from app.routers.agendas import error_response
from app.services.source_association_repository import (
    AgendaItemNotFoundError,
    SourceAssociationRepositoryError,
    SourceNotFoundError,
    attach_source_to_item,
    detach_source_from_item,
    list_sources_for_item,
)


router = APIRouter(
    prefix="/api/v1",
    tags=["source associations"],
)


@router.post(
    "/agenda-items/{item_id}/sources/{source_id}",
    response_model=SourceAttachmentResponse,
)
def attach_source(
    item_id: str,
    source_id: str,
):
    try:
        created = attach_source_to_item(item_id, source_id)
    except AgendaItemNotFoundError:
        return error_response(
            404,
            "AGENDA_ITEM_NOT_FOUND",
            "The requested agenda item was not found.",
            "Confirm the agenda item identifier and try again.",
        )
    except SourceNotFoundError:
        return error_response(
            404,
            "SOURCE_NOT_FOUND",
            "The requested source was not found.",
            "Confirm the source identifier and try again.",
        )
    except SourceAssociationRepositoryError:
        return error_response(
            503,
            "STORAGE_UNAVAILABLE",
            "The source could not be attached.",
            "Try again after storage service is restored.",
        )

    return SourceAttachmentResponse(
        item_id=item_id,
        source_id=source_id,
        created=created,
    )


@router.get(
    "/agenda-items/{item_id}/sources",
    response_model=list[SourceResponse],
)
def get_item_sources(item_id: str):
    try:
        return list_sources_for_item(item_id)
    except AgendaItemNotFoundError:
        return error_response(
            404,
            "AGENDA_ITEM_NOT_FOUND",
            "The requested agenda item was not found.",
            "Confirm the agenda item identifier and try again.",
        )
    except SourceAssociationRepositoryError:
        return error_response(
            503,
            "STORAGE_UNAVAILABLE",
            "The agenda item sources could not be retrieved.",
            "Try again after storage service is restored.",
        )


@router.delete(
    "/agenda-items/{item_id}/sources/{source_id}",
    response_model=SourceDetachmentResponse,
)
def detach_source(
    item_id: str,
    source_id: str,
):
    try:
        removed = detach_source_from_item(item_id, source_id)
    except AgendaItemNotFoundError:
        return error_response(
            404,
            "AGENDA_ITEM_NOT_FOUND",
            "The requested agenda item was not found.",
            "Confirm the agenda item identifier and try again.",
        )
    except SourceNotFoundError:
        return error_response(
            404,
            "SOURCE_NOT_FOUND",
            "The requested source was not found.",
            "Confirm the source identifier and try again.",
        )
    except SourceAssociationRepositoryError:
        return error_response(
            503,
            "STORAGE_UNAVAILABLE",
            "The source could not be detached.",
            "Try again after storage service is restored.",
        )

    return SourceDetachmentResponse(
        item_id=item_id,
        source_id=source_id,
        removed=removed,
    )