"""Demo for step 2 (retrieval + scoring). Run from backend/:
    python3 -m demos.demo_02_retrieval_scoring
"""
from app.analysis.scoring import apply_manual_adjustment, compute_priority, is_procedural

from ._common import agenda_items, evidence_for, heading, item, retriever_with_samples


def main() -> None:
    r = retriever_with_samples()

    heading("1. Retrieval over approved sources (BM25)")
    q = "short-term rental noise parking complaints neighborhood"
    for p in r.search(q, top_k=3, min_relevance=0.15):
        print(f"  relevance {p.relevance:.2f}  {p.passage.source_id}: {p.passage.text[:85]}...")

    heading("2. Approval is enforced at query time")
    q = "downtown paid parking pilot residents objected cancel"
    draft = "min-draft-unapproved"
    def hits():
        return draft in {p.passage.source_id for p in r.search(q, top_k=10)}
    print(f"  unapproved draft minutes returned?        {hits()}")
    r.set_approved(draft, True)
    print(f"  after a human approves the source:        {hits()}")
    r.set_approved(draft, False)
    print(f"  after approval is withdrawn:              {hits()}")

    heading("3. Preparation priority (0-10) for the Oct 8 agenda items")
    results = {}
    for it in agenda_items():
        if is_procedural(it):
            print(f"\n  Item {it.item_number}: {it.title[:62]}\n    -> procedural: not scored")
            continue
        res = compute_priority(it, evidence_for(r, it))
        results[it.item_number] = res
        shown = "suppressed (insufficient evidence)" if res.score is None else f"{res.score}/10 {res.category}"
        print(f"\n  Item {it.item_number}: {it.title[:62]}\n    -> {shown}")
        if res.score is not None:
            for f in res.factors:
                print(f"       {f.label:<34} +{f.contribution:.2f}  {f.explanation[:80]}")

    heading("4. Reviewer adjustment requires a reason (item 4.4)")
    base = results["4.4"]
    try:
        apply_manual_adjustment(base, factor_key="public_discussion", new_raw_value=0.9,
                                reason=" ", reviewer_id="demo")
    except Exception as e:
        print(f"  without a reason -> rejected: {e}")
    adj = apply_manual_adjustment(
        base, factor_key="public_discussion", new_raw_value=0.9, reviewer_id="demo-reviewer",
        reason="Eastside residents organized a petition that is not in the approved sources.")
    print(f"  with a reason    -> {base.score} -> {adj.score} ({adj.category}); logged: "
          f"{adj.manual_adjustment['reason']}")
    print("\n(Fictional data. The score is a preparation priority, not a prediction, and its "
          "factors and weights are unvalidated proposals.)")


if __name__ == "__main__":
    main()
