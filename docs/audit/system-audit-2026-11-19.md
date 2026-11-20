# System audit — 2026-11-19

Read-only audit of the whole system as it is in `HEAD` (`bb81041`, branch `version-4`). Nothing was changed except this file and the table in `docs/audit/README.md`. Every command was run against the **Atlas TEST database** (`test`); no seed with `--reset`, no delete or apply script, nothing against production.

**Evidence labels:** *probed* = reproduced by a probe script or a real run today; *unit* = covered by `npm test`; *code* = read in the code only, not run; *docs* = documentation claim only. "Not found" = I looked and it is not there.

Severity: **High** = wrong money, blocks a core flow, or a serious security exposure; **Medium** = wrong or misleading result under normal use; **Low** = hygiene or edge case; **Info** = note.

---

## 1. Verification (run today)

| Check | Result | Evidence |
|---|---|---|
| `npm test` (backend) | **130 / 130 pass**, 0 fail (19 files; pure logic only) | unit |
| `scripts/e2e-masterdata.js` | **136 / 136 pass** (111 old + 25 new location pagination checks) | probed |
| `scripts/audit-probes/rounds-voyages-probe.js` | **64 probes, 0 defects** | probed |
| `scripts/audit-probes/bookings-probe.js` | **45 probes, 0 defects** (voyage auto-assign, per-leg capacity, voyage-cancel cascade, import rules, discharge scope, partner boundary) | probed |
| `scripts/audit-probes/probes-1.js`, `probes-2.js` | **Not run.** They connect to `mongodb://localhost:27018/flow_audit_probe` (a local replica set that does not exist here). Old V2 audit probes, from 2026-10 | not run |
| Frontend `npm run lint` | **Fails: 42 problems, 12 errors, 30 warnings** (whole repo). The 12 errors are in 11 older files (see S-06). None is in a file added by the locations or booking-view work; `RouteEditor.jsx:139` is an old effect that was also in the 2026-11-10 commit | probed |
| Frontend `npm run build` | **Did not complete.** Next stopped at once with its "another build in progress / previous build did not exit cleanly" lock message (a dev server is running on port 3000). I did not stop the owner's dev server. So **no production build of the current code exists** | probed (failed to run) |
| `npm audit --omit=dev` backend | **11 vulnerabilities: 1 critical, 3 high, 7 moderate** (see S-04, S-05) | probed |
| `npm audit --omit=dev` frontend | **3 vulnerabilities: 2 high, 1 moderate** (see S-05) | probed |
| `npm run test:int` | **Not run.** It needs a local replica set (`TEST_MONGODB_URI`). Here: variable unset, no `mongod`, the Docker daemon is not running. It also refuses Atlas by design. 59 integration tests exist (22 + 7 + 30) and have not run since the V2-only conversion | not run |
| Browser pass of any screen | **Not done** (no browser tool in this session) | not run |
| Load / performance test | Not done | not run |

Side effects of running the probes: each probe rewrites its tracked `*.result.json` file (I restored both with `git checkout`), and the probes leave `E2E` / `ZS` / `ZV` records in the test DB (section 8). Writing any file under `backend/` also restarts the dev server through nodemon, which interrupted one of my runs (S-16).

---

## 2. What changed since 2026-11-10

Three commits sit after the 2026-11-10 audit: `54dc194` (2026-11-10, the bookings rework the old audit describes), `390492c` (2026-11-17, UI redesign, 65 files) and `bb81041` (2026-11-19, locations and booking views, 44 files not counting `graphify-out/`). The working tree is clean except `prompt.txt`.

| # | Change | What it does | Verified | Still unverified |
|---|---|---|---|---|
| C1 | **UI redesign** (2026-11-17) | Top bar instead of sidebar, add/edit as full pages (`FormPage`), three-colour palette, restyled dashboard and auth pages, shared badges and dialogs. Frontend only | docs: lint + `next build` OK on 2026-11-17 | Browser pass never done. Today `build` could not run (section 1) |
| C2 | **Locations: sea / coastal only** | Reviewed list of 44 landlocked countries (`coastal.logic.js`); `location.service.js` refuses a landlocked country, and a city or port under one, on create and on a parent change; `seed-locations.js` rewritten to read static data files and skip landlocked countries | unit: `coastal.logic.test.js` (5). probed (ad hoc script, not kept in the repo): the 400 refusals and edits of existing records over HTTP | Only the **country** level is checked (S-11). Production never touched |
| C3 | **Cleanup script** `scripts/clean-coastal-locations.js` | Dry run by default; `--apply` writes a backup file, deletes bottom-up in one transaction, re-checks references inside it, refuses any DB not named `test` unless `--allow-production --confirm-db <name>` | probed: dry run and one apply on the test DB (44 countries removed, 0 blocked); second run removes nothing | The production refusal path, restoring from the backup file, and the transaction under load were **not exercised** |
| C4 | **Locations data and seed** | One-off generator `build-location-data.js` (Natural Earth 10 m coastline + UN/LOCODE function 1 + `country-state-city` lat/long) writes `src/config/data/{coastal-cities,seaports,terminals}.json`. Seed upserts by ISO code / LOCODE / (country, name); test DB now has 206 countries, 49,324 cities, 9,251 ports, 24 terminals | probed: seed run twice, second run adds 0; test DB landlocked countries = 0 | `terminals.json` (24 names, 10 ports) is **hand-written from memory**, no source file (S-12). 9,235 "seaports" are every LOCODE function-1 entry within 50 km of the coast or on the estuary list, including many tiny harbours. Fresh-DB (empty) seed run not done |
| C5 | **Dependents changes** (`utils/dependents.js`) | `DEPENDENTS.port` now also lists `Voyage.portCalls`, `Expense`, `TrackingHistory`, `Agent`, `RouteLeg`. New `country`, `city`, `terminal` entries | probed: used by the cleanup script (its reference scan found the real references: e.g. Shanghai 2 tracking, 4 expenses, 30 bookings) | **The location delete services do not use them** (S-03). `DEPENDENTS` has no entry for `Booking` etc. on country/city, by design |
| C6 | **Location pagination** | `GET /locations/{countries,cities,ports,terminals}`: `page` (1), `limit` (20, max 100), `search`, parent filter, stable sort (name, `_id`), response `{success, message, data, total, page, limit, pagination}`; compound indexes; invalid parent id gives 400 | unit: `locationPaging.test.js` (8). probed: 25 new e2e checks (shape, default 20, cap 100, no overlap, totals, search, parent filters, 400) | Browser: tables, page size, debounce, previous-page-visible, pickers. Old indexes still in the DB (S-09) |
| C7 | **LocationPicker / SearchSelect / forms** | New `LocationPicker` (load on type, limit 20, parent filter, saved value by id) used in `LocationSelect`, `LocationForm`, `AgentForm`, `RouteEditor` (4 levels), customer and partner country. `LocationLevelTable` is server-paged | code + lint clean on the touched files | **Never opened in a browser; not built** |
| C8 | **Bookings page: voyage rows first** | New `GET /bookings/voyage-summary?tab=…` (one row per voyage: round, voyage name and number, bookings, total TEU, total freight) and `BookingVoyageList`; every tab opens on voyage rows, click opens that voyage's normal table | unit: `bookingSummary.logic.test.js` (6). probed (ad hoc script, not kept): every row of all four tabs equals its drill-down list (19/19), partner user sees only own partner (2 of 142) | Browser. Totals include Cancelled bookings (S-02) |
| C9 | **Docs** | `docs/01` has the "Sea / coastal only" block; `CLAUDE.md` and `sprints/STATUS.md` have a Locations entry | n/a | Nothing documents pagination, `voyage-summary`, `LocationPicker` (S-15) |
| C10 | Other | `graphify-out/` regenerated; `prompt.txt` is the working brief | n/a | n/a |

