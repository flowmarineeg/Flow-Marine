# Booking Report — Technical Analysis (Pre-Migration)

**Purpose:** a complete, evidence-based technical analysis of the current
Booking Report, before any redesign work begins. This document does not
propose a fix, does not contain code, and does not create a sprint — it
exists so the coming migration can be planned against facts, not
assumptions.

> **STATUS (current through Sprint 046):** this analysis's findings were
> implemented by Sprint 034 (dual-layer Booking Report + new Booking
> Revenue Details pricing-group report). Historical reference — do not
> re-derive these findings, cite them. See claude.md's Sprint 034 section.
> Not touched by Sprints 042-046 — Booking.dischargeStatus (Sprint 045) is
> not surfaced on this report.

Files read to produce this analysis:
`backend/src/modules/reports/reports.controller.js`,
`backend/src/modules/reports/reports.routes.js`,
`backend/src/modules/reports/reports.service.js`,
`backend/src/modules/bookings/booking.model.js`,
`backend/src/modules/bookings/manualBooking.model.js`,
`backend/src/modules/export/export.service.js`,
`frontend/src/modules/reports/BookingReport.jsx`,
`frontend/src/modules/reports/ReportLayout.jsx`,
`frontend/src/modules/reports/reportHelpers.jsx`,
`frontend/src/modules/reports/ReportsHub.jsx`,
`frontend/src/services/reports.service.js`,
`frontend/src/app/(dashboard)/reports/bookings/page.jsx`.

---

## 1. Locate the Current Booking Report — Complete Flow

```
Frontend
  app/(dashboard)/reports/bookings/page.jsx
    → <PageGuard module="reports"> → <BookingReport />
  frontend/src/modules/reports/BookingReport.jsx
    → useQuery(['report-bookings', filters], enabled: run)
    → reportsService.getBookingReport({ ...filters, limit: 200 })
  frontend/src/services/reports.service.js
    → GET /reports/bookings  (params: voyageId, agentId, status,
      serviceId, dateFrom, dateTo, limit)

Backend
  backend/src/modules/reports/reports.routes.js
    router.use(auth); router.use(rbac('reports'));
    router.get('/bookings', ctrl.getBookingReport)
  backend/src/modules/reports/reports.controller.js#getBookingReport
    → reportsService.getBookingReport(req.query)
  backend/src/modules/reports/reports.service.js#getBookingReport
    → Booking.find(match) + Booking.countDocuments(match)
      + a second Booking.aggregate(...) for the summary block
```

**Components involved:** `BookingReport.jsx` is the only component; it
uses the shared `ReportLayout.jsx` shell (breadcrumb, filter bar, summary
row, export button slot, body) and `reportHelpers.jsx` (`ReportStatCard`,
`ReportEmptyState`, `fmtMoney`, `fmtNum`, `rsc` select style) — both
shared with every other report page, not specific to this one.

**Filters wired:** Voyage (dropdown, `voyagesService.list`), Agent
(dropdown, `agentsService.list({ status: 'Active' })`), Status (dropdown,
from `BOOKING_STATUS` constant), Service (dropdown,
`servicesService.listActive()` — resolved server-side to a set of
`voyageId`s), Date From / Date To (applied to `createdAt`). A "Run
Report" button gates the query (`enabled: run`) — filters don't fire the
query automatically on change.

**Export functionality:** `ReportLayout.jsx` accepts an `onExport` prop
and renders an "Export Excel" button whenever it's supplied (lines
47-65). `BookingReport.jsx` never passes `onExport` — **no export path
exists for this report at all.** This is not unique to the Booking
Report: a grep across every report component
(`RevenueReport.jsx`, `ExpenseReport.jsx`, `RoundPnlReport.jsx`,
`VoyagePerformanceReport.jsx`, `RoundCapacityReport.jsx`) shows none of
them supply `onExport` either — the capability exists in the shared
shell but is unused everywhere in the Reports module today. (There is a
separate, unrelated Excel export for the *operational* Bookings list —
`export.service.js`'s `case 'bookings'` — reachable from
`BookingList.jsx`'s `ExportButton`, not from this report page. See §7 for
why that distinction matters.)

