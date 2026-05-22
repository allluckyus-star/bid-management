"""Fixed job tags (location + employment) with auto-inference from JD."""

from __future__ import annotations

import re
import sqlite3

from app.schemas import JobExtractionResult

ALLOWED_TAG_NAMES: frozenset[str] = frozenset(
    {"remote", "onsite", "hybrid", "full-time", "part-time"}
)

LOCATION_TAGS: tuple[str, ...] = ("remote", "onsite", "hybrid")
EMPLOYMENT_TAGS: tuple[str, ...] = ("full-time", "part-time")

_TAG_ALIASES: dict[str, str] = {
    "hibrid": "hybrid",
    "on-site": "onsite",
    "on site": "onsite",
    "full time": "full-time",
    "fulltime": "full-time",
    "part time": "part-time",
    "parttime": "part-time",
}


def normalize_tag_name(name: str) -> str | None:
    key = name.strip().lower().replace("_", "-")
    key = re.sub(r"\s+", " ", key)
    if key in _TAG_ALIASES:
        key = _TAG_ALIASES[key]
    key = key.replace(" ", "-")
    if key in ALLOWED_TAG_NAMES:
        return key
    return None


def tag_category(name: str) -> str | None:
    n = normalize_tag_name(name)
    if not n:
        return None
    if n in LOCATION_TAGS:
        return "location"
    if n in EMPLOYMENT_TAGS:
        return "employment"
    return None


def infer_job_tags(
    location: str,
    employment_type: str,
    prepared_text: str,
) -> list[str]:
    """At most one location tag and one employment tag, or none."""
    blob = f"{location}\n{employment_type}\n{prepared_text}".lower()
    out: list[str] = []

    if re.search(r"\bhybrid\b", blob):
        out.append("hybrid")
    elif re.search(
        r"\bremote\b|work\s+from\s+home|\bwfh\b|fully\s+remote|100%\s+remote|telecommute",
        blob,
    ):
        out.append("remote")
    elif re.search(
        r"\bonsite\b|on-site\b|in[- ]office\b|in[- ]person\b|on\s+premises|office\s+based",
        blob,
    ):
        out.append("onsite")

    has_part = bool(re.search(r"\bpart[- ]?time\b|\bpt\b(?![a-z])", blob))
    has_full = bool(re.search(r"\bfull[- ]?time\b|\bft\b(?![a-z])", blob))
    if has_part and not has_full:
        out.append("part-time")
    elif has_full and not has_part:
        out.append("full-time")
    elif has_full and has_part:
        # Prefer explicit employment_type field
        et = employment_type.lower()
        if "part" in et:
            out.append("part-time")
        elif "full" in et:
            out.append("full-time")

    return out


def _remove_job_tags_in_categories(
    conn: sqlite3.Connection, job_id: str, categories: tuple[str, ...]
) -> None:
    names: list[str] = []
    if "location" in categories:
        names.extend(LOCATION_TAGS)
    if "employment" in categories:
        names.extend(EMPLOYMENT_TAGS)
    if not names:
        return
    placeholders = ",".join("?" * len(names))
    conn.execute(
        f"""
        DELETE FROM job_tags
        WHERE job_id = ?
          AND tag_id IN (
            SELECT id FROM tags WHERE LOWER(name) IN ({placeholders})
          )
        """,
        (job_id, *names),
    )


def apply_inferred_tags_to_job(
    conn: sqlite3.Connection,
    job_id: str,
    extraction: JobExtractionResult,
    prepared_text: str,
) -> list[str]:
    """Replace location/employment tags with values inferred from JD."""
    from app.services.tags import add_tag_to_job, ensure_default_tags, get_tag_by_name

    ensure_default_tags(conn)
    tag_names = infer_job_tags(
        extraction.location or "",
        extraction.employment_type or "",
        prepared_text,
    )
    _remove_job_tags_in_categories(conn, job_id, ("location", "employment"))
    applied: list[str] = []
    for name in tag_names:
        tag = get_tag_by_name(conn, name)
        if tag:
            add_tag_to_job(conn, job_id, tag.id, enforce_exclusive=False)
            applied.append(name)
    return applied
