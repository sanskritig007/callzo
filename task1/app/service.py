import math
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from task1.app.models import RawEvent, Call, AccountUsage
from task1.app.schemas import WebhookPayload, EventType
from task1.app.config import settings

logger = logging.getLogger("callzo.metering")

def get_or_create_account_usage(
    db: Session, 
    account_id: str, 
    billing_period: str
) -> AccountUsage:
    """
    Retrieves or initializes the AccountUsage summary row for an account 
    and billing month. Uses the configured default monthly cap in cents.
    """
    usage = (
        db.query(AccountUsage)
        .filter_by(account_id=account_id, billing_period=billing_period)
        .first()
    )
    if not usage:
        usage = AccountUsage(
            account_id=account_id,
            billing_period=billing_period,
            total_calls=0,
            total_duration_seconds=0,
            total_cost_cents=0,
            monthly_cap_cents=settings.DEFAULT_MONTHLY_CAP_CENTS,
            cap_exceeded=False
        )
        db.add(usage)
        db.flush()  # Assigns ID and makes row visible inside transaction
    return usage


def is_event_late(event_timestamp: datetime, threshold_days: int = 30) -> bool:
    """
    Determines if an event is timestamped older than threshold_days in the past.
    Simulator 'late' scenario sends events timestamped ~35 days ago.
    """
    now = datetime.now(timezone.utc)
    ts = event_timestamp
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age_days = (now - ts).total_seconds() / (24 * 3600)
    return age_days > threshold_days


