"""Demo for step 3 (briefing + guardrails). Run from backend/:
    python3 -m demos.demo_03_briefing_guardrails
Uses the offline rule-based provider (NOT an AI) plus a scripted provider that tries to
slip in a vote recommendation.
"""
import json

from app.analysis.briefing import generate_briefing
from app.analysis.guardrails import output_violation, request_violation
from app.analysis.llm_client import OfflineExtractiveProvider, ProviderResponse
from app.analysis.scoring import compute_priority

from ._common import evidence_for, heading, item, retriever_with_samples


class SneakyProvider:
    """Pretends to be a model that slips in a vote recommendation."""
    model_id = "scripted-demo"

    def complete_json(self, *, system, user, temperature=0.2):
        payload = {
            "summary": "A construction contract for the Eastside drainage project.",
            "key_facts": [{"text": "The revised estimate is $12.8 million.", "evidence_ids": ["item"]},
                          {"text": "Council should vote yes on this contract.", "evidence_ids": []}],
            "concerns": [], "anticipated_questions": [], "talking_points": []}
        return ProviderResponse(text=json.dumps(payload), model_id=self.model_id,
                                request_id="demo", usage={})


def show(b):
    print(f"  status: {b.status}   incomplete: {b.incomplete}")
    print(f"  summary: {b.summary[:150]}")
    for c in b.key_facts:
        print(f"  fact [{c.support}/{c.kind}] {c.text[:140]}")
    for q in b.anticipated_questions[:2]:
        print(f"  anticipated question: {q.question[:120]}")
    for w in b.warnings:
        print(f"  WARNING: {w}")


def main() -> None:
    r = retriever_with_samples()
    it = item("4.4")
    ev = evidence_for(r, it)
    pri = compute_priority(it, ev)

    heading("1. Draft briefing for item 4.4 (offline stand-in provider)")
    show(generate_briefing(it, ev, pri, OfflineExtractiveProvider()))

    heading("2. A model tries to recommend a vote -> the statement is removed")
    show(generate_briefing(it, ev, pri, SneakyProvider()))

    heading("3. No usable evidence -> no invented facts")
    show(generate_briefing(item("4.3"), [], None, OfflineExtractiveProvider()))

    heading("4. Request guardrail")
    for q in ("How should I vote on the drainage contract?", "Write a press release about the rezoning",
              "What did residents say about the rezoning last time?"):
        print(f"  {q!r:<62} -> {'REFUSED' if request_violation(q) else 'allowed'}")
    print(f"  output filter on 'Staff recommends voting yes.' -> {output_violation('Staff recommends voting yes.')}")
    print("\n(Briefings are always 'draft'. Approval is a human action.)")


if __name__ == "__main__":
    main()
