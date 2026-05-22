"""Insert rich sample jobs for chart/table demos."""

from __future__ import annotations

import json
import random
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

from app.services.extraction import PROMPT_VERSION
from app.services.job_tags import infer_job_tags
from app.services.notes import upsert_job_note
from app.services.search_index import rebuild_job_search_index
from app.services.tags import ensure_default_tags, get_or_create_tag_by_name

SAMPLE_USERS = ["Alice Chen", "Bob Rivera", "Carol Kim"]

SAMPLE_JOBS = [
    ("Acme Corp", "Senior Software Engineer", "Remote · US", "$140,000-$180,000"),
    ("Globex Systems", "Backend Developer", "New York, NY", "$120,000-$150,000"),
    ("Initech", "Full Stack Engineer", "Austin, TX · Hybrid", "$110,000-$130,000"),
    ("Umbrella Labs", "Platform Engineer", "Remote", "$150,000-$175,000"),
    ("Stark Industries", "Cloud Architect", "Seattle, WA", "$160,000-$190,000"),
    ("Wayne Enterprises", "DevOps Engineer", "Chicago, IL", "$115,000-$140,000"),
    ("Hooli", "Staff Engineer", "San Francisco, CA", "$180,000-$220,000"),
    ("Pied Piper", "React Developer", "Remote · EU", "$95,000-$115,000"),
    ("Massive Dynamic", "ML Engineer", "Boston, MA", "$130,000-$160,000"),
    ("Cyberdyne", "Security Engineer", "Remote · US", "$125,000-$155,000"),
    ("Wonka Digital", "Product Engineer", "Denver, CO", "$105,000-$125,000"),
    ("Oscorp", "Data Engineer", "Portland, OR · Hybrid", "$118,000-$138,000"),
]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tags_for_location(location: str) -> list[str]:
    return infer_job_tags(location, "full-time", location)


def _insert_job(
    conn: sqlite3.Connection,
    *,
    captured_by: str,
    company: str,
    title: str,
    location: str,
    salary: str,
    captured_at: datetime,
    tag_names: list[str] | None = None,
    notes: str | None = None,
) -> str:
    job_id = str(uuid.uuid4())
    now = _utc_now()
    cap_iso = captured_at.isoformat()
    jd_body = (
        f"{title}\n{company}\n{location}\n{salary}\n\n"
        f"We are hiring for {title} at {company}. Full-time role. "
        f"Requirements include Python, React, Azure, and team collaboration."
    )
    tags = tag_names if tag_names is not None else _tags_for_location(location)

    conn.execute(
        """
        INSERT INTO users (id, display_name, email, created_at)
        SELECT ?, ?, NULL, ?
        WHERE NOT EXISTS (SELECT 1 FROM users WHERE display_name = ?)
        """,
        (str(uuid.uuid4()), captured_by, now, captured_by),
    )

    conn.execute(
        """
        INSERT INTO jobs (
            id, captured_by, company_name, job_title, location,
            salary_text, salary_min, salary_max, salary_currency,
            source_url, page_title, captured_at, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 'USD', ?, ?, ?, ?, ?, NULL)
        """,
        (
            job_id,
            captured_by,
            company,
            title,
            location,
            salary,
            f"https://careers.example.com/{company.lower().replace(' ', '-')}/{job_id[:8]}",
            f"{title} — {company}",
            cap_iso,
            now,
            now,
        ),
    )

    conn.execute(
        """
        INSERT INTO job_capture_events (
            id, job_id, captured_by, source_url, page_title, captured_text,
            captured_at, extension_version, capture_method, raw_payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, '0.3.0', 'seed', NULL)
        """,
        (
            str(uuid.uuid4()),
            job_id,
            captured_by,
            f"https://careers.example.com/jobs/{job_id[:8]}",
            f"{title} — {company}",
            jd_body,
            cap_iso,
        ),
    )

    conn.execute(
        """
        INSERT INTO job_descriptions (
            id, job_id, raw_text, cleaned_text, extracted_json,
            extracted_at, model_name, prompt_version, confidence
        ) VALUES (?, ?, ?, ?, ?, ?, 'seed', ?, 0.9)
        """,
        (
            str(uuid.uuid4()),
            job_id,
            jd_body,
            jd_body,
            json.dumps({"company_name": company, "job_title": title}),
            now,
            PROMPT_VERSION,
        ),
    )

    for tag_name in tags:
        tag = get_or_create_tag_by_name(conn, tag_name)
        conn.execute(
            "INSERT OR IGNORE INTO job_tags (job_id, tag_id, created_at) VALUES (?, ?, ?)",
            (job_id, tag.id, now),
        )

    if notes:
        upsert_job_note(conn, job_id, notes)

    rebuild_job_search_index(conn, job_id)
    return job_id


def seed_sample_data(conn: sqlite3.Connection, *, reset: bool = False) -> dict:
    if reset:
        conn.execute("DELETE FROM search_index")
        for table in (
            "job_tags",
            "notes",
            "job_resumes",
            "resume_texts",
            "resume_files",
            "job_descriptions",
            "job_capture_events",
            "jobs",
        ):
            conn.execute(f"DELETE FROM {table}")
        conn.execute("DELETE FROM users")

    ensure_default_tags(conn)

    now = datetime.now(timezone.utc)
    rng = random.Random(42)
    job_ids: list[str] = []

    for day_offset in range(45, -1, -1):
        day = now - timedelta(days=day_offset)
        count = rng.randint(0, 3) if day.weekday() < 5 else rng.randint(0, 1)
        for _ in range(count):
            company, title, location, salary = rng.choice(SAMPLE_JOBS)
            user = SAMPLE_USERS[(day_offset + count) % len(SAMPLE_USERS)]
            hour = rng.randint(9, 18)
            minute = rng.choice([0, 15, 30, 45])
            captured_at = day.replace(hour=hour, minute=minute, second=0, microsecond=0)

            notes = None
            if rng.random() > 0.6:
                notes = rng.choice(
                    [
                        "Applied through LinkedIn — waiting for recruiter.",
                        "Need follow-up next Monday.",
                        "Recruiter asked about Azure and FastAPI experience.",
                        "Good fit but salary slightly below target.",
                        "Phone screen scheduled; prep system design.",
                    ]
                )

            jid = _insert_job(
                conn,
                captured_by=user,
                company=company,
                title=title,
                location=location,
                salary=salary,
                captured_at=captured_at,
                notes=notes,
            )
            job_ids.append(jid)

    for i in range(3):
        company, title, location, salary = SAMPLE_JOBS[i]
        captured_at = now - timedelta(hours=i + 1)
        jid = _insert_job(
            conn,
            captured_by=SAMPLE_USERS[i % 3],
            company=company,
            title=title,
            location=location,
            salary=salary,
            captured_at=captured_at,
            notes="Captured today for demo.",
        )
        job_ids.append(jid)

    return {
        "jobs_created": len(job_ids),
        "users": SAMPLE_USERS,
    }
