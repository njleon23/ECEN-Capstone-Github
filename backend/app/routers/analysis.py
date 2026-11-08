"""AI and Analytics endpoints (ICD section 6.2, AI side).

POST /api/v1/items/{item_id}/analyses      start retrieval, scoring, briefing for one item (202)
POST /api/v1/agendas/{agenda_id}/analyses  start analysis for every item in an agenda (202)
GET  /api/v1/agendas/{agenda_id}/priorities  latest priority (heat) for each item
GET  /api/v1/jobs/{job_id}                 job state: queued | running | completed | degraded | failed
GET  /api/v1/items/{item_id}/briefing      latest generated briefing (always a draft)
POST /api/v1/items/{item_id}/questions     source-grounded follow-up question

Approval of a briefing is a human action and is NOT done here. There is no login yet.
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

router = APIRouter(prefix="/api/v1", tags=["analysis"])

_STATUS_FOR_CODE = {"RATE_LIMITED": 429, "PROVIDER_ERROR": 502, "DEPENDENCY_UNAVAILABLE": 503,
                    "INSUFFICIENT_EVIDENCE": 422, "INVALID_REQUEST": 400}


class AnalysisRequest(BaseModel):
    source_ids: Optional[List[str]] = Field(default=None, max_length=200)


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


def _storage_error():
    return error_response(503, "STORAGE_UNAVAILABLE", "The agenda could not be read.",
                          "Try the request again after storage service is restored.")


def _not_found(what: str):
    return error_response(404, "NOT_FOUND", f"The requested {what} was not found.",
                          f"Verify the {what} identifier and try again.")

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
        job = service.pipeline.submit(
            item,
            source_ids=body.source_ids if body else None,
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
    except AnalysisRepositoryError:
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
            job = service.pipeline.submit(
                item,
                idempotency_key=item_idempotency_key,
            )
            save_analysis_job(job)
        except InvalidRequest:
            continue
        except AnalysisRepositoryError:
            return _storage_error()

        if job.state == "queued":
            to_run.append(job.job_id)

        jobs.append(
            {
                "item_id": item.item_id,
                "item_number": item.item_number,
                "job_id": job.job_id,
                "state": job.state,
                "status_url": (
                    f"/api/v1/jobs/{job.job_id}"
                ),
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
                service.pipeline.latest_job(item.item_id)
                or get_latest_analysis_job(item.item_id)
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
            service.pipeline.get_job(job_id)
            or get_analysis_job(job_id)
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
            service.pipeline.latest_briefing(item_id)
            or get_latest_briefing(item_id)
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
def ask_question(item_id: str, body: QuestionRequest,
                 service: AnalysisService = Depends(get_synced_service)):
    try:
        item = item_store.get_item(item_id)
    except AgendaRepositoryError:
        return _storage_error()
    if item is None:
        return _not_found("agenda item")
    try:
        result = service.pipeline.ask(body.question, item)
    except InvalidRequest as e:
        return error_response(400, e.code, e.message, "Correct the question and try again.")
    except AnalyticsError as e:                       # defensive; the pipeline maps these
        return error_response(e.http_status, e.code, e.message, "Try again later.")
    if result.status == "insufficient_evidence":
        return error_response(422, "INSUFFICIENT_EVIDENCE", result.message,
                              "Add an approved source that covers the question.")
    if result.status == "failed":
        return error_response(_STATUS_FOR_CODE.get(result.error_code or "", 500),
                              result.error_code or "INTERNAL_ERROR", result.message,
                              "Try again later.")
    return result.to_dict()                           # answered or refused