---

## 2. Data Source Analysis

`reports.service.js#getBookingReport` (and the summary aggregate beside
it) query **only `Booking` — the Layer 2 model** — via
`require('../bookings/booking.model')` at the top of the file.
`ManualBooking` (Layer 1) is imported into `reports.service.js` (used by
`getRoundPnL`, see §6/§7) but is **never referenced anywhere inside
`getBookingReport` itself.**

- **Is it using the old Booking model?** It is using the *current*
  `Booking` (Layer 2) schema — not a stale pre-Sprint-023 collection —
  but it was never updated to be layer-aware when the Layer 1/Layer 2
  split happened in Sprint 023. It queries the right collection for
  "Layer 2 only," it just was never extended to also look at Layer 1.
- **Is it already compatible with Layer 1?** No. Zero references to
  `ManualBooking` in `getBookingReport`.
- **Is it already compatible with Layer 2?** Structurally yes for the
  fields Layer 2 still has (see legacy-field caveat below) —
  `voyageId`, `agentId`, `polId`, `podId`, `containerTypeId`,
  `totalFreight`, `status`, `shipper`, `consignee`, `createdAt` are all
  populated/read correctly and all still exist on the current `Booking`
  schema.
- **Does it mix both?** No — single-layer only.
- **Which fields are legacy?** `quantity`. `reports.service.js#
  getBookingReport`'s summary aggregate sums `'$quantity'`
  (`totalQty: { $sum: '$quantity' }`), and `BookingReport.jsx` reads
  `b.quantity` directly for the "Qty" column (line 118). `quantity` was
  removed from `booking.model.js` in Sprint 025/026 ("one booking = one
  container" — see `CLAUDE.md`'s Layer 2 architecture notes) — the field
  simply does not exist on any current `Booking` document. In MongoDB,
  `$sum` over a missing field silently contributes `0`, and reading
  `b.quantity` in JS returns `undefined`. Neither errors; both are simply
  always wrong/empty. The exact same dead `$sum: '$quantity'` pattern
  also appears in `getRoundPnL` (line ~41), `getVoyagePerformance` (line
  ~150), and `getRevenueReport` (line ~264) — this is a codebase-wide
  legacy-field pattern across the whole Reports module, not unique to
  the Booking Report, though the Booking Report is the only place it
  also leaks directly into a raw per-row column, not just a summary
  total.

---

## 3. Current Report Structure — Every Column, Traced

### Table columns (`BookingReport.jsx` lines 106–123)

| Column | Source field | Model | Calculation |
|---|---|---|---|
| Booking No | `bookingNumber` | `Booking` (direct) | none |
| Voyage | `voyageId.voyageNumber` | `Voyage` (populated ref) | none |
| Agent | `agentId.agentName` | `Agent` (populated ref) | none |
| Shipper | `shipper` | `Booking` (direct) | none |
| Consignee | `consignee` | `Booking` (direct) | none |
| Container | `containerTypeId.code` | `ContainerType` (populated ref) | none — **this is the container TYPE code (e.g. "40HC"), not the physical container number.** `Booking.containerNumber` (the field the rest of the system treats as the booking's primary match key since Sprint 021) is never fetched or shown anywhere in this report. |
| Qty | `quantity` | `Booking` (direct) | none — **dead field, see §2; always blank/undefined** |
| Freight | `totalFreight` | `Booking` (direct) | none (flat, server-computed at booking-creation time, not recomputed here) |
| Status | `status` | `Booking` (direct) | none |
| Date | `createdAt` | `Booking` (direct, Mongoose timestamp) | none |

### Summary / stat cards (`BookingReport.jsx` lines 88–91, backed by
`reports.service.js#getBookingReport`'s second aggregate, lines 225-234)

| Card | Source field | Calculation |
|---|---|---|
| Bookings | `summary.count` | `$sum: 1` over the aggregate match (Cancelled excluded — see §5) |
| Total Freight | `summary.totalFreight` | `$sum: '$totalFreight'` over the same match |
| Total Units | `summary.totalQty` | `$sum: '$quantity'` — **dead field (§2), always 0** |
| Total Slots | `summary.totalSlots` | **Not returned by the backend at all.** `reports.service.js` never computes or returns a `totalSlots` field — the code's own comment above this aggregate reads `// slotCount removed Sprint 017`. The frontend card references a field the backend stopped producing seven sprints before this report's current form; `fmtNum(undefined)` renders `0`. |

---

## 4. Business Logic

**Purpose (as built):** a flat, filterable ledger of Layer 2 operational
bookings — "which bookings exist, for which voyage/agent, in what
status, within a date range, and what do they add up to in freight and
count." It is a listing + summary tool, not an analytical or financial
one.

**Who is it for?** Based on RBAC (`rbac('reports')`, the same permission
module every other report shares) and the filter set (voyage, agent,
status, service, date range), this reads as an Operations/Finance
utility for reviewing booking activity per voyage or per agent — the
same audience as the other operational reports (Revenue, Voyage
Performance), not a role-specific report of its own.

**What questions does it answer?**
- How many bookings exist matching a given voyage/agent/status/date
  filter?
- What is their combined freight value?
- What are the individual booking details (shipper, consignee,
  container type, freight, status, date) for that filtered set?

**What KPIs does it provide?** Booking count and total freight (both
correctly computed, Cancelled-excluded); "Total Units" and "Total Slots"
are present as KPI cards but, per §2/§3, never produce a real number.

**What it does NOT answer (by design, not by omission):** anything about
invoicing or payment state. There is no join to `Invoice` or `Payment`
anywhere in `reports.service.js#getBookingReport` — "has this booking
been invoiced," "has it been paid," "what's the remaining balance" are
questions this report was never built to answer; those now live on the
Agent Financial Account (Sprint 033), a separate, newer surface that
this report predates and does not reference.

---

## 5. Problems Caused by the Migration to Layer 1 + Layer 2

Documented only — no fixes proposed.

1. **Layer 1 (ManualBooking) is completely excluded.** Any commercial
   reservation that hasn't yet become a Layer 2 container booking never
   appears in this report at all — the report understates total booking
   activity and freight relative to what the rest of the system (e.g.
   the Vessel Details KPI block, hardened for dual-layer inclusion in
   Sprint 032) now treats as the correct combined picture.
2. **The `quantity` field is dead** (§2/§3) — the "Qty" column and
   "Total Units" KPI have referenced a field that does not exist on
   `Booking` since Sprint 025/026. This is a silent wrong-value bug, not
   a crash: no error is thrown, the numbers are just always 0/blank.
3. **The "Total Slots" KPI has no backing field at all** — traceable to
   `reports.service.js`'s own comment confirming `slotCount` was removed
   in Sprint 017; the frontend card was never removed to match.
4. **`containerNumber` is missing from the report entirely.** For a
   report whose stated purpose is reviewing booking activity, omitting
   the one field (per Sprint 021's "Booking Primary Key" rule) used
   system-wide to match a booking to a physical container is a real gap
   in what the report can be used for operationally.
5. **Row-level and summary-level Cancelled handling disagree.** The row
   query (`Booking.find(match)`, lines 211-222) applies no Cancelled
   exclusion beyond whatever the user's own `status` filter specifies —
   so with no status filter selected, Cancelled bookings appear in the
   table. The summary aggregate (lines 225-233) explicitly adds
   `status: { $ne: 'Cancelled' }` on top of the same `match` object. The
   two are therefore scoped differently by construction: the visible
   rows can include Cancelled bookings whose freight is then silently
   left out of the "Total Freight"/"Bookings" cards above them, with
   nothing in the UI explaining the discrepancy.
6. **No Invoice/Payment awareness.** Since Sprint 033 introduced
   `Invoice.lineItems`/`Payment.allocations` as the system's financial
   layer, a booking's invoiced/paid state is answerable, but only via
   the Agent Financial Account — this report has no equivalent and
   cannot answer "is this booking invoiced" for any row it displays,
   creating two separate, non-cross-referencing places in the app that
   both claim to describe "booking financial activity."
7. **No export.** Confirmed in §1 — not unique to this report, but still
   a real gap relative to the analysis brief's explicit ask about export
   functionality.
8. **Pagination is requested but not surfaced.** The backend returns
   `total` (a real `Booking.countDocuments(match)` result) and accepts
   `page`/`limit`, but `BookingReport.jsx` always calls with a fixed
   `limit: 200` and never reads `total` or renders any page control — if
   a filtered set exceeds 200 rows, the user has no indication that rows
   are being silently truncated.

---

## 6. Required Migration (Description Only — Not Implemented)

**Backend**
- `getBookingReport` needs a second data source (`ManualBooking`),
  queried and merged the same way `vessel.service.js#getVesselStats`
  already merges Layer 1 + Layer 2 per status (Sprint 032's established,
  working precedent — not a new pattern to invent).
- The dead `quantity` aggregation needs to be replaced with whatever the
  correct current definition of "units"/"quantity" is, given Layer 2 is
  one-container-per-booking and Layer 1 is multi-cargo-row-per-
  reservation — these two layers no longer share one unit-count concept
  the way a single unified Booking model once did.
- The row-list vs. summary Cancelled-inclusion mismatch needs a single,
  explicit, consistently-applied rule.
- A decision is needed on whether invoice/payment visibility belongs on
  this report at all, or stays exclusively on the Agent Financial
  Account.
- `containerNumber` needs to be added to the row projection.

**Frontend**
- The table needs either a layer indicator/column or a tab split
  (mirroring `BookingList.jsx`'s existing Operational/Manual tab
  convention) once Layer 1 rows are included.
- The "Qty"/"Total Units" and "Total Slots" cards need to be rebuilt
  against real fields or removed — they currently reference fields that
  do not exist.
- A `containerNumber` column needs to be added.
- An `onExport` handler needs to be wired if export is desired for this
  report specifically (distinct from the operational Bookings list's
  existing, separate export).
- Pagination controls need to be added if `total` is meant to be
  meaningful, or a deliberate decision made that this report is
  intentionally bounded/unpaginated.

**API** — no path or method change is structurally required (`GET
/reports/bookings` can stay as-is); the response shape changes if Layer
1 rows, a layer tag, `containerNumber`, or invoice/payment status are
added. This is a breaking response-shape change for whatever currently
expects the old shape — see §7 for exactly who that is.

**Business Logic** — three explicit decisions are needed before any
schema/query work: (a) the Cancelled-inclusion rule, (b) whether
invoice/payment state belongs here or stays exclusively on Agent
Financial Account, (c) what "units"/"quantity" should mean now that
Layer 1 and Layer 2 don't share a unit concept.

**Database usage** — no schema/model change is required. `Booking` and
`ManualBooking` already carry every field a dual-layer version of this
report would need; this is a query/aggregation-layer migration only.

**Filters** — the existing filter set (voyage, agent, status, service,
date range) remains conceptually valid for a combined view; `status`
already maps to the exact same `BOOKING_STATUS` enum shared by both
models (confirmed in both `booking.model.js` and
`manualBooking.model.js`), so the filter dropdown itself needs no
change, only application to both queries.

**Exports** — either a report-specific export is added, or a deliberate
decision is made that none is needed. Separately (and out of this
report's direct scope, but sharing the same root cause): the unrelated
operational Bookings-list export (`export.service.js`, `case
'bookings'`) reads `r.quantity` (line 357) from the same `Booking`
model and has the identical dead-field problem — noted here because any
future fix to the shared legacy-field issue would logically touch both
places.

**Sorting** — currently a single fixed `sort({ createdAt: -1 })`; once
two collections are combined, sorting can no longer be delegated to a
single MongoDB query and becomes a merge-then-sort concern.

**Totals** — the summary aggregate needs rebuilding to sum Layer 1 +
Layer 2 `totalFreight` under one consistent Cancelled rule, with the
unit/quantity total redefined per the Business Logic decision above.

---

## 7. Impact Analysis

**Confirmed consumers of `GET /reports/bookings`:**
- `frontend/src/modules/reports/BookingReport.jsx` is the only frontend
  file calling `reportsService.getBookingReport` (grep-confirmed — no
  other component references it).
- `reports.controller.js#getBookingReport` is the only backend caller of
  `reports.service.js#getBookingReport`, wired to exactly one route
  (`GET /bookings` inside `reports.routes.js`).

**Confirmed NOT affected by changing this report:**
- The Agent Financial Account (Sprint 033) reads `Invoice`/`Payment`/
  `Booking`/`ManualBooking` directly through its own
  `agent.service.js#getAgentFinancialAccount` — it does not call or
  depend on `reports.service.js` in any way.
- The operational Bookings list (`BookingList.jsx`) and its own Excel
  export (`export.service.js`, `case 'bookings'`) are entirely separate
  code paths — they share the same underlying `Booking` model and the
  same dead `quantity` field, but neither calls into
  `reports.service.js`, so a change to the Booking *Report* does not
  itself touch the Booking *List* or its export.
- `capacity.service.js`, any booking-creation path (`booking.service.js`,
  `bookingImport.service.js`), and RBAC's `reports` permission
  definition are all unaffected — this report is a pure read-only
  consumer; nothing writes through it, and nothing else's write path
  depends on its output.

**What could be affected by updating it:**
- `ReportsHub.jsx`'s listing copy for this report ("Booking counts,
  freight revenue and slot utilisation per voyage") would need to match
  whatever the new report's actual scope becomes, once decided.
- Any Finance Officer/Operations Manager user relying on today's exact
  column set or KPI cards would see a visibly different table/summary
  after migration — a UI change, not a data-integrity risk, since
  today's numbers for "Qty"/"Total Units"/"Total Slots" are already
  non-functional.

**Overall blast radius: narrow.** Exactly one frontend page and one
backend endpoint depend on this report; no other module reads from or
writes through it.

---

## 8. Recommendation (Migration Strategy Only — No Implementation Steps)

Given the confirmed narrow blast radius (§7), the safest approach is a
direct, single-pass rebuild of this one report rather than a phased
dual-running migration — there is no other consumer to keep compatible
during a transition window.

Two independently-sized concerns should be kept separate rather than
bundled into one change: (1) fixing the already-dead
`quantity`/`totalSlots` fields and the row/summary Cancelled mismatch —
pure bug fixes with no design ambiguity, verifiable in isolation — versus
(2) deciding whether and how to expand the report's scope to include
Layer 1 and/or invoice/payment visibility — genuine scope questions that
need explicit business decisions first, the same way Sprint 033 gathered
its business decisions up front before implementation rather than
discovering them mid-build.

Whatever the eventual design, it should reuse the two patterns this
codebase has already proven work rather than invent new ones: the
Layer 1 + Layer 2 combined-aggregate approach already hardened in
`vessel.service.js#getVesselStats` (Sprint 032), and the
Operational/Manual tab convention already in production in
`BookingList.jsx` — both are directly applicable reference
implementations for this exact kind of dual-layer reporting problem.

The invoice/payment-visibility question in particular is recommended to
be resolved as its own explicit decision before any query is written,
rather than assumed one way or the other — it is the one point in this
analysis genuinely open to more than one reasonable answer.

---

This document is for architecture review only. No code was written, no
files were modified, and no sprint was created. Implementation should
wait for a separate, explicit approval.
