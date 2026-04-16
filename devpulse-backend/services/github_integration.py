from fastapi import Request, HTTPException, Depends
import hmac
import hashlib
import os
from typing import Optional
from pydantic import BaseModel

GITHUB_WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "")

class GitHubPushPayload(BaseModel):
    ref: Optional[str] = None
    before: Optional[str] = None
    after: Optional[str] = None
    repository: Optional[dict] = None
    pusher: Optional[dict] = None
    sender: Optional[dict] = None
    commits: Optional[list] = None

async def handle_github_push(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")

    if not GITHUB_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="GitHub webhook secret not configured")

    if not signature:
        raise HTTPException(status_code=400, detail="No signature provided")

    mac = hmac.new(GITHUB_WEBHOOK_SECRET.encode(), msg=body, digestmod=hashlib.sha256)
    expected_signature = "sha256=" + mac.hexdigest()
    
    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        import json
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    repo_name = payload.get("repository", {}).get("name", "unknown")
    repo_url = payload.get("repository", {}).get("clone_url", "")
    branch = payload.get("ref", "refs/heads/main").replace("refs/heads/", "")
    pusher = payload.get("pusher", {}).get("name", "unknown")
    commits = payload.get("commits", [])
    
    return {
        "status": "triggered",
        "repo": repo_name,
        "repo_url": repo_url,
        "branch": branch,
        "pusher": pusher,
        "commit_count": len(commits),
        "action": "scan_initiated",
        "message": f"Received push to {branch} with {len(commits)} commits"
    }

async def handle_github_pull_request(request: Request):
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")

    if not GITHUB_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="GitHub webhook secret not configured")

    if not signature:
        raise HTTPException(status_code=400, detail="No signature provided")

    mac = hmac.new(GITHUB_WEBHOOK_SECRET.encode(), msg=body, digestmod=hashlib.sha256)
    expected_signature = "sha256=" + mac.hexdigest()
    
    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        import json
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    action = payload.get("action", "unknown")
    pr_number = payload.get("number", 0)
    repo_name = payload.get("repository", {}).get("name", "unknown")
    pr_title = payload.get("pull_request", {}).get("title", "")
    
    return {
        "status": "triggered",
        "event_type": "pull_request",
        "action": action,
        "pr_number": pr_number,
        "repo": repo_name,
        "pr_title": pr_title,
        "scan_action": "pr_scan_initiated"
    }

def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    mac = hmac.new(secret.encode(), msg=payload, digestmod=hashlib.sha256)
    expected = "sha256=" + mac.hexdigest()
    return hmac.compare_digest(expected, signature)