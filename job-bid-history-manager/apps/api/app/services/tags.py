from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone

from app.schemas import TagCreateRequest, TagOut, TagPatchRequest
from app.services.job_tags import (
    ALLOWED_TAG_NAMES,
    EMPLOYMENT_TAGS,
    LOCATION_TAGS,
    normalize_tag_name,
    tag_category,
)
from app.services.search_index import rebuild_job_search_index

DEFAULT_TAG_COLORS: dict[str, str] = {
    "remote": "#06b6d4",
    "onsite": "#8b5cf6",
    "hybrid": "#0ea5e9",
    "full-time": "#22c55e",
    "part-time": "#f59e0b",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_default_tags(conn: sqlite3.Connection) -> None:
    """Ensure only the five default tags exist; remove all others."""
    for name in sorted(ALLOWED_TAG_NAMES):
        row = conn.execute(
            "SELECT id FROM tags WHERE LOWER(name) = LOWER(?)", (name,)
        ).fetchone()
        if not row:
            color = DEFAULT_TAG_COLORS.get(name, "#64748b")
            conn.execute(
                "INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), name, color, _utc_now()),
            )

    stale = conn.execute(
        f"""
        SELECT id FROM tags
        WHERE LOWER(name) NOT IN ({",".join("?" * len(ALLOWED_TAG_NAMES))})
        """,
        tuple(sorted(ALLOWED_TAG_NAMES)),
    ).fetchall()
    for row in stale:
        tag_id = row["id"]
        job_ids = [
            r["job_id"]
            for r in conn.execute(
                "SELECT job_id FROM job_tags WHERE tag_id = ?", (tag_id,)
            ).fetchall()
        ]
        conn.execute("DELETE FROM job_tags WHERE tag_id = ?", (tag_id,))
        conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
        for job_id in job_ids:
            rebuild_job_search_index(conn, job_id)


def list_tags(conn: sqlite3.Connection) -> list[TagOut]:
    ensure_default_tags(conn)
    rows = conn.execute(
        "SELECT id, name, color, created_at FROM tags ORDER BY name COLLATE NOCASE"
    ).fetchall()
    return [
        TagOut(id=r["id"], name=r["name"], color=r["color"], created_at=r["created_at"])
        for r in rows
    ]


def get_tag_by_name(conn: sqlite3.Connection, name: str) -> TagOut | None:
    canonical = normalize_tag_name(name)
    if not canonical:
        return None
    row = conn.execute(
        "SELECT * FROM tags WHERE LOWER(name) = LOWER(?)", (canonical,)
    ).fetchone()
    if not row:
        return None
    return TagOut(
        id=row["id"], name=row["name"], color=row["color"], created_at=row["created_at"]
    )


def create_tag(conn: sqlite3.Connection, payload: TagCreateRequest) -> TagOut:
    canonical = normalize_tag_name(payload.name)
    if not canonical:
        raise ValueError(
            f"Tag must be one of: {', '.join(sorted(ALLOWED_TAG_NAMES))}"
        )
    existing = get_tag_by_name(conn, canonical)
    if existing:
        raise ValueError("Tag already exists")
    tag_id = str(uuid.uuid4())
    color = payload.color or DEFAULT_TAG_COLORS.get(canonical, "#64748b")
    created_at = _utc_now()
    conn.execute(
        "INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)",
        (tag_id, canonical, color, created_at),
    )
    return TagOut(id=tag_id, name=canonical, color=color, created_at=created_at)


def update_tag(conn: sqlite3.Connection, tag_id: str, payload: TagPatchRequest) -> TagOut:
    row = conn.execute("SELECT * FROM tags WHERE id = ?", (tag_id,)).fetchone()
    if not row:
        raise LookupError("Tag not found")

    if payload.name is not None and payload.name.strip().lower() != row["name"].lower():
        raise ValueError("Default tags cannot be renamed")

    new_name = row["name"]
    new_color = payload.color if payload.color is not None else row["color"]

    conn.execute(
        "UPDATE tags SET name = ?, color = ? WHERE id = ?", (new_name, new_color, tag_id)
    )
    job_ids = conn.execute(
        "SELECT job_id FROM job_tags WHERE tag_id = ?", (tag_id,)
    ).fetchall()
    for job in job_ids:
        rebuild_job_search_index(conn, job["job_id"])

    return TagOut(
        id=tag_id, name=new_name, color=new_color, created_at=row["created_at"]
    )


def delete_tag(conn: sqlite3.Connection, tag_id: str) -> None:
    row = conn.execute("SELECT name FROM tags WHERE id = ?", (tag_id,)).fetchone()
    if not row:
        raise LookupError("Tag not found")
    if row["name"].lower() in ALLOWED_TAG_NAMES:
        raise ValueError("Default tags cannot be deleted")


def add_tag_to_job(
    conn: sqlite3.Connection,
    job_id: str,
    tag_id: str,
    *,
    enforce_exclusive: bool = True,
) -> None:
    job = conn.execute(
        "SELECT id FROM jobs WHERE id = ? AND deleted_at IS NULL", (job_id,)
    ).fetchone()
    if not job:
        raise LookupError("Job not found")
    tag_row = conn.execute("SELECT id, name FROM tags WHERE id = ?", (tag_id,)).fetchone()
    if not tag_row:
        raise LookupError("Tag not found")

    canonical = normalize_tag_name(tag_row["name"])
    if not canonical:
        raise ValueError("Tag is not allowed")

    if enforce_exclusive:
        cat = tag_category(canonical)
        if cat == "location":
            conn.execute(
                f"""
                DELETE FROM job_tags
                WHERE job_id = ? AND tag_id IN (
                  SELECT id FROM tags WHERE LOWER(name) IN ({",".join("?" * len(LOCATION_TAGS))})
                )
                """,
                (job_id, *LOCATION_TAGS),
            )
        elif cat == "employment":
            conn.execute(
                f"""
                DELETE FROM job_tags
                WHERE job_id = ? AND tag_id IN (
                  SELECT id FROM tags WHERE LOWER(name) IN ({",".join("?" * len(EMPLOYMENT_TAGS))})
                )
                """,
                (job_id, *EMPLOYMENT_TAGS),
            )

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
    canonical = normalize_tag_name(name)
    if not canonical:
        raise ValueError(f"Unknown tag: {name}")
    existing = get_tag_by_name(conn, canonical)
    if existing:
        return existing
    return create_tag(conn, TagCreateRequest(name=canonical))
