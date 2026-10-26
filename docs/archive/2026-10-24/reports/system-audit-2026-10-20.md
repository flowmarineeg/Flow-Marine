# System Audit — 2026-10-20

**Scope:** Full-system review of the Logistics & Shipping Operations SaaS (Next.js 15 App Router + Express/Mongoose/MongoDB) at `D:\web-desgin\freelance\logistics`, current through Sprint 048 (`main` @ `b28f7ec`; the Sprint 048 work that was uncommitted at the last audit is now committed).

**Baseline:** `docs/reports/system-audit-2026-9-1.md` (5 HIGH / 11 MEDIUM / 9 LOW). Every prior finding is classified below as **RE-VERIFIED** (the cited code was read again on 2026-10-20) or **CARRIED** (not re-read this session; taken from the 9-1 audit and the current `CLAUDE.md`). New findings are marked **NEW**.

**Method and limits.** This audit was done by direct code reading and a fresh `npm audit` on both packages. Read this session: `server.js`, `middleware/{auth,rbac,auditLogger,upload}.js`, and the auth, users, roles, permissions, payments, invoices (delete/PDF/status), bookings (routes, update, delete, validation), rounds (delete and cascade), agents/containerTypes delete guards, export routes/controller, tracking service, `Dockerfile`/`docker-compose.yml`/`.gitignore`, `next.config`, and the bulk-delete code in `VoyageList`/`ExpenseList`/`BookingList`. **Not re-derived:** capacity-engine math, report aggregation correctness, and most of the frontend component tree. For those, the 9-1 audit's conclusions stand and are marked CARRIED. No source files were modified. Nothing was committed.

---

## 1. Executive Summary

| Severity | Count | New this audit | Theme |
|---|---|---|---|
| CRITICAL | 2 | 2 (dependency advisories) | `proxy-addr` IP spoofing (backend), `next` (frontend), both with non-breaking fixes |
| HIGH | 7 | 2 | Cross-site request forgery in production; no server-side SuperAdmin boundary; import body injection; payment double-allocation; bulk-delete stale selection; dependency exposure; project documentation not under version control |
| MEDIUM | 14 | 5 | `normalizeEmail` breaks login; user-management privilege escalation; no session revocation; mass assignment; orphaned tracking history; delete-guard gaps; no report caching |
| LOW | 12 | 4 | Enumeration, unaudited failures, security headers, invoice deletion, doc drift |

**Overall:** the architecture is consistent (Model → Service → Controller → Routes on all 23 backend modules, every route file RBAC-gated) and the earlier fixes (token NoSQL injection, ReDoS escaping, upload magic bytes, discharge-import RBAC, Round delete guards) are still in place. The most important issues now are:

1. **Authentication hardening gaps that become real in production.** SameSite is `none` in production while `express.urlencoded` is enabled and there is no Origin check, which makes cross-site state-changing form posts possible (C1). Sessions are also never revoked (M4).
2. **Four data-integrity bugs that have survived since at least 9-1.** These are import-body injection, payment double-allocation, bulk-delete stale selection and the hard-delete guards. With soft delete gone since Sprint 047, a mistake is now permanent.
3. **Dependencies.** Both packages now have a CRITICAL advisory, up from none in 9-1. Most of the fixes are non-breaking.
4. **All project documentation is untracked by git**, so a disk loss would lose it all (H7).

---

## 2. Status of the 9-1 Findings

