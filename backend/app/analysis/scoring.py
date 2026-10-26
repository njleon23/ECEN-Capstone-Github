"""Explainable 0-10 preparation-priority score (FSR ANA-004 to ANA-007, PER-006).

The score is a weighted sum of four named factors. It is deliberately simple and
fully reproducible: given the same item, the same retrieved evidence, and the
same configuration version, it returns exactly the same result.

IMPORTANT: this is a *preparation priority*, not a prediction of public reaction.
The factor definitions are proposed assumptions pending validation (see config.py).
"""

from __future__ import annotations

import math
import re
from typing import Dict, List, Sequence

from .config import DEFAULT_SCORE_CONFIG, ScoreConfig
from .errors import InvalidRequest
from .models import AgendaItem, Factor, PriorityResult, RetrievedPassage, utc_now
from .text_utils import contains_any, extract_dollar_amounts


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def category_for(score: float, config: ScoreConfig) -> str:
    if score < config.low_max:
        return "Low"
    if score < config.moderate_max:
        return "Moderate"
    return "High"


def _usable(evidence: Sequence[RetrievedPassage], config: ScoreConfig) -> List[RetrievedPassage]:
    return [e for e in evidence if e.relevance >= config.min_relevance]


def evidence_level(evidence: Sequence[RetrievedPassage], config: ScoreConfig) -> str:
    usable = _usable(evidence, config)
    if not usable:
        return "insufficient"
    sources = {e.passage.source_id for e in usable}
    if len(usable) >= config.strong_passages and len(sources) >= config.strong_sources:
        return "strong"
    return "limited"


# -- individual factors ----------------------------------------------------

def _cost_exposure(item: AgendaItem, evidence: Sequence[RetrievedPassage],
                   config: ScoreConfig) -> Factor:
    text = f"{item.title}\n{item.source_text}"
    amounts = extract_dollar_amounts(text)
    cited: List[str] = []
    growth_hit = contains_any(text, config.cost_growth_terms) > 0
    for e in evidence:
        if e.relevance < max(config.cost_min_relevance, config.min_relevance):
            continue
        p = e.passage
        if p.source_type in config.cost_types:
            found = extract_dollar_amounts(p.text)
            if found:
                amounts.extend(found)
                cited.append(p.source_id)
        if contains_any(p.text, config.cost_growth_terms):
            growth_hit = True
            cited.append(p.source_id)
    if amounts:
        top = max(amounts)
        span = math.log10(config.cost_ceiling) - math.log10(config.cost_floor)
        base = _clamp((math.log10(max(top, 1.0)) - math.log10(config.cost_floor)) / span)
        expl = f"Largest dollar amount found: ${top:,.0f}."
    else:
        base, expl = 0.0, "No dollar amounts found in the item or its cost records."
    raw = _clamp(base + (config.cost_growth_bonus if growth_hit else 0.0))
    if growth_hit:
        expl += " Evidence mentions cost growth, change orders, or overruns."
    return _make_factor("cost_exposure", "Cost exposure", expl, raw, config, cited)


def _historical_opposition(evidence: Sequence[RetrievedPassage],
                           config: ScoreConfig) -> Factor:
    weighted, cited = 0.0, []
    n = 0
    for e in _usable(evidence, config):
        p = e.passage
        if p.source_type not in config.history_types:
            continue
        n += 1
        hits = contains_any(p.text, config.opposition_terms)
        if hits:
            weighted += e.relevance * min(hits, 3) / 3
            cited.append(p.source_id)
    raw = _clamp(weighted / 1.5)
    if n == 0:
        expl = "No related prior minutes or transcripts were retrieved."
    elif cited:
        expl = (f"{len(set(cited))} related prior record(s) mention opposition, "
                "concerns, or delays.")
    else:
        expl = "Related prior records were found with no sign of opposition."
    return _make_factor("historical_opposition", "Opposition in similar past items",
                        expl, raw, config, cited)


def _public_discussion(evidence: Sequence[RetrievedPassage], config: ScoreConfig) -> Factor:
    relevant = [e for e in _usable(evidence, config)
                if e.passage.source_type in config.discussion_types]
    if not relevant:
        return _make_factor(
            "public_discussion", "Public discussion",
            "No approved public discussion, comments, surveys, or news were retrieved.",
            0.0, config, [])
    volume = _clamp(len(relevant) / 4)
    intensity = sum(min(contains_any(e.passage.text, config.opposition_terms), 3) / 3
                    for e in relevant) / len(relevant)
    raw = _clamp(0.6 * volume + 0.4 * intensity)
    cited = [e.passage.source_id for e in relevant]
    expl = (f"{len(relevant)} relevant public-discussion passage(s); "
            f"average intensity {intensity:.2f} on a 0 to 1 scale.")
    return _make_factor("public_discussion", "Public discussion", expl, raw, config, cited)


