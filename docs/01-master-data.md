# 01 — Master Data

Reference entities that other modules point at. All have `createdBy/updatedBy` and timestamps; all hard-delete behind the guards listed. Aligned with the Notion proposal §11 ("Master Data checklist") as updated 2026-10-25; the work is tracked in `sprints/masterdata-2026-10-25-sprint.md`. Backfill existing data once with `npm run migrate:masterdata` (idempotent; `-- --dry` to count only).

Shared helpers: `utils/masterValidators.js` (IBAN, SWIFT, UN/LOCODE, ISO 6346 container code, currency, email, TEU factor), `modules/ledger/accountRules.js` (which chart-of-accounts accounts a master field may point at).

## Locations (`modules/locations`, `/locations`, perm module `locations`)
Hierarchy **Country → City → Port → Terminal**. `npm run seed:locations [-- --dry] [-- --all-cities] [-- --countries-only]` fills all ~250 countries (ISO code + local currency) and the cities of Egypt, Saudi Arabia, UAE, Jordan, Sudan, Djibouti, Oman, Kuwait, Qatar, Bahrain, Yemen, Turkey, India, China, Singapore (+ any country that already has cities; `--all-cities` = whole world, ~148 k) from the `country-state-city` package. Idempotent: matches by ISO code / case-insensitive name, never overwrites or deletes. One router, one RBAC gate (`rbac('locations')`) for all four levels.

| Model | Fields | Unique |
|---|---|---|
| Country | `name`, `code` (2 chars), `localCurrency` (ISO 4217, optional) | `name`, `code` |
| City | `name`, `countryId` | `(name, countryId)` |
| Port | `name`, `code` (UN/LOCODE, optional, format `^[A-Z]{2}[A-Z0-9]{3}$` when present), `cityId`, `countryId` | `(name, cityId)` |
| Terminal | `name`, `portId` | `(name, portId)` |

Routes per level (`countries|cities|ports|terminals`): `GET /`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`. Port responses populate the country's `localCurrency`.
Rules: a Port's city must belong to its country; delete is refused while child records exist. Ports are what voyages, bookings, expenses, tracking and (now) Port Agents reference. `npm run migrate:masterdata` reports ports without a (valid) code and countries without a local currency.

## Invoice Services (`modules/invoiceServices`, `/invoice-services`, perm `invoiceServices`) — Masters → Services
The services printed on invoices (master data 11.6; split from the liner Service on 2026-10-27). `InvoiceService`: `serviceName` (required, unique, the name displayed on invoices, e.g. SOC Slot Booking / THC / Reefer Monitoring), `applicability` (required `SOC_ONLY|COC_ONLY|BOTH`), `isTaxable` (required boolean; tax is not calculated yet), `revenueAccountId` (required; a revenue posting account, type Revenue / code 4…, headers excluded — `ACCOUNT_WRONG_GROUP` otherwise), `status`. **No price, no category** — rates are entered on the booking / invoice. Nothing references it yet and the ledger posting map still uses its fixed accounts. `migrate:masterdata` copies each existing liner service that has a revenue account into this master once.

## Routes = liner Services and their route legs (`modules/services`, `modules/routes`) — Operations → Routes (`/routes`)
A **Service** is the liner service: the parent of Rounds → Voyages and of the Route legs. UI: sidebar **Operations → Routes** (above Rounds), `/routes`, `/routes/[id]` with tabs *Route Details / Route / Rounds* (the Rounds tab lists the service's rounds via `GET /rounds?serviceId=`; creating rounds stays on `/rounds`). Fields: `serviceCode` (unique upper-case ≤20), `serviceName`, `defaultVesselId?`, `description`, `status`. The invoice fields (`applicability`, `isTaxable`, `revenueAccountId`) are **no longer asked for or required** here; they stay stored on old rows, hidden. Each Service has at most one **Route** (`Route.serviceId` unique) made of ordered **RouteLegs** (`routeId, sequence, countryId, cityId, portId, terminalId?, agentId?`; unique `(routeId, sequence)`).

| Route | Perm |
|---|---|
| `GET /services`, `/services/active`, `/services/:id` · `POST`, `PUT /:id`, `DELETE /:id` | `services` (shown as "Routes (liner services)" in the role matrix) |
| `GET/POST/PUT /services/:id/route` (POST and PUT both call `saveRoute`) | `routes` |

Rules: a route needs **≥ 2 legs**; each leg needs country+city+port. Saving replaces the leg list. A Service cannot be deleted while a Round uses it. Routes drive voyage generation — see [03](03-rounds-voyages.md).

## Vessels/Agents (`modules/agents`, `/agents`, perm `agents`) — the Agents tab, renamed 2026-10-27
Fields: `agentCode` (unique sparse), `agentName` (EN), `nameAr`, `defaultCurrency` (default USD), links to Locations (`portId`, optional `countryId/cityId`; the old free-text `country/city/port` stay for older records), `address`, `contacts[]` (`contactPerson, mobile, email, description`), `status`, `registrationNumber`, `taxId`, **`bankAccounts[]`** (repeatable rows `bankName` required, `swiftCode`, `bankAddress`, `usdAccountNumber`, `usdIban`; SWIFT/IBAN format-checked; visible to everyone who can read the master), **`receivableAccountId`** (AR account, picked in the form from `account-lookup?rule=receivable`), `payableAccountId` (stored, no UI), legacy `partyType` (`Agent`|`DirectLine`, still read by agent accounts for Direct Lines) and `roles[]` — **both removed from the form and from the API (not writable); old values stay stored and unused**, `ledgerVersion` (counter bumped by `lockAgent()` to serialise cash movements for that agent — never remove it). `creditDays` is still stored but is **no longer shown on the master**.

**Booking source (2026-10-27).** The accounting profile (party type + roles) was removed: **any agent or customer can handle bookings**. `agent.service#assertBookingSource` only checks the agent exists; `GET /agents?bookingSource=true` is gone (the param is ignored); `AGENT_NOT_BOOKING_SOURCE` no longer exists; `roles` and `partyType` are not accepted by create/update.