**Not changed since 2026-11-10 (still the same):** ledger, invoicing, settlement, round close, capacity engine, import rules, voyage rules. No money code was touched in C1–C10.

---

## 3. The flow as the code works today

```
Service ─► Route (legs) ─► Round (own editable legs + legKey) ─► Voyage (a run over a range of legs, direction)
                                                                     ▲ server finds it from POL/POD
Agent ─► Round ─► POL / POD ─► Booking L1 (ManualBooking estimate)  or  Booking L2 (one container)
                                    Pending → Confirmed → Final Loading   (Cancelled)
Final Loading import ─► BookingItems ─► Invoices ─► Ledger (Dr 1100 / Cr 4000) ─► Round close / partner settlement
Discharge list (Round + POL + POD) ─► Excel ─► Discharge import (Discharged / Remaining)
```

| # | Step | Rules enforced today | Changed since 2026-11-10? | Evidence |
|---|---|---|---|---|
| 1 | **Service** | code unique; Active to open a round; delete blocked by rounds of any status, voyages, tracking (`DEPENDENTS.service`) | no | probed (rounds-voyages probe RV-28) |
| 2 | **Route** (legs) | ≥ 2 legs; country → city → port → terminal chain checked; no two consecutive equal ports; replace in one transaction | **Pickers changed** (C7); the rules did not | probed (RV-08…12, 33) |
| 3 | **Round** | Service and Vessel Active; one Active round per vessel (partial unique index); legs copied to `routeSnapshot.legs` with `legKey`; no voyages created; Planned/Active only at creation | no | probed (RV-01…07, 34) |
| 4 | **Voyage** | user adds each run (`POST /voyages`); ports in travel order into `portCalls[]`; always created Scheduled; number `V`+counter+E/W/N/S; status table (section 4.3); Departed/In Transit/Arrived/Completed need an Active round unless `voyages:override`; delete blocked by bookings, tracking, expenses, ledger lines, invoiced items | no | probed (RV-18…23, 38, 39) |
| 5 | **Booking L1** (`ManualBooking`) | agent, round, POL/POD, ≥ 1 cargo row; voyage found by `voyageMatch`; totals computed server-side | no | probed (bookings probe), unit (`voyageMatch`) |
| 5 | **Booking L2** (`Booking`) | one container; voyage by `voyageMatch` (409 `VOYAGE_AMBIGUOUS` on a tie); round must be bookable; `totalFreight` = `freightRate` | no | probed, unit |
| 6 | Status | Pending → Confirmed → Final Loading; Final Loading and Cancelled cannot be edited | no | code (`booking.service.js` lines 19–21 and 215) |
| 7 | **Final Loading import** | whole file valid or refused; one transaction; manifest → Final Loading; the agent's other live bookings in the round → Cancelled; refused if one is on a live invoice (`BOOKING_INVOICED`) | no | probed + unit (`importRules`) |
| 8 | **BookingItems** | only Final Loading bookings; item = (bill-to agent, voyage, container type, rate) with `loadedQty`; re-synced after each booking write, fire-and-forget | no | code (FL-07) |
| 9 | **Invoices** | draft → issued; issued invoices locked (notes for corrections); **USD only** (`INVOICE_CURRENCY_UNSUPPORTED`); one live invoice line per item (partial unique index) | no | docs + code; unit (`billing.test.js`, 5) |
| 10 | **Ledger** | only `LedgerService.post/reverse`; issue posts Dr `1100` / Cr `4000` with `agentId` + `voyageId` on the lines; append-only models; round lock inside `post` | no | code read today (`invoiceV2.service.js:204-210`); unit (`ledger.test.js`, 6); probed: test-DB ledger balanced in USD (48,046,600 minor debit = credit) |
| 11 | **Discharge** | scope Round + Agent + POD [+ POL, Voyage]; matched → Discharged, other Final Loading in scope → Remaining; staff only | no | probed (DS group) |
| 12 | **Round close / partner settlement** | blocked by open PDAs, draft invoices, voyages not Completed/Cancelled, no vessel shares, lines in another currency; posts the closing entry; then everything is locked (`409 ROUND_CLOSED`) | no | docs + unit (`partnerSettlement.test.js`, 5; `shares.test.js`, 4). **Not probed, `test:int` not run** |
| 13 | **Capacity** | per leg, both layers, Cancelled excluded; used on L1/L2 create pre-flight and the capacity report | no (rewritten 2026-11-10) | unit (`capacityLegs.logic.test.js`, 8) + probed (bookings probe) |

