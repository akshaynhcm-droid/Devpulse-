from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import json

from database import (
    create_scan, update_scan, get_scans_by_collection, get_scan_by_id,
    get_findings_by_scan, update_finding_status, get_collection_by_id,
    create_finding
)
from auth import get_current_user as get_current_user_auth, User as DBUser

router = APIRouter()


class RunScanRequest(BaseModel):
    collection_id: str


class UpdateFindingRequest(BaseModel):
    status: str  # open, in_progress, resolved, false_positive


OWASP_CATEGORIES = [
    {"id": "A01", "title": "Broken Access Control", "severity": "High"},
    {"id": "A02", "title": "Cryptographic Failures", "severity": "High"},
    {"id": "A03", "title": "Injection", "severity": "Critical"},
    {"id": "A04", "title": "Insecure Design", "severity": "Medium"},
    {"id": "A05", "title": "Security Misconfiguration", "severity": "Medium"},
    {"id": "A06", "title": "Vulnerable and Outdated Components", "severity": "High"},
    {"id": "A07", "title": "Identification and Authentication Failures", "severity": "High"},
    {"id": "A08", "title": "Software and Data Integrity Failures", "severity": "Medium"},
    {"id": "A09", "title": "Security Logging and Monitoring Failures", "severity": "Low"},
    {"id": "A10", "title": "Server-Side Request Forgery (SSRF)", "severity": "Medium"},
]


def analyze_collection_for_findings(collection_data: dict, fmt: str) -> list:
    """Analyze a collection and generate security findings."""
    findings = []
    items = collection_data.get("item", []) if fmt == "postman" else []
    paths = collection_data.get("paths", {}) if fmt == "openapi" else {}

    # Check for missing auth on write endpoints
    all_endpoints = []
    if fmt == "postman":
        for item in items:
            req = item.get("request", {})
            method = (req.get("method", "GET") or "GET").upper()
            headers = req.get("header", [])
            url = req.get("url", {})
            raw_url = url.get("raw", "") if isinstance(url, dict) else str(url)
            has_auth = any(
                str(h.get("key", "")).lower() == "authorization"
                for h in headers
            )
            all_endpoints.append({"method": method, "url": raw_url, "has_auth": has_auth})
    elif fmt == "openapi":
        for path, methods in paths.items():
            for method_name, details in methods.items():
                if method_name in ("get", "post", "put", "delete", "patch"):
                    security = details.get("security", [])
                    all_endpoints.append({
                        "method": method_name.upper(),
                        "url": path,
                        "has_auth": bool(security)
                    })

    # A01: Broken Access Control
    write_endpoints_no_auth = [
        e for e in all_endpoints
        if e["method"] in ("POST", "PUT", "DELETE", "PATCH") and not e["has_auth"]
    ]
    if write_endpoints_no_auth:
        for ep in write_endpoints_no_auth[:5]:
            findings.append({
                "severity": "High",
                "category": "Broken Access Control",
                "title": f"Missing authentication on {ep['method']} {ep['url']}",
                "description": f"The endpoint {ep['method']} {ep['url']} does not require authentication.",
                "remediation": "Add authentication/authorization checks to this endpoint.",
                "endpoint": ep["url"],
            })

    # A02: Cryptographic Failures - check for HTTP URLs
    http_endpoints = [e for e in all_endpoints if e["url"].startswith("http://")]
    if http_endpoints:
        findings.append({
            "severity": "High",
            "category": "Cryptographic Failures",
            "title": "Insecure HTTP endpoints detected",
            "description": f"{len(http_endpoints)} endpoint(s) use HTTP instead of HTTPS.",
            "remediation": "Enforce HTTPS on all API endpoints.",
            "endpoint": http_endpoints[0]["url"],
        })

    # A05: Security Misconfiguration - check for risky paths
    risky_patterns = ["debug", "test", "internal", "admin", "backup", "tmp"]
    for ep in all_endpoints:
        url_lower = ep["url"].lower()
        for pattern in risky_patterns:
            if pattern in url_lower:
                findings.append({
                    "severity": "Medium",
                    "category": "Security Misconfiguration",
                    "title": f"Risky endpoint detected: {ep['url']}",
                    "description": f"Endpoint contains '{pattern}' which may expose sensitive functionality.",
                    "remediation": f"Remove or restrict access to the '{pattern}' endpoint.",
                    "endpoint": ep["url"],
                })
                break

    # A07: Auth failures - check for integer IDs (potential IDOR)
    for ep in all_endpoints:
        import re
        if re.search(r'/\d+', ep["url"]):
            findings.append({
                "severity": "Medium",
                "category": "Identification and Authentication Failures",
                "title": f"Potential IDOR vulnerability on {ep['url']}",
                "description": "Endpoint uses integer IDs which may be vulnerable to Insecure Direct Object Reference.",
                "remediation": "Use UUIDs or add authorization checks to verify resource ownership.",
                "endpoint": ep["url"],
            })
            break

    # If no findings, add a clean bill
    if not findings:
        findings.append({
            "severity": "Low",
            "category": "General",
            "title": "No critical issues detected",
            "description": "The collection passed basic security checks. Manual review recommended for deeper analysis.",
            "remediation": "Consider running a full OWASP assessment manually.",
            "endpoint": "",
        })

    return findings


