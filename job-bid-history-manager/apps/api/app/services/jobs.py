from __future__ import annotations

import re
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

from app.schemas import (
    CaptureJobRequest,
    ColumnValueOptionOut,
    DashboardSummaryOut,
    JobListItemOut,
    JobListResponse,
    JobPatchRequest,
)
from app.services.extraction import PROMPT_VERSION, extract_job_data
from app.services.notes import upsert_job_note
from app.services.search_index import rebuild_job_search_index


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_user(conn: sqlite3.Connection, captured_by: str) -> None:
    existing = conn.execute("SELECT id FROM users WHERE display_name = ?", (captured_by,)).fetchone()
    if existing:
        return
    conn.execute(
        "INSERT INTO users (id, display_name, email, created_at) VALUES (?, ?, NULL, ?)",
        (str(uuid.uuid4()), captured_by, _utc_now()),
    )


async def capture_job(conn: sqlite3.Connection, payload: CaptureJobRequest) -> str:
    job_id = str(uuid.uuid4())
    now = _utc_now()
    ensure_user(conn, payload.captured_by)

    extraction, model_name, raw_json = await extract_job_data(
        payload.captured_text,
        payload.page_title,
        payload.source_url,
    )

    conn.execute(
        """
        INSERT INTO jobs (
            id, captured_by, company_name, job_title, location,
            salary_text, salary_min, salary_max, salary_currency,
            source_url, page_title, captured_at, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            job_id,
            payload.captured_by,
            extraction.company_name or None,
            extraction.job_title or None,
            extraction.location or None,
            extraction.salary_text or None,
            extraction.salary_min,
            extraction.salary_max,
            extraction.salary_currency or None,
            payload.source_url or None,
            payload.page_title or None,
            payload.captured_at,
            now,
            now,
        ),
    )

    conn.execute(
        """
        INSERT INTO job_capture_events (
            id, job_id, captured_by, source_url, page_title, captured_text,
            captured_at, extension_version, capture_method, raw_payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()),
            job_id,
            payload.captured_by,
            payload.source_url,
            payload.page_title,
            payload.captured_text,
            payload.captured_at,
            payload.extension_version,
            payload.capture_method,
            payload.raw_payload_json,
        ),
    )

    jd_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO job_descriptions (
            id, job_id, raw_text, cleaned_text, extracted_json,
            extracted_at, model_name, prompt_version, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            jd_id,
            job_id,
            payload.captured_text,
            extraction.cleaned_job_description or None,
            raw_json,
            now,
            model_name,
            PROMPT_VERSION,
            extraction.confidence,
        ),
    )

    rebuild_job_search_index(conn, job_id)
    return job_id


def _build_fts_query(term: str) -> str:
    tokens = []
    for part in re.split(r"\s+", term.strip()):
        cleaned = re.sub(r"[^\w\-@.]+", "", part)
        if cleaned:
            tokens.append(f'"{cleaned}"*')
    return " AND ".join(tokens) if tokens else f'"{term.strip()}"*'


