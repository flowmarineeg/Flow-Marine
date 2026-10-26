# Expense Module — Architecture & Business Analysis

**Purpose:** a complete technical and business understanding of the
current Expense module, produced before any redesign work begins. This
document contains no proposed schema, no implementation plan, and no
code — it exists to be the factual foundation the next Expense
redesign sprint is planned against.

> **STATUS (current through Sprint 046):** this analysis's findings were
> implemented by Sprint 035 (Voyage Cost/Other Voyage Cost classification
> via ExpenseCategory.costClassification) and Sprint 036 (Expense.portId,
> Round/Voyage/Port scope, inferred via deriveScope()). The Expense
> lifecycle/approval/soft-delete/audit-trail gaps this doc identifies are
> STILL real and STILL not addressed by any sprint through 046 — they were
> explicitly deferred each time (see Sprint 035/036 OUT OF SCOPE sections).
> Not touched by Sprints 042-046 at all.
> Historical reference for what's already fixed — cite, don't re-derive.

Files read to produce this analysis: `backend/src/modules/expenses/*`,
`backend/src/modules/expenseTypes/*`, `backend/src/middleware/upload.js`,
`backend/src/modules/reports/reports.service.js` (`getRoundPnL`,
`getExpenseReport`), `backend/src/modules/export/export.service.js`
(`expenses` case), `backend/src/modules/dashboard/dashboard.service.js`,
`frontend/src/modules/expenses/*`, `frontend/src/modules/expenseTypes/*`,
`frontend/src/modules/reports/ExpenseReport.jsx`,
`frontend/src/services/expenses.service.js`,
`frontend/src/services/expenseTypes.service.js`.

---

# Executive Summary

The Expense module is a simple, working, single-currency-agnostic cost
ledger with file-attachment support, correctly scoped to Round OR Voyage
(never both, never neither). It has no relationship whatsoever to the
Layer 1/Layer 2 booking architecture that has driven every other recent
sprint (032–034) — expenses are a cost concept, bookings are a revenue
concept, and the two collections never reference each other. That
independence is architecturally correct and should not be "fixed" by
analogy to the Booking work.

What the module lacks is not Layer awareness — it is **lifecycle**.
There is no status field, no approval workflow, no lock on
completed/cancelled rounds or voyages, and deletion is a genuine hard
delete that leaves no audit trail of what was removed. A `Round P&L`
report already exists and already combines expenses correctly with
dual-layer booking revenue — the gap is entirely on the expense side:
once an expense is recorded, nothing about the system's own state (round
status, voyage status, time elapsed) constrains what can still happen to
it.

A second, independent finding: the Expense Report's category filter is
a hard-coded, 3-value constant that has been structurally superseded by
a dynamic, user-extensible `ExpenseCategory` collection — any category a
user creates today through the normal UI flow is invisible to that
report's filter.

---

# Current Expense Architecture

```
Backend
  backend/src/modules/expenses/
    expense.model.js        — Mongoose schema
    expense.service.js      — list/getById/create/update/hardDelete/getAttachmentPath
    expense.controller.js   — thin HTTP layer
    expense.routes.js       — GET/POST/PUT/DELETE + authenticated attachment download
    expense.validation.js   — express-validator rules

  backend/src/modules/expenseTypes/
    expenseType.model.js       — { name, category (free text), isDeleted }
    expenseCategory.model.js   — standalone category collection (autocomplete source)
    expenseType.service.js     — CRUD + category sync/CRUD
    expenseType.controller.js, .routes.js, .validation.js

  backend/src/middleware/upload.js
    compressUpload — multer (disk storage, 10MB cap, jpeg/png/pdf only)
                     → Sharp compression for images, PDFs pass through

Frontend
  frontend/src/modules/expenses/ExpenseForm.jsx, ExpenseList.jsx
  frontend/src/modules/expenseTypes/ExpenseTypeForm.jsx
  frontend/src/services/expenses.service.js, expenseTypes.service.js
  frontend/src/app/(dashboard)/expenses/{page,new,[id]}.jsx
  frontend/src/app/(dashboard)/expense-types/page.jsx

Cross-module usage
  reports.service.js#getRoundPnL       — Expense joined into Round P&L (by category+currency)
  reports.service.js#getExpenseReport  — standalone Expense Report
  dashboard.service.js                 — "Total Expenses" KPI (unscoped count)
  export.service.js                    — 'expenses' Excel export case
```

