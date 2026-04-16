from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import json

from database import (
    create_shadow_api, get_shadow_apis_by_collection, mark_shadow_api_documented,
    get_collection_by_id
)
from auth import get_current_user as get_current_user_auth, User as DBUser

router = APIRouter()


class ScanShadowAPIsRequest(BaseModel):
    collection_id: str


def detect_shadow_apis(collection_data: dict, fmt: str) -> list:
    """Detect undocumented/shadow APIs in a collection."""
    shadow_apis = []
    known_apis = {"login", "logout", "users", "auth", "health", "register", "profile", "api/v1/users", "api/v1/auth"}

    if fmt == "postman":
        items = collection_data.get("item", [])
        for item in items:
            req = item.get("request", {})
            url = req.get("url", {})
            raw_url = url.get("raw", "") if isinstance(url, dict) else str(url)
            # Extract path from URL
            path = raw_url.split("/")[-1] if "/" in raw_url else raw_url
            if path not in known_apis and path:
                method = (req.get("method", "GET") or "GET").upper()
                shadow_apis.append({
                    "endpoint": raw_url,
                    "method": method,
                    "risk_level": "High" if "admin" in raw_url.lower() or "delete" in raw_url.lower() else "Medium",
                    "reason": "Undocumented endpoint not in known API list"
                })
    elif fmt == "openapi":
        paths = collection_data.get("paths", {})
        for path, methods in paths.items():
            if path not in known_apis:
                for method_name in methods.keys():
                    shadow_apis.append({
                        "endpoint": path,
                        "method": method_name.upper(),
                        "risk_level": "High" if "admin" in path.lower() or "delete" in path.lower() else "Medium",
                        "reason": "Undocumented endpoint not in known API list"
                    })

    return shadow_apis


@router.post("/scan")
def scan_shadow_apis(req: ScanShadowAPIsRequest, current_user: DBUser = Depends(get_current_user_auth)):
    col = get_collection_by_id(req.collection_id)
    if not col or col["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Collection not found or access denied")

    try:
        collection_data = json.loads(col["data"]) if isinstance(col["data"], str) else col["data"]
        detected = detect_shadow_apis(collection_data, col["format"])

        created = []
        for api in detected:
            result = create_shadow_api(
                collection_id=req.collection_id,
                user_id=current_user.id,
                endpoint=api["endpoint"],
                method=api["method"],
                risk_level=api["risk_level"],
                reason=api["reason"]
            )
            created.append(result)

        return {"shadow_apis": created, "count": len(created)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Shadow API scan failed: {str(e)}")


@router.get("/collection/{collection_id}")
def list_shadow_apis(collection_id: str, current_user: DBUser = Depends(get_current_user_auth)):
    col = get_collection_by_id(collection_id)
    if not col or col["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"shadow_apis": get_shadow_apis_by_collection(collection_id)}


@router.patch("/{api_id}/document")
def mark_as_documented(api_id: str, current_user: DBUser = Depends(get_current_user_auth)):
    result = mark_shadow_api_documented(api_id)
    if not result:
        raise HTTPException(status_code=404, detail="Shadow API not found")
    return result
