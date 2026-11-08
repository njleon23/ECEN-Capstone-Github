"""AI and Analytics HTTP endpoints.

Analysis and follow-up retrieval are restricted to sources explicitly attached
to the selected agenda item. The retriever independently enforces source
approval, so an attached but unapproved source is never used as evidence.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header
from pydantic import BaseModel, Field

from app.analysis import item_store
from app.analysis.errors import AnalyticsError, InvalidRequest
from app.analysis.scoring import is_procedural
from app.analysis.service import AnalysisService, get_synced_service
from app.routers.agendas import error_response
from app.services.agenda_repository import AgendaRepositoryError
from app.services.analysis_repository import (
    AnalysisRepositoryError,
    get_analysis_job,
    get_analysis_job_by_idempotency_key,
    get_latest_analysis_job,
    get_latest_briefing,
    save_analysis_job,
)
from app.services.source_association_repository import (
    SourceAssociationRepositoryError,
    list_sources_for_item,
)


router = APIRouter(prefix="/api/v1", tags=["analysis"])

_STATUS_FOR_CODE = {
    "RATE_LIMITED": 429,
    "PROVIDER_ERROR": 502,
    "DEPENDENCY_UNAVAILABLE": 503,
    "INSUFFICIENT_EVIDENCE": 422,
    "INVALID_REQUEST": 400,
}


class AnalysisRequest(BaseModel):
    source_ids: Optional[List[str]] = Field(
        default=None,
        max_length=200,
    )


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


def _storage_error():
    return error_response(
        503,
        "STORAGE_UNAVAILABLE",
        "Required backend data could not be read or written.",
        "Try the request again after storage service is restored.",
    )


def _not_found(what: str):
    return error_response(
        404,
        "NOT_FOUND",
        f"The requested {what} was not found.",
        f"Verify the {what} identifier and try again.",
    )


def _source_ids_for_item(
    item_id: str,
    requested_source_ids: Optional[List[str]] = None,
) -> List[str]:
    """Return the allowed source scope for one agenda item.

    With no explicit request, every source attached to the item is allowed.
    An explicit list may narrow that scope but may never add an unattached
    source. An empty list remains empty and therefore retrieves no evidence.
    """
    attached_sources = list_sources_for_item(item_id)
    attached_ids = {
        source.source_id
        for source in attached_sources
    }

    if requested_source_ids is None:
        return sorted(attached_ids)

    requested_ids = list(dict.fromkeys(requested_source_ids))
    unattached_ids = [
        source_id
        for source_id in requested_ids
        if source_id not in attached_ids
    ]

    if unattached_ids:
        raise InvalidRequest(
            "Every requested source must be attached "
            "to the agenda item before analysis."
        )

    return requested_ids


def _run_and_save_job(
    service: AnalysisService,
    job_id: str,
) -> None:
    job = service.pipeline.run_job(job_id)
    save_analysis_job(job)


@router.post("/items/{item_id}/analyses", status_code=202)
def start_item_analysis(
    item_id: str,
    background: BackgroundTasks,
    body: Optional[AnalysisRequest] = None,
    idempotency_key: Optional[str] = Header(default=None),
    service: AnalysisService = Depends(get_synced_service),
):
    try:
        item = item_store.get_item(item_id)
    except AgendaRepositoryError:
        return _storage_error()

    if item is None:
        return _not_found("agenda item")

    if idempotency_key:
        try:
            existing_job = get_analysis_job_by_idempotency_key(
                item_id,
                idempotency_key,
            )
        except AnalysisRepositoryError:
            return _storage_error()

        if existing_job is not None:
            return {
                "job_id": existing_job.job_id,
                "state": existing_job.state,
                "status_url": (
                    f"/api/v1/jobs/{existing_job.job_id}"
                ),
            }

    try:
        source_ids = _source_ids_for_item(
            item_id,
            body.source_ids if body else None,
        )
        job = service.pipeline.submit(
            item,
            source_ids=source_ids,
            idempotency_key=idempotency_key,
        )
        save_analysis_job(job)
    except InvalidRequest as error:
        return error_response(
            400,
            error.code,
            error.message,
            "Correct the request and try again.",
        )
    except (
        AnalysisRepositoryError,
        SourceAssociationRepositoryError,
    ):
        return _storage_error()

    if job.state == "queued":
        background.add_task(
            _run_and_save_job,
            service,
            job.job_id,
        )

    return {
        "job_id": job.job_id,
        "state": job.state,
        "status_url": f"/api/v1/jobs/{job.job_id}",
    }


@router.post("/agendas/{agenda_id}/analyses", status_code=202)
def start_agenda_analysis(
    agenda_id: str,
    background: BackgroundTasks,
    idempotency_key: Optional[str] = Header(default=None),
    service: AnalysisService = Depends(get_synced_service),
):
    try:
        items = item_store.list_items(agenda_id)
    except AgendaRepositoryError:
        return _storage_error()

    if not items:
        return _not_found("agenda")

    jobs = []
    to_run = []

    for item in items:
        item_idempotency_key = (
            f"{idempotency_key}:{item.item_id}"
            if idempotency_key
            else None
        )

        if item_idempotency_key:
            try:
                existing_job = (
                    get_analysis_job_by_idempotency_key(
                        item.item_id,
                        item_idempotency_key,
                    )
                )
            except AnalysisRepositoryError:
                return _storage_error()

            if existing_job is not None:
                jobs.append(
                    {
                        "item_id": item.item_id,
                        "item_number": item.item_number,
                        "job_id": existing_job.job_id,
                        "state": existing_job.state,
                        "status_url": (
                            f"/api/v1/jobs/"
                            f"{existing_job.job_id}"
                        ),
                    }
                )
                continue

        try:
            source_ids = _source_ids_for_item(item.item_id)
            job = service.pipeline.submit(
                item,
                source_ids=source_ids,
                idempotency_key=item_idempotency_key,
            )
            save_analysis_job(job)
        except InvalidRequest:
            continue
        except (
            AnalysisRepositoryError,
            SourceAssociationRepositoryError,
        ):
            return _storage_error()

        if job.state == "queued":
            to_run.append(job.job_id)

        jobs.append(
            {
                "item_id": item.item_id,
                "item_number": item.item_number,
                "job_id": job.job_id,
                "state": job.state,
                "status_url": f"/api/v1/jobs/{job.job_id}",
            }
        )

    def run_all(job_ids: List[str]) -> None:
        for job_id in job_ids:
            _run_and_save_job(service, job_id)

    if to_run:
        background.add_task(run_all, to_run)

    return {
        "agenda_id": agenda_id,
        "jobs": jobs,
    }


@router.get("/agendas/{agenda_id}/priorities")
def agenda_priorities(
    agenda_id: str,
    service: AnalysisService = Depends(get_synced_service),
):
    try:
        items = item_store.list_items(agenda_id)
    except AgendaRepositoryError:
        return _storage_error()

    if not items:
        return _not_found("agenda")

    rows = []

    try:
        for item in items:
            job = (
                get_latest_analysis_job(item.item_id)
                or service.pipeline.latest_job(item.item_id)
            )
            priority = job.priority if job else None

            rows.append(
                {
                    "item_id": item.item_id,
                    "item_number": item.item_number,
                    "title": item.title,
                    "procedural": is_procedural(
                        item,
                        service.pipeline.score_config,
                    ),
                    "job_id": job.job_id if job else None,
                    "state": (
                        job.state
                        if job
                        else "not_analyzed"
                    ),
                    "priority": (
                        None
                        if priority is None
                        else {
                            "score": priority.score,
                            "category": priority.category,
                            "evidence_level": (
                                priority.evidence_level
                            ),
                            "incomplete": priority.incomplete,
                            "configuration_version": (
                                priority.configuration_version
                            ),
                        }
                    ),
                }
            )
    except AnalysisRepositoryError:
        return _storage_error()

    return {
        "agenda_id": agenda_id,
        "items": rows,
    }


@router.get("/jobs/{job_id}")
def get_job(
    job_id: str,
    service: AnalysisService = Depends(get_synced_service),
):
    try:
        job = (
            get_analysis_job(job_id)
            or service.pipeline.get_job(job_id)
        )
    except AnalysisRepositoryError:
        return _storage_error()

    if job is None:
        return _not_found("job")

    return job.to_dict()


@router.get("/items/{item_id}/briefing")
def get_briefing(
    item_id: str,
    service: AnalysisService = Depends(get_synced_service),
):
    try:
        briefing = (
            get_latest_briefing(item_id)
            or service.pipeline.latest_briefing(item_id)
        )
    except AnalysisRepositoryError:
        return _storage_error()

    if briefing is None:
        return error_response(
            404,
            "NOT_FOUND",
            "No briefing has been generated for this item.",
            "Start an analysis for the item first.",
        )

    return briefing.to_dict()


@router.post("/items/{item_id}/questions")
def ask_question(
    item_id: str,
    body: QuestionRequest,
    service: AnalysisService = Depends(get_synced_service),
):
    try:
        item = item_store.get_item(item_id)
    except AgendaRepositoryError:
        return _storage_error()

    if item is None:
        return _not_found("agenda item")

    try:
        source_ids = _source_ids_for_item(item_id)
        result = service.pipeline.ask(
            body.question,
            item,
            source_ids=source_ids,
        )
    except InvalidRequest as error:
        return error_response(
            400,
            error.code,
            error.message,
            "Correct the question and try again.",
        )
    except SourceAssociationRepositoryError:
        return _storage_error()
    except AnalyticsError as error:
        return error_response(
            error.http_status,
            error.code,
            error.message,
            "Try again later.",
        )

    if result.status == "insufficient_evidence":
        return error_response(
            422,
            "INSUFFICIENT_EVIDENCE",
            result.message,
            "Attach and approve a source that covers the question.",
        )

    if result.status == "failed":
        return error_response(
            _STATUS_FOR_CODE.get(
                result.error_code or "",
                500,
            ),
            result.error_code or "INTERNAL_ERROR",
            result.message,
            "Try again later.",
        )

    return result.to_dict()