**RBAC:** `expenses` and `expenseTypes` are two separate permission
modules (both present in `MODULES[]`, `backend/src/config/constants.js`
lines 55/61) — a role can be granted access to one without the other.

---

# Current Business Purpose

Record operational costs incurred against a specific Round or a specific
Voyage — port dues, agency fees, fuel, canal transit, and any other
category the business defines — with an optional receipt/invoice
attachment, so that Round P&L and the standalone Expense Report can show
what was spent, broken down by category and currency. It is a cost
ledger, not a budgeting, approval, or accounts-payable system.

---

# Current Data Model

## Schema (`expense.model.js`)
```js
roundId:                ObjectId ref Round,        default: null
voyageId:                ObjectId ref Voyage,        default: null
expenseTypeId:           ObjectId ref ExpenseType,   required
agentId:                 ObjectId ref Agent,         default: null
port:                    String (free text),         default: null
amount:                  Number, min: 0,              required
currency:                String, uppercase, max 10,   required
expenseDate:             Date,                        required
description:             String (free text),          default: null
attachmentUrl:           String,                      default: null
attachmentOriginalName:  String,                       default: null
createdBy / updatedBy:   ObjectId ref User,            default: null
timestamps:              createdAt / updatedAt (automatic)
```
**No `status` field. No `isDeleted`/`deletedAt` field** (unlike every
other core model in the system — Booking, ManualBooking, Invoice, Agent,
Vessel all have soft-delete; Expense does not).

## Required fields
`expenseTypeId`, `amount`, `currency`, `expenseDate`, and **exactly one**
of `roundId`/`voyageId` (enforced in `expense.service.js#create`/
`#update`, not at the schema level — the schema itself allows both or
neither to be null).

## Optional fields
`agentId`, `port` (free text), `description`, `attachmentUrl` (+
originalName, set only when a file is uploaded).

## Relationships
See dedicated **Relationships** section below.

## Validation rules (`expense.validation.js`)
- `expenseTypeId`: required, must be a valid Mongo ObjectId.
- `amount`: required, float ≥ 0 (no negative amounts permitted — see Gap
  Analysis).
- `currency`: required, non-empty, max 10 chars — no enum, no ISO-4217
  check, any string accepted (later uppercased in the service layer).
- `expenseDate`: required, ISO 8601 — **no bound relative to "today," no
  bound relative to the linked Round/Voyage's own dates** (see Business
  Scenarios).
- `agentId`/`roundId`/`voyageId`: optional at the validator level; the
  Round-XOR-Voyage requirement is enforced only inside
  `expense.service.js`, not by `express-validator`.

## Status / lifecycle
**None exists.** An expense is created and is immediately, permanently
in its final state. There is no Draft/Pending/Approved/Rejected
distinction, no workflow, no state machine of any kind — contrast with
Booking (`Pending → Confirmed → Final Loading → Cancelled`) or Invoice
(`Draft → Issued → Partially Paid/Paid/Overdue → Cancelled`).

## API endpoints
```
GET    /expenses                    list (paginated, filterable)
GET    /expenses/:id                single expense
GET    /expenses/:id/attachment     authenticated file stream (route placed
                                     BEFORE /:id to avoid shadowing, same
                                     Sprint020 convention used everywhere
                                     else in the codebase)
POST   /expenses                    create (multipart/form-data, compressUpload)
PUT    /expenses/:id                update (multipart/form-data, compressUpload)
DELETE /expenses/:id                HARD delete — see Architecture Risks

GET    /expense-types                       list
GET    /expense-types/:id                   single
GET    /expense-types/categories            distinct category list
POST   /expense-types/categories            create a new category
DELETE /expense-types/categories/:id        delete a category (blocked if in use)
POST   /expense-types                       create
PUT    /expense-types/:id                   update
DELETE /expense-types/:id                   soft delete (blocked if in use — see below)
```