CRUD `GET/POST/PUT/DELETE /agents`. Delete refused (400) when the agent has active bookings or invoices, plus `DEPENDENTS.agent` (agreements, commissions, handling charges, settlement statements, ledger lines, manual bookings). The accounting surface (agreements, commissions, SOA, advances, netting, handling, statements) is mounted at `/agent-accounts` — see [11-accounting.md](11-accounting.md).

### Agent agreements (`modules/agreements`)
`AgentAgreement`: `agentId, currency, validFrom, validTo?, status`, **Charge Agreement** `husbandryFeePerCallMinor` + `handlingFees[] {moveType Load|Discharge, containerStatus Full|Empty, amountMinor}`, **Booking Commission Agreement** `earnsBookingCommission` (default false) + `commission {rule fixedPerContainer|fixedPerBooking|percentOfRate, amountMinor, percentBp, basis}`. Commission accrues at invoice **issue** only when `earnsBookingCommission` is true (saving a rule without the flag turns it on; the flag without a rule is refused). The proposal wants accrual at Final Loading with a fixed per-container rate; that timing change is **not** made here. `AgentCommission` rows record each accrual (`Accrued|Cancelled|Paid`).

## Agents/Customers (`modules/customers`, `/customers`, perm `customers`) — the Customers tab, renamed 2026-10-27
End customers / shippers, separate from Agents. `customerCode` (required, unique), `customerName` (EN), `nameAr`, **`customerType` (required: `Commercial Agent` | `NVOCC` | `Freight Forwarder`)**, `country`, `address`, `registrationNumber`, `taxId`, `contacts[] {name, title, email, phone}`, **`bankAccounts[]`** (same rows as agents), `defaultCurrency`, `arAccountId` (receivable account, 11xx asset), `status`. No credit days.
`GET /customers?search=&status=&customerType=&page=&limit=`: `search` (name or code) and `customerType` are applied **in the Mongo query before pagination**, so the filter covers the whole result set (`customer.logic.buildListQuery`). Optional `customerId` on `Booking` and `ManualBooking`; delete blocked by `DEPENDENTS.customer`. Commercial agents / direct lines that are invoiced stay on `Agent` (a Customer of type Commercial Agent is informational).

