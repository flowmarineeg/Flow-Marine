# 00 — Architecture & Cross-cutting Rules

## Stack
- **Backend** `backend/` — Express, Mongoose, port 5000, prefix `/api/v1`. Entry `src/server.js`. **MongoDB must be a replica set** (money paths use transactions).
- **Frontend** `frontend/` — Next.js 16 App Router, Tailwind, React Query v5, React Hook Form, Axios, port 3000.
- Forbidden by project policy: microservices, Redis, GraphQL, Kafka, CQRS, DDD, needless abstraction.

## Backend layout
```
src/
  server.js            app wiring, route mounting, graceful shutdown
  config/              constants.js (enums, MODULES), db.js, env.js, seed.js, seed-test-data.js, migrations/
  middleware/          auth, rbac (+hasPermission), csrf, auditLogger, upload, errorHandler
  utils/               AppError, autoNumber, cache, money, moneyAudit, dependents, escapeRegex, pickFields,
                       responseHelper, teuResolver, voyageGenerator, invoicePdfGenerator, mailer, logger
  modules/<name>/      model, service, controller, routes, validation  (some modules are service+routes only)
```
Order when adding a feature — backend: model → service → controller → routes → `server.js`. Frontend: service → hook → module component → page.

## Route map (all under `/api/v1`)
| Mount | Module | Mount | Module |
|---|---|---|---|
| `/auth` | auth | `/tracking` | tracking |
| `/users` | users | `/reports` | reports |
| `/roles`, `/permissions` | roles, permissions | `/dashboard` | dashboard |
| `/audit-logs` | auditLogs | `/capacity` | capacity |
| `/vessels` | vessels (+ partner shares) | `/partners` | partners |
| `/agents` | agents | `/ledger` | ledger |
| `/container-types` | containerTypes | `/agent-accounts` | agentAccounts |
| `/expense-types` | expenseTypes (+categories) | `/round-accounting` | partnerSettlement / round close |
| `/export` | export | `/locations` | countries, cities, ports, terminals |
| `/services` | services (+ `/:id/route`) | `/rounds`, `/voyages` | rounds, voyages |
| `/bookings` | bookings, manual, import | `/expenses` | expenses |
| `/invoices` | billing (V2 invoices) | `/health` | liveness |

Unknown paths return 404 `{success:false, message}`.

## Request pipeline
`helmet → compression → cors (credentials, exposes X-CSRF-Token) → json(10mb) → cookieParser → csrfProtection → router → [auth → rbac → auditLogger → validation → controller] → errorHandler`

### Response shape
`{ success, data, message, pagination? }`. Errors: `AppError(status, message, code)` → `{ success:false, message, code }`. Legacy `throw { status, message }` is still accepted by the error handler. Mongoose validation → 400 with `errors[]`; duplicate key (11000) → 409; bad ObjectId → 400; JWT errors → 401. Stable refusal `code`s used by the UI include `ROUND_CLOSED`, `HAS_DEPENDENTS`, `DUPLICATE_BILLING`, `INVOICE_LOCKED`, `EXPENSE_POSTED`, `CSRF_INVALID`.

### Authentication (`middleware/auth.js`)
1. Token from httpOnly cookie `token`, else `Authorization: Bearer`.
2. JWT verified (`JWT_SECRET`, default expiry 24h, payload `{id, tv}`).
3. User loaded (cache `user:<id>`, 60 s) with `roleId` populated `{name,isSystem}`; must be `isDeleted:false` and not `Inactive`.
4. `decoded.tv` must equal `user.tokenVersion` — password change/reset bumps `tokenVersion`, revoking all older sessions.

Cookie: httpOnly, `sameSite: none` in production / `strict` in dev, 24 h. No token is ever stored in localStorage.

### CSRF (`middleware/csrf.js`)
Every non-GET request that carries the auth **cookie** must send `X-CSRF-Token` = HMAC-SHA256(`JWT_SECRET:csrf`, jwt). Login/me/change-password responses return it in the `X-CSRF-Token` response header. Exempt: login, forgot-password, reset-password, accept-invite, and requests with no cookie (Bearer clients).

### RBAC (`middleware/rbac.js`)
`rbac(module, actionOverride?)` — SuperAdmin passes; otherwise looks up `Permission{roleId,module}` (cached 120 s as `perm:<roleId>:<module>`), refuses when missing, `hidden`, or action false. `hasPermission(req, module, action)` is the non-gating variant used inside controllers (only `voyages:override` uses it from a controller today). Detail in [10-users-roles-rbac.md](10-users-roles-rbac.md).

### Audit logger (`middleware/auditLogger.js`)
Per-route `audit('<module>')`. Fire-and-forget: patches `res.json` only to capture the body, writes `AuditLog` in `res.on('finish')` + `setImmediate`, only for successful (`success:true`) POST/PUT/PATCH/DELETE. Strips password/reset/invite tokens. Controllers may set `req.auditOldDoc` to record `oldValues`. `utils/moneyAudit.recordMoneyEvent` additionally logs named money events (`round.close`, …).

## Money (`utils/money.js`)
- `BASE_CURRENCY = 'USD'`. `CURRENCY_DECIMALS` table (default 2; KWD/BHD/OMR/JOD/TND 3; JPY/KRW/VND 0).
- `toMinor(amount, cur)` parses the decimal **string** (no float noise), rounds half-up; `fromMinor`, `format`, `add`, `sub`, `assertMinor` (safe integer), `allocate(total, weights)` largest-remainder.
- New money fields = integer minor units. Legacy Booking/Expense/Invoice header fields stay decimal and are converted at posting time.

