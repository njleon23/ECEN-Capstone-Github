import dataclasses
import unittest

from app.analysis.config import DEFAULT_SCORE_CONFIG
from app.analysis.scoring import apply_manual_adjustment, compute_priority
from app.analysis.errors import InvalidRequest
from app.analysis.evaluation import score_repeatability
from app.analysis.scoring import category_for, retrieval_query_for
from app.analysis.text_utils import extract_dollar_amounts

from analysis_helpers import item, sample_retriever


def evidence_for(item_id):
    r = sample_retriever()
    c = DEFAULT_SCORE_CONFIG
    return r.search(retrieval_query_for(item(item_id)), top_k=c.top_k,
                    min_relevance=c.min_relevance, min_matched_terms=c.min_matched_terms)


class ScoreTests(unittest.TestCase):
    def test_score_range_and_category(self):
        for iid in ("item-4", "item-7", "item-9"):
            p = compute_priority(item(iid), evidence_for(iid))
            self.assertIsNotNone(p.score)
            self.assertGreaterEqual(p.score, 0.0)
            self.assertLessEqual(p.score, 10.0)
            self.assertIn(p.category, ("Low", "Moderate", "High"))

    def test_expected_ordering_on_sample_agenda(self):
        s4 = compute_priority(item("item-4"), evidence_for("item-4"))
        s7 = compute_priority(item("item-7"), evidence_for("item-7"))
        s9 = compute_priority(item("item-9"), evidence_for("item-9"))
        self.assertEqual(s4.category, "High")
        self.assertGreater(s4.score, s7.score)
        self.assertGreater(s7.score, s9.score)

    def test_every_factor_is_explained_and_contributions_sum_to_score(self):
        p = compute_priority(item("item-4"), evidence_for("item-4"))
        self.assertEqual(len(p.factors), 4)
        for f in p.factors:
            self.assertTrue(f.explanation)
            self.assertGreaterEqual(f.raw_value, 0.0)
            self.assertLessEqual(f.raw_value, 1.0)
        self.assertAlmostEqual(sum(f.contribution for f in p.factors), p.score, places=1)

    def test_factors_cite_only_approved_source_ids(self):
        p = compute_priority(item("item-4"), evidence_for("item-4"))
        cited = {c for f in p.factors for c in f.citations}
        self.assertTrue(cited)
        self.assertNotIn("min-draft-unapproved", cited)

    def test_identical_inputs_give_identical_results(self):
        out = score_repeatability(item("item-4"), evidence_for("item-4"), runs=10)
        self.assertTrue(out["identical"])

    def test_configuration_version_is_recorded(self):
        p = compute_priority(item("item-4"), evidence_for("item-4"))
        self.assertEqual(p.configuration_version, DEFAULT_SCORE_CONFIG.version)

    def test_insufficient_evidence_suppresses_score(self):
        p = compute_priority(item("item-2"), [])
        self.assertIsNone(p.score)
        self.assertIsNone(p.category)
        self.assertTrue(p.incomplete)
        self.assertEqual(p.evidence_level, "insufficient")

    def test_thresholds_are_configurable(self):
        strict = dataclasses.replace(DEFAULT_SCORE_CONFIG, low_max=1.0, moderate_max=2.0,
                                     version="score-test")
        p = compute_priority(item("item-7"), evidence_for("item-7"), strict)
        self.assertEqual(p.category, "High")
        self.assertEqual(category_for(0.5, strict), "Low")
        self.assertEqual(category_for(1.5, strict), "Moderate")

    def test_bad_weights_are_rejected(self):
        bad = dataclasses.replace(DEFAULT_SCORE_CONFIG,
                                  weights={**DEFAULT_SCORE_CONFIG.weights, "cost_exposure": 0.9})
        with self.assertRaises(InvalidRequest):
            compute_priority(item("item-4"), evidence_for("item-4"), bad)

    def test_dollar_amount_parsing(self):
        self.assertEqual(extract_dollar_amounts("$8.5 million and $1,250,000 and $48"),
                         [8_500_000.0, 1_250_000.0, 48.0])
        self.assertEqual(extract_dollar_amounts("no money here"), [])

    def test_cost_factor_uses_log_scale(self):
        small = dataclasses.replace(item("item-4"), source_text="Pay $50,000 for supplies.")
        large = dataclasses.replace(item("item-4"), source_text="Pay $20 million for work.")
        # No retrieved evidence, so only the item's own dollar amount counts.
        fs = next(f for f in compute_priority(small, []).factors if f.key == "cost_exposure")
        fl = next(f for f in compute_priority(large, []).factors if f.key == "cost_exposure")
        self.assertEqual(fs.raw_value, 0.0)          # $50k is below the $100k floor
        self.assertEqual(fl.raw_value, 1.0)          # $20M is above the $10M ceiling
        mid = dataclasses.replace(item("item-4"), source_text="Pay $1 million for work.")
        fm = next(f for f in compute_priority(mid, []).factors if f.key == "cost_exposure")
        self.assertAlmostEqual(fm.raw_value, 0.5, places=3)   # log midpoint of 100k..10M