**New in the flow since 2026-11-10:** the Bookings page now starts at voyage rows (C8); location pickers load on type (C7); location create/update refuses landlocked parents (C2). Nothing else.

---

## 4. Voyages (for the Voyage details page)

### 4.1 Voyages list page today (`/voyages`) — *code*
| Item | What is there |
|---|---|
| Files | `app/(dashboard)/voyages/page.jsx` → `modules/voyages/VoyageList.jsx` (327 lines) |
| Guard | `PageGuard module="voyages"` (needs `voyages:read`) |
| Shows | Voyages **grouped by round** (round number, name, count), one table per round. Columns: checkbox, Voyage No (name, else number, + direction), Service, POL, POD, ETD, ETA, ATD, ATA, Status, Actions. Page size 20, sorted by `roundId, sequence`, then re-ordered for display by physical leg order (`sortVoyagesForDisplay`) |
| Filters | **Service** and **Status** only. The API also accepts `roundId`, `polId`, `podId`, but the page has no round filter and no search |
| Row click | **None.** The row is not clickable. Actions: Edit (opens `VoyageEditForm` in a `FormPage`), Delete; bulk select + bulk delete; Export button (`module="voyages"`) |
| Permissions used | `can('voyages','update')` for Edit, `can('voyages','delete')` for Delete and bulk delete |
| API calls | `GET /voyages?page&limit&status&serviceId`; `GET /services/active` (needs `services:read`, see S-14); `GET /voyages/round-ports/:roundId` (one per visible round, for display order); `PUT /voyages/:id`; `DELETE /voyages/:id`; export endpoint |
| Bug | The ETA and ATD columns are **swapped** (S-01) |

### 4.2 Is there a voyage details page or route? — *code*
**No.** Not found: there is no `/voyages/[id]` page. The nearest things:
- **Round detail** `/rounds/[id]` (`RoundDetail.jsx`): round header, `RoundLegsPanel` (edit legs), `RoundVoyageList` (add voyage, edit, **refresh ports**, delete; shows ETD/ETA/ATD/ATA and ETP if any voyage has one; no booking counts or TEU), `RoundAccountingPanel`.
- **Backend** `GET /voyages/:id` exists (`getById`): populates round (`roundNumber roundName startDate endDate` only), service, POL, POD. It does **not** populate the **vessel** (a voyage has no vessel field; it is `Round.vesselId`) and does not add port names for the port calls beyond the stored snapshot.
- Bookings: `/bookings/voyage-summary` (C8) is the first voyage-level booking view; `RoundCapacityReport` (reports) shows per-leg capacity of a round.

### 4.3 Voyage model — every field (`voyage.model.js`) — *code*
| Field | Type / note |
|---|---|
| `voyageNumber` | string, required, unique (`V0001E` = `V` + global 4-digit counter + E/W/N/S) |
| `voyageCode` | string ≤ 50, optional |
| `voyageName` | string, optional (display uses name, falls back to number) |
| `roundId` | ref Round, required |
| `serviceId` | ref Service, required |
| `polId`, `podId` | ref Port, required: first and last port call |
| `sequence` | number ≥ 1, required (`Round.lastVoyageSeq`; never written by the display re-sort) |
| `direction` | `East`, `West`, `North`, `South` (null on legacy) |
| `fromLegKey`, `toLegKey` | string: the range of the round's legs this run covers |
| `portCalls[]` | see below |
| `etd`, `eta` | Date: expected departure from POL / arrival at POD |
| `etp` | Date: **meaning not documented** in the model or docs (exported as "ETP", shown in `RoundVoyageList` only when any voyage has it) |
| `atd`, `ata` | Date: actual departure / arrival (Departed needs `atd`, Arrived needs `ata`) |
| `status` | `Scheduled`, `Departed`, `In Transit`, `Arrived`, `Completed`, `Cancelled` |
| `isManual` | boolean (legacy flag) |
| `createdBy`, `updatedBy`, `createdAt`, `updatedAt` | audit fields |
| **Vessel** | **not a field**: read it from `Round.vesselId` |

**`portCalls[]`** (sub-document, no `_id`): `legKey` (required), `portId` (required), `portName`, `portCode` (name/code snapshot), **`eta`**, **`etd`**. The **order is the array order** (travel order; a westbound run lists its ports in reverse). **Not found:** per-port ETB, per-port ATA/ATD, any per-port actual timestamp. Actual port events exist only in `TrackingHistory` (below).

**Status transitions** (`voyage.service.js` `STATUS_TRANSITIONS`; `voyages:override` bypasses the table, never the date rules) — *code, probed (RV-39/39b)*:

| From | Allowed |
|---|---|
| Scheduled | Departed, Cancelled |
| Departed | In Transit, Arrived, Cancelled |
| In Transit | Arrived, Cancelled |
| Arrived | Completed (cannot be Cancelled) |
| Completed, Cancelled | none |

Date rules: `eta` before `etd` and `ata` before `atd` are errors; Departed needs `atd`, Arrived needs `ata`; overlap and "outside the round dates" are warnings only (`data.warnings`).

**Tracking per port:** `TrackingHistory` (append-only) holds `voyageId, roundId, vesselId, serviceId, countryId, cityId, portId, terminalId, status` (`At Port`, `Departed`, `In Transit`, `Arrived`, `Anchored`, `Delayed`), `remarks`, `lastUpdate`. It is the only place with per-port actual times, and nothing copies them back to the voyage.