| 9-1 ID | Status 10-20 | Notes |
|---|---|---|
| H1 import body injection | **OPEN, RE-VERIFIED** | `booking.routes.js:32-33` — preview/save routes have `rbac` only, no validators |
| H2 SuperAdmin boundary client-side only | **OPEN, RE-VERIFIED** | dashboard/auditLog routes gate on the generic `read` flag; `permission.service.js` has no validation |
| H3 payment double-allocation | **OPEN, RE-VERIFIED** | `payment.service.js:81-88` unchanged |
| H4 bulk-delete stale selection | **OPEN, RE-VERIFIED** | selection cleared only in `onSuccess`, not on filter/page change (`VoyageList`, `ExpenseList`, Operational tab of `BookingList`) |
| H5 dependency CVEs | **WORSE** | see §6 — now 2 critical |
| M1 Agent delete guard | **OPEN, RE-VERIFIED** | `agent.service.js:80` — only `Pending`/`Confirmed`, no `ManualBooking` check |
| M2 ContainerType delete guard | **OPEN, RE-VERIFIED** | `containerType.service.js:56` — Layer 2 only |
| M3 non-unique `containerNumber` | **OPEN, RE-VERIFIED** | `booking.model.js:20` — `index: true`, not `unique` |
| M4 `voyages:override` cascade desync | **OPEN, RE-VERIFIED** | `round.service.js:42-49` still departs the lowest `Scheduled` sequence; now documented in `CLAUDE.md` §16.16 |
| M5 reports uncached | CARRIED | |
| M6 N+1 inside payment transaction | **OPEN, RE-VERIFIED** | same loop as H3 |
| M7–M11, L2–L9 | CARRIED | not re-read |
| L1 phantom dashboard endpoints | **PARTIALLY FIXED** | `CLAUDE.md` now says they were never built; `docs/06-api-planning.md` still lists them. `dashboard.routes.js` has exactly 2 routes (confirmed). |
| Working-tree WIP (34 files) | **RESOLVED** | committed as `b28f7ec`; `CLAUDE.md` now documents Sprint 048 |

---

## 3. CRITICAL

**C1 (NEW) — Cookie-authenticated API with `SameSite=None`, form-body parsing enabled, and no Origin check → cross-site request forgery in production.**
`auth.controller.js:13` sets `sameSite: isProd ? 'none' : 'strict'`. `server.js:34` enables `express.urlencoded({ extended: true })`. No CSRF token, Origin/Referer check, or custom-header requirement exists anywhere. A page on any other site can auto-submit a hidden `<form method=POST>` (urlencoded or multipart) to the API, and the browser will attach the victim's cookie. CORS does not stop this, because it blocks reading responses, not sending simple requests. Endpoints that accept this today include `POST /users` (name, email, password, `roleId` are all plain fields), `POST /users/invite`, `POST /invoices/:id/payments` (nested `allocations` via `extended: true`), `POST /bookings`, `POST /expenses` (multipart), and `POST /bookings/import/save`.
*Worst case:* a SuperAdmin visits a malicious page and an attacker-controlled admin account is created. The finding applies only when frontend and backend are on different sites in production, which is why `none` was chosen.
**Fix:** (1) add an Origin allow-list middleware for all non-GET requests (reject if `Origin`/`Referer` is present and not `ALLOWED_ORIGIN`); (2) remove `express.urlencoded` if nothing needs it (the frontend sends JSON and multipart only); (3) if the deployment can be same-site, use `Lax`.

**C2 (NEW) — Critical dependency advisories: `proxy-addr` (backend) and `next` (frontend).**
Fresh `npm audit` 2026-10-20. Backend `proxy-addr`: *IP spoofing via IPv4-mapped IPv6 trust subnet* (critical). The app sets `trust proxy` to `1`, and the auth rate limiter and audit log both rely on `req.ip`. Frontend `next@16.2.9`: critical aggregate of 9+ advisories (middleware/proxy bypass, Server Action DoS and SSRF, cache confusion). Both fixes are non-breaking: `npm audit fix` in `backend/`, and `next@16.4.2` in `frontend/`.

---

## 4. HIGH

**H1 — (9-1 H1, RE-VERIFIED) Booking import accepts `agentId`/`roundId`/`voyageId` unvalidated; NoSQL operator injection breaks agent isolation.**
`booking.routes.js:32-33` apply `rbac('bookings','import')` only; `importCtrl.preview` and `importCtrl.save` read the body straight into queries. A body of `{"agentId":{"$ne":null},"importType":"finalLoading",...}` turns the reconciliation `updateMany` into a sweep across every agent (the code comment says other agents are "never affected"). The elevated-permission check in the save route does not block this: it checks only the caller's permission flags. **Fix:** `.isMongoId()` validators for `agentId`, `roundId`, `voyageId` on both routes; `.isIn([...])` for `importType`.

