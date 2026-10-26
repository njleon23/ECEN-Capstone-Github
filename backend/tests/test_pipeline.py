import dataclasses
import json
import unittest

from app.analysis.llm_client import OfflineExtractiveProvider
from app.analysis.models import AgendaItem
from app.analysis.pipeline import AnalysisPipeline, InMemoryAudit
from app.analysis.errors import DependencyUnavailable, InvalidRequest, RateLimited

from analysis_helpers import ScriptedProvider, item, no_sleep, sample_retriever


def make(provider=None, audit=None):
    audit = audit if audit is not None else InMemoryAudit()
    return AnalysisPipeline(sample_retriever(), provider or OfflineExtractiveProvider(),
                            audit=audit, sleep=no_sleep), audit


class PipelineHappyPathTests(unittest.TestCase):
    def test_main_street_completes_with_high_priority_and_draft_briefing(self):
        pipe, _ = make()
        job = pipe.start(item("item-4"))
        self.assertEqual(job.state, "completed")
        self.assertEqual(job.priority.category, "High")
        self.assertEqual(job.briefing.status, "draft")
        self.assertIsNone(job.error)
        self.assertIsNotNone(job.completed_at)
        self.assertEqual(pipe.get_job(job.job_id), job)
        self.assertEqual(pipe.latest_briefing("item-4"), job.briefing)

    def test_job_dict_is_json_serializable(self):
        pipe, _ = make()
        job = pipe.start(item("item-4"))
        json.dumps(job.to_dict())          # must not raise

    def test_submit_then_run_models_the_async_flow(self):
        pipe, _ = make()
        job = pipe.submit(item("item-4"))
        self.assertEqual(job.state, "queued")
        pipe.run_job(job.job_id)
        self.assertEqual(pipe.get_job(job.job_id).state, "completed")

    def test_unapproved_sources_never_appear_in_results(self):
        pipe, _ = make()
        job = pipe.start(item("item-7"))
        ids = {c.source_id for c in job.briefing.citations}
        ids |= {s for f in job.priority.factors for s in f.citations}
        self.assertNotIn("min-draft-unapproved", ids)

    def test_source_ids_restrict_retrieval(self):
        pipe, _ = make()
        job = pipe.start(item("item-4"), source_ids=["bud-cip"])
        used = {c.source_id for c in job.briefing.citations} - {"agenda-2026-10-fictional"}
        self.assertTrue(used <= {"bud-cip"})

    def test_revisions_increase(self):
        pipe, _ = make()
        a = pipe.start(item("item-4"))
        b = pipe.start(item("item-4"))
        self.assertEqual((a.briefing.revision, b.briefing.revision), (1, 2))

    def test_empty_item_is_invalid(self):
        pipe, _ = make()
        with self.assertRaises(InvalidRequest):
            pipe.submit(dataclasses.replace(item("item-4"), title="", source_text=""))


class IdempotencyTests(unittest.TestCase):
    def test_same_key_returns_same_job_and_does_not_rerun(self):
        provider = ScriptedProvider([{"summary": "s", "key_facts": [], "concerns": [],
                                      "anticipated_questions": [], "talking_points": []}])
        pipe, _ = make(provider)
        a = pipe.start(item("item-4"), idempotency_key="k1")
        calls = provider.calls
        b = pipe.start(item("item-4"), idempotency_key="k1")
        self.assertIs(a, b)
        self.assertEqual(provider.calls, calls)
        self.assertEqual(pipe._revisions["item-4"], 1)       # no duplicate briefing

    def test_new_key_runs_again(self):
        pipe, _ = make()
        a = pipe.start(item("item-4"), idempotency_key="k1")
        b = pipe.start(item("item-4"), idempotency_key="k2")
        self.assertNotEqual(a.job_id, b.job_id)

    def test_same_key_for_different_items_is_independent(self):
        pipe, _ = make()
        a = pipe.start(item("item-4"), idempotency_key="k1")
        b = pipe.start(item("item-9"), idempotency_key="k1")
        self.assertNotEqual(a.job_id, b.job_id)