### 4.4 Booking models — every field — *code*
**Layer 2 `Booking`** (one container): `bookingNumber` (unique), `voyageId`, `agentId`, `shipper`, `consignee`, `carrierName`, **`polId`, `podId`, `polLegKey`, `podLegKey`**, `partnerId`, `source` (`Staff` / `PartnerUser`), **`containerTypeId`** (ref ContainerType: `size` ∈ `20ft, 40ft, 40HC, 45ft`; `type` ∈ `Dry, Reefer, Open Top, Flat Rack, Tank`), **`freightRate`**, **`totalFreight`** (= rate, server-computed), `commodity`, `containerNumber` (required, import key), **`vgm`** (kg, verified gross mass), `dg`, `imdgCode`, `containerStatus` (`Full` / `Empty`), `remarks`, **`status`** (`Pending, Confirmed, Final Loading, Cancelled`), `dischargeStatus` (`Discharged` / `Remaining` / null), `dischargedAt`, `billToPartyId`, `customerId`, `shipperSource`, `paymentTerm`, `collectAgentId`, `createdBy`, `updatedBy`. **TEU is not stored.**

**Layer 1 `ManualBooking`** (estimate): `bookingNumber` (MB-), `voyageId`, `agentId`, `customerId`, `polId`, `podId`, `polLegKey`, `podLegKey`, `partnerId`, `source`, **`cargoRows[]`** (`containerTypeId`, `quantity`, `rate`, `dg`, `dgValue`, `commodity`, `vgm` (estimated weight, kg), `rowTotal` = quantity × rate), **`totalFreight`**, **`totalTEU`**, `totalUnits`, `remarks`, **`status`** (same four values), `createdBy`, `updatedBy`.

**TEU per size/type today:** `utils/teuResolver.js#resolveTEU(size)` reads only the **size**: `20ft` → 1; `40ft`, `40HC`, `45ft` → 2; unknown → 1 (flagged). **Type (Dry/Reefer/…) is ignored.** Layer 1 stores `totalTEU` = Σ quantity × TEU(size) at write time; Layer 2 computes it when read (capacity, reports, `voyage-summary`). `ContainerType.teuFactor` (45ft = 2.25) is informational only and **disagrees** with the resolver for 45ft (S-21). Do not touch `teuResolver.js` (rule R10).

### 4.5 Existing per-voyage totals — which collections — *code, probed*
| Source | Endpoint / function | Gives | Population | Per voyage? |
|---|---|---|---|---|
| **New** `bookingSummary.service.js` | `GET /bookings/voyage-summary?tab=` (perm `bookings`; partner-scoped) | bookings, total freight, total TEU, per voyage, with round and voyage names | one tab at a time; **all statuses incl. Cancelled** | yes (probed: equals the lists) |
| Capacity engine | `GET /capacity/round/:roundId` (perm `rounds`, cached 60 s) | per voyage and per leg: loaded TEU split layer 1 / layer 2, peak onboard, remaining onboard | L1 + L2, **Pending, Confirmed, Final Loading**; Cancelled excluded; Cancelled voyages excluded | yes, but no booking counts and no freight |
| Reports | `GET /reports/round-pnl` (`getRoundPnL`) | "Revenue by Voyage": `totalRevenue`, `teus`, `vgm`, `bookingCount` | **Layer 2, Final Loading only** (ADR-2) | yes, inside the round report; not a standalone endpoint |
| Reports | `/reports/revenue`, `/reports/bookings`, `/reports/voyage-performance`, `/reports/booking-revenue-details` | revenue and booking lists by filters | Final Loading (revenue) | partly |
| Dashboard | `GET /dashboard/stats` (SuperAdmin by role identity) | last-30-day revenue, revenue by service | Final Loading | no |
| Ledger | `JournalEntryLine` with `voyageId` on the `4000` credit | **invoiced** revenue by voyage | issued invoices | yes, but **no endpoint** and no journal list UI (docs: missing) |

So "total TEU estimated and operational, total bookings, revenue" for a voyage would come from: `ManualBooking` (estimated: `totalTEU`, `totalFreight`, count), `Booking` joined to `ContainerType` (operational: count, TEU by size, `totalFreight`), `BookingItem` / `Invoice` / `JournalEntryLine` (invoiced). There is **no single endpoint** for it today.

### 4.6 Revenue sources and currencies — *code, docs*
| Stage | Right source | Why |
|---|---|---|
| **Estimated** revenue | `ManualBooking.totalFreight` (Layer 1), status ≠ Cancelled | it is the estimate; rate is optional, so some rows are 0 |
| **Booked** (operational) revenue | `Booking.totalFreight` (Layer 2); the project's "revenue" rule is **Final Loading only** (reports, dashboard) | matches the existing revenue reports |
| **Invoiced** revenue | issued `Invoice` / `InvoiceLine.amountMinor` (integer minor units), or ledger `4000` credits with `voyageId` | invoices are the legal amount; the ledger is the accounting truth. `BookingItem` is only the invoicing hand-off (rate × `loadedQty`), not a revenue figure |

**Currencies:** `Booking` and `ManualBooking` freight has **no currency field** (implicitly USD; the discharge list labels it "Rate (USD)"). Invoices are **USD only** (F-03 fixed by restriction). The ledger stores a currency per line (test DB: all USD) and `fx` on issue; **expenses can be in other currencies**, and a round with lines in another currency cannot be closed (`ROUND_HAS_OTHER_CURRENCY`). Any voyage page should show revenue in USD and say so.

### 4.7 Is the capacity engine safe to use for totals? — *code, unit, probed*
**FL-01 / BK-02 (onboard TEU always 0) is fixed**: `capacity.service.js` + `capacityLegs.logic.js` work per leg (unit: 8 tests; probed: bookings probe CP checks; fixed 2026-11-10). Safe for **TEU** per voyage and per layer. **Not** a safe source for "total bookings" (no counts) or revenue (no freight in its output), it **excludes Cancelled** while `voyage-summary` **includes** them (S-02), and it is cached for 60 s (invalidated by every booking/voyage write through `invalidateRoundCache`). It needs `rounds:read`, not `voyages:read`.

