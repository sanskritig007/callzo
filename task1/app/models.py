from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Integer,
    Boolean,
    DateTime,
    JSON,
    ForeignKey,
    UniqueConstraint,
    Index
)
from task1.app.database import Base

def utc_now():
    """Return current UTC timestamp with timezone awareness."""
    return datetime.now(timezone.utc)

class RawEvent(Base):
    """
    Immutable audit log of all raw webhooks received.
    Primary Key on event_id provides a strict database-level defense 
    against duplicate event deliveries from telephony providers.
    """
    __tablename__ = "raw_events"

    # Unique identifier per delivery attempt (e.g., 'evt_a1b2c3d4e5f6')
    event_id = Column(String(64), primary_key=True, index=True)
    event_type = Column(String(32), nullable=False, index=True)  # call.started, call.ended, call.failed
    account_id = Column(String(32), nullable=False, index=True)  # acct_001 ... acct_010
    call_id = Column(String(64), nullable=False, index=True)
    payload = Column(JSON, nullable=False)                       # Raw JSON for reconciliation
    received_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    processed_status = Column(String(20), default="processed", nullable=False)  # processed, duplicate, malformed


class Call(Base):
    """
    State table for individual calls.
    Shared call_id ensures that regardless of whether call.ended arrives 
    before or after call.started, the call record is reconciled cleanly.
    """
    __tablename__ = "calls"

    # Shared between call.started and call.ended (e.g., 'call_9f8e7d6c5b4a')
    call_id = Column(String(64), primary_key=True, index=True)
    account_id = Column(String(32), nullable=False, index=True)
    
    # Lifecycle status: 'started', 'ended', 'completed', 'failed'
    status = Column(String(20), nullable=False, default="started")
    
    destination_country = Column(String(8), nullable=True)
    
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    
    # Telephony metrics: STRICT INTEGER UNITS (never float)
    duration_seconds = Column(Integer, default=0, nullable=False)
    cost_cents = Column(Integer, default=0, nullable=False)
    
    # Audit timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class AccountUsage(Base):
    """
    Aggregated usage and monthly cap tracking per account per billing month.
    Maintains atomic aggregates so that GET /usage queries are O(1) fast 
    and do not require full-table SUM scans on every request.
    """
    __tablename__ = "account_usage"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(String(32), nullable=False, index=True)
    
    # Billing period in 'YYYY-MM' format (e.g. '2026-11')
    billing_period = Column(String(7), nullable=False, index=True)
    
    # Aggregated metrics (ALL INTEGER UNITS)
    total_calls = Column(Integer, default=0, nullable=False)
    total_duration_seconds = Column(Integer, default=0, nullable=False)
    total_cost_cents = Column(Integer, default=0, nullable=False)
    
    # Cap enforcement configuration & state
    monthly_cap_cents = Column(Integer, default=5000, nullable=False)
    cap_exceeded = Column(Boolean, default=False, nullable=False)
    
    last_updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Ensure one record per account per billing month
    __table_args__ = (
        UniqueConstraint("account_id", "billing_period", name="uq_account_billing_period"),
        Index("idx_account_period", "account_id", "billing_period"),
    )

