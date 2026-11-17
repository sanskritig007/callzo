import time
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, Request, Response, Depends, HTTPException, Header, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session
from sqlalchemy import text

from task1.app.config import settings
from task1.app.database import engine, Base, get_db
from task1.app.models import RawEvent, Call, AccountUsage
from task1.app.schemas import (
    WebhookPayload,
    WebhookProcessingResponse,
    AccountUsageResponse,
    HealthCheckResponse
)
from task1.app.security import verify_webhook_signature, verify_api_key
from task1.app.service import (
    process_webhook_event,
    get_account_usage,
    reconcile_account_usage
)
from task1.app.retry_worker import run_retry_worker

# -------------------------------------------------------------
# Structured Logging Configuration
# Spec: "Add structured logs and at least one metric or health check."
# -------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("callzo.api")


# -------------------------------------------------------------
# Application Lifespan: Auto-migration & Background Retry Task
# Spec: "Include a background job for retries"
# -------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure database tables exist
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database schema verified/created successfully.")
    except Exception as e:
        logger.warning(f"Database schema initialization deferred: {str(e)}")

    # Start background retry worker
    worker_task = asyncio.create_task(run_retry_worker(poll_interval_seconds=15))
    logger.info("Application startup complete. Background retry worker active.")
    yield
    # Shutdown: gracefully terminate background task
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    logger.info("Application shutdown clean.")


app = FastAPI(
    title="Callzo Usage Metering API",
    description="Production-grade usage metering, idempotency, out-of-order event handling, and spending cap service.",
    version="1.0.0",
    lifespan=lifespan
)

# -------------------------------------------------------------
# Structured Logging Middleware
# Logs every incoming request with method, path, status, and latency
# -------------------------------------------------------------
@app.middleware("http")
async def structured_logging_middleware(request: Request, call_next):
    start_time = time.perf_counter()
    response: Response = await call_next(request)
    duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "method": request.method,
        "path": request.url.path,
        "status_code": response.status_code,
        "duration_ms": duration_ms,
        "client_ip": request.client.host if request.client else "unknown"
    }
    logger.info(json.dumps(log_entry))
    return response


# -------------------------------------------------------------
# Global Validation Error Handler (Clean 422 JSON, Never a 500 crash)
# Spec Scenario: 'malformed' (missing fields, wrong types, unknown event_type)
# -------------------------------------------------------------
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(f"Malformed request rejected: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "status": "error",
            "message": "Malformed webhook payload. Validation failed.",
            "errors": exc.errors()
        }
    )


# -------------------------------------------------------------
# 1. WEBHOOK ENDPOINT
# Spec: POST /webhooks/calls
# -------------------------------------------------------------
@app.post(
    "/webhooks/calls",
    response_model=WebhookProcessingResponse,
    status_code=status.HTTP_200_OK,
    summary="Receive telephony call event webhooks"
)
async def receive_call_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_signature: Optional[str] = Header(None, alias="X-Signature")
):
    """
    Accepts webhooks from the telephony simulator.
    Strictly verifies X-Signature over RAW bytes before parsing payload.
    """
    # Step A: Read raw bytes directly from request stream
    raw_body_bytes = await request.body()

    # Step B: Signature verification (MUST happen before payload processing)
    if not verify_webhook_signature(raw_body_bytes, x_signature):
        logger.warning("Webhook rejected: Invalid or missing X-Signature header.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Signature header. Verification failed."
        )

    # Step C: Parse and validate JSON against Pydantic schema
    try:
        raw_json = json.loads(raw_body_bytes.decode("utf-8"))
        payload = WebhookPayload(**raw_json)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        logger.warning(f"Malformed JSON body: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid JSON payload: {str(e)}"
        )
    except Exception as e:
        # Pydantic validation errors
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )

    # Step D: Execute core processing engine
    result = process_webhook_event(db=db, event=payload, raw_payload_dict=raw_json)
    return result


# -------------------------------------------------------------
# 2. AUTHENTICATED USAGE API
# Spec: "exposes usage through an authenticated API"
# -------------------------------------------------------------
@app.get(
    "/accounts/{account_id}/usage",
    response_model=AccountUsageResponse,
    summary="Get aggregated usage and monthly cap status for an account"
)
def get_usage(
    account_id: str,
    billing_period: Optional[str] = None,
    db: Session = Depends(get_db),
    _api_key: str = Depends(verify_api_key)
):
    """
    Returns aggregated call minutes, integer cost in cents, and cap status.
    Protected by X-API-Key header.
    """
    if not billing_period:
        billing_period = datetime.now(timezone.utc).strftime("%Y-%m")

    usage = get_account_usage(db, account_id, billing_period)
    if not usage:
        # Return clean empty ledger if no calls yet
        return AccountUsageResponse(
            account_id=account_id,
            billing_period=billing_period,
            total_calls=0,
            total_duration_seconds=0,
            total_cost_cents=0,
            monthly_cap_cents=settings.DEFAULT_MONTHLY_CAP_CENTS,
            cap_exceeded=False,
            remaining_cap_cents=settings.DEFAULT_MONTHLY_CAP_CENTS,
            last_updated_at=datetime.now(timezone.utc)
        )

    remaining = max(0, usage.monthly_cap_cents - usage.total_cost_cents)
    return AccountUsageResponse(
        account_id=usage.account_id,
        billing_period=usage.billing_period,
        total_calls=usage.total_calls,
        total_duration_seconds=usage.total_duration_seconds,
        total_cost_cents=usage.total_cost_cents,
        monthly_cap_cents=usage.monthly_cap_cents,
        cap_exceeded=usage.cap_exceeded,
        remaining_cap_cents=remaining,
        last_updated_at=usage.last_updated_at
    )


# -------------------------------------------------------------
# 3. RECONCILIATION API
# Spec: "reconciliation step that can recompute usage from raw events"
# -------------------------------------------------------------
@app.post(
    "/accounts/{account_id}/reconcile",
    summary="Recompute account usage ledger from immutable raw events"
)
def reconcile_usage(
    account_id: str,
    billing_period: Optional[str] = None,
    db: Session = Depends(get_db),
    _api_key: str = Depends(verify_api_key)
):
    """
    Recomputes total duration and cost from raw events to guarantee 
    audit-level consistency.
    """
    if not billing_period:
        billing_period = datetime.now(timezone.utc).strftime("%Y-%m")

    result = reconcile_account_usage(db, account_id, billing_period)
    return {
        "status": "success",
        "message": f"Successfully reconciled usage for {account_id}",
        "data": result
    }


# -------------------------------------------------------------
# 4. HEALTH CHECK ENDPOINT
# Spec: "at least one metric or health check"
# -------------------------------------------------------------
@app.get(
    "/health",
    response_model=HealthCheckResponse,
    summary="Service health and database connectivity probe"
)
def health_check(db: Session = Depends(get_db)):
    """Verifies that the API service is up and database is responsive."""
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        logger.error(f"Health check failed to query database: {str(e)}")
        db_ok = False

    return HealthCheckResponse(
        status="ok" if db_ok else "degraded",
        database_connected=db_ok,
        timestamp=datetime.now(timezone.utc)
    )
