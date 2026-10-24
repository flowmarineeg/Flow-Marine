# CLAUDE.MD — AI Agent Master Reference
# Logistics & Shipping SaaS — MERN Stack
# Last Updated: 2026-10-23 — Version 2 is now THE system (no feature flags, no V1 invoicing). Implemented, NOT committed
# Current Sprint: 001-048 shipped | V2 049-053 + audit High fixes + "V2-only conversion" (2026-10-23): implemented in the
#                   working tree. Feature flags and the V1 invoice/payment/agent-financial-account code are REMOVED.
#                 | NOT verified against a database: integration tests need a replica set (Docker was unavailable)
#                 | NEXT: run npm run test:int on a replica set, V2 Medium audit findings, Sprint 054 (migration, deliberately skipped)
#                 | See §6 "Version 2" and sprints/v2-code-audit-2026-10-21.md before touching any money code

> READ THIS FILE BEFORE WRITING ANY CODE.
> This is the single source of truth for any AI agent continuing this project.
> Always read actual files you will touch before modifying them.
> Project root: D:\web-desgin\freelance\logistics

---

## 1. PROJECT IDENTITY

| Field          | Value                                              |
|----------------|----------------------------------------------------|
| Project Name   | Logistics & Shipping Operations SaaS               |
| Stack          | MERN — MongoDB (replica set REQUIRED for V2 transactions), Express, Next.js 16, Node.js |
| Root           | D:\web-desgin\freelance\logistics                  |
| Backend        | D:\web-desgin\freelance\logistics\backend          |
| Frontend       | D:\web-desgin\freelance\logistics\frontend         |
| Backend Port   | 5000                                               |
| Frontend Port  | 3000                                               |
| API Prefix     | /api/v1/                                           |
| DB             | MongoDB Atlas                                      |
| Auth           | JWT via httpOnly cookie (Sprint020); Bearer header fallback |
| Sprint State   | 001–048 ✅ shipped (037 audit-only) | V2 049–053 + audit High fixes 🟡 implemented, uncommitted, V2-only (flags removed) | 054 ⏳ not started |
| Git Branch     | `main` (merged from `version2`, fast-forward, 2026-07-24); V2 work is on the working tree of `version-4` |

### System Summary
Full shipping company operations ERP covering:
- Master Data — Vessels, Agents, Locations, Container Types, Expense Types (+ cost-classified categories), Services + Routes
- Operations — Rounds → Voyages (grouped-by-Round list, physical-flow display order, Round→Voyage Active/Departed cascade) → Bookings (Layer 1 Manual + Layer 2 Operational/Excel import, + Discharge import producing Discharged/Remaining operational tabs) → Expenses (Round/Voyage/Port scope) → Invoices (multi-booking, explicit payment allocation, auto status + admin manual override) → Tracking
- Analytics — Live Dashboard (widget-based, 6 sections, SuperAdmin only) + 9 Reports (Round Capacity, Voyage Performance, Revenue, Expenses, Booking, Voyage Profitability/Round P&L, Booking Revenue Details); Capacity Engine tables now surface a red "remaining onboard past discharge" operational warning
- Export — Excel per module (13 modules incl. Layer 1 Manual Bookings) + multi-module ZIP + Export Info metadata sheet
- Admin — Users, Roles, RBAC (per-role `voyages:override` grant; `invoices:override` is now unused), Audit Log
- Invoice PDF export (PDFKit)
- Agent Financial Account — Round→Voyage→Booking statement tree, KPIs, Payments/Invoices tabs, booking summaries (count/revenue/per-container-type) instead of flat per-booking tables
- System-wide UX standards — one red `*` for required fields (no marker for optional), one shared `showErrorToast()` helper for every mutation's error toast

### Known open gaps
Closed by V2 Sprint 049: `GET /permissions/:roleId` same-role-or-admin check, role self-promotion block, PageGuard on roles/[id] and agents/[id|new], redundant expense index, `buildZipStream` Promise.all, import/export toggles in PermissionMatrix.
- `vessel.service.js#getVesselStats` is still uncached (needs invalidation at every booking/invoice/expense mutation). The V1 `getAgentFinancialAccount` no longer exists.
- Remaining dependency advisories: `sharp` and `nodemailer` (major bumps), `xlsx` (no patched release).
- **V2 audit** (`sprints/v2-code-audit-2026-10-21.md`): 7 High FIXED; 12 Medium + 10 Low OPEN (item-sync race, no idempotency keys, partial money-audit coverage, read-permission exposure of JV/SOA data, multi-currency only half-built, …). Section 12 of that file is the live open list.
- **Final audit (docs/audit/v2-final-audit-2026-10-21.md):** found+fixed a regression from the H5 fix (voyage delete); FIXED 2026-10-23: `seed.js` rewritten (roles, permissions, admin+demo users, chart of accounts; no operational demo data; syntax-checked only, NOT yet run against a DB) and un-ignored; root `.gitignore` no longer ignores docs/sprints/CLAUDE.md.
- **V2-only conversion (2026-10-23):** feature flags, the V1 invoice/payment code, the V1 agent financial account and their screens are DELETED; `/api/v1/invoices` is the V2 billing router. **NOT verified against a database** (no Docker/mongod available): run `npm run test:int` on a replica set before trusting any money path. Pre-existing V1 invoice/payment documents stay in MongoDB, are listed read-only with a "legacy" notice, and cannot be paid, cancelled or reported on.
- **Still missing vs the Notion V2 proposal:** a Ledger UI (trial balance, exchange-rate entry — backend exists), nightly Overdue job (overdue is derived on read, M3), agent SOA ageing as its own report (ageing is a block inside the SOA), Tracking move-type/confirmed flag driving handling fees, master-data account/tax/TEU fields, Prepaid/Collect workflow (only an informational `Booking.paymentTerm` field), multi-leg voyages (conflicts with rule R10 — capacity engine is untouchable; needs a design), `DEPENDENTS` for Booking/Invoice/Expense/ContainerType/Service/ExpenseType, V2 Medium audit items (M1-M13).
- Sprint 054 (migration/cutover) deliberately skipped by the user: no V1 data conversion, no opening balances, no parallel run.

---

## 1.5. COMMANDS

```bash
# Backend (from backend/)
npm install
npm run dev                  # nodemon src/server.js — http://localhost:5000
npm start                    # node src/server.js (production, no reload)
npm run seed                 # node src/config/seed.js — always re-syncs admin/demo passwords from .env
npm run migrate:seed-accounts # V2: idempotent insert of the 20-account chart of accounts
npm test                     # node --test: 35 unit tests (money, ledger rules, billing logic, agent accounts, partner settlement)
npm run test:int             # needs TEST_MONGODB_URI (local replica set); see below

# Frontend (from frontend/)
npm install
npm run dev                  # next dev — http://localhost:3000
npm run build                # next build (production)
npm start                    # next start (serve production build)
npm run lint                 # eslint

# Docker (from repo root)
docker compose up -d --build # backend :5000, frontend :3000
```

