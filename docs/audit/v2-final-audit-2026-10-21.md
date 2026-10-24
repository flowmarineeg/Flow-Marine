# FLOW Maritime ERP - Version 2 FINAL AUDIT

| | |
|---|---|
| **Date** | 2026-10-21 |
| **Audited state** | Working tree on branch `version-4` (HEAD `d310d51`), **71 uncommitted paths** - all of Version 2 (Sprints 049-053 + the audit fixes) is uncommitted |
| **Scope** | The whole of Version 2 end to end: backend modules, schemas, routes, frontend, tests, dependencies, repo hygiene, documentation accuracy, release readiness |
| **Method** | Fresh evidence only. Every number below was produced during this audit by re-running the test suites, the audit probes, static scans, builds and greps against the current code. Earlier audit documents were used as a checklist of *claims to re-verify*, not as evidence. |
| **Test database** | Disposable local MongoDB 7 replica set in Docker (`flow-test-mongo`, port 27018). The live Atlas database was never touched. |
| **Previous audits** | `sprints/v2-code-audit-2026-10-21.md` (revision 2). This document supersedes it as the release-readiness statement. |

---

## 1. Verdict

> **CONDITIONAL - not yet releasable, no known High-severity defect open.**

Version 2's accounting core is correct and well protected. All 7 High findings from the code audit are fixed and re-verified today. The final pass found **one new High defect that the fixes themselves introduced** (voyage deletion would have crashed for every user) - it is fixed and now covered by a regression test - plus two repository/ops issues that block a real deployment.

**Release gates still open (all must close before real data):**

| # | Gate | Why |
|---|---|---|
| G1 | Fix the 4 Medium findings that are real defects or exposure: **M1** item-sync race, **M2** no idempotency on money posts, **M4** money-audit coverage, **M5** JV/SOA data readable with ordinary read permissions | Wrong results under normal use / compliance gap |
| G2 | Restore `backend/src/config/seed.js` (it is a broken 23-line fragment and is git-ignored) | A fresh database cannot be given an admin user; `npm run seed` crashes |
| G3 | Un-ignore `docs/`, `sprints/`, `CLAUDE.md` in the root `.gitignore` (they are ignored again) and commit | The plan, the audits and this report exist on one disk only |
| G4 | Business decisions: cutover date, currencies, Rounds open at cutover, late payments after close, rollback policy, commission default, handling-fee agent | Sprint 054 cannot start without them |
| G5 | Sprint 054: migration scripts, backup/restore rehearsal, parallel run of one real Round, controller sign-off | Not started |
| G6 | Browser UAT of the V2 screens | No screen has been used by a person against this backend |

Counts at a glance:

| | Found | Fixed / closed | Open |
|---|---|---|---|
| High (code audit) | 7 | **7** | 0 |
| High (final audit) | 3 | 1 fixed (F-1) | 2 (F-2 seed, F-3 gitignore - repository/ops, not V2 logic) |
| Medium (code audit) | 14 | 1 fixed, 1 partly | 12 |
| Low (code audit) | 10 | 0 | 10 |
| Observations from the fixes (N1-N6) | 6 | 0 | 6 |
| Final-audit Low/Info (F-4 .. F-8) | 5 | 0 | 5 |

---

## 2. Evidence ledger (everything below was run today)

| Check | Command / method | Result |
|---|---|---|
| Unit tests | `npm test` (backend) | **36 / 36 pass** |
| Integration - ledger, invoicing, netting, closing | `v2.int.test.js` | 30 / 30 |
| Integration - real HTTP (server process, cookies, CSRF, RBAC) | `api.int.test.js` | 25 / 25 |
| Integration - regression for the 7 High findings | `audit-fixes.int.test.js` | 8 / 8 |
| Integration - V1 behaviour with every V2 flag off | `v1-regression.int.test.js` (new in this audit) | 6 / 6 (after fixing F-1; it failed 1/6 before) |
| **Integration total** | `npm run test:int` | **69 / 69 pass** (3 consecutive full runs ~22 s each; see F-4 for one transient failure in 9 runs) |
| Audit probes (15) | `backend/scripts/audit-probes/probes-1.js`, `probes-2.js` | All High probes "not reproduced / blocked"; M1, M2, M3, L1 still reproduce; P-J behaves as designed |
| Static scan, undefined variables | ESLint `no-undef` over `backend/src`, `backend/test`, `backend/scripts` | **0 errors** (this is the scan that would have caught F-1); 1 unrelated parse error in `seed.js` (F-2) |
| Syntax check | `node --check` on every changed/new backend file | clean |
| Frontend build | `next build` | compiles |
| Frontend lint | `eslint src` | 25 errors, 25 warnings in the whole app. **0 errors in code written for V2.** The two V2-touched files with errors (`PermissionMatrix.jsx`, `VesselDetail.jsx`) have the *same* error at `HEAD` (verified by linting the committed versions). |
| Dependency audit (production deps) | `npm audit --omit=dev` | backend: 2 high (`nodemailer`, `sharp`), 2 moderate (`exceljs`, `uuid`); frontend: 1 high (`xlsx`). **0 critical.** Unchanged since Sprint 049. |
| Size of the change | line counts | V2 backend ~3,400 lines, V2 frontend ~1,100 lines, tests ~1,540 lines |

