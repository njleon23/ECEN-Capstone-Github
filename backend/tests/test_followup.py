import unittest

from app.analysis.llm_client import OfflineExtractiveProvider
from app.analysis.errors import DependencyUnavailable, InvalidRequest, SchemaValidationError
from app.analysis.followup import answer_question, format_citation

from analysis_helpers import ScriptedProvider, item, no_sleep, sample_retriever

ZONING = item("item-7")
Q = "Have we had zoning requests from this developer before, and what was the public reaction?"


def ask(question, provider, it=ZONING):
    return answer_question(question, it, sample_retriever(), provider, sleep=no_sleep)


class FollowUpTests(unittest.TestCase):
    def test_zoning_scenario_returns_cited_answer_with_meeting_date(self):
        res = ask(Q, OfflineExtractiveProvider())
        self.assertEqual(res.status, "answered")
        self.assertIn("noise", res.answer.lower())
        self.assertEqual(res.citations[0].source_id, "min-2024-03")
        self.assertEqual(res.citations[0].source_date, "2024-03-12")
        self.assertIn("2024-03-12", format_citation(res.citations[0]))

    def test_vote_recommendation_requests_are_refused_without_calling_model(self):
        provider = ScriptedProvider([{"answer": "x", "evidence_ids": []}])
        res = ask("How should I vote on this zoning request?", provider)
        self.assertEqual(res.status, "refused")
        self.assertEqual(provider.calls, 0)

    def test_press_statement_requests_are_refused(self):
        provider = ScriptedProvider([{"answer": "x", "evidence_ids": []}])
        res = ask("Draft a public statement about the zoning decision", provider)
        self.assertEqual(res.status, "refused")
        self.assertEqual(provider.calls, 0)

    def test_unsupported_question_returns_insufficient_evidence_without_model_call(self):
        provider = ScriptedProvider([{"answer": "x", "evidence_ids": []}])
        res = ask("What is the runway length at the municipal airport?", provider)
        self.assertEqual(res.status, "insufficient_evidence")
        self.assertEqual(res.error_code, "INSUFFICIENT_EVIDENCE")
        self.assertEqual(provider.calls, 0)

    def test_unapproved_sources_cannot_answer(self):
        r = sample_retriever()
        r.set_approved("min-2024-03", False)
        res = answer_question(Q, ZONING, r, OfflineExtractiveProvider(), sleep=no_sleep)
        cited = {c.source_id for c in res.citations}
        self.assertNotIn("min-2024-03", cited)
        self.assertNotIn("min-draft-unapproved", cited)

    def test_answer_without_citations_is_not_accepted(self):
        provider = ScriptedProvider([{"answer": "Probably yes, they did.", "evidence_ids": []}])
        res = ask(Q, provider)
        self.assertEqual(res.status, "insufficient_evidence")
        self.assertEqual(res.citations, [])

    def test_unknown_citation_is_retried_then_accepted(self):
        pid = "min-2024-03:p1"
        provider = ScriptedProvider([
            {"answer": "Yes, in 2024.", "evidence_ids": ["fake-id"]},
            {"answer": "Yes, a similar request in March 2024 was approved.", "evidence_ids": [pid]}])
        res = ask(Q, provider)
        self.assertEqual(provider.calls, 2)
        self.assertEqual(res.status, "answered")
        self.assertIn("previous_attempt_error", provider.requests[1]["user"])

    def test_model_that_recommends_a_vote_is_refused(self):
        provider = ScriptedProvider([{"answer": "Council should approve it.",
                                      "evidence_ids": ["min-2024-03:p1"]}])
        self.assertEqual(ask(Q, provider).status, "refused")

    def test_unmatched_figures_add_a_verification_message(self):
        provider = ScriptedProvider([{"answer": "The 2024 request covered 9,999 acres.",
                                      "evidence_ids": ["min-2024-03:p1"]}])
        res = ask(Q, provider)
        self.assertEqual(res.status, "answered")
        self.assertIn("could not be matched", res.message)

    def test_request_sent_to_model_contains_only_retrieved_evidence(self):
        provider = ScriptedProvider([{"answer": "Yes, in 2024.", "evidence_ids": ["min-2024-03:p1"]}])
        ask(Q, provider)
        req = provider.requests[0]["user"]
        self.assertEqual(req["task"], "followup")
        self.assertNotIn("min-draft-unapproved", {e["id"].split(":")[0] for e in req["evidence"]})
        self.assertIn("untrusted", provider.requests[0]["system"])

    def test_empty_or_oversized_questions_are_invalid(self):
        with self.assertRaises(InvalidRequest):
            ask("   ", OfflineExtractiveProvider())
        with self.assertRaises(InvalidRequest):
            ask("x" * 1001, OfflineExtractiveProvider())

    def test_provider_failures_propagate_for_the_pipeline_to_handle(self):
        with self.assertRaises(DependencyUnavailable):
            ask(Q, ScriptedProvider([DependencyUnavailable("down")]))
        with self.assertRaises(SchemaValidationError):
            ask(Q, ScriptedProvider(["nope"]))


if __name__ == "__main__":
    unittest.main()