**Backend tests (V2):** `npm test` runs `node --test` (zero dependencies) over backend/test/*.test.js. Money code MUST have tests. Integration tests live in `backend/test/int/` and run only when `TEST_MONGODB_URI` is set: `v2.int.test.js` (service-level), `api.int.test.js` (real-HTTP: spawns the server on port 5056 with cookies, CSRF, RBAC), `audit-fixes.int.test.js` (regression tests for the V2 audit High findings; the flag-policy test was removed with the flags). `v1-regression.int.test.js` was deleted with V1. None of these have run since the V2-only conversion. They DROP that database and refuse Atlas URIs. Local replica set:
```bash
docker run -d --name flow-test-mongo -p 27018:27017 mongo:7 --replSet rs0 --bind_ip_all
docker exec flow-test-mongo mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
TEST_MONGODB_URI="mongodb://localhost:27018/flow_v2_test?directConnection=true" npm run test:int
```
The audit probe scripts (`backend/scripts/audit-probes/`) are NOT tests and live outside `test/` on purpose (`node --test` would run them). V2 needs a replica set even in development: a plain local `mongod` fails on the first `withTransaction`.

There is **no frontend test suite** in this repo — neither `package.json` declares a `test` script, and no test
framework (Jest/Mocha/Vitest/Playwright/etc.) is installed in either `backend/` or `frontend/`. Don't
assume one exists or invent a `npm test` invocation; verify correctness by reading the code, running
`npm run lint` (frontend only), and manually exercising the flow through the dev server.

There is no single-file/single-module run command for either half — both are long-running dev servers
(`nodemon`/`next dev`), not test runners, so there's no equivalent of "run just this test."

---

## 2. ARCHITECTURE

```
Frontend:  Next.js 15 App Router + Tailwind CSS + React Query v5 + React Hook Form + Axios
Backend:   Node.js + Express + MongoDB + Mongoose + JWT (httpOnly cookie)
File Ops:  Multer + Sharp (image compression) + PDFKit (invoice PDF) + ExcelJS (export) + Archiver (ZIP) + SheetJS/xlsx (import)
Charts:    Chart.js v4 — targeted registration only (NOT registerables)
Icons:     react-icons v5 (gi, fa, md, tb, fi, lu families)
Cache:     In-memory TTL cache (utils/cache.js) — user 60s, permissions 120s, dashboard 90s
```

**Forbidden:** No microservices, Redis, GraphQL, Kafka, CQRS, DDD, unnecessary abstractions.
**VPS deployment:** Docker + docker-compose (backend/Dockerfile, frontend/Dockerfile, docker-compose.yml)

---

## 3. SPRINT STATUS

| Sprint  | Description                                        | Status     |
|---------|----------------------------------------------------|------------|
| 001-006 | Setup → Auth → Masters → Services                 | ✅ Complete |
| 007     | Rounds & Voyage Engine                             | ✅ Complete |
| 008     | Bookings                                           | ✅ Complete |
| 009     | Expenses & Invoices                                | ✅ Complete |
| 010     | Tracking & Audit Log                               | ✅ Complete |
| 011     | Reports                                            | ✅ Complete |
| 012     | Export (Excel & ZIP)                               | ✅ Complete |
| 013     | Master Data Improvements                           | ✅ Complete |
| 014     | Dashboard + Report Fixes                           | ✅ Complete |
| 015     | Booking Import (Excel)                             | ✅ Complete |
| 016     | Manual Voyage Control                              | ✅ Complete |
| 017     | Booking Model Refinements + Final Loading          | ✅ Complete |
| 018     | Tracking Tab Overhaul + Vessel Detail Page         | ✅ Complete |
| 019     | RBAC Consistency Audit & Enforcement               | ✅ Complete |
| 020     | Production Hardening & Performance (7 phases)      | ✅ Complete |
| 021     | UI Fixes, Vessel Particulars & Booking Overhaul    | ✅ Complete |
| 022     | Dynamic Per-Leg Vessel Capacity Engine             | ✅ Complete |
| 023     | Booking Layer 1/2 Refactor + Voyage-Based Capacity | ✅ Complete |
| 024     | Layer 2 Freight Model Correction + Capacity Integration | ✅ Complete |
| 025     | Layer 2 Quantity Removal + Capacity Fix (No-Qty Architecture) | ✅ Complete |
| 026     | Import Redesign: Column Aliases + IMDG + Currency Removal + Agent Scope | ✅ Complete |
| 027     | Export Discharge List | ✅ Complete |
| 028     | Capacity Engine Multi-Voyage Transit Fix (BUG-004)  | ✅ Complete |
| 029     | Capacity Table Exact-Segment "Loaded" Display Fix   | ✅ Complete |
| 030     | Booking POL/POD Server-Derived + Round→Voyage Cascading Filters | ✅ Complete |
| 031     | Layer 2 Import Redesign: Round-Scoped Multi-Voyage Resolution | ✅ Complete |
| 032     | Vessel Details KPI Consistency (L1+L2) + Booking Import Layout Fix | ✅ Complete |
| 033     | Invoice & Agent Financial System — Multi-Booking Invoices, Explicit Payment Allocation, Agent Financial Account | ✅ Complete |
| 034     | Booking Reports Modernization — Dual-Layer Booking Report Migration + Booking Revenue Details (Pricing-Group Report) | ✅ Complete |
| 035     | Voyage Profitability Report — evolved Round P&L (`getRoundPnL`) in place, Round/Voyage scope, Revenue/Voyage Cost/Other Voyage Cost/Summary | ✅ Complete |
| 036     | Expense Module Port-Level Costing — `Expense.portId` (Round/Voyage/Port scope, inferred not stored), Revenue-by-Voyage VGM | ✅ Complete |
| 037     | Reporting Modules Architecture Audit — dead `quantity` field, Revenue-definition inconsistency, Expense Report Sprint 036 gap, found across 5 reports | ✅ Audit complete — **no code written** (by design) |
| 038     | Reporting Consolidation — Round Capacity card rebuild, Voyage Performance dual-layer, Revenue Report Final-Loading-only, Expense Report Sprint 036 parity, VGM kg→MT | ✅ Complete |
| 039     | Dashboard Architecture & KPI — widget/section architecture, Global Filter Bar, Quick Actions, revenue/utilisation drift fixes | ✅ Complete |
| 040     | Bulk Export Module Audit & Update — schema-drift fixes (vessel particulars, booking containerNumber, etc.), `manualBookings` module, Export Info metadata sheet, Date Range filters | ✅ Complete |
| 041     | RBAC Enforcement Audit, Performance & Caching Review, Bug Sweep | 🟡 Planning approved — **not yet implemented** (see open gaps above) |
| 042     | Import Template Styling (ExcelJS, red/yellow header fills), Required-Field `*` Convention, Shared Error Toast (`showErrorToast`), Round→Voyage Active/Departed Cascade, Voyages Tab Grouped-by-Round + Delete | ✅ Complete |
| 043     | Voyage Display Order by Physical Vessel Flow — display-only re-sort (`voyageDisplayOrder.js`) reused by Voyage Tab, Round Details, and all Capacity Engine tables; `Voyage.sequence`/capacity math untouched | ✅ Complete |
| 044     | Invoice Booking-List Scroll Cap, Voyage/Round Invoices Auto-Include All Eligible Bookings + `BookingsSummaryCard` (count/revenue/per-container-type), Agent Financial Account Bookings + Rounds tabs use the same summary card | ✅ Complete |
| 045     | Discharge Import — new `importType='discharge'` (match-only, Voyage-required, no bookings created), `Booking.dischargeStatus` (Discharged/Remaining), "Discharged"/"Remaining" Booking List tabs, Capacity Engine `remainingOnboardTEU` (presentation-only, does not touch onboard/remaining math) + red operational warnings | ✅ Complete |
| 046     | Invoice Status: Automatic (payment-driven) Flow Kept As-Is, New `invoices:override` Permission Lets a Granted Role/SuperAdmin Force Any Status + Bypass the paidAmount/Paid/Cancelled Lock Entirely | ✅ Complete |
| 047     | Part A: Bulk Select & Delete (Bookings/Voyages/Expenses). Part B: Remove all soft delete (14 models → hard delete) + Agent invoice guard + Round→Voyage cleanup. Part C: Invoice Details overview-only + Bill To fields + one-row payment recording + full PDF redesign | ✅ Complete |
| 048     | Voyage Status Admin Override — `voyages:override` permission (mirrors Sprint 046 `invoices:override`) lets a granted role/SuperAdmin force a voyage's `status` to any value, bypassing `STATUS_TRANSITIONS`. Plus: Voyage Display-Label Standard — `getVoyageLabel(v)` shows only `voyageName` (falling back to `voyageNumber`) everywhere a voyage is referenced, never both | ✅ Complete (not yet committed to git as of this writing) |

| 049     | V2 Sprint 0: CSRF token, tokenVersion session revocation, schema-path field whitelists (pickFields), permission-endpoint boundaries, dependency fixes (see sprints/049-audit-recheck.txt) | Implemented, uncommitted |
| 050     | V2 Sprint 1 Foundation: feature flags (system_settings, all OFF), chart of accounts, immutable double-entry ledger via LedgerService, integer minor-unit money, exchange rates, Partners + vessel JV shares, agreement schemas, dependents-check engine, trial balance. See sprints/050-sprint.txt | Implemented, uncommitted; DB paths untested |
| 051     | V2 Sprint 2 Revenue cycle: BookingItems, V2 invoice wizard/issue/cancel (ledger-posted, DB-enforced one-invoice-per-item), settlements, credit/debit notes, commission accrual. See sprints/051-sprint.txt | Implemented, uncommitted; DB paths untested |
| 052     | V2 Sprint 3 Expenses/Agent accounts: PDA/FDA + paid-by, ledger-posted expenses, agent SOA (ledger query), netting engine (idempotent batches), pay agent/advances, handling charges, agreements, final settlement statement. See sprints/052-sprint.txt | Implemented, uncommitted; DB paths untested |
| 053     | V2 Sprint 4 Partner settlement and Round closing: Round.closeStatus (separate from status), close checklist + override, partner settlement engine (bp shares, no lost cent), transfers, JV reserve, closed-Round lock (roundLock.js) across mutating services, money audit helper, ledger P&L basis. See sprints/053-sprint.txt | Implemented, uncommitted; DB paths untested |
| 053-fix | V2 audit HIGH fixes (sprints/v2-code-audit-2026-10-21.md section 11): shares lock only for V2 Rounds, per-agent cash serialisation, atomic closed-Round check inside LedgerService.post (Round.lockVersion), expense scope lock, dependents for Round/Voyage/Partner, flag dependency + one-way policy, commission cancel. Regression tests: test/int/audit-fixes.int.test.js | Implemented, uncommitted |
| V2-only | 2026-10-23: feature flags + settings module removed; V1 invoice/payment/agent-financial-account code and screens deleted; invoices router = V2 billing; BillToSection extracted; seed.js rewritten; .gitignore fixed. Unit tests + next build pass, integration tests NOT run | Implemented, uncommitted |

---

## 4. BACKEND STRUCTURE

### New files added in Sprint 020

```
backend/src/utils/cache.js          ← in-memory TTL cache (Map-based, no deps)
backend/src/utils/AppError.js       ← class AppError extends Error { statusCode }
backend/src/config/migrations/
  migrate-dashboard-auditlogs.js    ← locks dashboard+auditLogs to hidden for non-admin roles
backend/Dockerfile                  ← node:18-alpine, multi-stage, non-root user
backend/.env.example                ← all env vars documented
backend/.dockerignore
```

### New/changed files, Sprints 035-041

```
modules/expenses/expense.model.js     ← Sprint036: +portId (ref Port, default null), compound
                                         index {voyageId,portId}; legacy `port` free-text kept
modules/expenses/expense.service.js   ← Sprint036: deriveScope({roundId,voyageId,portId}) — pure,
                                         exported (Sprint038) function, single source of truth for
                                         scope everywhere (reports, export, ExpenseList.jsx)
modules/reports/reports.service.js    ← Sprint035: getRoundPnL extended (+voyageId param, +summary/
                                         +voyages[]/+otherVoyageCost, legacy fields KEPT for back-compat)
                                         Sprint036: Voyage Cost per-port grouping keys on portId
                                         Sprint038: getVoyagePerformance dual-layer (bookingSource/
                                         bookingStatus params), getRevenueReport narrowed to L2+Final
                                         Loading, getExpenseReport +portId/scope/classification summary,
                                         getBookingRevenueDetails vgm kg→MT
modules/capacity/capacity.service.js  ← Sprint038: +capacityBeforeLoading field only (additive,
                                         presentation-only, does NOT change onboard/remaining math).
                                         computeRoundCapacity still resolves round's voyages via
                                         round.voyageIds (Sprint037 finding, deliberately NOT changed —
                                         see Sprint038 OUT OF SCOPE / Sprint041 restatement)
modules/dashboard/dashboard.service.js ← Sprint039: revenue30d/monthlyTrend/revByService narrowed to
                                         Final Loading; getFleetUtilisation totalBookedTEU→totalLoadedTEU
                                         fix; totalExpenses now a real sum. NOTE (corrected post-audit,
                                         system-audit-2026-8-4.md/9-1.md §2.3/L1): getPortActivity()/
                                         getVoyagesMissingFinalLoading() and their routes were originally
                                         planned for this sprint but were NEVER ACTUALLY IMPLEMENTED —
                                         confirmed absent from the running code (this doc previously,
                                         incorrectly, claimed they shipped). dashboard.routes.js only
                                         registers GET /stats and GET /fleet-utilisation. Do not build
                                         frontend code against /dashboard/port-activity or
                                         /dashboard/missing-final-loading — they 404. If this capability
                                         is still wanted, it needs to be implemented from scratch.
modules/export/export.service.js      ← Sprint040: COLUMNS/fetchData updated for schema drift across
                                         vessels/voyages/bookings/expenses/expenseTypes/invoices;
                                         +manualBookings module (13 total); +addMetadataSheet() → every
                                         export gets a leading "Export Info" worksheet; +dateRange()
                                         helper (dateFrom/dateTo now honored on 4 modules);
                                         exportSingle/buildZipStream take optional generatedBy
                                         (buildZipStream is STILL sequential — Sprint041 flags this)
modules/export/export.controller.js   ← Sprint040: passes req.user?.name||email as generatedBy
```

### New/changed files, Sprints 042-046

```
modules/bookings/bookingImport.service.js ← Sprint042: +buildImportTemplate() (ExcelJS-generated
                                             blank template, header fills FFF8D7DA/FFFFF3CD required/
                                             optional) + getTemplateColumns() (single authoritative
                                             column/required-flag list, no more frontend-side duplicate)
                                             Sprint045: +previewDischargeImport({rows,agentId,voyageId})
                                             + saveDischargeImport({rows,agentId,voyageId,createdBy}) —
                                             fully separate from previewImport/saveImport, which are
                                             completely untouched
modules/bookings/bookingImport.controller.js ← Sprint042: +templateColumns, +downloadTemplate
                                             Sprint045: preview/save branch on importType==='discharge'
                                             to the functions above, else call the unchanged originals
modules/bookings/booking.model.js     ← Sprint045: +dischargeStatus ('Discharged'|'Remaining'|null,
                                         default null, independent of `status`), +dischargedAt
modules/bookings/booking.service.js   ← Sprint045: list() +dischargeStatus query param (additive)
modules/bookings/booking.controller.js ← Sprint045: list passes dischargeStatus through from req.query
modules/rounds/round.service.js       ← Sprint042: create()/update() — Round Planned→Active (or
                                         created directly as Active) moves only the round's first
                                         Scheduled voyage (lowest sequence) to Departed; not reversible,
                                         no TrackingHistory entry
modules/voyages/voyage.service.js     ← Sprint042: list() sort changed {sequence,etd} → {roundId:1,
                                         sequence:1} so a Round's voyages arrive contiguous (feeds the
                                         grouped-by-Round Voyages tab)
modules/capacity/capacity.service.js  ← Sprint045: L2 event carries `stuckRemaining` (true when
                                         Booking.dischargeStatus==='Remaining'); Step E diverts that
                                         TEU into a NEW remainingOnboardTEU[] array instead of
                                         dischargedTEU[], so it keeps counting in onboardTEU at every
                                         later voyage — the onboard recurrence itself is UNCHANGED.
                                         New warning REMAINING_ONBOARD_PAST_DISCHARGE. computeVoyage-
                                         Preview/computeVesselActiveCapacity inherit this for free
                                         (both call computeRoundCapacity internally)
modules/invoices/invoice.service.js   ← [DELETED 2026-10-23] Sprint046: update(id,data,updatedBy,canOverride=false) — when
                                         canOverride, skips BOTH the paidAmount>0/Paid|Cancelled lock
                                         AND the MANUAL_TRANSITIONS whitelist, so status can be forced
                                         to any INVOICE_STATUS value at any time. recalcInvoiceStatus()
                                         itself is completely untouched — a later payment event may
                                         still recompute/overwrite a manual override (by design)
                                         Sprint044: getEligibleBookings() +containerTypeId populate,
                                         +containerType field on each mapped row (additive)
modules/invoices/invoice.controller.js ← Sprint046: update() resolves canOverride via
                                         rbac.hasPermission(req,'invoices','override') and passes it in
modules/invoices/invoice.validation.js ← Sprint046: validateUpdate's body('status') now isIn(
                                         INVOICE_STATUS) (all 6 values) instead of a hardcoded
                                         ['Issued','Cancelled'] — the narrow whitelist for non-override
                                         requests still lives solely in validateManualTransition()
modules/agents/agent.service.js       ← Sprint044: getAgentFinancialAccount() +containerTypeId
                                         populate, +containerType field, same pattern as invoices above
modules/permissions/permission.model.js ← Sprint046: actionSchema +override (Boolean, default false) —
                                         no migration needed, absent key on old docs reads as falsy
middleware/rbac.js                    ← Sprint046: +hasPermission(req,module,action) exported as a
                                         property on the rbac() factory (module.exports.hasPermission),
                                         same cached lookup as the middleware itself, for programmatic
                                         (non-gating) checks inside a controller. rbac(module)
                                         middleware itself is byte-for-byte unchanged
```

### New/changed files, Sprint 048

```
modules/voyages/voyage.controller.js  ← Sprint048: update() resolves canOverride via
                                         rbac.hasPermission(req,'voyages','override') and passes it in,
                                         same shape as invoice.controller.js's Sprint046 pattern
modules/voyages/voyage.service.js     ← Sprint048: update(id,data,updatedBy,canOverride=false) — when
                                         canOverride, skips validateTransition()/STATUS_TRANSITIONS
                                         entirely, so status can be forced to any VOYAGE_STATUS value at
                                         any time. Non-override callers go through the exact same
                                         validateTransition() check as before, byte-for-byte unchanged.
                                         round.service.js#cascadeFirstVoyageToDeparted is untouched and
                                         was already independent of this whitelist (writes voyage.status
                                         directly via .save(), never calls validateTransition()) — see
                                         §16 gotcha re: a possible desync if a voyage is force-set out of
                                         forward order before its Round later goes Active
```

### `/backend/src/`

```
config/
  constants.js     ← BOOKING_STATUS=['Pending','Confirmed','Final Loading','Cancelled']
                     VOYAGE_STATUS, VESSEL_STATUS, TRACKING_STATUS, MODULES[]
                     MODULES includes 'dashboard' and 'auditLogs' (Sprint019)
  seed.js          ← Run via: npm run seed (NEVER auto-runs from server)
                     require.main===module guard ensures this
                     On every run: admin+demo passwords ALWAYS synced from .env
                     Migration: migrate-dashboard-auditlogs runs before permissions
                     Order: Roles→Perms→Users→Locations→Vessels→Agents→CTs
                     →ExpenseTypes→ExpenseCategories→Services→Routes→Rounds
                     →Voyages→Bookings→Expenses→Invoices→Tracking
  db.js            ← connectDB() with pool options: serverSelectionTimeoutMS:5000,
                     socketTimeoutMS:45000, maxPoolSize:10, minPoolSize:2
  env.js           ← validates required vars on startup; JWT_SECRET min 32 chars

middleware/
  auth.js          ← Sprint020: reads token from req.cookies.token FIRST,
                     falls back to Authorization: Bearer header
                     Cache-first user lookup: cache.get('user:<userId>'), TTL 60s
                     Invalidated by user.service on update/delete
  rbac.js          ← Sprint020: cache-first permission lookup: 'perm:<roleId>:<module>', TTL 120s
                     Invalidated by permission.service on save
                     Accepts optional actionOverride: rbac('bookings','import')
  auditLogger.js   ← Sprint020: FIRE-AND-FORGET via res.on('finish') + setImmediate
                     res.json called immediately (no await, no delay)
                     Audit write happens after response is sent
  upload.js        ← Sprint020: compressUpload middleware (multer → Sharp)
                     JPEG/PNG: resize max 1920px, quality 80 / compressionLevel 8
                     PDF: pass through unchanged
                     Export: { compressUpload } (named export, not default)
  errorHandler.js  ← reads err.statusCode || err.status (supports AppError + legacy throws)
                     Hides 5xx messages in production

modules/
  auth/
    auth.service.js      ← login() returns {token, user}; controller sets cookie
                           getMe(userId) for /auth/me rehydration
    auth.controller.js   ← cookieOptions(): httpOnly, secure:isProd,
                           sameSite: isProd?'none':'strict', maxAge:24h
                           login sets cookie, returns only {user} in body (no token)
                           logout clears cookie
    auth.routes.js       ← authLimiter (20 req/15min/IP) on login, forgot-password,
                           reset-password ONLY — nowhere else
                           /me route added: GET /auth/me → getMe
    auth.validation.js   ← NO .normalizeEmail() — removed Sprint020 (caused email mismatch)
                           Uses .trim() + .isEmail() only

  permissions/
    permission.service.js ← saveByRoleId uses bulkWrite; invalidates cache.delByPrefix('perm:<roleId>:')
    permission.routes.js  ← GET /:roleId has NO rbac guard (self-service, Sprint019 fix)
                            PUT /:roleId still requires rbac('roles')

  users/
    user.service.js      ← update/softDelete/acceptInvite call cache.del('user:<id>')

  expenses/
    expense.routes.js    ← uses compressUpload (not uploadExpense)
                           GET /:id/attachment BEFORE /:id (Sprint020 SEC-001 fix)
    expense.controller.js ← getAttachment: streams file via res.sendFile (auth required)
    expense.service.js   ← getAttachmentPath(id): returns {absPath, originalName, mimetype}

  invoices/
    invoice.routes.js    ← GET /:id/pdf BEFORE /:id (Sprint020)
    invoice.controller.js ← downloadPdf: streams PDFKit buffer
    invoice.service.js   ← getByIdForPdf(): deep populate vessel/voyage/POL/POD/contacts

  dashboard/
    dashboard.service.js ← Sprint020: 90s cache wrapper around computeStats()
                           cache key: 'dashboard:stats'
                           All 15 countDocuments + 5 aggregates in Promise.all

  bookings/
    bookingImport.service.js ← Sprint020: insertMany for new rows, bulkWrite for updates
                              nextNumberBatch() for pre-allocating numbers in one DB call
    booking.service.js   ← Sprint020: getVoyagePortIds uses single aggregate (1 round-trip vs 3)

  booking.model.js       ← compound indexes: {voyageId,status,isDeleted}, {agentId,status,isDeleted}
  invoice.model.js       ← compound indexes: {agentId,status,isDeleted}, {isDeleted,invoiceDate}
  auditLog.model.js      ← compound indexes: {module,timestamp}, {userId,timestamp}
  voyage.model.js        ← compound indexes: {roundId,status}, {serviceId,status,etd}

utils/
  cache.js         ← TtlCache class: get/set/del/delByPrefix/flush/size
                     Single shared instance exported as module.exports = new TtlCache()
  AppError.js      ← class AppError extends Error { statusCode, isOperational }
  autoNumber.js    ← nextNumber(key) + nextNumberBatch(key, count) [NEW Sprint020]
  invoicePdfGenerator.js ← PDFKit invoice PDF (clean minimal design, one accent #0D4A6B)
  mailer.js        ← escapeHtml() applied to name in all 3 email templates (Sprint020 SEC-007)
  responseHelper.js ← success, created, error, notFound, badRequest, unauthorized, forbidden, paginate

server.js:
  - Async IIFE startup: await connectDB() then app.listen() (ARCH-001 fix)
  - app.set('trust proxy', 1) — correct req.ip behind VPS nginx
  - compression() middleware (gzip all responses)
  - cookieParser() middleware
  - NO /uploads static route (removed Sprint020 SEC-001)
  - Graceful shutdown on SIGTERM/SIGINT
  - seed NOT called here — manual only via npm run seed
```

---

## 5. FRONTEND STRUCTURE

### New files added in Sprints 035-041

```
modules/reports/VoyageCapacityCard.jsx        ← Sprint038: one full-width card per voyage,
                                                 replaces CapacitySegmentTable on Round Capacity
                                                 Report page ONLY (CapacitySegmentTable itself is
                                                 untouched, still used on Vessel Details)
modules/dashboard/DashboardFilterContext.jsx  ← Sprint039: shared {roundId,voyageId,serviceId,
                                                 agentId,dateFrom,dateTo}, read via useDashboardFilters()
modules/dashboard/DashboardFilterBar.jsx      ← Sprint039: the one widget that writes the context above
modules/dashboard/QuickActionsWidget.jsx      ← Sprint039: New Booking/Expense/Invoice/Round/Import
                                                 buttons, gated by can(module,'create')
modules/dashboard/sections/*.jsx              ← Sprint039: OperationsSection, CommercialSection,
                                                 FinancialSection, BookingsSection, PerformanceSection,
                                                 AlertsSection — layout-only, own no data/query
modules/dashboard/widgets/*.jsx               ← Sprint039: OperationsWidgets, CommercialWidgets,
                                                 FinancialWidgets, BookingsWidgets, PerformanceWidgets,
                                                 AlertsWidgets, WidgetPrimitives, ChartPrimitives — each
                                                 widget owns its own useQuery + loading/empty/error state
app/(dashboard)/dashboard/page.jsx             ← Sprint039: rebuilt from one monolithic file into the
                                                 Sections/Widgets tree above; still isSuperAdmin-gated
```

### New files added in Sprints 042-046

```
utils/errorToast.jsx                          ← Sprint042: showErrorToast(error, actionType) —
                                                 'save'|'update'|'delete' fixed title + backend
                                                 message + per-field errors[] list when present. Used
                                                 by ~30 mutation call sites system-wide (replaces the
                                                 old duplicated flat-string onError bodies)
utils/voyageDisplayOrder.js                   ← Sprint043: ONE shared sort function — forward voyages
                                                 (podLegPos>=polLegPos) sorted by podLegPos asc, tie-
                                                 break polLegPos desc; backward voyages (round-trip,
                                                 podLegPos<polLegPos) always appended last. Reused by
                                                 VoyageList.jsx, RoundVoyageList.jsx, RoundCapacityReport.jsx,
                                                 VesselDetail.jsx — re-sorts a rendering-time COPY only,
                                                 never Voyage.sequence or capacity.service.js's own array
components/ui/BookingsSummaryCard.jsx         ← Sprint044: booking count + total revenue + per-
                                                 container-type breakdown (count+amount) — no individual
                                                 booking numbers. Used by InvoiceForm.jsx (Voyage/Round
                                                 scope), AgentFinancialAccount.jsx's Bookings tab, and
                                                 its Rounds tab's expandable Voyage-level bookings
                                                 (replaces EligibleBookingsTable.jsx, deleted, and
                                                 BookingsLedger/BookingRow, both deleted)
```

### New files added in Sprint 048

```
utils/voyageLabel.js                          ← Sprint048: getVoyageLabel(v) returns v.voyageName ||
                                                 v.voyageNumber || null — show only the name (falling
                                                 back to the auto-generated code when unnamed), never
                                                 both. Reused by ~25 components system-wide (voyage/round
                                                 tables, dropdowns, modal titles, confirm dialogs, detail
                                                 cards, chart labels, dashboard alerts/widgets). Round's
                                                 own roundNumber/roundName display is UNCHANGED — this
                                                 standard applies to Voyage only.
```

### New files added in Sprint 020

```
frontend/src/components/ui/PasswordInput.jsx  ← password field with eye toggle (forwardRef + RHF compatible)
frontend/src/components/ui/ConfirmModal.jsx   ← reusable confirm dialog (danger/warning/info variants)
frontend/src/hooks/useAgents.js               ← staleTime 5min
frontend/src/hooks/useVoyages.js              ← staleTime 5min
frontend/src/hooks/useServices.js             ← staleTime 10min
frontend/src/hooks/useRounds.js               ← staleTime 5min
frontend/src/hooks/useContainerTypes.js       ← staleTime 10min
frontend/src/hooks/usePorts.js                ← staleTime 10min
frontend/src/hooks/useVoyagePorts.js          ← enabled:!!voyageId
frontend/src/app/error.jsx                    ← root error boundary
frontend/src/app/(dashboard)/error.jsx        ← dashboard error boundary (keeps sidebar)
frontend/Dockerfile                           ← multi-stage, node:18-alpine
frontend/.dockerignore
```

### Key frontend files — current state

```
config/axios.js
  - withCredentials: true (sends httpOnly cookie automatically)
  - NO request interceptor for token (cookie is automatic)
  - 401 interceptor exempts: /auth/login, /auth/me, /auth/forgot-password, /auth/reset-password
  - Non-exempt 401: clear localStorage 'user', window.location.href='/login'

config/queryClient.js
  - Empty file — QueryClient now lives inside Providers.jsx

context/AuthContext.jsx
  - useState(() => localStorage.getItem('user')) for instant UI seed
  - isAuthenticated starts false always — confirmed by /auth/me only
  - useRef(rehydrated) guard: rehydrate() runs exactly once per mount
  - rehydrate(): GET /auth/me → 200 sets auth, 401 clears it (no redirect)
  - login(): POST /auth/login → server sets cookie → response has {user} only
  - logout(): POST /auth/logout → server clears cookie → clear local state
  - updateUser(updated): syncs state + localStorage

context/PermissionContext.jsx
  - permissionsLoaded flag added (Sprint019)
  - SuperAdmin fast-path: skip DB fetch (isSystem=true bypasses all checks)
  - GET /permissions/:roleId called on auth (no rbac guard on backend)

components/Providers.jsx
  - QueryClient created inside useState(() => new QueryClient({...}))
  - staleTime: 60_000 (60s default for all queries)
  - retry: 1, refetchOnWindowFocus: false

components/layout/Sidebar.jsx
  - Dashboard item: if (href==='/dashboard' && !isSuperAdmin) return null
    Checked by role identity (isSuperAdmin), NOT by permission system
  - Other modules: isHidden(module) || !can(module,'read') → hide

components/layout/Header.jsx
  - Sign out button (red hover) triggers ConfirmModal (variant="warning")
  - ConfirmModal: "Yes, sign out" / "Stay signed in" — loading state while logout fires

app/(auth)/login/page.jsx
  - Uses PasswordInput (eye toggle)
  - isLoading → show spinner (prevents flash before /auth/me resolves)
  - isAuthenticated → return null (no form flash during redirect)

app/(auth)/reset-password/page.jsx
  - Uses PasswordInput on both fields
  - Suspense boundary (Next.js 15 useSearchParams requirement)

app/(auth)/accept-invite/page.jsx
  - Uses PasswordInput on both fields
  - Suspense boundary (Next.js 15 useSearchParams requirement)

app/(dashboard)/layout.jsx
  - Imports usePermission alongside useAuth
  - Waits for permissionsLoaded before redirect (so can() has real values)
  - Non-SuperAdmin on /dashboard path → finds first FALLBACK_NAV entry → router.replace()
  - FALLBACK_NAV order: rounds→voyages→bookings→tracking→expenses→invoices→vessels→agents
    →services→reports→export→locations→container-types→expense-types→users→roles

app/(dashboard)/dashboard/page.jsx
  - Chart.js: targeted registration only (NOT ...registerables) → saves ~120KB
    Registered: CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement,
    LineController, BarController, DoughnutController, Tooltip, Legend, Filler
  - useMemo on all 5 chart data objects (JSON.stringify comparison) → no destroy/recreate
  - Charts use chart.update('none') when data changes (not destroy+recreate)
  - enabled: isSuperAdmin on useQuery → stats API never called for non-SuperAdmin
  - if (!isSuperAdmin) return <LoadingSpinner /> (layout is redirecting)

components/ui/PasswordInput.jsx
  - forwardRef wrapper, compatible with RHF {...register()}
  - tabIndex={-1} on eye button (doesn't interrupt tab flow)
  - Eye SVG ↔ Eye-off SVG toggle

components/ui/ConfirmModal.jsx
  - Props: open, onConfirm, onCancel, title, message, confirmText, cancelText, variant, loading
  - Variants: danger (red), warning (amber), info (blue)
  - Escape key closes, backdrop click closes
  - Auto-focuses Cancel button on open (safer default)
  - aria-modal, role=dialog, aria-labelledby
```

### Key frontend files changed, Sprints 042-046

```
modules/bookings/BookingImport.jsx
  - Sprint042: template download is now a network call (bookingsService.downloadImportTemplate())
    against the backend ExcelJS endpoint, not client-side XLSX.writeFile(); "Expected Excel Columns"
    guide card fetches its list from GET /bookings/import/template-columns (single source of truth)
  - Sprint042: preview table wrapper gained max-h-[65vh] overflow-y-auto + sticky header
  - Sprint045: importType gained 'discharge'; required Voyage selector (cascades from Round, discharge
    only); own simpler preview table (#, Status, Container No, Booking No, POL, POD, Issues) — the
    original 19-column Booking/Final Loading table is unchanged and still used for those two types

modules/bookings/BookingList.jsx
  - Sprint045: "Discharged"/"Remaining" tabs added next to "Operational Bookings" — all three share one
    query/table, scoped by dischargeStatus; new "Discharge" status-badge column on the table

modules/voyages/VoyageList.jsx
  - Sprint042: grouped-by-Round layout (Round label + its voyages table, repeating); Round column
    removed from the per-row table (redundant with the section label); Delete action added next to Edit
  - Sprint043: within each Round's group, voyages re-sorted via voyageDisplayOrder.js before render

modules/rounds/RoundVoyageList.jsx
  - Sprint043: re-sorts via voyageDisplayOrder.js on load and after adding a voyage

modules/reports/RoundCapacityReport.jsx, modules/vessels/VesselDetail.jsx
  - Sprint043: both re-sort a rendering-time copy of the capacity engine's voyages/voyageRows array via
    voyageDisplayOrder.js before handing it to CapacityTimeline/VoyageCapacityCard/CapacitySegmentTable

modules/vessels/components/CapacitySegmentTable.jsx, CapacityTimeline.jsx, reports/VoyageCapacityCard.jsx,
vessels/components/CapacityWarnings.jsx
  - Sprint045: red row/leg/card highlight + "N TEU remaining onboard" note wherever a voyage's
    remainingOnboardTEU > 0; CapacityWarnings gained an icon for REMAINING_ONBOARD_PAST_DISCHARGE

modules/invoices/InvoiceForm.jsx  [DELETED 2026-10-23; BillToSection now lives in modules/invoices/BillToSection.jsx]
  - Sprint044: Booking-type radio list gained max-h-[360px] overflow-y-auto; Voyage/Round scope auto-
    selects every eligible booking (useEffect on the eligible query) and renders BookingsSummaryCard
    instead of a checkbox table
  - Sprint046: EditInvoiceForm reads canOverride = can('invoices','override'); when true, `locked` is
    always false and the status <select> offers all 6 INVOICE_STATUS values; a pink banner explains
    the form is unlocked on purpose whenever the invoice would otherwise be locked

modules/agents/AgentFinancialAccount.jsx  [DELETED 2026-10-23; agents/[id] page = agent header + AgentV2Panel]
  - Sprint044: Bookings tab and the Rounds tab's expandable Voyage-level bookings both render
    BookingsSummaryCard instead of a flat per-booking table (BookingsLedger/BookingRow deleted)

modules/roles/PermissionMatrix.jsx
  - Sprint046: ACTIONS gained 'override' (pink column) — a real, working per-role toggle; setAll()
    ("All"/"None" quick-set) fixed to explicitly preserve a module's existing override value instead of
    silently dropping it when the object-literal shape it builds has no override key of its own

modules/voyages/VoyageEditForm.jsx
  - Sprint048: canOverride = can('voyages','override'); allowedStatuses is VOYAGE_STATUS (all 6 values)
    when canOverride, else the original [voyage.status, ...TRANSITIONS[voyage.status]] forward-only
    list. The amber "No further status transitions available" notice is replaced by a pink "Admin
    override active" note when canOverride && the voyage would otherwise have no further transitions —
    same UX precedent as InvoiceForm.jsx's Sprint 046 override banner, not a new pattern.
```

---

## 6. CRITICAL TECHNICAL RULES

### Authentication (Sprint020 — BREAKING CHANGE)

```
OLD: JWT stored in localStorage, sent as Authorization: Bearer header
NEW: JWT stored in httpOnly cookie, sent automatically by browser

Cookie settings:
  httpOnly: true
  secure:   NODE_ENV === 'production'
  sameSite: production → 'none' | development → 'strict'
  maxAge:   24h

Frontend:
  axios.create({ withCredentials: true }) — sends cookie on every request
  NO manual token handling in axios request interceptors

Backend:
  auth.js reads req.cookies.token first, then Authorization header (fallback for API tools)
  /auth/login: sets cookie, returns {user} in body (no token in body)
  /auth/logout: clears cookie
  /auth/me: GET — returns current user from valid cookie (used for rehydration)

EXEMPT from 401 redirect interceptor: /auth/login, /auth/me, /auth/forgot-password, /auth/reset-password
```

### Dashboard is SuperAdmin-only by ROLE IDENTITY

```
The dashboard analytics page (not the ERP app) is SuperAdmin-only.
This is enforced by isSuperAdmin = user?.roleId?.isSystem === true.
NOT enforced through the permission system.

Sidebar: if (href === '/dashboard' && !isSuperAdmin) return null
Dashboard page: enabled: isSuperAdmin on useQuery
Layout: non-SuperAdmin on /dashboard → redirect to first allowed module
```

### MongoDB $unwind — ALWAYS preserveNullAndEmptyArrays

```js
// CORRECT
{ $unwind: { path: '$field', preserveNullAndEmptyArrays: true } }
// WRONG — silently drops unmatched docs, causes 500 errors
{ $unwind: { path: '$field', preserveNullAndEmpty: true } }
```

### Seed file — never auto-run from server

```js
// CORRECT — in seed.js
if (require.main === module) {
  connectDB().then(() => seed()).then(() => process.exit(0))
}
// Run manually: npm run seed
// Passwords ALWAYS synced on every seed run (not skipped if user exists)
```

### Expense file serving — authenticated only

```
No express.static('/uploads') — removed Sprint020
Files served via: GET /api/v1/expenses/:id/attachment
Requires auth + rbac('expenses')
```

### Image uploads — Sharp compression

```
compressUpload middleware (not uploadExpense):
  multer saves file → Sharp compresses JPEG/PNG (max 1920px, quality 80)
  PDF files pass through unchanged
  Export: const { compressUpload } = require('../../middleware/upload')
```

### In-memory cache — invalidation rules

```
User cache ('user:<userId>'): invalidated on user update/softDelete/acceptInvite
Permission cache ('perm:<roleId>:<module>'): invalidated via cache.delByPrefix('perm:<roleId>:') on permission save
Dashboard cache ('dashboard:stats'): TTL 90s only, no manual invalidation
```

### Audit logger — fire-and-forget

```
res.json() is called immediately (response NOT delayed)
AuditLog.create() fires in setImmediate inside res.on('finish')
If AuditLog fails: logged to logger.error, never affects response
```

### Validation — no normalizeEmail

```
auth.validation.js uses .trim().isEmail() ONLY
No .normalizeEmail() — it transforms addresses aggressively and causes login failures
auth.service.js does email.trim().toLowerCase() itself
```

### Next.js 15 — useSearchParams requires Suspense

```jsx
// ANY page using useSearchParams() MUST be wrapped:
export default function Page() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <InnerComponent />  {/* useSearchParams() lives here */}
    </Suspense>
  );
}
// Affected pages: /reset-password, /accept-invite
// Build will fail with prerender error if missing
```

### Next.js 15 — Async Params

```jsx
import { use } from 'react';
export default function Page({ params }) {
  const { id } = use(params);
}
```

### Import Paths — Always @/

```
✅ @/components/ui/Modal
❌ ../../components/ui/Modal
```

### Modal — createPortal

```
Modal.jsx uses createPortal(content, document.body)
Layout uses overflow:clip NOT overflow:hidden
```

### Report Pattern — refetch()

```js
// CORRECT
const { data, refetch } = useQuery({ queryKey:['x'], queryFn:fn, enabled:false });
const handleRun = () => refetch();

