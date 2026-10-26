import unittest

from app.analysis.guardrails import output_violation, request_violation


class RequestGuardrailTests(unittest.TestCase):
    def test_vote_recommendation_requests_are_refused(self):
        for q in ["How should I vote on item 4?",
                  "Should the council approve the Main Street contract?",
                  "Should we reject the zoning request?",
                  "Which way should the mayor vote?",
                  "Can you recommend how to vote on this?",
                  "How should council vote on the contract"]:
            self.assertIsNotNone(request_violation(q), q)

    def test_public_statement_requests_are_refused(self):
        for q in ["Write a press release about the contract",
                  "Draft a public statement for residents",
                  "Compose a social media post announcing the decision",
                  "Prepare an announcement about the road closure"]:
            self.assertIsNotNone(request_violation(q), q)

    def test_normal_questions_are_allowed(self):
        for q in ["Have we had zoning requests from this developer before?",
                  "What was the vote on the 2024 request?",
                  "Who spoke against the project last time?",
                  "What did residents say about downtown parking?",
                  "How much has the project cost so far?"]:
            self.assertIsNone(request_violation(q), q)


class OutputGuardrailTests(unittest.TestCase):
    def test_recommendations_are_detected(self):
        for t in ["Council should approve the contract.",
                  "The council must reject this request.",
                  "Staff recommends voting yes.",
                  "We recommend approval of the contract.",
                  "Members ought to vote against it."]:
            self.assertTrue(output_violation(t), t)

    def test_neutral_and_historical_text_is_allowed(self):
        for t in ["The vote was 6 to 1 in 2024.",
                  "Staff recommended denial of the 2024 request.",
                  "Residents asked the council to reject the plan.",
                  "The item asks Council to consider approval of the contract.",
                  "Two residents expressed concern about noise."]:
            self.assertFalse(output_violation(t), t)


if __name__ == "__main__":
    unittest.main()
