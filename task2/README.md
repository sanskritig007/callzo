# Task 2: Usage Admin Console

A production-grade Admin Console built with React, TypeScript, Tailwind CSS, and Recharts for inspecting telemetry usage across ~10,500 customer accounts and managing multi-step configurations.

---

## 🚀 Running the Project

The application and the mock API run together with a single command:

```bash
cd task2
docker compose up
```

- **Admin Console UI:** `http://localhost:3000`
- **Mock API Service:** `http://localhost:8001`
- **Health Check:** `http://localhost:8001/health`

To run locally in development mode without Docker:
```bash
cd task2
npm install
npm run dev
# Open http://localhost:3000
```

---

## 📝 Required Architecture Notes

### 1. Where State Lives (Server, Client, or URL) and Why

In an enterprise admin console handling 10,500+ records, mixing state boundaries leads to synchronization bugs and poor user experience. Our state architecture strictly partitions responsibilities:

| State Layer | What Lives Here | Why It Lives Here |
|---|---|---|
| **URL State** | `page`, `page_size`, `search`, `status`, `country`, `plan`, `sort_by`, `sort_dir`, `date_from`, `date_to` | **Shareability & History:** Admin workflows require deep-linking. If an engineer investigates account anomalies and shares a URL with a teammate, the recipient must land on the exact filtered, sorted view. Using URL parameters also enables natural browser Back/Forward navigation. |
| **Server State (Cache)** | `accounts` list, `total` count, `summary` analytics series, `draftSettings` | **Source of Truth & Cache Invalidation:** The mock API dataset deliberately drifts on every poll. Server state is treated as transient. When background polling revalidates telemetry, fresh data replaces the table in-place without triggering full component remounts or layout shifts. |
| **Client (Local) State** | `selectedAccountIds` (`Set<number>`), active drawer state, active metric tab (`minutes` / `cost` / `sms`), in-flight form edits | **User Context & Stability:** Row selection across pages **must never be wiped** by server revalidations. Storing `selectedAccountIds` in a client `Set` ensures selections remain stable even as users paginate between pages or when live background data drifts. |

---

### 2. What Was Cut and Why

To maintain code simplicity, high rendering performance, and strict adherence to the spec's constraints (*"Do not use any other library beyond React + Tailwind + Chart library"*), specific trade-offs were made:

1. **Virtual Scrolling Cut in Favor of Server-Side Pagination:**
   - *Reason:* While virtual windowing libraries (`react-window`, `tanstack-virtual`) can render infinite lists, they introduce DOM measurement complexity and require external dependencies. Given that the server already provides paginated endpoints (`page`, `page_size`), server-side pagination with stable selection is cleaner, more predictable, and easier to maintain.
2. **Third-Party Form & State Libraries (Formik, React Hook Form, Redux, Zustand) Cut:**
   - *Reason:* The 4-step wizard requires custom rollback behavior, step-level autosaving, and cross-step error targeting (deliberate Trap 2). External form libraries add abstraction overhead without solving the specific requirements. Native React state with `useCallback` and `useRef` snapshots provided cleaner, rollback-safe state management with zero external dependencies.
3. **Icon Libraries (Lucide / Heroicons / FontAwesome) Cut:**
   - *Reason:* Strictly adhering to Callzo's specification constraint (*"Do not use any other library beyond these"*). All icons are authored as optimized inline SVG paths.

---

## 🛡️ Handling Deliberate Mock API Behaviors

### 1. Deliberate 500 Failure on `/accounts/summary` (Trap 1)
- **Behavior:** The summary analytics endpoint randomly returns HTTP 500 on ~1 in 5 requests.
- **Handling:** The failure is isolated to the `UsageChart` component. The table, filters, and settings form remain fully interactive. The chart renders a polite inline error card explaining that analytics are temporarily unavailable, accompanied by an accessible **"Retry Loading Chart"** action that re-fetches the endpoint without reloading the page.

### 2. Deliberate Step 2 Validation Failure after Step 4 (Trap 2)
- **Behavior:** Once Step 4's draft exists, Step 2 begins rejecting `billing_country` with `422: "billing_country is required"`, even if previously valid.
- **Handling:**
  - When the 422 error is returned, `client.ts` parses `detail.step` and `detail.errors`.
  - The UI highlights a warning badge on the **Step 2 tab header** (`⚠️ Attention Needed`).
  - An informational alert on Step 2 explains: *"Server reported: billing_country is required. Please re-confirm your billing country to finalize."*
  - The `billing_country` dropdown is visually bordered in red.
  - Data already entered on Steps 1, 3, and 4 is preserved with zero loss.
  - The user can select their country, re-save Step 2, and proceed to submission.

---

## ♿ Accessibility & Responsiveness

- **Keyboard Navigation:** Full focus management with visible focus rings (`focus:ring-2 focus:ring-slate-900 focus:outline-none`). Modals and drawers support `Escape` key dismissal.
- **Mobile Usability (375px):** The interface is designed mobile-first. Tables use smooth horizontal scroll wrappers (`overflow-x-auto min-w-full`), KPI summary cards reflow into a clean 2x2 grid, and the settings drawer adapts to 100% viewport width on mobile screens.

