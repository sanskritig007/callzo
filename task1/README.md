# Task 1: Telephony Usage Metering Service

A production-grade, highly reliable telephony usage metering backend designed to receive call event webhooks, verify cryptographically signed payloads, handle extreme network anomalies (duplicates, out-of-order, late arrivals), enforce monthly spending caps, and expose aggregated usage through an authenticated API.

---

## 🏗️ Architecture & Component Overview

```
                                      ┌─────────────────────────────────────────┐
                                      │        PostgreSQL Database (db)         │
                                      │                                         │
┌──────────────────────────┐          │  • raw_events (Immutable Audit Ledger)  │
│  Webhook Simulator (CLI) │          │  • calls (State & Lifecycle tracking)   │
│  meetrj/callzo-simulator │          │  • account_usage (Monthly Aggregates)   │
└────────────┬─────────────┘          └────────────────────▲────────────────────┘
             │                                             │
             │ POST /webhooks/calls                        │ SQLAlchemy ACID
             │ (X-Signature HMAC-SHA256)                   │ Transactions
             ▼                                             │
┌──────────────────────────────────────────────────────────┴────────────────────┐
│                             FastAPI Application (api)                         │
│                                                                               │
│  1. Structured Logging Middleware (latency_ms, method, path, status)          │
│  2. HMAC-SHA256 Constant-Time Signature Verifier (raw request bytes)          │
│  3. Pydantic V2 Schema Validation (rejects malformed payloads with clean 422) │
│  4. Core Webhook Engine:                                                      │
│     • Idempotency Check (Duplicate event_id detection)                        │
│     • Out-of-Order Lifecycle Reconciler (call.ended before call.started)      │
│     • Monthly Cap Enforcer (Hard cap blocking on new calls at boundary)       │
│     • Late Event Billing Adjuster (~35 day past events)                       │
│  5. Background Async Retry Worker (recovers transient failures)               │
│  6. On-Demand Audit Reconciliation Engine (recomputes from raw events)        │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start (One Command)

As required by the specification, the complete stack (PostgreSQL + FastAPI + Telephony Simulator) runs with a single command:

```bash
docker compose up
```

- **API Service:** Listens at `http://localhost:8000`
- **PostgreSQL Database:** Running on port `5432`
- **Simulator:** Automatically fires all test scenarios (`all`) against `http://api:8000/webhooks/calls`.

### Targeting Specific Simulator Scenarios:
To run or debug a specific scenario, edit the `command` line in `task1/docker-compose.yml`:
```yaml
command: ["--url", "http://api:8000/webhooks/calls", "--scenario", "duplicates"]
```
Available scenarios: `normal`, `duplicates`, `out_of_order`, `late`, `malformed`, `bad_signature`, `cap_burst`, `all`.

---

## 🧪 Running Unit & Integration Tests

The project includes an extensive test suite (27 unit & integration tests) covering every edge case:

```bash
# Activate virtual environment
source venv/bin/activate

# Run full test suite with verbose output
PYTHONPATH=. pytest task1/tests/ -v
```

---

## 🔑 Design Decisions & Justifications

### 1. Integer Units for Financial & Usage Metrics
- **Decision:** Money is stored strictly as integer cents (`cost_cents`), and duration is stored as integer seconds (`duration_seconds`).
- **Justification:** IEEE 754 binary floating-point numbers cannot accurately represent base-10 decimals (e.g. `0.1 + 0.2 = 0.30000000000000004`). In financial ledgers, fractional float rounding introduces compounding accounting discrepancies. Integer cents eliminate precision loss entirely.

### 2. Cryptographic Signature Verification on Raw Bytes
- **Decision:** `X-Signature` verification operates strictly on `await request.body()` raw bytes before any JSON deserialization or Pydantic validation.
- **Justification:** Deserializing JSON into a dictionary and re-serializing it with `json.dumps()` alters whitespace and key ordering, mutating the payload hash. Constant-time comparison (`hmac.compare_digest`) is enforced to thwart side-channel timing attacks. Requests with invalid or missing signatures are rejected immediately with `401 Unauthorized` without touching internal logic or database state.