def list_captured_by_users(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT DISTINCT captured_by
        FROM jobs
        WHERE deleted_at IS NULL
        ORDER BY captured_by COLLATE NOCASE
        """
    ).fetchall()
    return [r["captured_by"] for r in rows]


def patch_job(conn: sqlite3.Connection, job_id: str, payload: JobPatchRequest) -> JobListItemOut:
    row = conn.execute("SELECT * FROM jobs WHERE id = ? AND deleted_at IS NULL", (job_id,)).fetchone()
    if not row:
        raise LookupError("Job not found")

    updates: dict[str, object] = {}
    for field in ("captured_by", "company_name", "job_title", "location", "salary_text", "source_url"):
        value = getattr(payload, field)
        if value is not None:
            updates[field] = value

    if updates:
        if "captured_by" in updates:
            ensure_user(conn, str(updates["captured_by"]))
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        now = _utc_now()
        conn.execute(
            f"UPDATE jobs SET {set_clause}, updated_at = ? WHERE id = ?",
            [*updates.values(), now, job_id],
        )
        rebuild_job_search_index(conn, job_id)

    if payload.notes is not None:
        upsert_job_note(conn, job_id, payload.notes)

    item = get_job_by_id(conn, job_id)
    if not item:
        raise LookupError("Job not found after update")
    return item


def soft_delete_jobs(conn: sqlite3.Connection, job_ids: list[str]) -> int:
    now = _utc_now()
    count = 0
    for job_id in job_ids:
        cur = conn.execute(
            "UPDATE jobs SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
            (now, now, job_id),
        )
        if cur.rowcount:
            count += 1
            conn.execute("DELETE FROM search_index WHERE job_id = ?", (job_id,))
    return count


from app.services.column_query import (
    build_job_where,
    build_order_sql,
    list_column_values as query_column_values,
    parse_sort_param,
)


def list_jobs(
    conn: sqlite3.Connection,
    *,
    q: str | None = None,
    tags: list[str] | None = None,
    captured_by: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    columns: dict[str, str] | None = None,
    column_in: dict[str, list[str]] | None = None,
    sort: str | None = None,
    sort_by: str | None = None,
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 50,
) -> JobListResponse:
    where_sql, params = build_job_where(
        q=q,
        tags=tags,
        captured_by=captured_by,
        date_from=date_from,
        date_to=date_to,
        column_search=columns,
        column_in=column_in,
        _build_fts_query=_build_fts_query,
    )

    sort_entries = parse_sort_param(sort)
    order_sql = build_order_sql(sort_entries, sort_by, sort_dir)

    total = conn.execute(
        f"SELECT COUNT(*) AS c FROM jobs j WHERE {where_sql}",
        params,
    ).fetchone()["c"]

    offset = (page - 1) * page_size
    rows = conn.execute(
        f"""
        SELECT j.*
        FROM jobs j
        WHERE {where_sql}
        ORDER BY {order_sql}
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, offset],
    ).fetchall()

    items: list[JobListItemOut] = []
    for row in rows:
        job_id = row["id"]
        tag_rows = conn.execute(
            """
            SELECT t.id, t.name, t.color, t.created_at
            FROM job_tags jt
            JOIN tags t ON t.id = jt.tag_id
            WHERE jt.job_id = ?
            ORDER BY t.name
            """,
            (job_id,),
        ).fetchall()

        resume_row = conn.execute(
            """
            SELECT rf.id, rf.original_filename, rf.file_size, jr.linked_at
            FROM job_resumes jr
            JOIN resume_files rf ON rf.id = jr.resume_file_id
            WHERE jr.job_id = ?
            LIMIT 1
            """,
            (job_id,),
        ).fetchone()

        note_row = conn.execute(
            "SELECT body FROM notes WHERE job_id = ? ORDER BY updated_at DESC LIMIT 1",
            (job_id,),
        ).fetchone()

        jd_row = conn.execute(
            "SELECT id FROM job_descriptions WHERE job_id = ? LIMIT 1",
            (job_id,),
        ).fetchone()

        notes_body = note_row["body"] if note_row and note_row["body"] else None
        notes_preview = None
        if notes_body:
            notes_preview = notes_body if len(notes_body) <= 80 else notes_body[:77] + "…"

        items.append(
            JobListItemOut(
                id=job_id,
                captured_by=row["captured_by"],
                company_name=row["company_name"],
                job_title=row["job_title"],
                location=row["location"],
                salary_text=row["salary_text"],
                salary_min=row["salary_min"],
                salary_max=row["salary_max"],
                salary_currency=row["salary_currency"],
                source_url=row["source_url"],
                page_title=row["page_title"],
                captured_at=row["captured_at"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                tags=[
                    {
                        "id": t["id"],
                        "name": t["name"],
                        "color": t["color"],
                        "created_at": t["created_at"],
                    }
                    for t in tag_rows
                ],
                resume=(
                    {
                        "id": resume_row["id"],
                        "original_filename": resume_row["original_filename"],
                        "file_size": resume_row["file_size"],
                        "linked_at": resume_row["linked_at"],
                    }
                    if resume_row
                    else None
                ),
                notes_preview=notes_preview,
                notes=notes_body,
                has_jd=jd_row is not None,
            )
        )

    return JobListResponse(items=items, total=total, page=page, page_size=page_size)


def dashboard_summary(conn: sqlite3.Connection) -> DashboardSummaryOut:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (
        now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=now.weekday())
    ).isoformat()

    total_bids = conn.execute(
        "SELECT COUNT(*) AS c FROM jobs WHERE deleted_at IS NULL"
    ).fetchone()["c"]
    today_bids = conn.execute(
        "SELECT COUNT(*) AS c FROM jobs WHERE deleted_at IS NULL AND captured_at >= ?",
        (today_start,),
    ).fetchone()["c"]
    week_bids = conn.execute(
        "SELECT COUNT(*) AS c FROM jobs WHERE deleted_at IS NULL AND captured_at >= ?",
        (week_start,),
    ).fetchone()["c"]
    top_row = conn.execute(
        """
        SELECT captured_by, COUNT(*) AS c
        FROM jobs WHERE deleted_at IS NULL
        GROUP BY captured_by
        ORDER BY c DESC
        LIMIT 1
        """
    ).fetchone()
    total_companies = conn.execute(
        """
        SELECT COUNT(DISTINCT company_name) AS c
        FROM jobs
        WHERE deleted_at IS NULL AND company_name IS NOT NULL AND TRIM(company_name) != ''
        """
    ).fetchone()["c"]

    return DashboardSummaryOut(
        total_bids=total_bids,
        today_bids=today_bids,
        week_bids=week_bids,
        top_bidder=top_row["captured_by"] if top_row else None,
        total_companies=total_companies,
    )


def get_column_values(
    conn: sqlite3.Connection,
    field: str,
    *,
    q: str | None = None,
    tags: list[str] | None = None,
    captured_by: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    column_search: dict[str, str] | None = None,
    column_in: dict[str, list[str]] | None = None,
) -> list[ColumnValueOptionOut]:
    rows = query_column_values(
        conn,
        field,
        q=q,
        tags=tags,
        captured_by=captured_by,
        date_from=date_from,
        date_to=date_to,
        column_search=column_search,
        column_in=column_in,
        build_fts_query=_build_fts_query,
    )
    return [ColumnValueOptionOut(value=str(r["value"]), count=int(r["count"])) for r in rows]


def get_job_by_id(conn: sqlite3.Connection, job_id: str) -> JobListItemOut | None:
    items = list_jobs(conn, page=1, page_size=500).items
    for item in items:
        if item.id == job_id:
            return item
    return None
