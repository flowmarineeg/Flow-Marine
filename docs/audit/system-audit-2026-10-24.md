# System Audit — 2026-10-24

Scope: whole repo, state after the "V2-only conversion" (branch `version-4`, working tree).
Method: automated checks run today + targeted greps. **No database was available, so no integration test, probe or money path was exercised.** Anything marked "not verified" below is exactly that.

## 1. Verdict

| Area | Status |
|---|---|
| Backend unit tests | PASS (35/35) |
| Frontend lint | **FAIL** (22 errors, 25 warnings) |
| Route RBAC coverage | PASS (no unguarded protected route found) |
| Dependency advisories (backend, prod) | 1 high (`xlsx`, no fix) |
| Integration tests / money paths | **NOT VERIFIED** (need replica set) |
| Source control | **AT RISK** (89 changed paths, ~30 untracked V2 files/folders, nothing committed) |
| Audit probe scripts | **STALE** (reference deleted module) |

Release readiness: **not ready** until G1–G3 in section 7 are closed.

## 2. Evidence ledger

| # | Check | Command / method | Result |
|---|---|---|---|
| E1 | Unit tests | `cd backend && npm test` | 35 tests, 35 pass, 0 fail |
| E2 | Frontend lint | `cd frontend && npm run lint` | 47 problems: 22 errors, 25 warnings |
| E3 | Backend dep audit | `cd backend && npm audit --omit=dev` | 1 high: `xlsx` (prototype pollution GHSA-4r6h-8v6p-xvw6, ReDoS GHSA-5pgg-2g8v-p4x9), no fix available |
| E4 | RBAC coverage | grep every `router.<verb>(` in `*.routes.js`, list lines without `rbac(` | Only auth/public routes and routers using `router.use(auth); router.use(rbac(...))` (locations, reports) lack inline `rbac`; `permissions/:roleId` uses `ownRoleOrRoles`; `users/accept-invite` is public by design. Total 178 route declarations in 25 files |
| E5 | Leftover V1/flag references | grep `requireFlag`, `featureFlag`, `payment.service`, `getAgentFinancialAccount`, `invoices:override` | No runtime code references. Only comments in `rbac.js`, `voyage.service.js`, `voyage.controller.js`, and two probe scripts |
| E6 | Git state | `git status`, `git check-ignore` | 89 changed paths; untracked: `CLAUDE.md`, `docs/`, `backend/test/`, `backend/scripts/`, `seed.js`, and all V2 modules (ledger, billing, partners, agentAccounts, partnerSettlement, agreements, money/dependents/moneyAudit utils, V2 frontend). None are ignored any more |
| E7 | DB-backed tests | not run | No Docker/mongod available |

## 3. Findings

Severity: High = blocks release or risks data/money loss; Medium = should fix before release; Low = hygiene.

### A-1 (High) V2 code is entirely uncommitted
All of ledger, billing, partners, settlement, agent accounts, the V2 tests and `seed.js` exist only in the working tree (E6). One bad checkout, clean or disk failure loses Sprints 049–053 and the audit fixes. The V1 deletions (`D` entries) are also unstaged, so a `git checkout .` would silently restore the deleted V1 invoice/payment code next to the V2 router.
**Fix:** commit in logical chunks on `version-4` (V1 removal; ledger/partners; billing; expenses/agent accounts; settlement/closing; frontend; docs/tests) before any other work.

### A-2 (High) Money paths unverified against a database
Integration suites (`v2.int`, `api.int`, `audit-fixes.int`) have not run since the V2-only conversion (E7). Transactions, the one-invoice-per-item index, the settlement over-payment guard, `lockAgent`, `Round.lockVersion` and the atomic closed-Round check are therefore untested in their current form. `seed.js` was syntax-checked only.
**Fix:** start a Mongo 7 replica set, run `npm run test:int`, then `npm run seed` against it. Record the result in this folder.

### A-3 (Medium) Frontend lint is red (22 errors)
Real rule-of-hooks violations, which can crash at runtime or change hook order:
- `components/ui/ExportButton.jsx:29` `useEffect` called conditionally
- `modules/vessels/VesselDetail.jsx:143` `useQuery` called conditionally

