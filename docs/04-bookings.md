# 04 — Bookings

Module `backend/src/modules/bookings`, route `/bookings`, perm module `bookings`. UI: `/bookings`, `/bookings/[id]`, `/bookings/import`, `/bookings/new-manual`, `/bookings/manual/[id]`.

Two layers, deliberately separate:

| | **Layer 2 — `Booking`** | **Layer 1 — `ManualBooking`** |
|---|---|---|
| Meaning | Operational: **one row = one container** | Estimated / commercial reservation with cargo rows |
| Number | `BK-000001` | `MB-000001` |
| Created by | form or Excel import | form only |
| Counts toward capacity | Pending, Confirmed, Final Loading | Pending, Confirmed, Final Loading (planning indicator) |
| Counts as **revenue** | **Final Loading only** (reports, dashboard, invoicing) | never |
| Invoiced | yes (via BookingItems) | no |

## Schema `Booking`
`bookingNumber` (unique), `voyageId`, `agentId`, `polId`, `podId` (**always copied from the voyage**, never client-sent, immutable), `containerTypeId`, `containerNumber` (upper-case, **import match key**), `freightRate` (decimal, per container), `totalFreight` (**server-set = freightRate**), `shipper`, `consignee`, `carrierName`, `commodity`, `vgm` (kg), `dg` (UI "Hazardous") + `imdgCode` (required when dg), `containerStatus` `Full|Empty`, `remarks`, `status`.
- `dischargeStatus` `Discharged|Remaining|null` + `dischargedAt` — **independent of `status`**, written only by the discharge import.
- V2 additive: `billToPartyId` (bill someone other than the agent), `shipperSource` `Agent|Direct`, `paymentTerm` `Prepaid|Collect` (informational only), `collectAgentId`.
Indexes: `bookingNumber` unique, `containerNumber`, `createdAt`, `(voyageId,status)`, `(agentId,status)`.

## Schema `ManualBooking`
Header `bookingNumber, voyageId, agentId, polId, podId (from voyage), remarks, status`; `cargoRows[]` each `{containerTypeId, quantity ≥1, rate, dg, dgValue (free text), commodity, vgm, rowTotal = quantity×rate}`; server totals `totalFreight`, `totalTEU` (Σ qty × TEU(size)), `totalUnits`. Unknown container sizes default to 1 TEU and return `_teuWarnings`.

## Status flow (both layers)
`Pending → Confirmed → Final Loading`, any → `Cancelled` (L2 map: Pending→Confirmed|Final Loading|Cancelled; Confirmed→Final Loading|Cancelled; Final Loading→Cancelled; Cancelled terminal).
`Final Loading` and `Cancelled` bookings **cannot be edited**; only status moves allowed by the map (Final Loading → Cancelled). Create with status `Cancelled` is coerced to Pending.

## Routes
| Method | Path | Perm |
|---|---|---|
| GET/POST | `/bookings/manual`, GET/PUT/DELETE `/bookings/manual/:id` | `bookings` |
| GET | `/bookings/import/template-columns`, `/bookings/import/template` | `bookings:import` |
| POST | `/bookings/import/preview` | `bookings:import` |
| POST | `/bookings/import/save` | `bookings:import`; **plus `update` and `delete`** on bookings when `importType` is `finalLoading` or `discharge` (SuperAdmin exempt) |
| GET | `/bookings/voyage-ports/:voyageId` | `bookings` |
| GET | `/bookings/export/discharge-list?voyageId=&agentId=` | `bookings:export` |
| GET/POST | `/bookings`, GET/PUT/DELETE `/bookings/:id` | `bookings` |
Fixed-path routes are declared before `/:id`. List filters: `page, limit, search, voyageId, agentId, status (comma list), dateFrom, dateTo, dischargeStatus`.

