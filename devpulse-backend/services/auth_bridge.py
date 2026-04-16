"""
Auth Bridge — validates JWT tokens issued by the main TypeScript backend.

The TS backend uses Manus OAuth + Google OAuth and issues its own JWTs.
This module allows the Python backend to validate those tokens so both
backends can share the same auth context.

The TS backend signs JWTs with JWT_SECRET (from env). The Python backend
can validate those same JWTs if it has access to the same secret.
"""
import os
from typing import Optional
from jose import JWTError, jwt

# The TS backend's JWT secret — must match the JWT_SECRET in the main .env
TS_JWT_SECRET = os.getenv("JWT_SECRET", "")
ALGORITHM = "HS256"


def validate_ts_token(token: str) -> Optional[dict]:
    """
    Validate a JWT token issued by the TypeScript backend.
    Returns the decoded payload if valid, None otherwise.
    """
    if not TS_JWT_SECRET:
        return None

    try:
        payload = jwt.decode(token, TS_JWT_SECRET, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


def get_user_id_from_ts_token(token: str) -> Optional[int]:
    """
    Extract the user ID from a TS backend JWT token.
    The TS backend stores user info in the token payload.
    """
    payload = validate_ts_token(token)
    if not payload:
        return None

    # TS backend may store user ID as 'sub' or 'userId'
    user_id = payload.get("userId") or payload.get("sub")
    if user_id:
        try:
            return int(user_id)
        except (ValueError, TypeError):
            return None
    return None