def _topic_sensitivity(item: AgendaItem, config: ScoreConfig) -> Factor:
    text = f"{item.title}\n{item.source_text}".lower()
    matched = {t: w for t, w in config.sensitive_topics.items() if t in text}
    total = sum(matched.values())
    raw = _clamp(total / config.sensitivity_full_at)
    if matched:
        names = ", ".join(sorted(matched))
        expl = f"Item text touches topics that often draw public attention: {names}."
    else:
        expl = "No topics from the sensitivity word list appear in the item text."
    return _make_factor("topic_sensitivity", "Topic sensitivity", expl, raw, config, [])


def _make_factor(key: str, label: str, explanation: str, raw: float,
                 config: ScoreConfig, cited: List[str]) -> Factor:
    weight = config.weights[key]
    return Factor(
        key=key, label=label, explanation=explanation,
        raw_value=round(raw, 3), weight=weight,
        contribution=round(weight * raw * 10, 2),
        citations=sorted(set(cited)),
    )


# -- public API ------------------------------------------------------------

def compute_priority(item: AgendaItem, evidence: Sequence[RetrievedPassage],
                     config: ScoreConfig = DEFAULT_SCORE_CONFIG) -> PriorityResult:
    """Score one item. Pure function: no I/O, no randomness, no clock in the math."""
    if abs(sum(config.weights.values()) - 1.0) > 1e-9:
        raise InvalidRequest("Score factor weights must sum to 1.0.")
    level = evidence_level(evidence, config)
    factors = [
        _cost_exposure(item, evidence, config),
        _historical_opposition(evidence, config),
        _public_discussion(evidence, config),
        _topic_sensitivity(item, config),
    ]
    if level == "insufficient":
        # REL-003: suppress the score instead of presenting weak evidence as fact.
        return PriorityResult(
            item_id=item.item_id, score=None, category=None,
            configuration_version=config.version, factors=factors,
            evidence_level=level, incomplete=True, computed_at=utc_now())
    score = round(sum(f.contribution for f in factors), 1)
    score = _clamp(score, 0.0, 10.0)
    return PriorityResult(
        item_id=item.item_id, score=score, category=category_for(score, config),
        configuration_version=config.version, factors=factors,
        evidence_level=level, incomplete=False, computed_at=utc_now())


def apply_manual_adjustment(result: PriorityResult, *, factor_key: str,
                            new_raw_value: float, reason: str, reviewer_id: str,
                            config: ScoreConfig = DEFAULT_SCORE_CONFIG) -> PriorityResult:
    """Reviewer override of one factor (FSR ANA-007). A reason is mandatory."""
    if not reason or not reason.strip():
        raise InvalidRequest("A reason is required to adjust a priority factor.")
    if not 0.0 <= new_raw_value <= 1.0:
        raise InvalidRequest("Adjusted factor value must be between 0 and 1.")
    if result.score is None:
        raise InvalidRequest("Cannot adjust a suppressed score; add approved evidence first.")
    factors: List[Factor] = []
    old = None
    for f in result.factors:
        if f.key == factor_key:
            old = f.raw_value
            factors.append(Factor(
                key=f.key, label=f.label, explanation=f"{f.explanation} (adjusted by reviewer)",
                raw_value=round(new_raw_value, 3), weight=f.weight,
                contribution=round(f.weight * new_raw_value * 10, 2),
                citations=list(f.citations)))
        else:
            factors.append(f)
    if old is None:
        raise InvalidRequest(f"Unknown factor '{factor_key}'.")
    score = _clamp(round(sum(f.contribution for f in factors), 1), 0.0, 10.0)
    return PriorityResult(
        item_id=result.item_id, score=score, category=category_for(score, config),
        configuration_version=result.configuration_version, factors=factors,
        evidence_level=result.evidence_level, incomplete=result.incomplete,
        manual_adjustment={
            "reviewer_id": reviewer_id, "factor_key": factor_key,
            "old_value": old, "new_value": round(new_raw_value, 3),
            "reason": reason.strip(), "time": utc_now()},
        computed_at=result.computed_at)


def is_procedural(item: AgendaItem, config: ScoreConfig = DEFAULT_SCORE_CONFIG) -> bool:
    """True for items such as 'Adjourn' or 'Approval of Minutes' that are not prepared."""
    return any(re.search(p, item.title, re.I) for p in config.procedural_title_patterns)


def gather_evidence(retriever, item: AgendaItem, config: ScoreConfig = DEFAULT_SCORE_CONFIG,
                    source_ids=None) -> List[RetrievedPassage]:
    """Evidence used for scoring and briefing. Procedural items get none."""
    if is_procedural(item, config):
        return []
    return retriever.search(retrieval_query_for(item), top_k=config.top_k,
                            source_ids=source_ids, min_relevance=config.min_relevance,
                            min_matched_terms=config.min_matched_terms)


def retrieval_query_for(item: AgendaItem, max_chars: int = 1200) -> str:
    """Query text used to find evidence for an item: the title (repeated for
    emphasis) followed by the start of the item text."""
    body = item.source_text[:max_chars]
    return f"{item.title}. {item.title}. {body}"
