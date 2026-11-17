import json
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from task1.app.main import app
from task1.app.database import Base, get_db
from task1.app.security import compute_signature
from task1.app.config import settings

# Test database in-memory with StaticPool to share connection across threads
TEST_DB_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

# Override the database dependency in FastAPI app
app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client():
    return TestClient(app)

SECRET = "callzo_test_secret_change_me"
API_KEY = "callzo_live_api_key_secure_123"

SAMPLE_CALL_ENDED = {
    "event_id": "evt_api_test_001",
    "event_type": "call.ended",
    "account_id": "acct_001",
    "call_id": "call_api_123",
    "timestamp": "2026-11-14T10:00:00+00:00",
    "duration_seconds": 120,
    "cost_cents": 4,
    "destination_country": "US"
}

def test_webhook_success_with_valid_signature(client, monkeypatch):
    """
    POST /webhooks/calls with valid signature must succeed with 200 OK.
    """
    monkeypatch.setattr(settings, "WEBHOOK_SECRET", SECRET)
    body_bytes = json.dumps(SAMPLE_CALL_ENDED).encode("utf-8")
    signature = compute_signature(body_bytes, SECRET)

    response = client.post(
        "/webhooks/calls",
        content=body_bytes,
        headers={"Content-Type": "application/json", "X-Signature": signature}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["event_id"] == "evt_api_test_001"


def test_webhook_rejected_on_bad_signature(client, monkeypatch):
    """
    Simulator Scenario: bad_signature.
    Must reject with 401 Unauthorized before processing payload.
    """
    monkeypatch.setattr(settings, "WEBHOOK_SECRET", SECRET)
    body_bytes = json.dumps(SAMPLE_CALL_ENDED).encode("utf-8")

    response = client.post(
        "/webhooks/calls",
        content=body_bytes,
        headers={"Content-Type": "application/json", "X-Signature": "invalid_fake_signature"}
    )
    assert response.status_code == 401
    assert "Invalid or missing X-Signature" in response.json()["detail"]


def test_webhook_rejected_on_missing_signature(client):
    """
    Missing X-Signature header must immediately return 401.
    """
    body_bytes = json.dumps(SAMPLE_CALL_ENDED).encode("utf-8")

    response = client.post(
        "/webhooks/calls",
        content=body_bytes,
        headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 401


def test_webhook_malformed_payload_clean_422(client, monkeypatch):
    """
    Simulator Scenario: malformed (unknown event_type, bad json).
    Must return clean 422 Unprocessable Entity, process MUST NOT crash.
    """
    monkeypatch.setattr(settings, "WEBHOOK_SECRET", SECRET)
    malformed_body = {"event_id": "evt_bad", "event_type": "call.exploded"}
    body_bytes = json.dumps(malformed_body).encode("utf-8")
    signature = compute_signature(body_bytes, SECRET)

    response = client.post(
        "/webhooks/calls",
        content=body_bytes,
        headers={"Content-Type": "application/json", "X-Signature": signature}
    )
    assert response.status_code == 422


def test_get_usage_authenticated_success(client, monkeypatch):
    """
    GET /accounts/{id}/usage must return 200 OK when X-API-Key is provided.
    """
    monkeypatch.setattr(settings, "API_KEY", API_KEY)
    response = client.get(
        "/accounts/acct_001/usage",
        headers={"X-API-Key": API_KEY}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["account_id"] == "acct_001"
    assert "total_cost_cents" in data
    assert "monthly_cap_cents" in data


def test_get_usage_unauthenticated_rejected(client, monkeypatch):
    """
    GET /accounts/{id}/usage without API key must return 401.
    """
    monkeypatch.setattr(settings, "API_KEY", API_KEY)
    response = client.get("/accounts/acct_001/usage")
    assert response.status_code == 401


def test_reconcile_endpoint_authenticated(client, monkeypatch):
    """
    POST /accounts/{id}/reconcile must recompute usage and return 200 OK.
    """
    monkeypatch.setattr(settings, "API_KEY", API_KEY)
    response = client.post(
        "/accounts/acct_001/reconcile",
        headers={"X-API-Key": API_KEY}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_health_check_endpoint(client):
    """
    GET /health must return 200 OK with database_connected=True.
    """
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database_connected"] is True