### 4.8 Who can see voyages and revenue today — *code*
| Who | Voyages page / API | Revenue |
|---|---|---|
| SuperAdmin | everything | dashboard (role identity), reports, ledger |
| Operations Manager (seed) | `voyages` CRUD | `reports` read + export, `invoices` read |
| Finance Officer (seed) | `voyages` read, `bookings` read | `reports`, `invoices`, `export`, accounting |
| Tracking Officer (seed) | `voyages` read, `tracking` CRUD | none (and `GET /services/active` is refused, S-14) |
| Viewer (seed) | read on every module except users, roles, ledger, accounting, partners, dashboard, auditLogs | reports read |
| **Partner user** | **refused** (`rbac` refuses every module but `bookings`); they reach `/bookings`, `/bookings/lookups`, `/bookings/voyage-summary` (their partner only) | no ledger, no reports, no invoices |

---

## 5. Security and access

| Check | Result | Evidence |
|---|---|---|
| Route RBAC coverage | 214 route declarations in 28 route files; **9 have no `rbac(...)` on the line or router** (script, listed below). Router-level guards: `locations`, `reports` | code (scan script) |
| Handlers without `rbac` | `auth/*` ×6 (`login`, `forgot-password`, `reset-password`, `logout`, `me`, `change-password`): public or self-service by design; `users POST /accept-invite`: public by design (token); `permissions GET /:roleId`: custom guard `ownRoleOrRoles` (own role, or needs `roles`); **`ledger GET /account-lookup`**: no `rbac`, see BK-01 | code |
| **BK-01** (ledger account-lookup) | **Fixed.** The handler refuses partner users inline (`isPartnerRole` → 403); staff may read it (master-data forms need it). Not a `rbac` call, so a scan lists it | code; the bookings probe partner checks passed (probed) |
| Partner-user boundary | `rbac` and `hasPermission` refuse every module but `bookings` for partner roles; booking services confine to their partner; bookings probe partner group passed. New `voyage-summary` applies the partner scope (probed: 2 of 142 for `partner@logistics.com`) | probed |
| **F-09** (`roles:update` can grant anything) | **Still open.** `saveByRoleId` validates modules and booleans only; a holder of `roles:update` can still give any role any permission (the own-role edit is refused, `notOwnRole`) | code |
| **xlsx advisory** | `xlsx` is a **frontend** dependency (`BookingImport.jsx` parses uploaded Excel in the browser), not a backend one as the old docs say; 2 high advisories (prototype pollution, ReDoS), **no fix available**. The backend uses `exceljs` (moderate, via `uuid`) | probed (audit) + code |
| New location endpoints | Router-level `rbac('locations')`; search is escaped (`escapeRegex`) and case-insensitive; `limit` capped at 100 (default 20); parent ids validated (400, not a CastError); operator-style `cityId[$ne]=x` gives 400; creating a landlocked country/city/port gives 400 | unit (8) + probed (25 e2e checks) |
| Default page size changed to 20 | Any caller that passed no `limit` now gets 20 rows, not everything. All in-repo callers were updated; the probes already passed `limit=100`. External callers: none known | code + probed |
| `voyage-summary` | `rbac('bookings')`, tab whitelist (400), id params validated, search escaped; registered before `/:id` | code + probed |
| Mongoose `sanitizeFilter` | The new **critical** advisory is about `sanitizeFilter` on `countDocuments`; the code base **does not use `sanitizeFilter`** anywhere (grep: not found), so the advisory is not a direct hole, but it is still a critical dependency flag (S-04) | probed (audit) + code |

---

## 6. Money paths

| Area | What is verified | What is not |
|---|---|---|
| Ledger (`LedgerService.post/reverse`, append-only, round lock, partial unique indexes) | unit: `ledger.test.js` (6), `money.test.js` (4). probed today: test-DB ledger is balanced in USD (79 lines, debit = credit = 48,046,600 minor, 38 posted entries) | transactions, the partial indexes and concurrency (`lockAgent`) are **not exercised** by any test run today |
| Invoicing (issue, notes, USD only) | unit: `billing.test.js` (5). code: issue posts Dr 1100 / Cr 4000 | no probe; `test:int` not run |
| Payments / settlements | docs + code; test data holds 7 settlements (probed count) | not probed, not unit tested beyond `agentAccounts.test.js` (10) |
| Agent cash (`lockAgent`, advances, netting) | unit: `agentAccounts.test.js` (10) | concurrency not tested |
| Partner settlement / shares / reserve | unit: `partnerSettlement.test.js` (5), `shares.test.js` (4) | no probe; one round `Closed` in the test DB (probed count) |
| Round close | docs + unit (settlement maths) | the transaction path is not exercised |

**`npm run test:int` did not run** (no replica set). It has 59 integration tests for exactly these paths and has not run since the V2-only conversion (F-12). **Treat all money paths as unit-tested only.** Nothing in this audit changed a money file.

---

## 7. Findings

