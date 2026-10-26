"""Demo for step 4 (follow-up questions). Run from backend/:
    python3 -m demos.demo_04_followup
"""
from app.analysis.followup import answer_question, format_citation
from app.analysis.llm_client import OfflineExtractiveProvider

from ._common import heading, item, retriever_with_samples


def main() -> None:
    r = retriever_with_samples()
    prov = OfflineExtractiveProvider()
    rezoning, drainage = item("4.1"), item("4.4")
    cases = [
        ("Source-grounded answer", rezoning,
         "Have we had rezoning requests near University Drive before, and how did residents react?"),
        ("Another cited answer", drainage, "Why did the drainage project estimate go up?"),
        ("Refuses vote advice", rezoning, "How should I vote on the rezoning?"),
        ("Refuses public statements", rezoning, "Draft a press release about the rezoning."),
        ("Insufficient evidence", rezoning, "What is the runway length at the airport?"),
    ]
    for label, it, q in cases:
        heading(label)
        print(f"  Item {it.item_number}  Q: {q}")
        a = answer_question(q, it, r, prov)
        print(f"  status: {a.status}")
        print(f"  {(a.answer or a.message)[:300]}")
        for c in a.citations:
            print(f"  source: {format_citation(c)}")
    print("\n(Offline provider is a rule-based stand-in. Fictional data.)")


if __name__ == "__main__":
    main()
