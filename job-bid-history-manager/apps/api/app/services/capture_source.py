from __future__ import annotations

import json
import sqlite3


def resolve_capture_for_extraction(
    conn: sqlite3.Connection,
    job_id: str,
    jd_raw_text: str,
) -> tuple[str, str | None]:
    """
    HTML for extraction, plus optional legacy plain text from older captures.
    """
    html = ""
    event = conn.execute(
        """
        SELECT raw_payload_json FROM job_capture_events
        WHERE job_id = ? ORDER BY captured_at DESC LIMIT 1
        """,
        (job_id,),
    ).fetchone()
    if event and event["raw_payload_json"]:
        try:
            payload = json.loads(event["raw_payload_json"])
            if isinstance(payload, dict):
                html = (payload.get("captured_html") or "").strip()
        except json.JSONDecodeError:
            pass

    raw = (jd_raw_text or "").strip()
    if not html and raw.startswith("<"):
        html = raw[:200000]

    legacy: str | None = None
    if not html and raw:
        legacy = raw

    return html, legacy