### 7.1 Carried over (current status)
| ID | Sev | Status today | How I know |
|---|---|---|---|
| **BK-01** | Medium | **Fixed** (partner users refused in the handler) | code; partner probes pass (probed) |
| **BK-02** | High | **Fixed** (per-leg capacity) | unit (8) + probed (bookings probe) |
| BK-03 | Medium | **Fixed (2026-11-19, reports)**: the booking report now shows the booking's OWN POL/POD (`getBookingReport`; `getBookingRevenueDetails` already did; voyage-level reports correctly show the voyage's ports). **Still open (money code, not changed):** the invoice line snapshot (`invoiceV2.service.js buildLineItemSnapshot`) copies the VOYAGE's first/last port as `polName/podName`, so an intermediate-port booking is snapshotted with the voyage ports | code; not re-checked today |
| BK-04 | Medium | **Fixed (2026-11-19)**: `PUT /rounds/:id/legs` adds a warning per voyage with live bookings whose leg key was removed or whose leg now has another port (`staleBookingWarnings`); warn only, nothing blocked | code |
| BK-05 | Medium | **Fixed (2026-11-19)**: `PUT /bookings/:id/move` and `/bookings/manual/:id/move` {voyageId}: Pending/Confirmed only, same round, the target must run the booking's own POL then POD, staff only, round open, audit entry (UPDATE with old/new values) | code |
| BK-06 | Low | **Open**: tied runs need a manual pick per row | code |
| BK-07 | Low | **Open** (partner set Inactive keeps users in; partner L1 estimates count toward capacity; lookups list all agents) | code |
| BK-08 | Low | **Open**: duplicate containers only caught inside a file / same agent+round | code |
| BK-09 | Low | **Open**: import all-or-nothing at the write step, numbers burned | code |
| BK-10 | Low | **Superseded**: test DB was re-seeded; today 0 bookings and 0 manual bookings lack `polLegKey` | probed (DB count) |
| BK-11 | Info | **Open**: no frontend tests; new screens (C7, C8) not opened in a browser | probed (lint/build) |
| FL-01 | High | **Fixed** | as BK-02 |
| FL-02, FL-03, FL-04 | High | **Fixed** | unit (`importRules`, 8) + probed |
| FL-05 | Medium | **Fixed (2026-11-19)**: a Final Loading booking can be cancelled with a status-only update (both layers); refused 409 when it is on a live invoice (locked BookingItem or legacy invoice line); the Bookings table has a Cancel link on Final Loading rows. Old text: transition map lists Final Loading → Cancelled but the edit lock (line 215) fires first; only the import cancels | code |
| FL-06 | Medium | **Fixed (2026-11-19)**: cancelling a voyage cancels its bookings (probed VC); a round can no longer be set Completed while Pending or Confirmed bookings exist (409 `ROUND_HAS_OPEN_BOOKINGS`, Final Loading and Cancelled do not count). Old text: a round could be set Completed with live bookings | probed + code |
| FL-07 | Low | **Open**: BookingItem sync is fire-and-forget | code |
| FL-08 | Low | **Open**: legacy `/bookings/voyage-ports/:voyageId` reads the live route, not the round snapshot | code |
| FL-09 | Low | **Partly** (see BK-08) | code |
| FL-10 | Low | **Open** (by design) | code |
| FL-11 | Low | **Superseded** (voyages are user-added runs) | docs |
| FL-12 | Info | **Stale** | docs |
| FL-13 | Info | **Open**: doc/code differences (FL-05, FL-10, FL-14) | docs |
| FL-14 | Medium | **Fixed (2026-11-19)**: one Active round per vessel is enforced when a round is created as or becomes Active; a Planned round may exist beside an Active one (the unique index stays). Old text (owner decision): a vessel with an Active round cannot get even a Planned round (`assertVesselFree` runs on create, `round.service.js:171`) | code |
| RV-00…RV-37 | various | **Fixed 2026-10-26**; re-confirmed by the rounds-voyages probe (64/64 today) except RV-17, RV-36 below | probed |
| RV-17 | Low | **Superseded**: voyages are no longer generated | docs |
| RV-36 | Info | **Open**: `RouteLeg.agentId` is informational | code |
| RV-38 | Medium | **Fixed 2026-11-08** (`DEPENDENTS.voyage`) | probed (RV-38) |
| RV-39 | Low | **Mostly fixed** (created Scheduled; later states need an Active round unless override) | probed (RV-39/39b) |
| RV-40 | Low | **Fixed (2026-11-19)**: the service code is locked (409) once a round uses the service; the name stays editable. Old text: service code could be edited freely once rounds exist (`service.service.js` update) | code |
| RV-41 | Info | **Closed by design** | docs |
| F-01…F-08, F-10, F-11 | various | **Fixed 2026-10-25** | docs; not re-verified by `test:int` |
| F-09 | Low | **Fixed (2026-11-19, owner decision B)**: roles and permissions are written by the SuperAdmin only (`superAdminOnly` on POST/PUT/DELETE roles and PUT permissions); `roles:update` still allows reading; the Roles screens hide the write buttons for others. Old text: grant escalation by `roles:update` holders | code |
| F-12 | Info | **Open**: `test:int` not run since the V2-only conversion; no frontend tests | probed (cannot run here) |
| A-series | — | **Not found.** The only "A-7" is an action item in the archived 2026-10-24 audit (triage of V2 Medium findings M1–M13); nothing since shows that triage was done | docs |

