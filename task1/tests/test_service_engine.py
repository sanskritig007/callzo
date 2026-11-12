import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from task1.app.database import Base
from task1.app.models import RawEvent, Call, AccountUsage
from task1.app.schemas import WebhookPayload, EventType
from task1.app.service import (
    process_webhook_event,
    get_account_usage,
    reconcile_account_usage
)

TEST_DB_URL = "sqlite:///:memory:"

@pytest.fixture
def db_session():
    engine = create_engine(TEST_DB_URL)
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


def test_idempotency_duplicate_events_ignored(db_session):
    """
    Simulator Scenario: duplicates.
    Same event_id sent 2-3 times. Usage must NEVER be double counted.
    """
    payload_dict = {
        "event_id": "evt_dup_100",
        "event_type": "call.ended",
        "account_id": "acct_001",
        "call_id": "call_dup_1",
        "timestamp": datetime.now(timezone.utc),
        "duration_seconds": 120,
        "cost_cents": 4,
        "destination_country": "US"
    }
    event = WebhookPayload(**payload_dict)

    # First delivery
    res1 = process_webhook_event(db_session, event, payload_dict)
    assert res1["status"] == "success"
    assert res1["action_taken"] == "out_of_order_ended_recorded"

    # Second delivery (Exact same event_id)
    res2 = process_webhook_event(db_session, event, payload_dict)
    assert res2["status"] == "success"
    assert res2["action_taken"] == "duplicate_ignored"

    # Verify AccountUsage: must only have 4 cents, NOT 8 cents
    usage = get_account_usage(db_session, "acct_001")
    assert usage.total_calls == 1
    assert usage.total_cost_cents == 4
    assert usage.total_duration_seconds == 120


def test_out_of_order_call_lifecycle(db_session):
    """
    Simulator Scenario: out_of_order.
    call.ended arrives BEFORE call.started.
    """
    now = datetime.now(timezone.utc)
    
    # 1. call.ended arrives FIRST
    ended_dict = {
        "event_id": "evt_ooo_end",
        "event_type": "call.ended",
        "account_id": "acct_002",
        "call_id": "call_ooo_99",
        "timestamp": now,
        "duration_seconds": 180,
        "cost_cents": 6,
        "destination_country": "US"
    }
    ended_event = WebhookPayload(**ended_dict)
    res_end = process_webhook_event(db_session, ended_event, ended_dict)
    assert res_end["action_taken"] == "out_of_order_ended_recorded"

    # Check Call table state
    call_in_db = db_session.query(Call).filter_by(call_id="call_ooo_99").first()
    assert call_in_db.status == "ended"
    assert call_in_db.cost_cents == 6
    assert call_in_db.duration_seconds == 180

    # 2. call.started arrives SECOND (out of order)
    started_dict = {
        "event_id": "evt_ooo_start",
        "event_type": "call.started",
        "account_id": "acct_002",
        "call_id": "call_ooo_99",
        "timestamp": now - timedelta(seconds=180),
        "duration_seconds": 0,
        "cost_cents": 0,
        "destination_country": "US"
    }
    started_event = WebhookPayload(**started_dict)
    res_start = process_webhook_event(db_session, started_event, started_dict)
    assert res_start["action_taken"] == "out_of_order_started_reconciled"

    # Verify Call table state reconciled to completed
    db_session.refresh(call_in_db)
    assert call_in_db.status == "completed"
    assert call_in_db.started_at is not None

    # Verify usage was NOT charged twice
    usage = get_account_usage(db_session, "acct_002")
    assert usage.total_cost_cents == 6
    assert usage.total_duration_seconds == 180


def test_monthly_cap_enforcement_burst(db_session):
    """
    Simulator Scenario: cap_burst.
    Verifies that spending cap is enforced at the boundary.
    """
    account_id = "acct_003"
    # Seed usage with cap = 100 cents
    usage = AccountUsage(
        account_id=account_id,
        billing_period=datetime.now(timezone.utc).strftime("%Y-%m"),
        total_calls=1,
        total_duration_seconds=3000,
        total_cost_cents=100,
        monthly_cap_cents=100,
        cap_exceeded=True
    )
    db_session.add(usage)
    db_session.commit()

    # Now attempt a new call.started when cap is already exceeded
    burst_start = {
        "event_id": "evt_burst_001",
        "event_type": "call.started",
        "account_id": account_id,
        "call_id": "call_burst_new",
        "timestamp": datetime.now(timezone.utc),
        "duration_seconds": 0,
        "cost_cents": 0,
        "destination_country": "US"
    }
    event = WebhookPayload(**burst_start)
    response = process_webhook_event(db_session, event, burst_start)

    assert response["status"] == "rejected"
    assert response["action_taken"] == "cap_exceeded_blocked"

    # Verify call was recorded as blocked
    call = db_session.query(Call).filter_by(call_id="call_burst_new").first()
    assert call.status == "blocked_cap_exceeded"


def test_late_event_processing(db_session):
    """
    Simulator Scenario: late.
    Event timestamped 35 days in the past arriving today.
    """
    thirty_five_days_ago = datetime.now(timezone.utc) - timedelta(days=35)
    late_dict = {
        "event_id": "evt_late_001",
        "event_type": "call.ended",
        "account_id": "acct_004",
        "call_id": "call_late_1",
        "timestamp": thirty_five_days_ago,
        "duration_seconds": 60,
        "cost_cents": 2,
        "destination_country": "US"
    }
    event = WebhookPayload(**late_dict)
    res = process_webhook_event(db_session, event, late_dict)
    assert res["status"] == "success"

    # Check that it was applied as an adjustment to current active month
    current_period = datetime.now(timezone.utc).strftime("%Y-%m")
    usage = get_account_usage(db_session, "acct_004", billing_period=current_period)
    assert usage is not None
    assert usage.total_cost_cents == 2


def test_reconciliation_step_recomputes_from_raw_events(db_session):
    """
    Spec Requirement: 'reconciliation step that can recompute usage from raw events'.
    """
    account_id = "acct_005"
    period = datetime.now(timezone.utc).strftime("%Y-%m")

    # Insert 3 raw call.ended events
    for i in range(1, 4):
        raw_ev = RawEvent(
            event_id=f"evt_recon_{i}",
            event_type="call.ended",
            account_id=account_id,
            call_id=f"call_recon_{i}",
            payload={"duration_seconds": 60 * i, "cost_cents": 2 * i, "timestamp": datetime.now(timezone.utc).isoformat()},
            processed_status="processed"
        )
        db_session.add(raw_ev)
    db_session.commit()

    # Corrupt or initialize empty AccountUsage table to simulate skew
    skewed_usage = AccountUsage(
        account_id=account_id,
        billing_period=period,
        total_calls=999,
        total_duration_seconds=99999,
        total_cost_cents=99999
    )
    db_session.add(skewed_usage)
    db_session.commit()

    # Run Reconciliation
    result = reconcile_account_usage(db_session, account_id, period)

    # Expected: 3 calls, 60+120+180 = 360 seconds, 2+4+6 = 12 cents
    assert result["recomputed_calls"] == 3
    assert result["recomputed_duration_seconds"] == 360
    assert result["recomputed_cost_cents"] == 12

    # Verify database was updated
    refreshed_usage = get_account_usage(db_session, account_id, period)
    assert refreshed_usage.total_calls == 3
    assert refreshed_usage.total_cost_cents == 12