`setState` synchronously inside an effect (cascading renders): `ExportButton.jsx:12`, `context/PermissionContext.jsx:17`, `bookings/DischargeListExportModal.jsx:32`, `roles/PermissionMatrix.jsx:81`, `services/RouteEditor.jsx:68,185`.
Cosmetic but build-blocking in strict lint: `react/no-unescaped-entities` in `forgot-password/page.jsx`, `BookingImport.jsx` (9 places), `BookingReport.jsx:98`, `PermissionMatrix.jsx:169`; `<a href="/">` instead of `<Link>` in `app/error.jsx:43`.
**Fix:** hooks violations first (move hooks above early returns), then effects, then escapes. Note `PermissionContext.jsx` is auth-critical; test login and permissions after touching it.

### A-4 (Medium) Audit probe scripts are stale
`backend/scripts/audit-probes/probes-1.js` and `probes-2.js` load `invoices/invoice.service`, which was deleted (E5). They will throw on start, so the "re-run probes after each fix" workflow in the V2 audit no longer works.
**Fix:** point them at `billing/*` services or retire them; keep `audit-fixes.int.test.js` as the regression source.

### A-5 (Medium) `xlsx` advisory with no patched release
Used for booking import parsing (untrusted uploads), so prototype pollution/ReDoS are reachable by any user with `bookings:import`. Import is already behind RBAC and a file-size cap, which limits exposure but does not remove it.
**Fix options:** replace with `exceljs` (already a dependency for templates/export) for reading, or vendor the patched SheetJS CDN build. Also still open from earlier audits: `sharp` and `nodemailer` major bumps.

### A-6 (Medium) Stale V1 references in comments and docs
Comments in `rbac.js`, `voyage.service.js`, `voyage.controller.js` still cite `invoices:override`/`invoice.service.js`. The `override` column still shows for every module in `PermissionMatrix`, and only `voyages` consults it, so granting it elsewhere is a silent no-op. `docs/audit/README.md` still lists a "V1 regression" test that was deleted.
**Fix:** update comments; consider hiding the Override column except for `voyages`; fix the README.

### A-7 (Low) Open V2 audit items carried forward
Unchanged by today's work; see `sprints/v2-code-audit-2026-10-21.md` section 12 for the full list. Highlights: no idempotency keys (M-series), partial money-audit coverage (M4), read-permission exposure of SOA/JV/settlement data under `rounds|vessels|agents:read` (M5), overdue derived on read (M3), invoice number allocated at draft (M10), multi-currency half built (no FX UI), `getVesselStats` uncached, no Ledger UI.

### A-8 (Low) `docs/audit/v2-final-audit-2026-10-21.md` predates flag removal
Its flag-related findings and gates no longer apply. Added a pointer here rather than rewriting history.

## 4. Verified-OK items

- Every protected route has an RBAC gate (E4); V2 actions (`issue`, `cancel`, `record`, `approve`, `offset`, `commission`, `close`, `reopen`, `manage`) are used inline on billing routes.
- No runtime code path references deleted flag/V1 modules (E5).
- Pure money/ledger/settlement logic is covered and passing (E1).
- Auth rate limiting is on login, forgot-password and reset-password only (by design); `change-password` has none (carried-over Low).

## 5. Not audited today

Frontend build (`next build`), runtime behaviour of any screen, Atlas configuration, Docker images, backup/restore, secrets in `.env`, performance under load, and the contents of the unit tests themselves (pass/fail only).

## 6. Suggested order of work

1. A-1 commit the work (small, reversible, protects everything else).
2. A-2 run integration tests and seed on a replica set.
3. A-3 fix the two rule-of-hooks errors, then the rest of lint.
4. A-4/A-6 tidy probes, comments, README.
5. A-5 plan the `xlsx` replacement.

## 7. Release gates

| Gate | Condition | State |
|---|---|---|
| G1 | V2 work committed | open (A-1) |
| G2 | `npm run test:int` green on a replica set; seed runs clean | open (A-2) |
| G3 | `npm run lint` and `npm run build` pass in `frontend/` | open (A-3; build not run) |
| G4 | No high advisory without a documented mitigation | open (A-5) |
| G5 | V2 Medium findings M1–M13 triaged | open (A-7) |
