"""Add demo job captures on an interval (test auto-refresh in desktop / client .exe).

Examples:
  python -m scripts.demo_tick --once
  python -m scripts.demo_tick --interval 30
  python -m scripts.demo_tick --interval 60 --api http://127.0.0.1:5123 --user "Demo User"
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

DEFAULT_API = "http://127.0.0.1:5123"


def build_payload(captured_by: str, tick: int) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "source_url": f"https://example.com/jobs/demo-{tick}",
        "page_title": f"Demo job #{tick} — Example Corp",
        "captured_html": (
            f"<article><h1>Demo Software Engineer #{tick}</h1>"
            f"<p>Example Corp · Remote · United States</p>"
            f"<p>$140,000 - $180,000 / year</p>"
            f"<p>Auto-generated demo capture at {now}</p></article>"
        ),
        "captured_at": now,
        "captured_by": captured_by,
        "extension_version": "0.2.0",
        "capture_method": "demo_tick",
    }


def post_capture(api_base: str, captured_by: str, tick: int) -> None:
    url = f"{api_base.rstrip('/')}/capture/job"
    body = json.dumps(build_payload(captured_by, tick)).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            raw = res.read().decode("utf-8")
            print(f"[{tick}] {res.status} {raw[:120]}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"[{tick}] HTTP {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise SystemExit(
            f"Cannot reach API at {api_base}. Start host with: npm run dev:api or npm run dev:api:lan\n{e}"
        ) from e


def main() -> None:
    parser = argparse.ArgumentParser(description="Post demo captures on an interval")
    parser.add_argument("--api", default=DEFAULT_API, help="API base URL (default: %(default)s)")
    parser.add_argument("--user", default="Demo Tick", help="captured_by name")
    parser.add_argument("--interval", type=float, default=60.0, help="Seconds between captures")
    parser.add_argument("--once", action="store_true", help="Post one job and exit")
    parser.add_argument("--count", type=int, default=0, help="Stop after N jobs (0 = unlimited)")
    args = parser.parse_args()

    tick = 0
    limit = 1 if args.once else args.count

    print(f"API: {args.api}")
    print(f"User: {args.user}")
    if args.once:
        print("Mode: single demo job")
    else:
        print(f"Mode: every {args.interval}s" + (f", max {limit} jobs" if limit else ", until Ctrl+C"))

    while True:
        tick += 1
        post_capture(args.api, args.user, tick)
        if limit and tick >= limit:
            break
        if args.once:
            break
        time.sleep(max(args.interval, 1.0))


if __name__ == "__main__":
    main()
