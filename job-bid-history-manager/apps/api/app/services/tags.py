from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone

from app.schemas import TagCreateRequest, TagOut, TagPatchRequest
from app.services.search_index import rebuild_job_search_index

DEFAULT_TAG_COLORS: dict[str, str] = {
    "offered": "#22c55e",
    "failed": "#ef4444",
    "applied": "#3b82f6",
    "interview": "#a855f7",
    "waiting": "#f59e0b",
    "good-fit": "#14b8a6",
    "bad-fit": "#f97316",
    "remote": "#06b6d4",
    "urgent": "#e11d48",
    "high-salary": "#84cc16",
    "visa": "#6366f1",
    "follow-up": "#ec4899",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_tags(conn: sqlite3.Connection) -> list[TagOut]:
    rows = conn.execute(
        "SELECT id, name, color, created_at FROM tags ORDER BY name COLLATE NOCASE"
    ).fetchall()
    return [TagOut(id=r["id"], name=r["name"], color=r["color"], created_at=r["created_at"]) for r in rows]


def create_tag(conn: sqlite3.Connection, payload: TagCreateRequest) -> TagOut:
    name = payload.name.strip()
    if not name:
        raise ValueError("Tag name is required")
    existing = conn.execute("SELECT id FROM tags WHERE LOWER(name) = LOWER(?)", (name,)).fetchone()
    if existing:
        raise ValueError("Tag already exists")

    tag_id = str(uuid.uuid4())
    color = payload.color or DEFAULT_TAG_COLORS.get(name.lower(), "#64748b")
    created_at = _utc_now()
    conn.execute(
        "INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)",
        (tag_id, name, color, created_at),
    )
    return TagOut(id=tag_id, name=name, color=color, created_at=created_at)


def update_tag(conn: sqlite3.Connection, tag_id: str, payload: TagPatchRequest) -> TagOut:
    row = conn.execute("SELECT * FROM tags WHERE id = ?", (tag_id,)).fetchone()
    if not row:
        raise LookupError("Tag not found")

    new_name = payload.name.strip() if payload.name else row["name"]
    new_color = payload.color if payload.color is not None else row["color"]

    if payload.name:
        clash = conn.execute(
            "SELECT id FROM tags WHERE LOWER(name) = LOWER(?) AND id != ?",
            (new_name, tag_id),
        ).fetchone()
        if clash:
            raise ValueError("Tag name already in use")

    conn.execute("UPDATE tags SET name = ?, color = ? WHERE id = ?", (new_name, new_color, tag_id))

    job_ids = conn.execute("SELECT job_id FROM job_tags WHERE tag_id = ?", (tag_id,)).fetchall()
    for job in job_ids:
        rebuild_job_search_index(conn, job["job_id"])

    return TagOut(id=tag_id, name=new_name, color=new_color, created_at=row["created_at"])


def delete_tag(conn: sqlite3.Connection, tag_id: str) -> None:
    row = conn.execute("SELECT id FROM tags WHERE id = ?", (tag_id,)).fetchone()
    if not row:
        raise LookupError("Tag not found")

    job_ids = [r["job_id"] for r in conn.execute("SELECT job_id FROM job_tags WHERE tag_id = ?", (tag_id,)).fetchall()]
    conn.execute("DELETE FROM job_tags WHERE tag_id = ?", (tag_id,))
    conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
    for job_id in job_ids:
        rebuild_job_search_index(conn, job_id)


def add_tag_to_job(conn: sqlite3.Connection, job_id: str, tag_id: str) -> None:
    job = conn.execute("SELECT id FROM jobs WHERE id = ? AND deleted_at IS NULL", (job_id,)).fetchone()
    if not job:
        raise LookupError("Job not found")
    tag = conn.execute("SELECT id FROM tags WHERE id = ?", (tag_id,)).fetchone()
    if not tag:
        raise LookupError("Tag not found")

    conn.execute(
        """
        INSERT OR IGNORE INTO job_tags (job_id, tag_id, created_at)
        VALUES (?, ?, ?)
        """,
        (job_id, tag_id, _utc_now()),
    )
    rebuild_job_search_index(conn, job_id)


def remove_tag_from_job(conn: sqlite3.Connection, job_id: str, tag_id: str) -> None:
    conn.execute("DELETE FROM job_tags WHERE job_id = ? AND tag_id = ?", (job_id, tag_id))
    rebuild_job_search_index(conn, job_id)


def get_or_create_tag_by_name(conn: sqlite3.Connection, name: str) -> TagOut:
    row = conn.execute("SELECT * FROM tags WHERE LOWER(name) = LOWER(?)", (name.strip(),)).fetchone()
    if row:
        return TagOut(id=row["id"], name=row["name"], color=row["color"], created_at=row["created_at"])
    return create_tag(conn, TagCreateRequest(name=name.strip()))
