from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

class EventType(str, Enum):
    """Permitted telephony event types as per the Callzo contract spec."""
    CALL_STARTED = "call.started"
    CALL_ENDED = "call.ended"
    CALL_FAILED = "call.failed"


class WebhookPayload(BaseModel):
    """
    Pydantic schema representing incoming telephony webhook payload.
    Any malformed requests (missing fields, wrong types, unknown event_types)
    will be rejected with clean HTTP 422 errors before reaching DB logic.
    """
    event_id: str = Field(..., min_length=1, description="Unique identifier per delivery attempt")
    event_type: EventType = Field(..., description="One of call.started, call.ended, call.failed")
    account_id: str = Field(..., min_length=1, description="Target customer account ID (e.g. acct_001)")
    call_id: str = Field(..., min_length=1, description="Shared ID across call.started and call.ended")
    timestamp: datetime = Field(..., description="ISO 8601 timestamp when event occurred")
    duration_seconds: int = Field(..., ge=0, description="Call duration in integer seconds")
    cost_cents: int = Field(..., ge=0, description="Cost in integer cents (no floats!)")
    destination_country: Optional[str] = Field(None, max_length=10, description="ISO destination country code")

    model_config = ConfigDict(extra="ignore")


class WebhookProcessingResponse(BaseModel):
    """Standardized response for webhook receipt and processing."""
    status: str = Field(..., json_schema_extra={"example": "success"})
    message: str = Field(..., json_schema_extra={"example": "Event processed successfully"})
    event_id: str = Field(..., json_schema_extra={"example": "evt_a1b2c3d4e5f6"})
    action_taken: str = Field(..., json_schema_extra={"example": "usage_updated"})  # usage_updated, duplicate_ignored, out_of_order_recorded


class AccountUsageResponse(BaseModel):
    """Authenticated response schema for GET /accounts/{id}/usage."""
    account_id: str
    billing_period: str
    total_calls: int
    total_duration_seconds: int
    total_cost_cents: int
    monthly_cap_cents: int
    cap_exceeded: bool
    remaining_cap_cents: int
    last_updated_at: datetime


class HealthCheckResponse(BaseModel):
    """Health check response schema for GET /health."""
    status: str = "ok"
    database_connected: bool
    timestamp: datetime
