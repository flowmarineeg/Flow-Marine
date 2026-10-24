# FLOW Maritime ERP - Version 2 Code Audit

| | |
|---|---|
| **Date** | 2026-10-21 |
| **Scope** | Everything added or changed for Version 2 in Sprints 050-053 (backend, frontend, schemas, routes, tests) |
| **Method** | Source read module by module, then each suspicion tried against a real MongoDB replica set (Docker, disposable database). This audit does NOT reuse the earlier system audits (2026-8-3 / 2026-8-4 / 2026-10-20) or the sprint "verified" claims; where a sprint note and the code disagree, the code wins. |
| **Status of code** | Working tree, uncommitted. At the start of this audit: 36 unit + 55 integration tests passing. After the High fixes (revision 2): 36 unit + 63 integration tests passing, frontend builds. |
| **Revision** | **2 (updated after the High fixes).** Revision 1 listed 7 High / 14 Medium / 10 Low open. See section 12 for the current open list and the revision history. |

---

## 1. Verdict

Version 2's core is sound: the ledger is balanced and append-only, money is exact integer arithmetic, double billing and over-payment are blocked by database-level guarantees, and the settlement figures reproduce the proposal's examples to the cent. The audit found 7 High, 14 Medium and 10 Low findings; twelve were reproduced with a probe, not just read. The High items were about *what happens around the core*: freezing a closed Round, concurrent cash movements, deletions, and the rollback plan.

**Current state (revision 2): all 7 High findings are FIXED and regression-tested; 1 Medium is fixed (M14), 1 is partly fixed (M4); 12 Medium and 10 Low remain open; 6 new low-severity observations came out of the fixes (section 12).** The remaining Medium items must still be worked before cutover, and the database/migration rehearsal (Sprint 054) has not started, so V2 is still **not ready to go live** - but there is no known High-severity defect left.

| Severity | Found | Fixed | Partly | Open | Meaning |
|---|---|---|---|---|---|
| High | 7 | **7** | 0 | **0** | Can corrupt the books, break the closed-Round freeze, or make cutover/rollback impossible. Fix before any real data. |
| Medium | 14 | 1 (M14) | 1 (M4) | **12** | Wrong or misleading results, missing control, or exposure under normal use. Fix before cutover. |
| Low | 10 | 0 | 0 | **10** | Hygiene, maintainability, polish. |
| New (from the fixes) | 6 | - | - | 6 | See section 12 (all Low/Info). |

`PROBE` = reproduced against a database. `READ` = established from the code only.

---

## 2. What was read (coverage)

| Area | Files read in full |
|---|---|
| Feature flags | `settings/systemSetting.model.js`, `settings.service.js`, `settings.routes.js` |
| Ledger | `ledger/account.model.js`, `accounts.seed.js`, `immutable.js`, `journalEntry.model.js`, `journalEntryLine.model.js`, `ledger.service.js`, `fx.service.js`, `exchangeRate.model.js`, `ledger.routes.js` |
| Money and helpers | `utils/money.js`, `utils/dependents.js`, `utils/moneyAudit.js`, `utils/AppError.js`, `middleware/errorHandler.js` |
| Partners | `partners/partner.model.js`, `vesselPartner.model.js`, `vesselShares.js`, `partner.service.js`, `partner.routes.js`, `partner.validation.js`, vessel routes (share endpoints) |
| Agreements | `agreements/agentAgreement.model.js`, `agentCommission.model.js` |
| Billing | `billing/billing.models.js`, `billing.logic.js`, `bookingItem.service.js`, `invoiceV2.service.js`, `billing.routes.js`; the V2 hooks in `invoices/invoice.service.js`, `payment.service.js`, `invoice.model.js` |
| Expenses | `expenses/expenseV2.service.js` and the V2 edits in `expense.service.js`, `expense.model.js`, `expense.routes.js`, `expense.validation.js` |
| Agent accounts | `agentAccounts/agentAccounts.logic.js`, `agentAccounts.models.js`, `agentAccounts.service.js`, `agentAccounts.routes.js` |
| Partner settlement and closing | `partnerSettlement/partnerSettlement.logic.js`, `.models.js`, `.service.js`, `roundClose.service.js`, `.routes.js`; `rounds/roundLock.js` and every call site |
| Existing code touched | booking, manualBooking, bookingImport, voyage, tracking, round, vessel, agent services (lock/dependents hooks), `permission.model.js/controller.js`, `reports.service.js` (ledger P&L) |
| Frontend | 19 new/changed files: wizard, invoice panel, agent panel, round panel, expense form/actions, partners, settings, vessel panel, sidebar, matrix, money util, five service files |
| Tests | `test/*.test.js` (6 unit files), `test/int/v2.int.test.js`, `test/int/api.int.test.js`, and (added in revision 2) `test/int/audit-fixes.int.test.js` |

**Not audited:** production deployment config (nginx, Atlas settings, backups), the pre-V2 modules except where V2 touches them, and any browser behaviour (no screen was clicked through).

---

## 3. HIGH findings

