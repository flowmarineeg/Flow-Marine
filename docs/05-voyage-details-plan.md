# 05 — Voyage Details page: plan (phase 1)

**Status: PLAN ONLY, waiting for the owner's approval. No feature code has been written.** Written 2026-11-19. Sprint tasks are in `sprints/voyage-details-2026-11-19-sprint.md`.

Goal: click a voyage row on `/voyages` and open `/voyages/[id]`: the voyage's full details, its totals, its next port call and quick actions (add estimate, add booking, allocation).

**How to read this file.** *Checked* = I read it in the code (file named) or in a document. *Assumed* = my choice or a guess, listed again in section 11 as a decision for you. Nothing here was run in a browser.

**Sources read:** `docs/audit/system-audit-2026-11-19.md` (section 4; S-01, S-02, S-14, S-19, S-20), `docs/03`, `04`, `06`, `08`, `sprints/bookings-2026-11-10-sprint.md` (format), and the owner note **`voyages.docx`** (Voyage Master Dashboard, in Arabic; found in `Downloads`). **`vessel_time_table.docx` was not found** on this machine (not in `Downloads`, `Desktop`, `Documents` or the project). Phase 1 does not need it (per-port timestamps are out of scope); please resend it before phase 2.

**Note on the file number:** `docs/05-expenses.md` already uses number 05. This plan keeps the name you gave (`05-voyage-details-plan.md`); rename it when it becomes a module doc.

---

## 1. Current state (checked)

| Piece | What exists today | File |
|---|---|---|
| Voyages list page | Grouped by round; filters **Service** and **Status** only; columns Voyage No, Service, POL, POD, ETD, ETA, ATD, ATA, Status, Actions; **rows are not clickable**; Edit / Delete / bulk delete; **S-01: the ETA and ATD cells are swapped** (cells render `etd, atd, eta, ata` under headers `ETD, ETA, ATD, ATA`) | `frontend/src/modules/voyages/VoyageList.jsx` |
| Voyage details page | **Not found.** No `/voyages/[id]`. Nearest: round detail `/rounds/[id]` with `RoundVoyageList` (add, edit, refresh ports, delete) | `frontend/src/app/(dashboard)/rounds/[id]`, `modules/rounds/RoundVoyageList.jsx` |
| `GET /voyages/:id` | Voyage + round (`roundNumber roundName startDate endDate` only) + service + POL/POD. **No vessel, no round status/closeStatus.** Used only by the controller (the GET handler and the audit "old doc" in `PUT`); **the frontend never calls it** | `voyages/voyage.service.js#getById`, `voyage.controller.js` |
| Voyage model | `portCalls[]` = `{legKey, portId, portName, portCode, eta, etd}` in travel order; `etd eta atd ata`; `etp` (ignored); `status`; `direction`; **no vessel field** (vessel = `Round.vesselId`); **no per-port ATA/ATD/ETB** | `voyages/voyage.model.js` |
| Per-port actual events | `TrackingHistory` (append-only): `voyageId, portId, terminalId, status` (`At Port, Departed, In Transit, Arrived, Anchored, Delayed`), `lastUpdate`. Read route needs `tracking` permission | `tracking/trackingHistory.model.js`, `tracking.routes.js` |
| Booking list per voyage | `GET /bookings?voyageId=` and `GET /bookings/manual?voyageId=` already paginate (`page, limit`) and take `status`, `search`, `agentId` | `bookings/booking.service.js#list`, `manualBooking.service.js#list` |
| Booking tables | **Inline JSX inside `BookingList.jsx`** (one table for Layer 2, one for Layer 1), not separate components | `frontend/src/modules/bookings/BookingList.jsx` |
| Per-voyage rows by tab | `GET /bookings/voyage-summary?tab=` (new 2026-11-19): bookings, TEU, freight, **all statuses incl. Cancelled** | `bookings/bookingSummary.service.js`, `.logic.js` |
| Capacity engine | `computeRoundCapacity(roundId)` returns per voyage `layer1.loadedTEU`, `layer2.loadedTEU`, `loadedTEU`, peak onboard, `utilisationPct`, capacity, per-leg `segments` and `ports`. Counts **L1 not Cancelled + L2 Pending/Confirmed/Final Loading**; **excludes Cancelled voyages**; only bookings whose ports can be placed on the run; cached 60 s, cleared on every booking/voyage write. Route needs `rounds:read` | `capacity/capacity.service.js`, `capacityLegs.logic.js` |
| Revenue per voyage | `getRoundPnL` ("Revenue by Voyage"): **Layer 2, Final Loading only**; also takes `voyageId` | `reports/reports.service.js`, `GET /reports/round-pnl` |
| Invoiced per voyage | `BookingItem.voyageId` (always set) → `InvoiceLine` (`amountMinor`, `cancelled`) → `Invoice` (`status`, `docKind`, USD only). **`Invoice.voyageId` and the ledger line `voyageId` are set only for `invoiceType = 'Voyage'` invoices**, so they miss Round- and Booking-type invoices | `billing/billing.models.js`, `invoices/invoice.model.js:51-54`, `billing/invoiceV2.service.js:107, 204-210` |
| Create bookings | `POST /bookings` and `POST /bookings/manual` take `{roundId, polId, podId, agentId, …}`; the server finds the voyage. **If `voyageId` is sent it is used directly** (`checkChosenVoyage`: the voyage must not be Cancelled/Completed and must run POL → POD, else 400). So the page can always pin this voyage | `bookings/bookingVoyage.service.js:53-67` |
| Forms | `BookingForm`, `ManualBookingForm` take only `{item, onSuccess, onCancel}`; the route is chosen with `RoundRoutePicker` (rounds + ports from `GET /bookings/lookups`). **No pre-fill support yet** | `modules/bookings/*.jsx` |
| Guards | `rbac('voyages')` on every voyage route; partner users are refused by `rbac` for every module except `bookings` | `voyages/voyage.routes.js`, `middleware/rbac.js` |
| Capacity vessel data | `Vessel.capacity` (TEU), `reeferPlugs` | `vessels/vessel.model.js` |

