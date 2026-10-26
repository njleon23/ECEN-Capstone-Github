"""Advisory-only guardrails (FSR ANA-009, REV-008).

The system must not recommend a vote, state a final policy decision, or draft an
unapproved public statement. These checks are simple pattern rules that run on
BOTH the incoming question and the generated text. They are a safety net, not a
guarantee; the prompt instructions and mandatory human review are the primary
controls. Expect some misses and some false positives, and extend the lists as
real use shows gaps.
"""

from __future__ import annotations

import re
from typing import Optional

_VOTE_WORDS = r"(?:vote|approve|approval|reject|deny|oppose|support|pass|table|veto)"

_REQUEST_PATTERNS = [
    re.compile(rf"\bhow\s+(?:should|do\s+you\s+think|would\s+you)\s+(?:i|we|council|the\s+council|they|he|she|\w+)\s+{_VOTE_WORDS}", re.I),
    re.compile(rf"\bshould\s+(?:i|we|council|the\s+council|they|\w+)\s+{_VOTE_WORDS}", re.I),
    re.compile(r"\bhow\s+should\s+(?:i|we)\s+vote\b", re.I),
    re.compile(r"\brecommend\b.{0,40}\bvote\b|\bvote\b.{0,30}\brecommend", re.I),
    re.compile(r"\bwhich\s+way\s+should\b.{0,30}\bvote\b", re.I),
    re.compile(r"\b(?:write|draft|compose|prepare|publish|post|send)\b.{0,30}"
               r"\b(?:press\s+release|public\s+statement|statement\s+to\s+(?:the\s+)?(?:press|public|residents)|"
               r"tweet|social\s+media\s+post|announcement)\b", re.I),
]

_OUTPUT_WORDS = r"(?:vote|approve|reject|deny|veto)"

_OUTPUT_PATTERNS = [
    re.compile(rf"\b(?:should|must|ought\s+to|is\s+advised\s+to)\s+(?:\w+\s+){{0,3}}{_OUTPUT_WORDS}\b", re.I),
    # Present tense only, so historical facts such as "staff recommended denial in
    # 2024" are still allowed.
    re.compile(r"\b(?:we|i|staff|council|the\s+city|this\s+briefing)\s+recommends?\b"
               r".{0,60}\b(?:approv|reject|den(?:y|ial)|vot|veto)", re.I),
    re.compile(r"\bvot(?:e|ing)\s+(?:yes|no|for|against|in\s+favor)\b", re.I),
]

REFUSAL_MESSAGE = (
    "This tool prepares briefing material only. It does not recommend how to vote, "
    "make policy decisions, or draft public statements. I can summarize the evidence "
    "and the likely public questions for this item instead."
)


def request_violation(question: str) -> Optional[str]:
    """Return a refusal message if the request asks for a prohibited output."""
    for pattern in _REQUEST_PATTERNS:
        if pattern.search(question):
            return REFUSAL_MESSAGE
    return None


def output_violation(text: str) -> bool:
    """True if generated text appears to recommend a vote or decision."""
    return any(p.search(text) for p in _OUTPUT_PATTERNS)
