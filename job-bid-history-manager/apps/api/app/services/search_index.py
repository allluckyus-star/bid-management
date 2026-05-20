"""FTS5 search index maintenance."""

from __future__ import annotations

import sqlite3


def rebuild_job_search_index(conn: sqlite3.Connection, job_id: str) -> None:
    row = conn.execute(
        """
        SELECT
            j.id,
            COALESCE(j.company_name, '') AS company_name,
            COALESCE(j.job_title, '') AS job_title,
            COALESCE(j.location, '') AS location,
            COALESCE(j.salary_text, '') AS salary_text,
            COALESCE(j.source_url, '') AS source_url,
            COALESCE(jd.cleaned_text, jd.raw_text, '') AS jd_text,
            COALESCE(rt.extracted_text, '') AS resume_text,
            COALESCE(rf.original_filename, '') AS resume_filename,
            COALESCE((
                SELECT GROUP_CONCAT(t.name, ' ')
                FROM job_tags jt
                JOIN tags t ON t.id = jt.tag_id
                WHERE jt.job_id = j.id
            ), '') AS tag_text,
            COALESCE((
                SELECT GROUP_CONCAT(n.body, ' ')
                FROM notes n
                WHERE n.job_id = j.id
            ), '') AS notes_text
        FROM jobs j
        LEFT JOIN job_descriptions jd ON jd.job_id = j.id
        LEFT JOIN job_resumes jr ON jr.job_id = j.id
        LEFT JOIN resume_files rf ON rf.id = jr.resume_file_id
        LEFT JOIN resume_texts rt ON rt.resume_file_id = rf.id
        WHERE j.id = ?
        """,
        (job_id,),
    ).fetchone()

    if not row:
        return

    conn.execute("DELETE FROM search_index WHERE job_id = ?", (job_id,))
    conn.execute(
        """
        INSERT INTO search_index (
            job_id, company_name, job_title, location, salary_text,
            source_url, jd_text, resume_text, resume_filename, tag_text, notes_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            row["id"],
            row["company_name"],
            row["job_title"],
            row["location"],
            row["salary_text"],
            row["source_url"],
            row["jd_text"],
            row["resume_text"],
            row["resume_filename"],
            row["tag_text"],
            row["notes_text"],
        ),
    )
