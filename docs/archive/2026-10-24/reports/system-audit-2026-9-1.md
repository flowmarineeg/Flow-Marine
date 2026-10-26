# System Audit — 2026-09-01

**Scope:** Full-codebase review of the Logistics & Shipping Operations SaaS (MERN — Next.js 15 App Router frontend, Node/Express/Mongoose backend) at `D:\web-desgin\freelance\logistics`. Covers system architecture, every backend module (23) and frontend feature module (18) + all 42 App Router route segments, data model/business rules, RBAC, performance/caching, dependency vulnerabilities, and a from-scratch correctness review of the codebase — including a substantial **uncommitted working-tree change** (34 files, not yet committed to git) layered on top of the last audit's baseline.

**Method:** Five independent parallel research passes (backend security/RBAC, backend business logic/correctness, backend performance/caching/dependencies, frontend correctness, frontend architecture/consistency), each reading actual current source (not relying on documentation claims), cross-checked against `CLAUDE.md` and the two prior audits (`system-audit-2026-8-3.md`, referenced inside CLAUDE.md but not present as a file in the repo today, and `system-audit-2026-8-4.md`, present and read in full). The highest-severity new findings below (booking-import body injection, payment double-allocation) were independently re-verified a second time by reading the exact cited lines directly. `npm audit` was re-run fresh against both `backend/` and `frontend/` rather than trusting the prior audit's numbers. **No files were modified, no git commands beyond read-only `status`/`diff`/`log` were run, and nothing was committed or pushed, per instruction.**

**Relationship to prior audits:** `system-audit-2026-8-4.md`'s findings were re-verified rather than re-litigated. Its HIGH findings (zero Reports caching, unbounded `getBookingRevenueDetails`/`getExpenseReport` aggregation, GET query-param NoSQL injection) are **confirmed still open** and are carried into this audit's ranked list below (not double-counted as "new"). Its dependency-vulnerability table was refreshed with a new `npm audit` run — see §7. Six earlier CRITICAL/HIGH fixes (from `system-audit-2026-8-3.md`, applied before this session) were spot-checked again and remain genuinely fixed: NoSQL injection in password-reset/accept-invite tokens, `Round.hardDelete` cascade guard gaps, discharge-import RBAC gap, upload magic-byte validation, ReDoS via unescaped regex, `ManualBooking` TEU-warning visibility.

---

## 1. Executive Summary

| Severity | Count | Theme |
|----------|-------|-------|
| CRITICAL | 0 | — |
| HIGH | 5 | Booking-import body NoSQL injection breaking agent isolation; Dashboard/Audit-Log SuperAdmin boundary enforced client-side only; payment double-allocation bypasses remaining-balance check; bulk-delete selection not cleared on filter/page change (data loss, no soft-delete safety net since Sprint 047); outdated dependencies with actively-relevant CVEs (nodemailer, sharp, next, xlsx) |
| MEDIUM | 11 | Agent/ContainerType hard-delete guards miss Layer 1 (ManualBooking) references; non-unique `containerNumber` import-matching key; new uncommitted `voyages:override` can desync Round's voyage-cascade logic; Reports module has zero caching; N+1 query inside a payment DB transaction; blob-response error toast swallows the real backend message; triplicated tracking-status color map; dormant-but-live `override` permission column; shared React Query hooks bypassed by ~20 components; duplicated date/currency formatters |
| LOW | 9 | Documentation drift (2 phantom dashboard endpoints); sequential `buildZipStream`; unindexed `Expense.portId`-only queries; cosmetic voyage-status miscount under override; leftover "(optional)" text; one un-migrated toast call site; an oversized import-wizard component; a stale code comment; several already-known low-priority gaps (unindexed `dischargeStatus`, no login lockout, open `GET /permissions/:roleId`, no audit-log retention, in-memory-cache scale-out landmine)

**Overall assessment:** the codebase remains a well-organized, consistently-layered monolith (Model→Service→Controller→Routes backend; service→hook→module→page frontend) with strong RBAC *route*-level coverage (every one of 25 route files gated) and no test suite by design (documented, not an oversight). The two categories most worth immediate attention are **(1) a handful of genuinely exploitable/lossy correctness bugs** — a request-body NoSQL injection that breaks the app's core "agents never affect each other" guarantee, a payment-allocation bug that can silently overstate how much a booking has been paid, and a bulk-delete UI bug that can hard-delete records an admin never selected (with no soft-delete undo, per Sprint 047) — and **(2) dependency hygiene**, which has gotten marginally worse since the last audit (two new frontend HIGH advisories appeared) despite several fix paths becoming easier (non-breaking) in the interim.