---

## 3. NEW findings from the final audit

### F-1 (High, FIXED) - the H5 fix broke every voyage deletion
- **Where:** `backend/src/modules/voyages/voyage.service.js`, `deleteVoyage`.
- **What:** while fixing H5 I added `await mongoose.model('BookingItem')...` but `voyage.service.js` never imported `mongoose`. The line is reached by every voyage delete that passes the guards, so **every normal voyage delete would have thrown `ReferenceError: mongoose is not defined` (HTTP 500)**. My H5 regression test only exercised the *blocked* path, so it stayed green.
- **How it was found:** the new V1-regression suite (all flags off) failed on "clean deletes still work". It is exactly the "flags off = identical to Sprint 048" acceptance criterion from the plan.
- **Fix:** use `require('mongoose')` inline (same pattern as `round.service.js`).
- **Prevention added:** `v1-regression.int.test.js` in `npm run test:int`; the static `no-undef` scan is now part of the audit checklist (section 8); it finds no further undefined identifiers.

### F-2 (High for deployment, OPEN) - `seed.js` is broken and not in git
- **Where:** `backend/src/config/seed.js` (23 lines), ignored by `backend/.gitignore:6`.
- **What:** the file on disk is a fragment that starts mid-function (`const demoUsers = [...]`, uses `await` at top level with undefined `bcrypt`, `User`, roles). `node --check` fails; `npm run seed` crashes. Because it is git-ignored, the original is not recoverable from version control, and `CLAUDE.md` still documents it as the way to create admin/demo users, roles and permissions.
- **Impact:** a clean database (new test DB, new VPS, the Sprint 054 rehearsal copy) cannot be bootstrapped with an admin. The API test suite works around it by creating roles/users itself.
- **Not caused by V2** (the file was not modified by this work) but it blocks cutover rehearsal and disaster recovery.
- **Fix:** restore `seed.js` from backup/other machine or rebuild it (roles, permissions for all modules including the new V2 ones, users, reference data); remove the ignore rule; add a seed smoke test.

### F-3 (High for governance, OPEN) - planning and audit documents are ignored by git again
- **Where:** root `.gitignore` now lists `sprints`, `CLAUDE.md`, `docs` (it was cleaned in Sprint 049; the lines are back).
- **Impact:** this report (in `docs/audit/`), the V2 master plan, all sprint logs and `CLAUDE.md` would be left out of any commit - the original audit finding H7 has returned. Nothing has been committed yet, so it is still easy to fix.
- **Fix:** remove the three lines (your file; I did not change it) before the first commit.

### F-4 (Low) - integration harness readiness timeout
- 1 of 9 full integration runs failed all 25 HTTP tests because the spawned server was not healthy within the harness's 30 s wait; the next 8 runs (including the 3 timed ones) passed. Not a product defect, but flaky tests erode trust. **Fix:** wait on a readiness log line or raise the timeout; fail with the server's stderr instead of `ignore`.

### F-5 (Info) - dependency advisories unchanged
- `nodemailer` (high), `sharp` (high), `xlsx` (high, no patched release), `exceljs`/`uuid` (moderate). Decision D-1 from Sprint 049 is still open. None of them is on the new V2 code paths, but `xlsx` parses user uploads and `nodemailer` sends password-reset mail.

### F-6 (Info) - frontend lint baseline
- 25 errors exist app-wide (React 19 `set-state-in-effect`, `rules-of-hooks`, unescaped entities). All pre-date V2. `VesselDetail.jsx` has a real conditional-hook error at `HEAD` (a hook after an early return) that can crash that page when data arrives late - worth fixing on its own.

### F-7 (Info) - documentation accuracy
- `CLAUDE.md` counted 63 integration tests; the true number is now 69 (corrected as part of this audit). It also still describes `seed.js` as working (see F-2). The audit probe count in earlier docs said 13; it is 15 including the two re-run probes.

### F-8 (Info) - Docker test container
- `flow-test-mongo` is still running on port 27018 (data is disposable). Stop it with `docker rm -f flow-test-mongo` when finished.

---

## 4. Re-verification of every earlier finding

### 4.1 High findings from the code audit (all re-verified today)

