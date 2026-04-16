from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import json

from database import (
    create_compliance_report, get_compliance_reports_by_user, get_compliance_report_by_id,
    get_collection_by_id
)
from auth import get_current_user as get_current_user_auth, User as DBUser

router = APIRouter()


class GenerateReportRequest(BaseModel):
    collection_id: Optional[str] = None
    framework: str = "pci_dss"  # or "owasp_top_10"


def analyze_pci_dss(collection_data: dict, fmt: str) -> dict:
    """Analyze collection against PCI DSS requirements."""
    requirements = [
        {"id": "1.1", "title": "Firewall Configuration", "status": "met"},
        {"id": "1.2", "title": "Default Passwords", "status": "met"},
        {"id": "2.1", "title": "Cardholder Data Encryption", "status": "met"},
        {"id": "2.2", "title": "Transmission Encryption", "status": "met"},
        {"id": "3.1", "title": "Access Control", "status": "met"},
        {"id": "3.2", "title": "Unique ID for Access", "status": "met"},
        {"id": "4.1", "title": "Logging Mechanism", "status": "manual_review"},
        {"id": "4.2", "title": "Log Review", "status": "manual_review"},
        {"id": "6.1", "title": "Secure Development", "status": "manual_review"},
        {"id": "6.2", "title": "Vulnerability Management", "status": "manual_review"},
    ]
    
    # Basic checks
    items = collection_data.get("item", []) if fmt == "postman" else []
    paths = collection_data.get("paths", {}) if fmt == "openapi" else {}
    
    has_https = True
    if fmt == "postman":
        for item in items:
            url = item.get("request", {}).get("url", {})
            raw_url = url.get("raw", "") if isinstance(url, dict) else str(url)
            if raw_url.startswith("http://"):
                has_https = False
                break
    elif fmt == "openapi":
        for path in paths:
            if any(s.startswith("http://") for s in str(path).split()):
                has_https = False
                break
    
    if not has_https:
        for req in requirements:
            if req["id"] in ("1.1", "2.2"):
                req["status"] = "not_met"
    
    met_count = sum(1 for r in requirements if r["status"] == "met")
    not_met_count = sum(1 for r in requirements if r["status"] == "not_met")
    manual_review_count = sum(1 for r in requirements if r["status"] == "manual_review")
    
    return {
        "requirements": requirements,
        "met_count": met_count,
        "not_met_count": not_met_count,
        "manual_review_count": manual_review_count,
        "total": len(requirements)
    }


def analyze_owasp(collection_data: dict, fmt: str) -> dict:
    """Analyze collection against OWASP Top 10."""
    requirements = [
        {"id": "A01", "title": "Broken Access Control", "status": "manual_review"},
        {"id": "A02", "title": "Cryptographic Failures", "status": "manual_review"},
        {"id": "A03", "title": "Injection", "status": "manual_review"},
        {"id": "A04", "title": "Insecure Design", "status": "manual_review"},
        {"id": "A05", "title": "Security Misconfiguration", "status": "manual_review"},
        {"id": "A06", "title": "Vulnerable Components", "status": "manual_review"},
        {"id": "A07", "title": "Auth Failures", "status": "manual_review"},
        {"id": "A08", "title": "Integrity Failures", "status": "manual_review"},
        {"id": "A09", "title": "Logging Failures", "status": "manual_review"},
        {"id": "A10", "title": "SSRF", "status": "manual_review"},
    ]
    
    met_count = 0
    not_met_count = 0
    manual_review_count = len(requirements)
    
    return {
        "requirements": requirements,
        "met_count": met_count,
        "not_met_count": not_met_count,
        "manual_review_count": manual_review_count,
        "total": len(requirements)
    }


@router.post("/generate")
def generate_report(req: GenerateReportRequest, current_user: DBUser = Depends(get_current_user_auth)):
    if req.framework not in ("pci_dss", "owasp_top_10"):
        raise HTTPException(status_code=400, detail="Framework must be 'pci_dss' or 'owasp_top_10'")
    
    collection_data = None
    collection_format = None
    if req.collection_id:
        col = get_collection_by_id(req.collection_id)
        if not col or col["user_id"] != current_user.id:
            raise HTTPException(status_code=404, detail="Collection not found")
        collection_data = json.loads(col["data"]) if isinstance(col["data"], str) else col["data"]
        collection_format = col["format"]
    
    if req.framework == "pci_dss":
        analysis = analyze_pci_dss(collection_data or {}, collection_format or "openapi")
    else:
        analysis = analyze_owasp(collection_data or {}, collection_format or "openapi")
    
    report = create_compliance_report(
        user_id=current_user.id,
        framework=req.framework,
        collection_id=req.collection_id,
        score=int((analysis["met_count"] / analysis["total"]) * 100) if analysis["total"] > 0 else 0,
        total_requirements=analysis["total"],
        met_count=analysis["met_count"],
        not_met_count=analysis["not_met_count"],
        manual_review_count=analysis["manual_review_count"],
        details=json.dumps(analysis)
    )
    return report


@router.get("/")
def list_reports(current_user: DBUser = Depends(get_current_user_auth)):
    return {"reports": get_compliance_reports_by_user(current_user.id)}


@router.get("/{report_id}")
def get_report(report_id: str, current_user: DBUser = Depends(get_current_user_auth)):
    report = get_compliance_report_by_id(report_id)
    if not report or report.get("user_id") != current_user.id:
        raise HTTPException(status_code=404, detail="Report not found")
    return report
