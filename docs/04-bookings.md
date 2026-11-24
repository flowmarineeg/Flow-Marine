# 04 — Bookings

Module `backend/src/modules/bookings`, route `/bookings`, perm module `bookings`. UI: `/bookings`, `/bookings/[id]`, `/bookings/import`, `/bookings/new-manual`, `/bookings/manual/[id]`.

Reworked **2026-11-10** (`sprints/bookings-2026-11-10-sprint.md`, owner brief `prompt.txt`): the voyage is no longer chosen — it is **found by the server from the booking's own POL/POD**, a booking can carry a **Partner** label, partner users can enter their own bookings, the import is hardened (FL-02/03/04) and the discharge list is by **POL → POD**.

Two layers, deliberately separate:

| | **Layer 2 — `Booking`** | **Layer 1 — `ManualBooking`** |
|---|---|---|
| Meaning | Operational: **one row = one container**, full details | Estimated reservation with cargo rows; **light data**: used for estimated capacity, container count and type |
| Number | `BK-000001` | `MB-000001` |
| Created by | form or Excel import | form only |
| Required | agent, round, POL, POD, container no./type/status, rate, IMDG when hazardous | agent, round, POL, POD, ≥1 cargo row with container type + quantity (**rate optional**, default 0) |
| Counts toward capacity | Pending, Confirmed, Final Loading | same (planning indicator) |
| Counts as **revenue** | **Final Loading only** (reports, dashboard, invoicing) | never |

## Voyage auto-assignment (`voyageMatch.logic.js`, `bookingVoyage.service.js`)
- A voyage is a run over the round's legs (`docs/03`); `portCalls[]` lists its ports in travel order, so a westbound run lists them in reverse. A voyage **carries** a booking when it visits **POL and then, later in its run, POD**. Direction is implicit: P2→P3 matches the eastbound run, P3→P2 the westbound one; intermediate ports are fine.
- Repeated ports (A-B-C-A): the nearest POD after the POL; `polLegKey`/`podLegKey` (stored on the booking) pin the exact call and can be sent to disambiguate.
- Only live voyages of a Planned/Active, not closed round are candidates (Cancelled/Completed are skipped).
- One candidate → assigned. Several → ranked: not yet departed from POL first (call `etd`, else voyage status), then earliest departure; a strictly best one is assigned (`ranked: true`), a tie is **ambiguous**.
- Ambiguous: `POST /bookings` answers **`409 VOYAGE_AMBIGUOUS`** with `errors[]` = the candidates `{voyageId, voyageNumber, direction, status, polLegKey, podLegKey}`; resend with `voyageId` = the pick. `voyageId` is **only accepted as a pick among candidates** (a voyage that does not run POL → POD is `400`; it never forces anything).
- None → `400 VOYAGE_UNRESOLVED`. POL = POD → `400`.
- `POST /bookings/resolve-voyage {roundId, polId, podId}` previews the outcome without writing (form hint).
- Capacity is **per leg** (`docs/03`): a booking holds the legs between its POL and POD on its voyage, both layers count, and create/estimate pre-flight checks every leg (env `ENABLE_CAPACITY_ENFORCEMENT`).
- **Cancelling the voyage cancels its bookings** (L1 and L2, same transaction; refused while one is on a live invoice).

## Schema `Booking`
`bookingNumber` (unique), `voyageId` (server-assigned), `agentId`, `polId`, `podId` (**the booking's own ports**, chosen by the user / read from the Excel row, validated against the voyage's run, immutable after create), `polLegKey`, `podLegKey`, `containerTypeId`, `containerNumber` (upper-case, **import match key**), `freightRate` (per container), `totalFreight` (**server-set = freightRate**), `shipper`, `consignee`, `carrierName`, `commodity`, `vgm` (kg), `dg` (UI "Hazardous") + `imdgCode` (required when dg), `containerStatus` `Full|Empty`, `remarks`, `status`.
- **Partner:** `partnerId` (ref Partner, null = none), `source` `Staff|PartnerUser`. Reference label only, **no effect on money** (commission, settlement, invoices unchanged).
- `dischargeStatus` `Discharged|Remaining|null` + `dischargedAt` — **independent of `status`**, written only by the discharge import.
- V2 additive: `billToPartyId`, `customerId`, `shipperSource`, `paymentTerm`, `collectAgentId`.
Indexes: `bookingNumber` unique, `containerNumber`, `createdAt`, `(voyageId,status)`, `(agentId,status)`, `(partnerId,status)`, `(voyageId,polId,podId)`.
Mass assignment: create/update copy only schema fields minus `bookingNumber, voyageId, polId, podId, polLegKey, podLegKey, totalFreight, partnerId, source, dischargeStatus, dischargedAt, status(create)`.

