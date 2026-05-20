from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.database import get_connection
from app.schemas import ResumePreviewOut
from app.services.resumes import get_resume_file_path, get_resume_preview

router = APIRouter(prefix="/resumes", tags=["resumes"])


@router.get("/{resume_file_id}/preview", response_model=ResumePreviewOut)
def preview_resume(resume_file_id: str):
    with get_connection() as conn:
        try:
            text = get_resume_preview(conn, resume_file_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ResumePreviewOut(resume_file_id=resume_file_id, extracted_text=text)


@router.get("/{resume_file_id}/download")
def download_resume(resume_file_id: str):
    with get_connection() as conn:
        try:
            path, filename = get_resume_file_path(conn, resume_file_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )
