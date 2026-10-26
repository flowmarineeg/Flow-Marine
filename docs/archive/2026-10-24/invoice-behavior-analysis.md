# Invoice & Payment Behavior Analysis

**Purpose:** explain the current Invoice and Payment behavior *exactly as
implemented* (Sprint 033 architecture, Sprint 034 UX findings), so it can
be reviewed before any further implementation work. This document does
not propose fixes, does not redesign anything, and does not contain code.
Every claim below is traced to the actual file it comes from.

> **STATUS (current through Sprint 046):** describes the Invoice/Payment
> system as it stood through Sprint 033-034 — UNCHANGED by Sprints 035-040
> (which explicitly listed invoice.model.js/payment.model.js as out of
> scope every time). Sprint 041 flags one new, related finding not covered
> here: the Payment void route is gated by the default POST→'create' RBAC
> action, not update/delete — an open decision, still not fixed. **Two real
> changes since, both additive, neither invalidating this document's core
> analysis:** Sprint 044 replaced §1's "booking-selection table" (for
> Voyage/Round invoice types) with an auto-include-everything summary card
> (`BookingsSummaryCard.jsx`) — the Booking-type single-radio flow this
> section otherwise describes is unchanged. Sprint 046 added an ADDITIVE
> `invoices:override` permission: a granted role (or SuperAdmin) can now
> bypass §"Invoice Status" derivation's `paidAmount>0`/Paid|Cancelled lock
> entirely and force `status` to any value — `recalcInvoiceStatus()` itself,
> the payment allocation model, and every other rule this document
> describes for a NON-override caller are completely unchanged. See
> claude.md's Sprint 044/046 sections for the full current behavior.

Files read to produce this document:
`backend/src/modules/invoices/invoice.model.js`,
`backend/src/modules/invoices/invoice.service.js`,
`backend/src/modules/invoices/invoice.validation.js`,
`backend/src/modules/invoices/payment.model.js`,
`backend/src/modules/invoices/payment.service.js`,
`backend/src/modules/agents/agent.service.js`,
`frontend/src/modules/invoices/InvoiceForm.jsx`,
`frontend/src/modules/invoices/InvoicePaymentPanel.jsx`,
`frontend/src/modules/agents/AgentFinancialAccount.jsx`,
and `sprints/033-sprint.txt` / `sprints/034-sprint.txt` for the
already-approved design intent behind each behavior.

---

## 1. Invoice Creation

The New Invoice form (`CreateInvoiceForm` in `InvoiceForm.jsx`) shows
exactly: Invoice Type, Agent/Round/Voyage scope, a booking-selection
table, Invoice Date, Due Date, Currency, Notes. **There is no Amount
field anywhere in this form**, and there never was one designed in — this
is intentional, not an omission.

**Why is there no Amount input?**
Because Amount (`totalAmount`) is not a fact the user knows or supplies —
it is a consequence of which bookings they select. The form's job is to
let the user pick *which* Final Loading bookings this invoice bills; the
system already knows each one's freight value.

**Is Amount calculated automatically? From where?**
Yes. In `invoice.service.js#create`:
```js
const lineItems = await Promise.all(bookings.map(b => buildLineItemSnapshot(b)));
const totalAmount = lineItems.reduce((sum, li) => sum + li.freightAmount, 0);
```
`buildLineItemSnapshot()` copies `booking.totalFreight` (the flat,
server-computed freight value already stored on the Layer 2 Booking,
per Sprint 024/025 — one booking = one container = one flat freight
amount) into the line item's `freightAmount` field at the moment the
invoice is created. `totalAmount` is the sum of those snapshot values,
for however many bookings were selected (one for a Booking-type invoice,
many for Voyage/Round-type).

**Can Amount be edited? If not, why? If yes, why no input?**
No, it cannot be edited, at creation or afterward. Two separate
enforcement points confirm this:
- `invoice.validation.js#validateCreate` has no `amount`/`totalAmount`
  field in its validator list at all — the API doesn't even accept one in
  the request body.
- `invoice.service.js#update` only ever assigns
  `invoiceDate`/`dueDate`/`currency`/`notes`/`status` onto an existing
  invoice document; `totalAmount` is never in that list, so even a
  direct API call couldn't change it post-creation.

