from fastapi import APIRouter, Depends

from app.database import get_connection
from app.schemas import CaptureJobRequest, CaptureJobResponse
from app.services.jobs import capture_job
from app.config import settings

router = APIRouter(prefix="/capture", tags=["capture"])


@router.post("/job", response_model=CaptureJobResponse)
async def post_capture_job(payload: CaptureJobRequest):
    with get_connection() as conn:
        job_id = await capture_job(conn, payload)
        conn.commit()

    mode = "mock" if settings.use_mock_extraction else "ollama"
    return CaptureJobResponse(
        job_id=job_id,
        message="Job captured and indexed successfully.",
        extraction_mode=mode,
    )
