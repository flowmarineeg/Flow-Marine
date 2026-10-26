# Reports, Dashboard & Export — Architecture Analysis (Post Sprint 032–034)

**Purpose:** a production architecture audit of every remaining Report,
every Dashboard metric, and every Export endpoint, to determine which
still carry assumptions from the pre-Layer-1/Layer-2 architecture, which
were correctly modernized, and where Sprint 032's (Vessel Stats) and
Sprint 034's (Booking Report / Booking Revenue Details) partial
modernization left the system internally inconsistent. This is an
analysis document only — no code was written or modified, and no Sprint
035 is proposed here; the final two sections size candidate scope for
that future conversation without prescribing it.

Files read to produce this analysis: `backend/src/modules/reports/*`,
`backend/src/modules/dashboard/*`, `backend/src/modules/export/*`,
`backend/src/modules/vessels/vessel.service.js`,
`backend/src/modules/capacity/capacity.service.js`,
`backend/src/modules/bookings/booking.model.js`,
`backend/src/modules/bookings/manualBooking.model.js`,
every `frontend/src/modules/reports/*.jsx`,
`frontend/src/app/(dashboard)/dashboard/page.jsx`.

> **STATUS (current through Sprint 046):** this analysis fed three later
> sprints: Sprint 037 (Reporting Modules Architecture Audit, formalized
> the Reports-side findings), Sprint 038 (implemented the Reports fixes),
> and Sprint 039 (Dashboard rebuild, implemented the Dashboard-side
> findings) — Sprint 040 separately picked up the Export-side findings.
> Historical/source reference — the current state of each finding is
> tracked in claude.md's Sprint 037-040 sections and sprints/037-sprint.txt
> Section 7 (Required Changes), not here. Not touched by Sprints 041-046 —
> the Round Capacity Report's `round.voyageIds` vs. `Voyage.find({roundId})`
> inconsistency this analysis's Sprint 037 successor flagged is still open
> (see claude.md Known Issues #11).

---

# Executive Summary

Three sprints (032, 033, 034) modernized specific, individually-scoped
surfaces for the Layer 1 + Layer 2 booking model: Vessel Details KPIs
(032), the Invoice/Payment financial layer (033), and the Booking Report
plus the new Booking Revenue Details report (034). None of the three
sprints touched the Dashboard, the Export module, or four of the six
remaining Reports (Round P&L, Voyage Performance, Revenue Report, Round
Capacity is already correct — see below). The result is a system where
**"how many bookings" and "how much revenue" now have at least five
different, independently-computed answers**, each locally defensible but
never reconciled against one another, and where two concrete legacy bugs
(a dead `quantity` field and a dead `totalSlots`/slot concept) still
exist in multiple places that Sprint 034 did not reach.

The most important finding is not a bug in any single module — it is
that **no single module owns "the" definition of booking activity or
revenue**. Each of Dashboard, Round P&L, Voyage Performance, Revenue
Report, Booking Report, and Booking Revenue Details independently decided
its own status-inclusion rule (which booking statuses count), its own
layer-inclusion rule (Layer 2 only vs. both), and its own time window,
with no shared constant or shared aggregation helper. This is the
structural root cause behind nearly every specific finding below.

---

# Current Reporting Architecture

```
Dashboard          → dashboard.service.js#getDashboardStats/getFleetUtilisation
                     GET /dashboard/stats, /dashboard/fleet-utilisation

Reports module     → reports.service.js (one file, one function per report)
                     GET /reports/round-pnl            (getRoundPnL)
                     GET /reports/voyage-performance    (getVoyagePerformance)
                     GET /reports/bookings              (getBookingReport)         [Sprint 034]
                     GET /reports/revenue               (getRevenueReport)
                     GET /reports/expenses              (getExpenseReport)
                     GET /reports/round-capacity        (getRoundCapacityReport)
                     GET /reports/booking-revenue-details (getBookingRevenueDetails) [Sprint 034, new]

Export module      → export.service.js (one file, one case per module)
                     POST /export/excel, /export/zip
                     Modules: vessels, agents, containerTypes, expenseTypes,
                     services, rounds, voyages, bookings, expenses, invoices,
                     tracking, auditLogs

Vessel Details      → vessel.service.js#getVesselStats  [Sprint 032, reference implementation]
Agent Financial     → agent.service.js#getAgentFinancialAccount  [Sprint 033, reference implementation]
Capacity Engine     → capacity.service.js  [Sprint 022/028/029/032, reference implementation, dual-layer, untouched by 034]
```

Three files/functions are the established, hardened, correct dual-layer
reference implementations: `vessel.service.js#getVesselStats` (Sprint
032), `agent.service.js#getAgentFinancialAccount` (Sprint 033), and
`capacity.service.js` (Sprint 022 onward). Every finding below measures
the remaining surfaces against these three, not against an invented ideal.

---

# Dashboard Analysis

`dashboard.service.js#computeStats()` (cached 90s) and
`#getFleetUtilisation()` (Sprint 022, uses the capacity engine directly).

| Metric | Calculation | Layer | Correct? |
|---|---|---|---|
| Active Vessels | `Vessel.countDocuments({status:'Active'})` | N/A | Correct — not a booking metric |
| Active/Planned/Completed Rounds | `Round.countDocuments` by status | N/A | Correct |
| Total/Active Voyages | `Voyage.countDocuments` | N/A | Correct |
| **Confirmed/Pending/Cancelled Bookings** | `Booking.countDocuments` by status | **Layer 2 ONLY** | **Legacy — see Finding D1** |
| Total Agents | `Agent.countDocuments` | N/A | Correct |
| Draft/Overdue/Paid Invoices | `Invoice.countDocuments` by status | N/A (Invoice, not Booking) | **Incomplete — see Finding D2** |
| Total Expenses | `Expense.countDocuments({})` | N/A | Correct |
| **Revenue (30 days)** | `Booking.aggregate` — `status: 'Confirmed'` ONLY, `createdAt >= 30d ago` | Layer 2 ONLY | **Legacy — see Finding D3** |
| Monthly Trend (6mo chart) | `Booking.aggregate` — `status != Cancelled` | Layer 2 ONLY | **Inconsistent with Revenue (30d) — see Finding D3** |
| Revenue by Service (bar chart) | `Booking.aggregate` — `status != Cancelled`, grouped by service | Layer 2 ONLY | **Legacy — see Finding D4** |
| Bookings by Status (doughnut) | `Booking.aggregate` — ALL statuses incl. Cancelled | Layer 2 ONLY | **Legacy — see Finding D1** |
| Voyages by Status (doughnut) | `Voyage.aggregate` by status | N/A | Correct |
| Invoices by Status (doughnut) | `Invoice.aggregate` by status | N/A | **Missing a status — see Finding D2** |
| Recent Activity | `AuditLog.find().limit(10)` | N/A | Correct |
| Fleet Utilisation widget | `capacity.service.js#computeRoundCapacity` per active round | **Both (dual-layer, hardened)** | **Correct — reference implementation** |

## Finding D1 — Layer 1 is computed but never displayed
`dashboard.service.js` lines 84-94 compute `totalManualBookings`,
`pendingManualBookings`, `confirmedManualBookings`, and
`manualRevenue30d` — explicitly labeled "Sprint 023" — and returns them
in `kpis`. **The frontend (`dashboard/page.jsx`) never reads or renders
any of these four fields.** The "Confirmed Bookings" KPI card (line 277)
shows `kpis.confirmedBookings` alone — Layer 2 only. The "Bookings by
Status" doughnut (line 359) renders `charts.bookingsByStatus`, which is
built from a Layer-2-only aggregate (`dashboard.service.js` lines 66-70)
with no Layer 1 merge, unlike the identical-sounding chart on Vessel
Details, which Sprint 032 explicitly hardened to combine both layers.
Layer 1 work is computed on every dashboard load (a real, if small, cost)
and then discarded — dead computation, not dead code.

## Finding D2 — "Partially Paid" (Sprint 033) has no Dashboard presence
`INVOICE_STATUS_COLORS` in `dashboard/page.jsx` (line 64) defines colors
for `Draft, Issued, Paid, Overdue, Cancelled` only — no `'Partially
Paid'`. The KPI row (lines 285-286) shows Draft/Paid/Overdue counts only
— there is no "Partially Paid Invoices" card. Since `invoicesByStatus`
groups by the live `$status` field with no filter, a Partially Paid
invoice still appears in the doughnut, just with an undefined color
(falls back to the chart's first palette color) and no dedicated KPI
card — a status introduced in Sprint 033 that the Dashboard (last
touched before Sprint 033) was never updated to represent.

## Finding D3 — "Revenue (30 days)" and the trend chart use two different,
undocumented status-inclusion rules on the same page
`revenue30d` (line 47-50) matches `status: 'Confirmed'` **only** —
explicitly excluding `'Final Loading'`, the status that represents cargo
that has actually, physically moved. `monthlyTrend` (lines 51-55), three
lines below it in the same file, matches `status: { $ne: 'Cancelled' }`
— i.e. Pending + Confirmed + Final Loading all count. Both are labeled
as revenue/freight on the same dashboard page, with different scopes,
and the UI's only disambiguation is a small "Confirmed bookings"
sub-label on the KPI card (line 278) — easy to miss, and it doesn't
explain *why* Final Loading (a further-progressed, more "real" status)
is excluded from the headline number while being included in the trend
line right next to it. This reads as a leftover from the era before
Sprint 017 introduced Final Loading as a status, never revisited.

## Finding D4 — "Revenue by Service" duplicates Revenue Report's logic,
Layer 2 only, in a separate file
`dashboard.service.js`'s `revByService` aggregate (lines 56-65) and
`reports.service.js#getRevenueReport` (see below) both group `Booking` by
service, both sum `totalFreight`/count, both exclude Cancelled, both
Layer 2 only — independently written, independently maintained, in two
different files. A future change to one (e.g. adding Layer 1) requires
remembering to mirror it in the other — a duplicate-calculation risk
called out explicitly in the Cross Module Consistency section.

---

# Booking Report Review (Sprint 034 — for reference, not re-analyzed in depth)

Already fully migrated in Sprint 034: combines `Booking` + `ManualBooking`,
removed the dead `quantity`/`totalSlots` fields, fixed the row/summary
Cancelled-inclusion mismatch. See `sprints/034-sprint.txt` for the full
record. Included here only to anchor the comparison table above and the
Cross Module Consistency section below — this is the report every other
Layer-2-only report should be measured against, business-purpose
permitting.

---

# Booking Revenue Details Review (Sprint 034 — for reference)

New in Sprint 034. Deliberately Layer 2, Final Loading status ONLY — by
explicit, correct business design (a commercial pricing report should
only reflect cargo that actually moved, per its own Business Description
in `sprints/034-sprint.txt`). This is the one report in the system where
"Layer 2 only" is the *correct*, deliberate answer, not a legacy
oversight — flagged here explicitly per the analysis brief's instruction
not to assume every report should be dual-layer.

---

# Voyage Performance Analysis

`reports.service.js#getVoyagePerformance` — `GET
/reports/voyage-performance` — `VoyagePerformanceReport.jsx`.

**Business purpose:** per-voyage operational summary — booking count and
freight revenue for each voyage matching a service/round/status/date
filter, with a chart of the top 10 voyages by freight. For Operations to
spot which voyages are carrying the most/least cargo.

**Backend flow:** `Voyage.aggregate` with a `$lookup` sub-pipeline into
`bookings` (Layer 2 only), summing `totalFreight`/count/`quantity`,
joined to `round`/`service`/`pol`/`pod`.

**Models/collections:** `Voyage`, `Booking` (Layer 2 only — no
`ManualBooking` reference anywhere in this function), `Round`,
`Service`, `Port`.

**Layer usage:** Layer 2 ONLY.

## Finding V1 — `totalSlots` is displayed but was never returned
`VoyagePerformanceReport.jsx` renders `r.totalSlots` (line 215) and
`totals.totalSlots` (lines 167, 224) — but `getVoyagePerformance`'s
`$project` (reports.service.js, the voyage-performance function) outputs
exactly `bookingCount`, `totalFreight`, `totalQty` — **no `totalSlots`
field exists in the response at all.** This is the identical dead-field
class of bug Sprint 034 fixed in the Booking Report (where the concept
was called "Total Slots," removed since Sprint 017 per that function's
own code comment) — except here it was never touched, so the frontend
KPI card and table column both silently render `0` for every voyage,
every time. `ReportsHub.jsx`'s card description for this report ("Booking
counts, freight revenue and **slot utilisation** per voyage") still
markets a feature that has not existed since Sprint 017.

## Finding V2 — `totalQty` sums the same dead `quantity` field Sprint 034
already removed from the Booking Report
`quantity: { $sum: '$quantity' }` inside this function's `$lookup`
sub-pipeline sums a field that has not existed on `Booking` since Sprint
025/026. Always evaluates to 0. Sprint 034 removed this exact pattern
from `getBookingReport` but this sibling function, in the same file, was
not in scope for that sprint and still has it.

## Finding V3 — Layer 1 (ManualBooking) is completely absent
No `ManualBooking` reference anywhere in this function. A voyage carrying
only Layer 1 (Manual) bookings shows `bookingCount: 0`, `totalFreight: 0`
here, while the same voyage's Vessel Details page (Sprint 032) would
correctly show its Layer 1 activity. **Business judgment:** unlike
Booking Revenue Details, there is no clear business reason to exclude
Layer 1 here — a voyage's "performance" plausibly should reflect
everything booked on it, commercial reservations included, the same way
Vessel Details already does. This looks like an oversight, not a
deliberate design choice — no comment or business-rule justification
exists anywhere in this function for the Layer 2-only scope, unlike
Booking Revenue Details' explicit one.

---

# Revenue Report Analysis

`reports.service.js#getRevenueReport` — `GET /reports/revenue` —
`RevenueReport.jsx`.

**Business purpose:** total freight revenue grouped by service, with a
doughnut chart of revenue share — "which service line is generating the
most revenue."

**Backend flow:** `Voyage.aggregate` with a `$lookup` into `bookings`
(Layer 2 only), grouped by `serviceId`, summing `totalFreight`/count/
`quantity`.

**Models/collections:** `Voyage`, `Booking` (Layer 2 only), `Service`.

**Layer usage:** Layer 2 ONLY.

## Finding R1 — same dead `quantity`/`totalQty` field as Voyage Performance
Identical pattern: `totalQty: { $sum: { $ifNull: ['$bk.totalQty', 0] } }`
sums a field that doesn't exist on `Booking`. Always 0. Not rendered
directly in `RevenueReport.jsx`'s visible columns today (the table shows
Voyages/Bookings/Units/Revenue/Share — "Units" is `r.totalQty`, so it
IS rendered, always as 0) — confirmed by reading the frontend table
(`RevenueReport.jsx` line 165, the "Units" column).

## Finding R2 — Layer 1 absent, and this is the SAME question Round P&L
already answered the opposite way in the same reports.service.js file
No `ManualBooking` reference. **This is worth special attention**: in
the very same file, `getRoundPnL` (a few dozen lines above this
function) already computes and combines Layer 1 revenue
(`l1Revenue`/`totalRevenue = rev.totalRevenue + l1.totalRevenue`,
labeled "Sprint 023" — predating even Sprint 032). Round P&L asks "how
much revenue did this round generate" and answers with both layers.
Revenue Report asks the nearly identical question "how much revenue did
this service generate" and answers with Layer 2 only. Two adjacent
functions in one file, answering structurally the same business
question, disagree on whether Layer 1 counts — with no comment
explaining why the difference is intentional.

---

# Round P&L Analysis

`reports.service.js#getRoundPnL` — `GET /reports/round-pnl` —
`RoundPnlReport.jsx`.

**Business purpose:** for one selected round, total revenue vs. total
expenses (by category/currency) and the resulting net P&L.

**Backend flow:** `Booking.aggregate` (Layer 2 revenue) + `ManualBooking.
aggregate` (Layer 1 revenue, explicitly summed together as
`totalRevenue`) + `Expense.aggregate` (by category/currency, joined to
`expensetypes`).

**Models/collections:** `Round`, `Booking`, `ManualBooking`, `Expense`,
`ExpenseType`.

**Layer usage:** **Both — already correct**, and has been since before
Sprint 032 ("Sprint 023" comment in the code).

## Finding P1 — the one carried-forward legacy field: dead `quantity`
`totalQty: { $sum: '$quantity' }` (Layer 2 branch only) — same dead field
as everywhere else. Rendered in `RoundPnlReport.jsx` as "Total Units"
(line 166) — always 0 for the Layer 2 contribution. (Layer 1's
`manualTotalUnits` is computed correctly from `ManualBooking.totalUnits`
but is a separate field, not combined into the same "Total Units" label
shown to the user — worth noting alongside the Cross Module section:
this report already distinguishes L1 units from L2 "units" internally,
it just doesn't surface `manualTotalUnits` anywhere in the frontend
either.)

## Finding P2 — bookingCount is Layer 2 only, contradicting the
already-dual-layer revenue figure one field over
`data.bookingCount` (rendered in the Round Details grid, "Bookings" — wait,
actually not rendered; the frontend's Round Details grid shows "Voyages"
and "Total Units," not "Bookings" — confirmed by re-reading
`RoundPnlReport.jsx`'s grid array, lines 158-166: no `bookingCount` field
is displayed at all in the current UI, only `voyageCount` and
`totalQuantity`). So this is latent, not currently user-visible: the
backend computes a Layer-2-only `bookingCount` (line ~108 area) sitting
right next to a correctly-combined `totalRevenue`, an inconsistency that
would surface the moment someone adds a "Bookings" stat card to this
report using the existing field, unaware it's Layer 2 only while its
sibling `totalRevenue` is not.

---

# Round Capacity Analysis

`reports.service.js#getRoundCapacityReport` → delegates entirely to
`capacity.service.js#computeRoundCapacity` — `GET
/reports/round-capacity` — `RoundCapacityReport.jsx`.

**Business purpose:** per-leg TEU utilisation for a round — onboard,
loaded, discharged, remaining capacity at each port, peak utilisation.

**Layer usage:** **Both — already correct, and the most rigorously
hardened dual-layer surface in the entire system** (Sprint 022 initial
build, Sprint 028 multi-voyage transit fix, Sprint 029 exact-segment
display fix, reused unchanged by Sprint 032's Vessel Details and by this
report). `L1_STATUSES`/`L2_STATUSES` in `capacity.service.js` (lines
15/19) are both `['Pending', 'Confirmed', 'Final Loading']` — identical
inclusion rule for both layers, Cancelled and soft-deleted excluded from
both. The frontend's "Include Pending bookings" toggle
(`RoundCapacityReport.jsx` line 37-39) correctly passes
`'Confirmed,Final Loading,Pending'` vs. the engine's own default, matching
the approved capacity rule exactly.

**No findings.** This module needs no attention — it is the reference,
not a subject of concern.

---

# Other Reports Analysis

## Expense Report
`reports.service.js#getExpenseReport` / `ExpenseReport.jsx`. Queries
`Expense` only, joined to `ExpenseType`/`Round`/`Voyage`/`Agent`. **Layer
1/Layer 2 does not apply to this report at all** — expenses are not a
booking concept; a round/voyage can have expenses regardless of which
booking layer generated its cargo. Correctly out of scope for this
audit's Layer question. No legacy Booking-architecture assumptions found.

---

# Export Module Analysis

`export.service.js` — one `COLUMNS` definition + one `fetchData` case per
module, `POST /export/excel` / `POST /export/zip`.

| Module | Layer relevance | Finding |
|---|---|---|
| vessels, agents, containerTypes, expenseTypes, services, tracking, auditLogs | N/A — master data / non-booking | Correct, no Layer question applies |
| rounds, voyages | N/A — these describe schedule, not booking activity | Correct as-is; carry no booking totals to get wrong |
| **bookings** | **Layer 2 ONLY** | **Legacy — see Finding E1** |
| **invoices** | N/A (Invoice, not Booking) | **Correct — already Sprint 033-shaped** (confirmed: uses `lineItems`, `totalAmount`/`paidAmount`/`balanceAmount`, not the old `bookingId`/`amount` shape) |
| expenses | N/A | Correct |

## Finding E1 — the Bookings export is the least-modernized surface in
the entire system: Layer 2 only, dead `quantity` field, no
`containerNumber`, and now materially disagrees with the Booking Report
UI it nominally exports
`export.service.js`'s `bookings` case (`COLUMNS.bookings` +
`fetchData`'s `'bookings'` branch):
- **Layer 2 only** — `Booking.find(...)`, no `ManualBooking` anywhere.
  There is no export path for Layer 1 (Manual) booking data anywhere in
  the system — not from this generic export, not from
  `BookingList.jsx`'s own tooling. This is the single clearest "missing
  Layer 1 participation" gap identified in this whole audit: Layer 1 data
  cannot be exported to Excel by any means today.
- **`quantity: r.quantity`** (line ~357) — the same dead field, still
  present, unfixed.
- **No `containerNumber` column** — the same gap the Booking Report had
  before Sprint 034 fixed it; `export.service.js`'s bookings export still
  only shows the container *type* code, not the container number.
- **Sprint 034 introduced a new inconsistency here, by omission**: the
  Booking Report UI (post-034) now shows Layer + containerNumber and
  excludes the dead fields; the Bookings *export* — which a user would
  reasonably expect to produce "the same data as the report, in Excel" —
  still reflects the pre-034 shape entirely. Before Sprint 034, report and
  export at least agreed (both were equally Layer-2-only and equally had
  the dead fields); now they visibly disagree. This is a genuine
  regression in consistency introduced as a side effect of 034's
  otherwise-correct, narrowly-scoped fix.

---

# Cross Module Consistency

## Metrics that answer "how many bookings" — five different definitions, side by side

| Surface | Layer(s) | Status inclusion | Cancelled? |
|---|---|---|---|
| Dashboard "Confirmed Bookings" KPI | L2 only | `status: 'Confirmed'` | N/A (single status) |
| Vessel Details (Sprint 032) | **L1 + L2** | all statuses (combined breakdown) | excluded from headline total, shown as its own slice |
| Booking Report (Sprint 034) | **L1 + L2** | all, unless user filters | excluded by default, includable via explicit filter |
| Round P&L `bookingCount` | L2 only | all (implicit — no status filter in the aggregate) | not excluded |
| Booking Revenue Details (Sprint 034) | L2 only (**by design**) | `'Final Loading'` only | N/A |
| Agent Financial Account (Sprint 033) | L2 only (**by design**) | `'Final Loading'` only | N/A |

## Metrics that answer "how much revenue" — at least six different windows/scopes

| Surface | Layer(s) | Status inclusion | Time window |
|---|---|---|---|
| Dashboard "Revenue (30 days)" | L2 only | `Confirmed` only | rolling 30 days |
| Dashboard monthly trend | L2 only | non-Cancelled | rolling 6 months |
| Dashboard revenue by service | L2 only | non-Cancelled | all-time |
| Round P&L | **L1 + L2** | all (no exclusion) | one round's lifetime |
| Revenue Report | L2 only | non-Cancelled | all-time or date range |
| Voyage Performance | L2 only | non-Cancelled | all-time or date range |
| Booking Report (034) | **L1 + L2** | non-Cancelled by default | filterable |
| Booking Revenue Details (034) | L2 only (by design) | `Final Loading` only | filterable |
| Agent Financial Account (033) | L2 only (by design) | `Final Loading` only | all-time (bounded to 20 rounds) |

None of these are necessarily *wrong* in isolation — a 30-day operational
KPI and an agent's lifetime financial statement are legitimately
different questions. The risk is that **no document anywhere states which
of these differences are intentional business decisions and which are
accidents of when each surface was last touched** — this audit is the
first place several of them have been written down side by side.

## Duplicate calculations

- Dashboard's `revByService` (dashboard.service.js) and Revenue Report's
  `getRevenueReport` (reports.service.js) independently implement almost
  the same aggregation (group Booking by service, sum freight/count,
  exclude Cancelled) in two different files.
- The `quantity`-summing pattern (`$sum: '$quantity'`) is independently
  repeated in four places (`getRoundPnL`, `getVoyagePerformance`,
  `getRevenueReport`, and `export.service.js`'s bookings case) — one
  dead field, copy-pasted four times, fixed in exactly one of its five
  total occurrences (the fifth being the now-removed one in
  `getBookingReport`).

## Legacy calculations / business-rule conflicts

- Dashboard's Revenue (30d) excluding Final Loading directly conflicts
  with Booking Revenue Details' and Agent Financial Account's explicit
  design decision that Final Loading is the "cargo actually moved,
  therefore real revenue" status.
- Round P&L already treats Layer 1 as real revenue (has since Sprint
  023); Revenue Report and Voyage Performance, answering structurally
  similar questions, do not.

## Places where future bugs are likely

- Anyone adding a "Total Units" or "Slots" stat to Voyage Performance,
  Revenue Report, or the Bookings export, by copying an existing pattern
  in `reports.service.js`/`export.service.js`, will silently inherit the
  dead `quantity` field rather than getting a real number, because the
  dead pattern is more common in the codebase (4 occurrences) than the
  fixed one (Booking Report, 1 occurrence).
- Anyone building a Layer 1 export, following the existing `bookings`
  case as a template, will need to notice on their own that no
  `ManualBooking` case exists anywhere to copy from — there is no
  existing dual-layer export pattern in `export.service.js` at all
  (unlike the report layer, which now has one reference implementation
  in Booking Report).

---

# Legacy Architecture Remaining

- `quantity` field, dead since Sprint 025/026, still summed in:
  `getRoundPnL`, `getVoyagePerformance`, `getRevenueReport`,
  `export.service.js`'s bookings case (4 of 5 known occurrences remain).
- `totalSlots`/slot concept, dead since Sprint 017, still displayed in:
  `VoyagePerformanceReport.jsx` (KPI card + table column), and still
  advertised in `ReportsHub.jsx`'s card copy for that report.
- Layer 2-only booking/revenue queries with no stated business
  justification: Dashboard (bookings-by-status, revenue metrics),
  Voyage Performance, Revenue Report.
- The Bookings export: Layer 2 only, dead field, missing
  `containerNumber` — the least-modernized surface in the system.
- Dashboard computing Layer 1 KPIs that are never displayed (dead
  computation, not dead code, but effectively invisible to users).
- Dashboard's invoice status set not updated for Sprint 033's "Partially
  Paid" status.

---

# Reports Already Correct

- **Round Capacity Report** — fully dual-layer, most rigorously hardened
  surface in the system (Sprints 022/028/029/032). No changes needed.
- **Round P&L** — already dual-layer for revenue (since Sprint 023,
  predating even Sprint 032), correctly combines Layer 1 + Layer 2
  freight into one `totalRevenue`. Only its `bookingCount`/`totalQty`
  fields carry legacy gaps (Findings P1/P2), not its core revenue logic.
- **Booking Revenue Details** (Sprint 034) — deliberately, correctly
  Layer 2 + Final Loading only, matching its explicit business purpose.
- **Agent Financial Account** (Sprint 033) — same deliberate, correct
  Layer 2 + Final Loading scoping, for the same reason.
- **Booking Report** (Sprint 034) — already migrated to combined Layer
  1 + Layer 2 in this same audit's baseline.
- **Expense Report** — no Layer question applies; correctly unaffected.
- **Invoices export** — already reflects the Sprint 033 `lineItems`/
  `totalAmount`/`paidAmount`/`balanceAmount` shape correctly.

---

# Reports Requiring Modernization

- **Voyage Performance Report** — dead `totalSlots` (never returned by
  the backend at all), dead `quantity`/`totalQty`, no Layer 1
  participation with no stated business reason to exclude it.
- **Revenue Report** — dead `quantity`/`totalQty`, no Layer 1
  participation, despite Round P&L (same file) already treating Layer 1
  as real revenue for a structurally similar question.
- **Dashboard** — Layer 1 KPIs computed but never shown; "Bookings by
  Status" and revenue metrics Layer 2 only; "Revenue (30 days)"
  excludes Final Loading with no stated reason, inconsistent with the
  trend chart on the same page; missing "Partially Paid" invoice
  representation (status + KPI card).
- **Bookings export** (`export.service.js`) — Layer 2 only (no Layer 1
  export path exists anywhere in the system), dead `quantity`, missing
  `containerNumber`, and now visibly out of step with the modernized
  Booking Report UI it's meant to mirror.

---

# Risks

- **No shared source of truth for "booking activity" or "revenue."**
  Every surface computing these concepts does so independently. Fixing
  any one in isolation (as Sprint 034 did for the Booking Report) narrows
  the inconsistency in one place while leaving, or in the export case
  worsening, it everywhere else.
- **Silent zero, not an error.** Every dead-field occurrence
  (`quantity`, `totalSlots`) fails silently — no exception, no warning,
  just a permanently-0 number rendered with full visual confidence
  (bold, colored, formatted like real data). A user has no signal that
  anything is wrong.
- **Dashboard is SuperAdmin-facing and cached (90s TTL)** — the
  inconsistencies here are seen by the most senior audience in the
  system, on the page they look at most often, and are the same
  regardless of which user reloads it.
- **Export is the trust boundary for external stakeholders** — Excel
  exports often leave the system (emailed, shared with agents/auditors).
  The Bookings export's legacy Layer-2-only, dead-field shape is the
  export most likely to reach someone outside the team who has no way to
  know it disagrees with the in-app report.

---

# Technical Recommendations

(Principles for a future sprint to weigh — not an implementation plan.)

- Establish one shared definition (ideally one small shared helper module,
  not a convention repeated by hand) for "combined Layer 1 + Layer 2
  booking activity, Cancelled-excluded" and reuse it everywhere that
  question is asked, the way `capacity.service.js`'s `L1_STATUSES`/
  `L2_STATUSES` already centralize the capacity-specific version of this
  same idea.
- Treat the dead `quantity` and `totalSlots` fields as a single cleanup
  concern spanning all four/two remaining occurrences respectively,
  rather than fixing them report-by-report as each report happens to be
  touched for an unrelated reason (which is how Sprint 034 left them
  3-of-4 and 1-of-2 still present).
- Decide, explicitly and in writing, whether Revenue Report and Voyage
  Performance should include Layer 1 (matching Round P&L's already-set
  precedent) or whether there is a real business reason for them to
  differ — and document whichever answer is chosen, the way Booking
  Revenue Details' Business Description now documents its own deliberate
  Layer 2-only scope.
- When any report's UI is modernized, treat its corresponding Export
  column set as part of the same unit of work, not a separate, later
  decision — Sprint 034 demonstrated how quickly the two drift apart
  otherwise.
- Revisit the Dashboard's invoice-status color map and KPI row whenever
  the Invoice status enum changes in the future, given it was already
  missed once for "Partially Paid."

---

# Suggested Sprint Scope

(Candidate topics for a future planning conversation — sizing only, not
a plan, not phases, not acceptance criteria.)

1. Dead-field cleanup: remove `quantity`/`totalQty` from `getRoundPnL`,
   `getVoyagePerformance`, `getRevenueReport`, and the Bookings export;
   remove `totalSlots` from `VoyagePerformanceReport.jsx` and its
   `ReportsHub.jsx` description.
2. Layer 1 inclusion decision + implementation for Voyage Performance and
   Revenue Report (contingent on the business decision recommended
   above).
3. Dashboard modernization: surface or remove the already-computed Layer
   1 KPIs; reconcile the Revenue (30d)/monthly-trend status-scope
   mismatch; add "Partially Paid" to the invoice status color map and
   KPI row.
4. Bookings export modernization: Layer 1 inclusion (or an explicit,
   documented decision not to), `containerNumber` column, dead-field
   removal — brought into alignment with the Sprint 034 Booking Report.
5. A documented, shared policy (not necessarily new code) stating which
   "booking activity"/"revenue" definitions are intentionally different
   across Dashboard/Reports/Vessel Stats/Agent Financial Account, and
   why — so the next audit doesn't have to re-derive this table from
   scratch.

---

This document is for architecture review only. No code was written or
modified, and no Sprint 035 was created — both are explicitly deferred to
a separate planning conversation, per the request that produced this
analysis.