**H2 — (9-1 H2, RE-VERIFIED) "Dashboard / Audit Logs are SuperAdmin-only" is enforced client-side only.**
`dashboard.routes.js` and `auditLog.routes.js` check the generic `read` permission. `PUT /permissions/:roleId` (`permission.service.js:saveByRoleId`) accepts any `module` string and any `actions` object with no validator. Any role with `roles:update` can grant `dashboard`/`auditLogs` to a non-SuperAdmin role. The same holder can also edit their *own* role's permissions (self-escalation). **Fix:** server-side `isSystem` check on the two route files, plus a `permission.validation.js` that whitelists `module` against `MODULES` and `actions` keys against the known set.

**H3 — (9-1 H3, RE-VERIFIED) Payment creation does not aggregate duplicate `bookingId` allocations.**
`payment.service.js:81-88` checks each allocation against already-persisted payments only. Two allocations of 60 to a booking with 100 remaining both pass, producing a payment of 120. Payments are void-only, so this is not self-correcting. Not reachable via `InvoicePaymentPanel.jsx`'s waterfall, but a direct API call works. **Fix:** sum by `bookingId` before the loop (or reject duplicates); batch the lookup into one aggregate (also fixes M6).

**H4 — (9-1 H4, RE-VERIFIED) Bulk "Delete Selected" keeps a stale selection across filter and page changes.**
Confirmed in code: `setSelected([])` appears only in `onSuccess` handlers (`VoyageList.jsx:99`, `ExpenseList.jsx:78`, `BookingList.jsx:163`) and tab/search handlers. Filter `onChange` and `onPageChange` do not clear it. Since Sprint 047 these are hard deletes. **Fix:** clear selection in every filter and pagination handler (or key the selection state to the query key).

**H5 (NEW) — Export endpoints pass `filters` and `selectedIds` from the request body into queries without validation.**
`export.controller.js` forwards `req.body.filters` and `selectedIds` directly into `exportService.exportSingle`. The same raw-object-into-filter pattern as H1 applies, but read-only and bounded by the caller's own `export` permission, hence not CRITICAL. Combined with `ALLOWED_MODULES = Object.keys(COLUMNS)`, adding any new module to `COLUMNS` exposes it automatically. **Fix:** type-check ids with `isMongoId`, whitelist filter keys per module.

**H6 — (9-1 H5, WORSE) Dependency exposure.** See §6 for the full table. Notable: `nodemailer` (high; breaking fix to 10.x), `sharp` (high; processes uploaded images), `axios` (frontend, high, 6 advisories, non-breaking fix), `xlsx` (high, parses attacker-supplied Excel, **no fix exists**), `compression` (high, memory-leak DoS, non-breaking).

**H7 (NEW) — All project documentation is untracked by git.**
`.gitignore` lines 2, 5 and 7 ignore `docs`, `claude.md` (case-insensitive on Windows, so `CLAUDE.md` too) and `/sprints`; `git ls-files docs sprints claude.md` returns **0** files. `CLAUDE.md`, all sprint specs, `STATUS.md`, every prior audit and the 10 planning docs exist only on this machine. These are described in the project instructions as the "single source of truth" and are the primary context for any future agent or developer. **Fix:** un-ignore `docs/`, `sprints/` and `CLAUDE.md` (at minimum), or back them up elsewhere. (A reasonable middle path is to keep generated audit output ignored but track the rest.)

---

## 5. MEDIUM

**M1 (9-1 M1, RE-VERIFIED)** Agent hard-delete guard checks only `Pending`/`Confirmed` Layer 2 bookings; it ignores `Final Loading` (the invoice-eligible population) and all `ManualBooking` records. *(`agent.service.js:80`)*

