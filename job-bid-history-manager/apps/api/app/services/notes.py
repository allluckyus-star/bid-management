from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone

from app.services.search_index import rebuild_job_search_index


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def upsert_job_note(conn: sqlite3.Connection, job_id: str, body: str) -> None:
    job = conn.execute("SELECT id FROM jobs WHERE id = ? AND deleted_at IS NULL", (job_id,)).fetchone()
    if not job:
        raise LookupError("Job not found")

    now = _utc_now()
    existing = conn.execute("SELECT id FROM notes WHERE job_id = ? LIMIT 1", (job_id,)).fetchone()
    if existing:
        conn.execute(
            "UPDATE notes SET body = ?, updated_at = ? WHERE job_id = ?",
            (body, now, job_id),
        )
    else:
        conn.execute(
            "INSERT INTO notes (id, job_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), job_id, body, now, now),
        )
    rebuild_job_search_index(conn, job_id)
