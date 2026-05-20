from fastapi import APIRouter, Query

from app.database import get_connection
from app.schemas import TimelineResponse
from app.services.analytics import timeline_analytics
from app.services.column_query import parse_column_in_from_query, parse_column_search_from_query
from app.services.jobs import _build_fts_query

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/timeline", response_model=TimelineResponse)
def get_timeline(
    start: str | None = Query(None),
    end: str | None = Query(None),
    bucket: str = Query("1d"),
    tags: str | None = Query(None, description="Comma-separated tag names"),
    captured_by: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    col_captured_at: str | None = Query(None),
    col_captured_by: str | None = Query(None),
    col_company_name: str | None = Query(None),
    col_job_title: str | None = Query(None),
    col_location: str | None = Query(None),
    col_salary_text: str | None = Query(None),
    col_tags: str | None = Query(None),
    col_resume: str | None = Query(None),
    col_jd: str | None = Query(None),
    col_source_url: str | None = Query(None),
    col_notes: str | None = Query(None),
    col_in_captured_by: str | None = Query(None),
    col_in_company_name: str | None = Query(None),
    col_in_job_title: str | None = Query(None),
    col_in_location: str | None = Query(None),
    col_in_salary_text: str | None = Query(None),
    col_in_tags: str | None = Query(None),
):
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else None
    column_search = parse_column_search_from_query(
        col_captured_at=col_captured_at,
        col_captured_by=col_captured_by,
        col_company_name=col_company_name,
        col_job_title=col_job_title,
        col_location=col_location,
        col_salary_text=col_salary_text,
        col_tags=col_tags,
        col_resume=col_resume,
        col_jd=col_jd,
        col_source_url=col_source_url,
        col_notes=col_notes,
    )
    column_in = parse_column_in_from_query(
        col_in_captured_by=col_in_captured_by,
        col_in_company_name=col_in_company_name,
        col_in_job_title=col_in_job_title,
        col_in_location=col_in_location,
        col_in_salary_text=col_in_salary_text,
        col_in_tags=col_in_tags,
    )
    with get_connection() as conn:
        return timeline_analytics(
            conn,
            start=start,
            end=end,
            bucket=bucket,
            tags=tag_list,
            captured_by=captured_by,
            date_from=date_from,
            date_to=date_to,
            column_search=column_search,
            column_in=column_in,
            build_fts_query=_build_fts_query,
        )