---

## 2. Definitions: every number on the page

All come from the owner's decisions. "Source" is where the number is computed; no new way of computing totals is added (see section 3.2).

| Number | Definition (owner) | Source (reused code) |
|---|---|---|
| **Estimated bookings** | count per status of Layer 1 for this voyage: Pending, Confirmed, Final Loading, Cancelled (chips; they add up to the total) | `bookingSummary` (new function `voyageStatusTotals`, same `$match` rules as the lists) |
| **Operational bookings** | count per status of Layer 2, same four chips | same |
| **Total bookings** | sum of the chips | same |
| **Estimated TEU** | Layer 1 **not Cancelled** (Pending + Confirmed + Final Loading) | **capacity engine row** `layer1.loadedTEU` |
| **Operational TEU** | Layer 2 **Pending, Confirmed, Final Loading** | **capacity engine row** `layer2.loadedTEU` |
| TEU not placed | if the bookings' own TEU (from `bookingSummary`) differs from the capacity row, the difference is shown as a warning ("n TEU are not placed on the route: old or edited data") | difference of the two sources above |
| TEU size rule | 20 ft = 1; 40 ft, 40HC, 45 ft = 2; type ignored; unknown = 1 | `teuResolver.js` (untouched) |
| Vessel utilisation (small line under TEU) | peak onboard / vessel capacity | capacity row `onboardTEU`, `capacityBeforeLoading`, `utilisationPct` |
| **Estimated revenue** | Layer 1 `totalFreight`, **not Cancelled** | `bookingSummary` status totals |
| **Operational revenue** | Layer 2 `totalFreight`, **Final Loading only** (same rule as the revenue reports) | `bookingSummary` status totals; must equal `round-pnl` revenue for the voyage |
| **Pipeline** | Layer 2 `totalFreight`, Pending and Confirmed, shown separately (two numbers) | `bookingSummary` status totals |
| **Invoiced revenue** | sum of `InvoiceLine.amountMinor` (not cancelled) of **issued** invoices (status Issued, Partially Paid, Paid, Overdue; `docKind = Invoice`) whose `BookingItem.voyageId` is this voyage; shown with the number of invoices | new small read-only query (section 3.2). Chosen over the ledger: see below |
| Currency | all revenue is **USD**, labelled "USD" (bookings have no currency field; invoices are USD only) | constants / F-03 |
| **Revenue visibility** | the Revenue card and every amount appear **only** for users with `invoices:read` **or** `reports:read` (SuperAdmin included); the server omits the `revenue` object for others | `rbac.hasPermission` |
| **Next port call** | from the voyage's port order + voyage status + the latest `TrackingHistory` record of this voyage; its ETA is `portCalls[].eta`; the UI says it is **an estimate until actual times are entered per port** | new pure function `nextPort` (section 3.2) |
| ETP | ignored | — |

