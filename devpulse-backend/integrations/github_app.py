import hmac
import hashlib
import json
import os
from fastapi import Request, HTTPException
from typing import Optional, List, Dict
import httpx

from services.shadow_api_detector import ShadowAPIDetector

GITHUB_WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

def verify_github_signature(payload: bytes, signature: str) -> bool:
    if not GITHUB_WEBHOOK_SECRET:
        return True
    
    hash_object = hmac.new(GITHUB_WEBHOOK_SECRET.encode(), msg=payload, digestmod=hashlib.sha256)
    expected_signature = "sha256=" + hash_object.hexdigest()
    return hmac.compare_digest(expected_signature, signature)

async def handle_github_webhook(request: Request) -> Dict:
    payload = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    
    if not verify_github_signature(payload, signature):
        raise HTTPException(status_code=403, detail="Invalid Signature")

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    event_type = request.headers.get("X-GitHub-Event", "")

    if event_type == "pull_request":
        await handle_pr_event(data)
    elif event_type == "push":
        await handle_push_event(data)

    return {"status": "processed", "event": event_type}

async def handle_pr_event(data: dict) -> Optional[Dict]:
    action = data.get("action")
    if action not in ["opened", "synchronize", "reopened"]:
        return None

    pr = data["pull_request"]
    pr_number = pr["number"]
    head_sha = pr["head"]["sha"]

    if not GITHUB_TOKEN:
        print("GITHUB_TOKEN not set - skipping scan")
        return None

    files_url = pr["url"] + "/files"
    comments_url = pr.get("comments_url", "")
    headers = {"Authorization": f"token {GITHUB_TOKEN}", "Accept": "application/vnd.github.v3+json"}
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            files_response = await client.get(files_url, headers=headers)
            files = files_response.json()
        except Exception as e:
            print(f"Failed to fetch PR files: {e}")
            return None

        detector = ShadowAPIDetector(known_apis=["login", "logout", "users", "auth", "health"])
        findings: List[Dict] = []
        
        for file in files:
            if file.get("status") == "removed":
                continue
            
            try:
                raw_url = file.get("raw_url", "")
                content_response = await client.get(raw_url)
                code_content = content_response.text
                issues = detector.scan_code(code_content)
                for issue in issues:
                    findings.append({
                        "filename": file.get("filename", "unknown"),
                        "type": issue.get("type", "unknown"),
                        "reason": issue.get("reason", ""),
                        "url": issue.get("url", "")
                    })
            except Exception:
                continue

        body = f"""## 🔍 DevPulse Security Scan Report

**Commit:** `{head_sha[:7]}`
**Status:** {'❌ FAILED' if findings else '✅ PASSED'}

### Findings ({len(findings)})
"""
        if findings:
            for f in findings[:5]:
                body += f"\n- 🚨 **{f['filename']}**: {f['reason']}"
        else:
            body += "\nNo security issues detected. Great job!"

        try:
            await client.post(comments_url, json={"body": body}, headers=headers)
        except Exception as e:
            print(f"Failed to post comment: {e}")

    return {"findings_count": len(findings), "pr_number": pr_number}

async def handle_push_event(data: dict) -> Optional[Dict]:
    repo_full_name = data.get("repository", {}).get("full_name", "")
    commits = data.get("commits", [])
    branch = data.get("ref", "").replace("refs/heads/", "")
    
    return {
        "repo": repo_full_name,
        "branch": branch,
        "commits_count": len(commits)
    }