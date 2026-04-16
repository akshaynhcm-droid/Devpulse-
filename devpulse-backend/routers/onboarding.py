from fastapi import APIRouter, Depends
from pydantic import BaseModel

from database import (
    get_onboarding_progress, complete_onboarding_step
)
from auth import get_current_user as get_current_user_auth, User as DBUser

router = APIRouter()


class CompleteStepRequest(BaseModel):
    step: str  # import_collection, run_scan, review_findings, invite_team, setup_compliance


@router.get("/progress")
def get_progress(current_user: DBUser = Depends(get_current_user_auth)):
    return get_onboarding_progress(current_user.id)


@router.post("/complete")
def complete_step(req: CompleteStepRequest, current_user: DBUser = Depends(get_current_user_auth)):
    result = complete_onboarding_step(current_user.id, req.step)
    if not result:
        return {"error": "Invalid step name"}
    return result
