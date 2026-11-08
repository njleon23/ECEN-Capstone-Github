from fastapi import APIRouter

from app.models import (
    BriefingReviewResponse,
    BriefingReviewUpdate,
)
from app.routers.agendas import error_response
from app.services.briefing_review_repository import (
    BriefingReviewRepositoryError,
    list_briefing_reviews,
    save_briefing_review,
)


router = APIRouter(
    prefix="/api/v1/briefings",
    tags=["briefing reviews"],
)


def _storage_error():
    return error_response(
        503,
        "STORAGE_UNAVAILABLE",
        "The briefing review could not be stored or retrieved.",
        "Try again after the storage service is restored.",
    )


def _not_found():
    return error_response(
        404,
        "NOT_FOUND",
        "The requested briefing was not found.",
        "Verify the briefing identifier and try again.",
    )


@router.patch(
    "/{briefing_id}/review",
    response_model=BriefingReviewResponse,
)
def update_briefing_review(
    briefing_id: str,
    body: BriefingReviewUpdate,
):
    try:
        review = save_briefing_review(
            briefing_id=briefing_id,
            status=body.status,
            reviewer=body.reviewer,
            comments=body.comments,
        )
    except BriefingReviewRepositoryError:
        return _storage_error()

    if review is None:
        return _not_found()

    return review


@router.get(
    "/{briefing_id}/reviews",
    response_model=list[BriefingReviewResponse],
)
def get_briefing_reviews(
    briefing_id: str,
):
    try:
        reviews = list_briefing_reviews(briefing_id)
    except BriefingReviewRepositoryError:
        return _storage_error()

    if reviews is None:
        return _not_found()

    return reviews