## Backend workflow
`create`/`update` both: validate the Round-XOR-Voyage rule in JS (not the
schema), normalize `currency` to uppercase, coerce `amount` to `Number`,
and — only on `create`/when a new file is uploaded on `update` — attach
`attachmentUrl`/`attachmentOriginalName` from whatever `compressUpload`
placed on disk. `hardDelete` deletes the physical file (best-effort,
`fs.unlinkSync` wrapped in try/catch) and then permanently removes the
Mongo document via `findByIdAndDelete`.

## Frontend workflow
`ExpenseForm.jsx`: a "Link To" Round/Voyage toggle (radio-button-style,
mutually exclusive — enforced client-side before the request is even
built, mirroring the backend's own XOR rule), expense details
(Type/Agent/Amount/Currency/Date/Port/Description), and a file input
capped at the same 10MB/jpeg-png-pdf rule the backend enforces. The date
input has `max={today}` — the only temporal constraint anywhere in the
module, and it is **client-side only** (not re-validated by the backend
— `expense.validation.js` only checks `isISO8601()`, so a future-dated
expense can still be created via a direct API call).

## Existing business rules
1. An expense must link to exactly one of Round or Voyage — never both,
   never neither (`expense.service.js` lines 86-90/120-123).
2. An `ExpenseType` cannot be soft-deleted while any `Expense` document
   references it (`expenseType.service.js#softDelete`, lines 104-116).
3. An `ExpenseCategory` cannot be deleted while any non-deleted
   `ExpenseType` uses that category name
   (`expenseType.service.js#deleteCategory`, lines 58-67).
4. Creating or updating an `ExpenseType` with a category string that
   doesn't yet exist in the `ExpenseCategory` collection silently
   creates it there too (`syncCategory`, case-insensitive upsert) — a
   category is never explicitly "chosen from a closed list," it is
   free-formed once and then reusable.
5. Currency is never converted or normalized against a base currency —
   every report/dashboard figure that touches expense amounts groups and
   totals **per distinct currency string**, never combining them.

## Current architecture assumptions
- Expenses are always attributable to a single Round or a single Voyage
  — the model has no concept of a company-wide, service-wide, or
  multi-voyage expense.
- An expense, once created, never needs further oversight — no
  reviewer, no second sign-off, no state transition.
- The Round/Voyage an expense is linked to is presumed to still be
  "open" in some informal sense — nothing in the code checks or cares
  whether that Round/Voyage is Planned, Active, Completed, or Cancelled.
- Category is a soft, string-matched concept (case-insensitive regex
  matching throughout), not a hard foreign-key relationship — deliberate
  flexibility, but with the trade-off noted in Gap Analysis (a category
  can never be renamed once created).

---

# Backend Analysis

Already covered in detail above (Data Model, API, Workflow). Two
additional technical points worth calling out explicitly:

- **File storage is local disk**, not object storage (`backend/src/
  uploads/expenses/`, referenced by a relative URL, served through the
  authenticated `/expenses/:id/attachment` route — same Sprint020
  pattern used for other attachments in the system). No CDN, no
  redundancy, no signed-URL expiry concept — consistent with this being
  a small-to-mid-scale ERP, not a flag in itself, but worth naming as an
  architecture characteristic if the redesign considers file-heavy
  scenarios (e.g. multiple attachments per expense).
- **No pagination cap enforcement beyond the shared `DEFAULT_LIMIT`
  constant** — same pattern as every other list endpoint in the system,
  nothing unusual here.

---

# Frontend Analysis

`ExpenseList.jsx`: a flat, paginated table (Date/Type/Category/Round-or-
Voyage/Agent/Amount/Port/File/Actions), filterable by Type/Currency
(free-text input, not a dropdown — see Gap Analysis)/Date range, with an
`ExportButton` wired to the generic Excel export. No status column
(there is no status to show). Delete is a hard, unconfirmed-consequence
action beyond the generic `ConfirmDialog` — the dialog text itself does
warn "This cannot be undone," which is accurate, but nothing in the UI
distinguishes "this will be soft-deleted" (recoverable elsewhere in the
system) from "this will be permanently, irrecoverably destroyed with no
audit trail" (true here — see Architecture Risks).

`ExpenseForm.jsx`: single form for create and edit, no read-only/locked
state ever — an expense linked to a Round that finished eight months ago
is exactly as editable as one created five minutes ago on an Active
round. `ExpenseTypeForm.jsx` is the category-management UI described
above (chips, inline "add category," no rename).

---

# Relationships

| Related to | Type | Explanation |
|---|---|---|
| **Round** | Required (one of Round/Voyage) | Direct `roundId` ref, XOR with `voyageId`. |
| **Voyage** | Required (one of Round/Voyage) | Direct `voyageId` ref, XOR with `roundId`. |
| **Vessel** | **Derived** | No `vesselId` field on `Expense` at all. Only reachable by populating `Round.vesselId` (when linked via Round) — completely unreachable in one hop when an expense is linked via `voyageId` instead (would need Voyage → Round → Vessel, two extra hops). |
| **Agent** | Optional | Direct `agentId` ref, nullable — used for agency-fee-style expenses; no business rule ties it to anything else (e.g. no check that the agent is actually associated with the linked round/voyage). |
| **Expense Type** | Required | Direct `expenseTypeId` ref — the only hard-required relationship besides Round-XOR-Voyage. |
| **Currency** | **Not a relationship — free text** | No `Currency` model exists anywhere in the system; `currency` is a plain uppercased string with no ISO-4217 validation, no exchange-rate concept, no base-currency conversion. Every aggregation groups by the literal string. |
| **Service** | **Derived, and inconsistently reachable** | No `serviceId` on `Expense`. Reachable via `Round.serviceId` when linked via Round (one hop); via `Voyage.roundId.serviceId` when linked via Voyage (two hops). The "distance" to Service depends on which of the two XOR link types was chosen for a given expense — an architectural asymmetry. |
| **Port** | **Legacy / informal — free text, not a ref** | `expense.model.js`'s `port` field is a plain trimmed string. Every other place in the system that represents a port (`Booking.polId`/`podId`, `Voyage.polId`/`podId`) uses an `ObjectId` ref to the `Port`/Location model. Expense is the one place in the system where "port" is typed free text — no autocomplete, no canonical spelling, no way to reliably group/report "all expenses at Jebel Ali" if it was ever typed three different ways. |

---

# Workflow Analysis

## Complete expense lifecycle, as it exists today
```
Create  → (immediately final — no draft/pending state)
  ↓
Edit    → available indefinitely, no lock, no time bound, no round/voyage
           status check of any kind
  ↓
Delete  → HARD delete (permanent), available indefinitely, same lack of
           any guard
```
There is no Approval step anywhere in this lifecycle — it does not exist
in the schema, the service layer, the routes, or the UI. "Approval (if
any)" from the analysis brief: **none.**

