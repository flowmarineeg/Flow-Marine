# Rolling P&L Report — Architecture & Business Analysis

**Purpose:** a complete technical and business understanding of the
report that will become the primary voyage-profitability report, as it
actually exists in the codebase today, before the Expense module is
redesigned around it. This document contains no proposed schema, no
implementation plan, no sprint, and no code changes.

> **STATUS (current through Sprint 046):** this analysis's "voyage-level
> granularity" gap was closed by Sprint 035 (Voyage Profitability Report,
> evolving Round P&L in place). The other gap this doc identifies — true
> multi-round, time-series "rolling" P&L across periods — is explicitly
> STILL NOT built, through Sprint 046 (Sprint 035 OUT OF SCOPE said so
> directly: "this sprint closes the voyage-level granularity gap... it
> does not add a rolling/trend/multi-period view"). Not touched by
> Sprints 036-046. Historical reference — cite, don't re-derive.

**Naming note, stated up front because it matters throughout this
document:** the brief refers to this as the "Rolling P&L Report." In the
current codebase, the only report matching this description is named
**Round P&L** everywhere — `reports.service.js#getRoundPnL`,
`RoundPnlReport.jsx`, `GET /reports/round-pnl`, the "Round P&L" card on
`ReportsHub.jsx`. There is no other P&L-shaped report anywhere in the
system. This document analyzes **Round P&L** as the existing
implementation the brief is referring to, and treats the "Rolling"
framing in the brief as a statement of *future intent* to be measured
against — not something already built. That gap is itself the central
finding of this analysis; see Gap Analysis.

Files read to produce this analysis:
`backend/src/modules/reports/reports.service.js` (`getRoundPnL`),
`backend/src/modules/reports/reports.controller.js`,
`backend/src/modules/reports/reports.routes.js`,
`backend/src/modules/rounds/round.model.js`,
`backend/src/modules/bookings/booking.model.js`,
`backend/src/modules/bookings/manualBooking.model.js`,
`backend/src/modules/expenses/expense.model.js`,
`backend/src/modules/expenseTypes/expenseType.model.js`,
`frontend/src/modules/reports/RoundPnlReport.jsx`,
`frontend/src/services/reports.service.js`,
`frontend/src/modules/reports/ReportLayout.jsx`,
`frontend/src/modules/reports/ReportsHub.jsx`.

---

# Executive Summary

The current Round P&L report is a **single-round, on-demand snapshot**:
the user picks exactly one Round from a dropdown, and the report returns
one set of numbers — total revenue (combined Layer 1 + Layer 2 booking
freight) minus total expenses (grouped by category and currency) for
every voyage inside that round, lumped into one figure. It is not
rolling in any sense (no time window, no trend, no comparison across
periods), and it is not voyage-level (every voyage inside the round is
summed together; there is no per-voyage breakdown or per-voyage
profitability anywhere in the response or the UI).

The revenue side is already correctly dual-layer (combines
`ManualBooking` and `Booking` freight) and has been since Sprint 023 —
this is the same pattern the rest of the system's revenue reports were
only brought into line with much later (Sprint 032/034). The expense
side is a straightforward round-and-its-voyages aggregate, grouped by
category and currency, with no relationship to any expense lifecycle
concept (because, per the companion Expense module analysis, no such
concept currently exists).

If "Rolling P&L" is meant to become "the primary business report for
voyage profitability," the current implementation is missing the one
capability that phrase implies most directly: **a profitability figure
per voyage.** Today's report cannot answer "which voyage in this round
made money and which one lost money" — only "did the round, as a whole,
come out ahead."

---

# Current Business Purpose

As built: for one selected Round, show total revenue vs. total expenses
and the resulting net P&L, broken down by expense category/currency, so
Operations/Finance can review whether a completed or in-progress round
was profitable. It is a retrospective/point-in-time review tool for a
single unit of work (one Round), not a monitoring, trending, or
per-voyage diagnostic tool.

---

# Current Report Workflow — Complete Flow

```
Frontend
  app/(dashboard)/reports/round-pnl/page.jsx  → <RoundPnlReport />
  frontend/src/modules/reports/RoundPnlReport.jsx
    → Round dropdown (roundsService.list({ limit: 200 }))
    → useQuery(['report-round-pnl', roundId], enabled: !!roundId)
    → reportsService.getRoundPnL({ roundId })
  frontend/src/services/reports.service.js
    → GET /reports/round-pnl?roundId=...

Backend
  backend/src/modules/reports/reports.routes.js
    router.use(auth); router.use(rbac('reports'));
    router.get('/round-pnl', ctrl.getRoundPnL)
  backend/src/modules/reports/reports.controller.js#getRoundPnL
    → reportsService.getRoundPnL(req.query)
  backend/src/modules/reports/reports.service.js#getRoundPnL
    → Round.findOne (populate service + vessel)
    → Booking.aggregate (Layer 2 revenue)
    → Expense.aggregate (round + its voyages)
    → ManualBooking.aggregate (Layer 1 revenue)
    → merge into one response object
```

**Trigger model:** the report only fires once a Round is selected —
there is no default/landing state showing anything, and no
auto-refresh; selecting a different Round re-fires the query
(`enabled: !!roundId`, `RoundPnlReport.jsx` line 88).

**Export:** **none.** `ReportLayout.jsx` supports an `onExport` prop;
`RoundPnlReport.jsx` never supplies one — consistent with every other
report in the module (confirmed in the earlier Reports architecture
audit — this is not unique to Round P&L).

---

# Data Sources

| Collection | Role | Query shape |
|---|---|---|
| `Round` | The single unit the report is scoped to | `Round.findOne({ _id: roundId, isDeleted: false })`, populated with `serviceId`/`vesselId` labels |
| `Booking` (Layer 2) | Operational booking revenue | `Booking.aggregate` matched on `voyageId: { $in: round.voyageIds }` |
| `ManualBooking` (Layer 1) | Commercial reservation revenue | Same `voyageId: { $in: round.voyageIds }` match, separate aggregate |
| `Expense` | Round/voyage cost | `Expense.aggregate` matched on `roundId` OR `voyageId ∈ round.voyageIds` |
| `ExpenseType` | Expense category label | `$lookup` inside the expense aggregate, for `category` |
| `Service`, `Vessel` | Display-only labels | Populated onto the `Round` document, not aggregated |

**Critical dependency:** the report never independently queries
`Voyage.find({ roundId })` — it trusts `Round.voyageIds`, a denormalized
array stored directly on the `Round` document
(`round.model.js` line 15: `voyageIds: [{ type: ObjectId, ref: 'Voyage' }]`).
Every revenue and expense number in this report is only as correct as
that array is kept in sync with the actual `Voyage` collection. This
report does not verify that sync — it simply trusts the field.

---

# Revenue Calculations

## Layer 2 (operational Booking)
```js
Booking.aggregate([
  { $match: { voyageId: { $in: voyageIds }, isDeleted: false, status: { $ne: 'Cancelled' } } },
  { $group: { _id: null, totalRevenue: { $sum: '$totalFreight' }, bookingCount: { $sum: 1 }, totalQty: { $sum: '$quantity' } } },
])
```
- **Formula:** sum of `Booking.totalFreight` across every voyage in the
  round, for every booking whose status is not `Cancelled` — Pending,
  Confirmed, and Final Loading all count.
- **Business rule:** matches the same "all non-Cancelled statuses count
  toward revenue" convention seen elsewhere in the reports layer (not
  the stricter "Final Loading only" rule used by Booking Revenue
  Details / Agent Financial Account — this report predates that
  distinction and has never been reconciled against it; see the earlier
  Reports architecture audit for the full cross-module comparison).