**Business logic:** `totalAmount` must always equal the real, current sum
of the freight actually being invoiced. If it were a free-text number the
user could type independently of which bookings were selected, the
invoice could silently disagree with the bookings it claims to cover —
exactly the kind of drift Sprint 033's whole redesign existed to close
(the old, pre-Sprint-033 Invoice had a hand-typed `amount` field with no
enforced relationship to the booking's real freight; this is the fix for
that, not an oversight).

---

## 2. Invoice Status

**Why is there no Status selection at creation?**
`invoice.validation.js#validateCreate` has no `status` field, and
`invoice.service.js#create` hard-codes `status: 'Draft'` on every new
invoice — there is no code path that lets a caller choose the initial
status. This is deliberate: a brand-new invoice — regardless of type —
always starts as a draft that has not yet been formally sent to the
agent.

**What does Draft mean?**
"This invoice exists in the system but has not been issued." It is fully
editable (dates, currency, notes) and its status can move to `Issued` or
`Cancelled`. Critically, **a Draft invoice cannot receive payments** —
see §3/§5 below.

**What changes when Status becomes Issued?**
Nothing about the invoice's own numbers changes (`totalAmount` stays the
same, `paidAmount` stays 0 unless a payment was already recorded, which
is impossible pre-Issued — see below). What changes is *capability*: in
`InvoicePaymentPanel.jsx`, `const PAYABLE_STATUSES = ['Issued',
'Partially Paid', 'Overdue']` — the Record Payment form only renders
once status is one of these. Issuing is the single gate that unlocks
payment recording.

**What changes when Status becomes Cancelled?**
The invoice becomes terminal — `MANUAL_TRANSITIONS` in
`invoice.service.js` has no entry for `Cancelled`, so nothing can
transition out of it. `invoice.service.js#update`/`#softDelete` also
separately block any modification once `invoice.paidAmount > 0`, so a
Cancelled invoice that already had payments recorded before cancellation
keeps its historical numbers frozen. (Cancelling an invoice that already
has `paidAmount > 0` is itself blocked by the same guard — see
`sprints/033-sprint.txt` Edge Case 3 — so in practice an invoice can only
reach Cancelled while `paidAmount` is still 0.)

**Which statuses are manual? Which are automatic?**
```js
// invoice.service.js
const MANUAL_TRANSITIONS = {
  Draft:  ['Issued', 'Cancelled'],
  Issued: ['Cancelled'],
};
```
Manual (user-selected, via the Status dropdown in `InvoiceForm.jsx`'s
edit view): `Draft → Issued`, `Draft → Cancelled`, `Issued → Cancelled`.

Automatic (never selectable in the dropdown — `allowedNext` in
`InvoiceForm.jsx` is built directly from `MANUAL_TRANSITIONS`, which
simply has no `Partially Paid`/`Paid`/`Overdue` entries): `Partially
Paid`, `Paid`, and `Overdue` are all *derived*, computed only by
`invoice.service.js#recalcInvoiceStatus()`:
```js
if (paidAmount <= 0) {
  status = invoice.dueDate && invoice.dueDate < new Date() ? 'Overdue' : 'Issued';
} else if (paidAmount < invoice.totalAmount) {
  status = 'Partially Paid';
} else {
  status = 'Paid';
}
```
**Complete lifecycle:**
```
Draft ──(manual: Issue)──> Issued ──(automatic, on payment)──> Partially Paid ──> Paid
  │                            │
  └──(manual: Cancel)──> Cancelled <──(manual: Cancel, only while paidAmount = 0)
```
`recalcInvoiceStatus()` is called from exactly two places:
`payment.service.js#create` and `payment.service.js#voidPayment` — i.e.
status is only ever recalculated at the moment a payment is recorded or
voided. There is no scheduled/background process that re-evaluates
status on its own (see §7, Finding E, for what this implies for
`Overdue`).

---

## 3. Invoice Amounts

Immediately after creating an invoice for a booking with freight 1500:
`Total = 1500`, `Paid = 0`, `Balance = 1500`. **This is expected,
by-design behavior — not an implementation issue.**

- **Total** (`invoice.totalAmount`) — the sum of `freightAmount` across
  all selected bookings' line-item snapshots, fixed at creation time (§1).
