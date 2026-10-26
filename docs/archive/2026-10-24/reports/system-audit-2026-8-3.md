# System Audit — 2026-08-03

**FIX STATUS (updated post-audit):** §1.1 (critical), §2.1, §2.2 (high), and all of §3.1-3.6
(medium) below have been FIXED, verified (empirically where feasible — actual attack payloads
fired through the real middleware/validators, not just reasoned about), and are documented in
CLAUDE.md's "Post-Audit Fixes" note. §4/§5 (low) are not yet addressed. Each fixed finding below
keeps its original text as the historical record of what was found; this line is the only
addition.


**Scope:** Full codebase review (backend + frontend), focused on bugs/conflicts introduced or
exposed by **Sprint 047** (Bulk Select & Delete + system-wide hard-delete conversion + Invoice
Detail/PDF redesign — the most recent shipped work, diffed against `main`), plus a basics
security pass and a performance pass across the wider codebase.

**Method:** 7 independent finder passes (line-by-line diff scan, removed-behavior audit,
cross-file caller/callee trace, full-codebase security audit, full-codebase performance audit,
reuse/simplification/efficiency pass, altitude/CLAUDE.md-conventions pass) → dedup → each
surviving candidate independently re-verified against the live code. Findings below are ranked
most-severe first. Every item marked CONFIRMED was directly re-read and quoted against the
current file content; nothing here is inferred from the sprint's own prose alone.

**Headline:** Sprint 047's hard-delete conversion (179 query-filter removals across ~30 files)
was mechanically clean — no leftover `isDeleted`/`deletedAt` references, no duplicate indexes.
The real risk in this sprint is concentrated in three places: (1) the **new** cascade behavior
in `Round.hardDelete` (deletes Voyage rows without checking all referencing collections), (2)
an RBAC gap in the Sprint 045 discharge-import branch that this sprint's changes made newly
adjacent/relevant, and (3) a pre-existing, previously-unflagged **critical** NoSQL-injection
hole in password reset that has nothing to do with Sprint 047 but was surfaced by this audit's
security pass.

---

## 1. CRITICAL

### 1.1 NoSQL injection in password reset → account takeover
**Files:** `backend/src/modules/auth/auth.validation.js` (~line 46), `auth.controller.js`
(~lines 83-84), `auth.service.js` (~line 108)

`validateResetPassword` only checks `body('token').notEmpty()` — it never enforces the value is
a string (`.isString()`/`.isLength()`). `auth.controller.js` destructures `req.body.token`
unchanged and passes it straight to `authService.resetPassword(token, newPassword)`, which runs:

```js
User.findOne({ resetToken: token, resetTokenExpiresAt: { $gt: new Date() }, isDeleted: false })
```

Because `token` is never coerced to a string, a JSON body of `{"token": {"$ne": null}, "newPassword": "..."}`
turns `resetToken` into a live Mongo operator (`{ $ne: null }`), matching **any** user who
currently has a non-expired reset token set — including one the attacker themselves just
triggered for a victim's email via the public, unauthenticated `POST /auth/forgot-password`
endpoint. Net effect: an attacker can set a target user's password without ever seeing the
emailed token, by requesting a reset for the victim's email and then calling reset-password with
`token: {"$ne": null}`.

**Fix direction:** add `.isString()` (or a strict length/format check) to the `token` validator
in `auth.validation.js`; this class of bug is common enough that every `body()`/`param()` used
inside a Mongo equality query anywhere in `auth.validation.js`/`user.validation.js` should be
audited for the same missing type constraint.

---

## 2. HIGH

### 2.1 `Round.hardDelete`'s new Voyage cascade orphans Layer-1 bookings and Expenses
**File:** `backend/src/modules/rounds/round.service.js`, `hardDelete()` (~lines 248-267)

Sprint 047 added `Voyage.deleteMany({_id:{$in: round.voyageIds}})` to Round's hard-delete path
(previously soft-delete never touched Voyage rows at all). The guard immediately before that
cascade only checks:

```js
const hasBookings = await Booking.exists({ voyageId: { $in: voyageIds } });
```

`ManualBooking` (Layer 1 — the commercial reservation layer) and `Expense` (Round/Voyage/Port
scoped costs) are **never queried** anywhere in this function, despite an inline code comment
claiming "Invoice/Expense etc. still just block the whole delete if present." An admin can
therefore hard-delete a Round whose voyages still carry live ManualBooking reservations or
Expense records — those documents are left with a `voyageId` pointing at nothing, permanently
orphaned, with no error and no warning. This is materially worse than the pre-Sprint-047
behavior, where Round soft-delete never removed the Voyage rows those documents pointed to.