- **`totalQty: { $sum: '$quantity' }`** — `quantity` does not exist on
  the current `Booking` schema (removed Sprint 025/026). This
  contributes `0` silently. Computed but **never returned in the final
  response object** (confirmed: the function's return statement, lines
  114-137, does not include `totalQty`/`rev.totalQty` anywhere) —
  meaning this is dead computation with no visible symptom, unlike the
  same dead field elsewhere in the Reports module where it does surface
  as a wrong number on screen.

## Layer 1 (ManualBooking)
```js
ManualBooking.aggregate([
  { $match: { voyageId: { $in: voyageIds }, isDeleted: false, status: { $ne: 'Cancelled' } } },
  { $group: { _id: null, totalRevenue: { $sum: '$totalFreight' }, totalUnits: { $sum: '$totalUnits' }, count: { $sum: 1 } } },
])
```
- **Formula:** sum of `ManualBooking.totalFreight` across the same
  voyage set, same Cancelled-exclusion rule. `totalUnits` is a real,
  correct field on this model (unlike Layer 2's dead `quantity`) — it
  IS computed here but, like `totalQty` above, **never appears in the
  response** (`manualTotalUnits` is set in the return object, line 130,
  but is not rendered anywhere in `RoundPnlReport.jsx`).

## Combined
```js
totalRevenue: rev.totalRevenue + l1.totalRevenue
l2Revenue:    rev.totalRevenue
l1Revenue:    l1.totalRevenue
```
Both layers are summed into one `totalRevenue` figure. This dual-layer
combination has existed since **Sprint 023** — predating Sprint 032's
Vessel Stats work and Sprint 034's Booking Report work, both of which
are usually cited as when dual-layer revenue was "introduced" to the
reports layer. Round P&L got there first; it just was never held up as
the reference pattern for the others at the time.

---

# Expense Calculations

```js
Expense.aggregate([
  { $match: { $or: [ { roundId: toObjId(roundId) }, { voyageId: { $in: voyageIds } } ] } },
  { $lookup: { from: 'expensetypes', localField: 'expenseTypeId', foreignField: '_id', as: 'expenseType' } },
  { $unwind: { path: '$expenseType', preserveNullAndEmptyArrays: true } },
  { $group: { _id: { category: '$expenseType.category', currency: '$currency' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  { $sort: { '_id.category': 1, '_id.currency': 1 } },
])
```
- **Formula:** every `Expense` document that is EITHER linked directly
  to this `roundId` OR linked to any `voyageId` inside this round's
  `voyageIds` array — this is the one place in the codebase that
  correctly reconciles the Expense module's Round-XOR-Voyage split back
  into "everything belonging to this round" (confirmed in the companion
  Expense module analysis as the most complete integration point that
  module has).
- **Grouping key:** `(category, currency)` — a two-dimensional group,
  never per-voyage, never per-expense-type-name (only the type's
  `category` label survives into the group key; two different expense
  *types* sharing one category are merged into a single row here).
- **No status/lifecycle filter** — since `Expense` has no status field
  at all (per the Expense module analysis), every expense ever recorded
  against this round or its voyages counts, unconditionally, with no
  way to exclude a pending/unapproved/disputed entry (because no such
  state exists to exclude).
- **Currency handling:** `expenseTotals` (a per-currency sum across all
  categories) and `expenseBreakdown` (per category+currency) are both
  produced; **no currency conversion of any kind** — figures in
  different currencies are never combined into one number, only shown
  side by side.

---

# Relationships

## With Round
**Direct and required** — `roundId` is the report's sole required input
parameter; the entire report is scoped to exactly one Round document.
The round's own `startDate`/`endDate`/`status`/`serviceId`/`vesselId`
are surfaced as display labels only, never used in any calculation
(e.g. the round's date range does not constrain which expenses/bookings
are included — inclusion is purely by `voyageIds` membership, not by
date).

## With Voyage
**Indirect, via `Round.voyageIds` only** — the report never queries the
`Voyage` collection directly. It has no per-voyage breakdown: revenue
and expenses for every voyage in the round are aggregated into single,
round-wide totals. `voyageCount` (the only voyage-related number in the
response) is simply `voyageIds.length` — a count, not a list, not a
per-voyage figure.

## With Booking (Layer 2)
**Direct, revenue-only** — `Booking.totalFreight`, filtered to the
round's voyages, non-Cancelled. No relationship to Booking's other
fields (container, agent, commodity, etc.) — this report only ever asks
"how much freight," never "from whom" or "what cargo."

## With Expense
**Direct, both link types** — see Expense Calculations above. This is
the deepest integration this report has with any single collection
(two lookup dimensions — category and currency — versus Booking's flat
sum).

---

# Current Filtering Options

**Exactly one filter: `roundId`.** No date range, no currency filter, no
category filter, no agent filter, no status filter (there is no status
to filter by, on either the Booking or Expense side, beyond the
hard-coded Cancelled-exclusion baked into the revenue aggregates). The
frontend's only control is the Round dropdown itself
(`RoundPnlReport.jsx` lines 104-118).

---

# Current Grouping Logic

- **Revenue:** no grouping at all — a single combined number per layer,
  then summed. Not grouped by voyage, agent, commodity, or service.
- **Expense:** grouped by `(expenseType.category, currency)` — the only
  grouping dimension anywhere in this report.
- **No grouping by Voyage** anywhere in either calculation — this is the
  direct technical cause of the "no per-voyage profitability" gap named
  in the Executive Summary.

---

# Current Totals & Summary Calculations

Rendered in `RoundPnlReport.jsx`:

| Displayed | Source | Formula |
|---|---|---|
| Total Revenue | `data.totalRevenue` | L1 + L2 combined freight (see above) |
| Total Expenses | computed client-side, line 92 | `Object.values(data.expenseTotals).reduce((a,b) => a+b, 0)` — **sums across all currencies as if they were one currency**, see Gap Analysis |
| Net P&L | computed client-side, line 93 | `data.totalRevenue - totalExpenses` — **same cross-currency summation problem inherited** |
| Bookings | `data.bookingCount` | Layer 2 count only (Layer 1's `manualBookingCount` is returned by the API but never rendered) |
| Voyages | `data.voyageCount` | `round.voyageIds.length` |
| Total Units | `data.totalQuantity` | Layer 2's dead `quantity` field — always renders `0` (`RoundPnlReport.jsx` line 166) |
| Total Expenses (per currency) | `data.expenseTotals` entries | one stat card per distinct currency, correctly kept separate |
| Expense Breakdown table | `data.expenseBreakdown` | one row per `(category, currency)` group |
| P&L bar chart | `data.expenseBreakdown` + `data.totalRevenue` | one bar for revenue, one bar per expense category — **mixes currencies on one chart axis with no relabeling**, since the chart has no awareness that `expenseBreakdown` entries can carry different currencies (see Gap Analysis) |

---

# Calculation Analysis — Every KPI

| KPI | Source collection(s) | Business rule | Formula | Dependencies |
|---|---|---|---|---|
| Total Revenue | Booking, ManualBooking | Non-Cancelled bookings on the round's voyages count as revenue, both layers | `sum(Booking.totalFreight) + sum(ManualBooking.totalFreight)`, `status != Cancelled` | `Round.voyageIds` |
| Total Expenses (per currency) | Expense | Round-linked OR any-of-its-voyages-linked expenses count, unconditionally (no status concept) | `sum(Expense.amount)` grouped by currency | `Round.voyageIds`, Expense's Round-XOR-Voyage link |
| Net P&L | derived | Simple subtraction | `Total Revenue − Total Expenses` (client-side; see currency-mixing gap) | Both of the above |
| Bookings (count) | Booking | Layer 2 only, non-Cancelled | `count()` | same match as Total Revenue |
| Voyages (count) | Round | Static, denormalized | `round.voyageIds.length` | `Round.voyageIds` field being accurate |
| Total Units | Booking | Dead field | `sum(Booking.quantity)` — always 0 | N/A (field doesn't exist) |
| Expense Breakdown by Category | Expense, ExpenseType | Category = `ExpenseType.category` string, joined via `$lookup` | `sum(amount)` per `(category, currency)` | `Expense.expenseTypeId` populated correctly |

**Computed but never displayed:** `manualBookingCount`, `manualTotalUnits`,
`l2Revenue`, `l1Revenue` (the split is computed and returned by the API
but the frontend only ever shows the combined `totalRevenue` — a user
cannot currently see "how much of this round's revenue came from Layer 1
vs. Layer 2" even though the backend already has that answer).

---

# Expense Analysis (focused, per the brief)

## Current expense relationships
- **Round-XOR-Voyage reconciliation**: this report is the one place in
  the system that correctly resolves Expense's Round-or-Voyage split
  back into "everything belonging to this round," via `$or: [{ roundId
  }, { voyageId: { $in: voyageIds } }]`.
- **Category, not Expense Type**: the report groups by `ExpenseType.
  category` (a string), never by the specific `ExpenseType.name`. Two
  different expense types sharing a category (e.g. "Port Dues" and
  "Terminal Handling," both categorized "Port Expense") are
  indistinguishable in this report's output — only their combined
  category total is shown.
- **Currency, never converted**: as in every other consumer of Expense
  data in this system, currency is a grouping key, never a conversion
  target.

## Current expense assumptions
- Every expense linked to the round or any of its voyages is "real" and
  should count — no filtering by any lifecycle state, because none
  exists (per the Expense module analysis, Expense has no status field
  at all).
- The round's `voyageIds` array is authoritative and current.
- An expense recorded at any time — before the round starts, long after
  it completes — counts identically; the report has no date-window
  concept that could exclude a stale or premature entry.

## Missing capabilities (Expense side, specific to this report)
- No way to see **which voyage** within the round a given expense
  belongs to in the report's own output (the underlying `Expense`
  document knows, but the aggregate discards it at the `$group` stage).
- No way to see **per-expense-type** detail, only per-category.
- No way to exclude a specific expense from the round total (e.g. a
  disputed or pending-verification cost) — because there's no state
  attribute to exclude on.
- No date-scoping — an expense entered against this round a year after
  it completed is included exactly as if it were entered on day one.

## Current limitations (Expense side)
Directly inherited from the Expense module's own limitations (see
`docs/expense-module-analysis.md`): no lifecycle, no approval, no lock
on completed rounds, hard delete with no audit trail. This report's P&L
figure is therefore only ever as trustworthy as "whatever `Expense`
documents currently exist for this round" — a number that can silently
change after the fact, in either direction, with no record of what
changed or why, since nothing in the Expense module preserves history.

---

# Gap Analysis

Comparing the current implementation against what "the primary business
report for voyage profitability" implies.

| Business requirement (implied by the brief) | Current capability | Gap |
|---|---|---|
| **Voyage-level profitability** | Revenue and expenses are both aggregated at the whole-round level only | **No per-voyage breakdown exists anywhere in this report** — the single largest gap between current implementation and stated future purpose |
| **"Rolling" — a trend across time/multiple rounds** | The report is scoped to exactly one Round, selected manually, one at a time | No multi-round view, no time-series, no comparison between consecutive rounds or periods |
| Reliable expense scoping | Round-XOR-Voyage reconciliation via `$or` | Correct today, but entirely dependent on `Expense`'s current two-option link model — any future expense scope (service-level, administrative, multi-voyage — all identified as missing in the Expense module analysis) would need this report's query to be extended to match |
| Trustworthy, auditable numbers | No lifecycle/approval on Expense; P&L can silently change after the fact | Same risk as documented in the Expense module analysis, inherited directly since this report has no additional safeguard of its own |
| Multi-currency P&L | Currency kept separate everywhere **except** the frontend's client-side "Total Expenses" and "Net P&L" calculations | **Legacy assumption / active bug-shaped gap**: `RoundPnlReport.jsx` sums `expenseTotals` across all currencies into one number and subtracts it from `totalRevenue` as if both were the same currency — the one place in this report where the otherwise-consistent "never combine currencies" rule is silently broken |
| Category-level expense detail | Grouped by category only | No expense-type-level detail, no per-voyage expense detail |
| Consistency with other revenue definitions in the system | Non-Cancelled bookings count as revenue (Pending + Confirmed + Final Loading) | Differs from Booking Revenue Details / Agent Financial Account's stricter "Final Loading only" rule — not necessarily wrong for a P&L (arguably a P&L *should* reflect committed-but-not-yet-final-loaded business too), but the difference has never been explicitly reconciled or documented as intentional anywhere in the codebase |
| Dead/legacy fields | `totalQty`/`quantity` computed on the Layer 2 revenue aggregate | Dead since Sprint 025/026, silently discarded before reaching the response — lower severity than the same field elsewhere (it's not even rendered), but confirms the pattern is still present in this function too |
| Data returned but unused | `manualBookingCount`, `manualTotalUnits`, `l1Revenue`, `l2Revenue` | The backend already computes a Layer 1 vs. Layer 2 revenue split; the frontend discards it, showing only the combined figure |
| `Round.voyageIds` integrity | Report trusts this denormalized array without verification | If this array is ever out of sync with the actual `Voyage` collection, every number in this report is silently wrong, with no cross-check anywhere in this code path |

---

This document is for architecture review only. No code was written or
modified, no schema was proposed, and no sprint was created. Both the
Expense module redesign and any redesign of this report into an actual
rolling, voyage-level P&L are explicitly deferred to separate planning
conversations.
