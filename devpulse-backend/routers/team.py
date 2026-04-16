from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import (
    invite_team_member, get_team_members, update_team_member_role, remove_team_member
)
from auth import get_current_user as get_current_user_auth, User as DBUser

router = APIRouter()


class InviteRequest(BaseModel):
    email: str
    role: str = "viewer"


class UpdateRoleRequest(BaseModel):
    role: str


@router.post("/invite")
def invite_member(req: InviteRequest, current_user: DBUser = Depends(get_current_user_auth)):
    if req.role not in ("admin", "editor", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid role")
    result = invite_team_member(current_user.id, req.email, req.role)
    return result


@router.get("/")
def list_members(current_user: DBUser = Depends(get_current_user_auth)):
    return {"members": get_team_members(current_user.id)}


@router.patch("/{member_id}")
def update_member_role(member_id: str, req: UpdateRoleRequest, current_user: DBUser = Depends(get_current_user_auth)):
    if req.role not in ("admin", "editor", "viewer"):
        raise HTTPException(status_code=400, detail="Invalid role")
    result = update_team_member_role(member_id, req.role)
    if not result:
        raise HTTPException(status_code=404, detail="Team member not found")
    return result


@router.delete("/{member_id}")
def remove_member(member_id: str, current_user: DBUser = Depends(get_current_user_auth)):
    result = remove_team_member(member_id)
    if not result:
        raise HTTPException(status_code=404, detail="Team member not found")
    return result