**Fix direction:** extend the pre-cascade guard to also check `ManualBooking.exists({voyageId:
{$in: voyageIds}})` and `Expense.exists({voyageId:{$in: voyageIds}})`, blocking the delete (same
pattern already used for Booking) if either returns true.

### 2.2 Discharge-import RBAC gap — wrong permission gates a cross-agent bulk mutation
**Files:** `backend/src/modules/bookings/booking.routes.js` (~lines 32-47),
`bookingImport.service.js#saveDischargeImport` (~lines 657-665)

The import-save route requires `update`+`delete` on `bookings` **only** when
`req.body.importType === 'finalLoading'`; every other `importType`, including the Sprint 045
`'discharge'` type, falls through to the base `rbac('bookings','import')` check alone. But
`saveDischargeImport()` runs:

```js
Booking.updateMany(
  { voyageId, agentId, status: 'Final Loading', _id: { $nin: matchedIds } },
  { $set: { dischargeStatus: 'Remaining', ... } }
)
```

— a bulk write that changes the operational state of every one of that agent's Final Loading
bookings on the voyage that weren't in the uploaded manifest, gated by nothing more than
`import` permission. A role granted only `bookings:import` (a reasonable, narrower grant than
`update`/`delete`) can silently flip other bookings' discharge status file-wide. This is the
same class of write the `finalLoading` branch correctly treats as requiring elevated permission
two lines above it in the same route.

**Fix direction:** require the same `update` (and arguably `delete`, since it's a status
overwrite of records not in the request) check for `importType==='discharge'` as already applied
to `'finalLoading'`.

---

## 3. MEDIUM

### 3.1 File upload accepts spoofed Content-Type — no magic-byte validation
**File:** `backend/src/middleware/upload.js` (~lines 20-24, ~line 39)

```js
const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
if (allowed.includes(file.mimetype)) cb(null, true);
```

`file.mimetype` is the client-supplied multipart header, not inspected against the actual file
bytes anywhere in this middleware or in `expense.service.js`. A crafted request can label
arbitrary content (e.g. an HTML/SVG file capable of stored XSS if ever served inline, or any
arbitrary binary) as `application/pdf`/`image/png` and have it pass straight through to disk.
Sharp's own processing (image resize/compress) will likely reject a non-image masquerading as
`image/png`, narrowing real-world exploitability mostly to the PDF branch, which passes through
unchanged with no validation at all.

**Fix direction:** validate the first bytes of the buffer against known file signatures (magic
numbers) for the three allowed types before accepting the upload, independent of the declared
mimetype.

### 3.2 ManualBooking silently defaults to 1 TEU (no warning) when its ContainerType is hard-deleted
**File:** `backend/src/modules/bookings/manualBooking.service.js`, `computeTotals`/`fetchSizeMap`
(~lines 37-64); contrast with `backend/src/modules/capacity/capacity.service.js` (~line 148)