**Why invoiced revenue comes from invoice lines, not the ledger** (assumed, please confirm D4): both ledger `4000` credits and `Invoice.voyageId` carry the voyage **only for Voyage-type invoices** (`invoiceV2.service.js:107, 209`); a Round or Booking invoice has `voyageId = null`, so it would be missing. Credit and debit notes post to `4000` **without** a voyage (`:405-406`), so the ledger cannot net them per voyage either. `BookingItem.voyageId` is always set, so invoice lines reach every invoice. The figure is **gross: before credit/debit notes**, and the card says so.

---

## 3. API contract

### 3.1 Endpoints

| Method + path | Permission | Params | Returns | Errors |
|---|---|---|---|---|
| `GET /voyages/:id` (extended, **S-19**) | `voyages:read` | — | the voyage as today **plus** `round` = `{_id, roundNumber, roundName, startDate, endDate, status, closeStatus}`, `vessel` = `{_id, vesselCode, vesselName, capacity}` (from `Round.vesselId`), and `portCalls[]` with `portName`/`portCode` filled (snapshot; Port lookup only if the snapshot is empty). Implemented as a **new `getDetail`**; `getById` stays unchanged so the audit "old doc" in `PUT` does not change | 400 invalid id, 404 not found |
| **`GET /voyages/:id/summary`** (new) | `voyages:read` (revenue part also needs `invoices:read` or `reports:read`) | — | see 3.3 | 400 invalid id, 404 not found, 403 (partner user, or no `voyages` permission) |
| `GET /bookings` and `GET /bookings/manual` (extended) | `bookings` (unchanged) | new optional **`portLegKey`** and **`portId`** | same lists, filtered to bookings whose POL or POD is that port call (rule in 3.4) | 400 invalid port id |
| `GET /bookings/voyage-summary` | unchanged | — | unchanged (the rows-per-voyage view of the Bookings page) | — |

Partner users: `rbac('voyages')` already refuses them (403), so they cannot open the page or call either endpoint. This is tested in the probe (section 6).

### 3.2 How the summary is built (no fourth way of computing)

```
GET /voyages/:id/summary
   ├─ voyage + round + vessel (one query, same as getDetail)
   ├─ computeRoundCapacity(roundId)            ← EXISTING (capacity.service.js, uses capacityLegs.logic): TEU, utilisation. Cancelled voyage → no row → TEU 0
   ├─ bookingSummary.voyageStatusTotals(id)    ← EXISTING service, one new function in the same file: counts, freight, TEU per layer and per status
   ├─ invoiced(id)                             ← one small read-only aggregate (BookingItem ids → InvoiceLine → Invoice status), no money code touched
   └─ TrackingHistory.findOne({voyageId}).sort({lastUpdate:-1})   ← one read, for the next port
 pure assembly in voyages/voyageSummary.logic.js (no DB): cards, canBook, port strip / nextPort, revenue shaping
```
`voyageStatusTotals` reuses `summariseOperational` (TEU by container size) and the same `$match` rules as `voyageSummary`; it only groups by status as well. The capacity engine is called as a function (not through `/capacity/...`), so the page needs `voyages:read`, not `rounds:read` (**S-20**); this exposes capacity numbers to every `voyages:read` role (decision D6).

### 3.3 `GET /voyages/:id/summary` response shape

```jsonc
{ "success": true, "message": "...", "data": {
  "voyage": { "_id", "voyageNumber", "voyageName", "direction", "status",
              "roundId", "roundNumber", "roundName", "roundStatus", "closeStatus" },
  "actions": { "canBook": true, "reason": null },        // reason: ROUND_CLOSED | ROUND_NOT_BOOKABLE | VOYAGE_COMPLETED | VOYAGE_CANCELLED
  "bookings": {
    "total": 0,
    "estimated":   { "total": 0, "byStatus": { "Pending": 0, "Confirmed": 0, "Final Loading": 0, "Cancelled": 0 } },
    "operational": { "total": 0, "byStatus": { "Pending": 0, "Confirmed": 0, "Final Loading": 0, "Cancelled": 0 } } },
  "teu": { "estimated": 0, "operational": 0, "notPlaced": 0,
           "capacityTEU": 0, "peakOnboardTEU": 0, "utilisationPct": 0 },
  "revenue": {                                            // OMITTED without invoices:read / reports:read
    "currency": "USD",
    "estimated": 0, "operational": 0,
    "pipeline": { "pending": 0, "confirmed": 0 },
    "invoiced": { "amount": 0, "invoices": 0, "grossBeforeNotes": true } },
  "ports": [ { "index": 0, "legKey": "", "portId": "", "name": "", "code": "", "eta": null, "etd": null,
               "state": "done|current|next|upcoming" } ],
  "nextPort": { "state": "not-started|underway|at-port|finished|unknown",
                "current": { "legKey": "", "portId": "", "name": "", "code": "" } ,
                "next":    { "legKey": "", "portId": "", "name": "", "code": "", "eta": null },
                "source": "status|tracking", "lastTracking": { "portId": "", "status": "", "lastUpdate": "" },
                "isEstimate": true } } }
```
Money values are USD numbers in major units rounded to cents (booking freight is a plain number; invoice lines are integer minor units divided by 100). `byStatus` always lists all four statuses (zero when none) so the chips add up.

