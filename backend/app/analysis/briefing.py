"""Grounded briefing generation (FSR ANA-001 to ANA-003, ANA-010, REL-003, REL-007).

Flow
----
1. Build a bounded, numbered evidence list from the retrieved passages.
2. Ask the provider for a structured JSON briefing.
3. Validate the schema, lengths, and that every cited evidence id was supplied.
4. Label every claim: supported, uncertain (cited but a figure did not match the
   cited text), or unsupported (no citation). Only supported key facts are tagged
   as facts; everything else is shown as interpretation.
5. Remove any statement that recommends a vote or decision.

A briefing is ALWAYS returned in ``draft`` status. Approval is a human action
handled by the review workflow, never by this module (FSR REV-001).
"""

from __future__ import annotations

import json
import re
import time
import uuid
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from .config import DEFAULT_GENERATION_CONFIG, GenerationConfig
from .errors import SchemaValidationError
from .guardrails import output_violation
from .llm_client import LLMProvider, ProviderResponse
from .models import (AgendaItem, AnticipatedQuestion, Briefing, Citation, Claim,
                     PriorityResult, RetrievedPassage)
from .retry import call_with_retries
from .text_utils import (extract_dollar_amounts, first_sentences, normalize_numbers,
                         strip_money)

MAX_SUMMARY_CHARS = 1200
MAX_TEXT_CHARS = 600

OUTPUT_SCHEMA = {
    "summary": "string, 1 to 3 sentences describing the agenda item",
    "key_facts": [{"text": "string", "evidence_ids": ["evidence id"]}],
    "concerns": [{"text": "string", "evidence_ids": ["evidence id, may be empty"]}],
    "anticipated_questions": [{
        "question": "string",
        "draft_response": "string, optional",
        "evidence_ids": ["evidence id, may be empty"],
        "confirm_with": ["department name, optional"],
    }],
    "talking_points": [{"text": "string", "evidence_ids": ["evidence id, may be empty"]}],
}


# --------------------------------------------------------------------------
# Evidence and prompt construction
# --------------------------------------------------------------------------

def build_evidence(item: AgendaItem, retrieved: Sequence[RetrievedPassage],
                   config: GenerationConfig) -> Tuple[List[Dict[str, Any]],
                                                      Dict[str, Citation], Dict[str, str]]:
    """Return (evidence list for the prompt, citations by id, full text by id)."""
    item_text = item.source_text[:3000]
    evidence = [{"id": "item", "title": f"Agenda item {item.item_number}: {item.title}",
                 "type": "agenda", "date": None, "location": "agenda item text",
                 "text": item_text}]
    citations: Dict[str, Citation] = {
        "item": Citation(citation_id="item", source_id=item.agenda_id,
                         source_title=f"Agenda item {item.item_number}: {item.title}",
                         source_location="agenda item text", excerpt=item_text[:300])}
    texts: Dict[str, str] = {"item": item_text}
    for r in list(retrieved)[: config.max_evidence_passages]:
        p = r.passage
        body = p.text[: config.max_passage_chars]
        evidence.append({"id": p.passage_id, "title": p.source_title, "type": p.source_type,
                         "date": p.source_date, "location": p.location,
                         "relevance": round(r.relevance, 2), "text": body})
        citations[p.passage_id] = Citation(
            citation_id=p.passage_id, source_id=p.source_id, source_title=p.source_title,
            source_location=p.location, excerpt=body[:300], source_date=p.source_date)
        texts[p.passage_id] = body
    return evidence, citations, texts


def build_request(item: AgendaItem, evidence: List[Dict[str, Any]],
                  priority: Optional[PriorityResult], config: GenerationConfig,
                  previous_error: Optional[str] = None) -> str:
    req: Dict[str, Any] = {
        "task": "briefing",
        "agenda_item": {"item_number": item.item_number, "title": item.title},
        "evidence": evidence,
        "max_questions": config.max_questions,
        "output_schema": OUTPUT_SCHEMA,
    }
    if priority is not None and priority.score is not None:
        req["preparation_priority"] = {
            "score_0_to_10": priority.score, "category": priority.category,
            "factors": [{"label": f.label, "explanation": f.explanation}
                        for f in priority.factors]}
    if previous_error:
        req["previous_attempt_error"] = previous_error
    return json.dumps(req, ensure_ascii=False)


# --------------------------------------------------------------------------
# Parsing and validation
# --------------------------------------------------------------------------

_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.I)


