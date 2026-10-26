"""Shared test helpers."""

from __future__ import annotations

import json
from typing import Any, List, Union

from app.analysis.retrieval import Retriever
from app.analysis.llm_client import ProviderResponse
from app.analysis.sample_data import sample_items, sample_sources


class ScriptedProvider:
    """Returns scripted responses in order. An Exception instance is raised instead.
    The last script entry repeats if the script runs out. Records every request."""

    model_id = "scripted-test-model"

    def __init__(self, script: List[Union[str, dict, Exception]]):
        self.script = list(script)
        self.requests: List[dict] = []
        self.calls = 0

    def complete_json(self, *, system: str, user: str, temperature: float = 0.2):
        self.calls += 1
        self.requests.append({"system": system, "user": json.loads(user),
                              "raw_user": user, "temperature": temperature})
        entry = self.script[min(self.calls - 1, len(self.script) - 1)]
        if isinstance(entry, Exception):
            raise entry
        text = entry if isinstance(entry, str) else json.dumps(entry)
        return ProviderResponse(text=text, model_id=self.model_id, request_id=f"req-{self.calls}",
                               usage={"prompt_tokens": 100, "completion_tokens": 50})


def sample_retriever() -> Retriever:
    r = Retriever()
    for s in sample_sources():
        r.add_source(s)
    return r


def item(item_id: str):
    return next(i for i in sample_items() if i.item_id == item_id)


def no_sleep(_seconds: float) -> None:
    return None


def valid_briefing_payload(evidence_id: str) -> dict:
    return {
        "summary": "A construction contract for Main Street redevelopment.",
        "key_facts": [{"text": "The original estimate was $6.8 million.",
                       "evidence_ids": [evidence_id]}],
        "concerns": [{"text": "Residents are concerned about traffic.", "evidence_ids": []}],
        "anticipated_questions": [{"question": "Why did the estimate change?",
                                   "draft_response": "Explain the revised estimate.",
                                   "evidence_ids": [evidence_id]}],
        "talking_points": [{"text": "The project upgrades downtown utilities.",
                            "evidence_ids": []}],
    }
