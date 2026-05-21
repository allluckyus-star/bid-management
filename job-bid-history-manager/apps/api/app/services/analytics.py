from __future__ import annotations

import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from app.schemas import TimelineBucketOut, TimelineCompanyOut, TimelineResponse, TimelineSeriesOut
from app.services.column_query import build_job_where

BUCKET_SECONDS = {
    "1h": 3600,
    "1d": 86400,
}

VALID_BUCKETS = frozenset({*BUCKET_SECONDS.keys(), "1month"})

MAX_TIMELINE_BUCKETS: dict[str, int] = {
    "1h": 744,   # up to ~31 days of hours when client requests a range
    "1d": 366,
    "1month": 120,
}

# Default lookback when client does not pass start/end (client normally sends an explicit range)
DEFAULT_LOOKBACK: dict[str, timedelta] = {
    "1h": timedelta(days=7),
    "1d": timedelta(days=30),
    "1month": timedelta(days=180),
}


def _parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _ensure_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _local_midnight(dt: datetime) -> datetime:
    """Start of calendar day in server local timezone (matches desktop +1 demo)."""
    local = _ensure_aware(dt).astimezone()
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


def _local_day_slot_iso(local_midnight: datetime) -> str:
    """Naive local ISO so the chart parses the bucket as local midnight."""
    return local_midnight.strftime("%Y-%m-%dT00:00:00")


def _floor_bucket(dt: datetime, bucket: str) -> datetime:
    if bucket == "1month":
        return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
    if bucket == "1d":
        return _local_midnight(dt)
    bucket_sec = BUCKET_SECONDS[bucket]
    ts = int(_ensure_aware(dt).timestamp())
    floored = ts - (ts % bucket_sec)
    return datetime.fromtimestamp(floored, tz=timezone.utc)


def _add_bucket(dt: datetime, bucket: str) -> datetime:
    if bucket == "1month":
        if dt.month == 12:
            return dt.replace(year=dt.year + 1, month=1, day=1)
        return dt.replace(month=dt.month + 1, day=1)
    if bucket == "1d":
        return dt + timedelta(days=1)
    return dt + timedelta(seconds=BUCKET_SECONDS[bucket])


def _last_day_of_month(bucket_start: datetime) -> datetime:
    if bucket_start.month == 12:
        first_next = bucket_start.replace(year=bucket_start.year + 1, month=1, day=1)
    else:
        first_next = bucket_start.replace(month=bucket_start.month + 1, day=1)
    return first_next - timedelta(days=1)


def _bucket_end_inclusive(bucket_start: datetime, bucket: str) -> datetime:
    if bucket == "1month":
        last_day = _last_day_of_month(bucket_start)
        return last_day.replace(
            hour=23,
            minute=59,
            second=59,
            microsecond=999999,
            tzinfo=timezone.utc,
        )
    if bucket == "1d":
        return bucket_start.replace(
            hour=23,
            minute=59,
            second=59,
            microsecond=999999,
        )
    return _add_bucket(bucket_start, bucket) - timedelta(microseconds=1)


def _subtract_months(dt: datetime, months: int) -> datetime:
    month_index = dt.year * 12 + (dt.month - 1) - months
    year = month_index // 12
    month = month_index % 12 + 1
    return dt.replace(year=year, month=month, day=1, tzinfo=timezone.utc)


def _iter_bucket_starts(start_dt: datetime, end_dt: datetime, bucket: str) -> list[str]:
    current = _floor_bucket(start_dt, bucket)
    end_floor = _floor_bucket(end_dt, bucket)
    slots: list[str] = []
    while current <= end_floor:
        if bucket == "1d":
            slots.append(_local_day_slot_iso(current))
        else:
            slots.append(current.isoformat())
        current = _add_bucket(current, bucket)
    return slots


def _clamp_start_for_max_buckets(start_dt: datetime, end_dt: datetime, bucket: str) -> datetime:
    max_buckets = MAX_TIMELINE_BUCKETS.get(bucket, 500)
    if bucket == "1month":
        min_start = _subtract_months(_floor_bucket(end_dt, bucket), max_buckets - 1)
        return max(start_dt, min_start)
    max_span = timedelta(seconds=BUCKET_SECONDS[bucket] * max_buckets)
    if end_dt - start_dt > max_span:
        return end_dt - max_span
    return start_dt


