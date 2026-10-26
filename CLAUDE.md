# CLAUDE.md — Logistics & Shipping Operations SaaS (MERN)

Last updated 2026-10-25. Module documentation lives in `docs/` (start at `docs/README.md`). Everything older is archived and **not authoritative**: `docs/archive/2026-10-24/` (incl. the full historical CLAUDE.md) and `sprints/archive/` (sprint specs 001–053). Grep the archive only for history.

## Project
- Root `D:\web-desgin\freelance\logistics` — `backend/` (Express + Mongoose, :5000, prefix `/api/v1`), `frontend/` (Next.js 16 App Router, Tailwind, React Query v5, RHF, Axios, :3000).
- MongoDB — **replica set required** (money paths use transactions; plain local `mongod` fails). Auth = JWT in httpOnly cookie (+ Bearer fallback) + `X-CSRF-Token` header.
- Sprints 001–048 shipped. V2 (049–053 + audit High fixes + V2-only conversion) is in the working tree on branch `version-4`, **uncommitted**. Seed on a real Atlas replica set passed (2026-10-24) but `npm run test:int` has **not** run since the conversion — treat money paths as untested. Sprint 054 (migration) deliberately skipped.
- **No V1/V2 distinction (owner, 2026-10-25):** the system is one product, being reworked module by module. Master data is done (code-complete 2026-10-25, plan + result in `sprints/masterdata-2026-10-25-sprint.md`, **not run against a DB**); next is Rounds/Voyages (route creation and assigning a route to a Service happens there). No commits until the owner says so.
- Forbidden: microservices, Redis, GraphQL, Kafka, CQRS, DDD, needless abstraction.

## Commands
```
backend/:  npm run dev | npm start | npm run seed | npm test | npm run test:int | npm run migrate:seed-accounts | npm run migrate:masterdata [-- --dry]
backend/:  SEED_ALLOW_REMOTE=yes npm run seed:test-data [-- --reset]   # disposable test dataset, see "Test data"
frontend/: npm run dev | npm run build | npm run lint
docker compose up -d --build
```
- `npm test` = `node --test` over `backend/test/*.test.js` (pure-logic unit tests). Money code MUST have tests. Keep non-test scripts out of `backend/test/`.
- `npm run test:int` needs `TEST_MONGODB_URI` (local replica set, e.g. `mongo:7 --replSet rs0`, `?directConnection=true`). It DROPS the DB and refuses Atlas.
- No frontend tests. Verify via `npm run lint`, `npm run build`, and the dev server.
- Use Write/Edit, not shell heredocs, for code containing backticks or `$`.

## Before coding
Read this file, `docs/README.md` → the module doc(s) you touch, and every source file you will edit. Money work: also `docs/11-accounting.md` and `docs/audit/system-audit-2026-10-25.md` (open findings). After work: update the affected `docs/NN-*.md`, the audit table if a finding changed, and `sprints/STATUS.md`.
Order — backend: model → service → controller → routes → server.js. Frontend: service → hook → module component → page.

## Module docs (`docs/`)
| Doc | Module(s) |
|---|---|
| `00-architecture.md` | pipeline, auth/CSRF/RBAC/audit, money, round lock, numbering, cache, env |
| `01-master-data.md` | locations, services+routes, agents+agreements, customers, container types (TEU), expense types, partners (master data rework 2026-10-25, see `sprints/masterdata-2026-10-25-sprint.md`) |
| `02-vessels.md` | vessels, partner shares |
| `03-rounds-voyages.md` | rounds, voyages, capacity engine, close summary |
| `04-bookings.md` | Layer 2 / Layer 1 bookings, Excel import (booking, finalLoading, discharge) |
| `05-expenses.md` | scope, PDA/FDA, posting, attachments |
| `06-invoices.md` | booking items, V2 invoices, settlements, notes, commission |
| `07-tracking.md` | tracking history |
| `08-reports-dashboard.md` | 7 reports, ledger P&L, dashboard |
| `09-export.md` | Excel / ZIP export |
| `10-users-roles-rbac.md` | auth, users, roles, permission matrix, audit logs |
| `11-accounting.md` | ledger, agent accounts, round close, partner settlement, reserve |
| `audit/` | current audit (`system-audit-2026-10-25.md`, findings F-01…F-12) |

## Hard rules (never break)
**Ledger / money (V2)**
- Write to the ledger ONLY via `LedgerService.post/reverse`. Never edit/delete JournalEntry/JournalEntryLine via a model (append-only; models throw `LEDGER_IMMUTABLE`).
- Never remove `lockAgent()` (agent cash paths), `assertRoundOpenTx` (inside `LedgerService.post`), or the unique partial indexes (`one_live_line_per_item`, `reversesEntryId`, `pdaExpenseId`, `one_lead_per_vessel`).
- New money fields = integer minor units (`utils/money.js`, backend + frontend). No floats. `allocate()` is largest-remainder.
- Every new mutating service MUST call the `roundLock` pre-check (409 `ROUND_CLOSED`).
- Issued invoices are locked; corrections = credit/debit notes. Posted expenses are frozen; reverse first.
- Deletes: `utils/dependents.js` (`assertNoDependents`, `HAS_DEPENDENTS`), no cascades (only exception: deleting a Round deletes its own generated voyages). Add an entry whenever a new collection references an existing one. Ledger-referenced records are never hard-deleted.
- No feature flags exist; `Round.v2` is true for all new Rounds.