### V2-H1 - A vessel that already has Rounds can never get partner shares - **FIXED**  `PROBE`
- **Status: FIXED (revision 2).** The shares lock now counts only Rounds created under V2 (`Round.v2`, set when the partners module is on) or a Final partner settlement. Pre-V2 Rounds no longer lock. Share edits are written to the money audit with before/after. Test: H1 in `audit-fixes.int.test.js`; probe P-H now "not reproduced".
- **Where:** `partners/partner.service.js:61-63` (`assertSharesUnlocked` -> `Round.exists({ vesselId })`).
- **What:** The lock "shares are locked after the first Round" counts *any* Round, including every V1 Round. Every vessel in the live system already has Rounds, so `PUT /vessels/:id/partners` returns `VESSEL_SHARES_LOCKED` for all of them.
- **Impact:** With `partners` on, the close checklist blocks every Round (`NO_PARTNER_SHARES`, `roundClose.service.js`), so no existing vessel can ever close a Round. Cutover is impossible without hand-editing the database.
- **Probe:** P-H.
- **Fix:** Count only Rounds created under V2 (a `v2Start`/`closeStatus` marker or a cutover date), and/or give migration (Sprint 054) a controlled "set initial shares" path that logs who set them. Keep the lock for V2 Rounds.

### V2-H2 - Concurrent cash movements overdraw an agent's payable - **FIXED**  `PROBE`
- **Status: FIXED (revision 2).** Pay-agent, advance return and offset take a per-agent write lock inside their transaction (`Agent.ledgerVersion`), so concurrent movements queue. Two simultaneous pays: one succeeds, the other gets `PAYMENT_EXCEEDS_PAYABLE`; pay vs offset never leaves a negative payable. Test: H2; probe P-A2 now "not reproduced". (Idempotency for double-submit is still open as M2.)
- **Where:** `agentAccounts/agentAccounts.service.js:144` (`payAgent`), `:124` (`returnAdvance`), `:164` (`offsetInner`), `:83` (`payableBalance`).
- **What:** The "not above what we owe" check is a read of the ledger followed by a write. Two simultaneous `pay` calls read the same payable and both succeed. Nothing is written to a shared document, so MongoDB's transaction conflict detection never fires.
- **Impact:** Payable goes negative (the agent is paid twice). Same hole for pay vs offset, and for advance returns. (Two simultaneous offsets of the *same* oldest invoice are safe because they collide on that invoice - probe P-A - but offset vs pay, or offsets on different invoices, are not.)
- **Probe:** P-A2: payable 10,000, two pays of 10,000 -> both fulfilled, payable = -10,000.
- **Fix:** Serialise per agent. Take a write lock inside the transaction (`Agent.updateOne({_id}, {$inc:{ledgerVersion:1}}, {session})`) before reading the balance in every agent cash path; add an idempotency key (see V2-M2).

