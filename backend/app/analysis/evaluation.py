"""Evaluation helpers for the AI and Analytics subsystem.

These functions measure the things the FSR and Validation Plan ask the team to
prove. They return plain dictionaries so results can be pasted into the validation
evidence file (FSR SUP-006).

Important limits: the grounding check here is a cheap automatic proxy (word
overlap). It does not replace the human reviewer audit of citations. The rank
correlation is only meaningful with real past meetings and honest sample sizes.
"""

from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Sequence, Tuple

from .config import DEFAULT_SCORE_CONFIG, ScoreConfig
from .models import AgendaItem, Briefing, RetrievedPassage
from .retrieval import Retriever
from .scoring import compute_priority
from .text_utils import tokenize


# -- PER-002: agenda parsing precision and recall ------------------------------

def _norm_item(number: str, title: str) -> Tuple[str, str]:
    return (number.strip().rstrip(".").lower(), " ".join(title.lower().split()))


def parser_precision_recall(expected: Iterable[Tuple[str, str]],
                            extracted: Iterable[Tuple[str, str]]) -> Dict[str, float]:
    """Compare (item_number, title) pairs from a hand-labeled key and the parser."""
    exp = {_norm_item(*e) for e in expected}
    got = {_norm_item(*e) for e in extracted}
    tp = len(exp & got)
    precision = tp / len(got) if got else 0.0
    recall = tp / len(exp) if exp else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if precision + recall else 0.0
    return {"true_positives": tp, "expected": len(exp), "extracted": len(got),
            "precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4)}


# -- PER-005: citation labeling and grounding ----------------------------------

def citation_coverage(briefings: Sequence[Briefing]) -> Dict[str, Any]:
    """Share of key facts that carry a citation or an explicit support label.

    Every key fact leaves the generator with a ``support`` label, so labeling
    coverage should be 1.0. The more informative number is ``supported_share``:
    the fraction of key facts that are cited and whose figures match the cited text.
    """
    facts = [c for b in briefings for c in b.key_facts]
    if not facts:
        return {"key_facts": 0, "labeled_share": None, "supported_share": None}
    labeled = [f for f in facts if f.citation_ids or f.support in ("unsupported", "uncertain")]
    supported = [f for f in facts if f.support == "supported"]
    return {"key_facts": len(facts),
            "labeled_share": round(len(labeled) / len(facts), 4),
            "supported_share": round(len(supported) / len(facts), 4),
            "unsupported": sum(f.support == "unsupported" for f in facts),
            "uncertain": sum(f.support == "uncertain" for f in facts)}


def grounding_overlap_proxy(briefing: Briefing, min_overlap: float = 0.5) -> Dict[str, Any]:
    """Automatic proxy for the grounding audit: for each cited key fact, what share
    of its content words appear in the cited excerpts? NOT a substitute for review."""
    excerpts = {c.citation_id: c.excerpt for c in briefing.citations}
    checked = passed = 0
    for fact in briefing.key_facts:
        if not fact.citation_ids:
            continue
        words = set(tokenize(fact.text))
        if not words:
            continue
        cited_words = set()
        for cid in fact.citation_ids:
            cited_words |= set(tokenize(excerpts.get(cid, "")))
        checked += 1
        if len(words & cited_words) / len(words) >= min_overlap:
            passed += 1
    return {"checked": checked, "passed": passed,
            "share": round(passed / checked, 4) if checked else None}


# -- PER-006: score repeatability --------------------------------------------

def score_repeatability(item: AgendaItem, evidence: Sequence[RetrievedPassage],
                        config: ScoreConfig = DEFAULT_SCORE_CONFIG, runs: int = 5) -> Dict[str, Any]:
    results = [compute_priority(item, evidence, config) for _ in range(runs)]
    signatures = {(r.score, r.category, tuple((f.key, f.raw_value, f.contribution)
                                              for f in r.factors)) for r in results}
    return {"runs": runs, "identical": len(signatures) == 1, "score": results[0].score}


# -- Retrieval quality -----------------------------------------------------------

def retrieval_hit_rate(retriever: Retriever, cases: Sequence[Dict[str, Any]], *,
                       k: int = 5, min_relevance: float = 0.0) -> Dict[str, Any]:
    """``cases``: [{"query": str, "relevant_source_ids": [..]}]. A case is a hit when
    any relevant source appears in the top ``k`` approved passages."""
    hits = 0
    for case in cases:
        results = retriever.search(case["query"], top_k=k, min_relevance=min_relevance)
        found = {r.passage.source_id for r in results}
        if found & set(case["relevant_source_ids"]):
            hits += 1
    return {"cases": len(cases), "hits": hits,
            "hit_rate": round(hits / len(cases), 4) if cases else None, "k": k}


# -- Indicator validity -------------------------------------------------------

def _average_ranks(values: Sequence[float]) -> List[float]:
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[order[k]] = avg
        i = j + 1
    return ranks


def spearman(x: Sequence[float], y: Sequence[float]) -> float:
    """Spearman rank correlation (ties get average ranks). Returns nan if undefined."""
    if len(x) != len(y) or len(x) < 3:
        return float("nan")
    rx, ry = _average_ranks(x), _average_ranks(y)
    mx, my = sum(rx) / len(rx), sum(ry) / len(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = math.sqrt(sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry))
    return num / den if den else float("nan")


def indicator_validity(scores: Sequence[float], observed_attention: Sequence[float]) -> Dict[str, Any]:
    """Compare scores with observed attention (speaker sign-ups, comment counts,
    discussion length). Report the sample size next to the correlation."""
    rho = spearman(scores, observed_attention)
    return {"n": len(scores), "spearman": None if math.isnan(rho) else round(rho, 4)}
