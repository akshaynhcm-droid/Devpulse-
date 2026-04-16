from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import (
    create_collection, get_collections_by_user, get_collection_by_id,
    delete_collection, update_collection
)
from auth import get_current_user as get_current_user_auth, User as DBUser

router = APIRouter()


class CollectionCreate(BaseModel):
    name: str
    description: str = ""
    format: str  # "postman" or "openapi"
    data: str  # JSON string of collection data


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


@router.post("/")
def create_new_collection(req: CollectionCreate, current_user: DBUser = Depends(get_current_user_auth)):
    if req.format not in ("postman", "openapi"):
        raise HTTPException(status_code=400, detail="Format must be 'postman' or 'openapi'")
    result = create_collection(current_user.id, req.name, req.format, req.data, req.description)
    return result


@router.get("/")
def list_collections(current_user: DBUser = Depends(get_current_user_auth)):
    return {"collections": get_collections_by_user(current_user.id)}


@router.get("/{collection_id}")
def get_collection(collection_id: str, current_user: DBUser = Depends(get_current_user_auth)):
    col = get_collection_by_id(collection_id)
    if not col or col["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Collection not found or access denied")
    return col


@router.delete("/{collection_id}")
def remove_collection(collection_id: str, current_user: DBUser = Depends(get_current_user_auth)):
    col = get_collection_by_id(collection_id)
    if not col or col["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Collection not found or access denied")
    success = delete_collection(collection_id)
    return {"success": success}


@router.patch("/{collection_id}")
def update_collection_meta(collection_id: str, req: CollectionUpdate, current_user: DBUser = Depends(get_current_user_auth)):
    col = get_collection_by_id(collection_id)
    if not col or col["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Collection not found or access denied")
    result = update_collection(collection_id, name=req.name, description=req.description)
    return result
