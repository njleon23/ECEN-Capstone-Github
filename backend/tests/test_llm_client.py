"""Provider tests against a local fake HTTP server (no real network, no API key)."""

import json
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from app.analysis.llm_client import OfflineExtractiveProvider, OpenAICompatibleProvider
from app.analysis.errors import (DependencyUnavailable, ProviderError, RateLimited)

SECRET = "sk-test-secret-123"


class FakeHandler(BaseHTTPRequestHandler):
    # Set per test: (status, headers dict, body)
    reply = (200, {}, {})
    seen = []

    def do_POST(self):                                        # noqa: N802
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        FakeHandler.seen.append({"path": self.path, "auth": self.headers.get("Authorization"),
                                 "body": body})
        status, headers, payload = FakeHandler.reply
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):                             # keep test output clean
        return


class ProviderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}/v1"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        FakeHandler.seen = []
        os.environ["LLM_TEST_KEY"] = SECRET
        self.provider = OpenAICompatibleProvider(base_url=self.base, model="test-model",
                                                 api_key_env="LLM_TEST_KEY", timeout=5)

    def tearDown(self):
        os.environ.pop("LLM_TEST_KEY", None)

    def test_success_parses_content_usage_and_request_id(self):
        FakeHandler.reply = (200, {"x-request-id": "rid-1"}, {
            "model": "test-model-2024", "usage": {"prompt_tokens": 12, "completion_tokens": 3},
            "choices": [{"message": {"content": "{\"ok\": true}"}}]})
        res = self.provider.complete_json(system="sys", user="{}", temperature=0.1)
        self.assertEqual(res.text, '{"ok": true}')
        self.assertEqual(res.model_id, "test-model-2024")
        self.assertEqual(res.request_id, "rid-1")
        self.assertEqual(res.usage["prompt_tokens"], 12)
        sent = FakeHandler.seen[0]
        self.assertEqual(sent["path"], "/v1/chat/completions")
        self.assertEqual(sent["auth"], f"Bearer {SECRET}")
        self.assertEqual(sent["body"]["response_format"], {"type": "json_object"})
        self.assertEqual(sent["body"]["temperature"], 0.1)
        self.assertEqual([m["role"] for m in sent["body"]["messages"]], ["system", "user"])

    def test_rate_limit_maps_to_rate_limited_with_retry_after(self):
        FakeHandler.reply = (429, {"Retry-After": "12"}, {"error": "slow"})
        with self.assertRaises(RateLimited) as cm:
            self.provider.complete_json(system="s", user="{}")
        self.assertEqual(cm.exception.retry_after, 12.0)
        self.assertEqual(cm.exception.http_status, 429)

    def test_server_error_maps_to_dependency_unavailable(self):
        FakeHandler.reply = (503, {}, {"error": "down"})
        with self.assertRaises(DependencyUnavailable):
            self.provider.complete_json(system="s", user="{}")

    def test_rejected_credentials_do_not_leak_the_key(self):
        FakeHandler.reply = (401, {}, {"error": f"bad key {SECRET}"})
        with self.assertRaises(ProviderError) as cm:
            self.provider.complete_json(system="s", user="{}")
        self.assertNotIn(SECRET, str(cm.exception))
        self.assertNotIn(SECRET, json.dumps(cm.exception.to_dict()))

    def test_non_json_and_odd_shapes_are_provider_errors(self):
        FakeHandler.reply = (200, {}, b"<html>oops</html>")
        with self.assertRaises(ProviderError):
            self.provider.complete_json(system="s", user="{}")
        FakeHandler.reply = (200, {}, {"choices": []})
        with self.assertRaises(ProviderError):
            self.provider.complete_json(system="s", user="{}")

    def test_missing_key_is_reported_without_a_request(self):
        os.environ.pop("LLM_TEST_KEY")
        with self.assertRaises(DependencyUnavailable) as cm:
            self.provider.complete_json(system="s", user="{}")
        self.assertIn("LLM_TEST_KEY", str(cm.exception))
        self.assertEqual(FakeHandler.seen, [])

    def test_unreachable_server_is_dependency_unavailable(self):
        p = OpenAICompatibleProvider(base_url="http://127.0.0.1:9/v1", api_key_env="LLM_TEST_KEY",
                                     timeout=1)
        with self.assertRaises(DependencyUnavailable):
            p.complete_json(system="s", user="{}")

    def test_embeddings_are_returned_in_input_order(self):
        FakeHandler.reply = (200, {}, {"data": [
            {"index": 1, "embedding": [0.0, 1.0]}, {"index": 0, "embedding": [1.0, 0.0]}]})
        vecs = self.provider.embed(["a", "b"])
        self.assertEqual(vecs, [[1.0, 0.0], [0.0, 1.0]])
        self.assertEqual(FakeHandler.seen[0]["path"], "/v1/embeddings")


class OfflineProviderTests(unittest.TestCase):
    def test_rejects_non_json_requests(self):
        with self.assertRaises(ProviderError):
            OfflineExtractiveProvider().complete_json(system="s", user="not json")

    def test_declares_itself_as_offline(self):
        self.assertEqual(OfflineExtractiveProvider.model_id, "offline-extractive-v1")


if __name__ == "__main__":
    unittest.main()