- **Paid** (`invoice.paidAmount`) — a denormalized running total,
  recalculated by `recalcInvoiceStatus()` as `sum(Payment.amount)` across
  every non-voided `Payment` document referencing this invoice. Right
  after creation, zero `Payment` documents exist for this invoice, so
  `paidAmount` is `0` — there is no code path anywhere that creates a
  `Payment` as a side effect of creating an `Invoice` (confirmed:
  `invoice.service.js#create` never requires or touches `payment.model.js`
  in any way).
- **Balance** (`invoice.balanceAmount`) — a Mongoose virtual:
  `Math.max(0, totalAmount - paidAmount)`, computed on read, never
  stored.

**Why is Paid zero?** Because recording a payment is a separate, later
user action (§5) — invoicing (billing) and paying (settling) are
deliberately two different real-world events with their own dates,
methods, and references, and the architecture models them as two
different collections for exactly that reason.

**Why is Balance equal to Total?** Because `balanceAmount =
totalAmount − paidAmount`, and `paidAmount` is `0` at this point — this
is arithmetic, not a special case.

**Is this expected, or an implementation issue?** Expected. An invoice
that has just been created and has never had a payment recorded against
it *must* show `Paid = 0` and `Balance = Total` — anything else would
indicate a real defect.

---

## 4. Agent Details → Invoices

The Agent Details "Invoices" tab shows the same `Total = 1500`, `Paid =
0`, `Balance = 1500` for this invoice. **These are read directly from the
`Invoice` document, not separately calculated.**

`AgentFinancialAccount.jsx`'s `InvoicesTab` calls
`invoicesService.list({ agentId, limit: 50 })`, which hits the existing
`GET /invoices?agentId=` endpoint (`invoice.service.js#list`) — the exact
same query used by the main Invoices list page. It renders
`inv.totalAmount`, `inv.paidAmount`, `inv.balanceAmount` straight off
each returned document. There is no separate aggregation or
recomputation for this tab specifically — it is a filtered view of the
same `Invoice` collection.

**Should these already contain payment information?** They *do* contain
whatever payment information currently exists on the `Invoice` document
(`paidAmount`/`balanceAmount`) — but since no `Payment` has been recorded
yet at this point in the walkthrough, that information correctly shows
"nothing paid yet." Payment is recorded elsewhere entirely — on Invoice
Detail's `InvoicePaymentPanel`, never from Agent Details or from invoice
creation (§5).

**One caveat worth naming here (carried over from the Sprint 034
investigation, `sprints/034-sprint.txt` Finding 5):** if a payment *is*
later recorded while the user already has an Agent Details tab open in
the browser, that tab's cached data is not automatically invalidated —
the fix for this was designed in Sprint 034 but is not yet implemented.
So on a fresh page load, Agent Details always reflects current `Invoice`
values correctly; but a tab left open across a payment being recorded
elsewhere can show stale figures until the page is reloaded or its cache
naturally expires.

---

## 5. Payments

Agent Details → Payments shows no records at this point because **no
`Payment` document has been created yet** — this is the expected state,
not a bug, for an invoice that was only just created and possibly
Issued but never paid.

**What creates a Payment record?** Exactly one action:
`InvoicePaymentPanel.jsx`'s "Record Payment" form submitting to
`POST /invoices/:id/payments`, handled by `payment.service.js#create`.
Nothing else in the codebase calls `Payment.create(...)`.

**When should a Payment record appear? What user action creates it?**
A `Payment` appears the moment a user, on Invoice Detail, fills in an
amount against one or more of the invoice's line items and submits
"Record Payment" — and only once the invoice's status is `Issued`,
`Partially Paid`, or `Overdue` (§2). It cannot be created against a
`Draft` invoice: the Record Payment form itself doesn't render for
Draft (`canPay` check in `InvoicePaymentPanel.jsx`), and even if a
request reached the API directly, `payment.service.js#create` explicitly
rejects it —
```js
if (!PAYABLE_STATUSES.includes(invoice.status)) {
  throw { status: 400, message: `Cannot record a payment against an invoice with status "${invoice.status}"` };
}
```

