import pytest
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from task1.app.database import Base
from task1.app.models import RawEvent, Call, AccountUsage
from task1.app.schemas import WebhookPayload
from task1.app.service import process_webhook_event

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

def test_retry_pending_webhook_events(db_session):
    """
    Verifies that pending_retry raw events can be successfully retried 
    and processed into the ledger.
    """
    payload_data = {
        "event_id": "evt_pending_retry_001",
        "event_type": "call.ended",
        "account_id": "acct_retry_1",
        "call_id": "call_retry_101",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": 90,
        "cost_cents": 3,
        "destination_country": "US"
    }

    # Simulate an event that was saved during a transient DB issue
    pending_event = RawEvent(
        event_id=payload_data["event_id"],
        event_type=payload_data["event_type"],
        account_id=payload_data["account_id"],
        call_id=payload_data["call_id"],
        payload=payload_data,
        processed_status="pending_retry"
    )
    db_session.add(pending_event)
    db_session.commit()

    # Worker picks up pending event
    event = WebhookPayload(**pending_event.payload)
    process_webhook_event(db_session, event, pending_event.payload)
    pending_event.processed_status = "processed"
    db_session.commit()

    # Verify event is processed and usage recorded
    refreshed = db_session.query(RawEvent).filter_by(event_id="evt_pending_retry_001").first()
    assert refreshed.processed_status == "processed"

    call = db_session.query(Call).filter_by(call_id="call_retry_101").first()
    assert call is not None
    assert call.cost_cents == 3