**M2 (9-1 M2, RE-VERIFIED)** ContainerType hard-delete guard checks only Layer 2 `Booking.containerTypeId`, not `ManualBooking.cargoRows[].containerTypeId`. *(`containerType.service.js:56`)*

**M3 (9-1 M3, RE-VERIFIED)** `Booking.containerNumber` is indexed but not unique; the import's lookup maps are keyed on it, so duplicates give non-deterministic matching.

**M4 (9-1 M4, RE-VERIFIED)** `voyages:override` can desync `cascadeFirstVoyageToDeparted` (tracking-record integrity only; capacity unaffected).

**M5 (NEW) — `normalizeEmail()` on user and agent-contact validators breaks login for some addresses and violates a documented project rule.**
`user.validation.js:16,28,49` and `agent.validation.js:19,31` call `.normalizeEmail()`. express-validator's default for Gmail strips dots and `+tags` and lowercases. `auth.validation.js:15` and `CLAUDE.md` both forbid it for exactly this reason. Creating a user with `first.last@gmail.com` stores `firstlast@gmail.com`, but login looks up `email.trim().toLowerCase()`, so that user can never log in with the address they were given. Two distinct people can also collide. **Fix:** replace with `.trim().toLowerCase()` at all five sites.

**M6 (NEW) — User-management privilege escalation; no protection for the SuperAdmin account.**
`user.service.js` `create`/`inviteUser`/`update` accept any `roleId`, including the system role, with no check that the caller is itself SuperAdmin. `update` can also change a SuperAdmin user's `email`/`status`, and `softDelete` blocks only deleting oneself. A role holding `users:create|update|delete` can therefore promote itself or others to SuperAdmin, lock the real admin out (`status: Inactive`), or change the admin's email and use "forgot password" to take the account over. **Fix:** reject assigning/removing a `isSystem` role, and reject modifying/deleting a SuperAdmin user, unless the caller is SuperAdmin.

**M7 (NEW) — No server-side session revocation.**
`auth.service.js` `changePassword` and `resetPassword` update the hash but nothing invalidates existing JWTs (stateless, 24h, no `tokenVersion`/`passwordChangedAt` check in `middleware/auth.js`). `logout` only clears the browser cookie, so a stolen token (or the `Authorization: Bearer` fallback) stays valid for the rest of its life even after the victim resets their password. **Fix:** store `passwordChangedAt` (or a token version) on the user and reject tokens issued before it in `auth.js`; evict the cached user on password change.

**M8 (NEW) — Mass assignment via `Object.assign(doc, { ...req.body })`.**
Ten update paths copy the request body wholesale onto the document (`agent`, `booking`, `containerType`, `expenseType`, `location` ×4, `service`, `vessel` services); validators check types but do not strip unknown keys. In `booking.service.js:195` only five fields are stripped, so a caller with `bookings:update` can write `dischargeStatus`/`dischargedAt` directly. This bypasses the elevated update+delete check that guards Discharge import, and it changes capacity-engine output (remaining-onboard TEU). **Fix:** whitelist updatable fields per service.

**M9 (9-1 M5)** Reports module has no caching. *(CARRIED)*
**M10 (9-1 M6)** N+1 aggregate per allocation inside the payment transaction. *(RE-VERIFIED, see H3)*
**M11 (9-1 M7)** Blob-response errors show the generic toast. *(CARRIED)*
**M12 (9-1 M8, M10, M11)** Frontend duplication: tracking-status color map ×3, shared hooks bypassed by ~20 components, duplicated date/currency formatters. *(CARRIED)*
**M13 (9-1 M9)** `override` permission toggle is live for every module in `PermissionMatrix.jsx` although only `invoices` and `voyages` consult it (now documented in `CLAUDE.md` §16.15). *(Partially addressed: documented, not enforced.)*
**M14 (NEW) — Round hard-delete guard omits `TrackingHistory`.** `round.service.js:257-292` checks Booking, ManualBooking and Expense, then deletes the voyages. Tracking entries (append-only, no delete route) keep dangling `voyageId`/`roundId`. The tracking UI is null-safe (`getVoyageLabel(null)` returns `null`; the list shows "—"), so nothing crashes, but the history becomes unattributable. Either block deletion when tracking exists, or accept and document it.