Before Sprint 047, a booking's `containerTypeId` reference always populated a real (possibly
soft-deleted) document. Now that `ContainerType.hardDelete` genuinely removes the row (guard
only blocks if **any** booking, including cancelled ones, still references it — so most
references are protected, but a gap remains for any reference path the guard doesn't check), a
lookup miss is newly possible. `capacity.service.js` handles a missing containerType explicitly
(`if (!b.containerTypeId) { warnings.push({code:'MISSING_CONTAINER_TYPE'}); continue; }`), but
`manualBooking.service.js#computeTotals` does:

```js
const size = sizeMap[String(row.containerTypeId)] || '';
```

then calls `resolveTEU('')`, which returns `{ teu: 1, matched: false }` with **no warning
surfaced anywhere** — a silent miscomputation of `totalTEU`/capacity contribution for that cargo
row, in contrast to the capacity engine's own explicit, visible warning for the identical
missing-reference case.

**Fix direction:** surface the same `matched:false`/missing-container-type signal from
`computeTotals` that `capacity.service.js` already emits, rather than silently defaulting to 1
TEU.

### 3.3 Payment History table no longer shows the per-booking "Applied To" breakdown, contradicting the sprint's own comment
**File:** `frontend/src/modules/invoices/InvoicePaymentPanel.jsx` (~line 141 header, contrast
with CLAUDE.md's Sprint 047 Addendum 2, which states this was "untouched")

The rendered table header is `['Date', 'Amount', 'Method', 'Reference', 'Status', '']` and each
row only renders `p.paymentDate / p.amount / p.method / p.reference / p.isVoided` — no
per-booking allocation breakdown is rendered anywhere in the current file, despite an inline
comment/CLAUDE.md claiming the "Applied To" audit detail was left unchanged by the Sprint 047
payment-panel redesign. This is a real, verified regression: the one place in the app that used
to show which specific booking(s) a payment was allocated against is now gone from the UI (the
underlying `Payment.allocations[]` data still exists server-side and is still validated — only
the display was lost).

**Fix direction:** either restore a compact per-booking allocation display in the payment
history table, or update CLAUDE.md so the documented behavior matches what actually shipped.

### 3.4 Bulk-delete selection state not reset across BookingList.jsx tabs
**File:** `frontend/src/modules/bookings/BookingList.jsx` (~lines 42, 173, 223-231)

`selected` is one shared array across the Operational / Discharged / Remaining tabs. Nothing
clears it on tab switch (`setSelected([])` only fires on delete-success, bulk-delete-success, or
search change — never on `activeTab` change). A user can check rows on the Operational tab,
switch to Discharged/Remaining, and the "Delete Selected (N)" button remains active, still
bound to the previously-selected ids — which now belong to a different, no-longer-visible
table/query. Confirming/clicking it fires `bulkDeleteMutation.mutate(selected)` against bookings
the user cannot currently see and did not intend to act on from this tab.

**Fix direction:** reset `selected` in a `useEffect` keyed on `activeTab`, matching the existing
reset-on-search-change pattern already present in the same file.

### 3.5 ReDoS — unescaped user `search` input used directly in a MongoDB regex
**Representative file:** `backend/src/modules/vessels/vessel.service.js` (~lines 11-14); the
same `{ $regex: search, $options: 'i' }` (or equivalent unescaped construction) pattern recurs
across roughly 15 list endpoints (agents, bookings, manualBookings, locations, containerTypes,
expenseTypes, services, rounds, roles, tracking, auditLogs, users).

Any authenticated user (including Viewer-role, read-only accounts) can submit a
catastrophic-backtracking pattern (e.g. `(a+)+$`) as `?search=`, tying up the Node event loop
for the single-instance deployment described in `docker-compose.yml` — a denial-of-service
available to the lowest-privileged authenticated role, not just admins.

**Fix direction:** escape regex metacharacters in every `search` query param before building a
`$regex` filter (a single shared `escapeRegex()` utility, reused everywhere this pattern
appears, would also resolve the duplication).

### 3.6 Dashboard `TopAgentsWidget`/`TopRoutesWidget` fire an unbounded query unconditionally
**Files:** `frontend/src/modules/dashboard/widgets/PerformanceWidgets.jsx` (~lines 17-20,
54-57), `backend/src/modules/reports/reports.service.js#getBookingRevenueDetails` (~line 704)

Unlike the neighboring `VoyageLeaderboardWidget` in the same file (which has `enabled: !!roundId`),
`TopAgentsWidget`/`TopRoutesWidget`'s `useQuery` calls have no `enabled` gate at all — they fire
on every SuperAdmin dashboard mount, filters or not. The backend function they call,
`getBookingRevenueDetails`, is `Booking.find(match).populate(...).lean()` with no `.limit()`
anywhere in the function — on a production-sized bookings table this is two always-run,
unbounded, in-memory-grouped aggregations on every dashboard page load.

**Fix direction:** add the same `enabled` gating the sibling widget already uses where a
meaningful filter is required, and add a reasonable cap/pagination to
`getBookingRevenueDetails` independent of the dashboard fix.

---

## 4. LOW

### 4.1 `PATCH /auth/change-password` has no rate limiting
**File:** `backend/src/modules/auth/auth.routes.js` (~lines 31-38)

`authLimiter` is wired to `/login`, `/forgot-password`, `/reset-password` only. The
`change-password` route has `authMiddleware` + validation but no limiter, so a stolen/leaked
session cookie lets an attacker brute-force `currentPassword` with unlimited attempts and no
lockout — a smaller blast radius than 1.1 (requires an already-valid session) but the same
missing-control pattern.

**Fix direction:** apply `authLimiter` (or a slightly looser variant) to `change-password` too.

### 4.2 `booking.model.js` has no index on `dischargeStatus`
**File:** `backend/src/modules/bookings/booking.model.js` (index block, ~lines 45-47)

Current indexes are `{createdAt:-1}`, `{voyageId:1,status:1}`, `{agentId:1,status:1}` — no
index touches `dischargeStatus` (added Sprint 045). `booking.service.js#list()` allows filtering
by `dischargeStatus` alone (`voyageId`/`agentId` are optional query params), so the Discharged/
Remaining Booking List tabs can trigger a full collection scan on a table with no other
selective filter applied.

**Fix direction:** add `dischargeStatus` into an existing compound index (or a new
`{dischargeStatus:1, voyageId:1}` one) sized to how the List tabs actually query.

---

## 5. Also observed (below the top-10 cut, worth a look next pass)

- **`backend/src/modules/roles/role.service.js#remove`** — hard-deleting a Role does not clean
  up its `Permission` documents (no `Permission.deleteMany({roleId})` call), leaving orphaned
  rows. Low real-world impact (nothing looks them up by a dangling roleId) but dead data.
- **`backend/src/modules/invoices/payment.service.js` (~line 81)** — the Sprint 047 payment
  waterfall calls `getBookingAllocatedTotal()` once per allocation, sequentially, inside the same
  Mongo transaction, instead of one batched aggregate — holds the transaction open longer than
  necessary on a Round-scope invoice with many line items.
- **Bulk select/delete duplication** — `BookingList.jsx` (twice — operational and manual
  tables), `VoyageList.jsx`, and `ExpenseList.jsx` all carry a byte-for-byte-similar
  selection-state + sequential-delete-loop + summary-toast implementation. A shared
  `useBulkDelete()` hook would remove real duplicated code, consistent with how
  `showErrorToast`/`BookingsSummaryCard` were already extracted elsewhere in this codebase.
- **`containerType.service.js` hard-delete guard vs. its own doc comment** — CLAUDE.md's Sprint
  047 section states the guard "only blocks on an ACTIVE booking," but the shipped query
  (`Booking.findOne({containerTypeId:id})`) has no status filter and blocks on *any* referencing
  booking, active or cancelled. Pre-existing doc/code mismatch, not introduced this sprint, but
  still worth correcting one side or the other.
- **`backend/src/config/migrations/migrate-hard-delete-cleanup.js`** — runs its 14
  `deleteMany` calls sequentially in a `for...of` loop; a `Promise.all` candidate, though this
  is a one-time manually-run script so the real-world cost is negligible.

---

## 6. What was checked and found clean

- Sprint 047's 179-site `isDeleted`/`deletedAt` removal: grepped system-wide, zero stragglers
  outside the deliberately-untouched `User` model.
- No duplicate Mongoose indexes introduced (no `schema.index()` re-declaring an inline
  `unique:true` field).
- `migrate-hard-delete-cleanup.js` correctly guarded by `require.main === module`, correct
  model/collection list (all 14 converted models, `Route` correctly excluded).
- `Booking.hardDelete` / `ManualBooking.hardDelete` both still call `invalidateRoundCache`
  correctly after the soft→hard conversion.
- `Agent.hardDelete`'s new Invoice guard and `Round.hardDelete`'s Booking-guard-before-cascade
  ordering are both correctly sequenced (aside from the missing ManualBooking/Expense checks in
  2.1 above).
- Frontend bulk-delete loops correctly separate deleted-count from failures and call
  `invalidateQueries` once at the end (not once per item).
- Payment waterfall math (`InvoicePaymentPanel.jsx`) uses plain subtraction/`Math.min`, no
  division — no floating-point drift beyond the backend's existing tolerance.
- CORS is single-origin from env (not wildcard), `.env.example` has no real secrets, `JWT_SECRET`
  length is enforced at startup, and the 60s/120s in-memory cache TTLs are invalidated
  immediately on mutation in a single-instance deployment — not a real race in practice.
- New Sprint 046/047 invoice routes (`invoices:override`, `PUT /invoices/:id/bill-to`) are
  correctly gated by `rbac('invoices')`.
- `invoicePdfGenerator.js`'s rewrite genuinely removed the old line-items table and bank-wire
  block (verified as `-` diff lines, not just orphaned/unreferenced code).

---

## 7. Recommended priority order

1. Fix the reset-password NoSQL injection (1.1) — trivial one-line validator fix, critical
   impact.
2. Add the missing ManualBooking/Expense checks to `Round.hardDelete` (2.1) before this is
   deployed anywhere with real data — currently the highest silent-data-loss risk in the diff.
3. Align the discharge-import RBAC check with the finalLoading branch (2.2).
4. Everything in §3 (Medium) — none individually severe, but 3.1/3.5 are real, low-effort
   security hardening; 3.3/3.4 are user-facing correctness regressions worth a quick patch.
5. §4/§5 as routine follow-up cleanup.
