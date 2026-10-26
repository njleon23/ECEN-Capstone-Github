import json
import unittest

from app.analysis.config import DEFAULT_GENERATION_CONFIG, DEFAULT_SCORE_CONFIG
from app.analysis.scoring import compute_priority
from app.analysis.briefing import (figures_supported, generate_briefing, insufficient_briefing,
                                   parse_json_object)
from app.analysis.errors import (DependencyUnavailable, ProviderError, RateLimited,
                                 SchemaValidationError)
from app.analysis.scoring import retrieval_query_for

from analysis_helpers import ScriptedProvider, item, no_sleep, sample_retriever, valid_briefing_payload

ITEM = item("item-4")


def retrieved():
    c = DEFAULT_SCORE_CONFIG
    return sample_retriever().search(retrieval_query_for(ITEM), top_k=c.top_k,
                                     min_relevance=c.min_relevance,
                                     min_matched_terms=c.min_matched_terms)


def cip_passage_id():
    return next(r.passage.passage_id for r in retrieved() if r.passage.source_id == "bud-cip")


def run(provider, **kw):
    ev = retrieved()
    return generate_briefing(ITEM, ev, compute_priority(ITEM, ev), provider,
                             DEFAULT_GENERATION_CONFIG, sleep=no_sleep, **kw)


class BriefingContentTests(unittest.TestCase):
    def test_valid_output_becomes_draft_briefing_with_citations(self):
        pid = cip_passage_id()
        b = run(ScriptedProvider([valid_briefing_payload(pid)]))
        self.assertEqual(b.status, "draft")                    # never auto-approved
        self.assertFalse(b.incomplete)
        self.assertEqual(b.key_facts[0].support, "supported")
        self.assertEqual(b.key_facts[0].kind, "fact")
        self.assertEqual([c.citation_id for c in b.citations], [pid])
        self.assertEqual(b.citations[0].source_id, "bud-cip")
        self.assertEqual(b.citations[0].source_date, "2025-09-01")
        self.assertEqual(b.model_id, "scripted-test-model")
        self.assertEqual(b.prompt_version, DEFAULT_GENERATION_CONFIG.prompt_version)
        self.assertEqual(b.configuration_version, DEFAULT_SCORE_CONFIG.version)
        self.assertEqual(b.source_ids, ["bud-cip"])

    def test_uncited_claims_are_labeled_unsupported_interpretation(self):
        b = run(ScriptedProvider([valid_briefing_payload(cip_passage_id())]))
        self.assertEqual(b.concerns[0].support, "unsupported")
        self.assertEqual(b.concerns[0].kind, "interpretation")
        self.assertEqual(b.talking_points[0].support, "unsupported")

    def test_uncited_key_fact_is_not_labeled_fact(self):
        payload = valid_briefing_payload(cip_passage_id())
        payload["key_facts"].append({"text": "The project is 90 percent funded."})
        b = run(ScriptedProvider([payload]))
        extra = b.key_facts[-1]
        self.assertEqual((extra.support, extra.kind), ("unsupported", "interpretation"))

    def test_mismatched_figure_is_marked_uncertain(self):
        payload = valid_briefing_payload(cip_passage_id())
        payload["key_facts"] = [{"text": "The original estimate was $7.9 million.",
                                 "evidence_ids": [cip_passage_id()]}]
        b = run(ScriptedProvider([payload]))
        self.assertEqual(b.key_facts[0].support, "uncertain")
        self.assertEqual(b.key_facts[0].kind, "interpretation")

    def test_figure_matching(self):
        text = "The revised estimate is $2,500,000 and affects 1,200 residents in 2024."
        self.assertTrue(figures_supported("It costs $2.5 million.", text))
        self.assertTrue(figures_supported("About 1,200 residents are affected in 2024.", text))
        self.assertFalse(figures_supported("It costs $3 million.", text))
        self.assertFalse(figures_supported("About 1,500 residents.", text))
        self.assertTrue(figures_supported("Two of 5 items.", text))   # small integers ignored

    def test_draft_response_without_citation_gets_confirmation_note(self):
        payload = valid_briefing_payload(cip_passage_id())
        payload["anticipated_questions"] = [{"question": "How long will it take?",
                                             "draft_response": "About 14 months."}]
        b = run(ScriptedProvider([payload]))
        q = b.anticipated_questions[0]
        self.assertIn("[confirm with", q.draft_response)
        self.assertTrue(q.confirm_with)

    def test_confirm_with_department_is_named(self):
        payload = valid_briefing_payload(cip_passage_id())
        payload["anticipated_questions"] = [{
            "question": "What is the funding source?", "draft_response": "Utility fund.",
            "confirm_with": ["Finance"]}]
        b = run(ScriptedProvider([payload]))
        self.assertIn("[confirm with Finance]", b.anticipated_questions[0].draft_response)

    def test_vote_recommendation_is_removed(self):
        payload = valid_briefing_payload(cip_passage_id())
        payload["talking_points"].append({"text": "Council should approve this contract."})
        payload["anticipated_questions"][0]["draft_response"] = "Staff recommends voting yes."
        b = run(ScriptedProvider([payload]))
        self.assertFalse(any("should approve" in c.text for c in b.talking_points))
        self.assertIsNone(b.anticipated_questions[0].draft_response)
        self.assertTrue(any("recommend a vote" in w for w in b.warnings))

    def test_summary_recommending_a_vote_is_replaced(self):
        payload = valid_briefing_payload(cip_passage_id())
        payload["summary"] = "Council must approve this contract immediately."
        b = run(ScriptedProvider([payload]))
        self.assertNotIn("must approve", b.summary)
        self.assertTrue(b.warnings)

    def test_question_count_is_capped(self):
        payload = valid_briefing_payload(cip_passage_id())
        payload["anticipated_questions"] = [{"question": f"Question {i}?"} for i in range(12)]
        b = run(ScriptedProvider([payload]))
        self.assertEqual(len(b.anticipated_questions), DEFAULT_GENERATION_CONFIG.max_questions)

    def test_string_entries_are_accepted(self):
        payload = valid_briefing_payload(cip_passage_id())
        payload["concerns"] = ["Parking loss."]
        payload["anticipated_questions"] = ["Why now?"]
        b = run(ScriptedProvider([payload]))
        self.assertEqual(b.concerns[0].text, "Parking loss.")
        self.assertEqual(b.anticipated_questions[0].question, "Why now?")

    def test_fenced_json_is_parsed(self):
        self.assertEqual(parse_json_object('```json\n{"a": 1}\n```'), {"a": 1})
        with self.assertRaises(SchemaValidationError):
            parse_json_object("not json")
        with self.assertRaises(SchemaValidationError):
            parse_json_object("[1, 2]")