**A note on the working tree:** at the time of this audit, `git status` shows 34 files with real, uncommitted changes on top of the last committed state (`7073340`, 2026-08-04) — no commits have landed since then. This is a genuine in-progress feature (a `voyages:override` permission mirroring Sprint 046's `invoices:override`, plus a new voyage "display name over auto-code" standard, `frontend/src/utils/voyageLabel.js`) — not test/scratch files. This audit reviews the working tree as it actually is, including this WIP, and flags where it isn't yet reflected in `CLAUDE.md`.

---

## 2. System Architecture

```
Stack:      Next.js 15 (App Router) + Tailwind CSS + React Query v5 + React Hook Form + Axios
            Node.js + Express + MongoDB Atlas + Mongoose + JWT (httpOnly cookie)
Backend:    Model → Service → Controller → Routes, uniformly, across all 23 modules
Frontend:   services/*.service.js (thin axios) → hooks/use*.js (7 entities only) →
            modules/*/*.jsx (feature components) → app/(dashboard)/**/page.jsx (route entries)
Files:      136 backend/src/*.js, 192 frontend/src/*.jsx|js
Cache:      In-memory TTL Map (backend/src/utils/cache.js) — user 60s, permissions 120s,
            dashboard 90s, capacity engine 60s. Single-instance only, no Redis.
Testing:    None anywhere — no Jest/Mocha/Vitest/Playwright, no `test` script (by design,
            documented in CLAUDE.md, not a gap this audit is flagging).
Deployment: docker-compose.yml, one backend container + one frontend container, no replicas.
```

**Cross-module coupling** is the dominant house style, not an exception: at least 20 of 23 backend `*.service.js` files reach directly into other modules' `.model.js` files for read/aggregation paths (capacity, dashboard, export, reports, vessel, invoice, agent services all do this). Given the explicit "no microservices" mandate, this is architecturally appropriate for a monolith of this size — flagged here only because `CLAUDE.md`'s current wording frames it as a narrow per-module exception rather than the system-wide norm it actually is (documentation-accuracy note, not a defect).

**Error handling** is split between the modern `AppError` class and legacy `throw {status, message}` object-throws, roughly evenly, across older vs. newer files. Both are read identically by `errorHandler.js`, so this reaches the frontend with zero behavioral inconsistency — pure technical debt, not a bug.

### 2.1 Backend module inventory (23)
`agents, auditLogs, auth, bookings, capacity, containerTypes, counters, dashboard, expenses, expenseTypes, export, invoices, locations, permissions, reports, roles, rounds, routes, services, tracking, users, vessels, voyages`

### 2.2 Frontend feature modules (18) / App Router routes (42 segments)
`agents, auditLogs, bookings, containerTypes, dashboard, expenses, expenseTypes, export, invoices, locations, reports, roles, rounds, services, tracking, users, vessels, voyages` — routes span `(auth)` (login/forgot-password/reset-password/accept-invite) and `(dashboard)` (every module above plus 7 report sub-pages, bookings/import, bookings/manual, bookings/new-manual).

### 2.3 The core domain model (condensed — see `CLAUDE.md` for full detail)
- **Rounds → Voyages** (auto-generated per leg, `sequence`-ordered) **→ Bookings**, split into two parallel commercial/operational layers:
  - **Layer 1 — ManualBooking** (commercial estimate/reservation, multi-container-type `cargoRows[]`, no `containerNumber` yet)
  - **Layer 2 — Booking** (operational, one container per document, `containerNumber` as primary match key, imported via Excel)
- **Capacity Engine** (`capacity.service.js`) walks actual Voyage documents (not synthetic route segments) and computes onboard/remaining TEU per voyage from both layers combined, with a forward-walking multi-voyage transit resolver and a Sprint 045 "remaining onboard past discharge" tracking extension.
- **Invoices** are header + `lineItems[]` snapshots (never live-re-read from Booking), tagged Booking/Voyage/Round scope, with **explicit per-booking Payment allocation** (never proportional), an automatic payment-driven status machine, and a Sprint 046 admin-override escape hatch.
- **Deletion**: Sprint 047 converted 14 of 15 deletable models from soft-delete to **hard delete** (User is the sole remaining soft-delete exception) — this materially raises the stakes of any bulk-selection or guard-condition bug, since there is no longer an `isDeleted` undo path.

---

## 3. The Uncommitted Working-Tree Change (WIP, not yet in `CLAUDE.md`)

`git diff` shows 34 files (2 backend, 1 new frontend util + 31 frontend consumers) implementing two related, uncommitted features:

1. **`voyages:override` permission** (`backend/src/modules/voyages/voyage.controller.js`, `voyage.service.js`) — mirrors the existing Sprint 046 `invoices:override` pattern exactly: an additive `rbac.hasPermission(req, 'voyages', 'override')` check on top of the base `rbac('voyages')` route gate, which — when granted — makes `voyage.service.js#update()` skip `validateTransition()` (the `STATUS_TRANSITIONS` state machine) entirely, allowing a voyage's `status` to be force-set to any enum value. Implemented safely and consistently with the invoice precedent (see §5 for the one real side effect found).
2. **Voyage display-label standard** (`frontend/src/utils/voyageLabel.js`, new file) — `getVoyageLabel(v)` returns `v.voyageName || v.voyageNumber || null` (show the human name if set, else the auto-code, never both), threaded through ~25 components. Verified clean — every call site was traced back to a service function that actually populates `voyageName`/`voyageNumber`; no blank-render or wrong-object bug found anywhere in this part of the diff.

**Documentation gap:** neither feature is yet reflected in `CLAUDE.md`. In particular, `backend/src/modules/permissions/permission.model.js:16`'s comment (`// Sprint046: invoice-only, full manual override`) is now factually stale now that a second controller consults the same flag — see Finding M9.

---

## 4. Security & RBAC

**Confirmed clean (re-verified against current code):** all 25 backend `*.routes.js` files have an `rbac()` gate (two files — `locations`, `reports` — looked ungated on a shallow grep but both apply `router.use(rbac(...))` at the top; false alarm, confirmed clean on a full read); no path traversal in expense-attachment serving (`path.basename()` used correctly); upload magic-byte validation is wired in; no hardcoded secrets; `env.js` validates all required vars at startup; `middleware/auth.js`/`middleware/rbac.js` cache-key schemes are consistent between the original `rbac()` middleware and the newer `hasPermission()` helper (no stale-key risk).

**New findings this session** (not in `CLAUDE.md`'s "Known open gaps" or the prior audit):

- Booking-import routes (`POST /bookings/import/preview`, `POST /bookings/import/save`) have **zero express-validator coverage** on the request body — `agentId`/`roundId`/`voyageId` are consumed straight from `req.body` into Mongoose queries and `updateMany` filters inside `bookingImport.service.js`. See Finding H1 below — this is the most severe item in this audit.
- The "Dashboard and Audit Logs are SuperAdmin-only" rule (`CLAUDE.md` §6, called an absolute rule enforced "by role identity, NOT the permission system") is **only actually enforced in the frontend**. The backend routes gate on the ordinary `Permission.actions.read` flag, and `PUT /permissions/:roleId` has no request validator at all (no `permission.validation.js` file exists) — a `roles:update`-holding admin can grant `dashboard`/`auditLogs` read access to any role via a direct API call, with no server-side check that would catch or block it. See Finding H2.
- `voyages:override`'s only real side effect: it can desynchronize `round.service.js`'s "cascade the first Scheduled voyage to Departed" logic if a voyage's status is force-set out of forward order — see Finding M4. Capacity math itself is confirmed unaffected (the capacity engine only ever checks `status !== 'Cancelled'`, never assumes forward progression).
- `permission.model.js`'s `override` field is exposed as a live toggle for **every** module in `PermissionMatrix.jsx` (not just invoices/voyages, "no per-module column customization exists" per its own comment) — a role could be granted e.g. `agents:override` or `rounds:override` today under the (now-stale) impression it's cosmetic, and it would silently become load-bearing the moment any future controller starts checking it. See Finding M9.

**Re-verified, still open (already documented in `CLAUDE.md`/prior audit, carried into the ranked list, not re-described in full here):** GET query-param NoSQL injection across ~12 `list()` functions (booking/invoice/expense/auditLog services all assign raw query params into Mongo filters with no type check); `GET /permissions/:roleId` accepts any `roleId`, not just the caller's own; no per-account login brute-force lockout (IP-keyed only); `change-password` has no rate limiter at all; export filters (`POST /export/excel` body) have the same unvalidated-object-into-filter pattern (lower severity — read-only, within the caller's own RBAC'd scope).

---

## 5. Business Logic Correctness

The Capacity Engine, Invoice/Payment snapshot model, Discharge Import reconciliation, and Hard-Delete guard *conditions* documented in `CLAUDE.md` were all confirmed to still behave as specified — no deliberate design decision documented there was found to be violated (e.g. `round.voyageIds` vs. `Voyage.find({roundId})`, Other-Voyage-Cost not broken out per-voyage, rate-never-averaged in Booking Revenue Details, the payment-void POST→'create' mapping — all confirmed unchanged and intentional, not flagged as bugs).

**New correctness bugs found:**

- **Payment allocation double-counting** — `payment.service.js#create()`'s remaining-balance check re-queries only already-*persisted* `Payment` documents per allocation entry; it never accounts for a second allocation to the *same* `bookingId` within the *same* incoming request. Two allocations of 60 each to one booking with a remaining balance of 100 both individually pass the check, producing one `Payment` overstating that booking's paid amount by 20 — permanently, since payments are void-only, never editable. Verified directly by reading `payment.service.js:66-88`. See Finding H3.
- **Agent hard-delete guard** (`agent.service.js:80`) only blocks on `Booking.status IN ['Pending','Confirmed']` — it excludes `'Final Loading'` (the exact invoice-eligible population) and never checks `ManualBooking.agentId` (Layer 1) at all. An Agent can be hard-deleted while still owning un-invoiced Final Loading bookings or live commercial reservations. See Finding M1.
- **ContainerType hard-delete guard** (`containerType.service.js:56`) only checks Layer 2 `Booking.containerTypeId`, never `ManualBooking.cargoRows[].containerTypeId` — deletable while still referenced by Layer 1 cargo rows, silently triggering the existing 1-TEU fallback on every future recompute. See Finding M2.
- **Non-unique `containerNumber` import matching** — `booking.model.js` indexes `containerNumber` but does not mark it `unique`. Both `previewImport`/`saveImport`'s `existingMap` and `previewDischargeImport`'s `byContainer` build a flat object keyed on this non-unique string from an unsorted query result — if two Bookings in the same (Round, Agent) scope share a containerNumber, resolution becomes non-deterministic (could silently update the wrong document, or falsely report "matched to another voyage"). See Finding M3.

---

## 6. Frontend Correctness & Consistency

**Real bugs found:**

- **Stale bulk-selection on filter/page change** — `VoyageList.jsx` and `ExpenseList.jsx` never clear their `selected` array when a filter changes or the page changes; `BookingList.jsx`'s Operational tab has the same gap for its round/voyage/agent/status filters and pagination (it *does* correctly clear on search-text change and tab-switch, from an earlier post-audit fix — but that fix didn't cover filters/pagination). Since Sprint 047 removed all soft delete, a stale selection surviving into a "Delete Selected" click permanently destroys records the admin never looked at on the current view. See Finding H4.
- **`showErrorToast` can't read Blob error bodies** — `InvoiceList.jsx`'s PDF-download failure path calls the shared `showErrorToast(e, 'download')` helper, but `axios` was called with `responseType:'blob'`, so `error.response.data` is a `Blob`, not parsed JSON; the helper's `data?.message` read is always `undefined` here, silently downgrading every failed PDF download to the generic fallback message instead of the real reason. Three sibling blob-download sites (`BookingImport.jsx`, `DischargeListExportModal.jsx`, `ExportPanel.jsx`) correctly use a dedicated `readBlobError` helper for exactly this case. See Finding M7.

**Confirmed clean:** every `getVoyageLabel(v)` call site in the new WIP diff resolves to a genuinely populated object (traced through the relevant backend service/populate for all ~25 sites); the `voyageDisplayOrder.js` sort utility has exactly its 4 documented consumers, no stragglers; `PageGuard` coverage has exactly the 3 already-documented gaps (`roles/[id]`, `agents/[id]`, `agents/new`) and no new ones; `EligibleBookingsTable.jsx`/`BookingsLedger`/`BookingRow` (deleted per Sprint 044/047) are confirmed genuinely gone with no dead imports.

**Consistency/duplication findings** (architecture pass): a triplicated tracking-status color map despite an existing shared `Badge.jsx` (M8); ~20 components still bypassing the 7 shared React Query hooks for near-static dropdown data (M10, re-confirmed from the prior audit); 17 files locally reimplementing an identical date formatter and 13 reimplementing an identical currency formatter, despite shared utilities existing but going unused (M11); 3 leftover `(optional)` text instances that should have been removed under the Sprint 042 required-field convention (L5); one mutation site (`RouteEditor.jsx`) still on the pre-Sprint-042 raw-toast pattern instead of `showErrorToast` (L6); `BookingImport.jsx` at 850 lines mixing Excel parsing, two inline sub-components, data-fetching, and wizard state in one file (L7).

---

## 7. Performance, Caching & Dependencies

**Confirmed still open** (re-verified against current code, not re-described in full — see prior audit for detail): Reports module (`reports.service.js`) has zero caching despite 6+ DB calls per `getRoundPnL` invocation, and this is called directly by dashboard widgets on every mount; `getExpenseReport`'s `Expense.find()` has no `.select()`/`.limit()` at all (fully unbounded); `getBookingRevenueDetails` got a partial, *documented* mitigation since the last audit (a `.select()` field projection, explicitly not a `.limit()` — a code comment cites the exact reasoning: capping rows before JS-side grouping would corrupt the pricing-group totals, so this was a deliberate trade-off, not an oversight); `export.service.js#buildZipStream` is still sequential (`for...of` + `await`, not `Promise.all`) with a `new Promise(async ...)` executor anti-pattern; `agent.service.js#getAgentFinancialAccount`/`vessel.service.js#getVesselStats` remain uncached; ~20 components still bypass the shared React Query hooks (§6 above).

**New performance finding:** an N+1 query pattern inside `payment.service.js#create()`'s DB transaction — one `Payment.aggregate()` call per allocation entry in the loop at lines 81-88. This got more consequential since Sprint 047's redesigned one-row payment panel auto-distributes a single payment across every line item on a Round-scope invoice (potentially dozens of bookings), lengthening how long the transaction/session stays open. See Finding M6. A minor related index gap: `Expense.portId` has no portId-leading index, so a portid-only report filter falls back to a collection scan (Finding L3).

**Dependency vulnerabilities — fresh `npm audit`, 2026-09-01:**

Backend (`backend/`) — 6 vulnerabilities (1 low, 2 moderate, 3 high), **unchanged from the last audit**:

| Package | Severity | Issue | Fix path |
|---|---|---|---|
| `body-parser` | LOW | DoS via silently-disabled size limit | `npm audit fix` (non-breaking) |
| `brace-expansion` | HIGH | ReDoS/OOM family | `npm audit fix` (non-breaking) |
| `nodemailer` (≤9.0.0) | HIGH | SMTP injection, SSRF, `disableFileAccess` bypass, weak OAuth2 TLS, ReDoS — actively used for password-reset/invite email | `nodemailer@9.1.0` (**breaking**, patch version advanced since last audit) |
| `sharp` (<0.35.0) | HIGH | libvips CVEs — processes untrusted uploaded images | `sharp@0.35.4` (**breaking**, patch version advanced since last audit) |
| `uuid` (<11.1.1, via `exceljs`) | MODERATE | Buffer bounds check | `exceljs@3.4.0` (**breaking**) |

Frontend (`frontend/`) — **7 high-severity vulnerabilities, up from 5 at the last audit**:

| Package | Severity | Issue | vs. prior audit |
|---|---|---|---|
| `brace-expansion` | HIGH | ReDoS/OOM | unchanged |
| `next` (16.2.9) | HIGH | 9 advisories incl. SSRF, unauthenticated internal-endpoint disclosure | fix path improved — `next@16.3.4` is now a **non-breaking** upgrade (was flagged breaking last audit) |
| `postcss`, `sharp` (transitive via next) | HIGH | same family | resolved by the `next` bump above |
| `xlsx` (^0.18.5) | HIGH | prototype pollution + ReDoS, parses attacker-supplied import files by design | **still no fix available from the maintainer** |
| `js-yaml` | HIGH | **NEW** — quadratic-CPU ReDoS (CVE-2026-59870) | not present in the last audit; `npm audit fix` (non-breaking) |
| `nanoid` | HIGH | **NEW** — non-secure generator can loop indefinitely | not present in the last audit; `npm audit fix` (non-breaking) |

The two new frontend advisories are against already-installed transitive packages (newly-published CVEs, not new dependencies added since the last audit) and are both cheap, non-breaking fixes. See Finding H5.

---

## 8. Audit Findings — Ranked High → Medium → Low

*(0 CRITICAL findings — as with the prior audit, nothing rises to an immediate-outage/unauthenticated-full-compromise level.)*

### HIGH

**H1 — Booking Import accepts `agentId`/`roundId`/`voyageId` from the request body with zero validation, enabling NoSQL operator injection that breaks the app's core agent-isolation guarantee.**
`backend/src/modules/bookings/booking.routes.js:32-33` (`POST /import/preview`, `POST /import/save`) apply only `rbac('bookings','import')` — no express-validator on the body at all. `bookingImport.service.js` then uses `agentId`/`roundId` verbatim from `req.body` inside `Voyage.find({roundId})` and the Final-Loading reconciliation `Booking.updateMany({..., agentId, ...})` sweep. A caller with ordinary `bookings:import`+`update`+`delete` permissions can send `{"agentId":{"$ne":null}, "roundId":"<real>", "importType":"finalLoading", ...}` — `agentId` becomes a live `$ne` operator matching every agent, so the reconciliation sweep cancels **other agents'** bookings, directly contradicting the code's own comment ("Other agents' bookings are never affected"). The same pattern exists in the discharge-import functions. **Fix:** add `.isMongoId()` validators for `agentId`/`roundId`/`voyageId` on both import routes — same class of fix as the already-flagged GET query-param issue, just on a POST body this time with destructive reach.

**H2 — The "Dashboard/Audit Logs are SuperAdmin-only" rule is enforced only client-side; the backend has no equivalent check and the permission that gates it is freely, unvalidatedly mutable.**
`backend/src/modules/dashboard/dashboard.routes.js`, `backend/src/modules/auditLogs/auditLog.routes.js` gate purely on the generic `Permission.actions.read` flag — neither checks `req.user.roleId.isSystem`. `PUT /permissions/:roleId` (`permission.service.js#saveByRoleId`) has no request-validation module at all (`permission.validation.js` does not exist) and will persist any `actions` object for any `module` string sent to it. Any role holding `roles:update` can grant `dashboard`/`auditLogs` read access to a non-SuperAdmin role via a direct API call, defeating a rule `CLAUDE.md` repeatedly calls absolute ("NEVER use the permission system for Dashboard access"). **Fix:** add a server-side `isSystem` check in `dashboard.controller.js`/`auditLog` routes as defense-in-depth, independent of the permission flag.

**H3 — Payment creation doesn't dedupe/sum multiple allocations to the same booking within one request, letting a single payment overstate a booking's paid amount past its real balance.**
`backend/src/modules/invoices/payment.service.js:81-88` — the remaining-balance check calls `getBookingAllocatedTotal()` per allocation entry, which only sums already-*persisted* Payments; it never checks other entries in the *same* incoming `allocations[]` array. `payment.validation.js` has no dedup check either. `POST /invoices/:id/payments` with two allocations of 60 each to one booking whose remaining balance is 100 — each individually passes (60 ≤ 100) — produces a single `Payment` with `amount:120`, permanently overstating that booking's paid total (payments are void-only, never editable, so this is not self-correcting). Not reachable through the normal `InvoicePaymentPanel.jsx` waterfall UI, but nothing stops a direct API call. **Fix:** sum `allocations` by `bookingId` before the balance-check loop, or reject a request containing duplicate `bookingId`s outright.

**H4 — Bulk "Delete Selected" doesn't clear its selection on filter or page change, and Sprint 047 removed the soft-delete safety net — a stale selection can permanently destroy unintended records.**
`frontend/src/modules/voyages/VoyageList.jsx` (filter `onChange`s, `Pagination onPageChange`) and `frontend/src/modules/expenses/ExpenseList.jsx` (same pattern) never call `setSelected([])` on filter/page change; `frontend/src/modules/bookings/BookingList.jsx`'s Operational tab has the identical gap for its round/voyage/agent/status filters and pagination (only search-text and tab-switch were previously patched). Scenario: select 2 rows on page 1, change a filter or navigate to page 2, click "Delete Selected" — the stale, now-invisible ids are hard-deleted along with (or instead of) what's currently visible. Since Sprint 047 converted these entities to hard delete with no `isDeleted` undo path, this is unrecoverable data loss, not a cosmetic bug. **Fix:** clear `selected` on every filter `onChange` and `onPageChange`, matching the fix already applied to `BookingList.jsx`'s tab-switch/search cases.

**H5 — Outdated dependencies carry actively-relevant HIGH-severity CVEs, and frontend exposure has grown since the last audit.**
Backend: `nodemailer` (SMTP injection/SSRF — the app actively sends password-reset/invite email through it) and `sharp` (libvips CVEs — processes untrusted uploaded images) both require a breaking major-version bump, unresolved since the last audit. Frontend: `next` (9 advisories including SSRF and unauthenticated internal-endpoint disclosure — fix path has improved to a non-breaking `next@16.3.4`), `xlsx` (prototype pollution/ReDoS, parses attacker-supplied Excel import files by design, **no fix available from the maintainer**), plus two newly-published HIGH advisories since the last audit (`js-yaml`, `nanoid`, both cheap non-breaking fixes). **Fix:** schedule the `nodemailer`/`sharp` breaking upgrades deliberately (re-test email templates and image compression after), test-upgrade `next` to 16.3.4 (resolves 3 advisories at once), run `npm audit fix` immediately for the non-breaking items on both packages, and evaluate replacing `xlsx` given no upstream fix exists for a package that parses attacker-supplied files.

### MEDIUM

**M1 — Agent hard-delete guard misses Final Loading bookings and all of Layer 1.** `agent.service.js:80` only checks `Booking.status IN ['Pending','Confirmed']`, excluding `'Final Loading'` (the invoice-eligible population) and never checking `ManualBooking.agentId` at all — an Agent with un-invoiced Final Loading bookings or live commercial reservations can be hard-deleted, orphaning `agentId` system-wide.

**M2 — ContainerType hard-delete guard misses Layer 1 usage.** `containerType.service.js:56` only checks Layer 2 `Booking.containerTypeId`, never `ManualBooking.cargoRows[].containerTypeId` — deletable while still referenced by Layer 1 cargo rows, silently triggering the existing 1-TEU fallback on every future recompute.

**M3 — Non-unique `containerNumber` import-matching key can resolve to the wrong booking.** `booking.model.js` indexes but does not uniquely-constrain `containerNumber`; both `previewImport`/`saveImport` and `previewDischargeImport` build a flat lookup object keyed on this string from an unsorted query — two Bookings sharing a containerNumber in the same (Round, Agent) scope produce non-deterministic resolution, risking a silent wrong-record update or a false "matched to another voyage" rejection.

**M4 — The new (uncommitted) `voyages:override` can desync Round's voyage-departure cascade.** `round.service.js#cascadeFirstVoyageToDeparted` always departs the lowest-`sequence` voyage still `Scheduled`. An override-holder can force a later voyage's status forward out of order (e.g. `Arrived` while the round is still `Planned`); when the round later transitions to Active, the cascade departs the *next* Scheduled voyage instead, leaving voyage 1 permanently skipped in the fleet-tracking record. Capacity math is confirmed unaffected — this is a data-integrity/tracking-record issue, not a financial one. Not yet documented in `CLAUDE.md`.

**M5 — Reports module has zero caching.** `reports.service.js` (`getRoundPnL`, `getVoyagePerformance`, `getBookingReport`, `getRevenueReport`, `getExpenseReport`, `getBookingRevenueDetails`) re-runs its full fetch/aggregate pipeline on every call, including from dashboard widgets on every mount per the documented Tier-2 pattern; `getExpenseReport`'s `Expense.find()` additionally has no `.select()`/`.limit()` at all. Same proven `cache.js` TTL pattern used elsewhere (capacity 60s, dashboard 90s) would close this.

**M6 — N+1 query pattern inside the payment-creation DB transaction.** `payment.service.js:81-88` runs one `Payment.aggregate()` per allocation entry inside `session.withTransaction()`; Sprint 047's redesigned one-row payment panel can now generate dozens of these per call on a Round-scope invoice, extending how long the transaction stays open. Batch-fetch all bookings' allocated totals in one aggregate before the loop.

**M7 — `showErrorToast` can't surface the real error on blob responses.** `InvoiceList.jsx`'s PDF-download failure path reads `error.response.data.message`, but the request uses `responseType:'blob'`, so `data` is a `Blob`, not parsed JSON — every failed PDF download shows the generic fallback message instead of the actual reason. Three sibling blob-download sites already use a dedicated `readBlobError` helper for this exact case; apply the same fix here.

**M8 — Tracking-status color map duplicated in 3 places despite an existing shared component.** `TrackingDetailModal.jsx`, `TrackingList.jsx`, and `VesselDetail.jsx` each hand-declare an identical tracking-status→Tailwind-class map, while `Badge.jsx` already covers every tracking status and is used by 17 other files. A future status/color change requires 4 edits instead of 1.

**M9 — The `override` permission's stale documentation invites a "dormant grant becomes live" trap.** `permission.model.js:16`'s comment still says "Sprint046: invoice-only" though `voyage.controller.js` now also consults it; `PermissionMatrix.jsx` exposes a working `override` toggle for every module (not just invoices/voyages). An admin could grant e.g. `agents:override` today believing it's inert, and it would silently become a real elevated capability the first time any future controller checks it for that module, with no re-audit trigger to catch already-granted roles.

**M10 — Shared React Query hooks bypassed by ~20 components.** `useAgents`/`useRounds`/`useVoyages`/`usePorts`/`useContainerTypes`/`useServices`/`useVoyagePorts` (5-10min `staleTime`) exist but ~20 components (BookingForm, BookingImport, BookingList, ManualBookingForm, DashboardFilterBar, ExpenseForm, InvoiceForm/List, report pages, TrackingForm/List, RouteEditor, and others) re-declare raw `useQuery` for the same near-static dropdown data instead, fragmenting the React Query cache and multiplying network refetches system-wide. Re-confirmed from the prior audit — no adoption progress since.

**M11 — Duplicated date/currency formatting logic.** 17 files locally reimplement an identical date formatter (the one shared `formatters.js#formatDate` is used by only 1 file and doesn't even match the format the rest of the app wants) and 13 files locally reimplement an identical currency formatter, despite two existing shared `fmtMoney` exports going unused outside their own module.

### LOW

**L1 — Documentation drift: two dashboard endpoints documented in `CLAUDE.md` don't exist.** `GET /dashboard/port-activity` and `GET /dashboard/missing-final-loading` are documented as shipped in Sprint 039 but have zero backing route/controller/service/frontend reference anywhere in the codebase — re-confirmed from the prior audit, still not corrected.

**L2 — `export.service.js#buildZipStream` is still sequential.** `for...of` + `await` across export modules instead of `Promise.all`, plus a `new Promise(async (resolve, reject) => {...})` executor anti-pattern — both already flagged (Sprint 041 gap), still open.

**L3 — `Expense.portId` has no portId-leading index.** A `GET /reports/expenses?portId=X` call with no `voyageId` falls back to a collection scan since the only compound index leads with `voyageId`. Low urgency at current data volume.

**L4 — Two informational voyage-status counts can misreport under `voyages:override`.** `dashboard.service.js:43` and `vessel.service.js:137` both count voyages `IN ['Scheduled','Departed','In Transit']` and would mis-count a voyage overridden backward from `Arrived`/`Completed` — cosmetic only, no financial/capacity impact.

**L5 — 3 leftover "(optional)" text instances survive the Sprint 042 required-field convention cleanup.** `ExportPanel.jsx` ("Date Range Filter (optional)"), `RoundPnlReport.jsx` ("Voyage (optional)"), `ExpenseForm.jsx` (placeholder "Port name (optional)").

**L6 — One mutation site not yet on the shared error-toast pattern.** `RouteEditor.jsx`'s save mutation still uses the pre-Sprint-042 raw `toast.error(msg)` instead of `showErrorToast`, losing the per-field error listing the rest of the app gets.

**L7 — `BookingImport.jsx` (850 lines) mixes several concerns in one file.** Raw Excel parsing, two inline presentational sub-components, 3 data-fetching queries, and multi-step wizard state all live in one file — the same class of complexity this codebase already split elsewhere (Dashboard Sections/Widgets, Sprint 039). Not urgent; a reasonable future candidate for the same treatment.

**L8 — Stale comment in `AgentFinancialAccount.jsx` (~line 162).** Still describes a "`BookingRow` inside `RoundsStatement`, untouched by this sprint" that was in fact removed by a later Sprint 044 addendum — documentation drift only, no functional issue (the actual code is correct).

**L9 — Already-known LOW items, re-confirmed still open, carried forward from `CLAUDE.md` §16 and the prior audit (not re-described in full):** `Booking.dischargeStatus` has no index; `change-password` has no rate limiter; login has no per-account brute-force lockout (IP-keyed only); `GET /permissions/:roleId` accepts any `roleId`, not just the caller's own; `AuditLog` has no TTL/retention policy and grows unbounded; the in-memory `cache.js` has no multi-instance guard rail (harmless today at 1 replica, a real landmine if the app is ever scaled out without first swapping to Redis).
