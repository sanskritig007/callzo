import json
import pytest
from datetime import datetime, timezone
from pydantic import ValidationError
from fastapi import HTTPException
from task1.app.security import (
    compute_signature,
    verify_webhook_signature,
    verify_api_key
)
from task1.app.schemas import WebhookPayload, EventType
from task1.app.config import settings

SECRET = "callzo_test_secret_change_me"

SAMPLE_PAYLOAD = {
    "event_id": "evt_test_100",
    "event_type": "call.started",
    "account_id": "acct_001",
    "call_id": "call_abc_123",
    "timestamp": "2026-11-01T10:15:30.123456+00:00",
    "duration_seconds": 0,
    "cost_cents": 0,
    "destination_country": "US"
}

def test_signature_verification_success():
    """Verify that a valid HMAC-SHA256 signature over raw bytes succeeds."""
    raw_bytes = json.dumps(SAMPLE_PAYLOAD).encode("utf-8")
    signature = compute_signature(raw_bytes, SECRET)

    is_valid = verify_webhook_signature(
        raw_body_bytes=raw_bytes,
        received_signature=signature,
        secret=SECRET
    )
    assert is_valid is True

def test_signature_verification_fails_on_tampered_payload():
    """Verify that any modification to payload bytes breaks the signature."""
    raw_bytes = json.dumps(SAMPLE_PAYLOAD).encode("utf-8")
    signature = compute_signature(raw_bytes, SECRET)

    tampered_bytes = raw_bytes.replace(b"acct_001", b"acct_002")
    is_valid = verify_webhook_signature(
        raw_body_bytes=tampered_bytes,
        received_signature=signature,
        secret=SECRET
    )
    assert is_valid is False

def test_signature_verification_fails_on_wrong_secret():
    """Verify that signature fails if signed with a different secret."""
    raw_bytes = json.dumps(SAMPLE_PAYLOAD).encode("utf-8")
    signature = compute_signature(raw_bytes, "wrong_secret")

    is_valid = verify_webhook_signature(
        raw_body_bytes=raw_bytes,
        received_signature=signature,
        secret=SECRET
    )
    assert is_valid is False

def test_signature_verification_fails_on_missing_signature():
    """Verify that None or empty signature fails immediately."""
    raw_bytes = json.dumps(SAMPLE_PAYLOAD).encode("utf-8")
    assert verify_webhook_signature(raw_bytes, None, secret=SECRET) is False
    assert verify_webhook_signature(raw_bytes, "", secret=SECRET) is False

def test_pydantic_schema_valid_payload():
    """Test that a valid payload correctly parses into WebhookPayload."""
    payload = WebhookPayload(**SAMPLE_PAYLOAD)
    assert payload.event_id == "evt_test_100"
    assert payload.event_type == EventType.CALL_STARTED
    assert payload.account_id == "acct_001"
    assert payload.cost_cents == 0

def test_pydantic_schema_rejects_unknown_event_type():
    """
    Simulator Scenario: malformed payload with unknown event_type.
    Must raise ValidationError (which FastAPI turns into clean 422).
    """
    bad_payload = dict(SAMPLE_PAYLOAD)
    bad_payload["event_type"] = "call.exploded"  # Unknown event type

    with pytest.raises(ValidationError):
        WebhookPayload(**bad_payload)

def test_pydantic_schema_rejects_missing_required_fields():
    """Simulator Scenario: missing event_id or call_id."""
    bad_payload = dict(SAMPLE_PAYLOAD)
    del bad_payload["event_id"]

    with pytest.raises(ValidationError):
        WebhookPayload(**bad_payload)

def test_pydantic_schema_rejects_negative_cost_or_duration():
    """Enforce non-negative integers for money and duration."""
    bad_payload = dict(SAMPLE_PAYLOAD)
    bad_payload["cost_cents"] = -50

    with pytest.raises(ValidationError):
        WebhookPayload(**bad_payload)

def test_verify_api_key_dependency(monkeypatch):
    """Test API key authentication for protected endpoints."""
    monkeypatch.setattr(settings, "API_KEY", "super_secret_api_key")
    
    # Valid key
    assert verify_api_key("super_secret_api_key") == "super_secret_api_key"

    # Invalid key
    with pytest.raises(HTTPException) as exc_info:
        verify_api_key("wrong_key")
    assert exc_info.value.status_code == 401

