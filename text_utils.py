"""Small text helpers shared by retrieval, scoring, and validation (stdlib only)."""

from __future__ import annotations

import hashlib
import re
from typing import Iterable, List

_WORD = re.compile(r"[a-z0-9][a-z0-9'\-]*")

STOPWORDS = frozenset(
    """a about above after again all also am an and any are as at be because been
    before being below between both but by can could did do does doing down during
    each few for from further had has have having he her here hers him his how i if
    in into is it its itself just me more most my no nor not of off on once only or
    other our out over own same she should so some such than that the their them
    then there these they this those through to too under until up very was we were
    what when where which while who whom why will with would you your""".split()
)


# Light domain normalization for the LEXICAL retriever. Keys are the stemmed forms
# produced by _stem(); values are the shared root. This only exists because plain
# word matching cannot tell that "rezone" and "zoning" or "developer" and
# "development" are related. A semantic embedding model (ICD-TBD-04) makes it
# unnecessary, at which point this table can be deleted. Extend it when retrieval
# tests show a missed match, and keep each entry to words that truly share a meaning.
ALIASES = {
    "rezon": "zon", "rezone": "zon",
    "developer": "develop", "development": "develop", "developed": "develop",
    "contractor": "contract", "contracted": "contract",
    "approve": "approv", "approval": "approv",
    "opposition": "oppos", "oppose": "oppos",
    "construction": "construct", "objection": "object",
    "annexation": "annex", "demolition": "demolish",
}


def tokenize(text: str, *, drop_stopwords: bool = True) -> List[str]:
    tokens = _WORD.findall(text.lower())
    if drop_stopwords:
        tokens = [t for t in tokens if t not in STOPWORDS]
    stems = [_stem(t) for t in tokens]
    return [ALIASES.get(s, s) for s in stems]


def _stem(token: str) -> str:
    """Very light suffix stripping so 'contracts' matches 'contract'."""
    for suffix in ("ing", "ed", "es", "s"):
        if len(token) > len(suffix) + 3 and token.endswith(suffix):
            return token[: -len(suffix)]
    return token


def checksum(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


_MONEY = re.compile(
    r"\$\s?(\d[\d,]*(?:\.\d+)?)\s*(million|billion|thousand|[mbk])?\b", re.IGNORECASE
)
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def extract_dollar_amounts(text: str) -> List[float]:
    """Return dollar amounts found in text as floats (e.g. '$2.5 million' -> 2500000)."""
    out: List[float] = []
    for m in _MONEY.finditer(text):
        value = float(m.group(1).replace(",", ""))
        unit = (m.group(2) or "").lower()
        if unit in ("million", "m"):
            value *= 1_000_000
        elif unit in ("billion", "b"):
            value *= 1_000_000_000
        elif unit in ("thousand", "k"):
            value *= 1_000
        out.append(value)
    return out


def strip_money(text: str) -> str:
    """Remove dollar amounts so plain-number checks do not double count them."""
    return _MONEY.sub(" ", text)


_SENT_END = re.compile(r"(?<=[.!?])\s+")


def first_sentences(text: str, n: int = 1, limit: int = 300, min_words: int = 4) -> str:
    """First ``n`` sentences of text, whitespace-normalized and capped at ``limit``."""
    sentences = [s.strip() for s in _SENT_END.split(" ".join(text.split())) if s.strip()]
    # Skip fragments such as "Item 6." that are not real sentences.
    full = [s for s in sentences if len(s.split()) >= min_words]
    return " ".join((full or sentences)[:n])[:limit]


def normalize_numbers(text: str) -> set:
    """Set of numeric strings with commas removed, used to check that figures in a
    generated statement also appear in the cited source text."""
    return {n.replace(",", "").rstrip(".") for n in _NUMBER.findall(text)}


def contains_any(text: str, phrases: Iterable[str]) -> int:
    """Count how many distinct phrases occur in text (case-insensitive)."""
    lowered = text.lower()
    return sum(1 for p in phrases if p in lowered)
