from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime, timezone
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./devpulse.db")

connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    api_key = Column(String, unique=True, nullable=True)
    is_admin = Column(Boolean, default=False)
    plan = Column(String, default="free")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    @classmethod
    def from_db(cls, user_dict):
        if user_dict is None:
            return None
        instance = cls(
            id=user_dict.id,
            email=user_dict.email,
            hashed_password=user_dict.hashed_password,
            api_key=user_dict.api_key,
            is_admin=user_dict.is_admin,
            plan=user_dict.plan,
            created_at=user_dict.created_at,
        )
        return instance

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

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_user(email: str, hashed_password: str, api_key: str) -> User:
    db = SessionLocal()
    try:
        user = User(email=email, hashed_password=hashed_password, api_key=api_key, is_admin=False, plan="free")
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()

def get_user_by_email(email: str) -> User:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        result = None
        if user:
            result = User(id=user.id, email=user.email, hashed_password=user.hashed_password, 
                          api_key=user.api_key, is_admin=user.is_admin, plan=user.plan)
        return result
    finally:
        db.close()

def get_user_by_id(user_id: int) -> User:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        result = None
        if user:
            result = User(id=user.id, email=user.email, hashed_password=user.hashed_password,
                          api_key=user.api_key, is_admin=user.is_admin, plan=user.plan)
        return result
    finally:
        db.close()

def get_all_users() -> list:
    db = SessionLocal()
    try:
        users = db.query(User).all()
        return [{"id": u.id, "email": u.email, "plan": u.plan, "is_active": True, "created_at": u.created_at} for u in users]
    finally:
        db.close()

def update_user_plan(email: str, plan: str) -> bool:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.plan = plan
            db.commit()
            return True
        return False
    finally:
        db.close()

def log_llm_call(agent_id: str, tokens_in: int, tokens_out: int, cost: float, model: str):
    db = SessionLocal()
    try:
        db.add(LLMLoad(agent_id=agent_id, tokens=tokens_in+tokens_out, cost=cost, model=model))
        db.add(CostHistory(cost_usd=cost))
        db.commit()
    finally:
        db.close()

def log_security_event(event_type: str, severity: str, details: str):
    db = SessionLocal()
    try:
        db.add(SecurityEvent(event_type=event_type, severity=severity, details=details))
        db.commit()
    finally:
        db.close()

def get_total_cost() -> float:
    db = SessionLocal()
    try:
        total = db.query(LLMLoad).with_entities(LLMLoad.cost).all()
        result = sum([t[0] for t in total]) if total else 0.0
        return result
    finally:
        db.close()

def get_recent_costs(limit: int = 10) -> list:
    db = SessionLocal()
    try:
        costs = db.query(CostHistory).order_by(CostHistory.timestamp.desc()).limit(limit).all()
        return [c.cost_usd for c in costs]
    finally:
        db.close()

def get_security_events(limit: int = 50) -> list:
    db = SessionLocal()
    try:
        events = db.query(SecurityEvent).order_by(SecurityEvent.timestamp.desc()).limit(limit).all()
        return [{"timestamp": e.timestamp.isoformat(), "event_type": e.event_type, "severity": e.severity, "details": e.details} for e in events]
    finally:
        db.close()

def get_llm_calls(limit: int = 50) -> list:
    db = SessionLocal()
    try:
        calls = db.query(LLMLoad).order_by(LLMLoad.timestamp.desc()).limit(limit).all()
        return [{"timestamp": c.timestamp.isoformat(), "agent_id": c.agent_id, "tokens_in": c.tokens or 0, "tokens_out": 0, "cost_usd": c.cost, "model": c.model} for c in calls]
    finally:
        db.close()