# System Audit — 2026-10-25

**Scope:** backend `src/` (all modules, middleware, utils) and the documented behaviour in `docs/00–11`. Frontend was inspected only for structure.
**Method:** static code reading of the working tree (branch `version-4`, uncommitted). **No tests were run, no database was touched.** Findings are therefore "what the code does", not observed runtime failures. Each cites the file to re-check.
**Fixes:** F-01…F-11 were fixed in the working tree on 2026-10-25 (see "Fix log" below). **The fixes are code-only: `test:int` has not run and no database was touched**, so they are unverified at runtime.
**Not covered:** frontend logic, dependency advisories (`sharp`, `nodemailer`, `xlsx` known), performance under load, the seed script.

Severity: **High** = can produce wrong money / blocks a core workflow; **Medium** = wrong or misleading result under realistic use; **Low** = hygiene / edge case.

## Summary
| ID | Sev | Area | One line |
|---|---|---|---|
| F-01 | High | Partners / rounds | **Fixed 2026-10-25** — shares now lock only after the vessel's first accounting entry (or a Final settlement; changed again by the master-data sprint), so a vessel can always get shares before money is posted |
| F-02 | High | Ledger / close | **Fixed 2026-10-25** — close checklist blocks (`ROUND_HAS_OTHER_CURRENCY`) when the round has ledger lines outside the settlement currency |
| F-03 | Medium | Invoices | **Fixed 2026-10-25** — invoices are base-currency only (`INVOICE_CURRENCY_UNSUPPORTED`) |
| F-04 | Medium | Reports | **Fixed 2026-10-25** — P&L uses USD expenses; others returned in `summary.excludedExpenses` |
| F-05 | Medium | Expenses | **Fixed 2026-10-25** — `paidByPartnerId` frozen with `paidBy`; amount compared numerically |
| F-06 | Medium | Invoices / dashboard | **Fixed 2026-10-25** — filter and KPI use `overdueMatch` (due date + balance) |
| F-07 | Medium | Import / billing | **Fixed 2026-10-25** — import refused (`BOOKING_INVOICED`) when it would cancel an invoiced booking |
| F-08 | Low | Export | **Fixed 2026-10-25** — mapped to the `bookings` export permission |
| F-09 | Low | RBAC | **Partly fixed 2026-10-25** — modules/actions validated; the grant-escalation policy is unchanged |
| F-10 | Low | Agent accounts | **Fixed 2026-10-25** — `advance` runs in a transaction with `lockAgent` |
| F-11 | Low | Docs/code | **Fixed 2026-10-25** — stale `flag` comments removed, SMTP prod-only; seeded-but-unused accounts left as is |
| F-12 | Info | Quality | **Open** — integration tests not run since V2-only conversion; no frontend tests |

## Findings

### F-01 (High) — FIXED 2026-10-25 — Shares lock can deadlock round closing (lock now only on a Final settlement)
`partner.service.js#assertSharesUnlocked` refuses to set/clear a vessel's partner shares once **any** Round of that vessel has `v2:true` — and `round.service.js#create` always sets `v2:true` and does **not** require shares. `roundClose.service.js#checklist` then raises the blocker `NO_PARTNER_SHARES` if the vessel has none.
**Scenario:** create a vessel, create a round (shares not yet entered), later try to enter shares → `409 VESSEL_SHARES_LOCKED`; later try to close → `NO_PARTNER_SHARES`. No API path resolves it (only direct DB edits).
**Fix options:** require shares before a vessel can get a round, or lock only when a `Final` settlement exists / posted ledger lines exist for that vessel. **Workaround today:** always set shares at vessel setup, before the first round.

### F-02 (High) — FIXED 2026-10-25 (as a guard) — Multi-currency rounds are only partly settled (close now blocked by ROUND_HAS_OTHER_CURRENCY; real multi-currency settlement not built)
`LedgerService.post` stores lines in the **transaction currency**; `fx` is stored on the invoice/entry but nothing converts lines to USD. `partnerSettlement.service.js#roundLines(roundId, currency)` filters `JournalEntryLine` by one currency (default `BASE_CURRENCY`, also hard-coded `'USD'` in `reports.service.js#getRoundPnL` ledger block). `roundClose.close` runs `calculateInner` once for that currency.
**Effect:** invoices or expenses in EUR/AED/… are excluded from profit and from the closing entry, yet the round becomes `Closed` and every further change is refused. Nothing in the checklist warns about non-USD lines.
**Fix options:** checklist blocker/warning "round has lines in currencies other than X", or settle per currency, or convert with the stored `fxRate`.

### F-03 (Medium) — FIXED 2026-10-25 (invoice currency restricted to base) — Invoice currency relabels freight
`Booking.freightRate` has no currency (the discharge list labels it "Rate (USD)"). `invoiceV2.createDraft` builds lines with `toMinor(item.freightRate, currency)` using the *invoice's* currency, so a 1,000 rate invoiced in EUR becomes 1,000.00 EUR with no conversion; `issue` then looks up a rate to compute `baseTotalMinor` as if the amount really were EUR.
**Fix options:** restrict invoice currency to the booking currency (USD) until bookings carry a currency, or add a currency to bookings/BookingItems.