## Container types (`modules/containerTypes`, `/container-types`)
`code` (unique), `description`, `size` ∈ `20ft|40ft|40HC|45ft`, `type` ∈ `Dry|Reefer|Open Top|Flat Rack|Tank`, `isoCode` (optional, unique, ISO 6346 size/type e.g. `22G1`), `teuFactor` (server-derived from `size`: 20 → 1, 40ft/40HC → 2, **45ft → 2.25** (2026-10-27); read-only, informational/export). Delete refused while used by bookings.
**Capacity still derives TEU from `size` only** via `utils/teuResolver.js` (rule R10, 45ft counts as 2 there); `teuFactor` is never read by the capacity engine — the 2.25 is master data only (owner decision 2026-10-27). Ownership mode and free days are intentionally not part of this master (COC is out of scope).

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
Joint-venture owners, independent of vessels (a partner can be on many vessels; shares live on `VesselPartner`; there is no lead operator). `code` (unique), `name` (EN), `nameAr`, `country`, `address`, `registrationNumber`, `taxId`, `baseCurrency` (default USD), `status`, `notes`, **`contacts[] {name, title, email, phone}`** (repeatable), **`bankAccounts[]`** (many rows, 2026-10-27: `bankName` required, `bankAddress`, `usdAccountNumber`, `usdIban`, `swiftCode`; IBAN checksum and SWIFT format validated; same sub-schema as agents/customers). The old single `bank{}` is read-only legacy, copied into `bankAccounts[0]` by `migrate:masterdata`. The old single `contact{}` is kept readable and copied into `contacts[0]` by the backfill.
Reads need `partners:read` (`bankAccounts` are returned **only** to `partners:manage` holders — unlike agents/customers); create/update/delete need `partners:manage`. Delete uses `DEPENDENTS.partner` (vessel shares, ledger lines, expenses paid, settlements, transfers, receipts into their bank). Vessel ownership shares live in `VesselPartner` — see [02-vessels.md](02-vessels.md).

## Accounting (Masters → Accounting, `/accounting`, module `accounting`) and chart of accounts
`Account` holds the legacy **4-digit posting accounts** (the ledger posts only to these) **plus the 6-digit master chart** imported by `npm run seed:chart [-- --dry]` from `modules/ledger/chart.6digit.json` (copy of `docs/accounting/gemini-code-*.json`: 158 accounts, 108 posting / 50 headers, bilingual). Extra `Account` fields: `nameAr, level, normalBalance, isGroup, isPosting, subledgerType, allocationLevel, requiredDimensions[], defaultCurrency, isSystemLocked`; code is `^(d{4}|d{6})# 01 — Master Data

Reference entities that other modules point at. All have `createdBy/updatedBy` and timestamps; all hard-delete behind the guards listed. Aligned with the Notion proposal §11 ("Master Data checklist") as updated 2026-10-25; the work is tracked in `sprints/masterdata-2026-10-25-sprint.md`. Backfill existing data once with `npm run migrate:masterdata` (idempotent; `-- --dry` to count only).

Shared helpers: `utils/masterValidators.js` (IBAN, SWIFT, UN/LOCODE, ISO 6346 container code, currency, email, TEU factor), `modules/ledger/accountRules.js` (which chart-of-accounts accounts a master field may point at).

## Locations (`modules/locations`, `/locations`, perm module `locations`)
Hierarchy **Country → City → Port → Terminal**. `npm run seed:locations [-- --dry] [-- --all-cities] [-- --countries-only]` fills all ~250 countries (ISO code + local currency) and the cities of Egypt, Saudi Arabia, UAE, Jordan, Sudan, Djibouti, Oman, Kuwait, Qatar, Bahrain, Yemen, Turkey, India, China, Singapore (+ any country that already has cities; `--all-cities` = whole world, ~148 k) from the `country-state-city` package. Idempotent: matches by ISO code / case-insensitive name, never overwrites or deletes. One router, one RBAC gate (`rbac('locations')`) for all four levels.

| Model | Fields | Unique |
|---|---|---|
| Country | `name`, `code` (2 chars), `localCurrency` (ISO 4217, optional) | `name`, `code` |
| City | `name`, `countryId` | `(name, countryId)` |
| Port | `name`, `code` (UN/LOCODE, optional, format `^[A-Z]{2}[A-Z0-9]{3}$` when present), `cityId`, `countryId` | `(name, cityId)` |
| Terminal | `name`, `portId` | `(name, portId)` |

Routes per level (`countries|cities|ports|terminals`): `GET /`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`. Port responses populate the country's `localCurrency`.
Rules: a Port's city must belong to its country; delete is refused while child records exist. Ports are what voyages, bookings, expenses, tracking and (now) Port Agents reference. `npm run migrate:masterdata` reports ports without a (valid) code and countries without a local currency.

## Invoice Services (`modules/invoiceServices`, `/invoice-services`, perm `invoiceServices`) — Masters → Services
The services printed on invoices (master data 11.6; split from the liner Service on 2026-10-27). `InvoiceService`: `serviceName` (required, unique, the name displayed on invoices, e.g. SOC Slot Booking / THC / Reefer Monitoring), `applicability` (required `SOC_ONLY|COC_ONLY|BOTH`), `isTaxable` (required boolean; tax is not calculated yet), `revenueAccountId` (required; a revenue posting account, type Revenue / code 4…, headers excluded — `ACCOUNT_WRONG_GROUP` otherwise), `status`. **No price, no category** — rates are entered on the booking / invoice. Nothing references it yet and the ledger posting map still uses its fixed accounts. `migrate:masterdata` copies each existing liner service that has a revenue account into this master once.