### V2-H3 - An expense can be moved INTO a closed Round - **FIXED**  `PROBE`
- **Status: FIXED (revision 2).** Expense update now asserts the NEW scope is open and a posted expense cannot change round/voyage/port (`EXPENSE_POSTED`). Test: H3; probe P-B now "blocked".
- **Where:** `expenses/expense.service.js:170` (lock checks only the expense's *current* scope) and `:181` (`resolveScopeIds` takes the new `roundId/voyageId` from the request).
- **What:** `update()` asserts the old round is open, then applies a new `roundId`/`voyageId`/`portId` without asserting the new one. Posted expenses also may change scope (scope fields are not in `LOCKED_AFTER_POST`).
- **Impact:** The closed-Round freeze can be bypassed; a posted expense can drift to another Round while its ledger entry stays in the old one.
- **Probe:** P-B: an open-round expense updated to a closed `roundId` succeeded.
- **Fix:** In `update()` also `assertExpenseRoundOpen(newScope)`; add `roundId/voyageId/portId` to the frozen set once posted.

### V2-H4 - The closed-Round lock has holes and is not atomic - **FIXED**  `PROBE` + `READ`
- **Status: FIXED (revision 2).** `LedgerService.post` now checks the Round atomically inside its own transaction by writing `Round.lockVersion`, so a posting and a Round close conflict and one retries. This also covers advances/returns/pay-agent with a `roundId`. Closing entries and partner transfers pass `allowClosed`. Test: H4 (two tests, including a 6-trial close-vs-post race asserting the final settlement equals the ledger); probe P-K now "blocked". (Non-ledger mutations still use the pre-check only - they cannot change settled figures.)
- **Where:** `rounds/roundLock.js` and its call sites.
- **What:**
  1. Cash movements accept a `roundId` but never check it: `advance`, `returnAdvance`, `payAgent` (`agentAccounts.service.js:109/124/144`). **Probe P-K:** an advance was posted into a CLOSED Round.
  2. Every check runs *before* the mutation's transaction. A posting that passes the check just before `close()` commits can still land afterwards, leaving a ledger line in a Round whose settlement is already Final (the shares were computed without it). `READ`.
  3. The lock is a convention: any future mutation that forgets `assertRoundOpen` is unprotected, and nothing fails when it does.
- **Fix:** Check the lock again *inside* the posting transaction and make it a write conflict (touch the Round document in every posting txn so a concurrent close aborts one of them); assert in the three agent cash paths; add a test that walks every V2 mutating route against a closed Round.

### V2-H5 - Posted records can be orphaned by hard delete - **FIXED**  `PROBE`
- **Status: FIXED (revision 2).** `DEPENDENTS` extended for Round, Voyage and Partner (ledger lines, posted expenses, finalised settlements, reserve movements, statements, handling charges, invoiced items, transfers, bank references) and enforced in `deleteVoyage` and `Round.hardDelete`. Draft settlements, suggested transfers and unlocked items are removed with a clean Round. Test: H5; probes P-F, P-I, P-M now "blocked". (Booking, Invoice, Expense, ContainerType, Service and ExpenseType dependents from the proposal table are still only partly covered - tracked in section 12.)
- **Where:** `voyages/voyage.service.js:214` (`deleteVoyage`), `rounds/round.service.js:258` (`hardDelete`), `utils/dependents.js` (only Partner, Vessel, Agent are covered).
- **What / probes:**
  - **P-F:** a voyage carrying a *posted* expense was deleted (guard only looks at bookings).
  - **P-I:** a Round with posted ledger lines (e.g. an advance) was hard-deleted; 2 lines now point at a Round that no longer exists.
  - **P-M:** a Partner referenced by a `PartnerSettlement` was deleted (the dependents list misses settlements, transfers, reserve and settlement-bank references).
- **Impact:** Breaks rule R4 ("a document that has posted to the ledger is never hard-deleted") and leaves dangling ids that make reports and settlements show blanks.
- **Fix:** Extend `DEPENDENTS` for Round, Voyage, Partner, Booking, Invoice, Expense, ContainerType, Service and ExpenseType (ledger lines, settlements, transfers, reserve movements, items/lines); call it from `deleteVoyage` and `Round.hardDelete`.

### V2-H6 - "Roll back by turning the flags off" does not work once V2 invoices exist - **FIXED**  `READ`
- **Status: FIXED (revision 2).** Policy chosen: rollback is possible only BEFORE the first V2 document. The server refuses to switch off `accounting` once ledger entries exist, `v2Invoices` once V2 invoices exist, or `partners` once settlements exist (`FLAG_IN_USE`), and validates flag dependencies both ways (`FLAG_DEPENDENCY`). Only the creation endpoints of billing are flag-gated; settle/void/cancel/notes stay available. Test: H6. **Decision needed from you:** confirm "one-way after first document" (see section 9).
- **Where:** `billing/billing.routes.js:23` (`router.use(auth, requireFlag('v2Invoices'))`), `invoices/payment.service.js` (V1 payment refused on V2 invoices), `partnerSettlement/roundClose.service.js:123` (`reopen` needs `accounting`).
- **What:** Turning `v2Invoices` off hides *all* V2 invoice endpoints, including settlements, while V1 payments are refused for V2 invoices (`USE_SETTLEMENTS`). Open V2 invoices can then not be paid at all. With `accounting` off, a Closed Round cannot be reopened (and stays locked).
- **Impact:** The Sprint 054 switch-on plan promises a safe rollback; after the first real V2 invoice it is not safe.
- **Fix:** Gate only *creation* paths by flag; always allow read, settlement, void and reopen for documents that already exist. Or define rollback as "freeze V2" and document that it is one-way once documents exist.

### V2-H7 - Commission cannot be seen, cancelled or paid, and survives invoice cancellation - **FIXED**  `PROBE`
- **Status: FIXED (revision 2).** Commission list and cancel (reason required, ledger reversal, money audit) behind the new `agents:commission` permission; commission tab on the agent page; matrix column; invoice cancel can opt in to cancelling its commission (default still keeps it, per spec R7). Test: H7. Probe P-J still shows the default behaviour, by design. ("Pay" is still done through Pay Agent / netting; the `Paid` status is unused - see N5.)
- **Where:** `billing/invoiceV2.service.js:221` (`accrueCommission`), no commission routes anywhere (`AgentCommission` is only written, never exposed).
- **What:** Commission accrues to Agent Payable at issue; cancelling the invoice deliberately leaves it (per spec). There is no endpoint or screen to list, adjust, cancel or pay a commission row, and the `commission.manage` permission from the proposal does not exist.
- **Probe:** P-J: invoice issued then cancelled -> commission row still `Accrued`.
- **Impact:** A wrong or abandoned invoice creates a payable that only a database edit can remove; agent statements will show it forever.
- **Fix:** Commission list/cancel/adjust API with a `commission` permission and reason, ledger-reversing; decide (and document) whether cancelling an invoice should offer to cancel its commission.

---

## 4. MEDIUM findings

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| V2-M1 `PROBE` | **Item sync race.** Concurrent `listEligible`/sync calls both try to create the same `BookingItem`; the loser gets E11000. 3 of 4 simultaneous calls failed (surfaced as a 409 "already exists"). | `billing/bookingItem.service.js:52`; probe P-C | Upsert (`findOneAndUpdate` with `upsert`) or catch duplicate-key and re-read; serialise sync per voyage. |
| V2-M2 `PROBE` | **No idempotency on money posts.** The same settlement submitted twice is accepted twice; same for pay-agent, advance, partner transfer pay. Only netting has a batch id. | `invoiceV2.service.js:285`; probe P-G | Client-generated idempotency key, unique per (invoice, key). |
| V2-M3 `PROBE` | **Overdue is only lazy.** An invoice that becomes overdue after issue reads as Overdue but is stored `Issued`, so `?status=Overdue`, any dashboard or report filtering on status misses it. | `billing.logic.js:50`, `invoice.service.js:64`; probe P-E2 | Translate the status filter to the derived rule, or add the small scheduled/lazy persist the plan allowed. |
| V2-M4 `READ` **PARTLY FIXED** | **Audit coverage is partial.** `recordMoneyEvent` (before/after/reason, failures too) is used only for round close/reopen/ready, partner transfers and reserve use. Invoice issue/cancel/notes, settlements and voids, expense post/reverse, offsets, pay-agent, advances and flag changes use only the generic success-only middleware. | `grep recordMoneyEvent`: 10 call sites, all in `partnerSettlement/` (revision 2 adds vessel share changes and commission cancel; invoice/settlement/netting/pay/expense events are still missing) | Call it from every money service entry and catch block. |
| V2-M5 `READ` | **Wrong read permissions.** Partner profit shares and positions are served under `rounds:read` (`partnerSettlement.routes.js:43`); the JV reserve under `vessels:read` (`:85`); agent SOA, handling charges and commission/fee agreements under plain `agents:read`. A Viewer or Operations role can read the JV's profit split and each agent's commission terms. | route table in section 7 | Require `partners:read` / `ledger:read` or a new `finance` read on these endpoints. |
| V2-M6 `READ` | **Multi-currency is half-built.** Ledger lines keep their currency, but the Round P&L (`reports.service.js:316-323`), partner settlement, agent SOA and statements are USD-only and silently ignore other currencies; the trial balance has no base-currency total; `baseTotalMinor` is stored on the invoice and used nowhere. Decision D11 (which currencies) is still unanswered. | `reports.service.js:321`, `agentAccounts.service.js` default currency | Decide D11. If USD only: reject other currencies at issue. If not: consolidate through `fxRate`. |
| V2-M7 `READ` | **"Agreed" is not enforced.** A statement is a snapshot at build time; settle recomputes and runs the offset on live ledger data without checking the net still equals the agreed net. | `agentAccounts.service.js:280, 307` | Store the ledger high-water mark; refuse settle if net changed (`STATEMENT_STALE`). |
| V2-M8 `READ` | **Handling charges priced from today's agreement, for the booking's agent.** The agreement is chosen by `new Date()`, not the Round's dates, so a later agreement reprices history; overlapping agreements and duplicate fee rows are allowed (first match wins); and the fee is charged to `booking.agentId`, whereas the work is done by the port agent. | `agentAccounts.service.js:227-229` | Select by Round date; validate non-overlap/uniqueness; add an agent-per-port mapping (confirm business rule). |
| V2-M9 `READ` | **Partner cash outside a Round is invisible.** `payAgent`/`advance` from a partner's bank with no `roundId` never reach any Round's settlement (`roundLines` filters by `roundId`), so that partner is out of pocket. | `partnerSettlement.service.js:28,44` | Require `roundId` when the bank is a partner, or reconcile unassigned partner cash at close. |
| V2-M10 `READ` | **Invoice numbers are assigned at draft creation**, so deleting a draft leaves a gap in the sequence (many jurisdictions require gap-free invoice numbers). | `invoiceV2.service.js:101` | Number at issue (the plan said so); keep a draft reference until then. |
| V2-M11 `READ` | **Performance on large data.** `createDraft` builds one snapshot per booking with two queries each (N+1, `invoiceV2.service.js:95`, `invoice.service.js:179`); SOA loads every ledger line and every entry in memory (`agentAccounts.service.js:60-94`); `roundLines` loads a whole Round. Fine for tens of containers, slow for thousands. | as listed | Batch-load voyages/rounds; paginate SOA and use aggregation. |
| V2-M12 `READ` | **Weak input checks on settlements.** A partner bank id is accepted without checking the partner exists or is Active; the date may be in the future or before the invoice. | `invoiceV2.service.js:293` | Validate partner and date. |
| V2-M13 `READ` | **Reserve movements can dangle.** Deleting an expense that was funded from the reserve leaves the `Use` movement pointing at nothing and the reserve permanently lower. | `partnerSettlement.service.js:195`, `expense.service` delete | Block deleting `fundedFromReserve` expenses (or reverse the Use). |
| V2-M14 `READ` **FIXED** | **No mismatch guard between flags.** `accounting` can be switched off while `v2Invoices`/`settlement` stay on, leaving screens that fail with `FEATURE_DISABLED` mid-workflow; flags are one flat map with no dependency check. | `settings.service.js:33` | **Fixed with H6:** `REQUIRES` map validated on every change (`FLAG_DEPENDENCY`). |

---

## 5. LOW findings

| ID | Finding | Evidence |
|---|---|---|
| V2-L1 `PROBE` | The error handler echoes any string `err.code` (e.g. a system code like `ECONNRESET`) to the client. Only codes from `AppError` should be exposed. `middleware/errorHandler.js:62`; probe P-N. |
| V2-L2 `READ` | Hard-coded account codes in 21 places and `'USD'` in 28 places; a chart change means a multi-file edit. Centralise in one constants module. |
| V2-L3 `READ` | Journal numbers come from `nextNumber('journal')` outside the transaction, so a rolled-back post burns a number (gaps in `JE-`). `ledger.service.js` post. |
| V2-L4 `READ` | Immutability is enforced by Mongoose hooks only. `bulkWrite`, `Model.collection.*` and direct database access bypass it (and `reverse()` itself uses the raw collection to flip `status`). No hash chain or DB-side protection. `ledger/immutable.js`, `ledger.service.js:140`. |
| V2-L5 `READ` | `BookingItem` rows are never cleaned when a Voyage or Round is deleted (orphans). |
| V2-L6 `READ` | Inactive partners can be added to vessel shares. |
| V2-L7 `READ` | Settings flag update is read-modify-write (two admins can overwrite each other) and the flag cache is per process (30 s lag across instances). `settings.service.js:20,33`. |
| V2-L8 `READ` | Frontend: dates default from `toISOString()` (UTC; off by a day near midnight in other time zones); currency hard-coded `USD` in the agent and Round panels; V2 invoices have no Bill-To editor; the permission matrix now has 17 columns (very wide); the Partners page shows New/Edit using create/update while the API needs `partners:manage`. |
| V2-L9 `READ` | No rate limiting on money endpoints (only auth routes are limited). |
| V2-L10 `READ` | Developer setup: V2 needs a replica set for transactions; a plain local `mongod` fails on the first `withTransaction`. Documented only in `CLAUDE.md`. |

---

## 6. Module-by-module results

### 6.1 Feature flags (`settings`)
- OK: defaults all `false` (test); `requireFlag` returns 403 `FEATURE_DISABLED` with a stable code; PUT needs `settings:manage`; unknown/non-boolean values rejected (API test).
- Findings: ~~V2-H6~~ fixed, ~~V2-M14~~ fixed, V2-L7 open. Revision 2: dependencies and in-use guards added; tested in `audit-fixes` H6.

### 6.2 Ledger (`ledger`)
- OK: one write path (`post`), balanced per currency in integer minor units, all-or-nothing in a transaction, inactive/unknown account refused, update/delete refused by hooks, reversal mirrors lines and a unique partial index makes double reversal impossible (concurrent test: exactly one wins), trial balance balanced throughout all tests.
- Findings: V2-L2, V2-L3, V2-L4, V2-M6 (no base-currency consolidation).

### 6.3 Money (`utils/money.js`, frontend `money.js`)
- OK: parses decimal text (no float noise: `0.1+0.2` -> 30), per-currency decimals, half-up at the scale, `allocate` never loses a cent (500 random cases), `Number.isSafeInteger` guard in schemas.
- Note: JPY/KWD scales are tested; unknown currencies default to 2 decimals silently.

### 6.4 Partners and vessel shares
- OK: shares in basis points, total 10,000, exactly one lead (service + partial unique index), duplicate partner refused, locked after Rounds, atomic replace in a transaction, partner delete blocked while shares exist.
- Findings: ~~V2-H1~~ and ~~V2-H5 (partner references)~~ fixed in revision 2; V2-L6 open, `assertSharesUnlocked` is check-then-act (a Round created in the gap defeats the lock, Low).

### 6.5 Agreements and commission
- OK: integer minor amounts, bp percentage, explicit field whitelist on save.
- Findings: ~~V2-H7~~ fixed in revision 2 (list/cancel/permission); V2-M8 open; accrual for basis `FinalLoading` happens at issue (sprint note), commission has no unique index per (invoice, agreement) - idempotent today only because issue is a one-time state change.

### 6.6 Billing (items, drafts, issue, cancel, settlements, notes)
- OK (all proven): items group by party+voyage+type+rate; one live invoice line per item enforced by the database (two simultaneous drafts -> exactly one wins); issue is a conditional claim (two simultaneous issues -> one wins); issued invoices locked, even against `invoices:override`; over-payment guard is part of the update filter (two simultaneous payments cannot both fit); cancel nets the ledger to zero and frees items; credit note capped at the open balance; V1 creation closed while V2 is on; V1 update/delete refused on V2 invoices; V2 invoices also appear in V1's claim check (their line snapshots), so a booking cannot be billed on both rails.
- Findings: V2-M1, V2-M2, V2-M3, V2-M10, V2-M11, V2-M12 open; ~~V2-H6~~ and ~~V2-H7~~ fixed in revision 2. No refund / credit-balance flow exists (an overpayment cannot be recorded at all - `Unapplied Receipts 2300` is unused).

### 6.7 Expenses (PDA/FDA, posting)
- OK: PDA never posts; one FDA per PDA (unique partial index); FDA posts once even when posted concurrently; credit side follows `paidBy`; posted expense amount/type/agent/date/currency/paid-by frozen and not deletable; reverse -> edit -> repost works.
- Findings: ~~V2-H3~~ fixed in revision 2; V2-M13, V2-M6 (non-USD expenses vanish from profit) open. Convert does not copy the attachment (Low).

### 6.8 Agent accounts (SOA, netting, pay, advances, handling, statements)
- OK: SOA is a query over the ledger; netting is idempotent per batch id and reversible; Direct Line refused; offset skips closed-Round invoices; handling charges idempotent per (booking, move) by unique index; settlement net equals the ledger position.
- Findings: ~~V2-H2~~ and ~~V2-H4~~ fixed in revision 2; V2-M7, V2-M8, V2-M9, V2-M11 open.

### 6.9 Partner settlement, reserve and Round closing
- OK: profit/shares/transfers reproduce the proposal's three examples to the cent from both pure functions and real ledger lines; transfers settle every partner account to exactly zero; close is one transaction and rolls back on any blocker; reopen reverses the closing entry and refuses with paid transfers; carry-forward reserve held and usable; override needs both permission and a written reason (HTTP-tested); refusals and overrides audited.
- Findings: ~~V2-H4~~ and ~~V2-H5~~ fixed in revision 2; V2-M4 (partly), V2-M5, V2-M9, V2-M13 open. Strict lock also blocks late customer receipts on a closed Round (a decision, see section 9).

### 6.10 Closed-Round lock coverage (verified by reading every call site)
| Covered | Not covered |
|---|---|
| bookings (create/update/delete, both layers), Final Loading + Discharge import, voyages (manual create/update/delete), tracking, expenses (create/update/delete/convert/post/reverse), V1 invoices and payments, V2 draft/issue/cancel/settle/void/notes, handling confirm, statement build/settle, Round update/delete, reserve use | Revision 2: moving an expense into a Round (H3), and advance / return / pay with a `roundId` (H4) are now covered. **Every ledger posting is now checked atomically inside `LedgerService.post`** (so a new posting path cannot forget it). Still convention-only: non-ledger mutations added in future without a pre-check call. |

### 6.11 Permissions and routes
- OK: every V2 route has `auth`; RBAC action per endpoint; new actions (`issue, cancel, record, approve, offset, close, closeOverride, reopen, carryForward, useReserve, manage`) persist through the permissions API and take effect immediately (cache invalidated, API-tested); a role cannot read another role's matrix or edit its own.
- Fixed during this audit window: `PUT /permissions/:roleId` with a malformed body returned 500; now 400.
- Findings: V2-M5, V2-L9.

### 6.12 Frontend
- OK: lint clean on new files, build passes, money parsed/formatted without floats, hooks order fixed, sidebar entries flag-gated.
- Findings: V2-L8. Never exercised in a browser.

### 6.13 Tests
- 36 unit, 30 service-level and 25 HTTP integration tests, all passing; integration tests refuse Atlas and drop their database.
- Revision 2: 8 regression tests (`audit-fixes.int.test.js`) now cover every High finding, including a close-vs-posting race; 63 integration tests in total.
- Still gaps: no test that every mutating route respects a closed Round; handling/statement totals not asserted through real services; no frontend tests; no load/concurrency test beyond pairs.

---

## 7. V2 route permission matrix (as built)

| Route | Permission | Flag | Note |
|---|---|---|---|
| `GET /settings/feature-flags` | any signed-in user | - | intended |
| `PUT /settings/feature-flags` | settings:manage | - | |
| `* /partners` | partners:read / manage | partners | |
| `GET,PUT,DELETE /vessels/:id/partners` | vessels:read / partners:manage | partners | |
| `GET /ledger/accounts`, `/exchange-rates` | ledger:read | - | |
| `GET /ledger/trial-balance` | ledger:read | accounting | |
| `PUT /ledger/exchange-rates` | ledger:manage | fx | |
| `GET /invoices-v2/items`, `POST /invoices-v2`, `PUT /invoices-v2/:id` | invoices create/update | v2Invoices | creation only is flag-gated (H6 fix) |
| `POST .../issue, cancel, settlements, void, credit-note, debit-note` | invoices **issue** / **cancel** / **record** | accounting (to post) | stay available for existing documents (H6 fix); cancel accepts `cancelCommission` |
| `POST /expenses/:id/convert-fda, post, reverse` | expenses:approve | accounting | |
| `GET /agent-accounts/:id/soa` | agents:read | agentSoa | M5 |
| `POST .../advance, advance-return, pay, offset, offset/:b/reverse` | agents:offset | netting | H2 |
| `GET .../handling, handling/preview, agreements` | agents:read | - | M5 |
| `GET .../commissions` | agents:read | - | added in revision 2 (H7); M5 applies |
| `POST /agent-accounts/commissions/:id/cancel` | agents:**commission** | accounting | added in revision 2 (H7), audited |
| `POST .../handling/confirm` | agents:offset | accounting | |
| `GET,POST .../statement`, `POST /statements/:id/agree,settle` | agents:read / offset | settlement | |
| `POST,PUT,DELETE .../agreements` | agents:update | - | |
| `GET /round-accounting/rounds/:id/checklist` | rounds:read | - | |
| `POST .../ready, close` / `reopen` | rounds:close / rounds:reopen (+closeOverride, carryForward) | accounting | |
| `GET .../partner-settlement` | **rounds:read** | partners | M5 |
| `POST .../partner-settlement`, `transfers/:id/pay,unpay` | partners:manage | partners | |
| `GET .../partner-settlement/excel` | reports:read | partners | |
| `GET /vessels/:id/reserve` | **vessels:read** | accounting | M5 |
| `POST /reserve/use` | rounds:useReserve | accounting | |

---

## 8. Probe log (all against a throwaway replica-set database)

Scripts: `backend/scripts/audit-probes/probes-1.js` (P-A, B, C, E, F, G, H, I, J, K, L, M, N) and `probes-2.js` (P-A2, P-E2). They connect to `mongodb://localhost:27018/flow_audit_probe`, DROP it, and print one line per probe. Re-run them after each fix: a confirmed probe must flip to "not reproduced".

| Probe | Question | Result (revision 1) | Re-run after the High fixes |
|---|---|---|---|
| P-A | Do two concurrent offsets (different batch ids) double-spend the payable? | **Not reproduced** - both target the oldest invoice and collide; the loser retries and sees the new balance. | not reproduced |
| P-A2 | Two concurrent pay-agent calls on one payable? | **Confirmed** (H2): payable -10,000. | **not reproduced** (second pay refused) |
| P-B | Update an expense into a closed Round? | **Confirmed** (H3). | **blocked** (`ROUND_CLOSED`) |
| P-C | Concurrent item sync? | **Confirmed** (M1): 3 of 4 failed. | still confirmed (M1, open) |
| P-E / P-E2 | Overdue filter? | Not an issue at issue time; **confirmed** for invoices that become overdue later (M3). | P-E2 still confirmed (M3, open) |
| P-F | Delete a voyage with a posted expense? | **Confirmed** (H5). | **blocked** (`HAS_DEPENDENTS`) |
| P-G | Same settlement twice? | **Confirmed** (M2). | still confirmed (M2, open) |
| P-H | Set shares on a vessel that has Rounds? | **Confirmed** (H1). | **not reproduced** (shares saved) |
| P-I | Hard-delete a Round with ledger lines? | **Confirmed** (H5). | **blocked** (`HAS_DEPENDENTS`) |
| P-J | Commission after invoice cancel? | **Confirmed** (H7). | commission kept by default (by design); cancel path now exists |
| P-K | Advance into a closed Round? | **Confirmed** (H4). | **blocked** (`ROUND_CLOSED`) |
| P-L | Credit-note PDF renders? | Renders (2.6 KB), no defect. | unchanged |
| P-M | Delete a partner referenced by a settlement? | **Confirmed** (H5). | **blocked** (`HAS_DEPENDENTS`) |
| P-N | System error code leaked? | **Confirmed** (L1). | still confirmed (L1, open) |

---

## 9. Decisions needed from the business

1. **Late payments after a Round closes** - keep the strict freeze (receipts refused) or exempt settlements?
2. **Which currencies** do you transact in (D11)? Decides whether multi-currency must be finished (M6) or refused.
3. **Rollback policy** (H6) - *implemented as one-way after the first V2 document; confirm or ask for the other option.*
4. **Commission** (H7) - *the cancel path and permission exist; the default is still "invoice cancel keeps commission". Confirm the default and who gets `agents:commission`.*
5. **Handling fees** (M8) - charged to the booking agent or the port agent?
6. **Invoice numbering** (M10) - gap-free numbering required?
7. **Who may see JV profit splits and agent commission terms** (M5)?
8. **Initial partner shares** for existing vessels (H1) - *now possible through the vessel screen (needs `partners:manage`, audited); decide who enters them and who approves.*

---

## 10. Remediation order

| Order | Items | Why first |
|---|---|---|
| 1 | H1, H6 | **DONE (revision 2).** Without these the cutover cannot happen or cannot be undone. |
| 2 | H2, H3, H4 | **DONE (revision 2).** Closing the books and cash correctness. Serialise per agent, re-check the lock inside transactions, close the move/advance holes. Add a "walk every mutating route against a closed Round" test. |
| 3 | H5 | **DONE for Round, Voyage, Partner (revision 2).** Booking, Invoice, Expense, ContainerType, Service, ExpenseType dependents remain. |
| 4 | H7, M2, M4 | H7 **DONE**; M4 partly done; **M2 and the rest of M4 are next.** |
| 5 | M1, M3, M5, M7, M8, M9, M10, M12, M13, M14 | Correctness and exposure fixes. |
| 6 | M6, M11 and Lows | After decisions D11 and volume are known. |

Each fix should come with a test that fails today (the probes in section 8 are ready-made).


## 11. Fix status - HIGH findings (2026-10-21)

All seven High findings are fixed and covered by regression tests in `backend/test/int/audit-fixes.int.test.js`. Re-running the audit probes (now in `backend/scripts/audit-probes/`) shows every High probe flipped to "not reproduced": P-H, P-A2, P-B, P-K, P-F, P-I, P-M. The Medium/Low probes (P-C, P-G, P-E2, P-N) are intentionally still open. P-J still shows a commission surviving an invoice cancel because that is the default by design; the new cancel path is what H7 added.

| ID | Fix | Where |
|---|---|---|
| H1 | Shares lock only for Rounds created under V2 (`Round.v2`, set when the partners module is on) or after a Final partner settlement. Pre-V2 Rounds no longer lock. Share changes are written to the money audit with before/after. | `partner.service.js`, `round.model.js`, `round.service.js`, `vessel.routes.js` |
| H2 | Every agent cash path (pay, advance return, offset) first touches the Agent document inside its transaction (`ledgerVersion`), so concurrent movements queue instead of both reading the same payable. | `agentAccounts.service.js` |
| H3 | Expense update asserts the NEW scope is open, and a posted expense cannot change round, voyage or port. | `expense.service.js` |
| H4 | `LedgerService.post` checks the Round atomically INSIDE its transaction (it writes `Round.lockVersion`), so a posting and a close conflict and one retries. This also covers advances and pay-agent with a roundId. Closing entries and partner transfers pass `allowClosed`. | `ledger.service.js`, `roundLock.js`, `partnerSettlement.service.js` |
| H5 | `DEPENDENTS` extended for Round, Voyage and Partner (ledger lines, posted expenses, finalised settlements, reserve, statements, handling, invoiced items, transfers, bank references) and wired into `deleteVoyage` and `Round.hardDelete`. Draft settlements, suggested transfers and unlocked items are cleaned up with the Round. | `utils/dependents.js`, `voyage.service.js`, `round.service.js` |
| H6 | Policy chosen: rollback is possible only BEFORE the first V2 document. The server refuses to switch off `accounting` once ledger entries exist, `v2Invoices` once V2 invoices exist, or `partners` once settlements exist (`FLAG_IN_USE`), and validates dependencies in both directions (`FLAG_DEPENDENCY`). Only the creation endpoints of billing are flag-gated; settle, void, cancel and notes stay available. | `settings.service.js`, `billing.routes.js` |
| H7 | Commission list and cancel (reason, ledger reversal, money audit) behind the new `agents:commission` permission. An invoice cancel can opt in to cancelling its commission (default keeps it, per spec). Commission tab on the agent page, a checkbox in the cancel dialog, a matrix column. | `agentAccounts.service.js`, `agentAccounts.routes.js`, `invoiceV2.service.js`, frontend |

Decisions taken that you may want to overrule: H6 is the "one-way after the first document" policy, not "always reversible"; H7 keeps the default of NOT cancelling commission together with the invoice.

---

## 12. Open items after the High fixes (revision 2)

### 12.1 Still open

| Severity | IDs | Next action |
|---|---|---|
| Medium (12) | M1 item-sync race, M2 idempotency keys, M3 overdue filter, M4 audit coverage (rest), M5 read-permission exposure, M6 multi-currency, M7 "Agreed" not enforced, M8 handling pricing/agent, M9 partner cash outside a Round, M10 invoice numbering at draft, M11 performance, M12 settlement input checks, M13 dangling reserve movement | Suggested next batch: **M1, M2, M4, M5** (real defects and exposure), then M3, M12, M13; M6/M8/M10 need your decisions. |
| Low (10) | L1-L10 | After the Medium batch. |
| Not yet covered by `DEPENDENTS` | Booking, Invoice, Expense, ContainerType, Service, ExpenseType from the proposal table | Add as part of the Medium batch (extends H5). |

### 12.2 New observations introduced or exposed by the fixes (all Low / Info)

| ID | Observation |
|---|---|
| N1 | The atomic Round check writes `Round.lockVersion` on every ledger posting, so concurrent postings in one Round retry/serialise and `Round.updatedAt` changes on each posting. Acceptable at the expected volume; revisit if bulk posting is added. |
| N2 | The per-agent lock bumps `Agent.ledgerVersion`/`updatedAt` on every cash movement (noise in "last modified"). |
| N3 | `Round.v2` is set only when a Round is created with the partners module on. A Round created earlier is treated as pre-V2 for the shares lock; shares may still be edited until one of the vessel's Rounds is closed and shared (intentional, confirm). |
| N4 | "In use" guards count Draft partner settlements, so a mere Draft calculation prevents switching `partners` off. A test database must be reset to start over. |
| N5 | Commission status `Paid` is never set: payment happens through Pay Agent / netting against the payable. Cancelling a commission AFTER the agent was paid would drive the payable negative. Add a guard or a real paid state. |
| N6 | A Round that ever received a ledger posting can never be deleted, even if every posting was reversed (reversals are ledger lines too). This follows rule R4 but should be explained in the UI. |

### 12.3 Revision history

| Revision | Date | Change |
|---|---|---|
| 1 | 2026-10-21 | Initial audit: 7 High / 14 Medium / 10 Low, 13 probes. |
| 2 | 2026-10-21 | All 7 High fixed with regression tests (`audit-fixes.int.test.js`); M14 fixed, M4 partly; status markers added throughout; probe log re-run; probe scripts moved to `backend/scripts/audit-probes/`; section 12 added. Tests: 36 unit + 63 integration passing. |
| 3 | 2026-10-21 | Superseded for release readiness by `docs/audit/v2-final-audit-2026-10-21.md`: that audit found F-1 (the H5 fix broke voyage delete; fixed), added the V1-regression suite (69 integration tests) and corrected the L2 counts (21 account-code literals, 7 USD literals). |
