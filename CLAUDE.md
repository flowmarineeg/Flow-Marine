# CLAUDE.md — Logistics & Shipping Operations SaaS (MERN)

Last updated 2026-10-24. Slim version. The full historical reference (every sprint's rules, file lists, ADRs) is in
`docs/CLAUDE-full-reference.md` — grep it when you touch a specific area. Sprint specs: `sprints/NNN-sprint.txt`.

## Project
- Root `D:\web-desgin\freelance\logistics` — `backend/` (Express + Mongoose, :5000, prefix `/api/v1`), `frontend/` (Next.js 16 App Router, Tailwind, React Query v5, RHF, Axios, :3000).
- MongoDB — **replica set required** (V2 uses transactions; plain local `mongod` fails). Auth = JWT in httpOnly cookie (+ Bearer fallback) + CSRF header.
- Sprints 001–048 shipped. V2 (049–053 + audit High fixes + "V2-only conversion", 2026-10-23) is in the working tree on branch `version-4`, **uncommitted, DB paths not verified**. Sprint 054 (migration) deliberately skipped.
- Forbidden: microservices, Redis, GraphQL, Kafka, CQRS, DDD, needless abstraction.

## Commands
```
backend/:  npm run dev | npm start | npm run seed | npm test | npm run test:int | npm run migrate:seed-accounts
backend/:  npm run seed:test-data [-- --reset]   # full test dataset (3 rounds, invoices, ledger); local replica set only, see src/config/seed-test-data.js
frontend/: npm run dev | npm run build | npm run lint
docker compose up -d --build
```
- `npm test` = `node --test` over `backend/test/*.test.js` (35 unit tests). Money code MUST have tests. Keep non-test scripts out of `backend/test/`.
- `npm run test:int` needs `TEST_MONGODB_URI` (local replica set, e.g. `mongo:7 --replSet rs0`, `?directConnection=true`). It DROPS the DB and refuses Atlas. **Has not run since V2-only conversion — treat money paths as untested.**
- No frontend tests exist. Verify via `npm run lint`, `npm run build`, and the dev server.
- Use Write/Edit, not shell heredocs, for code containing backticks or `$`.

## Before coding
Read this file, `sprints/STATUS.md`, and every file you will touch. Money work: read `sprints/v2-code-audit-2026-10-21.md` (section 12 = live open list). After work: update `sprints/STATUS.md`.
Order — backend: model → service → controller → routes → server.js. Frontend: service → hook → module component → page.

## Hard rules (never break)
**Ledger / money (V2)**
- Write to the ledger ONLY via `LedgerService.post/reverse`. Never edit/delete JournalEntry/JournalEntryLine via a model (append-only).
- Never remove `lockAgent()` (agent cash paths), `assertRoundOpenTx` (inside `LedgerService.post`), or the unique partial indexes (`one_live_line_per_item`, `reversesEntryId`, `pdaExpenseId`, one lead per vessel).
- New money fields = integer minor units (`utils/money.js`, backend + frontend). No floats. `allocate()` is largest-remainder.
- Every new mutating service MUST call the `roundLock` pre-check (409 `ROUND_CLOSED`).
- Issued invoices are locked; corrections = credit/debit notes. Posted expenses are frozen; reverse first.
- Deletes: `utils/dependents.js` (`assertNoDependents`, `HAS_DEPENDENTS`), no cascades. Add an entry whenever a new collection references an existing one. Ledger-referenced records are never hard-deleted.
- No feature flags exist any more; `Round.v2` is true for all new Rounds.

**Capacity & bookings**
- DO NOT touch `capacity.service.js`, `teuResolver.js`, `voyageGenerator.js` for V2 work (rule R10). Any service mutating bookings/voyages/rounds must call `invalidateRoundCache(roundId)`.
- Booking `polId/podId` are always derived from the voyage, never client-sent. `containerNumber` is the import match key. Import scope = (Round + Agent). No file-wide Voyage selector (except discharge import, which requires Voyage).
- `totalFreight` is computed server-side. `Booking.dischargeStatus` is independent of `status`.
- Voyage display: `getVoyageLabel(v)` (name, fallback to number). Voyage display re-sort (`voyageDisplayOrder.js`) is rendering-only; never write `Voyage.sequence`.
- Revenue = Layer 2 Booking, status `Final Loading` only (reports, dashboard). Layer 1 = ManualBooking (counts toward capacity unless Cancelled).

**Platform**
- Response shape `{success, data, message, pagination?}`. Errors: `AppError(status, message, code)`.
- RBAC middleware on every protected route; audit logger stays fire-and-forget (`res.on('finish')` + `setImmediate`); TrackingHistory append-only; AuditLog read-only.
- Cookie auth only (no localStorage token). No `.normalizeEmail()`. Dashboard is SuperAdmin by role identity (`user.roleId.isSystem`), not permissions.
- Mongo: `$unwind` always `preserveNullAndEmptyArrays: true`. No duplicate indexes (inline `unique:true` only). Escape user input in `$regex` with `utils/escapeRegex.js`. Validate string types on token fields (NoSQL injection).
- `buildZipStream` (not `exportZip`); `compressUpload` (not `uploadExpense`); `seed.js` never auto-runs from the server.
- Frontend: imports via `@/`; `useSearchParams` pages need `<Suspense>`; async `params` via `use(params)`; Modal uses `createPortal`; layout uses `overflow:clip`; per-page tables need `min-w-0` + `overflow-x-auto`; Chart.js targeted registration only; reports use `refetch()` with `enabled:false`; required fields get one red `*`, optional get none; mutation errors via `showErrorToast()`.
- Permission `override` toggle: only `voyages:override` is consulted now (`voyage.controller.js#update`). Other modules: no-op.

## Architecture map (where things live)
- Backend `src/modules/<name>/{model,service,controller,routes,validation}`; middleware: `auth, rbac (also hasPermission), csrf, auditLogger, upload, errorHandler`; utils: `cache (TTL), AppError, autoNumber, money, dependents, moneyAudit, pickFields, escapeRegex`.
- V2 modules: `ledger, partners, billing (routes at /invoices), agentAccounts, partnerSettlement (/round-accounting), rounds/roundLock.js`.
- Cache TTLs: user 60s, permissions 120s, capacity 60s, dashboard 90s.
- Auto-numbers: R000001, BK-, MB-, INV-, JE-, CN-, DN-. Voyage = `{serviceCode}-{roundNumber}-{seq:02d}`.
- Status flows — Round: Planned→Active→Completed | →Cancelled. Voyage: Scheduled→Departed→In Transit→Arrived→Completed | any→Cancelled (bypass with `voyages:override`). Booking: Pending→Confirmed→Final Loading; any→Cancelled (FL/Cancelled locked).
- Delete guards (hard delete everywhere except User): see `docs/CLAUDE-full-reference.md` §9.

## Known gaps / gotchas
- V2 audit: 7 High fixed; 12 Medium + 10 Low open (idempotency keys, partial money-audit coverage, read-permission exposure of SOA/JV data M5, overdue derived on read M3, invoice number at draft M10).
- Missing vs V2 proposal: Ledger UI, nightly Overdue job, agent ageing report, Prepaid/Collect workflow, multi-leg voyages, DEPENDENTS for Booking/Invoice/Expense/ContainerType/Service/ExpenseType.
- Pre-V2 invoice/payment docs remain in Mongo, listed read-only as "legacy"; cannot be paid/cancelled.
- `voyages:override` can desync `round.service.js#cascadeFirstVoyageToDeparted` (tracking data only).
- `getVesselStats` uncached; Round Capacity Report resolves via `round.voyageIds` (deliberate); dead `$sum:'$quantity'` in `getRoundPnL` legacy block is kept on purpose.
- `/dashboard/port-activity` and `/dashboard/missing-final-loading` do NOT exist (404).
- Rounds created before V2-only conversion may have `v2:false`. Commission survives invoice cancel unless `cancelCommission:true`.
- Dependency advisories: `sharp`, `nodemailer`, `xlsx`.

## Env & demo
Backend `.env`: `MONGODB_URI, JWT_SECRET (≥32 chars), ALLOWED_ORIGIN, FRONTEND_URL, ADMIN_EMAIL, ADMIN_PASSWORD, SMTP_*`. Frontend `.env.local`: `NEXT_PUBLIC_API_URL`.
Demo (after `npm run seed`, passwords re-synced each run): `admin@logistics.com / Admin@123456` (SuperAdmin); `ops|finance|tracking|viewer@logistics.com / Demo@123456`.

## Docs
`docs/CLAUDE-full-reference.md` (full old CLAUDE.md), `sprints/STATUS.md`, `sprints/049-sprint.txt` (V2 master plan), `sprints/050..053-sprint.txt`, `sprints/v2-code-audit-2026-10-21.md`, `docs/audit/v2-final-audit-2026-10-21.md` (pre-dates flag removal), `system-report.txt`, `system-flow.txt`, `backend/scripts/audit-probes/`.