def _view_future_end(now: datetime, bucket: str) -> datetime:
    if bucket == "1month":
        cur = _floor_bucket(now, bucket)
        after_next = _add_bucket(_add_bucket(cur, bucket), bucket)
        return after_next - timedelta(microseconds=1)
    if bucket == "1d":
        return now + timedelta(days=10)
    if bucket == "1h":
        return now + timedelta(hours=8)
    return now


def _default_range_start(now: datetime, bucket: str, global_min: datetime | None) -> datetime:
    lookback = DEFAULT_LOOKBACK.get(bucket, timedelta(days=90))
    floor_now = _floor_bucket(now - lookback, bucket)
    if global_min is None:
        return floor_now
    return max(_floor_bucket(global_min, bucket), floor_now)


def _sql_bucket_expr(bucket: str) -> str:
    if bucket == "1month":
        return "strftime('%Y-%m-01T00:00:00Z', j.captured_at)"
    if bucket == "1d":
        return "strftime('%Y-%m-%d', j.captured_at, 'localtime')"
    sec = BUCKET_SECONDS[bucket]
    return (
        f"strftime('%Y-%m-%dT%H:%M:%SZ', "
        f"datetime((CAST(strftime('%s', j.captured_at) AS INTEGER) / {sec}) * {sec}, 'unixepoch'))"
    )


def _bucket_key_from_sql(value: str, bucket: str) -> str:
    if not value:
        return value
    if bucket == "1d" and len(value) == 10 and value[4] == "-":
        return f"{value}T00:00:00"
    if value.endswith("Z") or "+" in value:
        floored = _floor_bucket(_parse_dt(value), bucket)
        if bucket == "1d":
            return _local_day_slot_iso(floored)
        return floored.isoformat()
    if bucket == "1d":
        return _local_day_slot_iso(_floor_bucket(_parse_dt(value.replace(" ", "T") + "+00:00"), bucket))
    return _floor_bucket(_parse_dt(value.replace(" ", "T") + "+00:00"), bucket).isoformat()


def _aggregate_timeline(
    conn: sqlite3.Connection,
    *,
    where_sql: str,
    params: list,
    bucket: str,
    include_companies: bool,
) -> tuple[dict[tuple[str, str], int], dict[tuple[str, str], dict[str, int]], set[str]]:
    counts: dict[tuple[str, str], int] = defaultdict(int)
    companies: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: defaultdict(int))
    users: set[str] = set()
    bucket_expr = _sql_bucket_expr(bucket)

    if include_companies:
        rows = conn.execute(
            f"""
            SELECT {bucket_expr} AS bucket_start, j.captured_by, j.company_name, COUNT(*) AS n
            FROM jobs j
            WHERE {where_sql}
            GROUP BY bucket_start, j.captured_by, j.company_name
            """,
            params,
        ).fetchall()
        for row in rows:
            user = row["captured_by"]
            users.add(user)
            key = (_bucket_key_from_sql(row["bucket_start"], bucket), user)
            n = int(row["n"])
            counts[key] += n
            company = (row["company_name"] or "Unknown").strip() or "Unknown"
            companies[key][company] += n
    else:
        rows = conn.execute(
            f"""
            SELECT {bucket_expr} AS bucket_start, j.captured_by, COUNT(*) AS n
            FROM jobs j
            WHERE {where_sql}
            GROUP BY bucket_start, j.captured_by
            """,
            params,
        ).fetchall()
        for row in rows:
            user = row["captured_by"]
            users.add(user)
            key = (_bucket_key_from_sql(row["bucket_start"], bucket), user)
            counts[key] += int(row["n"])

    return counts, companies, users


def _global_data_extent(conn: sqlite3.Connection) -> tuple[datetime | None, datetime | None]:
    row = conn.execute(
        "SELECT MIN(j.captured_at), MAX(j.captured_at) FROM jobs j",
    ).fetchone()
    if not row or not row[0] or not row[1]:
        return None, None
    return _parse_dt(row[0]), _parse_dt(row[1])


