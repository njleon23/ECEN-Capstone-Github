"""Orchestrates one analysis: retrieve, score, generate (ICD 6.4.4 'AnalysisJob').

``submit`` creates a queued job. ``run_job`` executes it and leaves the job in a
terminal state. ``start`` does both. The backend can call ``run_job`` from a
background worker to return HTTP 202 immediately and let the browser poll
``GET /api/v1/jobs/{job_id}``.

Job outcomes
------------
completed  scoring and briefing both succeeded.
degraded   partial result: evidence was insufficient (score suppressed, incomplete
           briefing) OR the provider failed after retries (score still computed,
           no generated briefing). Sources are always preserved (FSR REL-002/003).
failed     an unexpected internal error. Details are logged to audit, not returned.

Idempotency (FSR REL-006): ``start`` with an ``idempotency_key`` already used for
the same item returns the original job and does not run again or create a second
briefing. To retry a degraded or failed job, use a new key.

The last good briefing for an item is only replaced when a new run succeeds, so a
failed re-analysis never overwrites previously reviewed content (FSR REL-004).
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

from .briefing import generate_briefing
from .config import (DEFAULT_GENERATION_CONFIG, DEFAULT_SCORE_CONFIG, GenerationConfig,
                     ScoreConfig)
from .errors import AnalyticsError, InvalidRequest
from .followup import answer_question
from .llm_client import LLMProvider, ProviderResponse
from .models import (AgendaItem, AnalysisJob, AnswerResult, Briefing, PriorityResult,
                     utc_now)
from .retrieval import Retriever
from .scoring import compute_priority, gather_evidence, is_procedural

AuditSink = Callable[[Dict[str, Any]], None]


class InMemoryAudit:
    """Simple audit collector. Replace with the backend's audit_event writer."""

    def __init__(self) -> None:
        self.events: List[Dict[str, Any]] = []

    def __call__(self, event: Dict[str, Any]) -> None:
        self.events.append(event)


def _noop_audit(_: Dict[str, Any]) -> None:
    return None


