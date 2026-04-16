from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime, timezone
from contextlib import contextmanager
from typing import Optional, List, Dict
import os
import uuid

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./devpulse.db")

connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ============================================================================
# MODELS
# ============================================================================

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    api_key = Column(String, unique=True, nullable=True)
    is_admin = Column(Boolean, default=False)
    plan = Column(String, default="free")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class LLMLoad(Base):
    __tablename__ = "llm_load"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    tokens = Column(Integer)
    cost = Column(Float)
    model = Column(String)


class SecurityEvent(Base):
    __tablename__ = "security_events"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    event_type = Column(String)
    severity = Column(String)
    details = Column(String)


class CostHistory(Base):
    __tablename__ = "cost_history"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    cost_usd = Column(Float)


class Collection(Base):
    __tablename__ = "collections"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, default="")
    format = Column(String, nullable=False)  # "postman" or "openapi"
    data = Column(Text, default="{}")
    total_requests = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Scan(Base):
    __tablename__ = "scans"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    collection_id = Column(String, ForeignKey("collections.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="pending")  # pending, running, completed, failed
    total_findings = Column(Integer, default=0)
    critical_count = Column(Integer, default=0)
    high_count = Column(Integer, default=0)
    medium_count = Column(Integer, default=0)
    low_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Finding(Base):
    __tablename__ = "findings"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scan_id = Column(String, ForeignKey("scans.id"), nullable=False)
    severity = Column(String, nullable=False)  # Critical, High, Medium, Low
    category = Column(String, nullable=False)  # e.g. "Broken Access Control"
    title = Column(String, nullable=False)
    description = Column(Text, default="")
    remediation = Column(Text, default="")
    status = Column(String, default="open")  # open, in_progress, resolved, false_positive
    endpoint = Column(String, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ShadowAPI(Base):
    __tablename__ = "shadow_apis"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    collection_id = Column(String, ForeignKey("collections.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    endpoint = Column(String, nullable=False)
    method = Column(String, default="GET")
    risk_level = Column(String, default="Medium")  # High, Medium, Low
    reason = Column(Text, default="")
    is_documented = Column(Boolean, default=False)
    discovered_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class TokenAnalytics(Base):
    __tablename__ = "token_analytics"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    model = Column(String, nullable=False)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    thinking_tokens = Column(Integer, default=0)
    cost_usd = Column(Float, default=0.0)
    recorded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class KillSwitchLog(Base):
    __tablename__ = "kill_switch_logs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String, nullable=False)  # triggered, reset, budget_set, auto_triggered
    reason = Column(Text, default="")
    budget_limit = Column(Float, default=0.0)
    current_spend = Column(Float, default=0.0)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class BudgetConfig(Base):
    __tablename__ = "budget_configs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    monthly_limit = Column(Float, default=0.0)
    daily_limit = Column(Float, default=0.0)
    kill_switch_enabled = Column(Boolean, default=True)
    alert_threshold_pct = Column(Float, default=80.0)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ComplianceReport(Base):
    __tablename__ = "compliance_reports"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    collection_id = Column(String, ForeignKey("collections.id"), nullable=True)
    framework = Column(String, nullable=False)  # "pci_dss", "owasp_top_10"
    score = Column(Integer, default=0)
    total_requirements = Column(Integer, default=0)
    met_count = Column(Integer, default=0)
    not_met_count = Column(Integer, default=0)
    manual_review_count = Column(Integer, default=0)
    details = Column(Text, default="{}")  # JSON string
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class TeamMember(Base):
    __tablename__ = "team_members"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # owner
    email = Column(String, nullable=False)
    role = Column(String, default="viewer")  # admin, editor, viewer
    status = Column(String, default="pending")  # pending, active, removed
    invited_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class OnboardingStep(Base):
    __tablename__ = "onboarding_steps"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    import_collection = Column(Boolean, default=False)
    run_scan = Column(Boolean, default=False)
    review_findings = Column(Boolean, default=False)
    invite_team = Column(Boolean, default=False)
    setup_compliance = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ============================================================================
# DB HELPERS
# ============================================================================

def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency that yields a DB session and guarantees cleanup."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session():
    """Context manager that guarantees the session is closed even on exceptions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---- User helpers ----

def create_user(email: str, hashed_password: str, api_key: str) -> User:
    with get_db_session() as db:
        user = User(email=email, hashed_password=hashed_password, api_key=api_key, is_admin=False, plan="free")
        db.add(user)
        db.commit()
        db.refresh(user)
        return user


def get_user_by_email(email: str) -> Optional[User]:
    with get_db_session() as db:
        user = db.query(User).filter(User.email == email).first()
        if user:
            return User(id=user.id, email=user.email, hashed_password=user.hashed_password,
                        api_key=user.api_key, is_admin=user.is_admin, plan=user.plan)
        return None


def get_user_by_id(user_id: int) -> Optional[User]:
    with get_db_session() as db:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            return User(id=user.id, email=user.email, hashed_password=user.hashed_password,
                        api_key=user.api_key, is_admin=user.is_admin, plan=user.plan)
        return None


def get_all_users() -> list:
    with get_db_session() as db:
        users = db.query(User).all()
        return [{"id": u.id, "email": u.email, "plan": u.plan, "is_active": True, "created_at": u.created_at} for u in users]


def update_user_plan(email: str, plan: str) -> bool:
    with get_db_session() as db:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.plan = plan
            db.commit()
            return True
        return False


# ---- LLM / Cost helpers ----

def log_llm_call(agent_id: str, tokens_in: int, tokens_out: int, cost: float, model: str):
    with get_db_session() as db:
        db.add(LLMLoad(user_id=agent_id, tokens=tokens_in + tokens_out, cost=cost, model=model))
        db.add(CostHistory(cost_usd=cost))
        db.commit()


def log_security_event(event_type: str, severity: str, details: str):
    with get_db_session() as db:
        db.add(SecurityEvent(event_type=event_type, severity=severity, details=details))
        db.commit()


def get_total_cost() -> float:
    with get_db_session() as db:
        total = db.query(LLMLoad).with_entities(LLMLoad.cost).all()
        return sum([t[0] for t in total]) if total else 0.0


def get_recent_costs(limit: int = 10) -> list:
    with get_db_session() as db:
        costs = db.query(CostHistory).order_by(CostHistory.timestamp.desc()).limit(limit).all()
        return [c.cost_usd for c in costs]


def get_security_events(limit: int = 50) -> list:
    with get_db_session() as db:
        events = db.query(SecurityEvent).order_by(SecurityEvent.timestamp.desc()).limit(limit).all()
        return [{"timestamp": e.timestamp.isoformat(), "event_type": e.event_type, "severity": e.severity, "details": e.details} for e in events]


def get_llm_calls(limit: int = 50) -> list:
    with get_db_session() as db:
        calls = db.query(LLMLoad).order_by(LLMLoad.timestamp.desc()).limit(limit).all()
        return [{"timestamp": c.timestamp.isoformat(), "agent_id": c.user_id, "tokens_in": c.tokens or 0, "tokens_out": 0, "cost_usd": c.cost, "model": c.model} for c in calls]


# ---- Collection helpers ----

def create_collection(user_id: int, name: str, format: str, data: str, description: str = "") -> dict:
    with get_db_session() as db:
        import json
        parsed = json.loads(data) if isinstance(data, str) else data
        total_req = 0
        if format == "postman":
            total_req = len(parsed.get("item", []))
        elif format == "openapi":
            paths = parsed.get("paths", {})
            total_req = sum(len(methods) for methods in paths.values())
        c = Collection(user_id=user_id, name=name, format=format, data=data, description=description, total_requests=total_req)
        db.add(c)
        db.commit()
        db.refresh(c)
        return {"id": c.id, "name": c.name, "format": c.format, "total_requests": c.total_requests, "created_at": c.created_at.isoformat()}


def get_collections_by_user(user_id: int) -> list:
    with get_db_session() as db:
        cols = db.query(Collection).filter(Collection.user_id == user_id).all()
        return [{"id": c.id, "name": c.name, "description": c.description, "format": c.format, "total_requests": c.total_requests, "created_at": c.created_at.isoformat()} for c in cols]


def get_collection_by_id(collection_id: str) -> Optional[dict]:
    with get_db_session() as db:
        c = db.query(Collection).filter(Collection.id == collection_id).first()
        if not c:
            return None
        return {"id": c.id, "user_id": c.user_id, "name": c.name, "description": c.description, "format": c.format, "data": c.data, "total_requests": c.total_requests, "created_at": c.created_at.isoformat()}


def delete_collection(collection_id: str) -> bool:
    with get_db_session() as db:
        c = db.query(Collection).filter(Collection.id == collection_id).first()
        if c:
            db.delete(c)
            db.commit()
            return True
        return False


def update_collection(collection_id: str, name: str = None, description: str = None) -> Optional[dict]:
    with get_db_session() as db:
        c = db.query(Collection).filter(Collection.id == collection_id).first()
        if not c:
            return None
        if name is not None:
            c.name = name
        if description is not None:
            c.description = description
        c.updated_at = datetime.now(timezone.utc)
        db.commit()
        return {"id": c.id, "name": c.name, "description": c.description}


# ---- Scan helpers ----

def create_scan(collection_id: str, user_id: int) -> dict:
    with get_db_session() as db:
        s = Scan(collection_id=collection_id, user_id=user_id, status="pending")
        db.add(s)
        db.commit()
        db.refresh(s)
        return {"id": s.id, "collection_id": s.collection_id, "status": s.status}


def update_scan(scan_id: str, **kwargs) -> Optional[dict]:
    with get_db_session() as db:
        s = db.query(Scan).filter(Scan.id == scan_id).first()
        if not s:
            return None
        for key, val in kwargs.items():
            if hasattr(s, key):
                setattr(s, key, val)
        db.commit()
        return {"id": s.id, "status": s.status, "total_findings": s.total_findings}


def get_scans_by_collection(collection_id: str) -> list:
    with get_db_session() as db:
        scans = db.query(Scan).filter(Scan.collection_id == collection_id).order_by(Scan.created_at.desc()).all()
        return [{"id": s.id, "status": s.status, "total_findings": s.total_findings, "critical_count": s.critical_count, "high_count": s.high_count, "medium_count": s.medium_count, "low_count": s.low_count, "created_at": s.created_at.isoformat()} for s in scans]


def get_scan_by_id(scan_id: str) -> Optional[dict]:
    with get_db_session() as db:
        s = db.query(Scan).filter(Scan.id == scan_id).first()
        if not s:
            return None
        return {"id": s.id, "collection_id": s.collection_id, "status": s.status, "total_findings": s.total_findings, "critical_count": s.critical_count, "high_count": s.high_count, "medium_count": s.medium_count, "low_count": s.low_count, "created_at": s.created_at.isoformat()}


# ---- Finding helpers ----

def create_finding(scan_id: str, severity: str, category: str, title: str, description: str = "", remediation: str = "", endpoint: str = "") -> dict:
    with get_db_session() as db:
        f = Finding(scan_id=scan_id, severity=severity, category=category, title=title, description=description, remediation=remediation, endpoint=endpoint)
        db.add(f)
        db.commit()
        db.refresh(f)
        return {"id": f.id, "severity": f.severity, "title": f.title}


def get_findings_by_scan(scan_id: str) -> list:
    with get_db_session() as db:
        findings = db.query(Finding).filter(Finding.scan_id == scan_id).all()
        return [{"id": f.id, "severity": f.severity, "category": f.category, "title": f.title, "description": f.description, "remediation": f.remediation, "status": f.status, "endpoint": f.endpoint, "created_at": f.created_at.isoformat()} for f in findings]


def update_finding_status(finding_id: str, status: str) -> Optional[dict]:
    with get_db_session() as db:
        f = db.query(Finding).filter(Finding.id == finding_id).first()
        if not f:
            return None
        f.status = status
        db.commit()
        return {"id": f.id, "status": f.status}


# ---- Shadow API helpers ----

def create_shadow_api(collection_id: str, user_id: int, endpoint: str, method: str = "GET", risk_level: str = "Medium", reason: str = "") -> dict:
    with get_db_session() as db:
        s = ShadowAPI(collection_id=collection_id, user_id=user_id, endpoint=endpoint, method=method, risk_level=risk_level, reason=reason)
        db.add(s)
        db.commit()
        db.refresh(s)
        return {"id": s.id, "endpoint": s.endpoint, "risk_level": s.risk_level}


def get_shadow_apis_by_collection(collection_id: str) -> list:
    with get_db_session() as db:
        apis = db.query(ShadowAPI).filter(ShadowAPI.collection_id == collection_id).all()
        return [{"id": a.id, "endpoint": a.endpoint, "method": a.method, "risk_level": a.risk_level, "reason": a.reason, "is_documented": a.is_documented, "discovered_at": a.discovered_at.isoformat()} for a in apis]


def mark_shadow_api_documented(api_id: str) -> Optional[dict]:
    with get_db_session() as db:
        a = db.query(ShadowAPI).filter(ShadowAPI.id == api_id).first()
        if not a:
            return None
        a.is_documented = True
        db.commit()
        return {"id": a.id, "is_documented": True}


# ---- Token Analytics helpers ----

def record_token_usage(user_id: int, model: str, prompt_tokens: int, completion_tokens: int, thinking_tokens: int, cost_usd: float) -> dict:
    with get_db_session() as db:
        t = TokenAnalytics(user_id=user_id, model=model, prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, thinking_tokens=thinking_tokens, cost_usd=cost_usd)
        db.add(t)
        db.commit()
        db.refresh(t)
        return {"id": t.id, "model": t.model, "cost_usd": t.cost_usd}


def get_token_analytics_by_user(user_id: int, model: str = None) -> list:
    with get_db_session() as db:
        q = db.query(TokenAnalytics).filter(TokenAnalytics.user_id == user_id)
        if model:
            q = q.filter(TokenAnalytics.model == model)
        records = q.order_by(TokenAnalytics.recorded_at.desc()).limit(100).all()
        return [{"id": t.id, "model": t.model, "prompt_tokens": t.prompt_tokens, "completion_tokens": t.completion_tokens, "thinking_tokens": t.thinking_tokens, "cost_usd": t.cost_usd, "recorded_at": t.recorded_at.isoformat()} for t in records]


def get_cost_breakdown_by_model(user_id: int) -> list:
    with get_db_session() as db:
        from sqlalchemy import func
        results = db.query(TokenAnalytics.model, func.sum(TokenAnalytics.prompt_tokens), func.sum(TokenAnalytics.completion_tokens), func.sum(TokenAnalytics.thinking_tokens), func.sum(TokenAnalytics.cost_usd)).filter(TokenAnalytics.user_id == user_id).group_by(TokenAnalytics.model).all()
        return [{"model": r[0], "prompt_tokens": r[1] or 0, "completion_tokens": r[2] or 0, "thinking_tokens": r[3] or 0, "total_cost": r[4] or 0.0} for r in results]


# ---- Kill Switch helpers ----

def set_budget_config(user_id: int, monthly_limit: float, daily_limit: float = 0.0, alert_threshold_pct: float = 80.0) -> dict:
    with get_db_session() as db:
        bc = db.query(BudgetConfig).filter(BudgetConfig.user_id == user_id).first()
        if bc:
            bc.monthly_limit = monthly_limit
            bc.daily_limit = daily_limit
            bc.alert_threshold_pct = alert_threshold_pct
            bc.updated_at = datetime.now(timezone.utc)
        else:
            bc = BudgetConfig(user_id=user_id, monthly_limit=monthly_limit, daily_limit=daily_limit, alert_threshold_pct=alert_threshold_pct)
            db.add(bc)
        db.commit()
        return {"user_id": user_id, "monthly_limit": monthly_limit, "daily_limit": daily_limit}


def get_budget_config(user_id: int) -> Optional[dict]:
    with get_db_session() as db:
        bc = db.query(BudgetConfig).filter(BudgetConfig.user_id == user_id).first()
        if not bc:
            return None
        return {"monthly_limit": bc.monthly_limit, "daily_limit": bc.daily_limit, "kill_switch_enabled": bc.kill_switch_enabled, "alert_threshold_pct": bc.alert_threshold_pct}


def log_kill_switch_event(user_id: int, action: str, reason: str = "", budget_limit: float = 0.0, current_spend: float = 0.0, is_active: bool = False) -> dict:
    with get_db_session() as db:
        ks = KillSwitchLog(user_id=user_id, action=action, reason=reason, budget_limit=budget_limit, current_spend=current_spend, is_active=is_active)
        db.add(ks)
        db.commit()
        db.refresh(ks)
        return {"id": ks.id, "action": ks.action, "is_active": ks.is_active}


def get_kill_switch_logs(user_id: int, limit: int = 50) -> list:
    with get_db_session() as db:
        logs = db.query(KillSwitchLog).filter(KillSwitchLog.user_id == user_id).order_by(KillSwitchLog.created_at.desc()).limit(limit).all()
        return [{"id": l.id, "action": l.action, "reason": l.reason, "budget_limit": l.budget_limit, "current_spend": l.current_spend, "is_active": l.is_active, "created_at": l.created_at.isoformat()} for l in logs]


def get_kill_switch_status(user_id: int) -> dict:
    with get_db_session() as db:
        latest = db.query(KillSwitchLog).filter(KillSwitchLog.user_id == user_id).order_by(KillSwitchLog.created_at.desc()).first()
        if not latest:
            return {"is_active": False, "last_action": None}
        return {"is_active": latest.is_active, "last_action": latest.action, "last_reason": latest.reason, "last_triggered_at": latest.created_at.isoformat()}


# ---- Compliance helpers ----

def create_compliance_report(user_id: int, framework: str, collection_id: str = None, score: int = 0, total_requirements: int = 0, met_count: int = 0, not_met_count: int = 0, manual_review_count: int = 0, details: str = "{}") -> dict:
    with get_db_session() as db:
        r = ComplianceReport(user_id=user_id, framework=framework, collection_id=collection_id, score=score, total_requirements=total_requirements, met_count=met_count, not_met_count=not_met_count, manual_review_count=manual_review_count, details=details)
        db.add(r)
        db.commit()
        db.refresh(r)
        return {"id": r.id, "framework": r.framework, "score": r.score}


def get_compliance_reports_by_user(user_id: int) -> list:
    with get_db_session() as db:
        reports = db.query(ComplianceReport).filter(ComplianceReport.user_id == user_id).order_by(ComplianceReport.created_at.desc()).all()
        return [{"id": r.id, "framework": r.framework, "score": r.score, "total_requirements": r.total_requirements, "met_count": r.met_count, "not_met_count": r.not_met_count, "manual_review_count": r.manual_review_count, "collection_id": r.collection_id, "created_at": r.created_at.isoformat()} for r in reports]


def get_compliance_report_by_id(report_id: str) -> Optional[dict]:
    with get_db_session() as db:
        r = db.query(ComplianceReport).filter(ComplianceReport.id == report_id).first()
        if not r:
            return None
        return {"id": r.id, "framework": r.framework, "score": r.score, "total_requirements": r.total_requirements, "met_count": r.met_count, "not_met_count": r.not_met_count, "manual_review_count": r.manual_review_count, "details": r.details, "collection_id": r.collection_id, "created_at": r.created_at.isoformat()}


# ---- Team helpers ----

def invite_team_member(user_id: int, email: str, role: str = "viewer") -> dict:
    with get_db_session() as db:
        m = TeamMember(user_id=user_id, email=email, role=role, status="pending")
        db.add(m)
        db.commit()
        db.refresh(m)
        return {"id": m.id, "email": m.email, "role": m.role, "status": m.status}


def get_team_members(user_id: int) -> list:
    with get_db_session() as db:
        members = db.query(TeamMember).filter(TeamMember.user_id == user_id, TeamMember.status != "removed").all()
        return [{"id": m.id, "email": m.email, "role": m.role, "status": m.status, "invited_at": m.invited_at.isoformat()} for m in members]


def update_team_member_role(member_id: str, role: str) -> Optional[dict]:
    with get_db_session() as db:
        m = db.query(TeamMember).filter(TeamMember.id == member_id).first()
        if not m:
            return None
        m.role = role
        db.commit()
        return {"id": m.id, "role": m.role}


def remove_team_member(member_id: str) -> Optional[dict]:
    with get_db_session() as db:
        m = db.query(TeamMember).filter(TeamMember.id == member_id).first()
        if not m:
            return None
        m.status = "removed"
        db.commit()
        return {"id": m.id, "status": "removed"}


# ---- Onboarding helpers ----

def get_onboarding_progress(user_id: int) -> dict:
    with get_db_session() as db:
        step = db.query(OnboardingStep).filter(OnboardingStep.user_id == user_id).first()
        if not step:
            step = OnboardingStep(user_id=user_id)
            db.add(step)
            db.commit()
            db.refresh(step)
        return {"import_collection": step.import_collection, "run_scan": step.run_scan, "review_findings": step.review_findings, "invite_team": step.invite_team, "setup_compliance": step.setup_compliance}


def complete_onboarding_step(user_id: int, step_name: str) -> Optional[dict]:
    valid_steps = ["import_collection", "run_scan", "review_findings", "invite_team", "setup_compliance"]
    if step_name not in valid_steps:
        return None
    with get_db_session() as db:
        step = db.query(OnboardingStep).filter(OnboardingStep.user_id == user_id).first()
        if not step:
            step = OnboardingStep(user_id=user_id)
            db.add(step)
            db.commit()
            db.refresh(step)
        setattr(step, step_name, True)
        step.updated_at = datetime.now(timezone.utc)
        db.commit()
        return {"step": step_name, "completed": True}


# ---- Dashboard helpers ----

def get_dashboard_stats(user_id: int) -> dict:
    with get_db_session() as db:
        collections_count = db.query(Collection).filter(Collection.user_id == user_id).count()
        scans_count = db.query(Scan).filter(Scan.user_id == user_id).count()
        findings_open = db.query(Finding).join(Scan).filter(Scan.user_id == user_id, Finding.status == "open").count()
        team_count = db.query(TeamMember).filter(TeamMember.user_id == user_id, TeamMember.status != "removed").count()
        total_cost = get_total_cost()
        return {"collections_count": collections_count, "scans_count": scans_count, "open_findings": findings_open, "team_members": team_count, "total_cost": total_cost}