### 7.2 New findings (S-series)
| ID | Sev | Evidence | Finding | One-line fix |
|---|---|---|---|---|
| **S-01** (fixed 2026-11-19) | Medium | code | `VoyageList.jsx`: headers read ETD, ETA, ATD, ATA but the cells render `etd`, `atd`, `eta`, `ata`, so the **ETA column shows ATD and the ATD column shows ETA**. Present since at least 2026-11-10 (still there in `54dc194`) | Swap the two cells (or the two headers) |
| **S-02** | Medium | code + probed | **Three different "totals per voyage"** now exist: capacity (Pending/Confirmed/Final Loading, Cancelled excluded), `voyage-summary` (every status **including Cancelled**), revenue reports (Layer 2, **Final Loading only**). The same voyage shows different counts and freight depending on the screen | Decide one rule per metric, label each screen with it, and build the Voyage page totals from one endpoint with an explicit status list |
| **S-03** (Fixed 2026-11-19: the three delete services call `assertNoDependents` with `DEPENDENTS.country/city/terminal`; 409 with counts; `location-delete-probe.js` 16/16) | Medium | code | `deleteCountry`, `deleteCity`, `deleteTerminal` check only child records (and route legs for terminals). They **do not use the new `DEPENDENTS.country/city/terminal`**, so a city referenced only by an agent, tracking record or round snapshot can be deleted, leaving a dangling id | Call `assertNoDependents` with the new entries in the three delete services |
| **S-04** (Fixed 2026-11-19: `npm update mongoose` 8.24.1 -> 8.24.10, critical advisory gone; `body-parser` 1.20.9; tests and probes green) | **High** | probed (audit) | Backend `mongoose` 8.24.1 has a **critical** advisory (`sanitizeFilter` not applied on `countDocuments`, GHSA-pcrw-h46h-c93h) plus 2 high (prototype/inherited-property issues). The code does not use `sanitizeFilter`, so exposure is limited, but a non-breaking fix exists | `npm audit fix` for mongoose (≥ 8.24.7), then `npm test` and the probes |
| **S-05** (Partly fixed 2026-11-19: non-breaking only - backend 12 -> 10 advisories (critical 1 -> 0, high 3 -> 2), frontend 11 -> 2 (`follow-redirects`, `zod`, typescript-eslint, `minimatch` fixed). Open: `nodemailer`, `sharp`, `exceljs`, `archiver` (+ `uuid`/`glob`/`minimatch` via them), `next` (owner will upgrade), `xlsx` (no fix); plan in `open-items-plan-2026-11-19.md`) | Medium | probed (audit) | Other advisories. Backend: `body-parser` high (DoS, fix available), `nodemailer` high (many; fix is a major upgrade), `sharp` high (libvips; major), `exceljs`/`uuid`/`archiver`/`glob`/`minimatch` moderate (majors). Frontend: `xlsx` high (**no fix**), `follow-redirects` high (fix available), `next` moderate (16.2.0–16.4.4, installed 16.4.2, fix available) | Apply the non-breaking fixes now; plan the majors; replace `xlsx` or confine it to trusted files |
| **S-06** (Partly fixed 2026-11-19: 12 errors -> 1. Both rules-of-hooks bugs (`ExportButton`, `VesselDetail`) fixed by moving the hooks above the early return; setState-in-effect fixed in `SearchBar`, `PermissionMatrix`, `RouteEditor`, `TrackingForm` by adjusting state during render; `<a>` -> `<Link>` in `error.jsx`; 4 unescaped quotes. Left on purpose: `PermissionContext.jsx` (login-critical)) | Medium | probed | Frontend lint **fails** repo-wide: 12 errors, 30 warnings. Real ones include hooks called conditionally (`ExportButton.jsx:29`, `VesselDetail.jsx:143`), `setState` inside effects (`SearchBar`, `PermissionContext`, `PermissionMatrix`, `RouteEditor`, `TrackingForm`), an `<a>` instead of `<Link>` (`app/error.jsx`), unescaped quotes (3 files). All pre-date the locations/booking work | Fix the two rules-of-hooks errors first; make lint part of the build gate |
| **S-07** | Medium | probed | `npm run build` **could not run** today (Next lock held by the running dev server), and the C6–C8 work was never built; the last claimed build is 2026-11-17 (docs) | Stop the dev server, run `npm run build`, fix what it shows |
| **S-08** | Medium | probed | **No browser pass has ever been done** on the redesigned UI (C1), the location tables and pickers (C6/C7) or the booking voyage rows (C8). Everything frontend is lint and 200-OK only | Do one manual pass; list the clicks in section 9 |
| **S-09** (Fixed 2026-11-19 on the TEST DB: `scripts/drop-old-location-indexes.js --apply` dropped the 4 indexes; models do not recreate them; production not touched) | Low | probed | The old single-field indexes (`cities.countryId_1`, `ports.cityId_1`, `ports.countryId_1`, `terminals.portId_1`) are **still in the DB** next to the new compound ones; Mongoose does not drop them | One-off `dropIndex` for the four, or ignore (extra write cost only) |
| **S-10** | Low | code | Location search is a case-insensitive "contains" regex (cannot use an index) and each list also runs `countDocuments`. Fine at 49k cities; slow if the table grows to the 148k-city whole-world set | Keep a prefix search or add a text/collation index if it grows |
| **S-11** | Info | code + probed | Coastal validation is **country level only**. A city or port created by hand 500 km inland in a coastal country is accepted. The 50 km rule applies only to the seed data | Owner decision: add a distance check on create, or accept |
| **S-12** | Low | code + probed | Seed data quality: `terminals.json` is hand-written (24 names, 10 ports), no source; 9,235 ports include every LOCODE function-1 harbour; Karachi now has **two** ports, old `PKKHA` (referenced) and new `PKKHI` (both present, probed) | Have the owner confirm the terminal names; decide what to do with `PKKHA` |
| **S-13** (Fixed 2026-11-19: `hooks/usePorts.js` deleted, no importer) | Low | code | `hooks/usePorts.js` is unused and calls `locationsService.ports`, which does not exist | Delete the file |
| **S-14** (fixed 2026-11-19) | Low | code | The Voyages page calls `GET /services/active`, which needs `services:read`. The seeded **Tracking Officer** has `voyages:read` only, so the service filter fails for that role | Serve the filter from a `voyages`-gated lookup, or grant `services:read` |
| **S-15** (Fixed 2026-11-19: docs/01 pagination + LocationPicker + delete rule, docs/03/04/08 voyage summary and page, xlsx noted as a frontend dependency in CLAUDE.md) | Low | docs | Docs are behind: `docs/01` says nothing about pagination, `docs/04` and `docs/08` do not mention `voyage-summary`, `CLAUDE.md` "Last updated" and `sprints/STATUS.md` lack the pagination and booking-view entries, and old docs list `xlsx` as a backend dependency | Update the four docs |
| **S-16** (Fixed 2026-11-19: bookings and rounds-voyages probes write to `<repo>/probe-results/` (git-ignored); the two tracked result files were deleted from the tree) | Info | probed | Probes rewrite tracked `*.result.json` files, and any write under `backend/` restarts nodemon, which kills a probe run in progress | Write probe results outside `backend/` (or ignore them in nodemon and git) |
| **S-17** | Medium | probed | The test DB is full of probe leftovers (section 8): e.g. 14 `E2E` ports, 13 services, 23 vessels, 24 customers, 10 agents, 5 cancelled `ZR…` rounds. They skew every list and count | Owner: `seed:test-data -- --reset` when convenient (drops the DB; not run by me) |
| **S-18** | Low | code | `voyage-summary` loads all voyage ids of a round for the round filter and aggregates bookings with `$match` + `$group` (no pagination in Mongo, rows are paged in memory). Fine for hundreds of voyages | Move paging into the pipeline if voyages reach the thousands |
| **S-19** (fixed 2026-11-19) | Low | code | The `voyages` list API populates round as number and name only and never the vessel; a Voyage details page needs round dates, vessel, and booking totals | Add a `GET /voyages/:id` that also populates `Round.vesselId` (vessel name) |
| **S-20** (decided 2026-11-19: voyage page shows capacity under `voyages:read`) | Info | code | The capacity numbers need `rounds:read`, not `voyages:read`; a role that sees voyages but not rounds cannot see capacity | Decide which permission gates voyage-level capacity |
| **S-21** | Info | code | Two TEU values for a 45 ft container: `ContainerType.teuFactor` = 2.25 (export, informational) vs `resolveTEU` = 2 (capacity, reports, summary) | Document it; do not unify without an R10 decision |

