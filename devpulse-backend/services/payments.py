import os
import stripe
from fastapi import HTTPException, Header, Request
from typing import Optional

stripe.api_key = os.getenv("STRIPE_API_KEY", "")

PRO_PRICE_ID = os.getenv("STRIPE_PRO_PRICE_ID", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

def create_checkout_session(
    user_email: str,
    user_id: Optional[int] = None,
    success_url: Optional[str] = None,
    cancel_url: Optional[str] = None
) -> dict:
    """
    Create a Stripe Checkout Session for the Pro Plan.
    """
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe API key not configured")

    try:
        checkout_params = {
            "payment_method_types": ["card"],
            "line_items": [
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": "DevPulse Pro Plan",
                            "description": "Advanced features including unlimited agents, real-time Slack alerts, and priority support",
                        },
                        "unit_amount": 2900,  # $29.00
                    },
                    "quantity": 1,
                }
            ],
            "mode": "payment",
            "success_url": success_url or f"{FRONTEND_URL}/dashboard?success=true&session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": cancel_url or f"{FRONTEND_URL}/pricing?canceled=true",
            "customer_email": user_email,
            "metadata": {
                "user_email": user_email,
            }
        }
        
        if user_id:
            checkout_params["metadata"]["user_id"] = str(user_id)
        
        if PRO_PRICE_ID:
            checkout_params["line_items"] = [{
                "price": PRO_PRICE_ID,
                "quantity": 1
            }]

        checkout_session = stripe.checkout.Session.create(**checkout_params)
        
        return {
            "url": checkout_session.url,
            "session_id": checkout_session.id
        }
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))

def handle_stripe_webhook(payload: bytes, sig_header: str) -> dict:
    """
    Handle Stripe webhook events.
    Signature verification is ALWAYS required — no bypass allowed.
    """
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail="Stripe API key not configured")
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Stripe webhook secret not configured — cannot verify signatures")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_email = session.get("metadata", {}).get("user_email")
        customer_email = session.get("customer_email")
        
        target_email = user_email or customer_email
        
        if target_email:
            from database import update_user_plan
            print(f"Payment completed for user: {target_email}")
            update_user_plan(target_email, "pro")
        
        return {
            "status": "success",
            "event": "checkout.session.completed",
            "email": target_email
        }
    
    elif event["type"] == "payment_intent.succeeded":
        return {"status": "success", "event": "payment_intent.succeeded"}
    
    elif event["type"] == "payment_intent.payment_failed":
        return {"status": "failed", "event": "payment_intent.payment_failed"}
    
    return {"status": "ignored", "event": event["type"]}

def get_subscription_status(session_id: str) -> dict:
    """Check the status of a checkout session."""
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        return {
            "payment_status": session.get("payment_status"),
            "status": session.get("status"),
            "customer_email": session.get("customer_email")
        }
    except stripe.error.StripeError:
        return {"error": "Invalid session ID"}