import os

SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN:
    import sentry_sdk
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=0.1,
        environment=os.getenv("ENVIRONMENT", "development")
    )

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from pydantic import BaseModel
from typing import Optional, List
import uvicorn
import datetime
import time
import logging
import json

from database import init_db, log_llm_call, log_security_event, get_total_cost, get_recent_costs, get_security_events, get_llm_calls
from websocket_manager import manager
from services.cost_tracker import calculate_cost, detect_anomaly, get_cost_breakdown
from services.shadow_api_detector import create_default_detector
from services.github_integration import handle_github_push, handle_github_pull_request
from services.payments import create_checkout_session, handle_stripe_webhook
from integrations.github_app import handle_github_webhook
from integrations.slack_bot import send_alert, send_cost_alert, send_security_alert
from routers import auth, admin, collections, scanning, shadow_apis, token_analytics, kill_switch, compliance, team, onboarding, dashboard

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("devpulse")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    print("DevPulse Database Initialized")
    logger.info("DevPulse API started successfully")
    yield
    print("DevPulse Shutting Down...")

app = FastAPI(
    title="DevPulse Core API", 
    version="1.0.0",
    description="AI Agent Security & Cost Monitoring Platform",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, tags=["Authentication"], prefix="/api/auth")
app.include_router(admin.router, tags=["Admin"], prefix="/api/admin")
app.include_router(collections.router, tags=["Collections"], prefix="/api/collections")
app.include_router(scanning.router, tags=["Scanning"], prefix="/api/scanning")
app.include_router(shadow_apis.router, tags=["Shadow APIs"], prefix="/api/shadow-apis")
app.include_router(token_analytics.router, tags=["Token Analytics"], prefix="/api/token-analytics")
app.include_router(kill_switch.router, tags=["Kill Switch"], prefix="/api/kill-switch")
app.include_router(compliance.router, tags=["Compliance"], prefix="/api/compliance")
app.include_router(team.router, tags=["Team"], prefix="/api/team")
app.include_router(onboarding.router, tags=["Onboarding"], prefix="/api/onboarding")
app.include_router(dashboard.router, tags=["Dashboard"], prefix="/api/dashboard")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = (time.time() - start_time) * 1000
    
    logger.info({
        "method": request.method,
        "path": request.url.path,
        "status_code": response.status_code,
        "process_time_ms": round(process_time, 2),
        "client_ip": request.client.host if request.client else "unknown"
    })
    return response

class AgentInteractRequest(BaseModel):
    agent_id: str
    model: str = "gpt-3.5-turbo"
    prompt_tokens: int = 0
    completion_tokens: int = 0

class ScanRequest(BaseModel):
    code: str

class CheckoutRequest(BaseModel):
    user_email: str
    user_id: Optional[int] = None

@app.post("/api/agent/interact")
async def agent_interact(req: AgentInteractRequest):
    cost = calculate_cost(req.model, req.prompt_tokens, req.completion_tokens)
    log_llm_call(req.agent_id, req.prompt_tokens, req.completion_tokens, cost, req.model)
    
    history = get_recent_costs(limit=20)
    is_anomaly = detect_anomaly(cost, history)
    
    if is_anomaly:
        log_security_event(
            "cost_anomaly",
            "High",
            f"Agent {req.agent_id} cost spike: ${cost:.4f}"
        )
        await send_cost_alert(req.agent_id, cost, 1.0)
    
    total_cost = get_total_cost()
    
    await manager.broadcast({
        "type": "cost_update",
        "agent_id": req.agent_id,
        "cost": cost,
        "total_cost": total_cost,
        "anomaly": is_anomaly,
        "model": req.model
    })
    
    return {
        "status": "logged",
        "cost": cost,
        "anomaly_detected": is_anomaly
    }

@app.post("/api/agent/cost-breakdown")
async def cost_breakdown(req: AgentInteractRequest):
    breakdown = get_cost_breakdown(req.model, req.prompt_tokens, req.completion_tokens)
    return breakdown

@app.get("/api/analytics/summary")
async def get_analytics_summary():
    return {
        "total_cost": get_total_cost(),
        "recent_calls": get_llm_calls(limit=10),
        "security_events": get_security_events(limit=10)
    }

@app.post("/api/security/scan")
async def security_scan(req: ScanRequest):
    detector = create_default_detector()
    findings = detector.scan_code(req.code)
    
    for finding in findings:
        if finding.get("type") == "hardcoded_secret":
            await send_security_alert("hardcoded_secret", f"Found hardcoded secret in code: {finding.get('key')}")
    
    return {"findings": findings, "count": len(findings)}

@app.post("/api/webhooks/github")
async def github_webhook(request: Request):
    event_type = request.headers.get("X-GitHub-Event", "push")
    
    if event_type == "push":
        return await handle_github_push(request)
    elif event_type == "pull_request":
        return await handle_github_pull_request(request)
    else:
        return {"status": "ignored", "event": event_type}

@app.post("/webhooks/github")
async def github_app_webhook(request: Request):
    return await handle_github_webhook(request)

@app.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None)
):
    payload = await request.body()
    return handle_stripe_webhook(payload, stripe_signature or "")

@app.post("/api/payments/checkout")
async def create_checkout(req: CheckoutRequest):
    result = create_checkout_session(req.user_email, req.user_id)
    return result

@app.post("/api/alerts/test")
async def test_alert():
    await send_alert("Test Alert", "This is a test alert from DevPulse", color="#3498db")
    return {"status": "sent"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = None):
    # Optional auth: if token provided via query param, validate it
    user_id = None
    if token:
        from auth import decode_token
        payload = decode_token(token)
        if payload:
            user_id = payload.get("sub")

    await manager.connect(websocket, user_id=user_id)
    try:
        await websocket.send_json({
            "type": "init",
            "total_cost": get_total_cost(),
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        })
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data) if data else {}
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id=user_id)

@app.get("/")
async def root():
    return {
        "status": "online", 
        "service": "DevPulse Core API",
        "version": "1.0.0"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)