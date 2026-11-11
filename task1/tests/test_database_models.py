import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
from task1.app.database import Base
from task1.app.models import RawEvent, Call, AccountUsage
from task1.app.config import Settings

# In-memory SQLite for testing Step 1 & Step 2 without needing external Postgres
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

def test_config_loads_environment(monkeypatch):
    """Test that Settings properly loads environment variables."""
    monkeypatch.setenv("WEBHOOK_SECRET", "my_custom_secret")
    monkeypatch.setenv("DEFAULT_MONTHLY_CAP_CENTS", "8000")
    test_settings = Settings()
    assert test_settings.WEBHOOK_SECRET == "my_custom_secret"
    assert test_settings.DEFAULT_MONTHLY_CAP_CENTS == 8000

def test_raw_events_duplicate_prevention(db_session):
    """
    Test Step 2: Primary Key on event_id MUST prevent duplicate webhooks 
    at the database level (IntegrityError).
    """
    event1 = RawEvent(
        event_id="evt_duplicate_001",
        event_type="call.started",
        account_id="acct_001",
        call_id="call_123",
        payload={"call_id": "call_123"}
    )
    db_session.add(event1)
    db_session.commit()

    # Attempting to insert the exact same event_id again
    event2 = RawEvent(
        event_id="evt_duplicate_001",
        event_type="call.started",
        account_id="acct_001",
        call_id="call_123",
        payload={"call_id": "call_123"}
    )
    db_session.add(event2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

def test_calls_model_creation(db_session):
    """Test creating and retrieving a Call record with integer cost/duration."""
    call = Call(
        call_id="call_test_001",
        account_id="acct_001",
        status="completed",
        duration_seconds=125,
        cost_cents=5
    )
    db_session.add(call)
    db_session.commit()

    retrieved = db_session.query(Call).filter_by(call_id="call_test_001").first()
    assert retrieved is not None
    assert retrieved.duration_seconds == 125
    assert retrieved.cost_cents == 5
    assert isinstance(retrieved.cost_cents, int)

def test_account_usage_uniqueness_per_month(db_session):
    """
    Test that an account can only have ONE aggregated usage row per billing month.
    """
    usage1 = AccountUsage(
        account_id="acct_001",
        billing_period="2026-11",
        total_calls=10,
        total_duration_seconds=500,
        total_cost_cents=20,
        monthly_cap_cents=5000,
        cap_exceeded=False
    )
    db_session.add(usage1)
    db_session.commit()

    # Same account + same billing period must fail due to UniqueConstraint
    usage2 = AccountUsage(
        account_id="acct_001",
        billing_period="2026-11",
        total_calls=5,
        total_duration_seconds=200,
        total_cost_cents=10
    )
    db_session.add(usage2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