// WRONG — fires once only
const [run, setRun] = useState(false);
useQuery({ enabled: run });
```

### totalFreight — Server-side only

```
totalFreight = quantity × freightRate — computed server-side, never from client
```

### autoNumber.js

```js
require('../modules/counters/counter.model')  // CORRECT
require('../counters/counter.model')           // WRONG — missing 'modules'

// Sprint020: batch mode
const numbers = await nextNumberBatch('booking', count); // pre-allocates N numbers in 1 round-trip
```

### Chart.js — targeted registration only

```js
// CORRECT (Sprint020) — ~120KB smaller bundle
import { Chart, CategoryScale, LinearScale, ... } from 'chart.js';
Chart.register(CategoryScale, LinearScale, ...);

// WRONG — loads all chart types
Chart.register(...registerables);
```

### Export ZIP

```
buildZipStream(exportList, res)  // CORRECT
exportZip(...)                   // WRONG — shadows Node.js exports object
```

### Mongoose Indexes — no duplicates

```
Use unique:true inline on field definition only.
Do NOT add schema.index({ field:1 }) for the same field — causes duplicate warning.
```

### AppError vs legacy throws

```js
// Preferred (Sprint020)
throw new AppError(404, 'Booking not found');

// Legacy (still works — errorHandler reads err.statusCode || err.status)
throw { status: 404, message: 'Booking not found' };
```

---

### Layer 2 Import Architecture — Sprint 026 (superseded by Sprint 031 for scope)

```
IMPORT SCOPE / MATCHING KEY / BUSINESS IDENTITY, and the Voyage-scoped
Final Loading reconciliation described below, are SUPERSEDED by Sprint 031:
  scope is now (Round + Agent), not (Voyage + Agent), and Final Loading
  reconciliation now spans every voyage in the Round. See the Sprint 031
  section above for the current rule — do not follow the Voyage-scoped
  version below for new work. The rest of this section (Excel column
  aliases, schema, per-row validation) is still current and unchanged.

BOTH import modes use this scope. Bookings of other agents on the same
voyage are NEVER compared, updated, or cancelled.

Booking Import (importType = 'booking'):
  Container Number found in (Voyage + Agent) scope   -> UPDATE   [Sprint 031: now (Round + Agent)]
  Container Number not found in (Voyage + Agent) scope -> CREATE
  No cancellations. No reconciliation.

Final Loading Import (importType = 'finalLoading'):
  Container Number found  -> UPDATE
  Container Number not found -> CREATE
  After save: all (Voyage + Agent) bookings NOT in manifest -> Cancelled   [Sprint 031: now entire Round + Agent]
  Other agents' bookings: NEVER affected

EXCEL COLUMN MAP key aliases (Sprint 026):
  Hazardous / DG / Dangerous Goods  ->  dg field (Boolean)
  IMDG Code / IMDG                  ->  imdgCode field (String, required if dg=true)
  Size / Length / Container Size     ->  containerSize field
  Carrier / Carrier Name             ->  carrierName field
  Currency                           ->  REMOVED (not mapped)
  DG% / DG Percent                   ->  REMOVED (replaced by IMDG Code)

SCHEMA (booking.model.js):
  dg:       Boolean (internal field name; UI label = Hazardous)
  imdgCode: String  (replaces dgPercent; required when dg=true)
  dgPercent: REMOVED from schema

VALIDATION (bookingImport.service.js validateRow):
  containerStatus: REQUIRED (Full or Empty)
  currency: REMOVED
  imdgCode: Required if dg=true

