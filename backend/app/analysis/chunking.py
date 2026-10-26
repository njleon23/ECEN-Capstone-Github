"""Split approved source text into retrievable passages (FSR SRC-004).

Neighbouring paragraphs are packed together up to ``max_words`` so that a passage
keeps enough context to be matched (for example, a hearing's topic and the public
reaction recorded in the next paragraph). Each passage keeps its source and a
human-readable location so a reviewer can find the evidence again (FSR SRC-006).
Page breaks are detected from form-feed characters, which PDF text extractors such
as ``pdftotext`` emit between pages.
"""

from __future__ import annotations

import re
from typing import List, Tuple

from .models import Passage, SourceRecord
from .text_utils import checksum

_PARA_SPLIT = re.compile(r"\n\s*\n")
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")


def _split_long(paragraph: str, max_words: int) -> List[str]:
    """Break an over-long paragraph on sentence boundaries, then on word count."""
    if len(paragraph.split()) <= max_words:
        return [paragraph.strip()]
    pieces: List[str] = []
    current: List[str] = []
    count = 0
    for sentence in _SENT_SPLIT.split(paragraph):
        n = len(sentence.split())
        if n > max_words:  # a single run-on sentence: hard split by words
            if current:
                pieces.append(" ".join(current))
                current, count = [], 0
            w = sentence.split()
            for i in range(0, len(w), max_words):
                pieces.append(" ".join(w[i:i + max_words]))
            continue
        if count + n > max_words and current:
            pieces.append(" ".join(current))
            current, count = [], 0
        current.append(sentence)
        count += n
    if current:
        pieces.append(" ".join(current))
    return [p.strip() for p in pieces if p.strip()]


def _location(page_no: int, multi_page: bool, first: int, last: int) -> str:
    para = f"paragraph {first}" if first == last else f"paragraphs {first}-{last}"
    return f"page {page_no}, {para}" if multi_page else para


def chunk_source(source: SourceRecord, *, max_words: int = 120) -> List[Passage]:
    """Return passages for one source, in document order."""
    passages: List[Passage] = []
    pages = source.text.split("\f") if "\f" in source.text else [source.text]
    multi = len(pages) > 1
    index = 0

    def emit(text: str, page_no: int, first: int, last: int) -> None:
        nonlocal index
        index += 1
        passages.append(Passage(
            passage_id=f"{source.source_id}:p{index}", source_id=source.source_id,
            source_title=source.title, source_type=source.source_type,
            source_date=source.source_date, location=_location(page_no, multi, first, last),
            text=text, checksum=checksum(text)))

    for page_no, page in enumerate(pages, start=1):
        paragraphs = [p.strip() for p in _PARA_SPLIT.split(page) if p.strip()]
        buf: List[Tuple[int, str]] = []
        buf_words = 0

        def flush() -> None:
            nonlocal buf, buf_words
            if buf:
                emit("\n".join(p for _, p in buf), page_no, buf[0][0], buf[-1][0])
            buf, buf_words = [], 0

        for n, para in enumerate(paragraphs, start=1):
            words = len(para.split())
            if words > max_words:
                flush()
                for piece in _split_long(para, max_words):
                    emit(piece, page_no, n, n)
                continue
            if buf and buf_words + words > max_words:
                flush()
            buf.append((n, para))
            buf_words += words
        flush()
    return passages
