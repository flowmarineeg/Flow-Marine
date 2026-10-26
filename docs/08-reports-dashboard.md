# 08 — Reports & Dashboard

Modules `reports`, `dashboard`, `capacity`. Routes `/reports/*` (perm `reports`, one gate for all via `router.use(rbac('reports'))`), `/dashboard/*` (perm `dashboard`; the UI shows it to SuperAdmin by role identity `user.roleId.isSystem`, not by permission). UI: `/reports` hub + one page each, `/dashboard`.

## Revenue definition (system-wide)
**Revenue = Layer 2 `Booking` with `status = 'Final Loading'`** (freight = `totalFreight`). Pending/Confirmed bookings, Layer 1 manual bookings, and invoices are *not* revenue in the reports or dashboard. The accounting ledger (invoices issued) is a separate, currency-aware view exposed as `ledgerPnl` (below). Layer 1 counts toward capacity and the legacy combined figure only.

## Reports
All GET. Report pages use `refetch()` with `enabled:false` (run on button press).

| Route | Function | Params | Returns |
|---|---|---|---|
| `/reports/round-pnl` | `getRoundPnL` (Voyage Profitability) | `roundId` (req), `voyageId?`, `basis?` (`accrual`\|`cash`) | `round`, `scope` (`round`\|`voyage`), `voyages[]` (revenue + per-port voyage cost), `roundLevelVoyageCost[]`, `otherVoyageCost{total, hireRateCost, otherExpenseCost, breakdown}`, `bunkerCost` (always null), `summary{totalRevenue, totalVoyageCost, totalOtherVoyageCost, netProfit, totalTEU, profitPerTEU, profitMarginPct}`, plus legacy fields, plus `ledgerPnl` when `basis` given |
| `/reports/voyage-performance` | `getVoyagePerformance` | `voyageId, serviceId, roundId, status, dateFrom, dateTo, bookingSource` (`L1`\|`L2`\|`combined`), `bookingStatus` (`all` or a booking status) | `rows[]` per voyage (counts, freight, units, `layer1`, `layer2`), `totals` |
| `/reports/bookings` | `getBookingReport` | `voyageId, agentId, status, dateFrom, dateTo, serviceId, page, limit` | merged L1+L2 rows tagged `layer` (`Operational`\|`Manual`), paginated in JS, `summary` |
| `/reports/revenue` | `getRevenueReport` | `serviceId, dateFrom, dateTo` (on voyage ETD) | per-service `voyageCount, bookingCount, totalRevenue` (Final Loading only), `grandTotal` |
| `/reports/expenses` | `getExpenseReport` | `category, expenseTypeId, roundId, voyageId, portId, dateFrom, dateTo, currency` | rows with derived `scope`, `summary` by category×currency, `classificationSummary` by cost class×currency |
| `/reports/round-capacity` | `getRoundCapacityReport` | `roundId` (req), `statuses?` (comma list of Pending/Confirmed/Final Loading) | capacity engine payload ([03](03-rounds-voyages.md#capacity-engine)) |
| `/reports/booking-revenue-details` | `getBookingRevenueDetails` | `agentId, voyageId, roundId, dateFrom, dateTo` | Final Loading bookings grouped into pricing groups (rate/size bucket/POL-POD) with count, TEU, VGM (MT), revenue; **not limited** (grouping needs the full set) |

### Voyage Profitability rules (`getRoundPnL`)
- Voyages resolved with `Voyage.find({roundId})`, never `Round.voyageIds`.
- **Voyage Cost** = expenses whose category has `costClassification = 'Voyage Cost'`, broken out per voyage and per port (Port-scope expenses carry `portId`); round-scope Voyage-Cost expenses go to `roundLevelVoyageCost`.
- **Other Voyage Cost** = all other classifications, aggregated by scope only (one round-wide or voyage-wide total), never per voyage.
- Classification always comes from `ExpenseCategory.costClassification` through `expenseTypeService.getCostClassificationMap()` — never a hard-coded category name.
- `Hire Rate` expense type contributes `amount × voyage duration (days)` instead of its raw amount.
- `netProfit = revenue − voyageCost − otherVoyageCost`; margin and profit/TEU derived. Revenue per voyage includes TEU (from container size) and VGM in MT.
- **Currency:** the profitability figures use base-currency (USD) expenses only. Expenses in other currencies are left out and returned in `summary.excludedExpenses` (`{CUR: amount}`); `summary.currency` names the base (audit F-04, fixed 2026-10-25). The UI does not show `excludedExpenses` yet.
- A dead `$sum:'$quantity'` in the legacy block is kept on purpose.
- `ledgerPnl` (when `basis` supplied) reuses `partnerSettlement` `roundLines` + `computeProfit` in USD: Accrual = revenue(4xxx) − expenses(5xxx); Cash = accrual profit − receivable outstanding + payable outstanding. Voyage scope only includes ledger lines tagged to that voyage.

### Consistency notes
Dashboard, Revenue Report, Booking Revenue Details and Voyage Profitability all use Final Loading Layer 2 for revenue. `getVesselStats` (vessel detail page) uses the older "non-Cancelled, L1+L2" total and is the one exception.

## Dashboard (`/dashboard`)
| Route | Returns | Cache |
|---|---|---|
| `GET /dashboard/stats` | KPI counts (active vessels; active/planned/completed rounds; total/active voyages; bookings by status; active agents; draft/overdue/paid invoices), Final-Loading revenue aggregates (last 30 days, 6-month trend, by service), status distributions, Layer 1 counts, recent activity | 90 s (`CACHE_KEY`) |
| `GET /dashboard/fleet-utilisation` | per Active round: vessel, `peakOnboardTEU`, `peakPct`, `totalLoadedTEU`, `voyageCount`, raw `warnings[]`, per-voyage `utilisationPct`, colour tag; computed from the capacity engine (failed rounds skipped) | engine cache 60 s |
`/dashboard/port-activity` and `/dashboard/missing-final-loading` do **not** exist (404). The "overdue invoices" KPI uses `overdueMatch` (past due + open balance), not the lagging stored status (audit F-06, fixed 2026-10-25).

## Frontend
`frontend/src/modules/reports/*` (hub, `ReportLayout`, one component per report, `reportHelpers.jsx` shared formatting) and `modules/dashboard/{sections,widgets}` with a `DashboardFilterContext`. Chart.js is registered selectively.

## Export of report data
Excel/ZIP export lives in `/export` ([09](09-export.md)); the report page buttons call it, plus `GET /round-accounting/rounds/:id/partner-settlement/excel` (perm `reports`) for settlements.
