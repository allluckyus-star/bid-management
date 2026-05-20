from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.database import get_connection
from app.schemas import (
    BulkDeleteRequest,
    BulkDeleteResponse,
    CapturedByListResponse,
    ColumnValuesResponse,
    DashboardSummaryOut,
    JDOut,
    JobListItemOut,
    JobListResponse,
    JobPatchRequest,
    ReextractJDResponse,
    ResumeSummaryOut,
)
from app.services.column_query import (
    FILTERABLE_FIELDS,
    parse_column_in_from_query,
    parse_column_search_from_query,
)
from app.services.jd import get_job_jd, reextract_job_jd
from app.services.jobs import (
    dashboard_summary,
    get_column_values,
    list_captured_by_users,
    list_jobs,
    patch_job,
    soft_delete_jobs,
)
from app.services.resumes import link_resume_to_job, unlink_resume_from_job
from app.services.tags import add_tag_to_job, remove_tag_from_job

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=JobListResponse)
def get_jobs(
    q: str | None = Query(None, description="Full-text search query"),
    tags: str | None = Query(None, description="Comma-separated tag names"),
    captured_by: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    sort: str | None = Query(None, description="Multi sort: field:dir,field:dir"),
    sort_by: str | None = Query(None, description="Single column sort (legacy)"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    col_in_captured_by: str | None = Query(None, description="Pipe-separated values"),
    col_in_company_name: str | None = Query(None),
    col_in_job_title: str | None = Query(None),
    col_in_location: str | None = Query(None),
    col_in_salary_text: str | None = Query(None),
    col_in_tags: str | None = Query(None),
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
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
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
        return list_jobs(
            conn,
            q=q,
            tags=tag_list,
            captured_by=captured_by,
            date_from=date_from,
            date_to=date_to,
            columns=column_search,
            column_in=column_in,
            sort=sort,
            sort_by=sort_by,
            sort_dir=sort_dir,
            page=page,
            page_size=page_size,
        )


@router.get("/meta/column-values", response_model=ColumnValuesResponse)
def get_column_values_route(
    field: str = Query(..., description="Filterable column field name"),
    tags: str | None = Query(None),
    captured_by: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    col_in_captured_by: str | None = None,
    col_in_company_name: str | None = None,
    col_in_job_title: str | None = None,
    col_in_location: str | None = None,
    col_in_salary_text: str | None = None,
    col_in_tags: str | None = None,
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
):
    if field not in FILTERABLE_FIELDS:
        raise HTTPException(status_code=400, detail=f"Field '{field}' is not filterable")
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
        values = get_column_values(
            conn,
            field,
            tags=tag_list,
            captured_by=captured_by,
            date_from=date_from,
            date_to=date_to,
            column_search=column_search,
            column_in=column_in,
        )
    return ColumnValuesResponse(field=field, values=values)


@router.get("/meta/captured-by", response_model=CapturedByListResponse)
def get_captured_by_users():
    with get_connection() as conn:
        return CapturedByListResponse(users=list_captured_by_users(conn))


@router.get("/dashboard/summary", response_model=DashboardSummaryOut)
def get_dashboard_summary():
    with get_connection() as conn:
        return dashboard_summary(conn)


@router.delete("/bulk", response_model=BulkDeleteResponse)
def bulk_delete_jobs(payload: BulkDeleteRequest):
    with get_connection() as conn:
        count = soft_delete_jobs(conn, payload.job_ids)
        conn.commit()
    return BulkDeleteResponse(deleted_count=count)


@router.patch("/{job_id}", response_model=JobListItemOut)
def patch_job_route(job_id: str, payload: JobPatchRequest):
    with get_connection() as conn:
        try:
            item = patch_job(conn, job_id, payload)
            conn.commit()
            return item
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{job_id}/tags/{tag_id}", status_code=204)
def post_job_tag(job_id: str, tag_id: str):
    with get_connection() as conn:
        try:
            add_tag_to_job(conn, job_id, tag_id)
            conn.commit()
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{job_id}/tags/{tag_id}", status_code=204)
def delete_job_tag(job_id: str, tag_id: str):
    with get_connection() as conn:
        remove_tag_from_job(conn, job_id, tag_id)
        conn.commit()


@router.get("/{job_id}/jd", response_model=JDOut)
def get_jd(job_id: str):
    with get_connection() as conn:
        try:
            return get_job_jd(conn, job_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{job_id}/jd/reextract", response_model=ReextractJDResponse)
async def post_reextract_jd(job_id: str):
    with get_connection() as conn:
        try:
            jd, fields = await reextract_job_jd(conn, job_id)
            conn.commit()
            return ReextractJDResponse(jd=jd, job_fields=fields)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{job_id}/resume", response_model=ResumeSummaryOut)
async def post_job_resume(job_id: str, file: UploadFile = File(...)):
    data = await file.read()
    with get_connection() as conn:
        try:
            result = link_resume_to_job(
                conn,
                job_id,
                file.filename or "resume.docx",
                data,
                file.content_type,
            )
            conn.commit()
            return ResumeSummaryOut(**result)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{job_id}/resume", status_code=204)
def delete_job_resume(job_id: str):
    with get_connection() as conn:
        try:
            unlink_resume_from_job(conn, job_id)
            conn.commit()
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