**Capacity & bookings**
- DO NOT touch `capacity.service.js`, `teuResolver.js`, `voyageGenerator.js` for V2 work (rule R10). Any service mutating bookings/voyages/rounds must call `invalidateRoundCache(roundId)`.
- Booking `polId/podId` are always derived from the voyage, never client-sent. `containerNumber` is the import match key. Import scope = (Round + Agent). No file-wide Voyage selector (except discharge import, which requires Voyage).
- `totalFreight` is computed server-side. `Booking.dischargeStatus` is independent of `status`.
- Voyage display: `getVoyageLabel(v)` (name, fallback to number). `voyageDisplayOrder.js` re-sort is rendering-only; never write `Voyage.sequence`.
- Revenue = Layer 2 Booking, status `Final Loading` only (reports, dashboard). Layer 1 = ManualBooking (counts toward capacity unless Cancelled).

**Platform**
- Response shape `{success, data, message, pagination?}`. Errors: `AppError(status, message, code)`.
- RBAC middleware on every protected route; audit logger stays fire-and-forget (`res.on('finish')` + `setImmediate`); TrackingHistory append-only; AuditLog read-only.
- Cookie auth only (no localStorage token). No `.normalizeEmail()`. Dashboard is SuperAdmin by role identity (`user.roleId.isSystem`), not permissions.
- Mongo: `$unwind` always `preserveNullAndEmptyArrays: true`. No duplicate indexes (inline `unique:true` only). Escape user input in `$regex` with `utils/escapeRegex.js`. Validate string types on token fields (NoSQL injection).
- `buildZipStream` (not `exportZip`); `compressUpload` (not `uploadExpense`); `seed.js` never auto-runs from the server.
- Frontend: imports via `@/`; `useSearchParams` pages need `<Suspense>`; async `params` via `use(params)`; Modal uses `createPortal`; layout uses `overflow:clip`; per-page tables need `min-w-0` + `overflow-x-auto`; Chart.js targeted registration only; reports use `refetch()` with `enabled:false`; required fields get one red `*`, optional none; mutation errors via `showErrorToast()`.
- Master data: accounts on Services / Expense types / Customers are chosen by type + code prefix (`ledger/accountRules.js`), never by 6-digit group; `ContainerType.teuFactor` is informational — capacity still uses `teuResolver` (R10); an agent is a booking source unless its roles are exactly `['Port']`; expense type `operationalLevel` constrains expense scope; vessel shares lock after the first accounting entry.
- Permission `override` toggle: only `voyages:override` is consulted (`voyage.controller.js#update`). Other modules: no-op.

## Architecture map
- Backend `src/modules/<name>/{model,service,controller,routes,validation}`; middleware `auth, rbac (+hasPermission), csrf, auditLogger, upload, errorHandler`; utils `cache (TTL), AppError, autoNumber, money, dependents, moneyAudit, pickFields, escapeRegex, teuResolver, voyageGenerator`.
- V2 modules: `ledger, partners, agreements, billing (routes at /invoices), agentAccounts (/agent-accounts), partnerSettlement (/round-accounting), rounds/roundLock.js`. Master-data module added 2026-10-25: `customers` (`/customers`, perm `customers`). Pure-logic files with unit tests: `vessel.logic`, `expenseType.logic`, `agent.logic`, `customer.logic`, `utils/masterValidators.js`.
- Cache TTLs: user 60s, permissions 120s, capacity 60s, dashboard 90s.
- Auto-numbers: R000001, BK-, MB-, INV-, CN-, DN-, HC-, JE-. Voyage = `{serviceCode}-{roundNumber}-{seq:02d}`.
- Status flows — Round: Planned→Active→Completed | →Cancelled (from Planned/Active). Voyage: Scheduled→Departed→In Transit→Arrived→Completed; Scheduled/Departed/In Transit→Cancelled (**Arrived cannot be Cancelled**; bypass all with `voyages:override`). Booking: Pending→Confirmed→Final Loading; any non-final→Cancelled (Final Loading→Cancelled allowed; Final Loading/Cancelled not editable).
- Round financial axis (independent): `closeStatus` Open→ReadyToClose→Closed, reopen with reason.

