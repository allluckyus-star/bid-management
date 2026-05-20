from fastapi import APIRouter, Query

from app.database import get_connection, init_db
from app.services.seed_data import seed_sample_data

router = APIRouter(prefix="/dev", tags=["dev"])


@router.post("/seed-sample")
def post_seed_sample(reset: bool = Query(False, description="Clear jobs/tags first")):
    init_db()
    with get_connection() as conn:
        result = seed_sample_data(conn, reset=reset)
        conn.commit()
    return result
