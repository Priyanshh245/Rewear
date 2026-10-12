"""Check real HTML forms, Python MCP requests and Java matching together."""

import io
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import httpx
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))
import bridge


class ProjectTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        cls.port = sock.getsockname()[1]
        sock.close()
        env = dict(
            os.environ, REWEAR_DATA_FILE=str(Path(cls.directory.name) / "wardrobe.json")
        )
        cls.log = open(Path(cls.directory.name) / "server.log", "w+")
        cls.process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "server:app",
                "--app-dir",
                "python",
                "--host",
                "127.0.0.1",
                "--port",
                str(cls.port),
            ],
            cwd=ROOT,
            env=env,
            stdout=cls.log,
            stderr=cls.log,
        )
        cls.client = httpx.Client(
            base_url=f"http://127.0.0.1:{cls.port}",
            timeout=30,
            follow_redirects=True,
            trust_env=False,
        )
        for attempt in range(80):
            try:
                if cls.client.get("/backup").status_code == 200:
                    return
            except httpx.TransportError:
                pass
            if cls.process.poll() is not None:
                break
            time.sleep(0.1)
        cls.log.seek(0)
        error = cls.log.read()
        cls.tearDownClass()
        raise RuntimeError(error)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        cls.process.terminate()
        try:
            cls.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.process.kill()
            cls.process.wait()
        cls.log.close()
        cls.directory.cleanup()

    def tokens(self, path="/reset"):
        page = self.client.get(path)
        self.assertEqual(page.status_code, 200, page.text)
        return {
            name: re.search(r'name="' + name + r'" value="([^"]+)"', page.text).group(1)
            for name in ("csrf", "revision")
        }

    def setUp(self):
        self.assertEqual(
            self.client.post("/reset", data=self.tokens()).status_code, 200
        )

    def sample(self):
        self.assertEqual(self.client.post("/demo", data=self.tokens()).status_code, 200)
        return self.client.get("/backup").json()

    def rpc(self, name, arguments):
        headers = {"Accept": "application/json, text/event-stream"}
        response = self.client.post(
            "/mcp/",
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments},
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()["result"]
        if not result.get("isError") and "structuredContent" not in result:
            result["structuredContent"] = json.loads(result["content"][0]["text"])
        return result

    def test_pages_have_no_javascript_and_names_are_escaped(self):
        for path in ("/", "/studio", "/purchase", "/saved", "/item", "/restore"):
            page = self.client.get(path)
            self.assertEqual(page.status_code, 200, page.text)
            self.assertNotIn("<script", page.text.lower())
        fields = {
            **self.tokens(),
            "name": '<script>alert("x")</script>',
            "category": "top",
            "color": "white",
            "fit": "regular",
            "pattern": "plain",
            "styles": "casual",
            "seasons": "cool",
            "available": "on",
            "mode": "item",
        }
        response = self.client.post("/item", data=fields)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("&lt;script&gt;", response.text)
        self.assertNotIn("<script>alert", response.text)

    def test_outfit_save_wear_and_undo(self):
        state = self.sample()
        pieces = {
            c: next(x for x in state["wardrobe"] if x["category"] == c)["id"]
            for c in ("top", "bottom", "shoes")
        }
        response = self.client.post(
            "/outfit",
            data={
                **self.tokens(),
                **pieces,
                "style": "any",
                "season": "any",
                "name": "Coffee run",
                "action": "save",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        state = self.client.get("/backup").json()
        self.assertEqual(len(state["looks"]), 1)
        look = state["looks"][0]
        self.assertEqual(
            self.client.post(
                "/wear", data={**self.tokens(), "id": look["id"]}
            ).status_code,
            200,
        )
        self.assertEqual(len(self.client.get("/backup").json()["wears"]), 1)
        self.assertEqual(
            self.client.post(
                "/wear", data={**self.tokens(), "id": look["id"]}
            ).status_code,
            200,
        )
        self.assertEqual(len(self.client.get("/backup").json()["wears"]), 1)
        self.client.post("/undo-wear", data=self.tokens())
        self.assertEqual(self.client.get("/backup").json()["wears"], [])

    def test_purchase_and_actual_mcp_tools_use_java(self):
        state = self.sample()
        candidate = dict(state["wardrobe"][0], id="new-tee")
        result = self.rpc(
            "compare_purchase",
            {
                "wardrobe": state["wardrobe"],
                "candidate": candidate,
                "price": 90,
                "expected_wears": 30,
            },
        )
        self.assertFalse(result.get("isError", False), result)
        data = result["structuredContent"]
        self.assertEqual(data["new_tag_combinations"], 0)
        self.assertEqual(data["cost_per_wear"], 3)
        builds = self.rpc("build_outfits", {"wardrobe": state["wardrobe"]})[
            "structuredContent"
        ]
        self.assertEqual(builds["total"], 18)
        ids = builds["outfits"][0]["item_ids"]
        self.assertTrue(
            self.rpc("check_outfit", {"wardrobe": state["wardrobe"], "item_ids": ids})[
                "structuredContent"
            ]["valid"]
        )
        self.assertEqual(
            self.rpc(
                "search_wardrobe", {"wardrobe": state["wardrobe"], "query": "white"}
            )["structuredContent"]["total"],
            2,
        )
        response = self.client.post(
            "/purchase",
            data={
                **self.tokens(),
                "mode": "purchase",
                "name": "Black sneakers",
                "category": "shoes",
                "color": "black",
                "fit": "regular",
                "pattern": "plain",
                "styles": ["casual", "streetwear"],
                "seasons": ["warm", "cool", "cold"],
                "price": "90",
                "expected_wears": "30",
                "style": "any",
                "season": "any",
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("CAD $3.00", response.text)
        self.assertIn("tag-compatible combinations", response.text)

    def test_photo_and_backup_import(self):
        output = io.BytesIO()
        Image.new("RGB", (30, 30), "red").save(output, format="PNG")
        fields = {
            **self.tokens(),
            "mode": "item",
            "name": "Photo tee",
            "category": "top",
            "color": "red",
            "fit": "regular",
            "pattern": "plain",
            "styles": "casual",
            "seasons": "cool",
            "available": "on",
        }
        response = self.client.post(
            "/item",
            data=fields,
            files={"photo": ("tee.png", output.getvalue(), "image/png")},
        )
        self.assertEqual(response.status_code, 200, response.text)
        state = self.client.get("/backup").json()
        item = state["wardrobe"][0]
        self.assertTrue(item["image"].startswith("data:image/jpeg;base64,"))
        self.assertEqual(
            self.client.get("/photo", params={"id": item["id"]}).content[:2],
            b"\xff\xd8",
        )
        self.client.post("/reset", data=self.tokens())
        response = self.client.post(
            "/restore",
            data=self.tokens(),
            files={
                "backup": (
                    "old-browser-backup.json",
                    json.dumps(state).encode(),
                    "application/json",
                )
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.get("/backup").json(), state)

    def test_stale_and_forged_forms_do_not_overwrite_data(self):
        old = self.tokens()
        self.sample()
        before = self.client.get("/backup").json()
        self.assertEqual(self.client.post("/reset", data=old).status_code, 400)
        self.assertEqual(
            self.client.post(
                "/reset", data={**self.tokens(), "csrf": "forged"}
            ).status_code,
            400,
        )
        self.assertEqual(self.client.get("/backup").json(), before)

    def test_purchase_without_price_can_be_added_as_owned(self):
        from html import unescape

        self.sample()
        values = {
            **self.tokens(),
            "mode": "purchase",
            "name": "Black sneakers",
            "category": "shoes",
            "color": "black",
            "fit": "regular",
            "pattern": "plain",
            "styles": "casual",
            "seasons": "cool",
            "style": "any",
            "season": "any",
        }
        response = self.client.post("/purchase", data=values)
        self.assertEqual(response.status_code, 200, response.text)
        candidate = re.search(r'name="candidate" value="([^"]+)"', response.text).group(
            1
        )
        owned = self.client.post(
            "/own-purchase", data={**self.tokens(), "candidate": unescape(candidate)}
        )
        self.assertEqual(owned.status_code, 200, owned.text)
        self.assertEqual(len(self.client.get("/backup").json()["wardrobe"]), 10)

    def test_request_size_limit(self):
        response = self.client.post("/mcp/", content=b"x" * (16 * 1024 * 1024 + 1))
        self.assertEqual(response.status_code, 413)

    def test_invalid_java_requests_and_cost_rounding(self):
        state = self.sample()
        candidate = dict(state["wardrobe"][0], id="new")
        with self.assertRaises(ValueError):
            bridge.call_java(
                "compare_purchase",
                {
                    "wardrobe": state["wardrobe"],
                    "candidate": candidate,
                    "expected_wears": 0,
                },
            )
        with self.assertRaises(ValueError):
            bridge.call_java(
                "check_outfit", {"wardrobe": state["wardrobe"], "item_ids": ["missing"]}
            )
        rounded = bridge.call_java(
            "compare_purchase",
            {
                "wardrobe": state["wardrobe"],
                "candidate": candidate,
                "price": 267.5,
                "expected_wears": 100,
            },
        )
        self.assertEqual(rounded["cost_per_wear"], 2.68)


if __name__ == "__main__":
    unittest.main()
