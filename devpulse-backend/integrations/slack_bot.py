import os
import json
import time
from typing import Optional
import httpx

SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")

async def send_alert(
    title: str,
    message: str,
    color: str = "#ff0000",
    fields: Optional[dict] = None
) -> bool:
    """
    Send a formatted alert to Slack asynchronously.

    Colors:
    - #ff0000 (Red/High Risk)
    - #ffff00 (Yellow/Warning)
    - #36a64f (Green/Info)
    - #3498db (Blue/Neutral)
    """
    if not SLACK_WEBHOOK_URL:
        print("Slack Webhook URL not set. Skipping alert.")
        return False

    attachments = [{
        "color": color,
        "title": f"🤖 DevPulse Alert: {title}",
        "text": message,
        "footer": "DevPulse AgentGuard",
        "ts": int(time.time())
    }]

    if fields:
        attachments[0]["fields"] = [
            {"title": k, "value": v, "short": True}
            for k, v in fields.items()
        ]

    payload = {"attachments": attachments}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                SLACK_WEBHOOK_URL,
                json=payload,
            )
            return response.status_code == 200
    except Exception as e:
        print(f"Failed to send Slack alert: {e}")
        return False

async def send_cost_alert(agent_id: str, current_cost: float, threshold: float) -> bool:
    return await send_alert(
        "Cost Anomaly Detected",
        f"Agent *{agent_id}* has exceeded the cost threshold.\n\nCurrent: ${current_cost:.4f}\nThreshold: ${threshold:.4f}",
        color="#ff0000",
        fields={
            "Agent": agent_id,
            "Current Cost": f"${current_cost:.4f}",
            "Threshold": f"${threshold:.4f}"
        }
    )

async def send_security_alert(alert_type: str, details: str) -> bool:
    color_map = {
        "pii_detected": "#ff0000",
        "shadow_api": "#ffff00",
        "hardcoded_secret": "#ff0000",
        "rate_limit_exceeded": "#ffff00"
    }
    return await send_alert(
        f"Security: {alert_type.replace('_', ' ').title()}",
        details,
        color=color_map.get(alert_type, "#ff0000")
    )

async def send_system_status(status: str, message: str) -> bool:
    color = "#36a64f" if status == "healthy" else "#ff0000"
    return await send_alert(
        f"System Status: {status.title()}",
        message,
        color=color
    )