## Round lock (`modules/rounds/roundLock.js`)
A Round with `closeStatus:'Closed'` rejects changes with `409 ROUND_CLOSED`. Every mutating service calls a pre-check (`assertRoundOpen`, `assertVoyageRoundOpen`, `assertDocRoundOpen`, `assertExpenseRoundOpen`, `assertInvoiceRoundOpen`, `assertBookingsRoundOpen`, `assertItemsRoundOpen`). Inside `LedgerService.post` the atomic `assertRoundOpenTx` increments `Round.lockVersion`, so a posting and a concurrent close conflict instead of racing. `closedRoundIds()` lets bulk flows (netting) skip closed rounds.

## Delete guards (`utils/dependents.js`)
`assertNoDependents(what, id, DEPENDENTS[what])` counts referencing documents and throws `409 HAS_DEPENDENTS` naming each blocker. No cascades (the single exception: deleting a Round deletes its own generated voyages after all guards pass). Tables exist for `partner, vessel, round, voyage, agent`. Add an entry whenever a new collection references one of these. Ledger-referenced records are never hard-deleted. Users are soft-deleted; every other entity hard-deletes.

## Numbering (`utils/autoNumber.js`)
Atomic counter per key (`counters` collection): `R000001` round, `BK-` booking, `MB-` manual booking, `INV-` invoice, `CN-`/`DN-` notes, `HC-` handling, `JE-` journal. Voyage number = `{serviceCode}-{roundNumber}-{seq:02d}` (e.g. `AS-ME-01-R000001-01`). `nextNumberBatch` reserves N numbers in one round trip (import).

## Cache (`utils/cache.js`)
In-process TTL cache. Keys/TTL: user 60 s, permissions 120 s, capacity per round 60 s (`capacity:round:<id>`), dashboard 90 s. Invalidate with `cache.del` / `delByPrefix`. Anything mutating bookings/voyages/rounds must call `invalidateRoundCache(roundId)`.

## Uploads (`middleware/upload.js`)
`compressUpload` (multer disk storage → `src/uploads/expenses/`): JPEG/PNG/PDF only, magic-byte check against the declared type, size limit `UPLOAD_MAX_SIZE_MB` (default 10); images re-compressed with sharp. Used by expenses. `pdfUpload(subdir)` (same magic-byte check, PDF only, `src/uploads/<subdir>/`) is used for the vessel particulars file, served through an authenticated route, never a public static path.

## Environment
Backend `.env` (validated at boot by `config/env.js`; missing → exit): `MONGODB_URI`, `JWT_SECRET` (≥32 chars); `SMTP_EMAIL` and `SMTP_APP_PASSWORD` are required only when `NODE_ENV=production` (otherwise emails fail with a clear error). Also used: `ALLOWED_ORIGIN`, `FRONTEND_URL`, `JWT_EXPIRES_IN`, `PORT`, `NODE_ENV`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (seed), `UPLOAD_MAX_SIZE_MB`, `ENABLE_CAPACITY_ENFORCEMENT` (`off`|`warn`|`strict`, default off).
Frontend `.env.local`: `NEXT_PUBLIC_API_URL`.

## Commands
```
backend/:  npm run dev | start | seed | test | test:int | migrate:seed-accounts | migrate:hard-delete-cleanup
backend/:  SEED_ALLOW_REMOTE=yes npm run seed:test-data [-- --reset]
frontend/: npm run dev | build | lint
```
`npm test` = `node --test` (unit: money, ledger, billing, agentAccounts, partnerSettlement, shares). `npm run test:int` needs `TEST_MONGODB_URI` on a local replica set, **drops** that DB and refuses Atlas.

## Frontend conventions
`@/` imports; `useSearchParams` pages wrapped in `<Suspense>`; async `params` via `use(params)`; Modal uses `createPortal`; tables get `min-w-0` + `overflow-x-auto`; Chart.js targeted registration; reports use `refetch()` with `enabled:false`; required fields get one red `*`; mutation errors via `showErrorToast()`. Pages live in `frontend/src/app/(dashboard)/<route>/page.js`, UI in `frontend/src/modules/<name>/`, API wrappers in `frontend/src/services/*.service.js`, shared hooks in `frontend/src/hooks/`.

## Data flow at a glance
```
Location(Country→City→Port→Terminal) ─┐
Service ──1:1── Route ──legs── Port   │
Vessel ─ VesselPartner ─ Partner      │
        │                              ▼
        └──────── Round (service+vessel+dates) ──generates──▶ Voyage[] (one per consecutive leg pair)
                                         │                         │
                      Expense(round/voyage/port)        Booking (L2, per container) / ManualBooking (L1)
                                         │                         │  Final Loading
                                         │                         ▼
                                         │                BookingItem (derived group) ─▶ InvoiceLine ─▶ Invoice
                                         │                                                   │ issue / settle / note
                                         └───────────── LedgerService.post ◀────────────────┘
                                                         JournalEntry + Lines (append-only)
                                                                │
                                   Agent SOA / netting / handling · Round close → PartnerSettlement → transfers / JV reserve
```