class ManualAdjustmentTests(unittest.TestCase):
    def setUp(self):
        self.base = compute_priority(item("item-4"), evidence_for("item-4"))

    def test_reason_is_required(self):
        for reason in ("", "   ", None):
            with self.assertRaises(InvalidRequest):
                apply_manual_adjustment(self.base, factor_key="public_discussion",
                                        new_raw_value=1.0, reason=reason, reviewer_id="u1")

    def test_adjustment_changes_score_and_is_recorded(self):
        adj = apply_manual_adjustment(self.base, factor_key="public_discussion",
                                      new_raw_value=0.0, reason="Forum posts are duplicates",
                                      reviewer_id="analyst-1")
        self.assertLess(adj.score, self.base.score)
        m = adj.manual_adjustment
        self.assertEqual(m["reviewer_id"], "analyst-1")
        self.assertEqual(m["reason"], "Forum posts are duplicates")
        self.assertEqual(m["new_value"], 0.0)
        self.assertGreater(m["old_value"], 0.0)
        self.assertIn("adjusted by reviewer", next(
            f for f in adj.factors if f.key == "public_discussion").explanation)
        self.assertIsNone(self.base.manual_adjustment)          # original untouched

    def test_invalid_inputs(self):
        with self.assertRaises(InvalidRequest):
            apply_manual_adjustment(self.base, factor_key="nope", new_raw_value=0.5,
                                    reason="x", reviewer_id="u")
        with self.assertRaises(InvalidRequest):
            apply_manual_adjustment(self.base, factor_key="cost_exposure", new_raw_value=1.5,
                                    reason="x", reviewer_id="u")
        suppressed = compute_priority(item("item-2"), [])
        with self.assertRaises(InvalidRequest):
            apply_manual_adjustment(suppressed, factor_key="cost_exposure", new_raw_value=0.5,
                                    reason="x", reviewer_id="u")


if __name__ == "__main__":
    unittest.main()


class ProceduralAndCostRelevanceTests(unittest.TestCase):
    def test_procedural_titles_from_the_oct_8_sample_agenda(self):
        from app.analysis.scoring import is_procedural
        from app.analysis.models import AgendaItem

        def mk(title):
            return AgendaItem(item_id="x", agenda_id="a", item_number="1", title=title,
                              source_text="", order=0)

        for title in ("Call to Order and Announcement of a Quorum", "Adjourn", "Consent Agenda",
                      "Hear Visitors and Receive Public Comment", "Executive Session",
                      "Council and City Manager Reports",
                      "Approval of Minutes from the September 24, 2026 City Council Meeting"):
            self.assertTrue(is_procedural(mk(title)), title)
        for title in ("Award of a $12.8 Million Capital Construction Contract",
                      "Consideration of Updated Short-Term Rental Regulations",
                      "Public Hearing and Consideration of Rezoning near University Drive"):
            self.assertFalse(is_procedural(mk(title)), title)

    def test_gather_evidence_returns_nothing_for_procedural_items(self):
        from app.analysis.scoring import gather_evidence
        self.assertEqual(gather_evidence(sample_retriever(), item("item-2")), [])
        self.assertTrue(gather_evidence(sample_retriever(), item("item-4")))

    def test_dollar_amounts_from_loosely_related_passages_do_not_count(self):
        from app.analysis.models import Passage, RetrievedPassage
        weak = RetrievedPassage(passage=Passage(
            passage_id="p1", source_id="s1", source_title="Budget", source_type="budget",
            source_date=None, location="p1", text="The amendment adds $4.1 million for pipes.",
            checksum="c"), relevance=0.25)
        res = compute_priority(item("item-9"), [weak])
        cost = next(f for f in res.factors if f.key == "cost_exposure")
        self.assertEqual(cost.contribution, 0.0)


class TestCategoryLabels(unittest.TestCase):
    """The backend, not the frontend, decides the category (Nick's review, Oct 16)."""

    def test_thresholds_and_labels(self):
        cfg = DEFAULT_SCORE_CONFIG
        self.assertEqual(category_for(0.0, cfg), "Low")
        self.assertEqual(category_for(3.49, cfg), "Low")
        self.assertEqual(category_for(3.5, cfg), "Moderate")
        self.assertEqual(category_for(6.49, cfg), "Moderate")
        self.assertEqual(category_for(6.5, cfg), "High")
        self.assertEqual(category_for(10.0, cfg), "High")