def parse_json_object(text: str) -> Dict[str, Any]:
    cleaned = _FENCE.sub("", text or "").strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        raise SchemaValidationError(f"Model output was not valid JSON ({e.msg}).")
    if not isinstance(data, dict):
        raise SchemaValidationError("Model output must be a JSON object.")
    return data


def _ids(raw: Any, allowed: set, where: str) -> List[str]:
    if raw is None:
        return []
    if not isinstance(raw, list) or not all(isinstance(x, str) for x in raw):
        raise SchemaValidationError(f"{where}: evidence_ids must be a list of strings.")
    unknown = [x for x in raw if x not in allowed]
    if unknown:
        raise SchemaValidationError(
            f"{where}: unknown evidence id(s) {unknown}. Cite only supplied ids.")
    return list(dict.fromkeys(raw))


def _text(raw: Any, where: str, limit: int = MAX_TEXT_CHARS) -> str:
    if not isinstance(raw, str) or not raw.strip():
        raise SchemaValidationError(f"{where}: expected non-empty text.")
    if len(raw) > limit:
        raise SchemaValidationError(f"{where}: text exceeds {limit} characters.")
    return raw.strip()


def figures_supported(claim_text: str, cited_text: str) -> bool:
    """True when every figure in the claim also appears in the cited evidence.

    Dollar amounts are compared by value (so '$2.5 million' matches '$2,500,000').
    Plain integers under 10 are ignored because they are usually counts or ordinals.
    """
    cited_money = extract_dollar_amounts(cited_text)
    for amount in extract_dollar_amounts(claim_text):
        if not any(abs(amount - c) <= max(1.0, 0.005 * c) for c in cited_money):
            return False
    plain = {n for n in normalize_numbers(strip_money(claim_text))
             if not (n.isdigit() and int(n) < 10)}
    return plain <= normalize_numbers(cited_text)


def _claims(raw: Any, where: str, allowed: set, texts: Dict[str, str],
            warnings: List[str], *, fact_section: bool) -> List[Claim]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise SchemaValidationError(f"{where}: expected a list.")
    claims: List[Claim] = []
    for i, entry in enumerate(raw):
        loc = f"{where}[{i}]"
        if isinstance(entry, str):
            entry = {"text": entry, "evidence_ids": []}
        if not isinstance(entry, dict):
            raise SchemaValidationError(f"{loc}: expected an object.")
        text = _text(entry.get("text"), loc)
        ids = _ids(entry.get("evidence_ids"), allowed, loc)
        if output_violation(text):
            warnings.append(f"Removed a statement in {where} that appeared to "
                            "recommend a vote or decision.")
            continue
        if not ids:
            support = "unsupported"
        else:
            cited_text = " ".join(texts[x] for x in ids)
            support = "supported" if figures_supported(text, cited_text) else "uncertain"
        kind = "fact" if (fact_section and support == "supported") else "interpretation"
        claims.append(Claim(text=text, citation_ids=ids, support=support, kind=kind))
    return claims


def _questions(raw: Any, allowed: set, texts: Dict[str, str], warnings: List[str],
               limit: int) -> List[AnticipatedQuestion]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise SchemaValidationError("anticipated_questions: expected a list.")
    out: List[AnticipatedQuestion] = []
    for i, entry in enumerate(raw[:limit]):
        loc = f"anticipated_questions[{i}]"
        if isinstance(entry, str):
            entry = {"question": entry}
        if not isinstance(entry, dict):
            raise SchemaValidationError(f"{loc}: expected an object.")
        question = _text(entry.get("question"), loc)
        ids = _ids(entry.get("evidence_ids"), allowed, loc)
        draft = entry.get("draft_response")
        confirm = entry.get("confirm_with") or []
        if not isinstance(confirm, list) or not all(isinstance(c, str) for c in confirm):
            raise SchemaValidationError(f"{loc}: confirm_with must be a list of strings.")
        if draft is not None:
            draft = _text(draft, f"{loc}.draft_response", limit=1000)
            if output_violation(draft):
                warnings.append("Removed a draft response that appeared to recommend a vote.")
                draft = None
        if draft is not None:
            unsupported = not ids or not figures_supported(
                draft, " ".join(texts[x] for x in ids))
            if (unsupported or confirm) and "[confirm" not in draft.lower():
                who = ", ".join(confirm) if confirm else "responsible department"
                draft = f"{draft} [confirm with {who}]"
                confirm = confirm or ["responsible department"]
        out.append(AnticipatedQuestion(question=question, draft_response=draft,
                                       citation_ids=ids, confirm_with=confirm))
    return out