---

## 6. Dependencies — fresh `npm audit`, 2026-10-20

**Backend: 14 vulnerabilities (1 critical, 7 high, 6 moderate).**

| Package | Severity | Issue | Fix |
|---|---|---|---|
| `proxy-addr` | **CRITICAL** | IP spoofing via IPv4-mapped IPv6 trust subnet | `npm audit fix` (non-breaking) |
| `compression` (direct) | HIGH | DoS via memory leak on premature response close | `npm audit fix` |
| `brace-expansion` | HIGH | exponential-time / OOM DoS | `npm audit fix` |
| `nodemailer` (direct) | HIGH | SMTP command injection (CRLF in transport name, `envelope.size`), unintended-domain delivery | breaking → 10.x |
| `sharp` (direct) | HIGH | libvips / libheif / librsvg CVEs (processes uploaded images) | breaking → 0.35.5 |
| `nodemon`, `braces`, `chokidar` | HIGH | dev-only toolchain | breaking, low priority |
| `express`, `qs`, `body-parser`, `morgan` | MODERATE | qs array-limit / `isBuffer` DoS | `npm audit fix` |
| `exceljs` / `uuid` | MODERATE | buffer bounds check | breaking (`exceljs@3.4.0` is a downgrade; evaluate) |

**Frontend: 16 vulnerabilities (1 critical, 14 high, 1 moderate).**

| Package | Severity | Issue | Fix |
|---|---|---|---|
| `next@16.2.9` (direct) | **CRITICAL** | middleware/proxy bypass, Server Action DoS/SSRF, cache confusion (9+ advisories) | `next@16.4.2` (non-breaking) |
| `axios` (direct) | HIGH | 6 advisories (ReDoS ×3, prototype-pollution gadgets, HTTP/2 adapter bypass) | `npm audit fix` |
| `xlsx` (direct) | HIGH | prototype pollution + ReDoS on attacker-supplied files | **none available**; evaluate replacing |
| `js-yaml`, `nanoid`, `source-map-js`, `browserslist`, `brace-expansion` | HIGH | assorted DoS | `npm audit fix` |
| `postcss`, `sharp` (via next) | HIGH | resolved by the `next` bump | |
| `eslint-config-next`, `@next/eslint-plugin-next`, `braces`, `fast-glob`, `micromatch` | HIGH | dev-only lint toolchain | breaking, low priority |

Runtime versions of note: `multer@1.4.5-lts.1` (1.x line; confirm against current advisories before the next release), Dockerfile uses `node:22-alpine` while `CLAUDE.md` states 18.

---

## 7. LOW

