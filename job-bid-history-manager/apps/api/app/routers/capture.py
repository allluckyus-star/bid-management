from fastapi import APIRouter, Depends

from app.database import get_connection
from app.schemas import CaptureJobRequest, CaptureJobResponse
from app.services.jobs import capture_job

router = APIRouter(prefix="/capture", tags=["capture"])


@router.post("/job", response_model=CaptureJobResponse)
async def post_capture_job(payload: CaptureJobRequest):
    with get_connection() as conn:
        job_id, model_name = await capture_job(conn, payload)
        conn.commit()

    return CaptureJobResponse(
        job_id=job_id,
        message="Job captured and indexed successfully.",
        extraction_mode=model_name,
    )