| ID | Finding | Verification today | Status |
|---|---|---|---|
| H1 | Shares unusable for vessels that already have Rounds | `audit-fixes` H1 passes; probe P-H "not reproduced" | **Fixed** |
| H2 | Concurrent pay-agent overdraws payable | `audit-fixes` H2 passes; probe P-A2 "not reproduced" (second pay refused) | **Fixed** |
| H3 | Expense movable into a closed Round | `audit-fixes` H3; probe P-B "blocked" | **Fixed** |
| H4 | Closed-Round lock not atomic / advance into closed Round | `audit-fixes` H4 x2 (incl. 6-trial close-vs-post race); probe P-K "blocked" | **Fixed** |
| H5 | Posted records orphaned by delete | `audit-fixes` H5; probes P-F, P-I, P-M "blocked". *Introduced F-1, now fixed.* | **Fixed** |
| H6 | Rollback by flags strands V2 invoices | `audit-fixes` H6; flag dependency + in-use guards | **Fixed** (policy: one-way after first document - needs your confirmation) |
| H7 | Commission uncontrollable | `audit-fixes` H7; list/cancel/permission/UI | **Fixed** (default still keeps commission on invoice cancel, by design) |

### 4.2 Medium findings (12 open, 1 fixed, 1 partly) - each re-checked in the current code

| ID | Finding | Re-check today | Status |
|---|---|---|---|
| M1 | Item-sync race (E11000) | Probe P-C: 3 of 4 concurrent calls still fail; no upsert/duplicate handling in `bookingItem.service.js` | **Open** |
| M2 | No idempotency keys | Probe P-G: same settlement accepted twice; no idempotency code anywhere in `src` | **Open** |
| M3 | Overdue only lazy | Probe P-E2: reads "Overdue", stored `Issued`, filter misses it | **Open** |
| M4 | Money-audit coverage | `recordMoneyEvent` is called from 11 sites: round close/reopen/ready, partner transfers, reserve use, vessel share changes, commission cancel. **Not** from invoice issue/cancel/notes, settlements/voids, expense post/reverse, offset, pay-agent, advances, flag changes | **Partly fixed** |
| M5 | Over-broad read permissions | `rounds:read` serves partner settlement (`partnerSettlement.routes.js:43`), `vessels:read` serves the JV reserve (`:85`), `agents:read` serves SOA/agreements/handling | **Open** |
| M6 | Multi-currency half-built | Ledger P&L, settlement, SOA, statements default to USD (`reports.service.js` lines 321-323; 7 `'USD'` literals in `src`); decision D11 unanswered | **Open (needs decision)** |
| M7 | "Agreed" statement not enforced at settle | No `STATEMENT_STALE` check anywhere | **Open** |
| M8 | Handling priced from today's agreement / booking agent | `agentAccounts.service.js:236` uses `new Date()` | **Open** |
| M9 | Partner cash without a Round invisible | `roundLines` still filters by `roundId` | **Open** |
| M10 | Invoice number assigned at draft | `invoiceV2.service.js:101` | **Open** |
| M11 | Performance (N+1 snapshots, unbounded SOA) | code unchanged | **Open** |
| M12 | Settlement partner/date not validated | no partner lookup in `invoiceV2.service.js` | **Open** |
| M13 | Reserve movement can dangle after expense delete | `expense.service.js` has no `fundedFromReserve` guard | **Open** |
| M14 | Flags had no dependency check | `FLAG_DEPENDENCY` enforced; tested | **Fixed** |

### 4.3 Low findings and observations
- L1 (system error code echoed): probe P-N still confirmed - `errorHandler.js:62`. **Open.**
- L2 (hard-coded codes): 21 account-code literals and 7 `'USD'` literals in `src`. **Open.** (An earlier document said 28; that count included `BASE_CURRENCY` defaults.)
- L3-L10 and N1-N6: code unchanged since revision 2 of the code audit - **open**, all Low/Info. N5 (cancelling a commission after the agent was paid would drive the payable negative) is the one worth fixing with M2/M4.

---

## 5. What is solid (verified, not assumed)