| ID | Finding |
|---|---|
| L1 | **(NEW)** Login responses distinguish "Invalid email or password" / "Account is inactive" / "Account not activated", and bcrypt only runs when the user exists, so accounts can be enumerated by message and by timing. |
| L2 | **(NEW)** Failed requests are never audited: `auditLogger.js` returns when `!capturedBody.success`. `docs/09-security-rules.md` §9.1 says failed logins are logged; they are not. |
| L3 | **(NEW)** The frontend sets no security headers (`next.config.mjs` is empty): no CSP, `X-Frame-Options`/`frame-ancestors`, or `X-Content-Type-Options`. `helmet` covers the API only. |
| L4 | **(NEW)** `Invoice.hardDelete` allows deleting any invoice with `paidAmount == 0`, including `Issued` ones, leaving gaps in the `INV-` sequence; any voided `Payment` documents stay orphaned. Likely worth restricting to `Draft`. |
| L5 | `GET /permissions/:roleId` accepts any role id. *(Known, 041)* |
| L6 | `Booking.dischargeStatus` unindexed; `change-password` has no rate limiter; no per-account lockout. *(Known)* |
| L7 | `buildZipStream` sequential with `new Promise(async …)` anti-pattern; `Expense.portId`-only queries unindexed. *(CARRIED)* |
| L8 | `AuditLog` has no retention policy; `cache.js` is single-instance only. *(Known)* |
| L9 | Three leftover "(optional)" strings; `RouteEditor.jsx` still uses raw `toast.error`; `BookingImport.jsx` is ~850 lines. *(CARRIED)* |
| L10 | Missing `<PageGuard>` on `agents/[id]`, `agents/new`, `roles/[id]` — re-verified this session; backend RBAC still blocks the actual reads and writes. (`dashboard/page.jsx` is also unguarded by design: it is SuperAdmin-gated by role identity.) |
| L11 | **Documentation drift** — `docs/01–10` carry "current through Sprint 046" banners and don't cover 047/048; `docs/03,04,05,06` still describe soft delete; `docs/06` lists the two nonexistent dashboard endpoints; `docs/09` still says tokens are never in cookies; `CLAUDE.md` header says "042–047 shipped" while the sprint table and §3 include 048, and §18 says "current through Sprint 046"; Docker base image documented as node 18 but is 22. |
| L12 | `system-audit-2026-9-1.md` was moved from the repo root to `docs/reports/` and the root copy shows as a deleted tracked file in `git status`. Cosmetic, but commit or restore it so the working tree is clean. |

---

## 8. Confirmed Clean (re-checked this session)

- All 25 route files apply `auth` and an `rbac()` gate; `/auth/*` public routes are limited to login, forgot/reset password and accept-invite, all rate-limited or token-checked.
- Password-reset and accept-invite tokens are type-checked (`isString()`) — the earlier NoSQL-injection fix is intact.
- RBAC cache keys are consistent between `rbac()` and `hasPermission()`; `override` checks in the voyage and invoice controllers use the same lookup.
- Upload middleware validates magic bytes and sanitises filenames; attachment serving is authenticated and uses `path.basename`.
- No `.env` files, keys or certificates are tracked in git; `env.js` validates required variables at startup; containers run as a non-root user.
- Search inputs are regex-escaped (`escapeRegex`) in the services read; Sprint 047 hard-delete guards (Round, Booking, Invoice) match their documented conditions apart from the gaps listed above.
- The capacity engine only reads `status !== 'Cancelled'`, so `voyages:override` cannot corrupt capacity numbers (CARRIED from 9-1; consistent with `CLAUDE.md`).

---

## 9. Recommended Order of Work

1. **Today (cheap, non-breaking):** `npm audit fix` in `backend/` (clears `proxy-addr`, `compression`, `express`/`qs`); `next@16.4.2` and `npm audit fix` in `frontend/` (clears `next`, `axios`, `js-yaml`, `nanoid`). Un-ignore or back up `docs/`, `sprints/`, `CLAUDE.md` (H7).
2. **This week (security correctness):** Origin check + drop `express.urlencoded` (C1); `isMongoId` validators on both import routes (H1); `isSystem` guards on dashboard/audit-log routes and a permission-save validator (H2); fix `normalizeEmail` (M5); SuperAdmin/role-assignment protection in `user.service.js` (M6); `passwordChangedAt` session invalidation (M7).
3. **Next (data integrity):** dedupe/aggregate payment allocations (H3); clear bulk selection on filter/page change (H4); extend Agent/ContainerType delete guards to Layer 1 (M1, M2); field whitelists on the ten `Object.assign` paths (M8); decide on tracking-history handling for Round delete (M14).
4. **Planned upgrades:** `nodemailer` 10.x and `sharp` 0.35.x with email and image regression checks; evaluate a replacement for `xlsx`.
5. **Hygiene:** refresh `docs/01–10`, `CLAUDE.md` header/§18, and the Docker version note; then Sprint 041's remaining items (permissions self-scope, report/agent/vessel caching, ZIP parallelism).
