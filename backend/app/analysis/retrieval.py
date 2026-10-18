"""Approved-source passage retrieval (FSR SRC-005, SRC-006, SRC-007).

The default ranker is BM25 implemented with the standard library, so the module
runs anywhere with no installs. A semantic embedding model can be added later
through the :class:`Embedder` protocol (ICD-TBD-04) without changing callers.

Approval is checked at query time, not index time, so toggling a source's
``approved`` flag takes effect immediately without re-indexing.
"""

from __future__ import annotations

import math
from collections import Counter
from typing import Dict, Iterable, List, Optional, Protocol, Sequence

from .chunking import chunk_source
from .models import Passage, RetrievedPassage, SourceRecord
from .text_utils import tokenize


class Embedder(Protocol):
    """Optional semantic model adapter. Returns one vector per input text."""

    def embed(self, texts: Sequence[str]) -> List[List[float]]: ...


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


class Retriever:
    K1 = 1.5
    B = 0.75

    def __init__(self, *, embedder: Optional[Embedder] = None,
                 max_passage_words: int = 120, semantic_weight: float = 0.5):
        self._sources: Dict[str, SourceRecord] = {}
        self._passages: List[Passage] = []
        self._tokens: List[List[str]] = []
        self._tf: List[Counter] = []
        self._df: Counter = Counter()
        self._avgdl = 0.0
        self._vectors: List[List[float]] = []
        self._embedder = embedder
        self._max_words = max_passage_words
        self._semantic_weight = semantic_weight
        self._dirty = False

    # -- indexing ---------------------------------------------------------

    def add_source(self, source: SourceRecord) -> int:
        """Index (or re-index) a source. Returns the number of passages."""
        self.remove_source(source.source_id)
        self._sources[source.source_id] = source
        new = chunk_source(source, max_words=self._max_words)
        self._passages.extend(new)
        self._dirty = True
        return len(new)

    def remove_source(self, source_id: str) -> None:
        if source_id in self._sources:
            del self._sources[source_id]
            self._passages = [p for p in self._passages if p.source_id != source_id]
            self._dirty = True

    def set_approved(self, source_id: str, approved: bool) -> None:
        self._sources[source_id].approved = approved

    def get_source(self, source_id: str) -> Optional[SourceRecord]:
        return self._sources.get(source_id)

    def sources(self) -> List[SourceRecord]:
        return [self._sources[k] for k in sorted(self._sources)]

    def passages_for(self, source_id: str) -> List[Passage]:
        return [p for p in self._passages if p.source_id == source_id]

    def _rebuild(self) -> None:
        self._tokens = [tokenize(p.text) for p in self._passages]
        self._tf = [Counter(t) for t in self._tokens]
        self._df = Counter()
        for tf in self._tf:
            self._df.update(tf.keys())
        total = sum(len(t) for t in self._tokens)
        self._avgdl = total / len(self._tokens) if self._tokens else 0.0
        if self._embedder and self._passages:
            self._vectors = self._embedder.embed([p.text for p in self._passages])
        else:
            self._vectors = []
        self._dirty = False

    def _idf(self, term: str) -> float:
        n = len(self._passages)
        df = self._df.get(term, 0)
        return math.log(1 + (n - df + 0.5) / (df + 0.5))

    # -- query ------------------------------------------------------------

    def _query_terms(self, query: str, max_terms: int) -> List[str]:
        counts = Counter(tokenize(query))
        scored = [(self._idf(t) * (1 + math.log(c)), t) for t, c in counts.items()
                  if t in self._df]
        scored.sort(key=lambda x: (-x[0], x[1]))
        return [t for _, t in scored[:max_terms]]

    def search(self, query: str, *, top_k: int = 5,
               source_ids: Optional[Iterable[str]] = None,
               source_types: Optional[Iterable[str]] = None,
               min_relevance: float = 0.0, max_query_terms: int = 20,
               min_matched_terms: int = 1) -> List[RetrievedPassage]:
        """Rank approved passages for ``query``.

        ``relevance`` is the idf-weighted share of the query's salient terms that
        a passage covers (0 to 1). Passages below ``min_relevance`` are dropped,
        which is what lets callers detect insufficient evidence.
        """
        if self._dirty:
            self._rebuild()
        if not self._passages:
            return []
        allowed = set(source_ids) if source_ids is not None else None
        types = set(source_types) if source_types is not None else None
        terms = self._query_terms(query, max_query_terms)
        if not terms:
            return []
        idf = {t: self._idf(t) for t in terms}
        total_idf = sum(idf.values()) or 1.0

        query_vec: List[float] = []
        if self._embedder and self._vectors:
            query_vec = self._embedder.embed([query])[0]

        scored = []
        for i, passage in enumerate(self._passages):
            source = self._sources[passage.source_id]
            if not source.approved:                      # SRC-007
                continue
            if allowed is not None and passage.source_id not in allowed:
                continue
            if types is not None and passage.source_type not in types:
                continue
            tf = self._tf[i]
            dl = len(self._tokens[i]) or 1
            bm25 = 0.0
            matched = 0
            matched_idf = 0.0
            for t in terms:
                f = tf.get(t, 0)
                if not f:
                    continue
                matched += 1
                matched_idf += idf[t]
                denom = f + self.K1 * (1 - self.B + self.B * dl / (self._avgdl or 1))
                bm25 += idf[t] * f * (self.K1 + 1) / denom
            coverage = matched_idf / total_idf
            cosine = max(_cosine(query_vec, self._vectors[i]), 0.0) if query_vec else 0.0
            if matched < min_matched_terms and cosine == 0.0:
                continue
            scored.append((bm25, coverage, cosine, passage))

        if not scored:
            return []
        max_bm25 = max(s[0] for s in scored) or 1.0
        results = []
        for bm25, coverage, cosine, passage in scored:
            if query_vec:
                w = self._semantic_weight
                rank_score = (1 - w) * (bm25 / max_bm25) + w * cosine
                relevance = (1 - w) * coverage + w * cosine
            else:
                rank_score = bm25
                relevance = coverage
            if relevance < min_relevance:
                continue
            results.append((rank_score, passage.passage_id, relevance, passage))
        results.sort(key=lambda r: (-r[0], r[1]))                # deterministic
        return [RetrievedPassage(passage=p, relevance=round(rel, 4))
                for _, _, rel, p in results[:top_k]]
