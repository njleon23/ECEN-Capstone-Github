"""Reviewer adjustment of priority factors, and the latest saved analysis.

FSR ANA-007: a reviewer may change one factor only by giving a reason. The
logged-in account username is recorded with each change. A reviewer name
supplied by the browser is ignored.
"""

from fastapi import APIRouter, Depends

from app.auth_dependencies import require_reviewer
from app.services.user_repository import UserSummary

from app.analysis import item_store
from app.analysis.errors import AnalyticsError
from app.analysis.service import AnalysisService, get_synced_service
from app.models import (
    PriorityAdjustmentCreate,
    PriorityAdjustmentResponse,
)
from app.routers.agendas import error_response
from app.services.agenda_repository import AgendaRepositoryError
from app.services.analysis_repository import (
    AnalysisRepositoryError,
    get_latest_analysis_job,
)
from app.services.priority_adjustment_repository import (
    NoAnalysisToAdjustError,
    PriorityAdjustmentRepositoryError,
    list_priority_adjustments,
    save_priority_adjustment,
)


router = APIRouter(prefix="/api/v1/items", tags=["priority adjustments"])


def _storage_error():
    return error_response(
        503,
        "STORAGE_UNAVAILABLE",
        "The priority data could not be stored or retrieved.",
        "Try again after the storage service is restored.",
    )


def _item_exists(item_id: str) -> bool:
    return item_store.get_item(item_id) is not None


@router.get("/{item_id}/analysis")
def get_latest_analysis(
    item_id: str,
    service: AnalysisService = Depends(get_synced_service),
):
    """Latest saved analysis job for an item, so the page survives a refresh."""
    try:
        job = (
            get_latest_analysis_job(item_id)
            or service.pipeline.latest_job(item_id)
        )
    except AnalysisRepositoryError:
        return _storage_error()

    if job is None:
        return error_response(
            404,
            "NOT_FOUND",
            "No analysis has been run for this item.",
            "Start an analysis for the item first.",
        )

    return job.to_dict()


@router.post(
    "/{item_id}/priority/adjustments",
    response_model=PriorityAdjustmentResponse,
    status_code=201,
)
def adjust_priority_factor(
    item_id: str,
    body: PriorityAdjustmentCreate,
    user: UserSummary = Depends(require_reviewer),
    service: AnalysisService = Depends(get_synced_service),
):
    try:
        if not _item_exists(item_id):
            return error_response(
                404,
                "NOT_FOUND",
                "The requested agenda item was not found.",
                "Verify the agenda item identifier and try again.",
            )

        return save_priority_adjustment(
            item_id=item_id,
            factor_key=body.factor_key,
            new_raw_value=body.new_raw_value,
            reason=body.reason,
            reviewer=user.username,
            config=service.pipeline.score_config,
        )
    except NoAnalysisToAdjustError:
        return error_response(
            404,
            "NOT_FOUND",
            "No analysis has been run for this item.",
            "Start an analysis for the item first.",
        )
    except AnalyticsError as error:
        return error_response(
            error.http_status,
            error.code,
            error.message,
            "Correct the request and try again.",
        )
    except (AgendaRepositoryError, PriorityAdjustmentRepositoryError):
        return _storage_error()


@router.get(
    "/{item_id}/priority/adjustments",
    response_model=list[PriorityAdjustmentResponse],
)
def get_priority_adjustments(item_id: str):
    try:
        if not _item_exists(item_id):
            return error_response(
                404,
                "NOT_FOUND",
                "The requested agenda item was not found.",
                "Verify the agenda item identifier and try again.",
            )

        return list_priority_adjustments(item_id)
    except (AgendaRepositoryError, PriorityAdjustmentRepositoryError):
        return _storage_error()