class AnalysisPipeline:
    def __init__(self, retriever: Retriever, provider: LLMProvider, *,
                 score_config: ScoreConfig = DEFAULT_SCORE_CONFIG,
                 gen_config: GenerationConfig = DEFAULT_GENERATION_CONFIG,
                 audit: AuditSink = _noop_audit,
                 sleep: Callable[[float], None] = time.sleep):
        self.retriever = retriever
        self.provider = provider
        self.score_config = score_config
        self.gen_config = gen_config
        self.audit = audit
        self.sleep = sleep
        self._jobs: Dict[str, AnalysisJob] = {}
        self._job_sources: Dict[str, Optional[List[str]]] = {}
        self._job_items: Dict[str, AgendaItem] = {}
        self._idem: Dict[tuple, str] = {}
        self._latest: Dict[str, Briefing] = {}
        self._latest_job: Dict[str, str] = {}
        self._revisions: Dict[str, int] = {}
        self._lock = threading.Lock()

    # -- job API ------------------------------------------------------------

    def submit(self, item: AgendaItem, *, source_ids: Optional[List[str]] = None,
               idempotency_key: Optional[str] = None) -> AnalysisJob:
        if not item.title and not item.source_text:
            raise InvalidRequest("The agenda item has no title or text to analyze.")
        with self._lock:
            if idempotency_key:
                existing = self._idem.get((item.item_id, idempotency_key))
                if existing:
                    return self._jobs[existing]
            job = AnalysisJob(job_id=str(uuid.uuid4()), item_id=item.item_id,
                              state="queued", progress_message="Queued",
                              idempotency_key=idempotency_key)
            self._jobs[job.job_id] = job
            self._job_sources[job.job_id] = list(source_ids) if source_ids else None
            self._job_items[job.job_id] = item
            self._latest_job[item.item_id] = job.job_id
            if idempotency_key:
                self._idem[(item.item_id, idempotency_key)] = job.job_id
        return job

    def get_job(self, job_id: str) -> Optional[AnalysisJob]:
        return self._jobs.get(job_id)

    def latest_job(self, item_id: str) -> Optional[AnalysisJob]:
        """Most recently submitted job for an item (used for the per-agenda heat list)."""
        job_id = self._latest_job.get(item_id)
        return self._jobs.get(job_id) if job_id else None

    def latest_briefing(self, item_id: str) -> Optional[Briefing]:
        return self._latest.get(item_id)

    def start(self, item: AgendaItem, *, source_ids: Optional[List[str]] = None,
              idempotency_key: Optional[str] = None) -> AnalysisJob:
        job = self.submit(item, source_ids=source_ids, idempotency_key=idempotency_key)
        if job.state == "queued":
            self.run_job(job.job_id)
        return job

    def run_job(self, job_id: str) -> AnalysisJob:
        job = self._jobs[job_id]
        item = self._job_items[job_id]
        source_ids = self._job_sources[job_id]
        usage: List[Dict[str, Any]] = []
        responses: List[ProviderResponse] = []

        def on_response(r: ProviderResponse) -> None:
            responses.append(r)
            if r.usage:
                usage.append(r.usage)

        try:
            job.state = "running"
            job.progress_message = "Retrieving evidence"
            self.audit({"event_type": "analysis_started", "job_id": job.job_id,
                        "item_id": item.item_id, "time": utc_now()})
            job.fingerprint = self.fingerprint_for(item, source_ids)
            procedural = is_procedural(item, self.score_config)
            retrieved = gather_evidence(self.retriever, item, self.score_config, source_ids)

            job.progress_message = "Scoring"
            priority = compute_priority(item, retrieved, self.score_config)
            job.priority = priority

            job.progress_message = "Generating briefing"
            revision = self._revisions.get(item.item_id, 0) + 1
            try:
                briefing = generate_briefing(
                    item, retrieved, priority, self.provider, self.gen_config,
                    revision=revision, procedural=procedural, sleep=self.sleep,
                    on_response=on_response)
            except AnalyticsError as e:
                # Provider outage, rate limit, or unusable output after retries.
                job.state = "degraded"
                job.error = e.to_dict()
                job.progress_message = ("Briefing could not be generated. Sources and the "
                                        "priority score are available for manual preparation.")
                self._finish(job, item, responses, usage)
                return job

            job.briefing = briefing
            if procedural:
                job.state = "completed"                  # nothing to prepare, not a failure
                job.progress_message = "Procedural item: not scored or briefed."
            elif briefing.incomplete or priority.incomplete:
                job.state = "degraded"
                job.error = {"code": "INSUFFICIENT_EVIDENCE", "http_status": 422,
                             "message": "Not enough approved evidence for a full analysis.",
                             "retryable": False}
                job.progress_message = ("Insufficient evidence: score suppressed and briefing "
                                        "marked incomplete.")
            else:
                job.state = "completed"
                job.progress_message = "Completed"
            self._revisions[item.item_id] = revision
            self._latest[item.item_id] = briefing        # only replaced on success (REL-004)
            self._finish(job, item, responses, usage)
        except Exception as e:                           # noqa: BLE001 - last-resort guard
            job.state = "failed"
            job.error = {"code": "INTERNAL_ERROR", "http_status": 500,
                         "message": "The analysis failed unexpectedly.", "retryable": False}
            job.progress_message = "Failed"
            self.audit({"event_type": "analysis_failed", "job_id": job.job_id,
                        "item_id": item.item_id, "time": utc_now(),
                        "error_type": type(e).__name__})   # never the message or any secrets
            job.completed_at = utc_now()
        return job

    def _finish(self, job: AnalysisJob, item: AgendaItem, responses: List[ProviderResponse],
                usage: List[Dict[str, Any]]) -> None:
        job.completed_at = utc_now()
        self.audit({
            "event_type": f"analysis_{job.state}", "job_id": job.job_id,
            "item_id": item.item_id, "time": job.completed_at,
            "model_id": responses[-1].model_id if responses else None,
            "provider_request_ids": [r.request_id for r in responses if r.request_id],
            "usage": usage, "elapsed_seconds": round(sum(r.elapsed_seconds for r in responses), 3),
            "score_configuration_version": self.score_config.version,
            "prompt_version": self.gen_config.prompt_version,
            "error_code": job.error["code"] if job.error else None,
        })

    # -- follow-up questions --------------------------------------------------

    def ask(self, question: str, item: AgendaItem) -> AnswerResult:
        usage: List[Dict[str, Any]] = []
        responses: List[ProviderResponse] = []

        def on_response(r: ProviderResponse) -> None:
            responses.append(r)
            if r.usage:
                usage.append(r.usage)

        try:
            result = answer_question(
                question, item, self.retriever, self.provider,
                score_config=self.score_config, gen_config=self.gen_config,
                sleep=self.sleep, on_response=on_response)
        except InvalidRequest:
            raise
        except AnalyticsError as e:
            result = AnswerResult(status="failed", error_code=e.code, message=e.message)
        self.audit({"event_type": "followup_question", "item_id": item.item_id,
                    "time": utc_now(), "status": result.status,
                    "model_id": responses[-1].model_id if responses else None,
                    "usage": usage, "error_code": result.error_code})
        return result

    # -- staleness ---------------------------------------------------------

    def fingerprint_for(self, item: AgendaItem, source_ids: Optional[List[str]] = None) -> str:
        """Hash of every input that affects the analysis. If a stored job's
        fingerprint differs from this value, mark its briefing stale (FSR REV-004)."""
        wanted = set(source_ids) if source_ids else None
        sources = [(s.source_id, hashlib.sha256(s.text.encode()).hexdigest()[:16], s.approved)
                   for s in self.retriever.sources()
                   if wanted is None or s.source_id in wanted]
        blob = json.dumps({
            "item": [item.item_id, item.title,
                     hashlib.sha256(item.source_text.encode()).hexdigest()[:16]],
            "sources": sources, "score_config": self.score_config.version,
            "prompt": self.gen_config.prompt_version,
            "model": getattr(self.provider, "model_id", ""),
        }, sort_keys=True)
        return hashlib.sha256(blob.encode()).hexdigest()[:24]
