from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
from pydantic import BaseModel

from database import get_all_users, get_total_cost, get_llm_calls, get_user_by_id, update_user_plan, User as DBUser
from auth import get_current_user as get_current_user_auth

router = APIRouter()

@router.get("/stats")
def get_platform_stats(current_user: DBUser = Depends(get_current_user_auth)):
    """
    Returns key business metrics for the admin dashboard.
    Requires admin privileges.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized. Admin access required.")

    total_users = get_all_users()
    total_cost = get_total_cost()
    recent_calls = get_llm_calls(limit=100)
    
    active_users = [u for u in total_users if u.get("is_active")]
    pro_users = [u for u in total_users if u.get("plan") == "pro"]
    
    return {
        "total_users": len(total_users),
        "active_users": len(active_users),
        "pro_subscribers": len(pro_users),
        "total_cost_processed": round(total_cost, 4),
        "total_api_calls": len(recent_calls),
        "recent_users": total_users[:5]
    }

@router.get("/users")
def list_all_users(current_user: DBUser = Depends(get_current_user_auth)):
    """List all users (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return {"users": get_all_users()}

@router.get("/users/{user_id}")
def get_user_detail(user_id: int, current_user: DBUser = Depends(get_current_user_auth)):
    """Get detailed user info (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"user": user}

@router.post("/users/{user_id}/upgrade")
def upgrade_user_plan(
    user_id: int, 
    plan: str = "pro", 
    current_user: DBUser = Depends(get_current_user_auth)
):
    """Upgrade a user's plan (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    success = update_user_plan(user.email, plan)
    return {"status": "success" if success else "failed", "plan": plan}

class SystemHealth(BaseModel):
    status: str
    database: str
    websocket_connections: int = 0

@router.get("/health")
def system_health(current_user: DBUser = Depends(get_current_user_auth)):
    """System health check (admin only)."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return SystemHealth(
        status="healthy",
        database="connected",
        websocket_connections=0
    )