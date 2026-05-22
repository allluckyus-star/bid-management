from __future__ import annotations

import sqlite3

BLANK = "(Blank)"


def parse_column_search_from_query(
    *,
    col_captured_at: str | None = None,
    col_captured_by: str | None = None,
    col_company_name: str | None = None,
    col_job_title: str | None = None,
    col_location: str | None = None,
    col_salary_text: str | None = None,
    col_tags: str | None = None,
    col_resume: str | None = None,
    col_jd: str | None = None,
    col_source_url: str | None = None,
    col_notes: str | None = None,
) -> dict[str, str] | None:
    raw = {
        "captured_at": col_captured_at,
        "captured_by": col_captured_by,
        "company_name": col_company_name,
        "job_title": col_job_title,
        "location": col_location,
        "salary_text": col_salary_text,
        "tags": col_tags,
        "resume": col_resume,
        "jd": col_jd,
        "source_url": col_source_url,
        "notes": col_notes,
    }
    columns = {k: v.strip() for k, v in raw.items() if v and v.strip()}
    return columns or None


def parse_column_in_from_query(
    *,
    col_in_captured_by: str | None = None,
    col_in_company_name: str | None = None,
    col_in_job_title: str | None = None,
    col_in_location: str | None = None,
    col_in_salary_text: str | None = None,
    col_in_tags: str | None = None,
) -> dict[str, list[str]] | None:
    raw = {
        "captured_by": col_in_captured_by,
        "company_name": col_in_company_name,
        "job_title": col_in_job_title,
        "location": col_in_location,
        "salary_text": col_in_salary_text,
        "tags": col_in_tags,
    }
    result: dict[str, list[str]] = {}
    for key, val in raw.items():
        if val and val.strip():
            result[key] = [p for p in val.split("|") if p != ""]
    return result or None

FILTERABLE_FIELDS = frozenset(
    {"captured_by", "company_name", "job_title", "location", "salary_text", "tags"}
)

_SORT_COLUMNS: dict[str, str] = {
    "captured_at": "j.captured_at",
    "captured_by": "j.captured_by COLLATE NOCASE",
    "company_name": "j.company_name COLLATE NOCASE",
    "job_title": "j.job_title COLLATE NOCASE",
    "location": "j.location COLLATE NOCASE",
    "salary_text": "j.salary_text COLLATE NOCASE",
    "source_url": "j.source_url COLLATE NOCASE",
    "tags": """(
        SELECT GROUP_CONCAT(t.name, ', ')
        FROM job_tags jt JOIN tags t ON t.id = jt.tag_id
        WHERE jt.job_id = j.id
    ) COLLATE NOCASE""",
    "resume": """(
        SELECT rf.original_filename
        FROM job_resumes jr
        JOIN resume_files rf ON rf.id = jr.resume_file_id
        WHERE jr.job_id = j.id LIMIT 1
    ) COLLATE NOCASE""",
    "jd": """(
        SELECT CASE WHEN EXISTS(
            SELECT 1 FROM job_descriptions jd WHERE jd.job_id = j.id
        ) THEN 1 ELSE 0 END
    )""",
    "notes": """(
        SELECT body FROM notes WHERE job_id = j.id
        ORDER BY updated_at DESC LIMIT 1
    ) COLLATE NOCASE""",
}

_DISPLAY_COLS = {
    "captured_by": "j.captured_by",
    "company_name": "j.company_name",
    "job_title": "j.job_title",
    "location": "j.location",
    "salary_text": "j.salary_text",
}


def _display_expr(col_sql: str) -> str:
    return f"COALESCE(NULLIF(TRIM({col_sql}), ''), '{BLANK}')"


def parse_sort_param(sort: str | None) -> list[tuple[str, str]]:
    if not sort or not sort.strip():
        return []
    entries: list[tuple[str, str]] = []
    for part in sort.split(","):
        piece = part.strip()
        if ":" not in piece:
            continue
        field, direction = piece.rsplit(":", 1)
        field, direction = field.strip(), direction.strip().lower()
        if field in _SORT_COLUMNS and direction in ("asc", "desc"):
            entries.append((field, direction))
    return entries


