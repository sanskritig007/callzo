import hmac
import hashlib
from typing import Optional
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader
from task1.app.config import settings

# Header for usage API authentication
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)

def compute_signature(payload_bytes: bytes, secret: str) -> str:
    """
    Computes hex HMAC-SHA256 of the raw payload bytes.
    Matches the telephony simulator's signature generation scheme:
    HMAC-SHA256(secret, raw_request_body_bytes).
    """
    return hmac.new(
        key=secret.encode("utf-8"),
        msg=payload_bytes,
        digestmod=hashlib.sha256
    ).hexdigest()


def verify_webhook_signature(
    raw_body_bytes: bytes, 
    received_signature: Optional[str],
    secret: Optional[str] = None
) -> bool:
    """
    Verifies that the incoming X-Signature header matches the HMAC-SHA256
    of the raw request body.

    Crucial Design Points:
    1. Operates on RAW BYTES, never re-serialized JSON.
    2. Uses constant-time hmac.compare_digest to prevent timing attacks.
    3. Returns False if signature header is missing or mismatching.
    """
    if not received_signature:
        return False

    active_secret = secret if secret is not None else settings.WEBHOOK_SECRET
    if not active_secret:
        return False

    expected_signature = compute_signature(raw_body_bytes, active_secret)

    # Constant-time comparison prevents timing attacks
    return hmac.compare_digest(expected_signature, received_signature.strip())


def verify_api_key(api_key: Optional[str] = Security(API_KEY_HEADER)) -> str:
    """
    FastAPI dependency to protect Usage and Admin API endpoints.
    Verifies the X-API-Key header against the configured API_KEY setting.
    """
    if not api_key or not settings.API_KEY or not hmac.compare_digest(api_key, settings.API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API Key. Provide a valid 'X-API-Key' header.",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    return api_key