## Relationship with Voyages / Rounds
Purely referential — creating, editing, or deleting an Expense never
triggers any recalculation, cache invalidation, or side effect on the
linked Round or Voyage document itself (unlike Booking mutations, which
call `invalidateRoundCache()` for the capacity engine). This is
appropriate given Expense has no capacity/TEU relevance — noted for
completeness, not as a gap.

## Relationship with Reports
- **Round P&L** (`getRoundPnL`) — the most complete integration.
  Expenses for a round are fetched via `{ $or: [{ roundId }, { voyageId:
  {$in: voyageIds} }] }` (i.e. an expense linked to ANY voyage inside the
  round is pulled in, in addition to expenses linked to the round
  directly) — this is the one place in the codebase that correctly
  reconciles the Round-XOR-Voyage split back into "everything that
  belongs to this round." Grouped by category + currency, joined to
  `ExpenseType` for the category label.
- **Expense Report** (`getExpenseReport`) — a standalone, filterable
  ledger + category/currency summary. See Gap Analysis for its
  category-filter mismatch with the dynamic `ExpenseCategory` collection.

## Relationship with Dashboards
`dashboard.service.js`'s only expense metric is `Expense.
countDocuments({})` — a single, **completely unscoped** count (no date
range, no round/voyage filter, no currency breakdown) shown as "Total
Expenses." It answers "how many expense records exist in the system,
ever," not any question about spend amount, recency, or currency — a
narrower, less useful metric than everything else this KPI row sits next
to.

## Relationship with Exports
`export.service.js`'s `expenses` case: a direct field-for-field mirror
of the Expense model plus populated labels (expense type name/category,
round/voyage number, agent name) — accurately reflects the current
schema, no dead fields, no legacy mismatch (unlike the Bookings export
analyzed in the prior Reports audit). This module's export is
correctly modernized relative to its own (simple) data model.

---

# Business Scenarios

## Currently supported
- Round expenses (linked via `roundId`).
- Voyage expenses (linked via `voyageId`).
- Port expenses (via `ExpenseType.category = 'Port Expense'` convention
  + free-text `port` field — a naming/categorization convention, not an
  enforced type).
- Canal expenses, fuel expenses, agency expenses — all supported
  generically through user-defined `ExpenseType`s; nothing in the schema
  is specific to any of these, they are just category/type labels a user
  chooses. Agency expenses can additionally carry an `agentId`.
- Multi-currency recording (as separate, unconverted totals per
  currency).
- Attaching a receipt/invoice image or PDF to any expense.
- Recording an expense against a Round that is still `Planned` (not yet
  `Active`) — nothing blocks this; **"expenses entered before operations
  begin" is technically supported**, though likely by accident of
  absent validation rather than deliberate design (no comment or rule
  anywhere states this is intentional).
- Recording an expense against a Round/Voyage that is already
  `Completed`/`Cancelled` — likewise unblocked. **"Expenses entered
  after completion" is also technically supported**, for the same
  reason: there is no status check at all, in either direction.

## Currently NOT supported
- **Multi-voyage expenses** — an expense that legitimately spans more
  than one voyage within a round (e.g. a single canal transit invoice
  covering two consecutive legs) cannot be split or shared; it must be
  force-fit onto exactly one `voyageId`, or moved up to the `roundId`
  level (losing the specific-voyage detail), or manually duplicated into
  two records (losing the "this was really one invoice" fact and risking
  double-counting in Round P&L, which sums by category regardless of
  whether two rows represent one real payment).
- **Shared operational expenses at the Service level** (e.g. a
  retainer or fixed monthly agency fee that isn't tied to any one round)
  — there is no `serviceId` field and no third linkage option; the
  Round-XOR-Voyage requirement is absolute.
- **Administrative / company-wide expenses** with no operational link at
  all (e.g. head-office overhead) — impossible today; every expense
  *must* have a Round or a Voyage.
- **Operational adjustments — credits, refunds, or reversals** — `amount`
  is schema-constrained to `min: 0`; there is no way to record a negative
  adjustment. A refund would have to be represented as a brand-new,
  separate expense with no link back to the original entry it corrects
  (no `correctionOf`/`reversalOf` field or similar).
- **Any approval-gated expense** — since no approval workflow exists at
  all, "an expense pending manager sign-off before it counts toward
  P&L" is not a representable state.
- **A locked/finalized expense** — once a Round or Voyage is
  Completed, there is no way to prevent further expense edits/deletions
  against it (contrast with Booking, where `Final Loading`/`Cancelled`
  locks all further edits).

## Additional scenarios implied by the current architecture (not explicitly
requested, surfaced by reading the code)
- **Silent double income-vs-cost mismatch risk**: because Round P&L
  pulls in expenses from every voyage in a round via `$or`, and an
  expense can independently also be linked directly to the round, there
  is no validation preventing a user from creating what is effectively
  a duplicate record at both levels for the same real-world cost — the
  system does not detect or warn about this.
- **Currency-tag drift**: since `currency` is free text, "USD" and "usd"
  (both are the exact same value after the service layer's
  `.toUpperCase()`) collapse correctly, but "US$" or "$" would not — an
  unenforced, purely conventional format.

---

# Current Limitations

1. **No status/lifecycle** — every expense is permanently "final" the
   instant it's created; see Workflow Analysis.
2. **No approval workflow** — no reviewer role, no sign-off, no
   pending/approved/rejected state.
3. **No temporal or round/voyage-state guard** — expenses can be
   created, edited, or deleted against a Round/Voyage in any status, at
   any time, including long after operational completion.
4. **Hard delete with no audit trail** — see Architecture Risks below;
   this is the single most consequential finding in this analysis.
5. **No multi-voyage / service-level / administrative expense support**
   — the Round-XOR-Voyage rule is absolute, with no third option.
6. **No negative amounts** — credits/refunds/reversals cannot be
   represented natively.
7. **`port` is free text**, inconsistent with the Port/Location model
   used by every other module (Booking, Voyage).
8. **Category is a free-string, one-way-created concept** — no rename
   capability once a category exists (only create-new or delete-if-unused).
9. **The Expense Report's category filter is a hard-coded, stale
   3-value constant**, structurally disconnected from the dynamic
   `ExpenseCategory` collection the rest of the module uses — see next
   section for the concrete mechanism.
10. **No currency conversion** — every total is per-currency, never
    combined; acceptable as a deliberate design choice, but worth
    confirming it remains the intended behavior going forward as expense
    volume/currency diversity grows.
11. **Dashboard's "Total Expenses" is a meaningless unscoped count** — no
    date range, no amount, no currency; the least informative metric on
    the entire Dashboard.

---

# Architecture Risks

## Risk 1 — Hard delete with zero audit trail (highest severity)
`expense.service.js#hardDelete` calls `Expense.findByIdAndDelete(id)`
directly — the document is gone from MongoDB permanently, with no
`isDeleted` flag, no soft-delete recovery path, and (confirmed by
reading `expense.controller.js#remove`) **the controller never sets
`req.auditOldDoc` before calling the delete**, unlike `update`, which
does. The shared `auditLogger` middleware
(`backend/src/middleware/auditLogger.js`) logs `oldValues:
req.auditOldDoc ? strip(req.auditOldDoc) : null` and `newValues:
recordData ? strip(recordData) : null` — since `remove()`'s response
body is `success(res, null, 'Expense deleted')`, `recordData` is also
`null`. **The resulting AuditLog entry for a deleted expense captures
neither what was deleted nor any of its field values** — only that a
DELETE action happened, on the `expenses` module, at a given timestamp,
by a given user, with no `recordNumber` (Expense has no human-readable
number field at all, unlike Booking/Invoice/Round). This is a real gap
for any organization that needs to answer "what happened to the $4,200
Suez Canal expense that used to be on this round" after the fact — today,
the honest answer is "it's gone, and we don't know what it was."

