# 06 — Invoices (V2 billing)

Modules `billing` (service + routes), `invoices` (model only), `agreements`. Route mount **`/invoices`** → `modules/billing/billing.routes.js`; perm module `invoices`. UI: `/invoices`, `/invoices/new` (wizard), `/invoices/[id]`.

V2 is the only invoicing. Pre-V2 invoice/payment documents may still sit in Mongo (`v2:false`) and are listed read-only as "legacy" — they cannot be issued, paid or cancelled through V2 code.

## Data model
```
Booking (L2, Final Loading) ──grouped──▶ BookingItem ──1 live line──▶ InvoiceLine ──▶ Invoice (+ lineItems snapshots)
                                                                                   └──▶ InvoiceSettlement (receipts)
                                                                                   └──▶ credit / debit notes (Invoice docKind)
```
### `BookingItem` (`billing.models.js`) — derived pricing group
`billToAgentId, voyageId, roundId, containerTypeId, freightRate, loadedQty, bookingIds[], locked, invoiceLineId`. Unique `(billToAgentId, voyageId, containerTypeId, freightRate)`. Built from **Final Loading** bookings only; group key = bill-to party (`billToPartyId` or the booking's agent) + voyage + container type + rate; `loadedQty` = number of bookings (one booking = one container). Recomputed by `bookingItem.syncForVoyages` (fire-and-forget `scheduleSync` from every booking/import mutation, and synchronously before listing/creating). **Locked items are never touched** — a later quantity change on an invoiced item is a credit/debit-note matter. Bookings still on a legacy non-cancelled V1 invoice are excluded.

### `InvoiceLine`
`invoiceId, bookingItemId, qty, priceMinor, amountMinor, currency, cancelled, snapshot{voyageLabel, roundNumber, containerType, freightRate}`. Partial unique index **`one_live_line_per_item`** `{bookingItemId}` where `cancelled:false` — the database-level guarantee that an item sits on at most one live invoice. Never remove it.

### `Invoice` (shared collection, `invoice.model.js`)
Legacy header fields (decimal `totalAmount`, `paidAmount`, `currency`, `lineItems[]` booking snapshots with `orphaned` flags, `billTo{phone,mobile,email,jobCode,taxId,address,office}`) plus V2: `v2:true`, `docKind` `Invoice|CreditNote|DebitNote`, `parentInvoiceId`, `totalMinor`, `paidMinor`, `creditedMinor`, `issuedAt/By`, `cancelledAt/By`, `cancelReason`, `reason`, `ledgerEntryId`, `fx{rate, baseTotalMinor}`.
`invoiceType` `Booking|Voyage|Round` (scope). `status` `Draft|Issued|Partially Paid|Paid|Overdue|Cancelled`. Number `INV-`, `CN-`, `DN-`.
Index `lineItems.bookingId` is the single source of truth for "is this booking invoiced".

### `InvoiceSettlement`
`invoiceId, agentId, kind Cash|Offset, amountMinor>0, currency, method (Bank Transfer|Cash|Cheque|Other), bankAccount{type Company|Partner, partnerId}, date, reference, notes, status Posted|Voided, ledgerEntryId, voidEntryId, voidedAt/By/Reason`. `Offset` rows are produced only by the netting engine ([11](11-accounting.md)).

## Routes
| Method | Path | Perm |
|---|---|---|
| GET | `/invoices/items?billToAgentId=&voyageId=|roundId=` — eligible unlocked items | `invoices` |
| GET | `/invoices` (page, limit, agentId, status, invoiceType, docKind, dateFrom, dateTo), `/invoices/:id`, `/invoices/:id/pdf` | `invoices` |
| POST | `/invoices` — create **Draft** | `invoices` |
| PUT | `/invoices/:id` — edit Draft | `invoices` |
| PUT | `/invoices/:id/bill-to` — PDF contact block (always editable) | `invoices` |
| DELETE | `/invoices/:id` — delete Draft only | `invoices` |
| POST | `/invoices/:id/issue` | `invoices:issue` |
| POST | `/invoices/:id/cancel` (body `reason`, optional `cancelCommission`) | `invoices:cancel` |
| GET / POST | `/invoices/:id/settlements` | read / `invoices:record` |
| POST | `/invoices/:id/settlements/:sid/void` (reason) | `invoices:record` |
| POST | `/invoices/:id/credit-note`, `/invoices/:id/debit-note` (`amountMinor`, `reason`, `date?`, `dueDate?`) | `invoices:issue` |

## Lifecycle and ledger effects
All steps run the round-lock pre-check and (for money) a Mongo transaction.

1. **Create Draft** (`createDraft`): needs `invoiceType`, `billToAgentId`, `itemIds[]`, dates (due ≥ invoice), `currency` (USD only — anything else is `400 INVOICE_CURRENCY_UNSUPPORTED`, audit F-03; same check on draft edit). Refreshes items from live bookings, then validates each: not locked (`DUPLICATE_BILLING`), belongs to the bill-to party, inside the scope (Voyage/Round), has `loadedQty>0`; a `Booking` invoice must cover exactly one booking. Builds per-booking snapshots (`lineItems`), lines via `buildLine` (`amountMinor = qty × toMinor(rate)`), creates the Invoice, and **claims** each item (`locked:true`). Item/DB-index races → `409 DUPLICATE_BILLING`.
2. **Edit/Delete Draft:** only `Draft`; deleting releases the items. Issued invoices are locked (`INVOICE_LOCKED` / `INVOICE_POSTED`).
3. **Issue:** atomic `Draft → Issued`; zero-value refused; FX rate fetched for non-USD (`fx.service`); ledger **DR 1100 Agent Receivable / CR 4000 Freight Revenue** (agentId, voyageId); stores `fx`, derives status; then **accrues commission** if the agent has an Active agreement covering the invoice date (DR 5400 Commission / CR 2000 Agent Payable; an `AgentCommission` row `Accrued`). Commission is independent of the invoice afterwards (rule R7).
4. **Settle** (`recordSettlement`): `amountMinor` positive integer; only on Invoice/DebitNote in a payable status; cannot exceed the open balance (`SETTLEMENT_EXCEEDS_BALANCE`); Cash only (`Offset` is rejected here). Partner bank requires `partnerId`. Posts **DR bank (1010 Company Bank / 1020 Cash / 1200 Partner Current) / CR 1100**; the DR side is `2000` for offsets. `recalc` updates `paidMinor` and status.
5. **Void settlement:** reason required; mirrors the ledger entry, marks Voided, recalcs.
6. **Credit note:** reduces open balance; guard `paid + credited + amount ≤ total` (`CREDIT_EXCEEDS_BALANCE`); posts **DR 4000 / CR 1100**; increments parent `creditedMinor`. **Debit note:** a new payable document, **DR 1100 / CR 4000**. Notes carry no line items and only apply to issued parents.
7. **Cancel:** reason required; refused with settlements/credits (`INVOICE_HAS_SETTLEMENTS`) or live debit notes; reverses the issue entry; lines flagged `cancelled`, items unlocked; commission survives unless `cancelCommission:true`.

### Status derivation (`billing.logic.deriveStatus`)
Draft/Cancelled are kept. Otherwise `balance = total − paid − credited`: ≤0 → **Paid**; past `dueDate` → **Overdue**; `paid>0` → **Partially Paid**; else **Issued**. Overdue is derived on read (`presentInvoice`); there is no nightly job, so the stored `status` can lag. The list `status` filter and the dashboard KPI therefore query by due date and balance (`billing.logic.overdueMatch`), not the stored value; filtering Issued / Partially Paid excludes past-due ones (audit F-06, fixed 2026-10-25).

## Commission rules (`computeCommission`)
`fixedPerContainer` = containers × amount; `fixedPerBooking` = lineItems × amount; `percentOfRate` = floor(total × percentBp / 10000). Agreement chosen: Active, `validFrom ≤ invoiceDate`, `validTo` null or ≥ invoiceDate, latest `validFrom`.

## PDF
`GET /invoices/:id/pdf` → `utils/invoicePdfGenerator.js` (pdfkit) using the invoice, snapshots, `billTo` block and posted settlements.

## Pure logic with tests
`billing.logic.js` (grouping, line build, balance, status, commission) is unit-tested in `backend/test/billing.test.js`.

## Related
Bookings feed items ([04](04-bookings.md)); ledger accounts and agent statements in [11](11-accounting.md); round close needs **no Draft V2 invoices** in the round ([03](03-rounds-voyages.md)); reports consume Final Loading bookings, not invoices ([08](08-reports-dashboard.md)).
