"""Read-only Twikit CLI and loopback bridge. Cookies are used only with X."""
import argparse
import asyncio
import json
import re
from pathlib import Path

from aiohttp import web
from twikit import Client


def tweet_id(value):
    if re.fullmatch(r"\d{1,25}", value):
        return value
    match = re.fullmatch(r"https://(?:www\.)?(?:x|twitter)\.com/(?:[^/?#]+/status|i/web/status)/(\d{1,25})(?:[/?#].*)?", value)
    if not match:
        raise ValueError("Provide an X post URL or numeric post ID.")
    return match[1]


def serialize_tweet(tweet):
    user = getattr(tweet, "user", None)
    handle = getattr(user, "screen_name", None) or "i/web"
    return {
        "id": tweet.id,
        "url": f"https://x.com/{handle}/status/{tweet.id}",
        "text": getattr(tweet, "full_text", None) or getattr(tweet, "text", ""),
        "author": handle,
        "created_at": getattr(tweet, "created_at", None),
        "in_reply_to": getattr(tweet, "in_reply_to", None),
        "quoted_post_id": getattr(getattr(tweet, "quote", None), "id", None),
    }


class Reader:
    def __init__(self, cookies):
        self.client = Client("en-US")
        self.client.load_cookies(str(Path(cookies).expanduser()))
        # Keep one request in flight; the extension may analyze several posts.
        self.lock = asyncio.Lock()

    async def execute(self, action, data):
        async with self.lock:
            if action == "read":
                tweet = await self.client.get_tweet_by_id(tweet_id(str(data.get("url", ""))))
                return {"posts": [serialize_tweet(tweet)]}
            if action == "search":
                query = data.get("query")
                count = data.get("count", 5)
                if not isinstance(query, str) or not query.strip() or len(query) > 512:
                    raise ValueError("Search query must contain 1–512 characters.")
                if type(count) is not int or not 1 <= count <= 20:
                    raise ValueError("count must be 1–20.")
                tweets = await self.client.search_tweet(query, "Latest", count=count)
                return {"posts": [serialize_tweet(t) for t in list(tweets)[:count]]}
            raise ValueError("Unsupported read-only operation.")

    async def close(self):
        await self.client.http.aclose()


def create_app(reader, extension_id=None):
    allowed_origin = f"chrome-extension://{extension_id}" if extension_id else None

    @web.middleware
    async def guard(request, handler):
        # No arbitrary websites, DNS aliases, or credentials in query strings.
        if request.host not in {f"127.0.0.1:{request.transport.get_extra_info('sockname')[1]}"}:
            raise web.HTTPForbidden()
        origin = request.headers.get("Origin")
        if origin is not None and origin != allowed_origin:
            raise web.HTTPForbidden()
        if request.method == "OPTIONS":
            response = web.Response(status=204)
        elif request.headers.get("X-SuperX-Client") != "1":
            raise web.HTTPForbidden()
        else:
            response = await handler(request)
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
            response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-SuperX-Client"
            response.headers["Access-Control-Allow-Private-Network"] = "true"
        response.headers["Cache-Control"] = "no-store"
        return response

    async def route(request):
        try:
            data = await request.json()
            if not isinstance(data, dict):
                raise ValueError("Expected a JSON object.")
            result = await asyncio.wait_for(reader.execute(request.match_info["action"], data), 45)
            return web.json_response(result)
        except (ValueError, json.JSONDecodeError):
            return web.json_response({"error": "Invalid Twikit read/search parameters."}, status=400)
        except Exception as error:
            # Provider messages may contain request headers or account details.
            name = type(error).__name__
            status = 429 if name == "TooManyRequests" else 401 if name in {"Unauthorized", "Forbidden", "AccountLocked", "AccountSuspended"} else 502
            return web.json_response({"error": f"Twikit {name}: check local cookies, account access, or retry later."}, status=status)

    app = web.Application(middlewares=[guard], client_max_size=16384)
    app.router.add_post("/{action:read|search}", route)
    app.router.add_route("OPTIONS", "/{action:read|search}", route)

    async def close(_app):
        await reader.close()

    app.on_cleanup.append(close)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cookies", required=True, help="Local Twikit cookie JSON path; never sent to DeepSeek")
    commands = parser.add_subparsers(dest="command", required=True)
    read = commands.add_parser("read", help="Read a post directly, without Chrome")
    read.add_argument("url")
    search = commands.add_parser("search", help="Search X directly, without Chrome")
    search.add_argument("query")
    search.add_argument("--count", type=int, default=5)
    serve = commands.add_parser("serve", help="Start the local service for SuperX / the fact-check CLI")
    serve.add_argument("--port", type=int, default=2420)
    serve.add_argument("--extension-id", help="Allow this Chrome/Edge extension ID; omit for terminal-only use")
    args = parser.parse_args()
    if args.command == "serve" and not 1024 <= args.port <= 65535:
        parser.error("port must be 1024–65535")
    if args.command == "serve" and args.extension_id and not re.fullmatch("[a-p]{32}", args.extension_id):
        parser.error("extension-id must be the 32-character ID shown on chrome://extensions")
    reader = Reader(args.cookies)
    if args.command == "serve":
        web.run_app(create_app(reader, args.extension_id), host="127.0.0.1", port=args.port, access_log=None)
    else:
        async def run():
            try:
                data = {"url": args.url} if args.command == "read" else {"query": args.query, "count": args.count}
                print(json.dumps(await reader.execute(args.command, data), ensure_ascii=False, indent=2))
            finally:
                await reader.close()
        asyncio.run(run())


if __name__ == "__main__":
    main()