### 3.4 Rules

**Port filter on the lists** (match by leg key, fall back to port ids for old data), per side so mixed data works:
`{ $or: [ {polLegKey: k}, {podLegKey: k}, {polLegKey: null, polId: p}, {podLegKey: null, podId: p} ] }`
A port that is called twice (A-B-C-A) is told apart by the leg key; the port-id fallback matches both calls (old bookings have no keys; the test DB today has none missing, probed in the audit).

**Next port / port strip** (pure function, table):

| Voyage status | Tracking (latest record whose port is in `portCalls`) | `nextPort.state` | current | next |
|---|---|---|---|---|
| Scheduled | any (ignored) | `not-started` | none | first port call |
| Departed / In Transit | none | `underway` | none | **second** port call (assumes it left the first; `source: status`) |
| Departed / In Transit | status `Departed` at port i | `underway` | none | port call i+1 |
| Departed / In Transit | `At Port`, `Arrived`, `Anchored` or `Delayed` at port i | `at-port` | port i | port i+1 (none if i is the last) |
| Arrived / Completed | any | `finished` | last port call | none |
| Cancelled | any | `finished` | none | none (UI shows a "Cancelled" banner) |
| any | tracking port not in `portCalls` | as without tracking | | |
Repeated ports: the tracking record is matched to the **first port call at or after the last known index** (never goes backwards). The ETA of the next port is `portCalls[next].eta` (may be null → "no ETA"). Strip states: calls before current/next = `done`, the current = `current`, the next = `next`, the rest = `upcoming`.

**`actions.canBook`** is false with a reason when: round `closeStatus = Closed` (`ROUND_CLOSED`); round status Cancelled or Completed (`ROUND_NOT_BOOKABLE`, same as `roundLock.assertRoundBookable`); voyage Completed (`VOYAGE_COMPLETED`); voyage Cancelled (`VOYAGE_CANCELLED`). Otherwise true. The UI also needs `bookings:create`.

---

## 4. UI

Fits the existing style: top bar layout, `PageHeader`, `Badge`, `.card`, tables with `table-header`/`table-row`, `FormPage` for add forms, the navy / orange / grey palette (no new colours), `Pagination`, `EmptyState`, `LoadingSpinner`.

### 4.1 Layout sketch
```
[← Voyages]   V0002W  "Gulf Express West"   [West]  [In Transit]                    [+ Estimated] [+ Booking] [Allocation]
Round R000002 · MV FLOW STAR · Service GMED · Round 01 Nov – 30 Nov            ETD 03 Nov  ETA 09 Nov  ATD 03 Nov  ATA —

Port strip  [All ports]  (1) Jebel Ali ✓ ─── (2) Jeddah ● current ─── (3) Port Said  NEXT  ETA 09 Nov
            (click a port: the two booking tabs show bookings whose POL or POD is that port; "All ports" clears it)

┌ Bookings ─────────┐ ┌ TEU ─────────────┐ ┌ Revenue (USD) ───┐ ┌ Next port call ───────┐
│ 24 total          │ │ Estimated  120   │ │ Estimated 48,000 │ │ Port Said             │
│ Est:  P3 C2 F0 X1 │ │ Operational 96   │ │ Operational 31,200│ │ ETA 09 Nov (estimate) │
│ Op:   P5 C8 F9 X0 │ │ util. 78% of 500 │ │ Pipeline 9,000    │ │ Estimate until actual │
└───────────────────┘ └──────────────────┘ │ Invoiced 0 gross │ │ times are entered     │
                                           └──────────────────┘ └───────────────────────┘
[ Overview ] [ Estimated bookings ] [ Bookings ]
 Overview: status chips per layer, TEU split, revenue breakdown, port calls table (port, ETA, ETD, state)
 Tabs 2-3: the existing booking tables (read-only, "View" opens the booking), search, status filter, pagination, filtered to this voyage (+ port)
```
Chips: `P` Pending, `C` Confirmed, `F` Final Loading, `X` Cancelled (shown as words in the UI: "Pending 3 · Confirmed 2 · Final Loading 0 · Cancelled 1").

