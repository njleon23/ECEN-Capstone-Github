"""Process-wide wiring: one retriever, one provider, one pipeline.

``get_service()`` builds it on first use so importing ``app.main`` never needs network
access or a key. The provider is the real OpenAI-compatible client when ``LLM_API_KEY`` is
set in the server environment (SEC-001: the key never goes to the browser or into Git),
and the offline rule-based stand-in otherwise. Responses say which one produced them
through ``briefing.model_id``.

Jobs, briefings, and idempotency keys live in memory and are lost on restart. Sources live
in the backend's ``sources`` table (added with ``POST /api/v1/sources`` and approved with
``PATCH /api/v1/sources/{source_id}/approval``). ``sync_sources`` copies new sources and
approval changes from that table into the retriever before each use, so the analysis always
follows the table and never keeps its own approval state.
"""

from __future__ import annotations

import os
import threading
from typing import Optional

from . import source_store
from .llm_client import LLMProvider, OfflineExtractiveProvider, OpenAICompatibleProvider
from .models import utc_now
from .pipeline import AnalysisPipeline, InMemoryAudit
from .retrieval import Retriever


def default_provider() -> LLMProvider:
    if os.environ.get("LLM_API_KEY"):
        return OpenAICompatibleProvider(
            base_url=os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1"),
            model=os.environ.get("LLM_MODEL", "gpt-4o-mini"))
    return OfflineExtractiveProvider()


class AnalysisService:
    def __init__(self, provider: Optional[LLMProvider] = None):
        self.retriever = Retriever()
        self.audit = InMemoryAudit()
        self.pipeline = AnalysisPipeline(self.retriever, provider or default_provider(),
                                         audit=self.audit)
        self._lock = threading.Lock()
        for source in source_store.list_sources():
            self.retriever.add_source(source)

    def sync_sources(self) -> None:
        """Bring the retriever in line with the ``sources`` table (new sources, approvals)."""
        with self._lock:
            known = {s.source_id: s for s in self.retriever.sources()}
            for source in source_store.list_sources():
                old = known.pop(source.source_id, None)
                if old is None:
                    self.retriever.add_source(source)
                elif old.approved != source.approved:
                    self.retriever.set_approved(source.source_id, source.approved)
                    self.audit({"event_type": "source_approval_seen",
                                "source_id": source.source_id, "approved": source.approved,
                                "time": utc_now()})
            for gone in known:                      # deleted from the table
                self.retriever.remove_source(gone)

    def passage_count(self, source_id: str) -> int:
        return len(self.retriever.passages_for(source_id))


_service: Optional[AnalysisService] = None
_service_lock = threading.Lock()


def get_service() -> AnalysisService:
    global _service
    with _service_lock:
        if _service is None:
            _service = AnalysisService()
        return _service


def get_synced_service() -> AnalysisService:
    """FastAPI dependency: the shared service, with sources freshly synced from the table."""
    service = get_service()
    service.sync_sources()
    return service


def set_service(service: Optional[AnalysisService]) -> None:
    """Replace (or clear, with None) the process-wide service. Used by tests."""
    global _service
    with _service_lock:
        _service = service