**Does creating an Invoice create a Payment? If not, why?**
No, and this is intentional (§3/§4): invoicing states what is owed;
paying states what has actually been received. Conflating the two would
mean every invoice appears "paid" the instant it's created, which is not
true and not the business reality being modeled.

**Relationship between Invoice, Payment, Paid Amount, Balance, and Agent
Financial Account:**
```
Invoice.lineItems[]        — snapshot of WHAT is being billed (per booking)
Invoice.totalAmount        — sum of lineItems[].freightAmount (fixed at creation)
Payment.allocations[]      — states WHICH booking(s) a specific payment
                              covers and how much for each (explicit,
                              never a proportional estimate — Sprint 033
                              Revision 4)
Invoice.paidAmount         — sum(Payment.amount) across all non-voided
                              Payments for this invoice, recalculated by
                              recalcInvoiceStatus() after every payment
                              create/void
Invoice.balanceAmount      — virtual: totalAmount − paidAmount
Agent Financial Account    — reads Invoice + Payment as its two source
                              collections:
    Total Revenue           = sum(Booking.totalFreight), Final Loading only
    Total Invoiced          = sum(Invoice.totalAmount), non-cancelled invoices
    Total Paid              = sum(Payment.amount), non-voided, this agent
    Outstanding Balance     = Total Invoiced − Total Paid
    Remaining Balance       = Total Revenue − Total Paid
    per-booking Paid        = sum(Payment.allocations[].amount) for that
                              specific bookingId, across all non-voided
                              Payments on its invoice — an EXACT figure,
                              never split proportionally across the
                              invoice's other bookings
```

---

## 6. Complete Financial Flow — Booking Freight = 1500

| Step | Invoice Status | Total | Paid | Balance | Payment Records | Agent Financial Account |
|---|---|---|---|---|---|---|
| **Booking created**, reaches Final Loading | *(no invoice yet)* | — | — | — | none | Booking counted in Total Revenue (1500); listed under "Bookings Awaiting Invoice" |
| **Invoice created** (Booking-type, this booking selected) | `Draft` | 1500 | 0 | 1500 | none | Booking's `invoiceId` is now set — it leaves "Bookings Awaiting Invoice"; its displayed invoice status becomes `Draft`. Total Invoiced (agent KPI) already includes this 1500, because the KPI query matches `status: { $ne: 'Cancelled' }` — Draft is not excluded (see note below) |
| **Invoice issued** (manual Draft→Issued) | `Issued` | 1500 | 0 | 1500 | none | Booking now listed under "Bookings Awaiting Payment" (Issued/Partially Paid/Overdue). No change to Total Paid (still 0) |
| **Agent pays 500** | `Partially Paid` *(derived: 0 < 500 < 1500)* | 1500 | 500 | 1000 | 1 record — `{ allocations: [{ bookingId, amount: 500 }], amount: 500 }` | Payments tab now shows 1 row. Total Paid = 500. Outstanding Balance = 1500 − 500 = 1000. Remaining Balance = 1500 − 500 = 1000. Booking's own Paid/Remaining = 500 / 1000 |
| **Agent pays remaining 1000** | `Paid` *(derived: 500+1000 = 1500 = total)* | 1500 | 1500 | 0 | 2 records total (500 + 1000) | Payments tab shows 2 rows. Total Paid = 1500. Outstanding Balance = 0. Remaining Balance = 0. Booking moves into "Bookings Fully Paid"; leaves "Bookings Awaiting Payment" |

**Which values change and why, step by step:**
- Creating the invoice changes nothing about payment state — it only
  fixes `totalAmount` and locks in which booking(s) are covered.
- Issuing changes only `status` — a manual signal that the invoice is
  now live/sendable — and it is the switch that makes payment recording
  possible; no monetary field changes.
- Each payment is its own `Payment` document; `invoice.paidAmount` is
  recalculated (summed) after each one, `balanceAmount` follows
  arithmetically, and `status` is re-derived from the new `paidAmount`
  every time — never hand-set to `Partially Paid` or `Paid`.
- The Agent Financial Account never stores its own copy of these
  numbers — every figure shown there is read or aggregated fresh from
  `Invoice`/`Payment`/`Booking` at request time (subject to the frontend
  caching caveat noted in §4/§7).

