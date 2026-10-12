import json
import sys
import unittest
from pathlib import Path
from starlette.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))
from server import app


class MCPTests(unittest.TestCase):
    def test_python_transport_and_real_purchase_tool(self):
        headers = {"Accept": "application/json, text/event-stream"}
        w = json.loads((ROOT / "tests/fixtures.json").read_text())
        with TestClient(app, base_url="http://127.0.0.1:8000") as client:
            init = client.post(
                "/mcp/",
                headers=headers,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-06-18",
                        "capabilities": {},
                        "clientInfo": {"name": "test", "version": "1"},
                    },
                },
            )
            self.assertEqual(init.status_code, 200)
            self.assertEqual(init.json()["result"]["serverInfo"]["name"], "REWEAR")
            listed = client.post(
                "/mcp/",
                headers=headers,
                json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            )
            self.assertEqual(len(listed.json()["result"]["tools"]), 4)
            candidate = {**w[0], "id": "new"}
            result = client.post(
                "/mcp/",
                headers=headers,
                json={
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "tools/call",
                    "params": {
                        "name": "compare_purchase",
                        "arguments": {
                            "wardrobe": w,
                            "candidate": candidate,
                            "price": None,
                            "expected_wears": None,
                        },
                    },
                },
            ).json()["result"]
            self.assertFalse(result.get("isError", False))
            content = result.get("structuredContent") or json.loads(
                result["content"][0]["text"]
            )
            self.assertEqual(content["compatible_count"], 4)
            self.assertEqual(content["new_tag_combinations"], 0)
            bad = client.post(
                "/mcp/",
                headers=headers,
                json={
                    "jsonrpc": "2.0",
                    "id": 4,
                    "method": "tools/call",
                    "params": {
                        "name": "check_outfit",
                        "arguments": {"wardrobe": w, "item_ids": ["unknown"]},
                    },
                },
            ).json()["result"]
            self.assertTrue(bad["isError"])
            for path in ("/", "/styles.css", "/app.js"):
                self.assertEqual(client.get(path).status_code, 200)
            source = client.get("/rewear-github.zip")
            self.assertEqual(source.status_code, 200)
            self.assertEqual(source.content[:2], b"PK")


if __name__ == "__main__":
    unittest.main()