### 4.2 States
| State | Behaviour |
|---|---|
| Loading | spinner under the header (the header can render from `GET /voyages/:id` while the summary loads) |
| Error | `EmptyState` with the server message and a "Try again" button; 404 → "Voyage not found" with a link back |
| Empty bookings | cards show zeros; tabs show `EmptyState` ("No estimated bookings for this voyage" / with the port: "…at Jeddah") |
| **No revenue permission** | the **Revenue card is not rendered** (three cards), the Overview has no revenue block, the summary has no `revenue` field; nothing hints at amounts |
| Cancelled voyage | banner "This voyage is Cancelled"; actions disabled; TEU shows 0 (capacity excludes it) |
| Round Closed / not bookable, voyage Completed | actions disabled with the reason as a tooltip and a note under the buttons |
| TEU not placed | amber note under the TEU card |
| Port filter active | chip "Port: Jeddah ✕"; note "Cards show the whole voyage" |
| Partner user | cannot reach the route (403); the nav does not show Voyages for them |

### 4.3 Tables reuse
The two booking tables are inline in `BookingList.jsx`. Sprint B **extracts** them into `BookingsTable.jsx` and `ManualBookingsTable.jsx` (rows in, callbacks out), and `BookingList` uses them too, so the two screens cannot drift. On the Voyage page they are **read-only** (View link only; edit, delete and bulk delete stay in the Bookings page) (decision D7).