def timeline_analytics(
    conn: sqlite3.Connection,
    *,
    start: str | None = None,
    end: str | None = None,
    bucket: str = "1d",
    captured_by: str | None = None,
    tags: list[str] | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    column_search: dict[str, str] | None = None,
    column_in: dict[str, list[str]] | None = None,
    build_fts_query,
) -> TimelineResponse:
    """Full-history bar counts; filter params only affect table_count highlight."""

    if bucket not in VALID_BUCKETS:
        bucket = "1d"

    now = datetime.now(timezone.utc)
    global_min, global_max = _global_data_extent(conn)

    explicit_window = bool(start and end)

    if end:
        end_dt = _parse_dt(end)
    elif global_max:
        end_dt = _add_bucket(_floor_bucket(global_max, bucket), bucket)
    else:
        end_dt = now

    if start:
        start_dt = _parse_dt(start)
    else:
        start_dt = _default_range_start(now, bucket, global_min)

    if start_dt > end_dt:
        start_dt = end_dt - timedelta(days=1)

    start_dt = _clamp_start_for_max_buckets(start_dt, end_dt, bucket)

    where_sql, params = build_job_where(
        date_from=start_dt.isoformat(),
        date_to=end_dt.isoformat(),
        _build_fts_query=build_fts_query,
    )

    if not explicit_window:
        view_future_floor = _floor_bucket(_view_future_end(now, bucket), bucket)
        end_dt = max(end_dt, view_future_floor)

    include_companies = bucket != "1h"
    counts, companies, users = _aggregate_timeline(
        conn,
        where_sql=where_sql,
        params=list(params),
        bucket=bucket,
        include_companies=include_companies,
    )

    if users and not explicit_window:
        data_min = min(_parse_dt(k[0]) for k in counts if k[0]) if counts else start_dt
        data_max_key = max(k[0] for k in counts if k[0]) if counts else end_dt.isoformat()
        data_max = _add_bucket(_parse_dt(data_max_key), bucket)
        start_dt = max(start_dt, _floor_bucket(data_min, bucket))
        end_dt = max(end_dt, data_max, view_future_floor)
        start_dt = _clamp_start_for_max_buckets(start_dt, end_dt, bucket)
    elif users:
        # Client window (e.g. May 5–May 18): keep requested span; slots include empty hours
        pass
    else:
        users = {
            u
            for (u,) in conn.execute(
                "SELECT DISTINCT captured_by FROM jobs WHERE deleted_at IS NULL"
            ).fetchall()
        }

    table_counts: dict[tuple[str, str], int] = defaultdict(int)
    has_table_filters = bool(
        tags
        or captured_by
        or date_from
        or date_to
        or column_search
        or column_in
    )
    if has_table_filters:
        where_table_sql, params_table = build_job_where(
            tags=tags,
            captured_by=captured_by,
            date_from=date_from,
            date_to=date_to,
            column_search=column_search,
            column_in=column_in,
            _build_fts_query=build_fts_query,
        )
        where_table_sql = f"({where_table_sql}) AND j.captured_at >= ? AND j.captured_at <= ?"
        params_table = [*params_table, start_dt.isoformat(), end_dt.isoformat()]
        _, table_agg, table_users = _aggregate_timeline(
            conn,
            where_sql=where_table_sql,
            params=params_table,
            bucket=bucket,
            include_companies=False,
        )
        table_counts = table_agg
        users |= table_users

    all_slots = _iter_bucket_starts(start_dt, end_dt, bucket)
    history_start = global_min.isoformat() if global_min else None
    history_end = global_max.isoformat() if global_max else None

    if not users:
        return TimelineResponse(
            bucket=bucket,
            start=start_dt.isoformat(),
            end=end_dt.isoformat(),
            history_start=history_start,
            history_end=history_end,
            series=[],
        )

    end_by_slot: dict[str, str] = {}
    for slot in all_slots:
        end_by_slot[slot] = _bucket_end_inclusive(_parse_dt(slot), bucket).isoformat()

    series: list[TimelineSeriesOut] = []
    for user in sorted(users):
        buckets_out: list[TimelineBucketOut] = []
        for bucket_start in all_slots:
            count = counts.get((bucket_start, user), 0)
            tbl = table_counts.get((bucket_start, user), 0) if has_table_filters else count
            top_items = companies.get((bucket_start, user), {})
            top = sorted(top_items.items(), key=lambda x: -x[1])[:5]
            buckets_out.append(
                TimelineBucketOut(
                    bucket_start=bucket_start,
                    bucket_end=end_by_slot[bucket_start],
                    count=count,
                    table_count=tbl,
                    top_companies=[
                        TimelineCompanyOut(company=c, count=n) for c, n in top
                    ],
                )
            )
        series.append(TimelineSeriesOut(captured_by=user, buckets=buckets_out))

    return TimelineResponse(
        bucket=bucket,
        start=start_dt.isoformat(),
        end=end_dt.isoformat(),
        history_start=history_start,
        history_end=history_end,
        series=series,
    )
