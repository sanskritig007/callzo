import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from task1.app.database import SessionLocal
from task1.app.models import RawEvent
from task1.app.schemas import WebhookPayload
from task1.app.service import process_webhook_event

logger = logging.getLogger("callzo.retry_worker")

async def run_retry_worker(poll_interval_seconds: int = 15):
    """
    Background worker that runs periodically to retry any webhook events
    that were saved in raw_events but failed processing (e.g. during a transient DB issue).
    Fulfills spec requirement: 'Include a background job for retries'.
    """
    logger.info("Background retry worker started.")
    while True:
        try:
            db: Session = SessionLocal()
            try:
                # Find events flagged for retry
                pending_events = (
                    db.query(RawEvent)
                    .filter(RawEvent.processed_status == "pending_retry")
                    .limit(50)
                    .all()
                )

                if pending_events:
                    logger.info(f"Retrying {len(pending_events)} pending webhook events...")
                    for raw_ev in pending_events:
                        try:
                            payload_data = raw_ev.payload or {}
                            payload = WebhookPayload(**payload_data)
                            process_webhook_event(db, payload, payload_data)
                            raw_ev.processed_status = "processed"
                            db.commit()
                            logger.info(f"Successfully retried event: {raw_ev.event_id}")
                        except Exception as e:
                            logger.error(f"Retry failed for event {raw_ev.event_id}: {str(e)}")
                            db.rollback()
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error in background retry loop: {str(e)}")

        await asyncio.sleep(poll_interval_seconds)

