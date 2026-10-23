import unittest
from types import SimpleNamespace

from aiohttp.test_utils import TestClient, TestServer

from bridge import create_app, serialize_tweet, tweet_id


class FakeReader:
    def __init__(self):
        self.calls = []
        self.closed = False

    async def execute(self, action, data):
        self.calls.append((action, data))
        return {"posts": [{"url": "https://x.com/test/status/123", "text": "Full text"}]}

    async def close(self):
        self.closed = True


class BridgeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.reader = FakeReader()
        self.origin = "chrome-extension://" + "a" * 32
        self.client = TestClient(TestServer(create_app(self.reader, "a" * 32), host="127.0.0.1"))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        self.assertTrue(self.reader.closed)

    async def test_cli_and_allowed_extension(self):
        for headers in ({"X-SuperX-Client": "1"}, {"X-SuperX-Client": "1", "Origin": self.origin}):
            response = await self.client.post("/read", json={"url": "123"}, headers=headers)
            self.assertEqual(response.status, 200)
            self.assertEqual((await response.json())["posts"][0]["text"], "Full text")
        self.assertEqual(len(self.reader.calls), 2)

    async def test_reject_websites_unapproved_extensions_and_simple_requests(self):
        for headers in ({}, {"Origin": "https://x.com", "X-SuperX-Client": "1"}, {"Origin": "null", "X-SuperX-Client": "1"}, {"Origin": "chrome-extension://" + "b" * 32, "X-SuperX-Client": "1"}, {"Host": "evil.example", "X-SuperX-Client": "1"}):
            response = await self.client.post("/search", json={"query": "test"}, headers=headers)
            self.assertEqual(response.status, 403)
        self.assertEqual(self.reader.calls, [])

    async def test_preflight_and_read_only_routes(self):
        response = await self.client.options("/read", headers={"Origin": self.origin})
        self.assertEqual(response.status, 204)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], self.origin)
        response = await self.client.post("/publish", json={}, headers={"X-SuperX-Client": "1"})
        self.assertEqual(response.status, 404)

    def test_urls_and_full_text(self):
        self.assertEqual(tweet_id("https://x.com/test/status/123?s=20"), "123")
        with self.assertRaises(ValueError):
            tweet_id("https://evil.example/status/123")
        tweet = SimpleNamespace(id="123", text="Short", full_text="Full long post", user=SimpleNamespace(screen_name="test"))
        self.assertEqual(serialize_tweet(tweet)["text"], "Full long post")


if __name__ == "__main__":
    unittest.main()
