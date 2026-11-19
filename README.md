# Callzo Engineering Assessment — Take-Home Build

This repository contains the complete implementation of the Callzo Software Engineer Intern assessment, organized cleanly into two independent task folders:

- **`task1/`** — **Backend: Telephony Usage Metering Service** (Python FastAPI + PostgreSQL + Telephony Webhook Simulator)
- **`task2/`** — **UI: Usage Admin Console** (React 18 + TypeScript + Tailwind CSS + Recharts + Mock API)

---

## 📁 Repository Structure

```
callzo/
├── task1/                          # Task 1: Backend Usage Metering Service
│   ├── app/
│   │   ├── api/                    # Route handlers (webhooks, usage, health, reconcile)
│   │   ├── config.py               # Environment configuration (Pydantic Settings)
│   │   ├── database.py             # PostgreSQL SQLAlchemy engine & sessions
│   │   ├── models.py               # Database tables (raw_events, calls, account_usage)
│   │   ├── retry_worker.py         # Background async worker for transient retries
│   │   ├── schemas.py              # Pydantic V2 validation schemas
│   │   ├── security.py             # HMAC-SHA256 constant-time signature verification
│   │   └── service.py              # Core webhook engine (idempotency, out-of-order, caps)
│   ├── tests/                      # Extensive test suite (27 passing unit & integration tests)
│   ├── Dockerfile                  # Production Python 3.11 container
│   ├── docker-compose.yml          # One-command stack: api + db (Postgres) + simulator
│   ├── requirements.txt            # Python dependencies
│   └── README.md                   # Full Task 1 architecture and design documentation
│
├── task2/                          # Task 2: UI Usage Admin Console
│   ├── src/
│   │   ├── api/                    # API client layer with custom ApiError & trap handlers
│   │   ├── components/
│   │   │   ├── AccountsTable.tsx   # 10,500-row table with stable multi-page row selection
│   │   │   ├── FilterBar.tsx       # Debounced search, multi-filters & date pickers
│   │   │   ├── SettingsDrawer.tsx  # 4-step wizard with autosave, rollback & Trap 2 handling
│   │   │   └── UsageChart.tsx      # Recharts area chart with isolated 500 error & retry
│   │   ├── types/                  # TypeScript data contracts & interfaces
│   │   ├── App.tsx                 # Main Dashboard assembly & background drift sync
│   │   ├── main.tsx                # React DOM entrypoint
│   │   └── index.css               # Tailwind CSS directives & typography
│   ├── Dockerfile                  # Multi-stage production container with Nginx
│   ├── docker-compose.yml          # One-command stack: frontend + mock-api
│   ├── package.json                # React 18, Tailwind, Recharts
│   └── README.md                   # Full Task 2 architecture, state breakdown & trade-offs
│
├── .gitignore                      # Clean exclusions (venv, node_modules, .env, dist)
└── README.md                       # This root summary
```

---

## 🚀 Running the Projects (One Command per Task)

### Task 1: Backend (Usage Metering Service)
```bash
cd task1
docker compose up
```
- **FastAPI Service:** `http://localhost:8000`
- **PostgreSQL Database:** Port `5432`
- **Webhook Simulator:** Automatically executes test scenarios (`normal`, `duplicates`, `out_of_order`, `late`, `malformed`, `bad_signature`, `cap_burst`) against `http://api:8000/webhooks/calls`.

### Task 2: UI (Usage Admin Console)
```bash
cd task2
docker compose up
```
- **Admin Console Dashboard:** `http://localhost:3000`
- **Mock API Service:** `http://localhost:8001` (10,500 fake accounts)

---

## 🧪 Verification & Tests

### Task 1 Automated Tests (27 Passing Tests)
```bash
# In task1 directory
source venv/bin/activate
PYTHONPATH=. pytest task1/tests/ -v
```
Verifies HMAC verification, duplicate event idempotency, out-of-order lifecycle reconciliation, late event handling, monthly cap enforcement, and background retries.

### Task 2 Frontend Build & Typecheck
```bash
# In task2 directory
npm run build
```
Typechecks and builds the production bundle with zero warnings or errors.

---

## 📬 Submission Checklist
- [x] Both tasks contained within a single Git repository in separate folders.
- [x] Working code with tests included for Task 1 (27 passing tests).
- [x] Comprehensive README for Task 1 covering setup, design decisions, failure behavior, and future work.
- [x] Working React app for Task 2 adhering strictly to allowed stack (`React + Tailwind + Recharts`).
- [x] Comprehensive README for Task 2 with notes on where state lives (server, client, URL) and what was cut.
- [x] Both projects verified to start cleanly via `docker compose up`.

