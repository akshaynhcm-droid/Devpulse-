from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from database import (
    record_token_usage, get_token_analytics_by_user, get_cost_breakdown_by_model
)
from auth import get_current_user as get_current_user_auth, User as DBUser

router = APIRouter()


class RecordUsageRequest(BaseModel):
    model: str
    prompt_tokens: int
    completion_tokens: int
    thinking_tokens: int = 0
    cost_usd: float


@router.post("/record")
def record_usage(req: RecordUsageRequest, current_user: DBUser = Depends(get_current_user_auth)):
    result = record_token_usage(
        user_id=current_user.id,
        model=req.model,
        prompt_tokens=req.prompt_tokens,
        completion_tokens=req.completion_tokens,
        thinking_tokens=req.thinking_tokens,
        cost_usd=req.cost_usd
    )
    return result


@router.get("/")
def get_analytics(current_user: DBUser = Depends(get_current_user_auth), model: Optional[str] = None):
    records = get_token_analytics_by_user(current_user.id, model)
    breakdown = get_cost_breakdown_by_model(current_user.id)
    return {"records": records, "breakdown": breakdown}