## Create / update / delete rules (Layer 2)
- **Create:** round-lock check; voyage must exist and not be Cancelled/Completed; POL/POD set from voyage; `totalFreight = freightRate`; optional capacity pre-flight (env `ENABLE_CAPACITY_ENFORCEMENT`). Then `invalidateRoundCache` and `bookingItem.scheduleSync({voyageIds})`.
- **Update:** `voyageId`, `polId`, `podId`, `bookingNumber`, `totalFreight`, `dischargeStatus/At` are stripped from client input.
- **Delete (hard):** refused if any non-Cancelled **Invoice** has the booking in `lineItems` (ownership lives only on the invoice side; Booking has no invoice field). Also round-lock check.
- Every mutation re-syncs BookingItems (see [06](06-invoices.md)).
- **ManualBooking delete** has no guard beyond the round lock; Agents cannot be deleted while manual bookings exist.

## Excel import (`bookingImport.service.js`)
Three `importType`s share one template. Column list is the single source of truth `TEMPLATE_FIELDS` (served by `/import/template-columns`; the UI guide card reads it): Container Number*, Container Type*, Container Size, Container Status* (Full/Empty), POL*, POD*, Rate*, Booking Number, Shipper, Consignee, Carrier Name, Commodity, VGM, Hazardous (Yes/No), IMDG Code (required if Hazardous). Header aliases are tolerated.

**Scope = (Round + Agent).** There is no file-wide voyage selector (except discharge).

### `booking` and `finalLoading` — preview then save
1. **Voyage resolution per row** against the Round's non-Cancelled voyages by POL/POD pair: exactly one match → `resolved`; none → `unresolved`; several → `ambiguous`. The user can set `voyageOverrideId` per row for unresolved/ambiguous rows (must be an active voyage of that Round).
2. Validation: container number, POL, POD, container type (code or size must exist), Rate ≥ 0, Container Status Full/Empty, IMDG when hazardous, POL ≠ POD.
3. Existing booking matched by `containerNumber` within the Round's voyages for that agent → row status `update`; else `valid` (booking) / `new` (finalLoading). Row statuses: `invalid | unresolved | ambiguous | valid | new | update`.
4. **Save** (round-lock check; only valid/new/update rows): inserts with `insertMany` using `nextNumberBatch('booking')` (blank Booking Number is auto-generated), status `Pending`, `polId/podId` copied from the resolved voyage (an auto-correction note goes into `remarks` when the Excel text disagreed with a manually chosen voyage); updates existing rows.
5. **Final Loading reconciliation (Round + Agent):** every imported container → `Final Loading`; every **other** non-Cancelled booking of that agent anywhere in the Round → `Cancelled`. **Before anything is written**, the save is refused with `409 BOOKING_INVOICED` (listing invoice numbers and containers) if any booking that would be cancelled sits on a non-cancelled invoice line not already flagged `orphaned` — raise a credit note or cancel the invoice first (audit F-07, fixed 2026-10-25). The older `orphaned:true` line flag remains as a fallback. Then `invalidateRoundCache(roundId)` and `scheduleSync({roundId})`.
Result: `{created, updated, failed, markedFinalLoading, cancelled, total}`.

### `discharge` — match-only
Requires an explicit **Voyage** (`voyageId`) and Agent. Preview classifies each row `match | not-found | wrong-voyage | wrong-status | port-mismatch` (booking must already be `Final Loading` on that voyage; row POL/POD text must match the voyage's ports — hard error, never auto-corrected). Save: matched bookings → `dischargeStatus:'Discharged'` (+`dischargedAt`); every **other** Final Loading booking of that agent on that voyage → `'Remaining'`. `status` is never touched and nothing is created. Re-running reflects the latest file. Capacity treats `Remaining` containers as still onboard.

## Discharge list export
`GET /bookings/export/discharge-list` — ExcelJS workbook of **Final Loading** bookings for one Voyage + Agent (Container No., size, type, POL, POD, status, carrier, shipper, consignee, commodity, VGM, Hazardous, IMDG, Rate). 404 if none. Filename `Discharge_List_{voyage}_{agent}.xlsx`.

## Where the data goes next
- Final Loading Layer 2 bookings → `BookingItem` groups → invoices ([06](06-invoices.md)); handling charges per container move ([11](11-accounting.md)).
- Capacity engine ([03](03-rounds-voyages.md)); reports and dashboard revenue ([08](08-reports-dashboard.md)).