def normalize_briefing(payload: Dict[str, Any], item: AgendaItem,
                       citations: Dict[str, Citation], texts: Dict[str, str],
                       config: GenerationConfig) -> Tuple[Dict[str, Any], List[str]]:
    """Validate and label a parsed payload. Raises SchemaValidationError if invalid."""
    allowed = set(citations)
    warnings: List[str] = []
    summary = payload.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise SchemaValidationError("summary: expected non-empty text.")
    if len(summary) > MAX_SUMMARY_CHARS:
        raise SchemaValidationError(f"summary: text exceeds {MAX_SUMMARY_CHARS} characters.")
    if output_violation(summary):
        warnings.append("The generated summary was replaced because it appeared to "
                        "recommend a vote or decision.")
        summary = first_sentences(item.source_text, 2, 500) or item.title
    parts = {
        "summary": summary.strip(),
        "key_facts": _claims(payload.get("key_facts"), "key_facts", allowed, texts,
                             warnings, fact_section=True),
        "concerns": _claims(payload.get("concerns"), "concerns", allowed, texts,
                            warnings, fact_section=False),
        "anticipated_questions": _questions(payload.get("anticipated_questions"), allowed,
                                            texts, warnings, config.max_questions),
        "talking_points": _claims(payload.get("talking_points"), "talking_points", allowed,
                                  texts, warnings, fact_section=False),
    }
    return parts, warnings


# --------------------------------------------------------------------------
# Public entry point
# --------------------------------------------------------------------------

def insufficient_briefing(item: AgendaItem, config: GenerationConfig,
                          priority: Optional[PriorityResult], revision: int = 1,
                          procedural: bool = False) -> Briefing:
    """REL-003: no usable evidence, so no generated claims. Shows only the agenda text."""
    _, citations, _ = build_evidence(item, [], config)
    return Briefing(
        briefing_id=str(uuid.uuid4()), item_id=item.item_id, revision=revision,
        status="draft", summary=first_sentences(item.source_text, 2, 500) or item.title,
        key_facts=[], concerns=[], anticipated_questions=[], talking_points=[],
        citations=[citations["item"]], model_id="none", prompt_version=config.prompt_version,
        configuration_version=priority.configuration_version if priority else "",
        source_ids=[item.agenda_id], incomplete=True,
        warnings=[("Procedural item: no preparation briefing or priority score is generated "
                   "for it." if procedural else
                   "Insufficient evidence: no approved source passages matched this item. "
                   "Facts, concerns, and anticipated questions were not generated. "
                   "Add approved sources or prepare this item manually.")])


def generate_briefing(item: AgendaItem, retrieved: Sequence[RetrievedPassage],
                      priority: Optional[PriorityResult], provider: LLMProvider,
                      config: GenerationConfig = DEFAULT_GENERATION_CONFIG, *,
                      revision: int = 1, procedural: bool = False,
                      sleep: Callable[[float], None] = time.sleep,
                      on_response: Optional[Callable[[ProviderResponse], None]] = None,
                      ) -> Briefing:
    """Generate one briefing. Raises a ProviderError subclass or DependencyUnavailable
    or RateLimited if every attempt fails; the caller decides how to degrade."""
    if not retrieved:
        return insufficient_briefing(item, config, priority, revision, procedural)

    evidence, citations, texts = build_evidence(item, retrieved, config)

    def validate(response: ProviderResponse):
        payload = parse_json_object(response.text)
        return normalize_briefing(payload, item, citations, texts, config)

    response, (parts, warnings) = call_with_retries(
        provider, system=config.system_instruction,
        build_user=lambda err: build_request(item, evidence, priority, config, err),
        validate=validate, temperature=config.temperature,
        max_retries=config.max_retries, sleep=sleep, on_response=on_response)

    used = set()
    for c in parts["key_facts"] + parts["concerns"] + parts["talking_points"]:
        used.update(c.citation_ids)
    for q in parts["anticipated_questions"]:
        used.update(q.citation_ids)
    used_citations = [citations[i] for i in sorted(used)]
    if not used_citations:
        warnings.append("No statement in this briefing cites an evidence passage.")
    return Briefing(
        briefing_id=str(uuid.uuid4()), item_id=item.item_id, revision=revision,
        status="draft", summary=parts["summary"], key_facts=parts["key_facts"],
        concerns=parts["concerns"], anticipated_questions=parts["anticipated_questions"],
        talking_points=parts["talking_points"], citations=used_citations,
        model_id=response.model_id, prompt_version=config.prompt_version,
        configuration_version=priority.configuration_version if priority else "",
        source_ids=sorted({c.source_id for c in used_citations}),
        incomplete=False, warnings=warnings)