## Routes = liner Services and their route legs (`modules/services`, `modules/routes`) — Operations → Routes (`/routes`)
A **Service** is the liner service: the parent of Rounds → Voyages and of the Route legs. UI: sidebar **Operations → Routes** (above Rounds), `/routes`, `/routes/[id]` with tabs *Route Details / Route / Rounds* (the Rounds tab lists the service's rounds via `GET /rounds?serviceId=`; creating rounds stays on `/rounds`). Fields: `serviceCode` (unique upper-case ≤20), `serviceName`, `defaultVesselId?`, `description`, `status`. The invoice fields (`applicability`, `isTaxable`, `revenueAccountId`) are **no longer asked for or required** here; they stay stored on old rows, hidden. Each Service has at most one **Route** (`Route.serviceId` unique) made of ordered **RouteLegs** (`routeId, sequence, countryId, cityId, portId, terminalId?, agentId?`; unique `(routeId, sequence)`).

| Route | Perm |
|---|---|
| `GET /services`, `/services/active`, `/services/:id` · `POST`, `PUT /:id`, `DELETE /:id` | `services` (shown as "Routes (liner services)" in the role matrix) |
| `GET/POST/PUT /services/:id/route` (POST and PUT both call `saveRoute`) | `routes` |

Rules: a route needs **≥ 2 legs**; each leg needs country+city+port. Saving replaces the leg list. A Service cannot be deleted while a Round uses it. Routes drive voyage generation — see [03](03-rounds-voyages.md).

## Vessels/Agents (`modules/agents`, `/agents`, perm `agents`) — the Agents tab, renamed 2026-10-27
Fields: `agentCode` (unique sparse), `agentName` (EN), `nameAr`, `defaultCurrency` (default USD), links to Locations (`portId`, optional `countryId/cityId`; the old free-text `country/city/port` stay for older records), `address`, `contacts[]` (`contactPerson, mobile, email, description`), `status`, `registrationNumber`, `taxId`, **`bankAccounts[]`** (repeatable rows `bankName` required, `swiftCode`, `bankAddress`, `usdAccountNumber`, `usdIban`; SWIFT/IBAN format-checked; visible to everyone who can read the master), **`receivableAccountId`** (AR account, picked in the form from `account-lookup?rule=receivable`), `payableAccountId` (stored, no UI), legacy `partyType` (`Agent`|`DirectLine`, still read by agent accounts for Direct Lines) and `roles[]` — **both removed from the form and from the API (not writable); old values stay stored and unused**, `ledgerVersion` (counter bumped by `lockAgent()` to serialise cash movements for that agent — never remove it). `creditDays` is still stored but is **no longer shown on the master**.

**Booking source (2026-10-27).** The accounting profile (party type + roles) was removed: **any agent or customer can handle bookings**. `agent.service#assertBookingSource` only checks the agent exists; `GET /agents?bookingSource=true` is gone (the param is ignored); `AGENT_NOT_BOOKING_SOURCE` no longer exists; `roles` and `partyType` are not accepted by create/update.

CRUD `GET/POST/PUT/DELETE /agents`. Delete refused (400) when the agent has active bookings or invoices, plus `DEPENDENTS.agent` (agreements, commissions, handling charges, settlement statements, ledger lines, manual bookings). The accounting surface (agreements, commissions, SOA, advances, netting, handling, statements) is mounted at `/agent-accounts` — see [11-accounting.md](11-accounting.md).

### Agent agreements (`modules/agreements`)
`AgentAgreement`: `agentId, currency, validFrom, validTo?, status`, **Charge Agreement** `husbandryFeePerCallMinor` + `handlingFees[] {moveType Load|Discharge, containerStatus Full|Empty, amountMinor}`, **Booking Commission Agreement** `earnsBookingCommission` (default false) + `commission {rule fixedPerContainer|fixedPerBooking|percentOfRate, amountMinor, percentBp, basis}`. Commission accrues at invoice **issue** only when `earnsBookingCommission` is true (saving a rule without the flag turns it on; the flag without a rule is refused). The proposal wants accrual at Final Loading with a fixed per-container rate; that timing change is **not** made here. `AgentCommission` rows record each accrual (`Accrued|Cancelled|Paid`).

## Agents/Customers (`modules/customers`, `/customers`, perm `customers`) — the Customers tab, renamed 2026-10-27
End customers / shippers, separate from Agents. `customerCode` (required, unique), `customerName` (EN), `nameAr`, **`customerType` (required: `Commercial Agent` | `NVOCC` | `Freight Forwarder`)**, `country`, `address`, `registrationNumber`, `taxId`, `contacts[] {name, title, email, phone}`, **`bankAccounts[]`** (same rows as agents), `defaultCurrency`, `arAccountId` (receivable account, 11xx asset), `status`. No credit days.
`GET /customers?search=&status=&customerType=&page=&limit=`: `search` (name or code) and `customerType` are applied **in the Mongo query before pagination**, so the filter covers the whole result set (`customer.logic.buildListQuery`). Optional `customerId` on `Booking` and `ManualBooking`; delete blocked by `DEPENDENTS.customer`. Commercial agents / direct lines that are invoiced stay on `Agent` (a Customer of type Commercial Agent is informational).

## Container types (`modules/containerTypes`, `/container-types`)
`code` (unique), `description`, `size` ∈ `20ft|40ft|40HC|45ft`, `type` ∈ `Dry|Reefer|Open Top|Flat Rack|Tank`, `isoCode` (optional, unique, ISO 6346 size/type e.g. `22G1`), `teuFactor` (server-derived from `size`: 20 → 1, 40ft/40HC → 2, **45ft → 2.25** (2026-10-27); read-only, informational/export). Delete refused while used by bookings.
**Capacity still derives TEU from `size` only** via `utils/teuResolver.js` (rule R10, 45ft counts as 2 there); `teuFactor` is never read by the capacity engine — the 2.25 is master data only (owner decision 2026-10-27). Ownership mode and free days are intentionally not part of this master (COC is out of scope).

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
Joint-venture owners, independent of vessels (a partner can be on many vessels; shares live on `VesselPartner`; there is no lead operator). `code` (unique), `name` (EN), `nameAr`, `country`, `address`, `registrationNumber`, `taxId`, `baseCurrency` (default USD), `status`, `notes`, **`contacts[] {name, title, email, phone}`** (repeatable), **`bank {bankName, bankAddress, usdAccountNumber, usdIban, swiftCode}`** (one section; IBAN checksum and SWIFT format validated). The old single `contact{}` is kept readable and copied into `contacts[0]` by the backfill.
Reads need `partners:read` (bank details are returned **only** to `partners:manage` holders); create/update/delete need `partners:manage`. Delete uses `DEPENDENTS.partner` (vessel shares, ledger lines, expenses paid, settlements, transfers, receipts into their bank). Vessel ownership shares live in `VesselPartner` — see [02-vessels.md](02-vessels.md).

. The UI (module `accounting`, API `/accounting/accounts|meta`) has tabs **Chart of Accounts** (a collapsible tree: class → group → sub-group → posting, with Expand all / Collapse all; the 4-digit ledger accounts sit under one group; search/filter auto-expands the matches and their parents; create a posting account under a header, edit unlocked posting accounts; headers and locked rows are read-only, no delete — deactivate instead), **Exchange Rates** (needs `ledger` perm; `/ledger/exchange-rates`) and **Coding Rules** (read-only reference of the docs/accounting rules). **Master data only:** `account-lookup` hides headers/non-posting rows and serves the 6-digit accounts to Invoice Services, Expense Types, Agents and Customers; the ledger posting map, header lock and mandatory-dimension enforcement are a later money sprint.
Exchange rates and the 4-digit accounts are documented in [11-accounting.md](11-accounting.md). Master-data forms read account choices from `GET /ledger/account-lookup?rule=revenue|expense|accrual|receivable` (any signed-in user; code, name, type only); groups are matched by type + code prefix (`accountRules.js`).

## Seeds
`npm run seed` upserts the five system roles + permissions, an admin user, the demo users and the default chart of accounts. It never runs from the server. `seed:test-data` builds a disposable operational dataset through the real services (see CLAUDE.md "Test data").

## Searchable country / city / port pickers (2026-10-27)
Every country, city, port and terminal drop-down in the master-data screens uses `components/ui/SearchSelect` (type to filter; first 200 matches shown): Locations forms (city → country; port → country + city; terminal → port), Route legs, the shared `LocationSelect`, Vessels/Agents (country → city cascade storing `countryId`/`cityId` plus the legacy `country`/`city` names, and port), and the country on Partners and Customers (stored as the country name; an older free-text value stays selectable).