---

## 8. Data state (Atlas TEST database `test`, read-only counts after the probes)

| Collection | Count | Collection | Count |
|---|---|---|---|
| countries | 206 | rounds | 9 |
| cities | 49,324 | voyages | 14 |
| ports | 9,251 | bookings (L2) | 142 |
| terminals | 24 | manual bookings (L1) | 16 |
| services | 16 | booking items | 22 |
| routes | 16 | invoices | 10 |
| route legs | 44 | invoice lines / settlements | 20 / 7 |
| agents | 16 | journal entries / lines | 38 / 79 |
| vessels | 26 | expenses | 34 |
| partners | 9 | tracking records | 14 |
| customers | 24 | users / roles | 10 / 6 |

- **Bookings by status:** Final Loading 117, Confirmed 9, Pending 14, Cancelled 2. Discharge: 21 Discharged, 3 Remaining, 118 not assessed. Two bookings and one estimate carry a partner label.
- **Rounds by status:** Completed 1, Active 2, Planned 1, **Cancelled 5**. `closeStatus`: 1 Closed, 8 Open. 3 are `TEST Round …` from the seed.
- **Invoices:** Issued 1, Paid 3, Partially Paid 1, Overdue 4, Draft 1.
- **Probe leftovers** (`E2E` / `ZS` / `ZV` / `ZR` records left by `e2e-masterdata` and the two probes): 14 ports, 13 services, 23 vessels, 10 agents, 24 customers, 6 partners, 6 container types, 5 rounds (named `E2E`/`ZS`/`ZV` or numbered `ZR`), 5 voyages. One probe port is referenced by an agent.
- **Old-shape data:** none found: 0 rounds without `routeSnapshot`, 0 with `v2:false`, 0 voyages without `portCalls` or `direction`, 0 bookings or estimates without `polLegKey`. (The 2026-11-10 re-seed replaced the old shape.)
- **Ports:** 9,251 (the seeded sea ports, the 5 test-data ports, Karachi `PKKHA`, and probe ports; I did not split the exact numbers); `PKKHA` and `PKKHI` both exist. Landlocked countries present: 0.
- **Ledger:** all lines USD; balanced (section 6).

---

## 9. What was and was not verified

| Area | Verified (how) | Not verified |
|---|---|---|
| Backend pure logic | **130 unit tests pass** | n/a |
| Master data, locations API | **136 e2e checks pass** (probed) | the landlocked refusal is not in a stored probe (done ad hoc) |
| Rounds, voyages, bookings API | **64 + 45 probes pass** (probed) | `probes-1/2` (need a local replica set) |
| Voyage summary | unit (6) + an ad hoc HTTP check (19/19), not stored in the repo | no stored probe |
| Money (ledger, invoices, settlement, close) | unit only; the ledger is balanced (probed query) | **`test:int` not run**; no probe for invoices, payments, settlement, close |
| Security | RBAC scan (code), partner probes, location endpoint checks, `npm audit` | no penetration test; F-09 unchanged |
| Frontend | lint (fails, S-06) | **`build` did not run; no browser pass; no frontend tests** |
| Performance | none | no load test |
| Docs claims (e.g. 2026-11-17 build OK, seed 29/29) | read only | not re-run |
| Production | **not touched** | the cleanup script's production path, backup restore |

I never wrote "works" for anything that was only read.

---

## 10. Prioritized to-do list

1. **S-04 / S-05:** `npm audit fix` for mongoose, body-parser, follow-redirects and next; re-run `npm test`, e2e and both probes. Plan the major upgrades (nodemailer, sharp, exceljs, archiver); decide about `xlsx`.
2. **S-07 + S-06 + S-08:** stop the dev server, run `npm run build`, fix the two rules-of-hooks lint errors, and do **one browser pass** (locations tables and pickers, bookings voyage rows, voyages page, redesigned screens).
3. **Run `npm run test:int`** on a local replica set (needs MongoDB with a replica set or Docker). It is the only check on the money paths.
4. **S-01** (swap the ETA/ATD cells) and **S-03** (use `DEPENDENTS` in the location delete services).
5. **S-02:** decide the status rule for each voyage total (estimated, booked, invoiced) before building the Voyage details page.
6. **Voyage details page** (S-19): `GET /voyages/:id` with the vessel, port calls, and one totals endpoint (section 4.5 and 4.6).
7. **S-17:** clean the test DB with `seed:test-data -- --reset` (owner), then re-run the probes.
8. Medium carry-overs in order: **BK-03**, **FL-06** (round Completed with live bookings), **BK-04**, **BK-05**, **FL-05**, **F-09**.
9. **S-15:** update the docs; add stored probes for the landlocked refusal and `voyage-summary`.

**Decisions for the owner**
- Which status set counts in "total bookings / TEU / revenue" for a voyage (S-02).
- Whether to add a distance check on creating a city or port (S-11), and what to do with `PKKHA` / `PKKHI` (S-12).
- Whether to confirm or replace the hand-written terminal list (S-12).
- Grant policy for `roles:update` (F-09) and the vessel / Planned round rule (FL-14).
- Whether to replace `xlsx` (S-05) and when to take the major dependency upgrades.
- When to reset the test DB (S-17), and whether to provide a local replica set for `test:int`.
