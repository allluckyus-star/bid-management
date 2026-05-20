from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone

from app.schemas import JDOut, JobExtractionResult
from app.services.extraction import PROMPT_VERSION, extract_job_data
from app.services.search_index import rebuild_job_search_index


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_job_jd(conn: sqlite3.Connection, job_id: str) -> JDOut:
    row = conn.execute(
        """
        SELECT raw_text, cleaned_text, extracted_json, extracted_at, model_name
        FROM job_descriptions WHERE job_id = ? ORDER BY extracted_at DESC LIMIT 1
        """,
        (job_id,),
    ).fetchone()
    if not row:
        raise LookupError("Job description not found")

    extracted = None
    if row["extracted_json"]:
        try:
            extracted = json.loads(row["extracted_json"])
        except json.JSONDecodeError:
            extracted = None

    return JDOut(
        raw_text=row["raw_text"],
        cleaned_text=row["cleaned_text"],
        extracted_json=extracted,
        extracted_at=row["extracted_at"],
        model_name=row["model_name"],
    )


async def reextract_job_jd(conn: sqlite3.Connection, job_id: str) -> tuple[JDOut, JobExtractionResult]:
    job = conn.execute(
        "SELECT id, source_url, page_title FROM jobs WHERE id = ? AND deleted_at IS NULL",
        (job_id,),
    ).fetchone()
    if not job:
        raise LookupError("Job not found")

    jd = conn.execute(
        "SELECT raw_text FROM job_descriptions WHERE job_id = ? ORDER BY extracted_at DESC LIMIT 1",
        (job_id,),
    ).fetchone()
    if not jd:
        raise LookupError("Job description not found")

    extraction, model_name, raw_json = await extract_job_data(
        jd["raw_text"],
        job["page_title"] or "",
        job["source_url"] or "",
    )

    now = _utc_now()
    conn.execute(
        """
        UPDATE jobs SET
            company_name = ?, job_title = ?, location = ?,
            salary_text = ?, salary_min = ?, salary_max = ?, salary_currency = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (
            extraction.company_name or None,
            extraction.job_title or None,
            extraction.location or None,
            extraction.salary_text or None,
            extraction.salary_min,
            extraction.salary_max,
            extraction.salary_currency or None,
            now,
            job_id,
        ),
    )

    conn.execute(
        """
        INSERT INTO job_descriptions (
            id, job_id, raw_text, cleaned_text, extracted_json,
            extracted_at, model_name, prompt_version, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()),
            job_id,
            jd["raw_text"],
            extraction.cleaned_job_description or None,
            raw_json,
            now,
            model_name,
            PROMPT_VERSION,
            extraction.confidence,
        ),
    )

    rebuild_job_search_index(conn, job_id)
    return get_job_jd(conn, job_id), extraction