def build_order_sql(
    sort_entries: list[tuple[str, str]] | None,
    sort_by: str | None = None,
    sort_dir: str = "desc",
) -> str:
    parts: list[str] = []
    if sort_entries:
        for field, direction in sort_entries:
            col = _SORT_COLUMNS.get(field)
            if col:
                d = "ASC" if direction == "asc" else "DESC"
                parts.append(f"{col} {d}")
    elif sort_by and sort_by in _SORT_COLUMNS:
        d = "ASC" if (sort_dir or "desc").lower() == "asc" else "DESC"
        parts.append(f"{_SORT_COLUMNS[sort_by]} {d}")

    if not parts:
        return "j.captured_at DESC"
    if not any("captured_at" in p for p in parts):
        parts.append("j.captured_at DESC")
    return ", ".join(parts)


def apply_column_search(
    where: list[str],
    params: list[object],
    column_search: dict[str, str] | None,
) -> None:
    if not column_search:
        return

    text_cols = {
        "captured_at": "j.captured_at",
        "captured_by": "j.captured_by",
        "company_name": "j.company_name",
        "job_title": "j.job_title",
        "location": "j.location",
        "salary_text": "j.salary_text",
        "source_url": "j.source_url",
    }
    for key, col_sql in text_cols.items():
        val = (column_search.get(key) or "").strip()
        if val:
            where.append(f"LOWER(COALESCE({col_sql}, '')) LIKE LOWER(?)")
            params.append(f"%{val}%")

    tags_val = (column_search.get("tags") or "").strip()
    if tags_val:
        where.append(
            """
            EXISTS (
                SELECT 1 FROM job_tags jt
                JOIN tags t ON t.id = jt.tag_id
                WHERE jt.job_id = j.id AND LOWER(t.name) LIKE LOWER(?)
            )
            """
        )
        params.append(f"%{tags_val}%")

    notes_val = (column_search.get("notes") or "").strip()
    if notes_val:
        where.append(
            """
            EXISTS (
                SELECT 1 FROM notes n
                WHERE n.job_id = j.id AND LOWER(COALESCE(n.body, '')) LIKE LOWER(?)
            )
            """
        )
        params.append(f"%{notes_val}%")

    resume_val = (column_search.get("resume") or "").strip().lower()
    if resume_val:
        if resume_val in {"yes", "y", "1", "true", "has"}:
            where.append("EXISTS (SELECT 1 FROM job_resumes jr WHERE jr.job_id = j.id)")
        elif resume_val in {"no", "n", "0", "false", "none", "empty"}:
            where.append("NOT EXISTS (SELECT 1 FROM job_resumes jr WHERE jr.job_id = j.id)")
        else:
            where.append(
                """
                EXISTS (
                    SELECT 1 FROM job_resumes jr
                    JOIN resume_files rf ON rf.id = jr.resume_file_id
                    WHERE jr.job_id = j.id
                    AND LOWER(rf.original_filename) LIKE LOWER(?)
                )
                """
            )
            params.append(f"%{resume_val}%")

    jd_val = (column_search.get("jd") or "").strip().lower()
    if jd_val:
        if jd_val in {"yes", "y", "1", "true", "has"}:
            where.append("EXISTS (SELECT 1 FROM job_descriptions jd WHERE jd.job_id = j.id)")
        elif jd_val in {"no", "n", "0", "false", "none", "empty"}:
            where.append("NOT EXISTS (SELECT 1 FROM job_descriptions jd WHERE jd.job_id = j.id)")
        else:
            where.append(
                """
                EXISTS (
                    SELECT 1 FROM job_descriptions jd
                    WHERE jd.job_id = j.id
                    AND LOWER(COALESCE(jd.cleaned_text, '')) LIKE LOWER(?)
                )
                """
            )
            params.append(f"%{jd_val}%")