| Property | How it is proven |
|---|---|
| Ledger is balanced, append-only, single write path | unbalanced entry refused and rolled back; update/delete refused at model level; concurrent double reversal -> exactly one wins; trial balance balanced after every scenario |
| Money is exact | unit tests incl. 500 random allocations; every settlement figure in integration tests is integer minor units |
| No double billing | DB unique partial index; two simultaneous drafts -> one `DUPLICATE_BILLING`; two simultaneous issues -> one wins |
| No over-payment | balance check is part of the update filter; two simultaneous payments cannot both fit |
| Partner settlement correct to the cent | the 3 required examples from the proposal, from pure functions and from real ledger lines; partner accounts reach exactly zero after transfers |
| Closed Round is closed | pre-checks in every mutating service + atomic check inside every ledger post; refusal visible over HTTP (`ROUND_CLOSED`); race test |
| Permissions enforced server-side | HTTP tests: anonymous 401, forged/absent CSRF 403, role cannot read another role's matrix or edit its own, each V2 action required where designed, new actions persist and take effect immediately |
| Flags default OFF and V1 is unchanged | V1 regression suite: booking -> V1 invoice -> payment -> Paid, expenses, deletes, nothing written to V2 collections, V2-only services refuse |
| Failures are visible | stable error codes; refusals of close/override/reopen audited with reason |

---

## 6. Residual risk register

| # | Risk | Likelihood | Impact | Mitigation / owner |
|---|---|---|---|---|
| R1 | Fresh DB cannot be seeded (F-2) | Certain | Blocks rehearsal/DR | Restore seed.js - dev |
| R2 | Docs and audits never committed (F-3) | High | Loss of the plan and evidence | Edit .gitignore, commit - you |
| R3 | Duplicate money posts on retry/double-click (M2) | Medium | Wrong balances (recoverable by void) | Idempotency keys - dev |
| R4 | Concurrent item sync errors in the wizard (M1) | Medium | Sporadic failures when importing and invoicing at once | Upsert + retry - dev |
| R5 | JV profit split visible to ordinary readers (M5) | Medium | Confidentiality | Move reads to partners/ledger permissions - dev |
| R6 | Non-USD documents silently excluded from profit (M6) | Low if USD only | Wrong profit | Decide D11; refuse non-USD or consolidate |
| R7 | Late customer payments blocked on closed Rounds | High in practice | Operational friction | Decide: exempt receipts or collect before close |
| R8 | Migration of live V1 data not designed/tested (Sprint 054) | Certain until done | Cutover risk | Sprint 054 on a DB copy |
| R9 | Screens untested in a browser | High | UX defects | UAT with the controller |
| R10 | Vulnerable dependencies (F-5) | Medium | Security | Upgrade `sharp`/`nodemailer`, decide `xlsx` |

---

## 7. Release readiness checklist

| Item | State |
|---|---|
| All High findings closed | **Done** (code audit 7/7, final audit F-1) - F-2/F-3 remain (repo/ops) |
| Money / ledger / settlement logic verified by tests | **Done** |
| Concurrency guarantees tested | **Done** for billing, reversal, pay, close-vs-post; **not** for sync (M1) and idempotency (M2) |
| V1 unchanged with flags off | **Done** (new regression suite) |
| API security (auth, CSRF, RBAC) tested | **Done** for V2 endpoints |
| Medium findings G1 | **Open** |
| Seed / bootstrap works | **Broken** (F-2) |
| Code and docs committed | **No** (71 uncommitted paths; docs git-ignored) |
| Migration + backup/restore rehearsal + parallel run | **Not started** (Sprint 054) |
| Browser UAT | **Not done** |
| Controller sign-off | **Not done** |
| Dependency advisories addressed | **Open** |

**Recommended order:** F-2 seed -> F-3 gitignore + first commit (sprint-sized commits) -> M1, M2, M4, M5 (+N5) -> decisions G4 -> Sprint 054 rehearsal on a DB copy -> UAT -> parallel run and sign-off -> switch on in the documented order (partners, accounting, v2Invoices, agentSoa/netting, settlement).

---

## 8. How to repeat this audit

```bash
# unit
cd backend && npm test
# integration (local replica set, see CLAUDE.md section 1.5)
TEST_MONGODB_URI="mongodb://localhost:27018/flow_final_test?directConnection=true" npm run test:int
# probes (each prints one line; High probes must say "not reproduced"/"blocked")
node scripts/audit-probes/probes-1.js && node scripts/audit-probes/probes-2.js
# static: undefined identifiers / dead code in backend (uses the frontend's ESLint, throwaway config)
#   rules: no-undef, no-unreachable, no-dupe-keys, no-redeclare, sourceType commonjs
# frontend
cd ../frontend && npx next build && npx eslint src
# dependencies
npm audit --omit=dev   # in backend/ and frontend/
```

---

## 9. Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| Developer | | | |
| Financial controller (review against one real past Round) | | | |
| Product owner (decisions G4) | | | |

---

## 10. Revision history

| Rev | Date | Note |
|---|---|---|
| 1 | 2026-10-21 | Final audit: re-ran all suites, probes and static scans; found and fixed F-1 (regression from the H5 fix); added the V1-regression suite (69 integration tests total); recorded F-2 .. F-8; re-verified all earlier findings with evidence; release gates G1-G6. |