## Schema `ManualBooking`
Header `bookingNumber, voyageId (server-assigned), agentId, customerId, polId, podId (own ports), polLegKey, podLegKey, partnerId, source, remarks, status`; `cargoRows[]` each `{containerTypeId, quantity ≥1, rate (optional, default 0), dg, dgValue, commodity, vgm, rowTotal = quantity×rate}`; server totals `totalFreight`, `totalTEU` (Σ qty × TEU(size)), `totalUnits`. Unknown container sizes default to 1 TEU and return `_teuWarnings`.

## Layer 1 `kind`: Estimate or Allocation (2026-11-19)
`ManualBooking.kind` = `Estimate` (default) or `Allocation` (a slot reserved for an agent on a voyage; **the agent stays required**, the partner is the optional label). It is set at creation and **cannot be changed** afterwards (`PUT` with `kind` = 400); partner users always create estimates. Pure rules in `kind.logic.js`.
- **Old estimates have no `kind` and need no migration.** They read as Estimate at read time (`withKind` on lists and `getById`), and every query asks `kind != "Allocation"` for estimates, never `kind == "Estimate"`. `GET /bookings/manual?kind=Estimate|Allocation` filters; any other value is a 400.
- An allocation **counts like any Layer 1 estimate**: in the capacity engine (`capacity.service.js` is unchanged), in Estimated TEU and in Estimated revenue. The Voyage page shows it as an **"of which allocation"** line (bookings count, TEU, revenue). It is part of Estimated, never added on top. Layer 1 table: a **Type** column and a Type filter (Bookings page and Voyage page).
- **Known limit: an allocation is not consumed or released when real bookings arrive.** Layer 1 and Layer 2 both count in capacity, so the space is counted twice until someone lowers or cancels the allocation by hand. Release dates, waiting lists and consumption are a later phase. A partner-only allocation (no agent) is not possible.
- **Port filter** `portLegKey` / `portId` on `GET /bookings` and `GET /bookings/manual` (bookings whose POL or POD is that port call; leg key first, port id for old data; bad id = 400) feeds the Voyage page port strip.

## Moving a booking, cancelling a loaded one, report ports (2026-11-19)
- **Move (BK-05).** `PUT /bookings/:id/move` and `PUT /bookings/manual/:id/move` with `{ voyageId }` (staff only; partner users are refused). Only **Pending or Confirmed** bookings move, only to another voyage of the **same round**, which must run the booking's own POL then POD (same check as create, so a Cancelled/Completed or wrong-direction voyage is refused), and the round must be open. Ports and status do not change; the capacity cache is cleared; the audit log gets an UPDATE entry with the old and new document (it is a PUT on purpose: the audit middleware logs POST as CREATE). Pure rules in `moveRules.logic.js`. Capacity is **not** pre-checked against the target voyage (create does that in `warn`/`strict` mode).
- **Cancel a Final Loading booking (FL-05).** `PUT` with `{ status: "Cancelled" }` **and nothing else** is accepted on a Final Loading booking (any other edit is still refused). Layer 2 is refused with 409 when the booking is on a live invoice (a locked `BookingItem` that contains it, or a non-cancelled legacy invoice line); Layer 1 is never invoiced. Revenue (Final Loading only) drops accordingly. The Bookings table (Operational tab) has a Cancel link on Final Loading rows. Pure rule in `cancelRules.logic.js`.
- **Report ports (BK-03).** The booking report (`/reports/bookings`) shows the booking's **own** POL → POD (a column in the report). The voyage-level reports show the voyage's ports. The invoice line snapshot (`buildLineItemSnapshot`, money code) still copies the **voyage's** ports: open, see the audit.