### F-04 (Medium) — FIXED 2026-10-25 (non-base expenses excluded and reported separately) — Mixed-currency expense totals in Voyage Profitability
`reports.service.js#getRoundPnL`: `totalVoyageCost`, `otherVoyageCost` and `netProfit` sum `Expense.amount` regardless of `currency`, while revenue is freight (implicitly USD). The legacy `expenseTotals` is correctly split per currency. The expense report is also per currency.
**Fix options:** filter to USD and surface other currencies separately, or convert using `ExchangeRate`.

### F-05 (Medium) — FIXED 2026-10-25 — Posted expense can change its partner payer
`expense.service.js#update` blocks changes to `amount, currency, expenseTypeId, agentId, expenseDate`, `paidBy` and scope on a posted expense, but not `paidByPartnerId` when `paidBy` stays `Partner`. The ledger credit on `1200` stays on the original partner while the expense now names another, so the settlement (`directMovements` reads ledger lines) and the expense record disagree.
Related nit: the freeze comparison uses `String(newValue) !== String(oldValue)`, so `"100.50"` vs stored `100.5` is treated as a change (spurious 409) if a client sends strings.
**Fix:** add `paidByPartnerId` to the freeze check; compare numerically for `amount`.

### F-06 (Medium) — FIXED 2026-10-25 — Overdue lags in stored status
`billing.logic.deriveStatus` yields `Overdue` lazily and `presentInvoice` applies it only on read. `invoiceV2.list` filters on the **stored** `status`, and `dashboard.service.js` counts `Invoice.countDocuments({status:'Overdue'})`. A past-due open invoice therefore appears Overdue in lists but not under the Overdue filter and not in the dashboard KPI (the stored value is refreshed only when something recalculates the invoice). There is no nightly job.
**Fix options:** nightly/lazy job that persists status; or compute the filter/KPI from `dueDate` and balances.

### F-07 (Medium) — FIXED 2026-10-25 (blocks; no preview warning yet) — Final Loading import vs issued invoices
`bookingImport.service.js#saveImport` (finalLoading) cancels every other booking of the agent in the Round. If such a booking belongs to a **locked BookingItem on an issued V2 invoice**, the code flags the invoice snapshot line (`lineItems.$[].orphaned`) but leaves `InvoiceLine.qty`, totals and ledger untouched, and the item stays locked. The invoice keeps billing a container that is now Cancelled until someone raises a credit note. There is no pre-check or warning at preview time.
**Fix options:** list affected invoices in the preview and require confirmation; or block cancellation of invoiced bookings; make the orphan flag visible on the invoice.

### F-08 (Low) — FIXED 2026-10-25 — `manualBookings` export unattainable
`export.routes.js#checkModuleExportPermission` looks up a `Permission` row whose `module` equals the requested name. `manualBookings` is not in `MODULES` (and not a valid `Permission.module` enum value), so only SuperAdmin can export it.
**Fix:** map `manualBookings` → `bookings` in the check.

### F-09 (Low) — PARTLY FIXED 2026-10-25 (validation yes, grant restriction no) — Permission save is loosely validated
`permission.service.js#saveByRoleId` uses `bulkWrite` with `upsert` and does not run validators, so an unknown `module` string can be persisted (the enum is not enforced on this path), and nothing checks the caller's own privileges against what they grant. A `roles:update` holder can give any *other* role full money permissions (`notOwnRole` only blocks editing one's own role).
**Fix:** validate `module ∈ MODULES` and drop unknown actions; consider restricting grants to a subset of the caller's own.

### F-10 (Low) — FIXED 2026-10-25 — `advance()` skips `lockAgent`
Hard rule: all agent cash paths lock. `advance`, `payAgent`, `returnAdvance` and netting call `lockAgent`, **except `advance`** (`agentAccounts.service.js`). It posts a debit to `1110` without reading a balance, so the practical risk is low, but it breaks the rule/consistency.

### F-11 (Low) — FIXED 2026-10-25 — Documentation drift found and corrected
- Old CLAUDE.md said voyages can go "any → Cancelled". Code: `Arrived` can only go to `Completed` (cannot be Cancelled) — `voyage.service.js` STATUS_TRANSITIONS.
- `utils/dependents.js` comments still mention feature `flag`s that no longer exist.
- `Account` codes 1300, 2100, 2300, 4100, 5990 are seeded but never posted to.
- `config/env.js` makes `SMTP_EMAIL`/`SMTP_APP_PASSWORD` mandatory at boot even for local dev without email.

### F-12 (Info) — Verification gap
`npm run test:int` has not run since the V2-only conversion; money paths (transactions, partial indexes, concurrency) are exercised only by the 2026-10-24 seed against Atlas. There are no frontend tests. The working tree is uncommitted.

