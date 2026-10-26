# 10 — Users, Auth, Roles, Permissions (RBAC) & Audit Logs

Modules `auth`, `users`, `roles`, `permissions`, `auditLogs`; middleware `auth`, `csrf`, `rbac`, `auditLogger`. UI: `/login`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/users`, `/roles`, `/roles/[id]` (permission matrix), `/audit-logs`.

## Schemas
- **User**: `name`, `email` (unique, lower-cased by schema; `.normalizeEmail()` is **never** used), `password` (bcrypt cost 12; `null` until an invited user accepts), `roleId`, `status Active|Inactive`, `lastLogin`, `tokenVersion`, `inviteToken/inviteExpiresAt/isInvited`, `resetToken/resetTokenExpiresAt`, `isDeleted/deletedAt` (soft delete), audit ids.
- **Role**: `name` (unique), `description`, `isSystem` (system roles can't be edited or deleted).
- **Permission**: one document per `(roleId, module)` (unique); `actions` object of booleans. `module` is validated against `MODULES`.
- **AuditLog**: see [00](00-architecture.md#audit-logger-middlewareauditloggerjs); read-only.

## Authentication flow (`/auth`)
| Route | Notes |
|---|---|
| `POST /auth/login` | rate-limited (`authLimiter`); email lower-cased; refuses Inactive, deleted, or un-activated accounts; sets httpOnly cookie `token` and returns `X-CSRF-Token`; audit-logged |
| `POST /auth/logout` | clears the cookie |
| `GET /auth/me` | current user (+ fresh `X-CSRF-Token`) — frontend bootstraps from this |
| `PATCH /auth/change-password` | needs current password; bumps `tokenVersion` (revokes all other sessions), returns a fresh token, emails a notice |
| `POST /auth/forgot-password` | always succeeds silently; 1-hour reset token emailed to `FRONTEND_URL/reset-password?token=` |
| `POST /auth/reset-password` | token + new password; bumps `tokenVersion` |
Password policy (validators): ≥ 8 chars, at least one uppercase and one number. Token inputs are type-checked as strings (NoSQL-injection guard).

## Users (`/users`, perm `users`)
`GET /`, `GET /:id` (secrets stripped), `POST /` (create with password), `POST /invite` (no password; 24 h invite token emailed to `FRONTEND_URL/accept-invite?token=`), `POST /:id/resend-invite`, `PUT /:id`, `DELETE /:id` (soft delete; cannot delete yourself), **`POST /users/accept-invite`** (public, CSRF-exempt). Email must be unique. Every change invalidates the `user:<id>` cache so role/status changes apply within seconds.

## Roles (`/roles`, perm `roles`)
`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`. System roles → 400 on edit/delete. Delete refused while non-deleted users hold the role.

## Permissions (`/permissions/:roleId`)
- `GET` — returns one row per entry of `MODULES` (synthesised all-false rows for missing ones). Allowed for **your own role** with no extra permission (avoids the "can't load my own menu" deadlock); other roles need `roles:read`.
- `PUT` — `rbac('roles')` (update) and `notOwnRole`: only SuperAdmin may edit the role they belong to. Rejects unknown modules (`400 INVALID_MODULE`) and keeps only known actions as booleans, then writes via `bulkWrite` upserts (audit F-09, validation fixed 2026-10-25; a `roles:update` holder can still grant any permission to another role — deliberate, unchanged) and calls `cache.delByPrefix('perm:<roleId>:')`.

### Modules (`config/constants.js#MODULES`)
`users, roles, vessels, agents, customers, locations, containerTypes, expenseTypes, services, routes, rounds, voyages, bookings, expenses, invoices, tracking, reports, export, dashboard, auditLogs, partners, ledger`. (Agent accounts reuse `agents`; round accounting reuses `rounds`/`partners`/`reports`.)

### Actions (`permission.model.js`)
| Action | Meaning / where used |
|---|---|
| `create read update delete` | derived from HTTP method by `rbac()` |
| `view`, `hidden` | UI visibility; `hidden:true` makes `rbac` refuse the whole module |
| `import` / `export` | bookings import; per-module export (`/export`) |
| `override` | **only `voyages:override` is consulted** (skip voyage status transitions). On other modules the toggle is a no-op |
| `issue`, `cancel`, `record` | invoices: issue invoice/notes, cancel, record/void settlements |
| `approve` | expenses: convert-fda, post, reverse |
| `offset` | agents: netting, pay agent, advances, statements, handling confirm |
| `commission` | agents: cancel commission |
| `close`, `closeOverride`, `reopen`, `carryForward`, `useReserve` | rounds: ready/close, close with open PDAs, reopen, carry profit forward, use JV reserve |
| `manage` | partners / ledger administration (partner CRUD, vessel shares, exchange rates, partner settlement, transfers) |

### How a request is authorised
`auth` (JWT, user cache, tokenVersion) → `rbac(module, action?)`: SuperAdmin (`roleId.isSystem`) passes; else cached `Permission{roleId,module}`; missing → 403 "No permissions configured"; `hidden` → 403; action false → 403 "Permission denied: cannot <action> <module>". Some routes add an extra check inside the handler (booking import for finalLoading/discharge needs `update` + `delete`; export needs `export` per module).

## Seeded roles (`npm run seed`)
| Role | Grants (summary) |
|---|---|
| **SuperAdmin** (`isSystem`) | everything; also bypasses all checks |
| Operations Manager | CRUD services, rounds, voyages, tracking; bookings CRUD + import/export; CRUD customers; read vessels, agents, locations, container types, routes, expenses, invoices, reports(+export) |
| Finance Officer | expenses CRUD + approve; invoices CRUD + issue/cancel/record; read agents, customers, vessels, rounds, voyages, bookings; reports and export read+export |
| Tracking Officer | tracking CRUD, voyages read |
| Viewer | read on every module except users, roles, ledger, partners, dashboard, auditLogs |
Demo users after seeding: `ops|finance|tracking|viewer@logistics.com` / `Demo@123456`; admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

## Audit logs (`/audit-logs`, perm `auditLogs`)
`GET /` (filters `module, action, search` on user email / record number, `dateFrom, dateTo`, paginated, newest first) and `GET /:id`. Rows: `userId, userEmail, action CREATE|UPDATE|DELETE|LOGIN|LOGOUT, module, recordId, recordNumber, oldValues, newValues, ipAddress, userAgent, timestamp`. Read-only by design; no write route. Coverage is per-route (`audit('<module>')`), not automatic; several V2 money routes also emit `recordMoneyEvent`.

## Frontend
Auth context under `frontend/src/context`; the sidebar hides modules the role can't `read`; `PermissionMatrix.jsx` edits the matrix and `RoleList.jsx` manages roles. Mutations surface server errors through `showErrorToast()`.