## Status flow (both layers)
`Pending → Confirmed → Final Loading`, any → `Cancelled` (L2 map: Pending→Confirmed|Final Loading|Cancelled; Confirmed→Final Loading|Cancelled; Final Loading→Cancelled; Cancelled terminal). `Final Loading` and `Cancelled` bookings **cannot be edited** (the Final Loading→Cancelled move is only reachable through the Final Loading import, FL-05 open). Create with status `Cancelled` is coerced to Pending.

## Routes
| Method | Path | Perm |
|---|---|---|
| GET/POST | `/bookings/manual`, GET/PUT/DELETE `/bookings/manual/:id` | `bookings` |
| GET | `/bookings/lookups?roundId=` | `bookings` read — agents, open rounds, container types, the round's ports (+ `legs[]` per port), partners (staff only). **Slim, no bank/money data**; every booking screen reads its pick-lists here |
| POST | `/bookings/resolve-voyage` | `bookings` read — preview, no write |
| GET | `/bookings/import/template-columns`, `/bookings/import/template` | `bookings:import` |
| POST | `/bookings/import/preview` | `bookings:import` |
| POST | `/bookings/import/save` | `bookings:import`; **plus `update` and `delete`** on bookings when `importType` is `finalLoading` or `discharge` (SuperAdmin exempt) |
| GET | `/bookings/discharge-list?roundId=&polId=&podId=&agentId=&voyageId=` | `bookings` read, **staff only** |
| GET | `/bookings/export/discharge-list` (same query) | `bookings:export`, **staff only** |
| GET | `/bookings/voyage-ports/:voyageId` | `bookings` (legacy) |
| GET | `/bookings/voyage-summary?tab=&roundId=&…` | `bookings` — one row per voyage with bookings of that kind (kept; the screens no longer use it) |
| GET | `/bookings/vessel-summary?tab=&search=&agentId=&partnerId=&status=&includeClosed=&page=&limit=` | `bookings` — one row per vessel (rounds, voyages, bookings, total TEU, freight); see "Bookings page: vessel first" |
| GET | `/bookings/round-summary?tab=&vesselId=\|roundId=&…` | `bookings` — one row per round of a vessel (or the one round) |
| GET/POST | `/bookings`, GET/PUT/DELETE `/bookings/:id` | `bookings` |
Fixed-path routes are declared before `/:id`. List filters: `page, limit, search (booking no, shipper, consignee, container), roundId, voyageId, agentId, partnerId, status (comma list), dateFrom, dateTo, dischargeStatus`.

## Bookings page: vessel first (2026-11-23; sprint `sprints/vessel-first-navigation-2026-11-23-sprint.md`)
Each section (**Estimated** = Layer 1, **Operational** = Layer 2, **Discharged**, **Remaining**) opens on vessels, then rounds, then the existing booking tables. The place is in the URL: `/bookings?tab=estimated|operational|discharged|remaining&vessel=&round=&voyage=&closed=` (an old `?tab=manual` still lands on Estimated), so Back goes up one level.
- **Level 1 `vessel-summary`**, **level 2 `round-summary`**, **level 3** = `GET /bookings` / `/bookings/manual` with `roundId` (+ optional `voyageId` from the Voyage filter, staff only). `bookingSummary.service.js` has one filter builder (`bookingMatch`, same rules and partner scope as the lists) and one totals step (`totalsByVoyage`: Layer 1 stored `totalTEU`; Layer 2 container size through `teuResolver`) used by the voyage, round and vessel summaries, so a vessel row = the sum of its round rows = the list totals = the `voyage-summary` rows (pure roll-ups in `bookingSummary.logic.js`: `rollupRounds`, `rollupVessels`).
- **Which rounds:** Planned and Active; Completed only with **`includeClosed`**; Cancelled never. `includeClosed` defaults to **ON for Discharged / Remaining** (discharge happens at the end of a round) and **OFF for Estimated / Operational**; an explicit `1/0` wins; the response echoes the value in `pagination.includeClosed`; the screen has an "Include completed rounds" checkbox.
- **Zero rows:** Estimated and Operational also list vessels/rounds with **0 bookings** (a round needs at least one non-Cancelled voyage) so booking can start there. Discharged / Remaining list only what has bookings. Any booking-level filter (search, agent, partner, status) or a partner user switches zero rows off.
- **Partner users:** only their own partner's bookings, so only vessels where they have a booking of that kind; never the rest of the fleet.
- Level 3 Export sends `roundId`; the Excel export (`bookings`, `manualBookings`) turns it into all voyages of the round, an explicit `voyageId` wins ([09](09-export.md)).