DO NOT re-add currency, dgPercent, or quantity anywhere in Layer 2.
DO NOT change the dg field name in the schema.
DO NOT scope the import cancel query to a single voyage — always
(Round's voyage set) + agentId (Sprint 031).
```

### ManualBooking (Layer 1) — Sprint 023

```
ManualBooking is the commercial reservation layer inside the Booking module.
Collection: manualbookings
Auto-number: MB-000001 (counter key: 'manualBooking')

Key differences from Layer 2 (Booking):
  - NO containerNumber (not known at reservation time)
  - Multi-row cargoRows[] array (one row per container type)
  - DG: dg (Boolean) + dgValue (free text) — NOT dgPercent
  - commodity + vgm belong to each cargo row, not the booking header
  - totalFreight / totalTEU / totalUnits server-computed from cargoRows

Layer 1 Capacity Rule:
  ManualBookings with status Pending, Confirmed, or Final Loading
  ALL count toward voyage capacity immediately.
  Only Cancelled and isDeleted=true are excluded.
  Rationale: capacity is a commercial planning indicator.

Layer 2 Capacity Rule (corrected, Sprint 032 — this was already the actual
running behavior since Sprint 025, this entry was simply never updated):
  Pending, Confirmed, and Final Loading ALL count toward voyage capacity.
  Only Cancelled and isDeleted=true are excluded — same rule as Layer 1.
  See capacity.service.js L2_STATUSES (comment: "Sprint 025: Pending now
  included").

Routes (inside existing booking.routes.js, same /api/v1/bookings prefix):
  GET    /bookings/manual
  POST   /bookings/manual
  GET    /bookings/manual/:id
  PUT    /bookings/manual/:id
  DELETE /bookings/manual/:id
  — placed ABOVE /:id to avoid route collision

RBAC: reuses existing 'bookings' module — no new MODULES[] entry

Frontend: BookingList.jsx tab strip (Operational / Manual)
  MB- numbers shown in purple; BK- in teal.
  New Manual Booking button: /bookings/new-manual
  Detail page: /bookings/manual/:id

Cache invalidation:
  manualBooking.service.js create/update/softDelete
  → invalidateRoundCache(voyage.roundId)  (same pattern as booking.service.js)
```

### Capacity Engine — Voyage-Based (Sprint 023 correction from Sprint 022)

```
Previous: walked route legs, created synthetic segments between adjacent ports.
Current:  walks actual Voyage documents in the round. One capacity row per voyage.

If Port1→Port3 is a manual voyage (no Port2 call),
you get ONE capacity row for Port1→Port3. No synthetic Port1→Port2 row.

Onboard TEU per voyage = L1_TEU + L2_TEU
  L1_TEU: sum of ManualBooking.totalTEU for voyageId (Pending+Confirmed+FL)
  L2_TEU: sum of Booking.quantity × resolveTEU(size) for voyageId (Confirmed+FL)

Payload change from Sprint 022:
  segments[] and ports[] → REMOVED
  voyages[]              → ADDED (one per actual Voyage in round)
  totals.peakSegmentIndex → totals.peakVoyageId
  SEGMENT_OVERBOOKED warning → VOYAGE_OVERBOOKED
  BOOKING_PORT_NOT_IN_ROUTE / INVALID_DIRECTION / BOOKING_INTO_UNCALLED_PORT → REMOVED

All endpoint paths unchanged:
  GET /api/v1/capacity/round/:roundId
  GET /api/v1/capacity/vessel/:vesselId/active
  POST /api/v1/capacity/preview  (now uses voyageId instead of polId+podId)

computeVoyagePreview(roundId, voyageId, quantity, containerTypeId)
  renamed from computeSegmentPreview
  booking.service.js pre-flight updated to pass voyageId
```

```
Vessel capacity is measured in TEU, NOT by container count.

TEU is derived ONLY from container size via utils/teuResolver.js:
  20ft  → 1 TEU
  40ft  → 2 TEU
  40HC  → 2 TEU
  45ft  → 2 TEU
  unknown → 1 TEU + MISSING_TEU_MAPPING warning

Container TYPE (Dry, Reefer, etc.) is COMPLETELY IGNORED by the capacity engine.

Formula:
  effectiveTEU = booking.quantity × TEU(containerTypeId.size)

Capacity is per SEGMENT (leg pair), not per voyage or vessel total.
A booking on P1→P3 occupies Segment 1 AND Segment 2.

Capacity module location:
  backend/src/modules/capacity/capacity.service.js  ← pure computation, no DB writes
  backend/src/utils/teuResolver.js                 ← resolveTEU(size) → {teu, matched}

Key functions:
  computeRoundCapacity(roundId, opts)        ← full per-leg payload
  computeVesselActiveCapacity(vesselId)      ← current Active round only
  computeSegmentPreview(roundId, pol, pod, qty, ctId)  ← pre-flight check (Phase 4)
  invalidateRoundCache(roundId)              ← call this after any mutation

Cache:
  Key: 'capacity:round:<roundId>'
  TTL: 60 seconds
  Uses Sprint 020 cache.js (same shared Map instance)

CRITICAL RULE: Any service that mutates bookings, voyages, or rounds
MUST call invalidateRoundCache(roundId) after saving.
  booking.service.js  ← create, update, softDelete
  bookingImport.service.js ← saveImport
  voyage.service.js   ← status transitions
  round.service.js    ← update

NO invalidation on ContainerType changes — TEU is derived from size string,
not a stored field. Server restart clears cache if resolveTEU logic changes.

Vessel Detail page:
  Shows CURRENT ACTIVE ROUND capacity only (not historical, not all rounds).
  Empty state if no Active round exists.
  Components: CapacityTimeline.jsx, CapacitySegmentTable.jsx, CapacityWarnings.jsx
    (frontend/src/modules/vessels/components/)

Pre-flight enforcement (Phase 4 — feature-flagged):
  ENABLE_CAPACITY_ENFORCEMENT env var:
    unset → disabled (default, zero overhead)
    'warn' → overbooking creates booking + attaches _capacityWarning to response
    'strict' → overbooking throws AppError(400)
  BookingForm.jsx shows amber warning banner when _capacityWarning is present.
```

### Capacity Engine — Multi-Voyage Transit Fix (Sprint 028, BUG-004 REVISION 3)

```
Bug: computeVoyagePreview's podId resolution originally used a single global
port map, which broke when a round called the same port more than once
(ambiguous which occurrence was the discharge point) and under-counted
capacity usage on multi-leg transits (a container loaded on voyage 1 of a
3-voyage round and discharged on voyage 3 must occupy voyages 1, 2, AND 3 —
not just voyage 1).

Fix: podId resolution now walks FORWARD from the load voyage's own index
through current.voyages[], matching on toPort.portId, never a global map:

  let dischargeIdx = null;
  for (let i = loadIdx; i < current.voyages.length; i++) {
    if (String(current.voyages[i].toPort.portId) === String(podId)) {
      dischargeIdx = i;
      break;
    }
  }

The container transits every voyage from loadIdx to dischargeIdx inclusive.
The bottleneck voyage (lowest remaining capacity across that transit range)
is what canFit/remainingAfter/utilisationAfter are computed against — not
just the load voyage.

Same forward-walk pattern (resolveDischargeIdx) is shared by the main
computeRoundCapacity aggregation (Step C/D event resolution) so preview and
actual capacity use identical logic.

Location: backend/src/modules/capacity/capacity.service.js
  computeVoyagePreview()  ← preview/pre-flight (booking.service.js create())
  resolveDischargeIdx()   ← shared forward-walk, used by both preview and
                            the full round aggregation

DO NOT reintroduce a global port→voyage map for discharge resolution —
repeated ports in the same round make it ambiguous by construction.
```

### Capacity Table — Exact-Segment "Loaded" Display Fix (Sprint 029)

```
Bug: the "Loaded" column in CapacitySegmentTable.jsx showed a booking's full
TEU on every voyage it merely transited (per Sprint 028's multi-voyage fix),
which is correct for onboard/remaining/utilisation math but misleading as a
"Loaded here" figure — a container loaded on voyage 1 and discharged on
voyage 3 was shown as "Loaded" on voyages 2 and 3 as well.

Fix: added a presentation-only exactSegment flag per booking event, true
only when the booking's own polId/podId exactly match the anchor voyage's
fromPort/toPort — NOT when loadIdx === dischargeIdx (that still allows
multi-voyage transits with a same-index coincidence):

  const exactSegment =
    String(b.polId) === String(anchorVoyage.polId?._id || anchorVoyage.polId) &&
    String(b.podId) === String(anchorVoyage.podId?._id || anchorVoyage.podId);

New parallel aggregation arrays (presentation only, computed alongside the
real onboard chain but NOT feeding it):
  loadedExactTEU[i], loadedExactL1[i], loadedExactL2[i]

CRITICAL: loadedTEU/dischargedTEU (unqualified) remain the sole source of
truth for onboardStart/onboardTEU/remainingTEU/utilisationPct. loadedExact*
is exposed on the per-voyage payload purely for the "Loaded" column and must
never be substituted into the onboard carry-forward calculation.

Location:
  backend/src/modules/capacity/capacity.service.js — l1Events/l2Events
    exactSegment flag, loadedExactTEU/L1/L2 arrays
  frontend/src/modules/vessels/components/CapacitySegmentTable.jsx
    "Loaded" column renders v.loadedExact.teu (not v.loadedTEU)
```

### Booking POL/POD Server-Derivation + Round→Voyage Cascading Filters (Sprint 030)

```
POL/POD are no longer client-submitted on either Booking (Layer 2) or
ManualBooking (Layer 1). They are always derived server-side from the
selected voyage's own polId/podId — since voyageId is already immutable
post-creation, POL/POD (which follow the voyage) must stay immutable with it.

booking.service.js:
  create(): strips client-sent polId/podId from data, sets
    polId: voyage.polId, podId: voyage.podId  (from the looked-up Voyage doc)
  update(): strips polId/podId/voyageId from data entirely — not editable
    independently of voyageId

manualBooking.service.js: same pattern (strip + derive from voyage on create;
  strip on update).

validation (booking.validation.js, manualBooking.validation.js):
  polId/podId body validators REMOVED — no longer accepted from the client.

Frontend forms (BookingForm.jsx, ManualBookingForm.jsx):
  POL/POD are read-only display fields — always the selected voyage's own
  ports, never independently selectable inputs.

Round → Voyage cascading filters (BookingForm.jsx, ManualBookingForm.jsx,
BookingList.jsx, BookingImport.jsx):
  Round is a UI-only selector — NOT stored on the booking. Selecting a Round
  narrows the Voyage dropdown (voyagesService.list({ roundId, ... })).
  On edit, Round is preselected from the existing voyage's roundId.
  BookingList.jsx: separate roundId/voyageId filter state per tab
    (Operational: roundId/voyageId; Manual: manualRoundId/manualVoyageId).
  BookingImport.jsx: roundId filters the Voyage dropdown; Cancelled voyages
    filtered out client-side. SUPERSEDED by Sprint 031 — Import no longer
    has a file-wide Voyage dropdown at all; see below.

DO NOT add polId/podId back as client-editable fields on either booking
layer — they must always follow the voyage.
```

### Layer 2 Import — Round-Scoped Multi-Voyage Resolution (Sprint 031)

```
Problem this replaces: Import previously required ONE voyageId for the
whole file, but one Excel file can legitimately contain rows for MULTIPLE
voyages in the same Round (e.g. Round with legs Shanghai→Ningbo,
Ningbo→Singapore, Singapore→Jeddah, all in one manifest). Forcing one
voyage per file either mis-anchored rows (voyageId disagreeing with the
row's real POL/POD) or required one import run per voyage. Fully
superseded — do not reintroduce a single file-wide voyageId selector.

New workflow: user selects Agent + Round + Import Type ONLY. No Voyage
selector. Each row resolves its OWN target voyage from its own POL/POD,
matched against the Round's own (non-Cancelled) voyages:
  exactly one match  -> auto-resolved, silent, no user action
  zero matches       -> 'unresolved' — user must pick a voyage manually
  2+ matches         -> 'ambiguous' — user must pick from the candidates
Manual selection is the EXCEPTION path only (row.voyageOverrideId),
never the default — do not add a per-row selector for every row.

Booking Storage Rule (system standard, extends the Sprint 030 rule to
Import — the last entry point that didn't yet follow it):
  Booking.polId / Booking.podId are ALWAYS copied from the row's resolved
  Voyage document — NEVER from the row's own free-text-resolved POL/POD.
  The row's own POL/POD text is used ONLY as matching input to find the
  voyage; once resolved (auto or manual), the row's own resolved ports
  are discarded. This applies identically whether the voyage was
  auto-matched or manually overridden.
  DO NOT store polId/podId independently of the resolved voyage, ever.

Import scope / matching key (supersedes the Sprint 026 Voyage+Agent
scope for Import specifically):
  IMPORT SCOPE      = (Round + Agent)
  MATCHING KEY      = Container Number
  BUSINESS IDENTITY = (Round + Agent + Container Number)
  An existing Booking is matched for UPDATE by containerNumber, scoped to
  the agent and to ANY voyage belonging to the selected Round — not one
  specific voyageId. A container's voyageId/polId/podId can be corrected
  by a later import run within the same Round (updates in place, does
  NOT create a duplicate).

Final Loading Business Rule (confirmed, final):
  Final Loading represents the ENTIRE Round for ONE Agent — NOT one
  voyage. After a Final Loading import: existing containers in scope are
  updated, new ones created, and any booking for that agent, on ANY
  voyage in the Round, whose container is NOT in the manifest is
  Cancelled. Other agents are never affected (agentId filter unchanged).
  Reconciliation queries use `voyageId: { $in: roundVoyageIds }`, not a
  single voyageId — same compound index (`{voyageId:1,status:1,
  isDeleted:1}`) already on Booking, no new index needed.

Audit note (reuses `remarks`, no new schema field):
  When a row's voyage was manually resolved AND its own free-text POL/POD
  disagree with the resolved voyage's actual ports, saveImport appends a
  note to `remarks` recording the original Excel text and the corrected
  voyage. Ordinary rows/updates leave `remarks` untouched, same as before.

Capacity Engine: UNCHANGED — confirmed no line of capacity.service.js,
capacity.controller.js, or teuResolver.js needed to change. This sprint
only guarantees the voyageId/polId/podId the engine already consumes are
now always internally consistent.

Location:
  backend/src/modules/bookings/bookingImport.service.js
    previewImport(rows, agentId, roundId, importType) — Round-scoped
      resolution via resolveRowVoyage(); validateRow() no longer treats
      "POL/POD not found" as a hard error — it becomes 'unresolved'
      instead, recoverable via manual voyage selection.
    saveImport(rows, agentId, roundId, importType, createdBy) — groups
      insert/update by each row's own r._resolvedVoyage; Final Loading
      reconciliation scoped to roundVoyageIds.
  backend/src/modules/bookings/bookingImport.controller.js — accepts
    roundId (not voyageId) in both preview and save.
  frontend/src/modules/bookings/BookingImport.jsx — Round-only selector;
    per-row Voyage column (read-only when auto-resolved, inline <select>
    scoped to the Round's active voyages only for 'unresolved'/
    'ambiguous' rows); new row states 'unresolved'/'ambiguous' (amber/
    orange, distinct from red 'invalid').

DO NOT scope the import match/cancel query to a single voyageId — always
(Round's voyage set) + agentId.
DO NOT bring back a file-wide Voyage selector on the Import screen.
DO NOT store polId/podId from row text independently of the resolved
voyage.
```

### Vessel Details KPI Standard — Layer 1 + Layer 2 Combined (Sprint 032)

```
System-wide standard, effective this sprint: every booking-related
statistic on the Vessel Details page that represents vessel business
activity MUST include BOTH Layer 1 (ManualBooking) and Layer 2 (Booking),
using the capacity engine's already-established dual-layer pattern
(capacity.service.js L1_STATUSES/L2_STATUSES) as the reference — not a
new rule. Mixing Layer-2-only data with combined data on the same page is
not permitted anywhere in this module.

Before this sprint: vessel.service.js#getVesselStats's booking-derived
KPIs (Total Bookings, Total Revenue, Bookings by Status, Agents table)
queried ONLY Booking (Layer 2), with no status exclusion at all — while
the capacity gauge on the SAME page already correctly included both
layers and excluded Cancelled. The two blocks silently disagreed.

Total Bookings = (Layer 1 count, status != Cancelled)
                + (Layer 2 count, status != Cancelled)

Total Revenue  = (Layer 1 sum(totalFreight), status != Cancelled)
                + (Layer 2 sum(totalFreight), status != Cancelled)
  totalFreight confirmed as the correct, only revenue field on both
  models — identical field name/semantics on Booking and ManualBooking.

Bookings By Status = ONE combined breakdown, NOT split by layer:
  Pending       = Layer1.Pending       + Layer2.Pending
  Confirmed     = Layer1.Confirmed     + Layer2.Confirmed
  Final Loading = Layer1.FinalLoading  + Layer2.FinalLoading
  Cancelled     = Layer1.Cancelled     + Layer2.Cancelled
  Cancelled IS shown here (its own status slice) — it is only excluded
  from the two headline totals above, not hidden from the page entirely.

Agents table bookingCount = Layer 1 + Layer 2 combined per agentId,
  Cancelled excluded — ManualBooking.agentId confirmed present, required,
  same shape as Booking.agentId, no schema change needed.

Location: backend/src/modules/vessels/vessel.service.js#getVesselStats
  — two Promise.all'd aggregates per block (Booking + ManualBooking),
  merged in JS by status label / agentId. No change to
  capacity.service.js, capacity.controller.js, teuResolver.js, or any
  Sprint 028/029/030/031 logic — this sprint brought the KPI block INTO
  alignment with the capacity engine, the engine itself was already
  correct and unchanged.

Also removed: a dead totalQty: { $sum: '$quantity' } aggregate field —
  `quantity` was removed from the Booking schema in Sprint 025/026 (one
  booking = one container); this was silently summing to 0 and was never
  read anywhere.

DO NOT reintroduce a Layer-2-only booking KPI anywhere on this page.
DO NOT split the Bookings-by-Status view by layer — one combined view.
DO NOT let Cancelled bookings count toward Total Bookings/Total Revenue.
```

### Booking Import Table — Responsive Overflow Containment (Sprint 032)

```
Bug: BookingImport.jsx's preview table (19 columns after Sprint 031 added
a Voyage column) had no local horizontal-scroll containment — its table
wrapper was an empty <div className=""> (no overflow-x-auto) inside a
card with no min-w-0. The table's large intrinsic min-content width
(driven by per-column min-w-[Npx] cells) had nowhere to scroll locally,
so it propagated all the way up through the dashboard layout's flex
column, widening the entire page and forcing a browser-level horizontal
scrollbar that also scrolled the sidebar/header out of view.

Fix: applied the SAME min-w-0 (card) + overflow-x-auto (table's direct
wrapper) pattern already used by every other table page in the codebase
(BookingList.jsx, VoyageList.jsx, VesselList.jsx, ExpenseList.jsx,
ServiceList.jsx, RoundList.jsx, InvoiceList.jsx, TrackingList.jsx) — no
new CSS pattern was invented. An explicit style={{ minWidth: 1600 }} was
added to the <table> itself for a defined scroll threshold, matching the
minWidth convention already used elsewhere (e.g. BookingList.jsx's
minWidth: 800/700).

DO NOT modify app/(dashboard)/layout.jsx to fix a single page's overflow
— the layout's shared flex containers are intentionally left as-is
(confirmed: fixing the table's own wrapper is sufficient, since it stops
the oversized width from ever reaching the layout's flex ancestor).
Horizontal overflow containment is, and remains, a PER-PAGE
responsibility — every table-bearing page must supply its own
min-w-0 + overflow-x-auto pair; the shared layout does not and should not
cap width itself.

Location: frontend/src/modules/bookings/BookingImport.jsx (table wrapper
  only — no other file changed for this fix).
```

### Invoice & Agent Financial System (Sprint 033)

> **SUPERSEDED 2026-10-23 (V2-only conversion): the V1 invoice model rules below (Payment.allocations, recalcInvoiceStatus, V1 create/update, getAgentFinancialAccount, /payments, /invoices/eligible-bookings, migrate-invoice-v2) no longer exist.** Kept below as history only. Do not build against it.

> Still true: line items are historical snapshots, ownership is one-sided in `Invoice.lineItems`, only Final Loading bookings are invoiceable. Current rules: §6 "Version 2".

```
Invoice is no longer 1:1 with a single Booking. It is now a header +
lineItems[] array, tagged with invoiceType: 'Booking' | 'Voyage' | 'Round':
  Booking type — exactly one Final Loading booking (today's flow, minus
    Confirmed/Pending now being unselectable).
  Voyage type  — voyageId + a selected subset of that agent's Final
    Loading bookings on that voyage.
  Round type   — roundId + a selected subset of that agent's Final
    Loading bookings across every voyage in that round.

INVOICE ELIGIBILITY (hard rule, enforced server-side in invoice.service.js):
  Only Bookings with status === 'Final Loading' can ever become a line
  item. Pending and Confirmed bookings are never invoiceable. This is
  the ENTIRE reportable/invoiceable population for an agent — Agent
  Financial Account KPIs (Total Revenue, etc.) are scoped to Final
  Loading bookings only, same population, no exceptions.

LINE ITEM = HISTORICAL SNAPSHOT, not a live reference:
  Each lineItems[] entry stores bookingNumber, containerNumber,
  voyageNumber, roundNumber, polName, podName, shipper, consignee,
  commodity, freightAmount — captured at the moment the booking is added
  to the invoice. bookingId/voyageId/roundId remain only as reference
  links (drill-down, orphan-flagging) — snapshot fields are NEVER
  re-read from the live Booking/Voyage/Round documents. A historical
  invoice/PDF stays correct even if the booking is edited later.

BOOKING <-> INVOICE OWNERSHIP IS ONE-SIDED — Invoice.lineItems ONLY:
  Booking.model.js has NO invoiceId field and never will. "Is this
  booking already invoiced" is always answered from the Invoice side:
    Invoice.exists({ 'lineItems.bookingId': id, isDeleted: false,
                     status: { $ne: 'Cancelled' } })
  Multikey index: Invoice.index({ 'lineItems.bookingId': 1 }).
  DO NOT add an invoiceId (or any invoicing-state field) to
  booking.model.js — this was deliberately rejected in favor of
  one-sided ownership (see sprints/033-sprint.txt "BOOKING–INVOICE
  OWNERSHIP" for the full rationale).
  invoice.service.js#create() wraps the claim-check + insert in a
  Mongoose session.withTransaction() so two concurrent requests cannot
  both claim the same booking.

PAYMENT MODEL — explicit per-line-item allocation, NOT proportional:
  Payment.allocations: [{ bookingId, amount }] states EXACTLY which
  booking(s) a payment covers and how much for each. Payment.amount is
  always the derived sum of allocations — never entered separately.
  A booking's paid amount is an EXACT read:
    sum(Payment.allocations[].amount) for every non-voided Payment on
    that invoice where allocations[].bookingId === this booking.
  DO NOT reintroduce proportional/estimated allocation
  (paidAmount x freightShare) — this was explicitly rejected because
  real agents pay specific bookings (pay A only, pay A+B leave C, pay
  one container today and another later), not a percentage split.
  payment.service.js#create() validates every allocation against the
  invoice's own lineItems and re-checks each booking's already-allocated
  total inside a transaction before accepting (no overpayment, no race).
  A payment is never edited or partially voided — only voided as a
  whole (isVoided/voidedAt/voidedBy/voidReason); to correct one
  allocation, void the payment and record a new one.

INVOICE STATUS — derived, never hand-set once payments exist:
  invoice.service.js#recalcInvoiceStatus() is the ONLY place status
  becomes 'Partially Paid'/'Paid'/'Overdue':
    paidAmount === 0        -> Issued (or Overdue if past dueDate)
    0 < paidAmount < total  -> Partially Paid
    paidAmount >= total     -> Paid
  Manual transitions (invoice.service.js#update()) are limited to
  Draft -> Issued -> Cancelled, and are blocked entirely once
  invoice.paidAmount > 0.

EDGE CASE — Final Loading auto-cancel orphaning an invoiced booking:
  bookingImport.service.js's Sprint 031 reconciliation can cancel a
  Final Loading booking that is ALREADY a line item on a non-cancelled
  invoice (since only Final Loading bookings are ever invoiced, these
  two populations fully overlap). After its cancellation sweep it flags
  the matching line item directly (arrayFilters, NOT a Booking field):
    lineItems.$[li].orphaned = true / orphanedAt / orphanedReason
  Surfaced as a warning badge on Invoice Detail and in the Agent
  Financial Account's Bookings level — never silently left unflagged.

AGENT FINANCIAL ACCOUNT (replaces the old edit-only Agent Details page):
    getAgentFinancialAccount(id) — ONE function builds the entire
  Round -> Voyage -> Booking statement tree + agent-level KPIs in a
  single call, same shape as vessel.service.js#getVesselStats. Bounded
  to the agent's most recent 20 rounds.
  frontend/src/modules/agents/AgentFinancialAccount.jsx — 7-tab strip
  (Overview / Financial Summary / Rounds / Voyages / Bookings /
  Invoices / Payments). Rounds renders as the connected statement itself
  (expandable Round -> Voyage -> Booking rows, each level showing its
  own Total Freight / Total Paid / Remaining Balance before expanding).
  app/(dashboard)/agents/[id]/page.jsx now defaults to this statement,
  with an "Edit Agent" toggle that swaps in the existing AgentForm — no
  new route, no /edit path.

API additions:
  GET  /agents/:id/financial-account
  GET  /invoices/eligible-bookings?agentId=&voyageId=|roundId=  (Final
       Loading only, excludes anything already claimed by another
       non-cancelled invoice — Decision 6 composition table)
  GET  /invoices/:id/payments
  POST /invoices/:id/payments        body: { paymentDate, method,
       reference, notes, allocations: [{ bookingId, amount }] }
  POST /invoices/:id/payments/:paymentId/void
  GET  /payments?agentId=            (Agent Details "Payments" tab)

Migration: backend/src/config/migrations/migrate-invoice-v2.js — one-time,
  guarded (require.main === module), run manually via
  `npm run migrate:invoice-v2`. Converts every pre-Sprint-033 Invoice
  (bookingId + amount) into the lineItems[] shape by snapshotting the
  current Booking/Voyage/Round/Port data; backfills one synthetic
  Payment (with a real allocations[] entry) for any invoice that was
  already Paid. Writes nothing to Booking.

DO NOT touch capacity.service.js, capacity.controller.js, teuResolver.js,
manualBooking.model.js, rounds/*, or voyages/* for anything invoice/
payment related — Sprint 033 only ever reads from them.

Full design rationale, business decisions, and scenario walkthroughs:
sprints/033-sprint.txt.
```

### Booking Reports Modernization (Sprint 034)

```
TASK 1 — Booking Report migrated to dual-layer (Layer 1 + Layer 2):
  reports.service.js#getBookingReport now queries BOTH Booking and
  ManualBooking, merges + tags each row (layer: 'Operational' | 'Manual'),
  sorts the combined set by createdAt, and paginates in JS — same
  merge-in-JS shape as vessel.service.js#getVesselStats (Sprint 032).
  Legacy dead fields removed: `quantity` (gone from Booking since
  Sprint 025/026) and `totalSlots` (no backing field since Sprint 017)
  no longer appear anywhere in this report. "Total Units" is now Layer
  1's real totalUnits sum only — Layer 2 has no unit-count concept
  ("one booking = one container"). Row list and summary now share one
  buildMatch() status/Cancelled rule — fixed a latent bug where the old
  summary aggregate silently discarded the user's own status filter.
  containerNumber added to Layer 2 rows.

TASK 2 — Booking Revenue Details (NEW report, Layer 2 Final Loading ONLY):
  reports.service.js#getBookingRevenueDetails — GET
  /reports/booking-revenue-details. Deliberately does NOT touch
  ManualBooking, Invoice, or Payment.

  PRICING GROUP RULE (business-approved, do not weaken): each report
  row is one commercial pricing group, uniquely identified by ALL SIX
  of Agent + Commodity + POL + POD + Container Type + Freight Rate.
  Two bookings agreeing on every dimension except Freight Rate (DG
  surcharge, different pricing agreement, different container-type
  pricing, etc.) are NEVER merged — they produce two separate rows.
  Commodity is grouped on a normalized (trim+uppercase) key since
  Booking.commodity is free text; the displayed value is the first
  original-case value seen in the group.

  RATE — NEVER AVERAGED: Rate 20/Rate 40 are the group's own,
  actual, shared freightRate value, read directly (every booking in a
  group has the identical rate by construction, since freightRate is
  itself part of the grouping key). Do NOT reintroduce a weighted-
  average or Revenue-divided-by-Qty rate calculation here — that
  design was explicitly proposed and explicitly rejected by the
  business (see sprints/034-sprint.txt Decision 9, Revision 2/3).
  Revenue 20 = 20 Qty x Rate 20; Revenue 40 = 40 Qty x Rate 40;
  Total Revenue = Revenue 20 + Revenue 40.

  SIZE BUCKETING — 20 Qty = 20ft ONLY. 40 Qty = 40ft, 40HC, 44ft, AND
  45ft (all one bucket) — approved business decision (Decision 10). No
  "45 Qty"/"44 Qty" column exists. This bucketing is a report-specific
  classification (`classifyRevenueSizeBucket()` inside
  reports.service.js), DELIBERATELY SEPARATE from
  teuResolver.js#resolveTEU() — the TEUs column still calls
  resolveTEU() unmodified (a TEU-value concept), while the 20/40 Qty
  bucket answers a different, report-presentation-only question. Do
  NOT modify teuResolver.js to try to unify these two — they answer
  different questions and `resolveTEU()`'s own `40 || 45` check does
  not (and should not) include 44, since 44ft is not currently even a
  valid ContainerType.size enum value (CONTAINER_SIZES has no '44ft'
  today — this bucket is future-proofing, currently unreachable with
  real data).

  Grouping happens in JS (fetch + populate, then Map-based group-by),
  not a Mongo aggregation pipeline, specifically so resolveTEU() can be
  called directly — same "fetch, then merge/group in JS" shape as
  agent.service.js#getAgentFinancialAccount.

DO NOT touch capacity.service.js, teuResolver.js's own rule set,
booking.model.js, manualBooking.model.js, invoice.model.js, or
payment.model.js for anything in this sprint.

Full analysis, business decisions, and scenario walkthroughs:
docs/booking-report-analysis.md, sprints/034-sprint.txt.
```

### Voyage Profitability Report — Round P&L Evolution (Sprint 035)

```
Evolves GET /reports/round-pnl / getRoundPnL / RoundPnlReport.jsx IN
PLACE — no new report, endpoint, or page. Adds optional ?voyageId= to
the existing ?roundId= param.

Revenue = Layer 2 Booking ONLY, status = 'Final Loading' ONLY (same
population as Booking Revenue Details, Sprint 034). ManualBooking does
NOT participate in this report (deliberate, unlike Round P&L's own
older legacy fields which still combine L1+L2 any-non-Cancelled —
kept side-by-side for backward compatibility, see Sprint 037 finding).

Voyage set always resolved via Voyage.find({roundId}) — NEVER
round.voyageIds (ADR-4, safer than the Capacity Engine's own pattern,
deliberately not touching capacity.service.js to fix this).

Voyage Cost = expenses where ExpenseType.category's costClassification
  === 'Port Expense' (config-driven via
  expenseTypeService.getCostClassificationMap(), never a hardcoded
  string) — grouped per voyage even in Round scope, further per port.
Other Voyage Cost = everything else (Hire Rate, Agency Fees, Canal
  Dues, Stevedoring, Miscellaneous — all normal Expense records, no
  schema change) — aggregated ONE SCOPE-WIDE TOTAL ONLY, never
  broken out per voyage in Round scope (deliberate asymmetry vs.
  Voyage Cost — do not "fix" this into matching Voyage Cost's
  per-voyage breakdown).
Bunker Cost = always-present, always-inert reserved line
  (`bunkerCost: null`), excluded from every Summary formula. Not
  implemented — position reserved only.

Total Hire Cost = Hire Rate Expense amount × Voyage Duration
  (eta−etd or ata−atd). Hire Rate is a normal Expense
  (ExpenseType='Hire Rate', voyageId-linked) — NOT a schema field.

Summary (Total Revenue, Total Voyage Cost, Net Profit, Profit/TEU,
Profit Margin %) computed ONCE for the selected scope only — never
per-voyage in Round scope.

DO NOT create a second report/endpoint/page for this — it is the same
getRoundPnL/RoundPnlReport.jsx/round-pnl route, just extended.
DO NOT break Other Voyage Cost out per-voyage in Round scope.
Full spec: sprints/035-sprint.txt.
```

### Expense Module Port-Level Costing (Sprint 036)

```
Expense scope is exactly one of Round / Voyage / Port — Port is a
REFINEMENT of Voyage scope (a Port-scoped expense always has BOTH
voyageId and portId set), not a fourth independent axis.

Scope is NEVER stored as a field — always inferred via the pure
function expense.service.js#deriveScope({roundId,voyageId,portId})
  portId set      → 'Port'
  voyageId set     → 'Voyage'
  roundId set      → 'Round'
deriveScope() is exported and reused everywhere scope is needed
(reports.service.js, export.service.js, ExpenseList.jsx) — never
re-implemented in a second place.

Schema addition (expense.model.js) — ONE additive field only:
  portId: ObjectId ref 'Port', default: null
  Legacy free-text `port` field kept, unmodified, for pre-Sprint-036
  records (no forced migration, no migration script needed — portId
  defaults null and every old doc is still correctly inferred as
  Round/Voyage scope).
  Compound index: {voyageId:1, portId:1}

Port options are ALWAYS exactly the selected voyage's own polId/podId
(a Voyage is a single leg, Sprint 023) — no new "ports of a voyage"
endpoint; ExpenseForm.jsx reads the already-populated Voyage document
client-side. Server re-validates portId ∈ {voyage's own two ports},
400 otherwise.

getRoundPnL's Voyage Cost per-port breakdown keys on portId when
present, falls back to legacy free-text `port` / 'Unspecified'
otherwise. Revenue-by-Voyage gained vgm (MT — see Sprint 038 unit fix)
+ polName/podName inside the revenue block itself.

DO NOT add a stored `scope` field to Expense — inference only (ADR-2).
DO NOT allow more than 2 selectable ports per voyage without first
changing Voyage's own schema (current 2-port limit is a schema
limitation, not a hardcoded business rule — see sprints/036-sprint.txt
Business Validation §6 reviewer note).
```

### Reporting Modules Architecture Audit (Sprint 037 — audit only, no code)

```
Pure documentation/audit sprint — NO CODE WAS WRITTEN. Full findings in
sprints/037-sprint.txt. Confirmed findings (later fixed by Sprint 038
except where noted):
  1. Dead `$sum:'$quantity'` in getVoyagePerformance, getRevenueReport,
     getRoundPnL's legacy block (Booking.quantity removed Sprint
     025/026) — FIXED by Sprint 038 in the first two; getRoundPnL's
     legacy block instance is DELIBERATELY KEPT for backward
     compatibility (documented, not a miss).
  2. "Revenue" had two competing definitions (Final-Loading-only vs.
     any-non-Cancelled) across 5 code paths — RESOLVED by Sprint 038:
     getRevenueReport narrowed to Layer2+Final-Loading; getRoundPnL's
     legacy top-level fields (totalRevenue/l1Revenue/l2Revenue/
     bookingCount/totalQuantity) are KEPT alongside the new Sprint
     035/036 summary fields for backward compat — two figures coexist
     in one payload, by design, not a bug.
  3. Expense Report had zero Sprint 036 Port-scope awareness — FIXED
     by Sprint 038.
  4. Round Capacity Report resolves round's voyages via
     round.voyageIds, not Voyage.find({roundId}) like Sprint 035's
     ADR-4 — CONFIRMED NOT YET FIXED, deliberately deferred by Sprint
     038 ("reuse the Capacity Engine, do not redesign it") — still an
     open, low-risk structural inconsistency.
  5. VGM shown in kg (Booking Revenue Details) vs MT (Round P&L) —
     FIXED by Sprint 038 (standardized on MT everywhere).
```

### Reporting Consolidation Implementation (Sprint 038)

```
Implements Sprint 037's punch list. No new API routes anywhere in this
sprint — every controller already forwards req.query unmodified.

Round Capacity Report: rebuilt from a segment table into one full-width
  VoyageCapacityCard.jsx per voyage (new file,
  frontend/src/modules/reports/), chronological order. Added ONE
  additive field to capacity.service.js#computeRoundCapacity:
  capacityBeforeLoading = vessel.capacity - onboardStart (same category
  as Sprint 029's loadedExact — presentation-only, doesn't feed the
  onboard chain). Fixed 3 stale field references
  (totals.peakSegmentIndex/totalBookedTEU/segments.length — none exist
  on the current payload; correct fields are totals.peakVoyageId /
  totals.totalLoadedTEU / voyages.length).
  CapacitySegmentTable.jsx is UNTOUCHED — still used on Vessel Details.

Voyage Performance Report (getVoyagePerformance): dual-layer now,
  params bookingSource ('L1'|'L2'|'combined', default 'combined') +
  bookingStatus ('all'|'finalLoading', default 'all') — same
  merge-in-JS shape as getBookingReport (Sprint 034). Dead `quantity`
  removed.

Revenue Report (getRevenueReport): narrowed to Layer 2 +
  status:'Final Loading' ONLY (was {$ne:'Cancelled'}) — this is now
  THE final, business-confirmed Revenue Report definition, matching
  getBookingRevenueDetails/getRoundPnL. Dead `quantity`/`totalQty`
  removed entirely (bookingCount already covers "units" since one
  booking = one container).

Expense Report (getExpenseReport): brought to Sprint 036 parity —
  optional portId filter/populate, computed `scope` per row via
  expense.service.js#deriveScope() (now exported), second summary
  dimension grouped by (costClassification, currency) via
  expenseTypeService.getCostClassificationMap() — reconciles exactly
  with getRoundPnL's Voyage Cost/Other Voyage Cost totals.

VGM unit standardization: getBookingRevenueDetails now divides by 1000
  (kg→MT) to match getRoundPnL — Booking.vgm itself is UNCHANGED
  (still stored in kg); conversion happens at the report layer only,
  in both places now.

DO NOT touch capacity.service.js's cargo-flow algorithm,
teuResolver.js, booking.model.js, manualBooking.model.js,
expense.model.js, invoice.model.js, payment.model.js, or
round.voyageIds vs Voyage.find({roundId}) (deliberately deferred).
Full spec: sprints/038-sprint.txt.
```

### Dashboard Architecture & Widgets (Sprint 039)

```
Dashboard rebuilt from one monolithic page into
frontend/src/modules/dashboard/ — DashboardFilterContext (shared
{roundId,voyageId,serviceId,agentId,dateFrom,dateTo} state) →
Sections (Operations/Commercial/Financial/Bookings/Performance/Alerts,
frontend/src/modules/dashboard/sections/*.jsx) → independent Widgets
(frontend/src/modules/dashboard/widgets/*.jsx, one useQuery each, own
loading/empty/error state — no section-wide blocking fetch) →
presentational Charts/Cards (WidgetPrimitives.jsx/ChartPrimitives.jsx).
QuickActionsWidget added (New Booking/Expense/Invoice/Round, Import
Bookings), gated by the same can(module,'create') every list page uses.

Two-tier data access (ADR-1, the organizing rule for the whole sprint):
  Tier 1 — dashboard-native simple counts/status reads, stay in
    dashboard.service.js#computeStats() (GET /dashboard/stats).
  Tier 2 — anything with a business rule reuses the EXACT existing
    report/service function (backend-composed like
    getFleetUtilisation, or the frontend widget calls the report
    endpoint directly, e.g. reportsService.getRevenueReport()) — the
    Dashboard NEVER runs a second, parallel Booking/Expense aggregation
    for a number a Report already computes.

Baseline correctness fixes shipped as part of this sprint (not new
scope — Dashboard had drifted from Sprint 038's rules, same class of
bug Sprint 037 found elsewhere):
  revenue30d / monthlyTrend / revByService: match condition changed
    from status:'Confirmed' / {$ne:'Cancelled'} to status:'Final
    Loading' — matches getRevenueReport's Sprint 038 rule.
  getFleetUtilisation: totalBookedTEU (didn't exist on the capacity
    payload) → totalLoadedTEU (the real field) — same dead-field class
    Sprint 037/038 already found on 3 report pages.
  totalExpenses: was Expense.countDocuments({}) (a bare count) — now a
    real sum.

Dashboard stays SuperAdmin-only by role identity (isSuperAdmin,
unchanged), read-only, zero new Mongoose models/schemas.
Two small NEW endpoints were PLANNED (both additive, both loop-existing-rounds +
call-existing-function, same shape as getFleetUtilisation) but were NEVER ACTUALLY BUILT —
confirmed absent from the running code (system-audit-2026-8-4.md/9-1.md); this doc previously,
incorrectly, said they shipped:
  GET /dashboard/port-activity          ← fleet-wide port cost activity — DOES NOT EXIST, 404s
  GET /dashboard/missing-final-loading  ← voyages overdue for FL — DOES NOT EXIST, 404s
DO NOT invent a fleet-wide "Total Profit, all rounds" figure —
getRoundPnL is deliberately round-scoped (ADR-3); no cross-round
re-aggregation anywhere in the Dashboard.
Full spec: sprints/039-sprint.txt.
```

### Bulk Export Module Update (Sprint 040)

```
Audit + fix of the existing Bulk Export module (export.service.js/
export.controller.js/export.routes.js/ExportPanel.jsx) against every
schema change through Sprint 039 — record-level column/filter fixes
only, NOT Report-based exports (explicitly rejected/withdrawn
direction, see sprints/040-sprint.txt Revision 2 note).

Schema-drift fixes shipped:
  vessels    — added charterStartDate/charterEndDate + all 13 Vessel
               Particulars fields (Sprint 021), previously never
               exported.
  voyages    — added etp, isManual.
  bookings   — removed dead `quantity` column; added containerNumber
               (the Sprint 021 primary match key — was completely
               absent), vgm, dg (Hazardous), imdgCode, containerStatus,
               remarks.
  expenses   — added portId populate + `scope` column (via
               expense.service.js#deriveScope(), reused not
               reimplemented), portName.
  expenseTypes — added costClassification column (via
               expenseTypeService.getCostClassificationMap()).
  invoices   — added orphanedCount (lineItems[].orphaned count).

NEW module: manualBookings (Layer 1 export) — was never exportable
  before this sprint; separate tile in ExportPanel.jsx, own COLUMNS
  entry, own fetchData() case — NOT merged into the existing
  `bookings` (Layer 2) case, since the two collections have different
  shapes (header+cargoRows[] vs flat one-container-per-row). 13
  ALLOWED_MODULES total now.

Date Range filter (dateFrom/dateTo) actually implemented for
  expenses/invoices/rounds/auditLogs — ExportPanel.jsx's copy
  previously claimed this worked but no fetchData() case read it.

Also added (beyond the sprint 040 doc's own scope, shipped in the same
pass): Export Info metadata worksheet — every generated .xlsx now has
a leading "Export Info" sheet (Export Name, Generated At, Generated By,
Applied Filters, Record Count) ahead of the data sheet, via
export.service.js#addMetadataSheet(). exportSingle()/buildZipStream()
now accept an optional generatedBy (req.user?.name || req.user?.email).

NOT done in this sprint (flagged in Sprint 041 instead):
  buildZipStream still fetches modules SEQUENTIALLY (for...of + await),
  not Promise.all — a real, not-yet-implemented optimization.

DO NOT merge manualBookings into the `bookings` export case.
DO NOT convert any export to reuse a Report/aggregation service —
record-level dumps stay direct Mongoose queries (ADR-3).
Full spec: sprints/040-sprint.txt.
```

### RBAC Enforcement Audit, Performance & Caching Review, Bug Sweep (Sprint 041 — planning approved, NOT yet implemented)

```
Full-codebase audit across RBAC/performance/bugs. STATUS: plan approved,
NO CODE WRITTEN YET as of this writing — treat every item below as
"known gap, not yet fixed" until someone implements sprints/041-sprint.txt.

Confirmed findings (verified directly against the code while writing
this reference — see "Known open gaps" in Section 1 above):
  1. GET /permissions/:roleId (HIGH) — no check that req.params.roleId
     equals the caller's own roleId; any authenticated user can read
     any OTHER role's full permission matrix. Fix (ADR-1, when
     implemented): allow through without rbac('roles') ONLY when
     roleId === caller's own roleId (preserves the self-service
     chicken-and-egg exemption); otherwise require rbac('roles') same
     as the existing PUT route.
  2-4. roles/[id]/page.jsx, agents/[id]/page.jsx, agents/new/page.jsx
     have no <PageGuard> — backend RBAC still blocks the actual
     write/fetch, but the page shell/form renders regardless of
     permission. Fix: wrap in <PageGuard module="..."> matching every
     sibling page's existing convention (e.g. vessels/[id]/page.jsx).
  5. Payment void (`POST /invoices/:id/payments/:paymentId/void`) is
     gated by the default POST→'create' action mapping, not
     update/delete — flagged as an open business decision, not
     asserted as wrong.
  6. agent.service.js#getAgentFinancialAccount and
     vessel.service.js#getVesselStats have NO caching, unlike every
     other computation of comparable cost (capacity engine 60s,
     dashboard 90s, permissions 120s, user 60s). Fix (ADR-3, when
     implemented): same cache.js TTL pattern, keys
     agent:financial:<agentId> / vessel:stats:<vesselId>, 60-90s TTL,
     invalidated at the same mutation call-sites that already call
     invalidateRoundCache-style hooks.
  7. expense.model.js has a redundant standalone {voyageId:1} index —
     already subsumed by the {voyageId:1,portId:1} compound index
     (Sprint 036). One-line deletion when implemented.
  8. export.service.js#buildZipStream runs sequentially — could
     Promise.all across modules (Sprint 040 shipped everything else
     in this file but not this).
  RBAC route coverage otherwise confirmed clean across all 23 backend
  modules — no other missing rbac() gate found. Bug sweep found no new
  dead-field instances beyond the one Sprint 038 already deliberately
  kept for backward compat.

DO NOT implement any of the above without re-reading
sprints/041-sprint.txt in full first — several items have explicit
ADRs constraining HOW to fix them (e.g. the permission fix must
preserve the self-service exemption, not just add rbac('roles')
unconditionally).
```

### Import Template Styling, Field-Required Convention, Shared Error Toast, Round→Voyage Cascade, Voyages Grouped-by-Round (Sprint 042)

```
SEVEN POINTS, all shipped:

1. Booking Import template moved server-side (ExcelJS) because SheetJS
   Community Edition (the `xlsx` npm package, used client-side until this
   sprint) CANNOT write cell styles (fills/colors) — that's a Pro-only
   feature of that library, not a bug in prior usage. New:
     GET /bookings/import/template          ← ExcelJS-built blank workbook
     GET /bookings/import/template-columns  ← single authoritative column +
                                                required-flag list
   Required column headers: light red fill (FFF8D7DA). Optional: light
   yellow (FFFFF3CD). Header CELL only, never the whole column. The
   frontend's on-page "Expected Excel Columns" guide card now fetches
   this same list — no more hand-maintained duplicate array.

2. Required-field convention, simplified from the original ask: ONE red
   asterisk `*` (text-red-400, standardized — ServiceForm.jsx's deviating
   text-red-500 fixed) for required fields. Optional fields get NO
   marker at all — every existing `(optional)`/`(opt)`/embedded-
   "(optional)" text variant found across ~20 form modules was REMOVED,
   not replaced with an "Option" word. BookingForm/ManualBookingForm's
   local `FieldLabel` helper had its `optional` prop dropped.
   Conditionally-required fields (imdgCode when dg=true; Vessel's
   charterStartDate/charterEndDate when Chartered) keep an unconditional
   `*` once visible — no dynamic recomputation, since they're only
   rendered when the triggering condition is already true.

3. utils/errorToast.jsx#showErrorToast(error, actionType) — actionType is
   'save'|'update'|'delete', picks a FIXED generic title ("Couldn't
   save"/"Couldn't update"/"Couldn't delete"), body shows the backend's
   message, and — when e.response?.data?.errors (express-validator's
   {field,message}[] array) is present — lists each one instead of just
   the generic "Validation failed" top-line. Used by all ~30 mutation
   sites system-wide (replacing duplicated flat-string onError bodies),
   including InvoiceList.jsx's PDF-download catch (previously the one
   confirmed deviation that didn't even try e.response?.data?.message).
   ConfirmDialog.jsx itself is unchanged — the improved toast is the only
   place a blocked action's reason appears, no inline dialog error state
   was added.

4. BookingImport.jsx's preview table wrapper gained
   `overflow-x-auto overflow-y-auto max-h-[65vh]` + a sticky header — was
   horizontally contained (Sprint 032) but had no vertical cap, so a
   large import file grew the whole page.

5. Round → Active cascade (round.service.js, both create() with
   data.status==='Active' and update()'s Planned→Active transition):
   ONLY the round's FIRST voyage (lowest sequence) currently Scheduled
   moves to Departed. Later legs stay Scheduled until an admin advances
   them individually. NOT reversible (Active→Cancelled later does not
   revert the voyage). No TrackingHistory entry is fabricated — pure
   status-field change only.

6. VoyageList.jsx (the standalone, system-wide Voyages tab — distinct
   from RoundVoyageList.jsx, which is already single-Round-scoped)
   restructured into repeating Round-label + that Round's voyages table
   sections. Backend voyage.service.js#list() sort changed from
   {sequence,etd} to {roundId:1, sequence:1} so a Round's voyages arrive
   contiguous. Pagination stays 20-voyages-per-page as-is (a Round's
   group MAY split across a page boundary — accepted trade-off). A
   Round with zero matching voyages after a Service/Status filter is
   hidden entirely, not shown empty.

7. VoyageList.jsx gained a Delete action next to Edit, reusing the exact
   pattern already proven on RoundVoyageList.jsx (ConfirmDialog +
   voyagesService.remove(id) → existing DELETE /voyages/:id + existing
   server-side guard, unchanged) — gated by can('voyages','delete').

Full spec: sprints/042-sprint.txt.
```

### Voyage Display Order by Physical Vessel Flow (Sprint 043 — display-only)

```
Explicit client instruction, honored exactly: does NOT touch
Voyage.sequence, capacity.service.js's own calculation, or any backend
logic anywhere — implemented entirely frontend-side as a rendering-time
re-sort of an already-fetched array.

THE PROBLEM: auto-generated voyages' `sequence` already equals their true
physical leg position (voyageGenerator.js). A MANUAL voyage
(voyage.service.js#createManualVoyage(), Sprint 016) gets
`sequence = (lastVoyage.sequence||0)+1` — simply "next number issued",
NOT derived from leg position — so a manual leg1→leg3 shortcut voyage
added after three auto-voyages sorts AFTER a later leg3→leg4 voyage even
though the vessel physically completes leg1→leg3 first.

THE FIX: frontend/src/utils/voyageDisplayOrder.js — ONE shared sort
function, reused by every view that shows a Round's voyages in order
(VoyageList.jsx, RoundVoyageList.jsx, RoundCapacityReport.jsx,
VesselDetail.jsx). For each voyage, its POL/POD are resolved to a leg
position via the EXISTING `GET /voyages/round-ports/:roundId` endpoint
(already used by VoyageAddForm.jsx — no new endpoint). Algorithm:
  1. Split into forward (podLegPos >= polLegPos) and backward
     (podLegPos < polLegPos, i.e. a real round-trip case) groups.
  2. Sort forward group by podLegPos ascending, tie-break polLegPos
     DESCENDING (voyages are grouped by where they END, in the order the
     vessel physically reaches that point; within the same destination,
     the most direct/shortest-range voyage shows first).
  3. Sort backward group with the same rule.
  4. Final order = forward group, then backward group appended last —
     backward (round-trip) voyages are always last, never interleaved.

The three Capacity Engine consumers (RoundCapacityReport.jsx,
VesselDetail.jsx feeding CapacityTimeline/VoyageCapacityCard/
CapacitySegmentTable) re-sort a RENDERING-TIME COPY of the already-
computed voyages/voyageRows array — every number on each row
(onboardTEU, loadedTEU, utilisationPct, etc.) is exactly what
capacity.service.js computed, in whatever order the engine itself
still walks over internally.

DO NOT write to Voyage.sequence anywhere because of this sprint.
DO NOT reorder the array capacity.service.js computes over — only a
presentational copy, after the engine has already finished.
Full spec: sprints/043-sprint.txt.
```

### Invoice Booking Selection UX + Agent/Invoice Booking Summaries (Sprint 044)

> **SUPERSEDED 2026-10-23 (V2-only conversion): InvoiceForm.jsx, AgentFinancialAccount.jsx and invoice.service#getEligibleBookings are deleted. `BookingsSummaryCard` still exists and is used by the V2 wizard.** Kept below as history only. Do not build against it.

```
THREE POINTS, all shipped:

1. InvoiceForm.jsx's Booking-type (invoiceType='Booking') radio list
   gained max-h-[360px] overflow-y-auto — same class of fix as Sprint
   042's import-preview table.

2. Voyage/Round-type invoices: the EligibleBookingsTable checkbox-
   selection UI was REMOVED entirely (file deleted). Selecting a
   Voyage/Round now auto-includes EVERY eligible Final Loading booking
   (a useEffect sets `selected` to the full eligible[] result as soon as
   it loads) — no manual exclusion of any kind remains.
   invoice.service.js#create() itself needed no change — it already
   accepted whatever bookingIds array it was given.

3. New shared frontend/src/components/ui/BookingsSummaryCard.jsx —
   booking count + total revenue + per-container-type breakdown
   (count+amount), NO individual booking numbers. ONE implementation,
   THREE call sites: InvoiceForm.jsx (Voyage/Round scope),
   AgentFinancialAccount.jsx's Bookings tab (replacing the old flat
   one-row-per-booking BookingsLedger, deleted), and (addendum, same
   sprint) AgentFinancialAccount's Rounds tab's expandable Voyage-level
   bookings (replacing BookingRow, deleted — RoundsStatement no longer
   takes a `router` prop, since the per-booking invoice link is gone).
   This means the Agent Financial Account no longer shows individual
   booking numbers ANYWHERE except by drilling into a specific Invoice
   from the Invoices tab.

BACKEND ADDITION (additive only, shared by points 2 and 3):
  invoice.service.js#getEligibleBookings and
  agent.service.js#getAgentFinancialAccount both gained
  .populate('containerTypeId', 'code size type') on their existing
  Booking.find(...) query, plus a `containerType` field (e.g. "20ft
  Dry") on each mapped/assembled row — nothing else in either function
  changed.

DO NOT touch invoice.service.js#create(), buildLineItemSnapshot(),
findActiveInvoiceIdsForBookings(), or recalcInvoiceStatus() for
anything related to this sprint — the invoice-creation business rules
are exactly as Sprint 033 documented them; this sprint only changed
what the admin SEES and auto-selects before submitting.
Full spec: sprints/044-sprint.txt.
```

### Discharge Import — Actual Operational Outcome After Final Loading (Sprint 045)

```
Extends the operational lifecycle AFTER Final Loading — Final Loading
import itself is completely unchanged.

NEW FIELDS (Booking/Layer 2 ONLY — ManualBooking/Layer 1 untouched):
  dischargeStatus: 'Discharged' | 'Remaining' | null (default) — set
    ONLY by the 'discharge' import type, independent of `status` (which
    stays 'Final Loading' forever regardless of discharge outcome). null
    = not yet assessed — distinct from both real outcomes.
  dischargedAt: Date, default null.

NEW IMPORT TYPE 'discharge' — fully separate code path from
previewImport/saveImport (both untouched), since the shape of work is
fundamentally different (match-only vs. create-or-update, single-voyage
vs. round-wide scope):
  bookingImport.service.js#previewDischargeImport({rows,agentId,voyageId})
    — Voyage is REQUIRED (unlike Booking/Final Loading import, which is
    Round-scoped with no voyage selector, Sprint 031). Validates every
    row's own POL/POD text against the selected voyage's actual ports;
    a container matched to a DIFFERENT voyage in the same Round, or to a
    non-'Final Loading' booking, is a reported error, never silently
    processed. Matching is containerNumber-only (no BOL field exists on
    Booking).
  bookingImport.service.js#saveDischargeImport({rows,agentId,voyageId,
    createdBy}) — NEVER creates a Booking. Matched rows ->
    dischargeStatus:'Discharged'. Every OTHER Final Loading booking for
    that agent on that SAME voyage (not in the manifest) ->
    dischargeStatus:'Remaining' — scoped to ONE voyage, narrower than
    Final Loading import's round-wide reconciliation sweep. Calls
    invalidateRoundCache() same as every other booking mutation.

BOOKING LIST — two new operational tabs, "Discharged"/"Remaining",
filtering exactly like the existing Operational tab (Round/Voyage/
Agent), via booking.service.js#list()'s additive `dischargeStatus` param.

**Post-audit RBAC fix (system-audit-2026-8-3.md §2.2, applied post-Sprint-047):**
`booking.routes.js`'s `POST /bookings/import/save` elevated-permission
check (update+delete on `bookings`, beyond the base `import` action) was
written for `importType==='finalLoading'` only when first shipped in
Sprint019/042. `saveDischargeImport()` performs the same class of bulk
write — it flags every OTHER Final Loading booking for that agent on the
voyage (not in the manifest) as `dischargeStatus:'Remaining'`, a record
the caller never explicitly selected — but `importType==='discharge'`
fell through to the base `import` check alone, letting a role with only
`bookings:import` silently bulk-flip other bookings' discharge status.
Fixed: the route's `['finalLoading','discharge'].includes(importType)`
check now covers both import types identically.

CAPACITY ENGINE — the ONLY thing that changed is the SOURCE of the
discharge event; the calculation itself was explicitly NOT rewritten
(hard constraint from the business spec):
  capacity.service.js: each L2 event carries a `stuckRemaining` flag
  (true when Booking.dischargeStatus==='Remaining'). In Step E's
  aggregation, `stuckRemaining` TEU is diverted into a NEW
  `remainingOnboardTEU[]` array INSTEAD OF `dischargedTEU[]` — so it
  keeps counting in `onboardTEU` at every later voyage in the round.
  `resolveDischargeIdx`'s forward-walk, the onboard recurrence
  (onboardStart[n]=onboardTEU[n-1]), and Layer 1 (`l1Events`) are all
  byte-for-byte unchanged. Not-yet-assessed bookings (dischargeStatus
  null) behave exactly as before this sprint (today's planned/on-
  schedule behavior, unchanged).
  New warning code: REMAINING_ONBOARD_PAST_DISCHARGE (voyage-scoped,
  same shape as VOYAGE_OVERBOOKED).
  computeVesselActiveCapacity/computeVoyagePreview inherit this for
  free — both call computeRoundCapacity internally, no separate change.

CAPACITY UI — red highlight wherever remainingOnboardTEU > 0:
  CapacitySegmentTable.jsx (row tint + "N TEU remaining onboard" note),
  CapacityTimeline.jsx (red note under the leg bar), VoyageCapacityCard.jsx
  (red border/bg + a "Remaining Onboard" stat), CapacityWarnings.jsx
  (icon for the new warning code).

DO NOT rewrite the onboard/remaining/utilisation recurrence for this —
only the discharge EVENT SOURCE changed (dischargeStatus), never the
math walking over it.
Full spec: sprints/045-sprint.txt.
```

### Invoice Status: Automatic Flow Kept, Admin Manual Override (Sprint 046)

> **SUPERSEDED 2026-10-23 (V2-only conversion): invoice.service#update, validateManualTransition, recalcInvoiceStatus and payment.service are deleted. The `invoices:override` permission column still exists but nothing consults it; V2 issued invoices are corrected only by credit/debit notes.** Kept below as history only. Do not build against it.

```
Two separate status code paths existed before this sprint, both
UNCHANGED by it:
  A. Auto-derived (payment-driven) — recalcInvoiceStatus(), called only
     by payment.service.js after every payment create/void. Still the
     ONLY place 'Partially Paid'/'Paid' are ever set. NOT touched by
     this sprint at all.
  B. Manual (admin-driven) — invoice.service.js#update() +
     validateManualTransition() + MANUAL_TRANSITIONS whitelist
     ({Draft:[Issued,Cancelled], Issued:[Cancelled]}) — still the
     enforced path for every user WITHOUT the new permission below.

NEW: an ADDITIVE escape hatch, `invoices:override` — a new action on
the shared Permission actionSchema (alongside create/read/update/
delete/import/export/view/hidden), grantable per-role via Roles →
Permissions (PermissionMatrix.jsx gained a real "Override" toggle
column). SuperAdmin has it implicitly (existing role-identity bypass in
rbac.js already short-circuits everything before any action check).

When the requester has invoices:override (checked via a new
rbac.js#hasPermission(req,module,action) helper — a companion function
exported alongside the existing rbac() middleware factory, reusing the
same cached lookup, called from invoice.controller.js#update() as an
ADDITIVE check on top of the base rbac('invoices') route gate, never a
replacement for it):
  - update()'s top-level lock (paidAmount>0 / status Paid|Cancelled
    "cannot be modified") is skipped ENTIRELY — the WHOLE invoice
    (dates/currency/notes/status) becomes editable again, not just
    status.
  - The narrow MANUAL_TRANSITIONS whitelist is skipped — status can be
    forced to ANY of the 6 INVOICE_STATUS values, with zero extra
    business-rule validation (invoice.validation.js's body('status')
    check loosened from isIn(['Issued','Cancelled']) to
    isIn(INVOICE_STATUS) — the real whitelist enforcement for non-
    override users still lives solely in validateManualTransition()).

CRITICAL — a later payment event can still silently supersede an
override: recalcInvoiceStatus() has no concept of "someone set this on
purpose." If a payment is created/voided after an admin override, the
normal payment-driven math runs exactly as it always has and MAY
recompute/overwrite the forced status. This is intentional (locked
decision, not a bug) — an override is a point-in-time correction, not a
sticky flag.

Frontend (InvoiceForm.jsx#EditInvoiceForm): `canOverride =
can('invoices','override')`; `locked` becomes `!canOverride &&
wouldBeLocked`; `allowedNext` is the full INVOICE_STATUS list when
canOverride, else the original narrow per-status whitelist. A pink
banner renders whenever canOverride && wouldBeLocked, so it's visually
obvious the form is unlocked on purpose, not a bug.

DO NOT touch recalcInvoiceStatus(), payment.service.js, payment.model.js,
CreateInvoiceForm (still always Draft on create), or MANUAL_TRANSITIONS'
own contents for anything related to this sprint.
Full spec: sprints/046-sprint.txt.
```

### Bulk Select & Delete — Bookings, Voyages, Expenses (Sprint 047 Part A — ✅ Complete)

```
Frontend-only, no new backend route/controller/service — every entity
still calls its EXISTING single-item delete endpoint. Each table
(BookingList.jsx's Operational/Discharged/Remaining AND its separate
Estimated/Manual table, VoyageList.jsx, ExpenseList.jsx) gained
header+per-row checkboxes and a "Delete Selected (N)" button that, on
confirm, loops the selected ids client-side and calls the existing
delete mutation for each one SEQUENTIALLY (not Promise.all) — one
failure doesn't stop the rest, and a summary toast reports "N deleted, M
failed" with per-item reasons when anything fails.

  Bookings (Operational/Discharged/Remaining) -> loops DELETE /bookings/:id
  Bookings (Estimated/Manual)                 -> loops DELETE /bookings/manual/:id
  Voyages                                     -> loops DELETE /voyages/:id
  Expenses                                    -> loops DELETE /expenses/:id

BookingList.jsx's Operational/Discharged/Remaining table already had
selection state + toggleAll + checkboxes (previously wired only to
ExportButton) — reused as-is, just gained the button. The Estimated/
Manual table, Voyages, and Expenses had zero selection UI before this
sprint — added from scratch as fully independent state per table
(BookingList.jsx: separate `selected`/`manualSelected`; VoyageList.jsx:
one flat `selected` array spanning every Round-group on the page, with
each group's own header checkbox toggling just that group's rows within
the shared array).

Invoices were confirmed OUT of scope — InvoiceList.jsx's per-row Delete
already existed and already matched invoice.service.js's paidAmount
guard exactly; nothing was added there.

Expense/Payment "cascade" ask was dropped — confirmed no Expense↔Payment
relationship exists anywhere in the schema. Expense delete is completely
unchanged (DB record + attachment-file removal); the bulk loop just
calls the existing `DELETE /expenses/:id` per selected id.

No existing single-delete guard was touched by this part — the
client-side loop only ever calls each one, one at a time, unchanged.
```

**PART B of Sprint 047 — remove ALL soft delete, hard delete only (✅ Complete):**

```
Converted 14 models from isDeleted-flag soft delete to real hard delete:
Vessel, Agent, Service, Round, Booking, ManualBooking, Invoice,
ContainerType, ExpenseType, Role, Country, City, Port, Terminal.
User is the sole, deliberate exception — user.service.js#softDelete is
completely untouched. Route's isDeleted field was dead code (never set
to true, no delete function ever existed for Route) — removed with no
migration needed. Voyage/Expense/ExpenseCategory were already hard
delete before this sprint (the reference pattern this sprint copied).

For each of the 14 models: the service-layer delete function's guard
condition is preserved BYTE-FOR-BYTE (same query, same threshold, same
allowed/rejected cases as before) — only the final step changed, from
`isDeleted=true;deletedAt=...;save()` to `Model.findByIdAndDelete(id)`.
Booking's guard is still "blocked only if a NON-cancelled invoice
references it" (a prior planning round proposed tightening this to "any
invoice ever" as part of a cascade-delete redesign — that whole design
was explicitly discarded before implementation; the guard shipped
exactly as it was). Invoice's guard is still "blocked whenever
paidAmount > 0." ManualBooking still has no guard (never had one).

NO cascade delete, NO recursive delete helper, NO shared/generic "delete
engine," NO new transaction/session logic anywhere — 14 independent,
in-place edits to each model's existing service.js file, per explicit
instruction. The admin is still responsible for deleting dependent
records manually first, exactly as before this sprint.

Every `isDeleted:false` query filter referencing one of these 14 models
was removed system-wide — 179 sites across ~30 backend files, including
every list/getById/create-duplicate-check/update/aggregate in each
model's own service.js AND every cross-module reference (vessel.service,
agent.service, round.service, voyage.service, capacity.service,
dashboard.service, export.service, reports.service,
bookingImport.service, location.service, route.service). Compound
indexes on Booking/ManualBooking/Invoice that included `isDeleted` were
redesigned to drop just that term (e.g. `{voyageId:1,status:1,
isDeleted:1}` → `{voyageId:1,status:1}`); the 11 other single-field
`{isDeleted:1}` indexes were dropped outright. capacity.service.js's
`DELETED_CONTAINER_TYPE` soft-delete-aware branch (and its
`containerTypeId` populate's `isDeleted` projection) was removed as dead
code — ContainerType's guard is unchanged (still only blocks on an
ACTIVE booking), so a ContainerType used only by inactive/cancelled
bookings can still be hard-deleted; the capacity engine's own cargo-flow
algorithm was NOT touched.

Mandatory one-time purge migration — SHIPPED and must be run once before
this goes live: `npm run migrate:hard-delete-cleanup`
(`backend/src/config/migrations/migrate-hard-delete-cleanup.js`, same
guarded `require.main===module` pattern as `migrate-invoice-v2.js`) runs
`Model.collection.deleteMany({isDeleted:true})` (raw collection access,
not the Mongoose model — the schema no longer declares the field) for
each of the 14 models. Without running this once, every row that was
ever soft-deleted before this sprint would instantly reappear in every
list/report/dropdown the moment the query filters were removed.

DO NOT reintroduce cascade delete, a recursive delete helper, or any
shared generic delete service for this feature area — explicitly
rejected during planning.
DO NOT tighten any guard condition (e.g. Booking's non-cancelled-
invoice-only check) beyond what shipped — that was a discarded design,
not the final one.
DO NOT forget to run `migrate:hard-delete-cleanup` before/at deploy if
this hasn't been run in a given environment yet — previously-deleted
rows will silently resurface system-wide without it.

ADDENDUM (post-ship refinement, same sprint):
  - Agent.hardDelete gained a second guard — blocked if a non-cancelled
    Invoice references the agent (`Invoice.agentId`), in addition to the
    existing active-Booking check. Same "non-cancelled only" threshold
    as Booking's own invoice guard, not "any invoice ever."
  - Round.hardDelete now also hard-deletes its own Voyage documents
    (`Voyage.deleteMany({_id:{$in: round.voyageIds}})`) once its guards
    confirm none of them are referenced — Voyages have no independent
    existence outside their Round (auto-generated by `voyageGenerator.js`,
    exclusively owned), so this is a narrow, single-relationship cleanup,
    not the generic recursive cascade engine explicitly rejected earlier
    in this sprint. It does not reach any further down the graph —
    Invoice etc. is untouched (Booking's OWN guard already blocks its own
    delete if a non-cancelled Invoice references it, so an invoiced
    Booking blocks the Round delete transitively, without Round needing
    to know about Invoice directly).
    **Post-audit fix (system-audit-2026-8-3.md §2.1):** the guard
    originally checked only Layer 2 `Booking` — the Voyage cascade could
    silently orphan a Layer 1 `ManualBooking` or an `Expense` (Round- or
    Voyage-scoped) referencing one of the round's voyages. Two more guard
    checks added, same shape as the existing Booking one: blocks if any
    `ManualBooking.voyageId` or `Expense.{roundId,voyageId}` matches.

ADDENDUM 2 — Invoice Detail overview + Bill To + PDF redesign (same sprint):
  - InvoiceForm.jsx#EditInvoiceForm: the per-line-item "Line Items" table
    replaced with `BookingsSummaryCard` (booking count + total revenue,
    same overview component Create Invoice already used for Voyage/Round
    scope) — no individual booking rows shown at invoice-detail level
    anymore; Total/Paid/Balance chips underneath are unchanged.
  - InvoicePaymentPanel.jsx's "Record Payment" form collapsed to ONE row
    (Invoice Total/Paid So Far/Remaining + a single Amount-to-Apply input,
    capped at the invoice's remaining balance) — the backend still
    requires real per-booking `Payment.allocations[]` (Sprint 033,
    unchanged, still re-validated server-side), so the entered amount is
    auto-distributed via a deterministic waterfall (fill the first
    booking's own remaining balance, then the next, in line-item order) —
    never a proportional/percentage split. Payment HISTORY table's
    "Applied To" per-booking column was ALSO removed, by a later, explicit
    follow-up instruction in the same session (this line originally,
    incorrectly, said that column was untouched — corrected post-audit,
    system-audit-2026-8-3.md §3.3; see `sprints/047-sprint.txt` §13.2 for
    the full final-state record). `Payment.allocations[]` itself is still
    fully written/validated server-side (Agent Financial Account still
    reads it) — only this one table's display of it is gone.
  - NEW `invoice.billTo` embedded field (phone, mobile, email, jobCode,
    taxId, address, office) — entered PER INVOICE (not pulled from Agent),
    edited via its own always-open form/mutation
    (`PUT /invoices/:id/bill-to` → `invoice.service.js#updateBillTo`,
    completely separate code path from the main `update()`'s
    paidAmount/status lock — Bill To stays editable even on a
    Paid/Cancelled invoice, since it's PDF presentation data, not
    financial). Frontend: `InvoiceForm.jsx`'s new `BillToSection`
    component, its own save button, independent of the main form.
  - `invoice.service.js#getByIdForPdf` now also fetches the invoice's
    non-voided `Payment` records (date + amount only) and attaches them as
    `invoice.payments` for the PDF generator.
  - `utils/invoicePdfGenerator.js` redesign:
    - "FLOW DUBAI" → "FLOW MARINE" everywhere (header, PDF Author
      metadata, footer); footer's "| Dubai, UAE" segment removed entirely
      (now just "Flow Marine | Shipping & Logistics Operations").
    - Bill To section now renders `invoice.billTo` fields (mobile/email
      fall back to the agent's own contact when not set on the invoice;
      every other field has no fallback) — only non-empty lines render,
      so an invoice with no Bill To filled in yet doesn't show a wall of
      placeholders.
    - Voyage/Round in the Shipment Details box no longer gated by
      `invoiceType` — every line item snapshot already carries its own
      voyageNumber/roundNumber regardless of type, so both now resolve
      from whatever the invoice's own line items actually agree on
      (shows "N voyages"/"N rounds" if they don't all share one).
    - The static bank-wire-details block ("Payment Information": Bank
      Name/Account/SWIFT/Reference) is GONE — replaced by "PAYMENTS
      RECEIVED", the invoice's actual payment history (no method/
      reference/allocations breakdown — see next addendum, since this was
      itself superseded).

ADDENDUM 3 — PDF: line items table removed, real Payments Received table
(same sprint, supersedes part of Addendum 2 above):
  - The per-booking LINE ITEMS TABLE section is REMOVED from the PDF
    entirely (was: one row per invoiced booking — #, Booking/Container,
    Voyage/Round, Shipper/Consignee, Amount). The PDF no longer shows any
    per-booking breakdown at all.
  - Replaced by an "INVOICE OVERVIEW" strip — three stat boxes (Total
    Amount / Total Paid / Remaining, the last accent-colored) — the
    entire financial summary of the invoice. Invoice notes (if present)
    render directly below this strip now (previously rendered as a row
    inside the removed line items table).
  - "PAYMENTS RECEIVED" is now a REAL TABLE (not the narrow two-column
    list from Addendum 2), one row per payment: Date | Method | Reference
    | Amount — `invoice.service.js#getByIdForPdf`'s Payment query select
    was widened from `'paymentDate amount'` to `'paymentDate amount
    method reference'` to support this. Still no per-booking allocations
    breakdown — that stays app-only.
  - The old right-side "Totals block" (Total/Paid/Balance Due rows) is
    gone too, fully absorbed into the Overview strip above — do not
    reintroduce it alongside the strip.
```

### Post-Audit Fixes (system-audit-2026-8-3.md — all CRITICAL/HIGH/MEDIUM findings fixed)

```
A full-codebase audit (backend+frontend, focused on Sprint 047's diff plus
a general security/performance sweep) produced
`system-audit-2026-8-3.md`. Every CRITICAL, HIGH, and MEDIUM finding in it
has since been fixed and verified (empirically where feasible — real
attack payloads fired through the actual middleware/validators, not just
reasoned about). LOW findings (no rate limit on change-password, missing
index on Booking.dischargeStatus) are NOT yet addressed.

CRITICAL — NoSQL injection in password reset / accept-invite (account
takeover): `auth.validation.js#validateResetPassword` and
`user.validation.js#validateAcceptInvite` both validated `token` with only
`.notEmpty()` — no type check — so a JSON body of
`{"token":{"$ne":null}}` turned the Mongo query's `resetToken`/
`inviteToken` filter into a live operator, matching any user with a
pending token. Fixed: both now require `.isString()` before `.notEmpty()`.
Verified by firing the exact payload through the real Express middleware
(400, rejected) and confirming legit string tokens still pass (200).

HIGH — `Round.hardDelete`'s Voyage cascade (Sprint 047) only guarded
against Layer 2 `Booking`, silently orphaning a Layer 1 `ManualBooking` or
an `Expense` (Round/Voyage-scoped) referencing one of the round's
voyages. Fixed: two more guard checks added, same shape as the existing
Booking one (see this file's Sprint 047 §12.2 addendum and the Deletion
Rules table in §9).

HIGH — Discharge-import RBAC gap: `POST /bookings/import/save`'s elevated
update+delete permission check applied only to `importType==='finalLoading'`;
`'discharge'` (which bulk-flips OTHER bookings' `dischargeStatus` to
'Remaining') fell through to the base `import` action alone. Fixed: the
route's check now covers `['finalLoading','discharge']` identically.
Verified with 6 simulated permission-matrix cases against the extracted
guard logic (mocked `Permission.findOne`).

MEDIUM, all fixed:
  - `middleware/upload.js` — file uploads only validated the client-
    supplied `Content-Type` header (spoofable). Added magic-byte
    validation (`matchesDeclaredType`) checked against the real file bytes
    on disk after multer writes it, before Sharp/next() run. Verified:
    HTML content labeled `application/pdf` → rejected (400, file deleted);
    real PDF/PNG magic bytes → pass through unchanged.
  - `manualBooking.service.js#computeTotals` — a cargo row's
    `containerTypeId` failing to resolve (e.g. a hard-deleted
    ContainerType) silently defaulted to 1 TEU with zero visibility,
    unlike `capacity.service.js`'s explicit MISSING_CONTAINER_TYPE/
    MISSING_TEU_MAPPING warnings for the identical case. Fixed: same
    signal now surfaced via a `warnings[]` array, logged
    (`logger.warn`) and attached as `_teuWarnings` on the create/update
    response — the 1-TEU fail-safe default itself is UNCHANGED, only its
    visibility.
  - `InvoicePaymentPanel.jsx` — an inline comment (and CLAUDE.md's own
    Sprint 047 Addendum 2) incorrectly claimed the payment history
    table's per-booking "Applied To" column was left unchanged by the
    payment-panel redesign; it was actually removed by a later, explicit
    instruction in the same session. This was a stale-comment bug, NOT a
    UI regression to revert — fixed by correcting the comment/docs to
    match what actually shipped (see Addendum 2 above, corrected).
  - `BookingList.jsx` — `selected` was shared across the Operational/
    Discharged/Remaining tabs with nothing clearing it on tab switch, so
    "Delete Selected" after switching tabs could fire against ids from a
    table no longer visible. Fixed: reset both `selected` and
    `manualSelected` when `activeTab` changes, via React's "adjust state
    during render" pattern (not a `useEffect`, which would trip the
    `react-hooks/set-state-in-effect` lint rule and cost an extra
    render-after-commit).
  - ReDoS via unescaped `search`/`category`/`name` query params built
    directly into MongoDB `$regex` filters, across 13 backend service
    files (~40 sites: vessels, agents, auditLogs, bookings,
    manualBookings, containerTypes, expenseTypes, locations, roles,
    rounds, services, tracking, users). Any authenticated user (including
    read-only roles) could submit a catastrophic-backtracking pattern
    (e.g. `(a+)+$`) as `?search=` and tie up the single-instance Node
    event loop. Fixed: new shared `utils/escapeRegex.js`, applied at
    every site. Verified: the exact named payload, once escaped, matches
    only its own literal text (confirmed via `new RegExp`), and a full
    `vessel.service.js#list()` call was traced end-to-end (mocked
    `Vessel.find`) to confirm the escaped pattern — not the raw one —
    reaches the query.
  - Dashboard `TopAgentsWidget`/`TopRoutesWidget` fired an unbounded
    `getBookingRevenueDetails` query unconditionally on every mount,
    unlike the sibling `VoyageLeaderboardWidget`'s `enabled: !!roundId`
    gate. Deliberately NOT given the same gate — these two widgets are
    fleet-wide-by-default by design (unlike the leaderboard, which needs
    one Round to rank), so requiring a filter would remove their whole
    no-filter view. Fixed instead with a 5-minute `staleTime` (this
    "top performers" aggregate doesn't need recomputing every mount) plus
    a correctness-preserving backend cost reduction: `getBookingRevenueDetails`
    gained a `.select()` projection to the ~7 fields actually read during
    grouping — NOT a `.limit()`, which would have silently truncated the
    raw booking set before the pricing-group aggregation and corrupted
    the Booking Revenue Details report's own totals (a correctness
    regression worse than the performance issue being fixed).
```

### Voyage Status Admin Override + Voyage Display-Label Standard (Sprint 048)

```
TWO POINTS, both shipped (implemented and reviewed; not yet committed to git as of this
writing — 34 files, working tree only, see §3 sprint table note):

1. VOYAGE STATUS OVERRIDE — reuses the Sprint 046 invoices:override mechanism byte-for-byte,
   just for a different module. Before this sprint, Voyage.status was locked to a strict
   forward-only chain enforced by voyage.service.js's STATUS_TRANSITIONS/validateTransition()
   (Scheduled→Departed→In Transit→Arrived→Completed, any→Cancelled, both Completed and
   Cancelled terminal with NO way back) — mirrored client-side by VoyageEditForm.jsx's own
   TRANSITIONS map, which only ever rendered the currently-allowed next statuses in its
   <select>, so an illegal transition wasn't just rejected server-side, it wasn't even
   selectable.
   Now: voyage.controller.js#update() resolves
   `canOverride = await rbac.hasPermission(req,'voyages','override')` (identical call shape to
   invoice.controller.js's Sprint046 code) and passes it to voyage.service.js#update(id, data,
   updatedBy, canOverride=false), which skips validateTransition() entirely when canOverride is
   true — status can be forced to ANY VOYAGE_STATUS value, including un-cancelling a Cancelled
   voyage or skipping stages. Non-override callers (the default for every role except
   SuperAdmin) get the exact same validateTransition() check as before, unchanged.
   The `override` action already existed as a real, working toggle on every module row in
   PermissionMatrix.jsx since Sprint 046 (voyages included) — it was simply a no-op for voyages
   until this sprint wired the backend/frontend checks above. SuperAdmin gets this
   automatically via the existing role-identity RBAC bypass (rbac.js#hasPermission short-
   circuits on isSystem, same as everywhere else); any other role only gets it if an admin
   explicitly flips that role's voyages Override toggle in Roles → Permissions.
   NOT changed: round.service.js#cascadeFirstVoyageToDeparted (the Sprint 042 Round→Active
   cascade) — it writes voyage.status directly via .save() and never called
   validateTransition() even before this sprint, so it's already independent of the whitelist
   this sprint loosens. Watch for a possible desync (see §16 gotcha): if an override-holder
   force-sets a voyage's status out of forward order before its Round later transitions to
   Active, the cascade will depart the wrong (next-lowest-sequence Scheduled) voyage instead —
   a data-integrity/tracking-record issue, not a capacity or financial one (the capacity engine
   only ever checks status !== 'Cancelled', never assumes forward progression).

2. VOYAGE DISPLAY-LABEL STANDARD — every place in the app that shows a voyage as a reference
   (tables, tabs, dropdown selectors, cards, modals, detail panels, alerts, chart labels, plus
   the Invoice PDF's voyage line) now shows ONLY the voyage's name, never the code next to it.
   New frontend/src/utils/voyageLabel.js: `getVoyageLabel(v) => v.voyageName || v.voyageNumber
   || null` — falls back to the auto-generated code (voyageNumber, e.g. SVC-R000001-01) only
   when a voyage has no voyageName set (the common case today, since auto-generated voyages
   from voyageGenerator.js never set voyageName — only the separate manual/shortcut voyage
   creation form, Sprint 016, requires one up front). Threaded through ~25 frontend components
   system-wide, plus one backend site (utils/invoicePdfGenerator.js's voyage summary line —
   the adjacent Round line, which shows roundNumber/roundName the same old way, was
   deliberately left untouched, this standard is voyage-only).
   Excel/ZIP exports (export.service.js) are DELIBERATELY UNCHANGED — Voyage Number and Voyage
   Name are two separate spreadsheet columns there (a raw record-level data dump, ADR-3 from
   Sprint 040), not a combined "code next to name" display, so they were out of scope.

DO NOT remove or weaken the code-fallback in getVoyageLabel() — most voyages in the system
have no voyageName today; falling through to voyageNumber is what keeps them identifiable
until someone names them.
DO NOT wire voyages:override into round.service.js's cascade or any other module — it is
additive, per-controller, on top of the base rbac('voyages')/rbac('invoices') gate, exactly
like Sprint 046, not a system-wide bypass mechanism.
```

### Version 2 — Accounting architecture (Sprints 049–053, always on)

Everything below is the live system. (Originally built additive behind flags; the flags were removed 2026-10-23.) Specs: `sprints/049-sprint.txt` (master plan, decisions D1–D17), `050..053-sprint.txt` (logs), `sprints/v2-code-audit-2026-10-21.md` (audit + fix status).

**No feature flags (2026-10-23).** The `modules/settings` flag service, `requireFlag`, `/settings/feature-flags`, the Settings page, the `settings` permission module and the one-way `FLAG_IN_USE` policy were removed. Partners, ledger, V2 invoicing, agent SOA, netting, settlement, expenses posting and fx are always on. Multi-currency: a non-USD invoice still needs an exchange rate for its date (`PUT /ledger/exchange-rates`, `ledger:manage`) before it can be issued. `DEPENDENTS` entries no longer carry a `flag`. Every new Round is created with `v2:true`.

**Money:** integer minor units everywhere new (`utils/money.js` backend + `frontend/src/utils/money.js`: `toMinor/fromMinor/format/allocate`; per-currency decimals; never float math). Legacy float fields (`Invoice.totalAmount/paidAmount`) are kept in step for lists, exports and the PDF. `allocate()` is largest-remainder (no lost cent).

**Ledger** (`modules/ledger`): `Account` (4-digit chart, seed 20 via `npm run migrate:seed-accounts`), `JournalEntry` + `JournalEntryLine` (append-only: Mongoose hooks refuse update/delete → `LEDGER_IMMUTABLE`; `reverse()` posts a mirror entry and flips only `status` through the raw collection). **`LedgerService.post(entry, lines, {session, allowClosed})` is the ONLY write path**: ≥2 lines, each debit XOR credit, balanced per currency, one transaction, atomic closed-Round check (`roundLock.assertRoundOpenTx`, writes `Round.lockVersion`). Journal numbers `JE-`. Account codes used: 1010 bank, 1020 cash, 1100 agent receivable, 1110 agent advances, 1200 partner current account (tagged `partnerId`), 2000 agent payable, 2200 JV reserve, 3000 partner equity, 4000 freight revenue, 5000/5100/5200/5300/5400/5900 expenses. Trial balance `GET /ledger/trial-balance`. FX table + `fx.service.getRate` (rate locked on the invoice at issue); UI/entry only with flag `fx`.

**Partners & JV shares** (`modules/partners`): `Partner`, `VesselPartner` (basis points, total 10 000, exactly one lead, unique partial index). Shares are locked once the vessel has a Round created under V2 (`Round.v2`, now `true` for every new Round) or a Final `PartnerSettlement`. Endpoints `/partners`, `/vessels/:id/partners`. Needs `partners:manage`.

**Billing / revenue cycle** (`modules/billing`, routes `/invoices`): `BookingItem` = derived pricing group (bill-to agent + voyage + container type + freight rate, `loadedQty` = Final Loading bookings), synced by `bookingItem.service` hooks (booking create/update/delete, Final Loading import). `InvoiceLine` has the partial unique index `one_live_line_per_item` (the DB-level "one invoice per item" → `DUPLICATE_BILLING`). `Invoice` got `v2, docKind (Invoice|CreditNote|DebitNote), totalMinor, paidMinor, creditedMinor, ledgerEntryId, fx …`. Flow: createDraft (locks items) → issue (conditional claim Draft→Issued, DR 1100 / CR 4000, commission accrual) → settlements (`InvoiceSettlement`; the over-payment guard is the filter of one atomic update → `SETTLEMENT_EXCEEDS_BALANCE`; DR bank/1200 partner account / CR 1100) → cancel (reversing entry, refused while settlements exist). Issued invoices are LOCKED even against `invoices:override` (corrections = credit/debit notes `CN-`/`DN-`). The V1 invoice service, payment model/service/routes and `invoices:override` flow were DELETED. Invoices are V2 only: `/api/v1/invoices` is the billing router (list, detail, PDF, bill-to, create draft, issue, cancel, settlements, notes, delete Draft). Pre-existing V1 invoice documents stay in the database, are listed read-only and show a "legacy" notice on the detail page. Overdue is derived lazily on read (stored status can lag — open audit M3). Invoice numbers are assigned at draft creation (open audit M10).

**Expenses:** `Expense` gained `kind (PDA|FDA)`, `pdaExpenseId` (unique partial index = one FDA per PDA), `paidBy (PortAgent|Company|Partner)`, `paidByPartnerId`, `fundedFromReserve`, `ledgerEntryId`. PDA never posts. FDA posts DR expense account / CR 2000 (PortAgent) | 1010 | 1200 (Partner). A posted expense is frozen (amount, type, agent, date, currency, paid-by AND scope) and cannot be deleted — reverse it first. Needs `expenses:approve`.

**Agent accounts** (`modules/agentAccounts`, routes `/agent-accounts`): Agent got `partyType (Agent|DirectLine)`, `roles`, `creditDays`, `ledgerVersion`. SOA = a QUERY over journal lines (no second table). Netting (`offset`) applies payable (2000) to open V2 invoices as `Offset` settlements, unique `batchId` (double click = no-op), reversible; Direct Line refused (`DIRECT_LINE_NO_OFFSET`). Pay agent / advance / advance return post cash movements. **Every agent cash path first calls `lockAgent()`** (touches `Agent.ledgerVersion` in the transaction) — do not remove it, it is what stops concurrent overdraw. Handling charges (idempotent per booking+move, priced from the agent's active `AgentAgreement`), final settlement statement (Draft→Agreed→Settled), commission control (`/commissions`, cancel needs `agents:commission`; invoice cancel keeps commission unless `cancelCommission:true`). Permission action for these is `agents:offset`.

**Partner settlement & closing** (`modules/partnerSettlement`, routes `/round-accounting`): `Round.closeStatus` (Open|ReadyToClose|Closed — a DIFFERENT axis from `Round.status`), `settlementMode`, `carryForwardMinor`. Engine in `partnerSettlement.logic.js` (pure, tested to the cent against the proposal's 3 examples): profit (Accrual, or Cash = accrual − outstanding receivable + outstanding payable), shares by vessel basis points, `net = paidDirect − collectedDirect + share`, greedy minimal transfers, carry-forward → JV reserve (`JvReserveMovement`, 2200). Close = one transaction (claim, checklist, calculate, closing entry, reserve Hold); open PDAs only with `rounds:closeOverride` + written reason. Reopen (`rounds:reopen`, reason) reverses the closing entry; refused while partner transfers are paid. Transfers are posted when marked paid (`allowClosed`).

**Closed-Round lock** (`rounds/roundLock.js`): `assertRoundOpen/…` pre-checks are called from every mutating service (bookings, imports, voyages, tracking, expenses, V2 invoices & settlements, handling, statements, Round update/delete); **ledger postings are additionally guarded atomically inside `LedgerService.post`**. Refusal = 409 `ROUND_CLOSED`. A new mutating path MUST call the pre-check. Late customer receipts on a closed Round are refused (strict rule; business decision pending).

**Deletes — dependents engine** (`utils/dependents.js`): `assertNoDependents(what, id, DEPENDENTS.x)` counts blockers and refuses with `HAS_DEPENDENTS` (message names each with its count). NOT a cascade. Covered: partner, vessel, agent, round, voyage. Add new entries here whenever a new collection references an existing one. Posted/ledger-referenced records are never hard-deleted.

**Errors & audit:** `AppError(status, message, code)`; `errorHandler` returns `{success:false,message,errors,code}` — stable codes are listed per sprint doc. Money events use `utils/moneyAudit.recordMoneyEvent` (before/after/reason, success AND failure, fire-and-forget; stored in `AuditLog.newValues._event/_success/_reason/_error`) — currently wired for Round close/reopen/ready, partner transfers, reserve use, vessel share changes, commission cancel; the generic `auditLogger` middleware is unchanged. Wiring the rest is open audit M4.

**Security baseline (Sprint 049):** CSRF = HMAC(JWT_SECRET, cookie JWT) in the `X-CSRF-Token` header (returned by login, /auth/me, change-password; `middleware/csrf.js`; exempt: login, forgot/reset password, accept-invite, Bearer-only clients; frontend `config/axios.js` sends it). `User.tokenVersion` revokes sessions on password change/reset. `utils/pickFields.js` whitelists schema paths on master-data updates and Booking update. `PUT /permissions/:roleId` body is `{ permissions: [{module, actions}] }` (400 otherwise).

**Permission actions added for V2** (schema `Permission.actions`, all toggles in PermissionMatrix): `issue, cancel, record` (invoices), `approve` (expenses), `offset, commission` (agents), `close, closeOverride, reopen, carryForward, useReserve` (rounds), `manage` (partners, ledger). New MODULES: `partners, ledger` (`settings` was removed with the flags).

DO NOT write to the ledger except through `LedgerService.post/reverse`. DO NOT edit or delete JournalEntry/JournalEntryLine through any model. DO NOT remove `lockAgent()`, `assertRoundOpenTx`, or the unique partial indexes (`one_live_line_per_item`, `reversesEntryId`, `pdaExpenseId`, one lead per vessel). DO NOT use floats for new money fields. DO NOT touch capacity.service.js / teuResolver.js / voyageGenerator.js for V2 work (rule R10).

### Vessel Particulars (Sprint 021)

```
New optional fields on Vessel model:
  manager, loa, beam, summerDraft, grossTonnage, netTonnage,
  suezGT, suezNT, totalBunkerCapacity, vlsfoCapacity, mdoCapacity, fwCapacity
All default to null. No migration required (additive).
```

### Booking Primary Key (Sprint 021)

```
containerNumber is the PRIMARY MATCH KEY for import and Final Loading.
  - required:true, indexed, uppercase on model
  - Import dedup (booking mode): by containerNumber + voyageId
  - Final Loading match: by containerNumber + voyageId
  - Final Loading reconciliation: cancels bookings NOT in manifest by containerNumber
containerStatus: enum ['Full', 'Empty'] ONLY — no other values allowed.
```

---

## 7. BUSINESS RULES

### Booking Workflow

```
Pending → Confirmed → Final Loading → Cancelled
Pending → Cancelled
Confirmed → Cancelled
Final Loading → Cancelled (only)
Cancelled → (terminal)

Final Loading + Cancelled: LOCKED (no edits)
Invoice exists → cannot soft-delete booking
```

### Final Loading Import

```
After save:
  1. All saved rows → status: 'Final Loading'
  2. All other voyage bookings NOT in import → status: 'Cancelled'
Returns: {created[], updated[], failed[], markedFinalLoading[], cancelled[]}
Sprint020: insertMany for new, bulkWrite for updates
```

### Tracking — Append-only

```
No PUT, No DELETE. Every POST = new document.
```

### Dashboard — SuperAdmin Only

```
Enforced by isSuperAdmin (roleId.isSystem === true), NOT permissions.
dashboard module in MODULES[] exists for audit purposes only.
Other roles: sidebar tab hidden, API not called, layout redirects to first allowed page.
```

### Expense File Serving — Authenticated

```
No public /uploads route.
Files served via GET /api/v1/expenses/:id/attachment (auth + rbac required).
```

---

## 8. STATUS TRANSITIONS

| Entity  | Transitions                                                                              |
|---------|------------------------------------------------------------------------------------------|
| Round   | Planned→Active→Completed \| Planned/Active→Cancelled                                     |
| Voyage  | Scheduled→Departed→In Transit→Arrived→Completed \| any→Cancelled                         |
| Booking | Pending→Confirmed\|Final Loading\|Cancelled; Confirmed→Final Loading\|Cancelled; FL→Cancelled |
| Invoice | Draft→Issued→Paid \| Draft/Issued→Cancelled \| Issued→Overdue \| Overdue→Paid            |

Invoice status, expanded (Sprint 046): the transitions above are enforced ONLY for a caller without the
`invoices:override` permission. A caller with it (or SuperAdmin) can set `status` to any value at any
time, bypassing both this table and the `paidAmount>0`/Paid|Cancelled lock — see the Sprint 046 section
in §6. `recalcInvoiceStatus()` (payment-driven) is unaffected either way.

Voyage status, expanded (Sprint 048): same mechanism, different module. The Voyage row above is
enforced ONLY for a caller without the `voyages:override` permission. A caller with it (or SuperAdmin)
can set `status` to any `VOYAGE_STATUS` value at any time — including un-cancelling a Cancelled voyage
or reversing/skipping stages — bypassing `STATUS_TRANSITIONS`/`validateTransition()` entirely. See the
Sprint 048 section in §6, including the `round.service.js` cascade-desync gotcha (§16).

`Booking.dischargeStatus` (Sprint 045) is a SEPARATE, independent field, not a 4th row in this table —
it only ever exists on Layer 2 Booking, only after a Discharge import, and never changes `status`
itself: `null` (not assessed) → `'Discharged'` or `'Remaining'`, terminal once set (a later Discharge
import run can still flip a `'Remaining'` booking to `'Discharged'`, or vice versa, on a re-run).

---

## 9. DELETION RULES

Sprint 047 removed soft delete system-wide — every entity below is now Hard
delete, EXCEPT User (the one deliberate exception, unchanged). Guard
conditions are byte-for-byte the same as before Sprint 047 — only the final
delete mechanism changed (`isDeleted=true;deletedAt=...;save()` →
`Model.findByIdAndDelete(id)`). No cascade delete anywhere — every guard
still just rejects if a dependent exists; the admin deletes dependents
manually first, exactly as before.

| Entity          | Type | Guard                                   |
|-----------------|------|-----------------------------------------|
| Vessel          | Hard | Blocked if Active/Planned round         |
| Agent           | Hard | Blocked if active bookings, or a non-cancelled invoice references it |
| Service         | Hard | Blocked if Active/Planned rounds        |
| Round           | Hard | Blocked if any voyage has a Booking, ManualBooking, or Expense (Round/Voyage-scoped) referencing it; else also hard-deletes its own Voyage documents (Round is Voyage's sole owner — narrow, not a generic cascade) |
| Voyage          | Hard | Blocked if non-Cancelled bookings exist |
| Booking         | Hard | Blocked if a non-cancelled invoice references it |
| ManualBooking   | Hard | No guard (unchanged — never had one)    |
| Expense         | Hard | Removes file from disk + DB record      |
| Invoice         | Hard | Blocked if paidAmount > 0                |
| ContainerType   | Hard | Blocked if any booking uses it          |
| ExpenseType     | Hard | Blocked if any Expense uses it          |
| ExpenseCategory | Hard | Blocked if any ExpenseType uses it      |
| Role            | Hard | Blocked if isSystem, or any User has it |
| Country/City/Port/Terminal | Hard | Blocked if any child location/RouteLeg references it |
| User            | Soft | The sole exception — unchanged (blocks self-delete) |
| TrackingHistory | None | Immutable, no delete route              |
| AuditLog        | None | Read-only, no delete route              |

**V2 additions (Sprint 050 + audit H5):** on top of the guards above, `utils/dependents.js` also refuses (409 `HAS_DEPENDENTS`) deleting: a **Partner** referenced by shares, ledger lines, expenses paid, partner settlements, transfers or receipts into their bank; a **Vessel** with partner share rows (and, with `accounting` on, any Round); an **Agent** with agreements, commissions, handling charges, statements, ledger lines (and, with `accounting` on, estimated bookings); a **Round** with ledger lines, finalised partner settlements, reserve movements, handling charges, statements, posted expenses or invoiced items; a **Voyage** with ledger lines, posted expenses or invoiced items. A posted Expense and an issued V2 Invoice are never hard-deleted (reverse / cancel). A Round that ever received a ledger posting can never be deleted. Draft settlements, suggested transfers and unlocked BookingItems are cleaned with a clean Round.

One-time cleanup migration (mandatory, already run as part of Sprint 047):
`npm run migrate:hard-delete-cleanup` (`backend/src/config/migrations/
migrate-hard-delete-cleanup.js`) — purges any row still sitting with
`isDeleted:true` from before this sprint, for every hard-delete model above.
Without it, those rows would have silently resurfaced everywhere the moment
the `isDeleted:false` query filters were removed.

---

## 10. AUTO-NUMBER FORMATS

| Entity  | Format     | Counter Key |
|---------|------------|-------------|
| Round   | R000001    | round       |
| Booking | BK-000001  | booking     |
| Invoice | INV-000001 | invoice     |
| ManualBooking | MB-000001 | manualBooking |
| Journal entry (V2) | JE-000001 | journal |
| Credit note (V2) | CN-000001 | creditNote |
| Debit note (V2) | DN-000001 | debitNote |

Voyage: `{serviceCode}-{roundNumber}-{seq:02d}` — no counter, derived from round data.
Sprint020: `nextNumberBatch(key, count)` pre-allocates N numbers in one atomic DB call.

---

## 11. RBAC — CURRENT STATE

5 seeded roles. SuperAdmin bypasses DB lookup (isSystem=true).
Permission doc: `{ roleId, module, actions: {create,read,update,delete,import,export,view,hidden,override} }`
`hidden:true` → module removed from sidebar.
`override` (Sprint046, extended Sprint048): lets a granted role (or SuperAdmin) bypass a module's
  normal status/lock rules. On `invoices`: bypasses the paidAmount/Paid|Cancelled lock on Invoice
  update and forces `status` to any value. On `voyages` (Sprint048): bypasses
  `STATUS_TRANSITIONS`/`validateTransition()` and forces Voyage `status` to any `VOYAGE_STATUS` value,
  including un-cancelling. Shown as a real toggle column in PermissionMatrix.jsx for EVERY module (no
  per-module column customization exists) — but since the V2-only conversion only `voyage.controller.js#update()` consults it (`invoice.controller.js` was deleted). Granting `override` on any other module
  (e.g. `agents`, `rounds`) today is still a complete no-op — see §16 gotcha on this trap.
`import`/`export` (Sprint019): toggles added to PermissionMatrix.jsx in Sprint 049 (the gap noted in Sprint 046 is closed; the "All/None" quick-set now preserves them).
Sprint020: permissions cached 120s per roleId+module. Invalidated on permission save.
Sprint046: rbac.js also exports `hasPermission(req, module, action)` — a non-gating, programmatic
  check (same cached lookup) for use inside a controller on top of the route-level rbac() gate.

| Role               | Key Access                                            |
|--------------------|-------------------------------------------------------|
| SuperAdmin         | All modules + Dashboard (by role identity)            |
| Operations Manager | rounds, voyages, bookings(+import), tracking, services |
| Finance Officer    | expenses, invoices, reports, export                   |
| Tracking Officer   | tracking only                                         |
| Viewer             | Read-only everywhere                                  |

Dashboard and auditLogs: `hidden:true, read:false` for all non-SuperAdmin roles.
GET /permissions/:roleId: self-service for the caller's OWN role only; any other role needs `roles` permission (Sprint 049). PUT needs `roles` and a non-system role cannot edit its own permissions.
V2 actions: see §6 "Version 2" (issue, cancel, record, approve, offset, commission, close, closeOverride, reopen, carryForward, useReserve, manage). Known exposure (audit M5): partner settlement, JV reserve, agent SOA and agreements are currently readable with `rounds:read` / `vessels:read` / `agents:read`.

---

## 12. API QUICK REFERENCE

```
POST   /auth/login                    ← sets httpOnly cookie, returns {user}
POST   /auth/logout                   ← clears cookie
GET    /auth/me                       ← session check (rehydration on mount)
PATCH  /auth/change-password
POST   /auth/forgot-password, /auth/reset-password

GET/POST           /vessels, /agents, /container-types, /expense-types, /locations/*
GET/PUT/DELETE     /vessels/:id, /agents/:id, etc.
GET                /vessels/:id/stats
GET                /expenses/:id/attachment         ← authenticated file download (Sprint020)
GET                /invoices/:id/pdf                ← PDF download (Sprint020)

GET /voyages/round-ports/:roundId
PUT /voyages/:id                                     ← Sprint 048: when the caller has voyages:override
                                                       (or is SuperAdmin), STATUS_TRANSITIONS is skipped
                                                       entirely — status can be forced to ANY
                                                       VOYAGE_STATUS value. Everyone else: unchanged.
GET /bookings/voyage-ports/:voyageId
GET /bookings?dischargeStatus=                       ← Sprint 045: filters the additive
                                                       Discharged/Remaining Booking List tabs
POST /bookings/import/preview, /bookings/import/save  ← Sprint 045: importType='discharge' branches
                                                       to previewDischargeImport/saveDischargeImport
                                                       (voyageId required); every other importType
                                                       unchanged. Post-audit fix: save's elevated
                                                       update+delete permission check (beyond the base
                                                       'import' action) now covers 'discharge' as well
                                                       as 'finalLoading' — both bulk-mutate bookings
                                                       outside the caller's own request.
GET /bookings/import/template                         ← Sprint 042 (new, ExcelJS-generated, colored
                                                       required/optional headers)
GET /bookings/import/template-columns                 ← Sprint 042 (new, single authoritative
                                                       column/required-flag list)

GET /tracking, /tracking/latest, /tracking/:voyageId/history
POST /tracking  [NO PUT, NO DELETE]

GET /reports/round-pnl?roundId=&voyageId=           ← Sprint 035/036: voyageId optional; response
                                                       carries BOTH legacy L1+L2/any-status fields
                                                       AND new summary/voyages[] (Final Loading only)
GET /reports/voyage-performance?bookingSource=&bookingStatus=  ← Sprint 038: L1|L2|combined,
                                                       all|finalLoading (was Layer-2-only, no filter)
GET /reports/bookings                               ← dual-layer since Sprint 034 (layer=Manual|Operational)
GET /reports/revenue                                ← Sprint 038: narrowed to Layer 2 + Final Loading ONLY
GET /reports/expenses?portId=                        ← Sprint 038: portId filter + populate + scope +
                                                       classification-grouped summary (Sprint 036 parity)
GET /reports/round-capacity?roundId=                ← Sprint 022 capacity report; Sprint 038 added
                                                       voyages[].capacityBeforeLoading (additive)
GET /reports/booking-revenue-details                ← Sprint 034 pricing-group revenue report;
                                                       Sprint 038: vgm now in MT (was kg)
GET /dashboard/stats  [SuperAdmin only — 90s cached, Sprint 039: revenue fields now Final-Loading-only]
GET /dashboard/fleet-utilisation  [SuperAdmin only — Sprint 039: totalLoadedTEU field name fixed]
(GET /dashboard/port-activity and GET /dashboard/missing-final-loading were planned for Sprint 039
 but were never implemented — confirmed absent from the running code. Do not build against them.)

GET /capacity/round/:roundId                        ← Sprint 022 per-leg engine
GET /capacity/vessel/:vesselId/active               ← Sprint 022 current active round
POST /capacity/preview                              ← Sprint 022 pre-flight (Phase 4)

PUT /invoices/:id                                   ← V2: edit a DRAFT only (notes/dates/currency); issued = 409 INVOICE_LOCKED
PUT /invoices/:id/bill-to                           ← PDF Bill To details, editable in any status
GET /invoices ; GET /invoices/:id ; GET /invoices/:id/pdf ; DELETE /invoices/:id (Draft only)   ← V2 router (the V1 /payments and /invoices/:id/payments routes were removed)

POST/PUT /expenses                                  ← Sprint 036: body accepts portId (Round/Voyage/
                                                       Port scope, inferred not stored — see deriveScope)

POST /export/excel, /export/zip                     ← Sprint 040: 13 modules (added manualBookings),
                                                       responses now include an "Export Info" metadata
                                                       sheet; dateFrom/dateTo now honored by
                                                       expenses/invoices/rounds/auditLogs
GET /audit-logs, /audit-logs/:id  [read-only]

# Version 2 (always on, see §6 "Version 2")
GET/POST/PUT/DELETE /partners   ← write = partners:manage
GET/PUT/DELETE /vessels/:id/partners                   ← JV shares (bp, one lead, locked for V2 Rounds)
GET /ledger/accounts | /ledger/trial-balance | /ledger/exchange-rates ; PUT /ledger/exchange-rates (ledger:manage)
GET /invoices/items ; POST /invoices (draft) ; PUT /invoices/:id (draft)
POST /invoices/:id/issue | cancel{reason,cancelCommission} | credit-note | debit-note
GET,POST /invoices/:id/settlements ; POST /invoices/:id/settlements/:sid/void
POST /expenses/:id/convert-fda | post | reverse        ← expenses:approve
GET /agent-accounts/:id/soa|handling|handling/preview|commissions|agreements|statement
POST /agent-accounts/:id/advance|advance-return|pay|offset|offset/:batchId/reverse|handling/confirm|statement
POST /agent-accounts/statements/:id/agree|settle ; POST /agent-accounts/commissions/:id/cancel
POST/PUT/DELETE /agent-accounts/:id/agreements
GET /round-accounting/rounds/:id/checklist ; POST …/ready|close|reopen
GET/POST /round-accounting/rounds/:id/partner-settlement ; GET …/partner-settlement/excel
POST /round-accounting/transfers/:id/pay|unpay ; GET /round-accounting/vessels/:id/reserve ; POST /round-accounting/reserve/use
GET /reports/round-pnl?roundId=&voyageId=&basis=accrual|cash   ← additive `ledgerPnl` block when `basis` is passed
GET /permissions/:roleId  [NO rbac guard — Sprint 041 flags: accepts ANY roleId, not just the
                           caller's own; fix planned, not yet implemented]
PUT /permissions/:roleId  [requires rbac('roles')]
```

---

## 13. ENVIRONMENT

### Backend `.env`

```
NODE_ENV=development
PORT=5000
MONGODB_URI=<Atlas URI>
JWT_SECRET=<min 32 chars — validated on startup>
JWT_EXPIRES_IN=24h
ALLOWED_ORIGIN=http://localhost:3000
FRONTEND_URL=http://localhost:3000
UPLOAD_MAX_SIZE_MB=10
ADMIN_EMAIL=admin@logistics.com
ADMIN_PASSWORD=Admin@123456
SMTP_EMAIL=<gmail>
SMTP_APP_PASSWORD=<16-char app password>
SMTP_FROM_NAME=Logistics SaaS
LOG_LEVEL=info
```

### Frontend `.env.local`

```
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

### Backend packages (Sprint020 additions)

```
compression ^1.7.4    — gzip middleware
cookie-parser ^1.4.6  — parse httpOnly cookie
express-rate-limit ^7.4.0 — auth route rate limiting
pdfkit ^0.15.0        — invoice PDF generation
sharp ^0.33.4         — image compression
```

### Frontend packages (Sprint020)

```
chartjs stub REMOVED from package.json (was unused squatter package)
```

---

## 14. DEMO CREDENTIALS

| Email                  | Password     | Role               |
|------------------------|--------------|--------------------|
| admin@logistics.com    | Admin@123456 | SuperAdmin         |
| ops@logistics.com      | Demo@123456  | Operations Manager |
| finance@logistics.com  | Demo@123456  | Finance Officer    |
| tracking@logistics.com | Demo@123456  | Tracking Officer   |
| viewer@logistics.com   | Demo@123456  | Viewer             |

`npm run seed` — always syncs passwords, safe to re-run.

---

## 15. VPS DEPLOYMENT

```bash
# Build and run
docker compose up -d --build

# Backend: port 5000, uploads persisted via Docker volume
# Frontend: port 3000, Next.js production build

# Health check
GET /api/v1/health → { success: true, message: 'API is running' }
```

Files: `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` at root.

---

## 16. KNOWN ISSUES / GOTCHAS

1. **$unwind trap** — ALWAYS `preserveNullAndEmptyArrays:true`, never `preserveNullAndEmpty:true`.
2. **Voyage has no isDeleted** — hard delete only. Do not add isDeleted without updating ALL voyage queries.
3. **normalizeEmail removed** — auth.validation.js must NOT use .normalizeEmail(). It transforms Gmail addresses and breaks login.
4. **useSearchParams Suspense** — any Next.js 15 page using useSearchParams() must be inside \<Suspense\>. Affects /reset-password and /accept-invite.
5. **Cookie SameSite in production** — must be 'none' (not 'strict') when frontend and backend are on different origins. Requires secure:true (HTTPS).
6. **Dashboard SuperAdmin identity check** — never use the permission system for Dashboard access. Always use `user?.roleId?.isSystem === true`.
7. **Seed passwords** — admin/demo user passwords are always overwritten on seed run. This is intentional to keep DB in sync with .env.
8. **Dead `$sum:'$quantity'` in `getRoundPnL`'s legacy block** (`reports.service.js` ~line 111) — deliberately kept for backward compatibility (Sprint 038), do not "fix" without checking whether anything still reads the legacy `totalQuantity` field first.
9. ~~`GET /permissions/:roleId` accepts any roleId~~ — FIXED in Sprint 049 (own role or `roles` permission).
10. **`getVesselStats` is uncached** — confirmed (Sprint 041), not yet fixed. (`getAgentFinancialAccount` was deleted with V1.)
11. **Round Capacity Report still resolves voyages via `round.voyageIds`**, not `Voyage.find({roundId})` — a deliberate Sprint 038 deferral, not an oversight. Do not "helpfully" change `capacity.service.js` for this without re-reading Sprint 038/041's explicit reasoning for leaving it alone.
12. ~~`import`/`export` permission actions have no UI toggle~~ — FIXED in Sprint 049: both now have columns in `PermissionMatrix.jsx`, and the "All/None" quick-set preserves them.
13. ~~Invoice status override can be overwritten by a payment~~ — obsolete: the V1 override/payment engine was deleted.
14. **`Booking.dischargeStatus` is independent of `Booking.status`** — a Final Loading booking can be `dischargeStatus: null` (not yet assessed), `'Discharged'`, or `'Remaining'`; `status` itself never changes because of a Discharge import. Don't conflate the two fields when querying or reporting.
15. **The `override` permission column is live for every module in `PermissionMatrix.jsx`, but only `voyages` (Sprint 048) actually consults it now (`invoices` stopped when V1 was deleted)** — granting `override` on any other module (e.g. `agents`, `rounds`) today is a complete no-op with no warning. If you wire a third module's controller to check `hasPermission(req, module, 'override')`, first audit whether any role already has that module's `override` toggle flipped under the (until-then-correct) assumption it did nothing.
16. **`voyages:override` can desync `round.service.js#cascadeFirstVoyageToDeparted`** (the Sprint 042 Round→Active cascade, which always departs the round's lowest-`sequence` still-`Scheduled` voyage) — if an override-holder force-sets a later voyage's status out of forward order before the round transitions to Active, the cascade will depart the wrong voyage next time, silently skipping voyage 1 in the fleet-tracking record. Capacity math is unaffected (the capacity engine only checks `status !== 'Cancelled'`); this is a tracking-record data-integrity risk, not a financial one. Not yet fixed — a real interaction to be aware of, not something this sprint attempted to solve.
17. **Integration tests have NOT run since the V2-only conversion** — Docker/mongod were unavailable. Run `npm run test:int` before trusting any money path. **V2 needs a MongoDB replica set** (transactions). Atlas is one; a plain local `mongod` is not. Use the Docker recipe in §1.5.
18. **There are no flags any more.** To start over on a dev/test database, drop it; there is no way to switch V2 off.
19. **Never post to the ledger outside `LedgerService`**, never edit ledger models, never drop `lockAgent()` or the atomic Round check — see §6 "Version 2". Probe/regression scenarios live in `backend/scripts/audit-probes/` and `test/int/audit-fixes.int.test.js`.
20. **Closed Round = no mutations** (409 `ROUND_CLOSED`), including customer receipts; reopen needs `rounds:reopen` + reason. A new mutating service MUST call the `roundLock` pre-check.
21. **Rounds created before the V2-only conversion may have `v2:false`** — their vessel's shares stay editable until a V2 Round or a Final settlement exists.
22. **Commission survives invoice cancellation by default**; cancel it explicitly (permission `agents:commission`). Commission status `Paid` is never set — payment goes through Pay Agent/netting (audit N5).
23. **Overdue is derived on read** for V2 invoices; the stored status and `?status=Overdue` filter can lag (audit M3).
24. **`node --test` runs every file under any `test/` directory** — keep non-test scripts out of `backend/test/`.
25. **Use the Write/Edit tools, not shell heredocs, for code containing backticks or `$`** — shell expansion silently corrupts template literals and Mongo operators (`$gte`).
26. **Integration tests are unverified after the V2-only conversion** (see gap list in §1). Treat invoicing, ledger and settlement changes as untested until `npm run test:int` passes on a replica set.

---

## 17. AI AGENT WORKFLOW

### Before writing any code
1. Read this file (claude.md)
2. Read sprints/STATUS.md
3. Read system-report.txt and system-flow.txt if you need flow context
4. Use read_multiple_files on EVERY file you will touch

### Implementation order
Backend: Model → Service → Controller → Routes → server.js
Frontend: service file → hook (if needed) → module component → page route

### After completing work
Update sprints/STATUS.md + this file if new patterns added.

### Never change
- Voyage auto-generation from Round.create
- totalFreight server-side computation
- RBAC middleware on every protected route
- Audit log fire-and-forget pattern (res.on finish + setImmediate)
- Response shape {success, data, message, pagination?}
- TrackingHistory append-only (no PUT, no DELETE)
- AuditLog read-only (no writes ever)
- Modal createPortal implementation
- overflow:clip on layout wrappers
- bookingImport uses voyageId NOT vesselId
- buildZipStream NOT exportZip
- Cookie-based auth (no localStorage token)
- compressUpload NOT uploadExpense
- Ledger append-only; LedgerService.post/reverse is the only ledger write path (V2)
- lockAgent() on agent cash paths and assertRoundOpenTx inside LedgerService.post (V2)
- Unique partial indexes that enforce billing/reversal/PDA/lead uniqueness (V2)
- Money as integer minor units for every V2 field (V2)

---

## 18. DOCUMENTATION FILES

| File                | Purpose                                              |
|---------------------|------------------------------------------------------|
| claude.md           | THIS FILE — AI agent master reference (current through V2 Sprint 053 + audit High fixes) |
| system-report.txt   | Full system state: screens, APIs, workflows, status  |
| system-flow.txt     | Data flow reference F-01+ + change log               |
| sprints/STATUS.md   | Sprint completion table                              |
| sprints/035..048-sprint.txt | Full spec/ADR/acceptance-criteria detail per sprint — this file only summarizes them |
| sprints/049-sprint.txt | **V2 master plan**: facts F1–F12, decisions D1–D17, sprint plans 049–054, collections map, risks |
| sprints/049-audit-recheck.txt | Sprint 049 security recheck + implementation log |
| sprints/050..053-sprint.txt | V2 implementation logs: what was built, error codes, what was verified, what was NOT done |
| sprints/v2-code-audit-2026-10-21.md | **V2 code audit** (revision 2): 7 High fixed, open Medium/Low list, probe log, route permission matrix, decisions needed |
| docs/audit/v2-final-audit-2026-10-21.md (written BEFORE the V2-only conversion; its flag-related findings no longer apply) | **V2 FINAL AUDIT**: release-readiness verdict, evidence ledger, release gates G1-G6, new findings F-1..F-8 (read this before cutover) |
| backend/scripts/audit-probes/ | Disposable-DB scripts that reproduce audit findings (re-run after each fix) |
| backend/test/, backend/test/int/ | Unit tests and DB/HTTP integration tests (see §1.5) |
| docs/*.md           | Original planning docs (01-10) + deep-dive analyses (booking-report, expense-module, invoice-behavior, reports, rolling-pnl) that fed sprints 034-039 |
