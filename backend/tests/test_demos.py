import contextlib
import importlib
import io
import unittest


class DemoSmokeTests(unittest.TestCase):
    """Each stage demo must keep running as the code changes."""

    def run_demo(self, name):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            importlib.import_module(f"demos.{name}").main()
        return out.getvalue()

    def test_retrieval_scoring_demo(self):
        text = self.run_demo("demo_02_retrieval_scoring")
        self.assertIn("procedural: not scored", text)
        self.assertIn("returned?        False", text)
        self.assertIn("after a human approves the source:        True", text)
        self.assertIn("rejected: A reason is required", text)

    def test_briefing_guardrails_demo(self):
        text = self.run_demo("demo_03_briefing_guardrails")
        self.assertIn("Removed a statement", text)
        self.assertIn("REFUSED", text)

    def test_followup_demo(self):
        text = self.run_demo("demo_04_followup")
        self.assertIn("2025-11-13", text)
        self.assertIn("status: refused", text)
        self.assertIn("status: insufficient_evidence", text)


if __name__ == "__main__":
    unittest.main()