## Risk 2 — No lock on completed operations
Every other financial-adjacent entity in the system enforces some kind
of terminal-state lock (Booking's Final Loading/Cancelled edit-lock,
Invoice's paid-amount-based lock). Expense has none. A Round P&L pulled
today for a round that "finished" a year ago can still change tomorrow
if someone edits or deletes one of its expenses — with no soft-delete
trail if it's a delete (Risk 1) and no state to indicate the P&L was
ever different.

## Risk 3 — Two disagreeing sources of truth for "category"
The `ExpenseReport.jsx` category filter dropdown is populated from the
hard-coded `EXPENSE_CATEGORIES` constant (`['Port Expense', 'Operating
Expense', 'Other']`, present in both `backend/src/config/constants.js`
and `frontend/src/utils/constants.js`), while `ExpenseTypeForm.jsx`'s
category picker (and therefore every category actually usable when
creating an `ExpenseType`, and therefore every `Expense`) is populated
from the dynamic `ExpenseCategory` collection via `GET /expense-types/
categories`. **A category created through the normal, supported UI flow
(the "Add type" chip flow in `ExpenseTypeForm.jsx`) can never be
selected in the Expense Report's category filter**, because that
filter's option list was never wired to the same dynamic source. This
is not a hypothetical edge case — it is the default outcome the moment
any user adds a category beyond the original three.

## Risk 4 — Free-text `port` and `currency` fields invite silent
data fragmentation
Neither field has any validation beyond "is a string." Two records
intended to represent the same real-world port or currency can diverge
in spelling/casing in ways later aggregation (grouped by exact string)
will silently treat as different buckets — currency is at least
normalized to uppercase server-side; `port` has no normalization at all.

---

# Missing Capabilities

(Restated, non-duplicative summary of the above, for quick reference.)

- Expense status / lifecycle / approval workflow.
- Round/Voyage-state-aware edit and delete locks.
- Soft delete + real audit trail for deletions.
- Multi-voyage, service-level, and administrative (no-round-no-voyage)
  expense scopes.
- Negative amounts / correction-and-reversal linkage.
- A canonical Port reference instead of free text.
- A single, dynamic source of truth for categories, shared by every
  consumer (form, filter, report).
- A meaningful, scoped Dashboard expense metric.

---

# Business Questions

(Open questions this analysis surfaces but does not answer — for the
business owner to resolve before the next redesign is scoped.)

1. Should expenses require any approval before they count toward Round
   P&L, or is "anyone with `expenses:create` permission enters a final
   number" the intended, permanent design?
2. Should a completed/cancelled Round or Voyage lock its expenses the
   same way Booking locks itself at Final Loading? If yes, what happens
   to an already-locked round that genuinely needs a late correction
   (e.g. an invoice that arrives three weeks after voyage completion) —
   is there meant to be an exception path, or should that be modeled as
   a new administrative/correction expense type instead?
3. Is deletion ever meant to be a real, audited, recoverable action (soft
   delete), or is "permanently gone, no trace" an intentional design
   choice for this module specifically?
4. Should an expense ever be allowed to span multiple voyages within one
   round natively, or is "link it to the round instead" considered
   sufficient?
5. Is there a real business need for administrative/company-level
   expenses with no round or voyage at all, or is that explicitly out of
   this module's scope (i.e., a different, future module's job)?
