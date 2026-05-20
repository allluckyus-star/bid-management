from fastapi import APIRouter, HTTPException

from app.database import get_connection
from app.schemas import TagCreateRequest, TagOut, TagPatchRequest
from app.services.tags import create_tag, delete_tag, list_tags, update_tag

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagOut])
def get_tags():
    with get_connection() as conn:
        return list_tags(conn)


@router.post("", response_model=TagOut, status_code=201)
def post_tag(payload: TagCreateRequest):
    with get_connection() as conn:
        try:
            tag = create_tag(conn, payload)
            conn.commit()
            return tag
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch("/{tag_id}", response_model=TagOut)
def patch_tag(tag_id: str, payload: TagPatchRequest):
    with get_connection() as conn:
        try:
            tag = update_tag(conn, tag_id, payload)
            conn.commit()
            return tag
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/{tag_id}", status_code=204)
def delete_tag_route(tag_id: str):
    with get_connection() as conn:
        try:
            delete_tag(conn, tag_id)
            conn.commit()
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