def process_webhook_event(
    db: Session, 
    event: WebhookPayload, 
    raw_payload_dict: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Core Webhook Processing Engine.
    Handles:
      1. Idempotency (Duplicate event_id detection)
      2. Out-of-order lifecycle (call.ended before call.started)
      3. Late events (~35 days old: audited, billed to current month as adjustment)
      4. Monthly cap enforcement (burst scenario: graceful completion, blocking new starts)
    """
    # -------------------------------------------------------------
    # 1. IDEMPOTENCY CHECK (Duplicate Prevention)
    # -------------------------------------------------------------
    existing_event = db.query(RawEvent).filter_by(event_id=event.event_id).first()
    if existing_event:
        logger.info(f"Duplicate event received and ignored: event_id={event.event_id}")
        return {
            "status": "success",
            "message": "Duplicate event detected and safely ignored (idempotent)",
            "event_id": event.event_id,
            "action_taken": "duplicate_ignored"
        }

    # Safely convert to pure JSON serializable dict for audit storage
    audit_payload = event.model_dump(mode="json")

    # Record event in immutable raw_events table for auditing and reconciliation
    raw_event_record = RawEvent(
        event_id=event.event_id,
        event_type=event.event_type.value,
        account_id=event.account_id,
        call_id=event.call_id,
        payload=audit_payload,
        processed_status="processed"
    )
    db.add(raw_event_record)

    # -------------------------------------------------------------
    # 2. BILLING PERIOD & LATE EVENT DETERMINATION
    # -------------------------------------------------------------
    now_utc = datetime.now(timezone.utc)
    late = is_event_late(event.timestamp)

    if late:
        # Decision for Late Events:
        # Prior month bill is already settled. Late usage is billed to the 
        # current active billing period as an adjustment, but logged for review.
        billing_period = now_utc.strftime("%Y-%m")
        logger.warning(
            f"LATE EVENT DETECTED: event_id={event.event_id}, call_id={event.call_id}, "
            f"original_ts={event.timestamp.isoformat()}. Billing applied to {billing_period}."
        )
    else:
        billing_period = event.timestamp.strftime("%Y-%m")

    # Retrieve or create current usage ledger for this account and billing period
    usage = get_or_create_account_usage(db, event.account_id, billing_period)

    # -------------------------------------------------------------
    # 3. CALL LIFECYCLE & OUT-OF-ORDER HANDLING
    # -------------------------------------------------------------
    existing_call = db.query(Call).filter_by(call_id=event.call_id).first()
    action_taken = "processed"

    # CASE A: CALL STARTED
    if event.event_type == EventType.CALL_STARTED:
        # Hard Cap Check at Boundary:
        # If monthly cap is already exceeded, new calls cannot be initiated.
        if usage.cap_exceeded:
            logger.warning(
                f"MONTHLY CAP EXCEEDED: acct={event.account_id}, "
                f"used={usage.total_cost_cents}c >= cap={usage.monthly_cap_cents}c. Rejecting new call."
            )
            if not existing_call:
                blocked_call = Call(
                    call_id=event.call_id,
                    account_id=event.account_id,
                    status="blocked_cap_exceeded",
                    destination_country=event.destination_country,
                    started_at=event.timestamp,
                    duration_seconds=0,
                    cost_cents=0
                )
                db.add(blocked_call)
            db.commit()
            return {
                "status": "rejected",
                "message": "Account monthly spending cap reached. New calls are blocked.",
                "event_id": event.event_id,
                "action_taken": "cap_exceeded_blocked"
            }

        if existing_call:
            # Out-of-order scenario: call.ended arrived BEFORE call.started!
            existing_call.started_at = event.timestamp
            if existing_call.destination_country is None:
                existing_call.destination_country = event.destination_country
            if existing_call.status == "ended":
                existing_call.status = "completed"
            action_taken = "out_of_order_started_reconciled"
        else:
            # Normal order: call starts first
            new_call = Call(
                call_id=event.call_id,
                account_id=event.account_id,
                status="started",
                destination_country=event.destination_country,
                started_at=event.timestamp,
                duration_seconds=0,
                cost_cents=0
            )
            db.add(new_call)
            action_taken = "call_started_recorded"

    # CASE B: CALL ENDED
    elif event.event_type == EventType.CALL_ENDED:
        # Fallback rating: Ensure integer cost
        cost = event.cost_cents
        if cost == 0 and event.duration_seconds > 0:
            billed_minutes = math.ceil(event.duration_seconds / 60)
            cost = billed_minutes * 2  # Standard 2 cents per minute fallback

        if existing_call:
            existing_call.ended_at = event.timestamp
            existing_call.duration_seconds = event.duration_seconds
            existing_call.cost_cents = cost
            existing_call.status = "completed"
            action_taken = "call_ended_processed"
        else:
            # Out-of-order: call.ended arrived first!
            out_of_order_call = Call(
                call_id=event.call_id,
                account_id=event.account_id,
                status="ended",
                destination_country=event.destination_country,
                ended_at=event.timestamp,
                duration_seconds=event.duration_seconds,
                cost_cents=cost
            )
            db.add(out_of_order_call)
            action_taken = "out_of_order_ended_recorded"

        # Update Account Usage Ledger atomically
        usage.total_calls += 1
        usage.total_duration_seconds += event.duration_seconds
        usage.total_cost_cents += cost

        # Check if this call crossed the monthly cap boundary
        if usage.total_cost_cents >= usage.monthly_cap_cents:
            usage.cap_exceeded = True
            logger.info(
                f"Cap boundary reached: acct={event.account_id}, "
                f"total={usage.total_cost_cents}c, cap={usage.monthly_cap_cents}c"
            )

    # CASE C: CALL FAILED
    elif event.event_type == EventType.CALL_FAILED:
        if existing_call:
            existing_call.status = "failed"
            existing_call.ended_at = event.timestamp
        else:
            failed_call = Call(
                call_id=event.call_id,
                account_id=event.account_id,
                status="failed",
                destination_country=event.destination_country,
                started_at=event.timestamp,
                duration_seconds=0,
                cost_cents=0
            )
            db.add(failed_call)
        action_taken = "call_failed_recorded"

    # Atomic commit for transaction integrity
    db.commit()

    return {
        "status": "success",
        "message": "Event processed successfully",
        "event_id": event.event_id,
        "action_taken": action_taken
    }


def get_account_usage(
    db: Session, 
    account_id: str, 
    billing_period: Optional[str] = None
) -> Optional[AccountUsage]:
    """Fetches the aggregated usage summary for an account."""
    if not billing_period:
        billing_period = datetime.now(timezone.utc).strftime("%Y-%m")
    return db.query(AccountUsage).filter_by(
        account_id=account_id, 
        billing_period=billing_period
    ).first()


def reconcile_account_usage(db: Session, account_id: str, billing_period: str) -> Dict[str, Any]:
    """
    Reconciliation Engine:
    Recomputes usage from raw_events from scratch to guarantee data consistency.
    Fulfills spec requirement: 'a reconciliation step that can recompute usage from raw events'.
    """
    # Fetch all processed call.ended events for this account
    raw_ended_events = (
        db.query(RawEvent)
        .filter_by(account_id=account_id, event_type="call.ended")
        .all()
    )

    recomputed_calls = 0
    recomputed_duration = 0
    recomputed_cost = 0

    for rev in raw_ended_events:
        payload = rev.payload or {}
        duration = payload.get("duration_seconds", 0)
        cost = payload.get("cost_cents", 0)

        # Fallback rating
        if cost == 0 and duration > 0:
            cost = math.ceil(duration / 60) * 2

        recomputed_calls += 1
        recomputed_duration += duration
        recomputed_cost += cost

    # Update ledger with reconciled figures
    usage = get_or_create_account_usage(db, account_id, billing_period)
    usage.total_calls = recomputed_calls
    usage.total_duration_seconds = recomputed_duration
    usage.total_cost_cents = recomputed_cost
    usage.cap_exceeded = (usage.total_cost_cents >= usage.monthly_cap_cents)

    db.commit()
    db.refresh(usage)

    return {
        "account_id": account_id,
        "billing_period": billing_period,
        "recomputed_calls": recomputed_calls,
        "recomputed_duration_seconds": recomputed_duration,
        "recomputed_cost_cents": recomputed_cost,
        "cap_exceeded": usage.cap_exceeded
    }
