"""Demo runner: ``python -m app.analysis [--agenda FILE] [--live] [--json]``.

Parses an agenda with the backend's own parser (default: the fictional sample agenda in
council-brief/examples), then runs every item through retrieval, scoring, and briefing
using the FICTIONAL supporting sources in demo_sources.py.
By default it uses the offline extractive provider (no network, no cost). With
``--live`` it calls the OpenAI-compatible provider configured by the environment
variables LLM_API_KEY, LLM_BASE_URL, and LLM_MODEL.
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from .llm_client import OfflineExtractiveProvider, OpenAICompatibleProvider
from .pipeline import AnalysisPipeline, InMemoryAudit
from .retrieval import Retriever
from .followup import format_citation
from pathlib import Path

from .demo_sources import demo_sources


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="app.analysis")
    default_agenda = (Path(__file__).resolve().parents[3] / "council-brief" / "examples"
                      / "Sample_City_Council_Agenda_2026-10-08.txt")
    ap.add_argument("--agenda", type=Path, default=default_agenda,
                    help="agenda file (.txt, .md, .pdf); default is the fictional sample")
    ap.add_argument("--live", action="store_true", help="use the configured LLM provider")
    ap.add_argument("--json", action="store_true", help="print full JSON results")
    args = ap.parse_args(argv)

    if args.live:
        provider = OpenAICompatibleProvider(
            base_url=os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1"),
            model=os.environ.get("LLM_MODEL", "gpt-4o-mini"))
    else:
        provider = OfflineExtractiveProvider()

    retriever = Retriever()
    for s in demo_sources():
        retriever.add_source(s)
    audit = InMemoryAudit()
    pipeline = AnalysisPipeline(retriever, provider, audit=audit)

    from app.services.agenda_parser import extract_text, parse_agenda_items
    text = extract_text(args.agenda.name, args.agenda.read_bytes())
    items = parse_agenda_items(text, "demo-agenda")
    results = []
    for item in items:
        job = pipeline.start(item, idempotency_key=f"demo-{item.item_id}")
        results.append(job)
        if args.json:
            continue
        p = job.priority
        score = "suppressed" if p is None or p.score is None else f"{p.score:.1f}/10 ({p.category})"
        print(f"\nItem {item.item_number}: {item.title}")
        print(f"  job: {job.state}   priority: {score}   evidence: {p.evidence_level if p else '-'}")
        if p and p.score is not None:
            for f in p.factors:
                print(f"    - {f.label}: +{f.contribution:.2f}  ({f.explanation})")
        b = job.briefing
        if b:
            print(f"  summary: {b.summary}")
            for c in b.key_facts:
                print(f"  fact [{c.support}]: {c.text}")
            for q in b.anticipated_questions:
                print(f"  question: {q.question}")
            for w in b.warnings:
                print(f"  WARNING: {w}")
        if job.error:
            print(f"  note: {job.error['code']}: {job.error['message']}")

    if args.json:
        print(json.dumps([j.to_dict() for j in results], indent=2))
        return 0

    zoning = next(i for i in items if i.item_number == "4.1")
    q = "Have we had zoning requests near University Drive before, and what was the public reaction?"
    ans = pipeline.ask(q, zoning)
    print(f"\nFollow-up on item 4.1: {q}\n  status: {ans.status}")
    if ans.answer:
        print(f"  answer: {ans.answer}")
    for c in ans.citations:
        print(f"  source: {format_citation(c)}")
    if args.live is False:
        print("\n(offline extractive provider: rule-based stand-in, not an AI model)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
