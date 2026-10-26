"""Shared setup for the stage demos. Uses FICTIONAL data only.

The agenda is Nick's sample file parsed with his parser, so the demos exercise the real
ingestion output. Supporting sources are the fictional records in app/analysis/demo_sources.py.
"""
from pathlib import Path

from app.analysis.demo_sources import demo_sources
from app.analysis.retrieval import Retriever
from app.services.agenda_parser import extract_text, parse_agenda_items

SAMPLE_AGENDA = (Path(__file__).resolve().parents[2] / "council-brief" / "examples"
                 / "Sample_City_Council_Agenda_2026-10-08.txt")


def retriever_with_samples() -> Retriever:
    r = Retriever()
    for s in demo_sources():
        r.add_source(s)
    return r


def agenda_items():
    text = extract_text(SAMPLE_AGENDA.name, SAMPLE_AGENDA.read_bytes())
    return parse_agenda_items(text, "demo-agenda")


def item(number: str):
    return next(i for i in agenda_items() if i.item_number == number)


def heading(text: str) -> None:
    print(f"\n=== {text} ===")


def evidence_for(retriever, item):
    """Same retrieval rules the pipeline uses, so demo numbers match."""
    from app.analysis.scoring import gather_evidence
    return gather_evidence(retriever, item)
