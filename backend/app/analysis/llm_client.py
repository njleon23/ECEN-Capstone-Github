"""LLM and embedding provider interfaces (ICD IF-05).

Two providers are included:

* :class:`OpenAICompatibleProvider` calls any server that implements the
  OpenAI-style ``/chat/completions`` endpoint (ICD-TBD-03 baseline). It uses only
  the standard library, reads the API key from an environment variable at call
  time, and never logs or returns the key.
* :class:`OfflineExtractiveProvider` is NOT an AI model. It builds a briefing
  directly from the evidence passages with simple rules. It exists so the whole
  pipeline can be tested and demonstrated with no network access and no cost.

Provider failures are translated into the ICD error classes in ``errors.py``.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol, Sequence

from .errors import (DependencyUnavailable, ProviderError, RateLimited)
from .text_utils import first_sentences


@dataclass
class ProviderResponse:
    text: str
    model_id: str
    request_id: Optional[str] = None
    usage: Dict[str, Any] = field(default_factory=dict)   # tokens, cost metadata if known
    elapsed_seconds: float = 0.0


class LLMProvider(Protocol):
    model_id: str

    def complete_json(self, *, system: str, user: str, temperature: float = 0.2,
                      ) -> ProviderResponse: ...


# --------------------------------------------------------------------------
# Real provider
# --------------------------------------------------------------------------

class OpenAICompatibleProvider:
    def __init__(self, *, base_url: str = "https://api.openai.com/v1",
                 model: str = "gpt-4o-mini", api_key_env: str = "LLM_API_KEY",
                 timeout: float = 60.0, embedding_model: str = "text-embedding-3-small"):
        self.base_url = base_url.rstrip("/")
        self.model_id = model
        self.embedding_model = embedding_model
        self.api_key_env = api_key_env
        self.timeout = timeout

    def _post(self, path: str, payload: Dict[str, Any]) -> tuple[Dict[str, Any], Optional[str]]:
        key = os.environ.get(self.api_key_env)
        if not key:
            raise DependencyUnavailable(
                f"LLM credentials are not configured (set {self.api_key_env} on the server).")
        req = urllib.request.Request(
            f"{self.base_url}{path}", data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
            method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode("utf-8")
                request_id = resp.headers.get("x-request-id")
        except urllib.error.HTTPError as e:
            e.close()                                    # release the socket
            if e.code == 429:
                retry_after = e.headers.get("Retry-After") if e.headers else None
                raise RateLimited("The LLM provider rate limit was reached.",
                                  retry_after=float(retry_after) if retry_after
                                  and retry_after.replace(".", "", 1).isdigit() else None)
            if e.code in (401, 403):
                raise ProviderError("The LLM provider rejected the server credentials.")
            if e.code >= 500:
                raise DependencyUnavailable(f"The LLM provider returned HTTP {e.code}.")
            raise ProviderError(f"The LLM provider returned HTTP {e.code}.")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise DependencyUnavailable(f"Could not reach the LLM provider: {type(e).__name__}.")
        try:
            return json.loads(body), request_id
        except json.JSONDecodeError:
            raise ProviderError("The LLM provider returned a non-JSON response.")

    def complete_json(self, *, system: str, user: str, temperature: float = 0.2,
                      ) -> ProviderResponse:
        started = time.monotonic()
        data, request_id = self._post("/chat/completions", {
            "model": self.model_id,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": user}],
        })
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise ProviderError("The LLM provider response had an unexpected shape.")
        return ProviderResponse(
            text=text or "", model_id=data.get("model", self.model_id),
            request_id=request_id or data.get("id"), usage=data.get("usage", {}) or {},
            elapsed_seconds=round(time.monotonic() - started, 3))

    # Optional embedding support for semantic retrieval (ICD-TBD-04).
    def embed(self, texts: Sequence[str]) -> List[List[float]]:
        data, _ = self._post("/embeddings", {"model": self.embedding_model,
                                              "input": list(texts)})
        try:
            rows = sorted(data["data"], key=lambda r: r["index"])
            return [r["embedding"] for r in rows]
        except (KeyError, TypeError):
            raise ProviderError("The embedding provider response had an unexpected shape.")


# --------------------------------------------------------------------------
# Offline stand-in (not an AI model)
# --------------------------------------------------------------------------

_first_sentences = first_sentences


class OfflineExtractiveProvider:
    """Deterministic rule-based provider for tests and demos."""

    model_id = "offline-extractive-v1"
    _OPPOSE = ("oppos", "concern", "complain", "against", "traffic", "noise", "cost")

    def complete_json(self, *, system: str, user: str, temperature: float = 0.2,
                      ) -> ProviderResponse:
        try:
            req = json.loads(user)
        except json.JSONDecodeError:
            raise ProviderError("Offline provider expected a JSON request.")
        task = req.get("task")
        evidence = req.get("evidence", [])
        if task == "briefing":
            payload = self._briefing(req, evidence)
        elif task == "followup":
            payload = self._followup(req, evidence)
        else:
            raise ProviderError("Offline provider does not know this task.")
        return ProviderResponse(text=json.dumps(payload), model_id=self.model_id,
                                request_id="offline", usage={})

    def _briefing(self, req: Dict[str, Any], evidence: List[Dict[str, Any]]) -> Dict[str, Any]:
        item = req["agenda_item"]
        title = item["title"]
        item_text = next((e["text"] for e in evidence if e["id"] == "item"), "")
        # Stand-in only: skip loosely related passages (a real model judges relevance itself).
        retrieved = [e for e in evidence if e["id"] != "item" and e.get("relevance", 1.0) >= 0.30]
        # Stand-in only: a heading fragment such as "Eastside flooding and drainage
        # improvements." is not a useful fact, so require a real sentence.
        facts = []
        for e in retrieved[:3]:
            sentence = _first_sentences(e["text"], 1, 300, 7)
            if len(sentence.split()) >= 7:
                facts.append({"text": sentence, "evidence_ids": [e["id"]]})
        concerns = [{"text": f"Prior records mention possible concerns: {_first_sentences(e['text'])}",
                     "evidence_ids": [e["id"]]}
                    for e in retrieved if any(w in e["text"].lower() for w in self._OPPOSE)][:2]
        all_text = " ".join([item_text] + [e["text"] for e in retrieved])
        lowered_title = title.lower()
        questions: List[Dict[str, Any]] = []
        if "$" in all_text:
            questions.append({
                "question": f"What is the total cost of '{title}' and how has it changed?",
                "draft_response": "Walk through the cost history from the cited records.",
                "evidence_ids": [e["id"] for e in retrieved if "$" in e["text"]][:1]})
        if any(w in lowered_title for w in ("contract", "vendor", "purchase", "agreement")):
            questions.append({"question": f"How were the vendor and terms for '{title}' selected?"})
        if any(w in lowered_title for w in ("zoning", "rezon")):
            questions.append({"question": "Has this applicant made similar requests before, "
                                          "and how did the public respond?"})
        questions.append({"question": f"How will '{title}' affect nearby residents and businesses?"})
        return {
            "summary": _first_sentences(item_text, 2, 500) or title,
            "key_facts": facts,
            "concerns": concerns,
            "anticipated_questions": questions,
            "talking_points": [{"text": f"State the purpose of '{title}' in plain language.",
                                "evidence_ids": ["item"]}],
        }

    def _followup(self, req: Dict[str, Any], evidence: List[Dict[str, Any]]) -> Dict[str, Any]:
        retrieved = [e for e in evidence if e["id"] != "item"]
        if not retrieved:
            return {"answer": "The provided evidence does not answer this question.",
                    "evidence_ids": []}
        best = retrieved[0]
        when = f" ({best['date']})" if best.get("date") else ""
        return {"answer": f"{_first_sentences(best['text'], 2, 500)}{when}",
                "evidence_ids": [best["id"]]}
