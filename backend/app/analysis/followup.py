"""Source-grounded follow-up questions (FSR ANA-008, ANA-009).

Implements the 'Deep Dive Consultation' scenario: a user asks a question about an
analyzed item and gets an answer drawn only from approved sources, with citations
that include the source date. The module:

* refuses requests for vote recommendations, decisions, or public statements;
* returns an explicit insufficient-evidence result instead of guessing;
* never answers from model knowledge alone, because the provider only sees the
  retrieved passages.
"""

from __future__ import annotations

import json
import time
from typing import Any, Callable, Dict, List, Optional

from .briefing import build_evidence, figures_supported, parse_json_object
from .config import (DEFAULT_GENERATION_CONFIG, DEFAULT_SCORE_CONFIG, GenerationConfig,
                     ScoreConfig)
from .errors import InvalidRequest, SchemaValidationError
from .guardrails import REFUSAL_MESSAGE, output_violation, request_violation
from .llm_client import LLMProvider, ProviderResponse
from .models import AgendaItem, AnswerResult
from .retrieval import Retriever
from .retry import call_with_retries

MAX_QUESTION_CHARS = 1000
MAX_ANSWER_CHARS = 1500

INSUFFICIENT_MESSAGE = ("The approved sources do not contain enough information to answer "
                        "this question. Add an approved source or research it manually.")


def answer_question(question: str, item: AgendaItem, retriever: Retriever,
                    provider: LLMProvider, *,
                    score_config: ScoreConfig = DEFAULT_SCORE_CONFIG,
                    gen_config: GenerationConfig = DEFAULT_GENERATION_CONFIG,
                    sleep: Callable[[float], None] = time.sleep,
                    on_response: Optional[Callable[[ProviderResponse], None]] = None,
                    ) -> AnswerResult:
    question = (question or "").strip()
    if not question:
        raise InvalidRequest("A question is required.")
    if len(question) > MAX_QUESTION_CHARS:
        raise InvalidRequest(f"Question exceeds {MAX_QUESTION_CHARS} characters.")

    refusal = request_violation(question)
    if refusal:
        return AnswerResult(status="refused", message=refusal, error_code=None)

    # Gate on the question ALONE. If the item title were part of the gate, an unrelated
    # question would still match the item's own topic and reach the model.
    k = gen_config.max_evidence_passages
    direct = retriever.search(question, top_k=k, min_relevance=score_config.min_relevance,
                              min_matched_terms=score_config.min_matched_terms)
    if not direct:
        return AnswerResult(status="insufficient_evidence", error_code="INSUFFICIENT_EVIDENCE",
                            message=INSUFFICIENT_MESSAGE)
    # Then add passages that match the question in the context of the item, so
    # references like "this developer" can pick up the item's own subject.
    contextual = retriever.search(
        f"{question} {item.title}", top_k=k, min_relevance=score_config.min_relevance,
        min_matched_terms=score_config.min_matched_terms)
    seen = {r.passage.passage_id for r in direct}
    retrieved = list(direct) + [r for r in contextual if r.passage.passage_id not in seen]
    retrieved = retrieved[:k]

    evidence, citations, texts = build_evidence(item, retrieved, gen_config)

    def build_user(previous_error: Optional[str]) -> str:
        req: Dict[str, Any] = {
            "task": "followup", "question": question,
            "agenda_item": {"item_number": item.item_number, "title": item.title},
            "evidence": evidence,
            "output_schema": {"answer": "string", "evidence_ids": ["evidence id"]},
        }
        if previous_error:
            req["previous_attempt_error"] = previous_error
        return json.dumps(req, ensure_ascii=False)

    def validate(response: ProviderResponse) -> Dict[str, Any]:
        data = parse_json_object(response.text)
        answer = data.get("answer")
        if not isinstance(answer, str) or not answer.strip():
            raise SchemaValidationError("answer: expected non-empty text.")
        if len(answer) > MAX_ANSWER_CHARS:
            raise SchemaValidationError(f"answer: text exceeds {MAX_ANSWER_CHARS} characters.")
        ids = data.get("evidence_ids", [])
        if not isinstance(ids, list) or not all(isinstance(x, str) for x in ids):
            raise SchemaValidationError("evidence_ids must be a list of strings.")
        unknown = [x for x in ids if x not in citations]
        if unknown:
            raise SchemaValidationError(f"Unknown evidence id(s) {unknown}. Cite only supplied ids.")
        return {"answer": answer.strip(), "ids": list(dict.fromkeys(ids))}

    _, result = call_with_retries(
        provider, system=gen_config.followup_instruction, build_user=build_user,
        validate=validate, temperature=gen_config.temperature,
        max_retries=gen_config.max_retries, sleep=sleep, on_response=on_response)

    if output_violation(result["answer"]):
        return AnswerResult(status="refused", message=REFUSAL_MESSAGE)
    if not result["ids"]:
        return AnswerResult(status="insufficient_evidence", error_code="INSUFFICIENT_EVIDENCE",
                            message=INSUFFICIENT_MESSAGE)

    cited = [citations[i] for i in result["ids"]]
    message = ""
    if not figures_supported(result["answer"], " ".join(texts[i] for i in result["ids"])):
        message = ("Some figures in this answer could not be matched to the cited text. "
                   "Check the sources before using them.")
    return AnswerResult(status="answered", answer=result["answer"], citations=cited,
                        message=message)


def format_citation(c) -> str:
    """Human-readable citation line, including the source date when known."""
    date = f", {c.source_date}" if c.source_date else ""
    return f"{c.source_title}{date} ({c.source_location})"