### 3. Normalized Database Schema & Storage Layers
- **`raw_events` (Immutable Audit Ledger):** Stores every inbound delivery attempt with raw JSON payloads and a Primary Key on `event_id`. This provides both database-level idempotency protection and a reliable audit trail for recomputation.
- **`calls` (Lifecycle Table):** Keyed by `call_id` (shared between `call.started` and `call.ended`). Decouples call state from network packet arrival order.
- **`account_usage` (Aggregated Ledger):** Keyed by `(account_id, billing_period)`. Maintains atomic increments for `total_calls`, `total_duration_seconds`, and `total_cost_cents`. This ensures `GET /accounts/{id}/usage` queries execute in $O(1)$ constant time without triggering costly full-table scans.

---

## 🛡️ Failure Behavior & Edge Case Handling

| Scenario | Simulator Behavior | Service Handling & Justification |
|---|---|---|
| **`duplicates`** | Same `event_id` delivered 2-3 times | Checked atomically against `raw_events.event_id`. Duplicates are acknowledged with `200 OK` (`action_taken: duplicate_ignored`) without double-counting usage. |
| **`out_of_order`** | `call.ended` arrives before `call.started` | If `call.ended` arrives first, the call record is created with `status: "ended"` and cost is applied to the ledger. When `call.started` arrives later, it updates `started_at` and reconciles status to `"completed"` without double billing. |
| **`late`** | Events timestamped ~35 days in the past | **Policy:** Prior monthly invoices are closed. Late usage is credited to the **current active billing cycle** as a prior-period adjustment and flagged for audit review, preventing retrospective modification of locked invoices. |
| **`malformed`** | Missing fields, wrong types, unknown `event_type` | Pydantic V2 strictly validates input. Returns structured `422 Unprocessable Entity` JSON responses without crashing or throwing unhandled 500 errors. |
| **`bad_signature`** | Invalid or missing `X-Signature` header | Verified before payload parsing. Rejected immediately with `401 Unauthorized`. |
| **`cap_burst`** | 40 back-to-back calls exceeding monthly cap | **Boundary Rule:** In-flight calls that breach the cap are permitted to finish cleanly (preventing carrier loss), but account `cap_exceeded` flag is set to `True`. Subsequent `call.started` requests are blocked at the boundary. |

---

## 🔄 Reconciliation & Self-Healing

### On-Demand Reconciliation Endpoint
```http
POST /accounts/{account_id}/reconcile
X-API-Key: callzo_live_api_key_secure_123
```
If ledger drift or skew occurs, this endpoint scans all immutable `raw_events` for the account and recomputes exact duration, cost, and cap status from scratch.

### Background Retry Job
An asynchronous worker runs continuously in the background (configured via FastAPI lifespan). If a transient database disconnection causes a webhook to be stored as `pending_retry`, the worker automatically picks up the event and processes it safely into the ledger.

---

## 🔮 What I Would Do Next With More Time

1. **Distributed Concurrency Lock (Redis / Redlock):**
   While PostgreSQL row-level locks (`SELECT FOR UPDATE`) protect single-instance setups, a distributed Redis lock would coordinate high-throughput concurrent webhooks across horizontally auto-scaled API pods.
2. **Dedicated Task Queue (Celery / BullMQ / Kafka):**
   Move heavy event processing to a dedicated worker pool via Apache Kafka or RabbitMQ, returning an instant `202 Accepted` to telephony providers with sub-millisecond response latency.
3. **Prometheus Metrics & Grafana Dashboard:**
   Export metrics (`telephony_webhooks_total`, `webhook_processing_latency_seconds`, `cap_breach_total`) to Prometheus for real-time observability.