## Known gaps / gotchas
- **Open audit findings:** see `docs/audit/system-audit-2026-10-25.md`. Most important: F-01/F-02 fixed 2026-10-25 (round close now blocks with `ROUND_HAS_OTHER_CURRENCY` if any ledger line is not in the settlement currency — rounds still settle in one currency), F-03/F-04 fixed 2026-10-25 (invoices USD-only; P&L excludes non-USD expenses into `summary.excludedExpenses`), F-05/F-06/F-07 fixed 2026-10-25 (expense payer frozen; Overdue via `overdueMatch`; Final Loading import blocked with `BOOKING_INVOICED` for invoiced bookings).
- **Master data (2026-10-25), unverified at runtime:** run `npm run migrate:masterdata -- --dry`, then for real on a copy, before using an existing DB (backfills services, expense types, agreements, vessels' ownership, partner contacts, container TEU). Vessels/services/expense types missing the new required fields cannot be edited until completed. Service/expense-type account mappings (`revenueAccountId`, `expenseAccountId`, `accrualAccountId`) are stored and validated but **not yet used by ledger postings**; tax is not calculated; commission still accrues at invoice issue (proposal wants Final Loading) and only when the agreement's `earnsBookingCommission` is on. No integration tests exist yet for the new rules (ledger-line share lock, `EXPENSE_LEVEL_MISMATCH`, `PDA_REQUIRED`, `AGENT_NOT_BOOKING_SOURCE`). Audit F-09 grant policy and F-12 still open.
- Missing vs V2 proposal: Ledger UI/journal list endpoint, nightly Overdue job, agent ageing report endpoint, Prepaid/Collect workflow (field is informational), multi-leg voyages, DEPENDENTS for Booking/Invoice/Expense/ContainerType/Service/ExpenseType.
- Pre-V2 invoice/payment docs remain in Mongo, listed read-only as "legacy"; cannot be paid/cancelled.
- `voyages:override` can desync `round.service.js#cascadeFirstVoyageToDeparted` (tracking data only).
- `getVesselStats` is uncached and uses the older "non-Cancelled L1+L2" revenue; Round Capacity Report resolves via `round.voyageIds` (deliberate); dead `$sum:'$quantity'` in `getRoundPnL` legacy block is kept on purpose.
- `/dashboard/port-activity` and `/dashboard/missing-final-loading` do NOT exist (404).
- Rounds created before V2-only conversion may have `v2:false`. Commission survives invoice cancel unless `cancelCommission:true`.
- Dependency advisories: `sharp`, `nodemailer`, `xlsx`. `SMTP_EMAIL`/`SMTP_APP_PASSWORD` are required at boot only in production.

## Env & demo
Backend `.env`: `MONGODB_URI, JWT_SECRET (≥32 chars), SMTP_EMAIL, SMTP_APP_PASSWORD (prod-required), ALLOWED_ORIGIN, FRONTEND_URL, ADMIN_EMAIL, ADMIN_PASSWORD` (optional: `JWT_EXPIRES_IN, PORT, UPLOAD_MAX_SIZE_MB, ENABLE_CAPACITY_ENFORCEMENT=off|warn|strict`). Frontend `.env.local`: `NEXT_PUBLIC_API_URL`.
Demo (after `npm run seed`, passwords re-synced each run): admin = `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `backend/.env` (falls back to `admin@logistics.com / Admin@123456`); `ops|finance|tracking|viewer@logistics.com / Demo@123456`.

## Test data (2026-10-24)
- The Atlas database in `backend/.env` (`test` DB on cluster `logistics`) is a **disposable TEST database, not real data** (user-confirmed). It was reseeded 2026-10-24 with `src/config/seed-test-data.js`; all 27 steps passed and the ledger trial balance balanced.
- Dataset: 3 rounds `TEST Round A/B/C` (A Completed+Closed, B Active, C Planned), 8 voyages, 135 bookings, 5 manual bookings, 22 expenses, 10 invoices/notes in every status, 38 journal entries, 6 agents (1 Direct Line), 3 vessels, 3 partners with JV shares.
- Rebuild: `SEED_ALLOW_REMOTE=yes npm run seed:test-data -- --reset` (drops the DB). Without `--reset` it skips operational data if `TEST Round *` exists. Without `SEED_ALLOW_REMOTE=yes` it refuses Atlas. All money goes through the real services, so it doubles as a smoke test.
- `test:int` still refuses Atlas and is not a substitute: run it on a local replica set.
- The seed was updated for the master-data rework (ownership values, GPION charter dates, container ISO codes, expense types with level/accounts, services with revenue account, `PSD-AG` roles `['Commercial','Port']`) but has **not been re-run** since; `audit-fixes.int.test.js` and `v2.int.test.js` are not yet updated for the ledger-line share lock.

## Docs & history
`docs/` (current, see table above) · `docs/audit/` (current audit) · `sprints/STATUS.md` (short current status) · `docs/archive/2026-10-24/` (old planning docs, analyses, old audits, `CLAUDE-full-reference.md`) · `sprints/archive/` (sprint specs 001–053, V2 master plan `049-sprint.txt`, `v2-code-audit-2026-10-21.md`) · `docs/archive/2026-10-24/reports/system-report.txt`, `system-flow.txt` (pre-date this rewrite) · `backend/scripts/audit-probes/`.
