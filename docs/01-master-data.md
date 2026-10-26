# 01 — Master Data

Reference entities that other modules point at. All have `createdBy/updatedBy` and timestamps; all hard-delete behind the guards listed. Aligned with the Notion proposal §11 ("Master Data checklist") as updated 2026-10-25; the work is tracked in `sprints/masterdata-2026-10-25-sprint.md`. Backfill existing data once with `npm run migrate:masterdata` (idempotent; `-- --dry` to count only).

Shared helpers: `utils/masterValidators.js` (IBAN, SWIFT, UN/LOCODE, ISO 6346 container code, currency, email, TEU factor), `modules/ledger/accountRules.js` (which chart-of-accounts accounts a master field may point at).

## Locations (`modules/locations`, `/locations`, perm module `locations`)
Hierarchy **Country → City → Port → Terminal**. One router, one RBAC gate (`rbac('locations')`) for all four levels.

| Model | Fields | Unique |
|---|---|---|
| Country | `name`, `code` (2 chars), `localCurrency` (ISO 4217, optional) | `name`, `code` |
| City | `name`, `countryId` | `(name, countryId)` |
| Port | `name`, `code` (UN/LOCODE, optional, format `^[A-Z]{2}[A-Z0-9]{3}$` when present), `cityId`, `countryId` | `(name, cityId)` |
| Terminal | `name`, `portId` | `(name, portId)` |

Routes per level (`countries|cities|ports|terminals`): `GET /`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`. Port responses populate the country's `localCurrency`.
Rules: a Port's city must belong to its country; delete is refused while child records exist. Ports are what voyages, bookings, expenses, tracking and (now) Port Agents reference. `npm run migrate:masterdata` reports ports without a (valid) code and countries without a local currency.

## Services and Routes (`modules/services`, `modules/routes`)
A **Service** is the liner service: the parent of Rounds → Voyages and of the Route legs, and it is used on invoices. Fields: `serviceCode` (unique upper-case ≤20), `serviceName`, `defaultVesselId?`, `description`, `status Active|Inactive`, plus the invoice setup (master data 11.6):

| Field | Rule |
|---|---|
| `applicability` | `SOC_ONLY` (default) \| `COC_ONLY` \| `BOTH` |
| `isTaxable` | boolean, default false (tax is not calculated yet) |
| `revenueAccountId` | **required**, a revenue account (type Revenue, code 4xxx) from the chart of accounts; `ACCOUNT_WRONG_GROUP` otherwise |

The Service stores **no price**: the rate is entered on the booking / invoice. The posting map still uses its fixed revenue accounts; wiring `revenueAccountId` into postings is a later money change.
Each Service has at most one **Route** (`Route.serviceId` unique) made of ordered **RouteLegs** (`routeId, sequence, countryId, cityId, portId, terminalId?, agentId?`; unique `(routeId, sequence)`).

| Route | Perm |
|---|---|
| `GET /services`, `/services/active`, `/services/:id` · `POST`, `PUT /:id`, `DELETE /:id` | `services` |
| `GET/POST/PUT /services/:id/route` (POST and PUT both call `saveRoute`) | `routes` |

Rules: a route needs **≥ 2 legs**; each leg needs country+city+port. Saving replaces the leg list. A Service cannot be deleted while a Round uses it. Routes drive voyage generation — see [03](03-rounds-voyages.md). Creating a route and assigning it to a service from the Rounds screens is handled in the Rounds part of the rework.

## Agents = Port Agents, commercial/booking agents, Direct Lines (`modules/agents`, `/agents`, perm `agents`)
Fields: `agentCode` (unique sparse), `agentName` (EN), `nameAr`, `defaultCurrency` (default USD), links to Locations (`portId`, optional `countryId/cityId`; the old free-text `country/city/port` stay for older records), `address`, `contacts[]` (`contactPerson, mobile, email, description`), `status`, `partyType` (`Agent` | `DirectLine`; a Direct Line gets invoices + statement only, no netting), `roles[]`, `receivableAccountId/payableAccountId` (accounting mapping), `ledgerVersion` (counter bumped by `lockAgent()` to serialise cash movements for that agent — never remove it). `creditDays` is still stored but is **no longer shown on the master**.

**Roles / booking source.** `roles` holds `Port` (port operations, PDA/FDA expenses) and `Commercial` (the "Commercial Agent / Booking Agent" checkbox). An agent can be chosen as a **booking source** unless its roles are exactly `['Port']`; older agents with `roles: []` keep working as commercial agents. Enforced by `agent.service#assertBookingSource` on Layer 2 and Layer 1 booking create, Layer 1 agent change and import preview (`400 AGENT_NOT_BOOKING_SOURCE`); `GET /agents?bookingSource=true` returns only eligible agents (used by the booking and import forms).

CRUD `GET/POST/PUT/DELETE /agents`. Delete refused (400) when the agent has active bookings or invoices, plus `DEPENDENTS.agent` (agreements, commissions, handling charges, settlement statements, ledger lines, manual bookings). The accounting surface (agreements, commissions, SOA, advances, netting, handling, statements) is mounted at `/agent-accounts` — see [11-accounting.md](11-accounting.md).