**Note on "Total Invoiced" including Draft invoices:** this is exactly
what `sprints/033-sprint.txt`'s own KPI definition specifies ("Total
Invoiced | sum(Invoice.totalAmount), non-cancelled invoices" — no
carve-out for Draft), and `agent.service.js`'s actual aggregate matches
that definition exactly (`status: { $ne: 'Cancelled' }`). So a Draft
invoice — one that hasn't even been sent to the agent yet — already
counts toward "Total Invoiced." This is documented, intentional behavior
per the written architecture, not a coding mistake, though it is worth
being aware of when interpreting that KPI.

---

## 7. Testing Conclusion

**Overall: the core financial behavior (Total/Paid/Balance at each stage,
Draft never being payable, status deriving automatically from payments,
Agent Financial Account reading from the same Invoice/Payment records)
matches the approved Sprint 033 architecture exactly.** Every number
described in §3–§6 is correct and expected, not a bug.

However, testing this flow end-to-end surfaces several **already-known,
separately-documented implementation gaps** (all previously identified
during the Sprint 034 investigation, `sprints/034-sprint.txt`, still
unimplemented as of this document), plus one additional gap found while
preparing this analysis. Listed separately, as requested:

**Gap 1 — the Notes field on Record Payment has no input control.**
`InvoicePaymentPanel.jsx` declares `notes` state and sends it in the
payment payload, but no `<textarea>`/`<input>` for it exists anywhere in
the rendered form — so it is always submitted empty regardless of intent.
(`sprints/034-sprint.txt`, Finding 1.)

**Gap 2 — saving the Invoice Details form navigates the user away from
Invoice Detail, including on the Draft→Issued transition.**
`InvoiceForm.jsx`'s `EditInvoiceForm` mutation unconditionally calls
`router.push('/invoices')` in `onSuccess`, so the one action required to
unlock payment recording (Issuing) immediately bounces the user back to
the invoices list instead of leaving them on the page where the payment
form would now appear. (`sprints/034-sprint.txt`, Finding 4.)

**Gap 3 — Agent Financial Account is not invalidated after a payment is
recorded or voided.** `InvoicePaymentPanel.jsx`'s payment/void mutations
only invalidate the Invoice/Invoices-list caches, never
`agent-financial-account`/`agent-invoices`/`agent-payments` — so a
previously-loaded Agent Details tab can show stale Paid/Balance figures
until manually reloaded. (`sprints/034-sprint.txt`, Finding 5.)

**Gap 4 — no inline explanation when a Draft invoice can't yet receive
payments.** The Record Payment section simply doesn't render for Draft
invoices, with no message telling the user why or what to do about it.
(`sprints/034-sprint.txt`, Finding 3.)

**Gap 5 (newly identified in this analysis) — `Overdue` status is never
computed proactively.** `recalcInvoiceStatus()` — the only function that
can ever set `Overdue` — is called exclusively from
`payment.service.js#create` and `#voidPayment`. There is no scheduled job
or read-time check elsewhere. Consequently, an `Issued` invoice whose due
date passes with zero payments recorded against it will continue to
display as `Issued` indefinitely — it will only ever flip to `Overdue`
at the moment someone next records or voids a payment on it (at which
point the `paidAmount <= 0` branch happens to also check `dueDate`). If
no payment is ever attempted, the invoice can sit permanently `Issued`
past its due date rather than surfacing as `Overdue`.

**Not bugs — expected, by-design behavior confirmed by this
investigation:**
- No Amount input at creation; Amount is always server-derived from
  selected bookings' freight and never independently editable (§1).
- No Status selection at creation; every invoice starts `Draft` (§2).
- `Paid = 0` / `Balance = Total` immediately after creation, for any
  invoice, until a payment is actually recorded (§3).
- Agent Details showing the same numbers as the Invoice itself — they
  are the same data, read directly, not a separate calculation (§4).
- No Payment records appearing until a user explicitly records one;
  creating an Invoice never creates a Payment (§5).
- Draft invoices already counting toward the "Total Invoiced" KPI —
  matches the written Sprint 033 KPI definition exactly (§6).

This document makes no recommendation on any of the five gaps above —
that determination and any resulting design/fix work is left for the
architecture review this document was requested to support.
