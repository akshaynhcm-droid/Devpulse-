from fastapi import APIRouter, Depends

from database import get_dashboard_stats
from auth import get_current_user as get_current_user_auth, User as DBUser

router = APIRouter()


@router.get("/stats")
def get_dashboard(current_user: DBUser = Depends(get_current_user_auth)):
    return get_dashboard_stats(current_user.id)
