import math
import unittest

from app.analysis.llm_client import OfflineExtractiveProvider
from app.analysis.pipeline import AnalysisPipeline
from app.analysis.evaluation import (citation_coverage, grounding_overlap_proxy,
                                     indicator_validity, parser_precision_recall,
                                     retrieval_hit_rate, spearman)
from app.analysis.sample_data import sample_items

from analysis_helpers import no_sleep, sample_retriever


class ParserMetricTests(unittest.TestCase):
    def test_precision_and_recall(self):
        expected = [("1", "Call to order"), ("2", "Minutes"), ("3", "Budget"), ("4", "Contract")]
        extracted = [("1.", "Call  to order"), ("2", "Minutes"), ("3", "Budget"), ("9", "Extra")]
        r = parser_precision_recall(expected, extracted)
        self.assertEqual(r["true_positives"], 3)
        self.assertEqual(r["precision"], 0.75)
        self.assertEqual(r["recall"], 0.75)

    def test_empty_inputs(self):
        r = parser_precision_recall([], [])
        self.assertEqual((r["precision"], r["recall"], r["f1"]), (0.0, 0.0, 0.0))


class SpearmanTests(unittest.TestCase):
    def test_perfect_and_inverse_correlation(self):
        self.assertAlmostEqual(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1.0)

    def test_ties_use_average_ranks(self):
        rho = spearman([1, 2, 2, 3], [1, 2, 3, 4])
        self.assertAlmostEqual(rho, 0.9486832980505138, places=6)

    def test_undefined_cases(self):
        self.assertTrue(math.isnan(spearman([1, 2], [1, 2])))             # too few points
        self.assertTrue(math.isnan(spearman([1, 1, 1], [1, 2, 3])))       # no variation
        self.assertIsNone(indicator_validity([1, 1, 1], [1, 2, 3])["spearman"])

    def test_validity_reports_sample_size(self):
        out = indicator_validity([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])
        self.assertEqual(out["n"], 5)
        self.assertEqual(out["spearman"], 0.8)


class SampleRunMetricTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        pipe = AnalysisPipeline(sample_retriever(), OfflineExtractiveProvider(), sleep=no_sleep)
        cls.jobs = [pipe.start(i) for i in sample_items()]
        cls.briefings = [j.briefing for j in cls.jobs if j.briefing]

    def test_every_key_fact_is_labeled(self):
        c = citation_coverage(self.briefings)
        self.assertGreater(c["key_facts"], 0)
        self.assertEqual(c["labeled_share"], 1.0)

    def test_extractive_facts_are_fully_supported_and_overlap(self):
        c = citation_coverage(self.briefings)
        self.assertEqual(c["supported_share"], 1.0)
        for b in self.briefings:
            overlap = grounding_overlap_proxy(b)
            if overlap["checked"]:
                self.assertEqual(overlap["share"], 1.0)

    def test_coverage_with_no_facts(self):
        self.assertIsNone(citation_coverage([])["labeled_share"])

    def test_retrieval_hit_rate_on_labeled_cases(self):
        cases = [
            {"query": "Main Street redevelopment cost estimate", "relevant_source_ids": ["bud-cip"]},
            {"query": "payments to Lone Star Civil", "relevant_source_ids": ["chk-lsc"]},
            {"query": "prior zoning request noise ordinance", "relevant_source_ids": ["min-2024-03"]},
            {"query": "downtown parking traffic complaints", "relevant_source_ids": ["min-2023-09"]},
            {"query": "youth league fees per player", "relevant_source_ids": ["bud-parks"]},
        ]
        out = retrieval_hit_rate(sample_retriever(), cases, k=3)
        self.assertEqual(out["hit_rate"], 1.0)

    def test_hit_rate_counts_misses(self):
        cases = [{"query": "youth league fees", "relevant_source_ids": ["min-2024-03"]}]
        self.assertEqual(retrieval_hit_rate(sample_retriever(), cases, k=3)["hits"], 0)


if __name__ == "__main__":
    unittest.main()