### 4.4 Quick actions
- Buttons: **Add Estimated Booking** (Layer 1), **Add Operational Booking** (Layer 2), **Allocation** (section 5). Each opens the existing form in a `FormPage` with round, voyage and ports **pre-filled and locked**: new optional prop `presets` on `BookingForm` / `ManualBookingForm` and a fixed-voyage mode in `RoundRoutePicker` (round list = this round; port list = this voyage's port calls).
- **POL defaults to the next port**; if the next port is the last call (nothing after it) the default is the call before it. **POD options = the calls after the chosen POL.** Changing POL re-filters POD.
- The request always sends **`voyageId` = this voyage**. The server validates it (code, `checkChosenVoyage`). This is also the pick after a `409 VOYAGE_AMBIGUOUS`. Note the field is `voyageId` in create bodies; **`voyageOverrideId` exists only in the Excel import rows** (your brief used the import name) (decision D8).
- Disabled when `actions.canBook` is false or the user lacks `bookings:create`; the reason is shown.
- After a successful save: close the form, invalidate the summary and both lists (the capacity cache is cleared by the server on every booking write).

---

## 5. Allocation: two options and a recommendation

**What the code says (checked):** `ManualBooking` already has `agentId` (**required**), `partnerId` (optional label), `polId/podId` + leg keys, `cargoRows[]` (container type, quantity, rate, weight), `totalTEU`, `totalFreight`, status. The capacity engine counts every Layer 1 that is not Cancelled (planning indicator), so a reserved slot would automatically reduce the space left. Partner users may already create Layer 1 estimates for their own partner. Nothing named "allocation" exists.

### Option A — a `kind` on Layer 1 (recommended, smallest)
Add `ManualBooking.kind` = `Estimate` (default; old rows read as Estimate) or `Allocation`. The form is the same with the kind preset; lists and the Voyage page show a label and a kind filter. Reuses agent, partner, POL/POD, cargo rows, capacity logic, the lists, the permissions and the partner scoping. About 6 small changes (model, validation, services pass-through, form toggle, list label/filter, summary "of which allocation").

**Your expectation is right with these caveats (code):**
1. **A partner-only allocation is not possible without a bigger change.** `agentId` is required on `ManualBooking` and is used by `DEPENDENTS.agent`, lists and reports. Recommended: an allocation always has an **agent** (who books it), with the **partner as the optional label** that already exists. Making `agentId` optional for allocations touches populate calls, lists, reports and dependents (decision D2).
2. **L1 and L2 both count in capacity and nothing is netted.** When the real bookings under an allocation arrive, the slot is counted twice until someone cancels or reduces the allocation. This already happens with estimates; allocations make it more visible. "Consume the allocation as bookings arrive" is a later phase.
3. By your Estimated rules an allocation counts in **Estimated TEU / revenue**. Proposal: keep it included and show a sub-line "of which allocation".
4. Statuses are the existing four (Pending ≈ forecast, Confirmed ≈ firm). Waitlisted, rolled and release dates (from `voyages.docx`) do not exist and are not planned.
5. Reports that read Layer 1 (booking report "Manual", voyage-performance L1) will list allocations as manual bookings; acceptable, they carry the kind.

### Option B — a new collection `VoyageAllocation`
Own model: voyage, POL/POD (leg keys), holder (agent **or** partner), TEU quota, weight, rate, status (Active / Released), release date. Supports partner-only holders, a quota that bookings consume, and clean reporting. **Cost:** new model, routes, service, DEPENDENTS, list UI, and **the capacity engine must count it** (an edit of `capacity.service.js` / `capacityLegs.logic.js`, the R10 files, needs your explicit approval) plus tests. Several times the work of A.

**Recommendation: Option A, in sprint C, with the agent kept required.** It gives reserved slots that count in capacity and show on the page with the least new code. Choose B only if partner-only holders or consumption of the quota are needed soon. Allocation tasks in sprint C wait for your decision D2.

---

## 6. Tests

### 6.1 Unit tests (`npm test`, pure logic) — `backend/test/voyageSummary.logic.test.js` and additions to `bookingSummary.logic.test.js`
| Area | Cases |
|---|---|
| Statuses | per-status counts for both layers add up to the total; all four statuses always present; Cancelled counted in chips but not in TEU/revenue |
| TEU by size | 20 ft = 1; 40 ft, 40HC, 45 ft = 2; unknown = 1; type ignored; Estimated = L1 not Cancelled; Operational = L2 Pending/Confirmed/Final Loading only |
| Revenue rules | estimated = L1 not Cancelled; operational = Final Loading only; pipeline = Pending + Confirmed; Cancelled excluded everywhere; rounding to cents |
| Permission shaping | `revenue` omitted when neither `invoices:read` nor `reports:read`; present when either |
| Not placed | difference between bookings TEU and capacity TEU becomes `notPlaced` (never negative) |
| `nextPort` | every row of the table in 3.4 incl. repeated ports and a tracking port that is not on the run |
| Port filter | `portMatch` builds the right `$or`; leg key wins; null keys fall back to port ids |
| `canBook` | closed round, Cancelled/Completed round, Completed voyage, Cancelled voyage, all-clear |
| Partner refusal | the partner **refusal itself is middleware** (`rbac`), so it is covered in the HTTP probe, not here |

### 6.2 HTTP probe — new `backend/scripts/audit-probes/voyage-details-probe.js` (test DB, dev server; prints results, **does not write a result file under `backend/`**, see S-16)
- `GET /voyages/:id` returns vessel, round dates and port calls (S-19); 404 and 400 on bad ids.
- **Summary equals the lists:** for several voyages, `bookings.*.byStatus` equals `GET /bookings?voyageId=&status=` and `GET /bookings/manual?voyageId=&status=` totals; operational `Final Loading` freight equals the sum of the list.
- **TEU equals the capacity engine:** `teu.estimated` / `teu.operational` equal `layer1.loadedTEU` / `layer2.loadedTEU` of `GET /capacity/round/:roundId` for the voyage; `notPlaced` is 0 on clean data and reported otherwise.
- **Operational revenue equals the revenue report:** equals `GET /reports/round-pnl?roundId=&voyageId=` voyage revenue.
- **Invoiced** equals a read-only DB sum of the voyage's non-cancelled lines of issued invoices (the probe may read the DB; it never writes there except through the API).
- **Permissions:** admin and Finance Officer see `revenue`; **Tracking Officer** (`voyages` read only) gets the summary **without** `revenue`; **partner user gets 403** on both endpoints; a user without `voyages` gets 403.
- Port filter: `portLegKey` / `portId` return only bookings touching that port; unknown id → 400.
- Round Closed / Cancelled voyage → `actions.canBook = false` with the reason.
- Pinning: a booking created with `voyageId` = this voyage lands on it (a tie fixture).
- Regression: `bookings-probe` 45/45 and `rounds-voyages-probe` 64/64 still pass; `e2e-masterdata` 136/136.

### 6.3 Manual browser checklist (for you; I have no browser)
1. `/voyages`: the ETA and ATD columns now show the right dates; clicking a row opens `/voyages/[id]`; Edit, Delete and the checkbox still work and do **not** also open the page.
2. Header shows number, name, direction, round, vessel, service, status, ETD/ETA/ATD/ATA.
3. Port strip: order is right (a westbound voyage lists its ports in reverse); current and next are marked; click a port → both tabs filter and the "Port: …" chip appears; "All ports" clears it; the cards do not change.
4. Cards: Bookings chips add up; TEU values match the Round Capacity Report for this voyage; Revenue values match what you expect; "USD" is written; the Next port card says it is an estimate.
5. Log in as the **Tracking Officer** (`tracking@logistics.com`): the page opens **without** a Revenue card; as **Finance** it shows revenue; as the partner user the page and the nav entry are not reachable.
6. Tabs: Estimated bookings and Bookings show only this voyage; pagination, search and status filter work; "View" opens the booking.
7. Quick actions: forms open with round, voyage and ports pre-filled and locked; POL = next port; POD lists only later ports; save works; the page numbers update; try a tie (two runs, same ports) and confirm the booking lands on **this** voyage.
8. Actions are disabled with a reason on: a Closed round, a Completed voyage, a Cancelled voyage.
9. Empty voyage (no bookings), a Cancelled voyage, a voyage with old data: no crash, zeros, sensible messages.
10. Narrow window: no horizontal page scroll; the booking tables scroll inside their card.

---

## 7. Risks and what could break

| Risk | Detail | Mitigation |
|---|---|---|
| Old bookings without leg keys | the port filter and the capacity spans fall back to port ids; a repeated port matches both calls | per-side `$or`; documented; the test DB has none without keys (audit, probed) |
| **Cancelled voyage with live bookings (FL-06)** | cancelling a voyage cancels its bookings (fixed, probed), but legacy or edited data may differ; capacity **excludes** Cancelled voyages so TEU = 0 while chips may show live bookings | `notPlaced` + a banner; chips always come from `bookingSummary`, not capacity |
| Round **Closed** | every booking write is refused (`409 ROUND_CLOSED`) | `actions.canBook` disables the buttons; the server stays the final judge |
| Capacity **cache** | `computeRoundCapacity` is cached 60 s and cleared on every booking/voyage write (hard rule); a write path that forgets it would show stale TEU | the probe reads right after writes; no new cache is added |
| **S-20** permission difference | the page shows capacity numbers under `voyages:read`, not `rounds:read` | decision D6; the endpoint calls the function directly |
| S-02 "three totals" | capacity, `voyage-summary` and revenue reports use different status sets | the page uses **one** definition per number (section 2) and the probe checks each against its original source |
| Tracking read | the next-port logic reads `TrackingHistory` under `voyages:read` (no `tracking` permission) | read-only, one record; decision D5 |
| Performance | one summary = 1 voyage + 1 cached capacity call (all voyages of the round, small) + 2 aggregates + 1 invoice aggregate + 1 tracking read | indexes exist on `(voyageId, status)`; `BookingItem` has `voyageId` in its compound index; no pagination needed |
| Extracting the booking tables | `BookingList` is refactored to use the new components | the refactor is its own task with a before/after click-through in the checklist |
| `GET /voyages/:id` | no frontend caller today; the new `getDetail` leaves `getById` and the audit "old doc" untouched | checked in code |
| Pre-fill in the forms | `RoundRoutePicker` clears a pinned `voyageId` if it is not among the candidates (an effect); the fixed-voyage mode must bypass that | a task and a test case |
| Invoiced is **gross** | credit/debit notes are not netted per voyage (the ledger cannot either) | labelled on the card; decision D4 |
| Allocation double count | see section 5 (L1 and L2 both count) | documented; later phase |
| Lint / build | repo-wide lint fails (S-06) and no current build exists (S-07) | section 8 |

---

## 8. Prerequisites

- **`npm run build` must pass** before sprint B starts: you stop the dev server, I run `npm run build`; any build failure is fixed first (it could not run on 2026-11-19 because the dev server held the Next lock).
- **Only the files I touch must be lint clean**: each sprint ends with `npx eslint <touched files>`. I will **not** fix repo-wide lint (S-06).
- Test DB only; **no seed with `--reset`**; no commit.
- Writing any file under `backend/` restarts the dev server (nodemon); probes are run after edits, one at a time.
- Do not touch money code (ledger, invoices, settlement) or `teuResolver.js`. The capacity engine is **called**, not edited (Option B would need your approval to change it).

---

## 9. Sprint split (details and tasks in `sprints/voyage-details-2026-11-19-sprint.md`)

| Sprint | Content | Done when |
|---|---|---|
| **A — backend, fixes, tests** | `getDetail` + `GET /voyages/:id` (S-19); `GET /voyages/:id/summary`; `voyageStatusTotals` in `bookingSummary`; port filter on the two booking lists; pure `voyageSummary.logic` + unit tests; the probe; **S-01** (ETA/ATD cells) and **S-14** (service filter needs `services:read`) | `npm test` green (target about 150), probe green against the dev server, `bookings-probe` / `rounds-voyages-probe` / `e2e-masterdata` still green, touched files lint clean |
| **B — page** | `/voyages/[id]` page, header, port strip, four cards, three tabs, row click, extracted booking tables, no-revenue state | `npm run build` passes, touched files lint clean, your browser checklist items 1–6, 9, 10 pass |
| **C — quick actions, allocation, docs** | form `presets` + fixed-voyage picker, the two buttons, **Allocation (after decision D2; Option A)**, docs update | checklist items 7–8 pass, docs updated (`docs/03, 04, 08`, `CLAUDE.md`, `sprints/STATUS.md`, audit table), probe covers pinning and allocation |

---

## 10. Later phases (not planned, not built)

Per-port timestamps and a statement of facts (ETA, EOSP, ETB, ATB, ops start/end, ATD per port); charter hire and bunkers; running costs and **voyage P&L**; **loading reconciliation** (estimated vs actual per agent); **discharge and on-board** tab (ROB, restow); **reefer plugs**; slow steaming; off-hire; allocation consumption, release dates, waitlist and roll; Discharged / Remaining tabs on the voyage page; the Voyages landing board (service and fleet cards) from `voyages.docx`.

---

## 11. Decisions for the owner

| # | Decision | My recommendation |
|---|---|---|
| D1 | Does the **port filter** also change the cards? | **No**: it filters the two tabs only; the cards stay voyage-wide (the page says so). Simpler and avoids a second totals path |
| D2 | **Allocation**: Option A or B? If A: keep **agent required** (partner = optional label) or make the agent optional for partner-only allocations? | **A, agent required** (section 5) |
| D3 | Allocations inside **Estimated TEU / revenue**? | Yes, with an "of which allocation" sub-line |
| D4 | **Invoiced revenue** = gross invoice lines of issued invoices, read via `BookingItem.voyageId`, **not** netted for credit/debit notes? | Yes, labelled "gross before notes" (the ledger cannot give a per-voyage net) |
| D5 | The next-port logic reads `TrackingHistory` under `voyages:read` (no `tracking` permission needed)? | Yes (read-only, one record) |
| D6 | Show capacity numbers (utilisation, TEU) to every `voyages:read` role (S-20)? | Yes |
| D7 | Booking tables on the page are **read-only** (View only)? | Yes; edit and delete stay in the Bookings page |
| D8 | Quick actions **always send `voyageId`** = this voyage (not only after a tie); the field is `voyageId` in create bodies (`voyageOverrideId` is import-only)? | Yes |
| D9 | The "Bookings" tab = **Layer 2, all statuses** (with a status filter); no Discharged / Remaining tabs in phase 1? | Yes |
| D10 | Show a **"TEU not placed"** warning when bookings TEU differs from the capacity engine? | Yes |
| D11 | Row click opens the page in the **same tab**; keep Edit / Delete buttons on the row? | Yes |
| D12 | Please **resend `vessel_time_table.docx`** before phase 2 (not needed now) | — |

---

## 12. What I checked vs what I assumed

**Checked in the code or documents:** everything in section 1; that `voyageId` pins the voyage in create (`bookingVoyage.service.js`); that `Invoice.voyageId` and the ledger `voyageId` are Voyage-invoice only; that credit/debit notes post without a voyage; capacity's statuses, exclusions, cache and row fields; that `agentId` is required on `ManualBooking`; that the booking tables are inline in `BookingList`; that the frontend never calls `GET /voyages/:id`; that the lists already paginate; the seeded role permissions (Tracking Officer = `voyages` read, no reports/invoices); `voyages.docx` content.
**Assumed (decisions above):** D1–D12; the exact next-port rules in 3.4 (a design choice built from the data that exists); that one summary call is fast enough (no timing was measured); that `TrackingHistory.portId` is reliable enough to mark the current port.
**Not checked:** anything in a browser; the probe and unit tests (not written yet); `vessel_time_table.docx` (not found).