### Agent agreements (`modules/agreements`)
`AgentAgreement`: `agentId, currency, validFrom, validTo?, status`, **Charge Agreement** `husbandryFeePerCallMinor` + `handlingFees[] {moveType Load|Discharge, containerStatus Full|Empty, amountMinor}`, **Booking Commission Agreement** `earnsBookingCommission` (default false) + `commission {rule fixedPerContainer|fixedPerBooking|percentOfRate, amountMinor, percentBp, basis}`. Commission accrues at invoice **issue** only when `earnsBookingCommission` is true (saving a rule without the flag turns it on; the flag without a rule is refused). The proposal wants accrual at Final Loading with a fixed per-container rate; that timing change is **not** made here. `AgentCommission` rows record each accrual (`Accrued|Cancelled|Paid`).

## Customers (`modules/customers`, `/customers`, perm `customers`)
End customers / shippers, separate from Agents. `customerCode` (required, unique), `customerName` (EN), `nameAr`, **`customerType` (required: `Commercial Agent` | `NVOCC` | `Freight Forwarder`)**, `country`, `address`, `registrationNumber`, `taxId`, `contacts[] {name, title, email, phone}`, `defaultCurrency`, `arAccountId` (receivable account, 11xx asset), `status`. No credit days.
`GET /customers?search=&status=&customerType=&page=&limit=`: `search` (name or code) and `customerType` are applied **in the Mongo query before pagination**, so the filter covers the whole result set (`customer.logic.buildListQuery`). Optional `customerId` on `Booking` and `ManualBooking`; delete blocked by `DEPENDENTS.customer`. Commercial agents / direct lines that are invoiced stay on `Agent` (a Customer of type Commercial Agent is informational).

## Container types (`modules/containerTypes`, `/container-types`)
`code` (unique), `description`, `size` ∈ `20ft|40ft|40HC|45ft`, `type` ∈ `Dry|Reefer|Open Top|Flat Rack|Tank`, `isoCode` (optional, unique, ISO 6346 size/type e.g. `22G1`), `teuFactor` (server-derived from `size`: 20 → 1, others → 2; read-only, informational/export). Delete refused while used by bookings.
**Capacity still derives TEU from `size` only** via `utils/teuResolver.js` (rule R10); `teuFactor` is never read by the capacity engine. Ownership mode and free days are intentionally not part of this master (COC is out of scope).

## Expense types and categories (`modules/expenseTypes`, `/expense-types`)
- **ExpenseCategory** `{name unique ≤50, costClassification: 'Voyage Cost'|'Other Voyage Cost'}` — the business flag the Voyage Profitability report uses. Reports never hard-code a category name.
- **ExpenseType** `{name unique ≤100, category (string, kept for the P&L)}` plus the cost-classification/accounting setup (11.7). The type never stores an amount.

| Field | Rule |
|---|---|
| `operationalLevel` | `ROUND_LEVEL` \| `VOYAGE_LEVEL` (default) \| `PORT_LEVEL`. Decides the expense scope: Round-level → round only; Voyage-level → voyage (or port-of-voyage); Port-level → port only (`400 EXPENSE_LEVEL_MISMATCH`) |
| `requiresPda` | new expenses of this type start as a PDA; creating a direct FDA is refused (`400 PDA_REQUIRED`) — the FDA comes from converting the PDA |
| `expenseAccountId` | **required**, expense account (type Expense, 5xxx) |
| `accrualAccountId` | **required when `requiresPda`**, accrual account (liability 21xx); cleared when PDA is off |

The accounts are stored; the ledger posting map still uses its own accounts (wiring them in is a later money change). Routes: `/categories` (GET/POST/PUT `:id`/DELETE `:id`) then `/` CRUD, all `expenseTypes`. Category delete refused while a type uses it; type delete refused while an expense uses it. Special type name: `Hire Rate` (cost = rate × voyage duration in the P&L, see [08](08-reports-dashboard.md)).
Backfill (`migrate:masterdata`): level from the scopes the type's existing expenses already use, account from name/category, `requiresPda=false`; types used at several scopes are logged for review.

## Partners (`modules/partners`, `/partners`)
Joint-venture owners, independent of vessels (a partner can be on many vessels; **Lead Operator lives on `VesselPartner`**, not here). `code` (unique), `name` (EN), `nameAr`, `country`, `address`, `registrationNumber`, `taxId`, `baseCurrency` (default USD), `status`, `notes`, **`contacts[] {name, title, email, phone}`** (repeatable), **`bank {bankName, bankAddress, usdAccountNumber, usdIban, swiftCode}`** (one section; IBAN checksum and SWIFT format validated). The old single `contact{}` is kept readable and copied into `contacts[0]` by the backfill.
Reads need `partners:read` (bank details are returned **only** to `partners:manage` holders); create/update/delete need `partners:manage`. Delete uses `DEPENDENTS.partner` (vessel shares, ledger lines, expenses paid, settlements, transfers, receipts into their bank). Vessel ownership shares live in `VesselPartner` — see [02-vessels.md](02-vessels.md).

## Chart of accounts and exchange rates
`Account` and `ExchangeRate` are ledger master data, documented in [11-accounting.md](11-accounting.md). Master-data forms read account choices from `GET /ledger/account-lookup?rule=revenue|expense|accrual|receivable` (any signed-in user; code, name, type only). The proposal names account groups 400000 / 500000 / 213000; our chart is 4-digit, so groups are matched by type + code prefix (`accountRules.js`) instead of renumbering.

## Seeds
`npm run seed` upserts the five system roles + permissions, an admin user, the demo users and the default chart of accounts. It never runs from the server. `seed:test-data` builds a disposable operational dataset through the real services (see CLAUDE.md "Test data").
