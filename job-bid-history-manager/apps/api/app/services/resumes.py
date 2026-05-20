from __future__ import annotations

import hashlib
import sqlite3
import uuid
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from docx import Document

from app.config import settings
from app.services.search_index import rebuild_job_search_index

ALLOWED_MIME = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_docx_text(data: bytes) -> str:
    doc = Document(BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def link_resume_to_job(
    conn: sqlite3.Connection,
    job_id: str,
    filename: str,
    file_bytes: bytes,
    mime_type: str | None,
) -> dict:
    if not filename.lower().endswith(".docx"):
        raise ValueError("Only .docx files are allowed")
    if len(file_bytes) > settings.max_resume_bytes:
        raise ValueError(f"File exceeds max size ({settings.max_resume_bytes} bytes)")

    job = conn.execute("SELECT id FROM jobs WHERE id = ? AND deleted_at IS NULL", (job_id,)).fetchone()
    if not job:
        raise LookupError("Job not found")

    resume_id = str(uuid.uuid4())
    storage_dir = settings.storage_dir / "resumes"
    storage_dir.mkdir(parents=True, exist_ok=True)
    dest = storage_dir / f"{resume_id}.docx"
    dest.write_bytes(file_bytes)

    sha = hashlib.sha256(file_bytes).hexdigest()
    extracted = _extract_docx_text(file_bytes)
    now = _utc_now()

    conn.execute(
        """
        INSERT INTO resume_files (
            id, original_filename, storage_path, mime_type, file_size, sha256_hash, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            resume_id,
            filename,
            str(dest),
            mime_type or "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            len(file_bytes),
            sha,
            now,
        ),
    )
    conn.execute(
        """
        INSERT INTO resume_texts (id, resume_file_id, extracted_text, extraction_method, extracted_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (str(uuid.uuid4()), resume_id, extracted, "python-docx", now),
    )

    existing = conn.execute(
        "SELECT resume_file_id FROM job_resumes WHERE job_id = ?", (job_id,)
    ).fetchall()
    for row in existing:
        unlink_resume_from_job(conn, job_id, row["resume_file_id"], delete_file=False)

    conn.execute(
        "INSERT INTO job_resumes (job_id, resume_file_id, linked_at) VALUES (?, ?, ?)",
        (job_id, resume_id, now),
    )
    rebuild_job_search_index(conn, job_id)
    return {"id": resume_id, "original_filename": filename, "file_size": len(file_bytes), "linked_at": now}


def unlink_resume_from_job(
    conn: sqlite3.Connection,
    job_id: str,
    resume_file_id: str | None = None,
    *,
    delete_file: bool = True,
) -> None:
    if resume_file_id:
        rows = [(job_id, resume_file_id)]
    else:
        rows = [
            (r["job_id"], r["resume_file_id"])
            for r in conn.execute(
                "SELECT job_id, resume_file_id FROM job_resumes WHERE job_id = ?", (job_id,)
            ).fetchall()
        ]
    if not rows:
        raise LookupError("No resume linked to this job")

    for jid, rid in rows:
        conn.execute("DELETE FROM job_resumes WHERE job_id = ? AND resume_file_id = ?", (jid, rid))
        if delete_file:
            file_row = conn.execute("SELECT storage_path FROM resume_files WHERE id = ?", (rid,)).fetchone()
            if file_row:
                path = Path(file_row["storage_path"])
                if path.exists():
                    path.unlink(missing_ok=True)
            conn.execute("DELETE FROM resume_texts WHERE resume_file_id = ?", (rid,))
            conn.execute("DELETE FROM resume_files WHERE id = ?", (rid,))
        rebuild_job_search_index(conn, jid)


def get_resume_preview(conn: sqlite3.Connection, resume_file_id: str) -> str:
    row = conn.execute(
        """
        SELECT rt.extracted_text
        FROM resume_texts rt
        WHERE rt.resume_file_id = ?
        ORDER BY rt.extracted_at DESC LIMIT 1
        """,
        (resume_file_id,),
    ).fetchone()
    if not row:
        raise LookupError("Resume not found")
    return row["extracted_text"]


def get_resume_file_path(conn: sqlite3.Connection, resume_file_id: str) -> tuple[Path, str]:
    row = conn.execute(
        "SELECT storage_path, original_filename FROM resume_files WHERE id = ?",
        (resume_file_id,),
    ).fetchone()
    if not row:
        raise LookupError("Resume not found")
    path = Path(row["storage_path"])
    if not path.exists():
        raise LookupError("Resume file missing on disk")
    return path, row["original_filename"]