class DegradedAndFailedTests(unittest.TestCase):
    def test_provider_outage_degrades_but_keeps_score_and_sources(self):
        pipe, audit = make(ScriptedProvider([DependencyUnavailable("down")]))
        job = pipe.start(item("item-4"))
        self.assertEqual(job.state, "degraded")
        self.assertIsNone(job.briefing)
        self.assertIsNotNone(job.priority.score)             # score still available
        self.assertEqual(job.error["code"], "DEPENDENCY_UNAVAILABLE")
        self.assertIn("manual preparation", job.progress_message)
        self.assertEqual(audit.events[-1]["event_type"], "analysis_degraded")

    def test_rate_limit_exhaustion_is_degraded_with_code(self):
        pipe, _ = make(ScriptedProvider([RateLimited("slow", retry_after=1)]))
        job = pipe.start(item("item-4"))
        self.assertEqual((job.state, job.error["code"]), ("degraded", "RATE_LIMITED"))

    def test_malformed_model_output_is_degraded_and_never_stored(self):
        pipe, _ = make(ScriptedProvider(["garbage", "still garbage"]))
        job = pipe.start(item("item-4"))
        self.assertEqual(job.state, "degraded")
        self.assertEqual(job.error["code"], "PROVIDER_ERROR")
        self.assertIsNone(pipe.latest_briefing("item-4"))

    def test_procedural_item_is_completed_without_score_or_generated_claims(self):
        pipe, _ = make()
        job = pipe.start(item("item-2"))          # "Approval of the prior meeting minutes"
        self.assertEqual(job.state, "completed")
        self.assertIsNone(job.error)
        self.assertIsNone(job.priority.score)
        self.assertTrue(job.briefing.warnings[0].startswith("Procedural item"))
        self.assertEqual(job.briefing.key_facts, [])

    def test_insufficient_evidence_suppresses_score_and_marks_incomplete(self):
        pipe, _ = make()
        job = pipe.start(AgendaItem(
            item_id="item-x", agenda_id="a1", item_number="12",
            title="Airport hangar lease renewal", order=12,
            source_text="Consider renewing a ground lease for hangar space."))
        self.assertEqual(job.state, "degraded")
        self.assertIsNone(job.priority.score)
        self.assertTrue(job.briefing.incomplete)
        self.assertEqual(job.error["code"], "INSUFFICIENT_EVIDENCE")

    def test_failed_rerun_preserves_previous_briefing(self):
        pipe, _ = make()
        first = pipe.start(item("item-4"))
        self.assertEqual(first.state, "completed")
        pipe.provider = ScriptedProvider([DependencyUnavailable("down")])
        second = pipe.start(item("item-4"))
        self.assertEqual(second.state, "degraded")
        self.assertIs(pipe.latest_briefing("item-4"), first.briefing)   # REL-004

    def test_unexpected_error_fails_job_without_leaking_details(self):
        pipe, audit = make(ScriptedProvider([RuntimeError("secret sk-12345 leaked")]))
        job = pipe.start(item("item-4"))
        self.assertEqual(job.state, "failed")
        self.assertEqual(job.error["code"], "INTERNAL_ERROR")
        blob = json.dumps(job.to_dict()) + json.dumps(audit.events)
        self.assertNotIn("sk-12345", blob)
        self.assertEqual(audit.events[-1]["error_type"], "RuntimeError")


class AuditTests(unittest.TestCase):
    def test_events_record_versions_and_usage_but_no_prompts_or_keys(self):
        provider = ScriptedProvider([{"summary": "s", "key_facts": [], "concerns": [],
                                      "anticipated_questions": [], "talking_points": []}])
        pipe, audit = make(provider)
        job = pipe.start(item("item-4"))
        kinds = [e["event_type"] for e in audit.events]
        self.assertEqual(kinds[0], "analysis_started")
        self.assertEqual(kinds[-1], "analysis_completed")
        done = audit.events[-1]
        self.assertEqual(done["model_id"], "scripted-test-model")
        self.assertEqual(done["provider_request_ids"], ["req-1"])
        self.assertEqual(done["usage"], [{"prompt_tokens": 100, "completion_tokens": 50}])
        self.assertTrue(done["score_configuration_version"])
        self.assertTrue(done["prompt_version"])
        blob = json.dumps(audit.events).lower()
        for forbidden in ("system", "evidence", "api_key", "authorization"):
            self.assertNotIn(forbidden, blob)
        self.assertEqual(job.state, "completed")

    def test_followup_is_audited(self):
        pipe, audit = make()
        res = pipe.ask("Have we had zoning requests from this developer before?", item("item-7"))
        self.assertEqual(res.status, "answered")
        self.assertEqual(audit.events[-1]["event_type"], "followup_question")
        self.assertEqual(audit.events[-1]["status"], "answered")

    def test_followup_provider_failure_becomes_failed_result(self):
        pipe, audit = make(ScriptedProvider([DependencyUnavailable("down")]))
        res = pipe.ask("Have we had zoning requests from this developer before?", item("item-7"))
        self.assertEqual((res.status, res.error_code), ("failed", "DEPENDENCY_UNAVAILABLE"))
        self.assertEqual(audit.events[-1]["status"], "failed")


class FingerprintTests(unittest.TestCase):
    def test_fingerprint_changes_when_inputs_change(self):
        pipe, _ = make()
        base = pipe.fingerprint_for(item("item-4"))
        self.assertEqual(base, pipe.fingerprint_for(item("item-4")))        # stable
        # approval change
        pipe.retriever.set_approved("bud-cip", False)
        self.assertNotEqual(base, pipe.fingerprint_for(item("item-4")))
        pipe.retriever.set_approved("bud-cip", True)
        self.assertEqual(base, pipe.fingerprint_for(item("item-4")))
        # item text change
        edited = dataclasses.replace(item("item-4"), source_text="Different text.")
        self.assertNotEqual(base, pipe.fingerprint_for(edited))
        # source text change
        src = pipe.retriever.get_source("bud-cip")
        pipe.retriever.add_source(dataclasses.replace(src, text=src.text + " Updated."))
        self.assertNotEqual(base, pipe.fingerprint_for(item("item-4")))
        # configuration change
        pipe.score_config = dataclasses.replace(pipe.score_config, version="score-9.9.9")
        changed = pipe.fingerprint_for(item("item-4"))
        self.assertNotEqual(base, changed)

    def test_job_records_its_fingerprint(self):
        pipe, _ = make()
        job = pipe.start(item("item-4"))
        self.assertEqual(job.fingerprint, pipe.fingerprint_for(item("item-4")))


if __name__ == "__main__":
    unittest.main()


class LatestJobTests(unittest.TestCase):
    def test_latest_job_tracks_the_most_recent_submission_per_item(self):
        pipe, _ = make()
        self.assertIsNone(pipe.latest_job("item-4"))
        first = pipe.start(item("item-4"))
        self.assertEqual(pipe.latest_job("item-4").job_id, first.job_id)
        second = pipe.start(item("item-4"))
        self.assertEqual(pipe.latest_job("item-4").job_id, second.job_id)
        self.assertIsNone(pipe.latest_job("item-9"))
