from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.database import SessionLocal
from app.db_models import (
    BriefingRecord,
    BriefingReviewRecord,
)
from app.models import BriefingReviewResponse


class BriefingReviewRepositoryError(Exception):
    """Raised when briefing review data cannot be stored or read."""


def review_record_to_response(
    review: BriefingReviewRecord,
) -> BriefingReviewResponse:
    return BriefingReviewResponse(
        review_id=review.review_id,
        briefing_id=review.briefing_id,
        status=review.status,
        reviewer=review.reviewer,
        comments=review.comments,
        reviewed_at=review.reviewed_at,
    )


def save_briefing_review(
    briefing_id: str,
    status: str,
    reviewer: str,
    comments: str = "",
) -> BriefingReviewResponse | None:
    try:
        with SessionLocal.begin() as database:
            briefing = database.get(
                BriefingRecord,
                briefing_id,
            )

            if briefing is None:
                return None

            reviewed_at = datetime.now(timezone.utc)

            review = BriefingReviewRecord(
                review_id=str(uuid4()),
                briefing_id=briefing_id,
                status=status,
                reviewer=reviewer.strip(),
                comments=comments.strip(),
                reviewed_at=reviewed_at,
            )

            # These two writes commit together or roll back together.
            briefing.status = status
            database.add(review)
            database.flush()

            return review_record_to_response(review)

    except SQLAlchemyError as error:
        raise BriefingReviewRepositoryError(
            "The briefing review could not be saved."
        ) from error


def list_briefing_reviews(
    briefing_id: str,
) -> list[BriefingReviewResponse] | None:
    try:
        with SessionLocal() as database:
            briefing = database.get(
                BriefingRecord,
                briefing_id,
            )

            if briefing is None:
                return None

            statement = (
                select(BriefingReviewRecord)
                .where(
                    BriefingReviewRecord.briefing_id
                    == briefing_id
                )
                .order_by(
                    BriefingReviewRecord.reviewed_at.asc(),
                    BriefingReviewRecord.review_id.asc(),
                )
            )

            reviews = database.scalars(statement).all()

            return [
                review_record_to_response(review)
                for review in reviews
            ]

    except SQLAlchemyError as error:
        raise BriefingReviewRepositoryError(
            "The briefing reviews could not be retrieved."
        ) from error