6. Should `port` become a real reference to the existing Port/Location
   model, matching Booking and Voyage, or is free text intentional here
   (e.g. because expense ports sometimes aren't "real" system ports —
   canal authorities, anchorages, etc.)?
7. Is currency conversion / a base-currency rollup ever going to be
   needed, or is "always report per-currency, never combined" the
   permanent intended behavior?
8. Should categories be renameable, and if so, does that imply a real
   foreign-key relationship between `ExpenseType.category` and
   `ExpenseCategory` (today it's string-matched, not ref-based)?

---

# Technical Recommendations

(Principles to weigh in the next redesign conversation — not an
implementation plan, not a schema.)

- Treat "lifecycle" (status, locking, audit trail) as the primary gap to
  close, not Layer 1/2 awareness — Expense has no relationship to the
  booking-layer question at all, and should not gain one just because
  recent sprints have been about that axis.
- Whatever soft-delete/audit design is chosen, it should follow the same
  pattern already proven elsewhere in this codebase (`isDeleted`/
  `deletedAt` + `req.auditOldDoc` set before the delete call) rather than
  inventing a new pattern — Expense is currently the one core model that
  doesn't follow it.
- The category source-of-truth conflict (Risk 3) is a small, isolated,
  low-ambiguity fix relative to everything else in this document, and is
  worth resolving on its own regardless of how the larger
  lifecycle/redesign questions are answered.
- Any new expense-scope option (multi-voyage, service-level,
  administrative) should be designed as an *addition* to the existing
  Round-XOR-Voyage rule, not a replacement of it, to avoid a breaking
  migration of the (presumably large) volume of existing expense
  records.

---

This document is for architecture review only. No code was written or
modified, no schema was proposed, and no sprint was created — all of
that is explicitly deferred to a separate planning conversation.