class BriefingRetryTests(unittest.TestCase):
    def test_unknown_evidence_id_is_retried_with_the_error(self):
        bad = valid_briefing_payload("made-up-id")
        good = valid_briefing_payload(cip_passage_id())
        provider = ScriptedProvider([bad, good])
        b = run(provider)
        self.assertEqual(provider.calls, 2)
        self.assertIn("unknown evidence id", provider.requests[1]["user"]["previous_attempt_error"])
        self.assertNotIn("previous_attempt_error", provider.requests[0]["user"])
        self.assertEqual(b.status, "draft")

    def test_two_schema_failures_raise_and_never_return_a_briefing(self):
        provider = ScriptedProvider(["not json", {"summary": ""}])
        with self.assertRaises(SchemaValidationError):
            run(provider)
        self.assertEqual(provider.calls, 2)       # one retry only

    def test_missing_summary_is_a_schema_error(self):
        payload = valid_briefing_payload(cip_passage_id())
        del payload["summary"]
        with self.assertRaises(SchemaValidationError):
            run(ScriptedProvider([payload]))

    def test_rate_limit_waits_then_retries_once(self):
        waits = []
        provider = ScriptedProvider([RateLimited("slow down", retry_after=7),
                                     valid_briefing_payload(cip_passage_id())])
        ev = retrieved()
        b = generate_briefing(ITEM, ev, None, provider, DEFAULT_GENERATION_CONFIG,
                              sleep=waits.append)
        self.assertEqual(waits, [7])
        self.assertEqual(b.status, "draft")

    def test_outage_raises_after_one_retry(self):
        provider = ScriptedProvider([DependencyUnavailable("down")])
        with self.assertRaises(DependencyUnavailable):
            run(provider)
        self.assertEqual(provider.calls, 2)

    def test_non_retryable_provider_error_fails_immediately(self):
        provider = ScriptedProvider([ProviderError("bad credentials")])
        with self.assertRaises(ProviderError):
            run(provider)
        self.assertEqual(provider.calls, 1)


class BriefingRequestTests(unittest.TestCase):
    def test_request_contains_only_supplied_evidence_and_no_secrets(self):
        provider = ScriptedProvider([valid_briefing_payload(cip_passage_id())])
        run(provider)
        req = provider.requests[0]["user"]
        self.assertEqual(req["task"], "briefing")
        self.assertLessEqual(len(req["evidence"]) - 1, DEFAULT_GENERATION_CONFIG.max_evidence_passages)
        ids = {e["id"] for e in req["evidence"]}
        self.assertIn("item", ids)
        raw = provider.requests[0]["raw_user"].lower()
        for forbidden in ("api_key", "password", "min-draft-unapproved", "not yet approved"):
            self.assertNotIn(forbidden, raw)

    def test_system_instruction_treats_evidence_as_untrusted(self):
        provider = ScriptedProvider([valid_briefing_payload(cip_passage_id())])
        run(provider)
        self.assertIn("untrusted", provider.requests[0]["system"])

    def test_priority_is_shared_with_the_model_as_context_only(self):
        provider = ScriptedProvider([valid_briefing_payload(cip_passage_id())])
        run(provider)
        pp = provider.requests[0]["user"]["preparation_priority"]
        self.assertIn("score_0_to_10", pp)
        self.assertTrue(pp["factors"])


class InsufficientEvidenceTests(unittest.TestCase):
    def test_no_evidence_means_no_model_call_and_incomplete_briefing(self):
        provider = ScriptedProvider([valid_briefing_payload("item")])
        minutes = item("item-2")
        b = generate_briefing(minutes, [], None, provider, DEFAULT_GENERATION_CONFIG)
        self.assertEqual(provider.calls, 0)
        self.assertTrue(b.incomplete)
        self.assertEqual(b.status, "draft")
        self.assertEqual((b.key_facts, b.concerns, b.anticipated_questions), ([], [], []))
        self.assertTrue(any("Insufficient evidence" in w for w in b.warnings))
        self.assertEqual(b.citations[0].citation_id, "item")

    def test_insufficient_briefing_helper(self):
        b = insufficient_briefing(item("item-2"), DEFAULT_GENERATION_CONFIG, None)
        self.assertEqual(b.model_id, "none")


if __name__ == "__main__":
    unittest.main()