@router.post("/run")
def run_scan(req: RunScanRequest, current_user: DBUser = Depends(get_current_user_auth)):
    col = get_collection_by_id(req.collection_id)
    if not col or col["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Collection not found or access denied")

    scan = create_scan(req.collection_id, current_user.id)
    update_scan(scan["id"], status="running")

    try:
        collection_data = json.loads(col["data"]) if isinstance(col["data"], str) else col["data"]
        raw_findings = analyze_collection_for_findings(collection_data, col["format"])

        severity_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
        for f in raw_findings:
            create_finding(
                scan_id=scan["id"],
                severity=f["severity"],
                category=f["category"],
                title=f["title"],
                description=f.get("description", ""),
                remediation=f.get("remediation", ""),
                endpoint=f.get("endpoint", ""),
            )
            severity_counts[f["severity"]] = severity_counts.get(f["severity"], 0) + 1

        update_scan(
            scan["id"],
            status="completed",
            total_findings=len(raw_findings),
            critical_count=severity_counts.get("Critical", 0),
            high_count=severity_counts.get("High", 0),
            medium_count=severity_counts.get("Medium", 0),
            low_count=severity_counts.get("Low", 0),
        )

        return {"scan_id": scan["id"], "status": "completed", "findings_count": len(raw_findings), "severity_counts": severity_counts}
    except Exception as e:
        update_scan(scan["id"], status="failed")
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")


@router.get("/collection/{collection_id}")
def list_scans(collection_id: str, current_user: DBUser = Depends(get_current_user_auth)):
    col = get_collection_by_id(collection_id)
    if not col or col["user_id"] != current_user.id:
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"scans": get_scans_by_collection(collection_id)}


@router.get("/{scan_id}")
def get_scan_detail(scan_id: str, current_user: DBUser = Depends(get_current_user_auth)):
    scan = get_scan_by_id(scan_id)
    if not scan or scan.get("user_id") != current_user.id:
        raise HTTPException(status_code=404, detail="Scan not found")
    findings = get_findings_by_scan(scan_id)
    return {"scan": scan, "findings": findings}


@router.patch("/findings/{finding_id}")
def patch_finding(finding_id: str, req: UpdateFindingRequest, current_user: DBUser = Depends(get_current_user_auth)):
    if req.status not in ("open", "in_progress", "resolved", "false_positive"):
        raise HTTPException(status_code=400, detail="Invalid status")
    result = update_finding_status(finding_id, req.status)
    if not result:
        raise HTTPException(status_code=404, detail="Finding not found")
    return result