## Create / update / delete rules
- **Create (L2 and L1):** body `{roundId, polId, podId, agentId, …}` (+ optional `polLegKey/podLegKey`, `voyageId` pick, `partnerId`). Round must exist, be Planned/Active and not closed; the voyage is resolved as above; round-lock; optional capacity pre-flight (env `ENABLE_CAPACITY_ENFORCEMENT`); then `invalidateRoundCache` and `bookingItem.scheduleSync({voyageIds})`.
- **Update:** voyage, ports, leg keys, `bookingNumber`, `totalFreight`, `dischargeStatus/At`, `source` are stripped; staff may change `partnerId` (`null` clears). A different route = a new booking.
- **Delete (hard):** refused if any non-Cancelled **Invoice** has the booking in `lineItems`; round-lock check. ManualBooking delete has no guard beyond the round lock.
- Every L2 mutation re-syncs BookingItems (see [06](06-invoices.md)).

## Partner label and partner users
- **Label:** any booking (L1/L2, form or import) can carry `partnerId` = the Partner that gave us the booking. Staff set it (an Active partner); the Excel import takes one optional partner for the whole file. A partner with labelled bookings or users cannot be deleted (`DEPENDENTS.partner`).
- **Partner user:** `Role.isPartnerRole` + `User.partnerId` (required for such a role, forbidden otherwise; the flag cannot be flipped while users hold the role). See [10](10-users-roles-rbac.md). Enforced in the API:
  - `rbac` refuses every module except `bookings` (whatever the permission rows say); the nav shows only Bookings.
  - Bookings list/get/create/update/delete are confined to `partnerId = their partner` (another partner's or an unlabelled booking reads as `404`); filters on another partner are ignored.
  - Create forces `partnerId` = theirs, `source: PartnerUser`, status `Pending`; they cannot change status, agent or label, cannot delete non-Pending bookings, cannot use the discharge list/export, and can only import `importType: booking` (rows labelled with their partner; a container already booked by someone else is rejected).

## Excel import (`bookingImport.service.js`, `importRules.logic.js`)
Three `importType`s share one template (`TEMPLATE_FIELDS` is the single source, served by `/import/template-columns`): Container Number*, Container Type*, Container Size, Container Status* (Full/Empty), POL*, POD*, Rate*, Booking Number, Shipper, Consignee, Carrier Name, Commodity, VGM, Hazardous (Yes/No), IMDG Code (required if Hazardous). Scope = **(Round + Agent)**; flow Agent → Round → import type → (partner) → file.

### `booking` and `finalLoading`
1. **Every row is analysed server-side** (`analyseRows`) from its raw fields — preview and save share it. **Save never trusts the preview echo** (`_resolved*`, `_rowStatus`, `_existingId` are ignored): ports, container type and voyage are re-resolved from the text (FL-02). Round must be bookable and open.
2. Per row: required fields, container type, POL/POD found in the system, POL ≠ POD, **voyage by POL/POD** (`voyageMatch`; `voyageOverrideId` is only the pick among an ambiguous row's candidates, validated against them).
3. Existing booking = same container number, same agent, in the round's voyages; a live booking wins, a Cancelled one is history (a new booking is created, never revived). `classifyExisting` (FL-03):
   - none → `valid` (booking) / `new` (finalLoading);
   - Pending/Confirmed and not invoiced → `update` (voyage, ports, rate, type, details follow the row);
   - **Final Loading or on a live invoice** → `invalid` for `booking`, `unchanged` for `finalLoading` (stays in the manifest, **nothing is overwritten**);
   - partner user and the booking is not theirs → `invalid` "already booked";
   - a container twice in one file → the later rows are `invalid`.
   Row statuses: `invalid | unresolved | ambiguous | valid | new | update | unchanged`.
4. **Save runs in one transaction** (all or nothing): `insertMany` (blank Booking Number auto-generated, status `Pending`, partner label from the file / the partner user), updates (only Pending/Confirmed), and for Final Loading the manifest steps below. A failed write rolls everything back.
5. **Final Loading = a manifest (FL-04).** Because it cancels every booking missing from the file, **every row must be valid** (`valid/new/update/unchanged`): one invalid/unresolved/ambiguous row refuses the whole file (`400 IMPORT_ROWS_INVALID`, nothing changed). Then, inside the transaction: manifest bookings → `Final Loading`; every other **live** booking of that agent anywhere in the Round → `Cancelled`; **before** cancelling, `409 BOOKING_INVOICED` if one of them is on a live invoice line not already `orphaned` (credit note first, F-07). Then `invalidateRoundCache` and `scheduleSync({roundId})`.
Result: `{created, updated, unchanged, failed, markedFinalLoading, cancelled, total}`.

### `discharge` — match-only (reworked)
Scope = **Round + Agent + POD (the port where the discharge happened) [+ POL] [+ Voyage]**: the Final Loading bookings that end at that POD. Preview classifies each row `match | not-found | wrong-voyage | wrong-status | port-mismatch` (a container booked to another port is `port-mismatch`, never changed; the row's POL/POD text must agree with the booking's own ports). Save re-analyses the rows, then in one transaction: matched → `dischargeStatus:'Discharged'` (+`dischargedAt`); every **other** Final Loading booking **of the same scope** → `'Remaining'`. A container booked to a later port is neither Discharged nor Remaining here. `status` is never touched, nothing is created. Re-running reflects the latest file. Staff only (partner users: 403).

## Discharge list (screen + Excel)
`GET /bookings/discharge-list` and `GET /bookings/export/discharge-list` take `roundId, polId, podId` (required) and `agentId, voyageId` (optional): **every Final Loading booking from that POL to that POD across all voyages of the round**, with its discharge state. Excel (ExcelJS, `Discharge_List_{round}_{POL}-{POD}.xlsx`, `X-Export-Count`): the template columns first (Container Number, Size, Type, POL, POD, Container Status, Carrier, Shipper, Consignee, Commodity, VGM, Hazardous, IMDG, Rate) then Booking Number, Voyage, Agent, Partner, Discharge Status — so the sheet can be re-uploaded with the Discharge import. 404 when empty. UI: the **Discharge List** modal on `/bookings` (round, agent, POL, POD → table + Export).

## Where the data goes next
- Final Loading Layer 2 bookings → `BookingItem` groups → invoices ([06](06-invoices.md)); handling charges per container move ([11](11-accounting.md)).
- Capacity engine ([03](03-rounds-voyages.md)); reports and dashboard revenue ([08](08-reports-dashboard.md)). Reports read the stored `polId/podId` — now the booking's own ports, not the voyage's first/last port.

## Tests and probes
`npm test` includes `voyageMatch.logic.test.js` (10) and `importRules.logic.test.js` (8). `node scripts/audit-probes/bookings-probe.js` (39 checks against a running dev server on the disposable DB: east/west/intermediate, ambiguity, FL-02/03/04, discharge scope, partner label, partner-user isolation). `seed:test-data` creates bookings through the new API shape (intermediate-port bookings, partner labels, partner role + `partner@logistics.com` / `Demo@123456`).
`scripts/audit-probes/vessel-drill-probe.js` (92 checks, read-only, 2026-11-23): vessel-summary / round-summary for all four tabs x includeClosed (exact vessel set against the DB; vessel row = round rows = list totals = voyage-summary rows), zero rows, filters, paging, 400/401, partner user, export by roundId. Unit tests: `bookingSummary.logic.test.js` (roll-ups, `parseIncludeClosed`, `wantsZeroRows`).
