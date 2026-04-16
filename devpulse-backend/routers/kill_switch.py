from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import (
    set_budget_config, get_budget_config, log_kill_switch_event,
    get_kill_switch_logs, get_kill_switch_status, get_total_cost
)
from auth import get_current_user as get_current_user_auth, User as DBUser

router = APIRouter()


class SetBudgetRequest(BaseModel):
    monthly_limit: float
    daily_limit: float = 0.0
    alert_threshold_pct: float = 80.0


class TriggerKillSwitchRequest(BaseModel):
    reason: str


class ResetKillSwitchRequest(BaseModel):
    reason: str


@router.post("/budget")
def set_budget(req: SetBudgetRequest, current_user: DBUser = Depends(get_current_user_auth)):
    result = set_budget_config(
        user_id=current_user.id,
        monthly_limit=req.monthly_limit,
        daily_limit=req.daily_limit,
        alert_threshold_pct=req.alert_threshold_pct
    )
    log_kill_switch_event(
        user_id=current_user.id,
        action="budget_set",
        reason=f"Budget set to ${req.monthly_limit}/month",
        budget_limit=req.monthly_limit
    )
    return result


@router.get("/budget")
def get_budget(current_user: DBUser = Depends(get_current_user_auth)):
    budget = get_budget_config(current_user.id)
    if not budget:
        return {"monthly_limit": 0.0, "daily_limit": 0.0, "kill_switch_enabled": True, "alert_threshold_pct": 80.0}
    return budget


@router.post("/trigger")
def trigger_kill_switch(req: TriggerKillSwitchRequest, current_user: DBUser = Depends(get_current_user_auth)):
    budget = get_budget_config(current_user.id) or {"monthly_limit": 0.0}
    current_spend = get_total_cost()
    
    log_kill_switch_event(
        user_id=current_user.id,
        action="triggered",
        reason=req.reason,
        budget_limit=budget.get("monthly_limit", 0.0),
        current_spend=current_spend,
        is_active=True
    )
    return {"status": "triggered", "is_active": True}


@router.post("/reset")
def reset_kill_switch(req: ResetKillSwitchRequest, current_user: DBUser = Depends(get_current_user_auth)):
    budget = get_budget_config(current_user.id) or {"monthly_limit": 0.0}
    current_spend = get_total_cost()
    
    log_kill_switch_event(
        user_id=current_user.id,
        action="reset",
        reason=req.reason,
        budget_limit=budget.get("monthly_limit", 0.0),
        current_spend=current_spend,
        is_active=False
    )
    return {"status": "reset", "is_active": False}


@router.get("/status")
def get_status(current_user: DBUser = Depends(get_current_user_auth)):
    status = get_kill_switch_status(current_user.id)
    budget = get_budget_config(current_user.id)
    return {"status": status, "budget": budget}


@router.get("/logs")
def get_logs(current_user: DBUser = Depends(get_current_user_auth)):
    logs = get_kill_switch_logs(current_user.id)
    return {"logs": logs}