def apply_column_in(
    where: list[str],
    params: list[object],
    column_in: dict[str, list[str]] | None,
    *,
    skip_field: str | None = None,
) -> None:
    if not column_in:
        return

    for key, values in column_in.items():
        if key not in FILTERABLE_FIELDS or key == skip_field:
            continue
        cleaned = [v for v in values if v is not None and str(v).strip() != ""]
        if not cleaned:
            continue

        if key == "tags":
            placeholders = ", ".join("?" * len(cleaned))
            where.append(
                f"""
                EXISTS (
                    SELECT 1 FROM job_tags jt
                    JOIN tags t ON t.id = jt.tag_id
                    WHERE jt.job_id = j.id AND t.name IN ({placeholders})
                )
                """
            )
            params.extend(cleaned)
            continue

        col_sql = _DISPLAY_COLS.get(key)
        if not col_sql:
            continue
        expr = _display_expr(col_sql)
        placeholders = ", ".join("?" * len(cleaned))
        where.append(f"{expr} IN ({placeholders})")
        params.extend(cleaned)


def build_job_where(
    *,
    q: str | None = None,
    tags: list[str] | None = None,
    captured_by: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    column_search: dict[str, str] | None = None,
    column_in: dict[str, list[str]] | None = None,
    skip_column_in: str | None = None,
    _build_fts_query,
) -> tuple[str, list[object]]:
    where = ["j.deleted_at IS NULL"]
    params: list[object] = []

    if captured_by:
        where.append("j.captured_by = ?")
        params.append(captured_by)

    if date_from:
        where.append("j.captured_at >= ?")
        params.append(date_from)

    if date_to:
        where.append("j.captured_at <= ?")
        params.append(date_to)

    if tags:
        for tag in tags:
            where.append(
                """
                EXISTS (
                    SELECT 1 FROM job_tags jt
                    JOIN tags t ON t.id = jt.tag_id
                    WHERE jt.job_id = j.id AND LOWER(t.name) = LOWER(?)
                )
                """
            )
            params.append(tag)

    if q and q.strip():
        term = q.strip()
        fts_query = _build_fts_query(term)
        where.append(
            """
            (
                j.id IN (
                    SELECT job_id FROM search_index
                    WHERE search_index MATCH ?
                )
                OR LOWER(COALESCE(j.company_name, '')) LIKE LOWER(?)
                OR LOWER(COALESCE(j.job_title, '')) LIKE LOWER(?)
                OR LOWER(COALESCE(j.location, '')) LIKE LOWER(?)
                OR LOWER(COALESCE(j.salary_text, '')) LIKE LOWER(?)
                OR LOWER(COALESCE(j.source_url, '')) LIKE LOWER(?)
                OR LOWER(COALESCE(j.captured_by, '')) LIKE LOWER(?)
            )
            """
        )
        like = f"%{term}%"
        params.extend([fts_query, like, like, like, like, like, like])

    apply_column_search(where, params, column_search)
    apply_column_in(where, params, column_in, skip_field=skip_column_in)

    return " AND ".join(where), params


def list_column_values(
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
    build_fts_query,
) -> list[dict[str, object]]:
    if field not in FILTERABLE_FIELDS:
        return []

    where_sql, params = build_job_where(
        q=q,
        tags=tags,
        captured_by=captured_by,
        date_from=date_from,
        date_to=date_to,
        column_search=column_search,
        column_in=column_in,
        skip_column_in=field,
        _build_fts_query=build_fts_query,
    )

    if field == "tags":
        sql = f"""
            SELECT t.name AS value, COUNT(DISTINCT j.id) AS count
            FROM jobs j
            JOIN job_tags jt ON jt.job_id = j.id
            JOIN tags t ON t.id = jt.tag_id
            WHERE {where_sql}
            GROUP BY t.name
            ORDER BY count DESC, value COLLATE NOCASE
            LIMIT 200
        """
    else:
        col_sql = _DISPLAY_COLS[field]
        expr = _display_expr(col_sql)
        sql = f"""
            SELECT {expr} AS value, COUNT(*) AS count
            FROM jobs j
            WHERE {where_sql}
            GROUP BY {expr}
            ORDER BY count DESC, value COLLATE NOCASE
            LIMIT 200
        """

    rows = conn.execute(sql, params).fetchall()
    return [{"value": row["value"] or BLANK, "count": row["count"]} for row in rows]