## Fix log (2026-10-25)
All changes are in the uncommitted working tree. Status: **fixed in code, not yet verified by `npm run test:int`**.

| ID | Status | What changed | Files |
|---|---|---|---|
| F-01 | Fixed | `assertSharesUnlocked` no longer looks at `Round.v2`; shares lock only when a `Final` PartnerSettlement exists for the vessel. Integration assertions updated (open v2 round does not lock; Final settlement does). | `partners/partner.service.js`, `test/int/audit-fixes.int.test.js`, `test/int/v2.int.test.js` |
| F-02 | Fixed (guard) | `checklist(roundId, session, currency)` adds hard blocker `ROUND_HAS_OTHER_CURRENCY` when the round has journal lines whose currency differs from the settlement currency; `close` passes its currency. Settlement is still single-currency — no conversion built. | `partnerSettlement/roundClose.service.js` |
| F-03 | Fixed (restriction) | `assertInvoiceCurrency`: draft create and draft currency edit accept only the base currency (`400 INVOICE_CURRENCY_UNSUPPORTED`). | `billing/invoiceV2.service.js` |
| F-04 | Fixed | `getRoundPnL` counts only base-currency expenses in voyage cost, other voyage cost, net profit and margin; other currencies returned in `summary.excludedExpenses`, plus `summary.currency`. UI does not display it yet. | `reports/reports.service.js` |
| F-05 | Fixed | Posted-expense freeze now includes `paidByPartnerId`; `amount` compared numerically. | `expenses/expense.service.js` |
| F-06 | Fixed | New `billing.logic.overdueMatch(now)` (v2, not credit note, open status, past due, balance > 0). Invoice list `status=Overdue` uses it; Issued / Partially Paid filters exclude it; dashboard overdue KPI uses it. Stored status is still not persisted by a job. | `billing/billing.logic.js`, `billing/invoiceV2.service.js`, `dashboard/dashboard.service.js` |
| F-07 | Fixed (block) | `saveImport` (finalLoading) pre-checks, before any write, whether a booking that would be cancelled sits on a non-cancelled invoice line not flagged `orphaned`; if so `409 BOOKING_INVOICED` with invoice numbers and containers. Limits: a fully credited invoice still blocks until cancelled; no preview warning. | `bookings/bookingImport.service.js` |
| F-08 | Fixed | `manualBookings` export checks the `bookings` permission row. | `export/export.routes.js` |
| F-09 | Partly fixed | `saveByRoleId` rejects unknown modules (`400 INVALID_MODULE`) and keeps only the 21 known actions as booleans. **Not done:** limiting what a `roles:update` holder may grant (policy decision). | `permissions/permission.service.js` |
| F-10 | Fixed | `advance` runs in a transaction and calls `lockAgent` first. | `agentAccounts/agentAccounts.service.js` |
| F-11 | Fixed | Stale feature-flag comments removed; `SMTP_EMAIL`/`SMTP_APP_PASSWORD` required only in production, mailer warns and `sendMail` throws a clear error when unconfigured. Unused seeded accounts left. | `utils/dependents.js`, `config/env.js`, `utils/mailer.js` |
| F-12 | Open | Needs a local replica set to run `npm run test:int`. No tests were added for the new behaviours (currency blocker, invoice currency, `excludedExpenses`, `overdueMatch`, `BOOKING_INVOICED`, permission validation). | — |

Unit tests (`npm test`, 35) passed after the changes; the touched modules were loaded with `require` to catch syntax/import errors.

## Carried forward from the previous audit (not re-verified here)
Idempotency keys on money endpoints other than netting; partial money-audit (`recordMoneyEvent`) coverage; read-permission exposure of SOA / JV data to anyone with `agents:read` (previously M5); invoice number consumed at draft (M10). See `docs/archive/2026-10-24/audit/` and `sprints/archive/v2-code-audit-2026-10-21.md` for the original wording.

## Things checked and found sound
Ledger write path is single-sourced (`LedgerService.post/reverse`) and models reject update/delete; partial unique indexes (`one_live_line_per_item`, `reversesEntryId`, `pdaExpenseId`) are present; `assertRoundOpenTx` runs inside `post`; auth checks `tokenVersion`; CSRF is stateless HMAC with timing-safe compare; regex inputs go through `escapeRegex`; audit logging is fire-and-forget; booking POL/POD are server-derived; uploads verify magic bytes.

## Suggested order of work
1. Run `npm run test:int` on a local replica set; fix anything the 2026-10-25 changes broke.
2. Add integration tests for: `ROUND_HAS_OTHER_CURRENCY`, `INVOICE_CURRENCY_UNSUPPORTED`, `excludedExpenses`, `overdueMatch`, `BOOKING_INVOICED`, `INVALID_MODULE`, posted-expense payer freeze.
3. Decide F-09 grant policy; optionally add the F-07 preview warning, show `excludedExpenses` in the report UI, and persist Overdue with a nightly job.
4. Real multi-currency (currency on bookings) if ever needed — this would replace the F-02/F-03/F-04 guards.
