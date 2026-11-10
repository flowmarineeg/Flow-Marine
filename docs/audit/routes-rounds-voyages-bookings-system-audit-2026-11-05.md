# Full audit — Routes → Rounds → Voyages → Bookings (data flow + current status) — 2026-11-05

**Scope:** the operational chain end to end: Service + Route legs, Round, Voyage, Layer 2 `Booking`, Layer 1 `ManualBooking`, Excel import (booking / finalLoading / discharge), the capacity engine, `BookingItem` hand-off to invoicing, and the guards that connect them (`roundLock`, `utils/dependents.js`, capacity cache). Money modules (ledger, invoices, settlement) are only followed to the point where the chain hands data over.
**Method:** full read of the services, models, routes, validation and logic files listed in "Files read", plus **one read-only script** against the disposable Atlas test DB (capacity output per round, data-shape counts; nothing written, script kept outside the repo). **No test suite was run, no dev server was started, no frontend click-through.** Every finding says whether it is *code reading* or *observed in the test DB*.
**Relation to older audits:** `rounds-voyages-flow-audit-2026-10-26.md` (RV-xx) covered Service → Round → Voyage and was remediated; this file re-checks that those fixes are in the code, extends the chain through bookings and capacity, and adds new IDs **FL-01…FL-14**. Open RV items are carried forward unchanged. `system-audit-2026-10-25.md` (F-xx) is not repeated.
**Rule respected:** nothing below proposes editing `capacity.service.js`, `teuResolver.js` or `voyageGenerator.js` without an explicit owner decision (R10). FL-01 is exactly such a decision.

Severity: **High** = wrong money/capacity result or irreversible data change under normal use; **Medium** = wrong or misleading result under realistic use / bypass of a documented rule; **Low** = hygiene or edge case; **Info** = state of the data or docs.

---

## 1. Current system status

### 1.1 Code and verification state
| Item | State |
|---|---|
| Branch / tree | `version-4`, working tree uncommitted (owner rule: no commits until told) |
| RV-00…RV-37 fixes | Present in the code (re-read today: `round.service.js`, `voyage.service.js`, `route.service.js`, `roundLock.js`, `dependents.js`) |
| Open from RV | RV-17 (bare generated voyages), RV-36 (leg agent informational), RV-38…RV-41 (open since 2026-10-31) |
| Automated checks | `npm test` 76 pure-logic tests (last run 2026-10-31); rounds-voyages probe 47/47 and `e2e-masterdata` 111/111 (last run 2026-10-27). **None re-run today.** `npm run test:int` has never run since the V2-only conversion; it has no case for the round/voyage/booking rules below |
| Frontend | No tests; no manual browser pass recorded for Routes / Rounds / Voyages / Bookings after the master-data rework |
| Booking-side rules (import, capacity) | Never probed. This is the first audit of them and found 5 High/Medium defects (FL-01…FL-05) |

### 1.2 Test DB snapshot (Atlas `test` DB, read-only query 2026-11-05)
| Fact | Value |
|---|---|
| Rounds | 40 (3 seeded `TEST Round A/B/C` + 37 probe/e2e leftovers) |
| Rounds without `routeSnapshot` | **25 of 40**, including all three seeded rounds (they pre-date the 2026-10-26 snapshot code; legacy fallback to the live route is active for them) |
| `one_active_round_per_vessel` index | **Present** (migration was run) |
| Layer 2 bookings by status | Final Loading 117 · Confirmed 9 · Pending 8 · Cancelled 2 |
| Layer 1 by status | Pending 17 · Cancelled 5 · Confirmed 2 · Final Loading 1 |
| Voyages by status | Scheduled 52 · Departed 11 · Cancelled 9 · Arrived 3 · Completed 3 |
| Bookings whose POL/POD differ from their voyage | 0 (the "derived from voyage" rule holds in the data) |
| Duplicate container numbers across bookings | 0 (but nothing prevents them, see FL-09) |
| Capacity per voyage | **onboard = 0 on every voyage that has loaded cargo** (see FL-01) |

---

## 2. How the chain works (from the code)

### 2.1 Entities and ownership
```
Service (liner service, serviceCode)            Masters → Routes UI (/routes)
  └─ Route (1 per service)  ── RouteLeg[] (sequence, country/city/port/terminal, agentId*)
        │                                            * informational (RV-36)
        │ copied at creation
        ▼
Round (R000001, vessel, dates, status, routeSnapshot, lastVoyageSeq, closeStatus…)
  └─ Voyage[] (one per consecutive leg pair; manual voyages appended)  voyageNumber = {serviceCode}-{roundNumber}-{seq:02d}
        ├─ Booking (Layer 2, one row = one container, BK-…)   ──► BookingItem (grouped, invoiceable) ──► Invoice line
        ├─ ManualBooking (Layer 1, cargo rows, MB-…)          ──► capacity only, never invoiced
        ├─ Expense (voyage scope)  ├─ TrackingHistory  └─ JournalEntryLine.voyageId
        ▼
Round financial axis (independent): closeStatus Open → ReadyToClose → Closed (roundLock freezes everything)
```
Reverse references that block deletes are declared in `utils/dependents.js` (`round`, `voyage`, `service`, `port`, `agent`, `vessel`).

### 2.2 Data flow, step by step
1. **Setup.** `POST /services` creates the Service. `POST|PUT /services/:id/route` runs `route.service.saveLegs`: validate everything first (≥ 2 legs, ids, country→city→port→terminal ownership, agent exists, no two consecutive identical ports), refuse if an Active/Completed round of the service exists, then replace route + legs in **one transaction**.
2. **Round creation.** `POST /rounds` → `round.service.create`: Service Active, Vessel Active, route ≥ 2 legs, no consecutive duplicate ports, **vessel has no Active round** (also checked for a Planned round, see FL-14), `startDate < endDate`. `nextNumber('round')` (outside the transaction), then one transaction: `Round.create` (with `routeSnapshot`, `v2:true`) → `generateVoyages` (N−1 voyages, status Scheduled, bare, no dates) → `voyageIds` + `lastVoyageSeq` → first-voyage cascade if the round starts Active (first Scheduled voyage → Departed, `atd = now`).
3. **Round life.** `PUT /rounds/:id`: Planned → Active | Cancelled; Active → Completed | Cancelled. →Active re-checks the vessel and runs the cascade; →Cancelled is refused while any non-Cancelled Layer 1/2 booking exists (`ROUND_HAS_BOOKINGS`), otherwise cancels its Scheduled/Departed/In Transit voyages in the same transaction. Every write calls `invalidateRoundCache`.
4. **Voyage life.** `PUT /voyages/:id` edits dates/status/name/code (never ports/round). Transition table unless the caller holds `voyages:override`; date rules are checked on the merged state; schedule problems come back as `data.warnings`. `POST /voyages` adds a manual voyage (ports must be on the round's route; sequence from monotonic `lastVoyageSeq`). `DELETE` only for a manual voyage or the last generated one, with no live Layer 2 bookings and no `DEPENDENTS.voyage`.
5. **Booking (Layer 2).** `POST /bookings`: `assertVoyageRoundOpen` → agent exists → voyage not Cancelled/Completed → `assertRoundBookable` (round not Cancelled/Completed) → server-side `totalFreight`, POL/POD copied from the voyage → optional capacity pre-flight (`ENABLE_CAPACITY_ENFORCEMENT`) → insert → `invalidateRoundCache` + `BookingItem.scheduleSync` (fire-and-forget).
6. **Booking (Layer 1).** `POST /bookings/manual`: same voyage/round checks, cargo rows → server totals (`totalTEU` via `teuResolver`), POL/POD from the voyage, `invalidateRoundCache`. No BookingItem sync.
7. **Excel import** (`/bookings/import/preview|save`, scope = Round + Agent): per row resolve the voyage by POL/POD against the round's non-Cancelled voyages → rows classed invalid/unresolved/ambiguous/valid/new/update → `save` inserts with `insertMany`, updates by `bulkWrite`, and for `finalLoading` marks the manifest Final Loading and cancels every other live booking of that agent in the round (guarded by `BOOKING_INVOICED`). `discharge` import (explicit voyage) only writes `dischargeStatus`/`dischargedAt`.
8. **Capacity** (`capacity.service.js`, read-only for this audit): per-voyage TEU rows from non-Cancelled voyages + Pending/Confirmed/Final Loading bookings of both layers, cached 60 s per round, invalidated by every mutation above.
9. **Hand-off to money.** Final Loading Layer 2 bookings → `BookingItem` groups `(billTo, voyage, containerType, rate)` → V2 invoice wizard → ledger. Locked items (on a live invoice) are never edited by the sync. Round close checks open voyages, draft invoices, open PDAs, partner shares, non-USD lines.

### 2.3 Status machines (as enforced in code)
| Entity | Allowed moves | Notes |
|---|---|---|
| Round | Planned→Active\|Cancelled; Active→Completed\|Cancelled | Completed/Cancelled terminal; Completed does **not** look at its voyages (RV-39) |
| Voyage | Scheduled→Departed\|Cancelled; Departed→In Transit\|Arrived\|Cancelled; In Transit→Arrived\|Cancelled; Arrived→Completed | `voyages:override` skips the table, never the date rules; →Cancelled does **not** look at live bookings (FL-06) |
| Booking L2 / L1 | Pending→Confirmed\|Final Loading\|Cancelled; Confirmed→Final Loading\|Cancelled; Final Loading→Cancelled; Cancelled terminal | **In code, Final Loading → Cancelled is unreachable through the API** (FL-05); only the import reconciliation does it |
| Round `closeStatus` | Open→ReadyToClose→Closed; reopen with reason | independent axis |

### 2.4 Guard matrix (what protects what)
| Mutation | Round-closed lock | Round bookable (not Cancelled/Completed) | Voyage status check | Dependents/other guard | Cache invalidated |
|---|---|---|---|---|---|
| Round create/update/delete | yes (update/delete) | n/a | n/a | vessel-free, live-bookings (cancel), `DEPENDENTS.round`, expenses/bookings/manual (delete) | yes |
| Voyage create/update/delete | yes | create: round not Completed/Cancelled | transition table | delete: L2 bookings, `DEPENDENTS.voyage`, chain rule | yes |
| `POST /bookings`, `POST /bookings/manual` | yes | **yes** | **yes** | agent exists | yes |
| `PUT /bookings/:id`, manual | yes | no | no | Final Loading/Cancelled not editable | yes |
| `DELETE /bookings/:id` | yes | no | no | non-cancelled invoice line | yes |
| **Import save (booking/finalLoading)** | `assertRoundOpen` only | **no** | **no** (preview excludes Cancelled only) | `BOOKING_INVOICED` (cancel path only) | yes |
| Import save (discharge) | yes (voyage's round) | no | requires Final Loading rows | — | yes |

---

## 3. What works (verified in code today)
- N legs → N−1 voyages, chained POD→POL, number format, atomic round+voyages creation, atomic route replacement (RV-16/32/33).
- One Active round per vessel: service check **and** DB partial unique index, race mapped to `VESSEL_HAS_ACTIVE_ROUND` (index confirmed present in the test DB).
- `routeSnapshot` is written on create and read by manual-voyage port validation; legacy fallback exists.
- Cancel-round guard and cascade; monotonic `lastVoyageSeq`; delete rules for voyage/round/service/port/agent; cache invalidation on every voyage/round/booking write.
- Booking creation derives POL/POD/totalFreight server-side; the data confirms it (0 mismatches).
- Layer 1 and Layer 2 are kept separate in capacity vs revenue as documented.

---

## 4. Findings

| ID | Sev | Basis | Area | One line |
|---|---|---|---|---|
| FL-01 | **High** | observed + code | Capacity | Cargo is loaded and discharged on the same voyage row, so `onboardTEU` is always 0: utilisation 0 %, overbooking never reported, `strict` enforcement can never block |
| FL-02 | ~~High~~ **Fixed 2026-11-10** | code | Import | Import save bypasses `assertRoundBookable` and the voyage-status check: bookings can be created on a Cancelled/Completed round or a Completed voyage |
| FL-03 | ~~High~~ **Fixed 2026-11-10** | code | Import / invoicing | Import "update" rows overwrite voyage, rate and container type of **any** existing booking (Final Loading, invoiced, Cancelled); locked BookingItems and invoices do not follow |
| FL-04 | ~~High~~ **Fixed 2026-11-10** | code | Final Loading import | A booking is **Cancelled** when its row was invalid, unresolved or failed to save, because the manifest is only the successfully saved rows; the save is not transactional and Cancelled is terminal |
| FL-05 | Medium | code | Booking status | Final Loading → Cancelled cannot be done through the API/UI (edit lock fires before the transition map); docs say it is allowed |
| FL-06 | Medium | code | Voyage / Round status | A voyage can be set to Cancelled with live bookings; they drop out of capacity but stay revenue and invoiceable (extends RV-39) |
| FL-07 | Low | code | BookingItem sync | Sync is fire-and-forget (`setImmediate`), failures are only logged; locked items never shrink |
| FL-08 | Low | code | Booking form | `/bookings/voyage-ports/:voyageId` reads the live Service route, not the round snapshot |
| FL-09 | Low | code | Bookings | Duplicate container numbers are not prevented; import then flips every duplicate to Final Loading |
| FL-10 | Low | code | Layer 1 | ManualBooking: no delete guard (by design), can be created as Cancelled, a lone Final Loading row exists with no meaning |
| FL-11 | Low | code | Manual voyage | Manual voyages get the last sequence; capacity walks by `sequence`, so a "between legs" manual voyage is out of order in the cargo chain |
| FL-12 | Info | observed | Test DB | 25/40 rounds have no snapshot/`lastVoyageSeq`; 37 of 40 rounds are probe leftovers |
| FL-13 | Info | docs | Docs | `docs/04` and CLAUDE.md claims that differ from the code (see FL-05, FL-10, FL-14) |
| FL-14 | Medium | code (owner decision) | Round create | A vessel with an Active round cannot get **any** new round, not even Planned, so the next voyage cycle cannot be prepared in advance |
| carried | — | — | RV-17 · RV-36 · RV-38 · RV-39 · RV-40 · RV-41 | Unchanged, see `rounds-voyages-flow-audit-2026-10-26.md` |

### FL-01 (High) — Capacity: onboard is always 0 for the bookings the system can create  *(observed + code)*
**Where:** `capacity.service.js` `resolveDischargeIdx` (line 136) and the row formula `onboardTEU = onboardStart + loaded − discharged` (line 308).
**Why:** a booking's `polId/podId` are always copied from its voyage (hard rule), so its POD equals the POD of the voyage it sits on. `resolveDischargeIdx(loadIdx, podId)` starts at `loadIdx` and returns `loadIdx` itself. The same TEU is added to `loadedTEU[i]` and `dischargedTEU[i]`, and the row nets them to zero. Cargo is "onboard" only through a `Remaining` discharge status. The in-code comment describes `onboardTEU` as "TEU onboard while transiting (after load, before discharge at POD)", but the formula subtracts the discharge of the same row.
**Observed (read-only run on the test DB):**
| Round | Voyage | load | discharge | onboard | util |
|---|---|---|---|---|---|
| R000001 (A) | CNSHA→SGSIN | 37 | 37 | **0** | 0 % |
| R000001 (A) | SGSIN→AEJEA | 40 | 40 | **0** | 0 % |
| R000002 (B) | AEJEA→SAJED | 57 | 54 | 3 (only the 3 `Remaining`) | 0 % |
| R000002 (B) | SAJED→EGPSD | 57 | 57 | 3 (carried) | 0 % |
Vessel capacity 3,200–4,500 TEU, so a true figure would be ~1–2 %, but every voyage shows 0 and nothing can overbook.
**Effect:** `VOYAGE_OVERBOOKED` never fires; `computeVoyagePreview` computes `tv.onboardTEU + addedTEU` from 0, so `ENABLE_CAPACITY_ENFORCEMENT=warn|strict` cannot detect a full vessel (it is `off` by default, so nobody has noticed); the Round Capacity Report and peak/average utilisation are meaningless; the docs (03) describe the formula as intended, so the docs repeat the defect.
**Fix options (owner decision, touches R10 files):** (a) cargo is aboard while sailing: `onboardTEU[i] = onboardStart + loaded[i]` and the carry into the next voyage is `onboardTEU[i] − discharged[i]`; (b) additionally decide whether a booking may span several legs (today impossible because POL/POD follow the voyage, "multi-leg voyages" is on the missing list). (a) alone makes the numbers correct for single-leg bookings. Add unit tests for the engine either way (none exist for the cargo chain).

> **FL-02, FL-03, FL-04 fixed 2026-11-10** (bookings sprint, `docs/04`): save re-analyses the raw rows server-side (round bookable, agent, ports, container type, voyage by POL/POD; the client echo is ignored); Final Loading / invoiced / Cancelled bookings are never overwritten (`unchanged` in a Final Loading file, `invalid` otherwise; a Cancelled booking is never revived); a Final Loading file with any invalid row is refused whole (`IMPORT_ROWS_INVALID`) and the save is one transaction. Verified by `scripts/audit-probes/bookings-probe.js` (FL-02, FL-02b, FL-03, FL-03b, FL-04, FL-04b) and `importRules.logic.test.js`. The text below is the original finding.

### FL-02 (High) — Import save skips the bookable checks  *(code)*
**Where:** `bookingImport.service.js#saveImport` line 307 calls only `lock.assertRoundOpen(roundId)`. Compare `booking.service.create` lines 119–126 (`assertVoyageRoundOpen`, voyage status, `assertRoundBookable`). `assertBookingSource` is called in `previewImport` only; `save` trusts the posted `agentId` and the posted resolved rows (`_resolvedVoyage`, `_resolvedCt`, `_existingId`) without reloading them.
**Effect:** a Cancelled or Completed round keeps `Arrived`/`Completed` voyages; preview offers every non-Cancelled voyage, so rows land on a Completed voyage or in a Cancelled round — exactly what RV-25/26 closed for the form. A tampered request can also write any `voyageId` / `containerTypeId` / `_existingId` (the save re-uses client-echoed ids).
**Fix:** in `saveImport` (not an R10 file): reload voyages of the round from the DB, call `assertRoundBookable` and the voyage-status rule for every target voyage, validate `agentId`, and rebuild the resolution server-side instead of trusting `_resolved*`.

### FL-03 (High) — Import updates overwrite locked bookings  *(code)*
**Where:** `previewImport` looks up `existingBookings` with **no status filter** (line 208); `saveImport` then bulk-sets `voyageId`, `agentId`, `containerTypeId`, `polId/podId`, `freightRate`, `totalFreight`, `dg`, … (lines 439–473) without checking status or invoicing. The API refuses to edit Final Loading/Cancelled bookings (`booking.service.js:187`); the import does not.
**Effect:** re-importing a `booking` file for a container that is already Final Loading and invoiced changes its rate/voyage under a live invoice. `BookingItem.syncForVoyages` skips locked items, so item, invoice and booking disagree and no credit/debit note is raised. For `finalLoading`, the later `updateMany` also turns a previously **Cancelled** booking back into Final Loading.
**Fix:** treat existing rows with status Final Loading/Cancelled (or on a live invoice line) as `invalid` ("cannot be updated, use a note"), except the intended Final Loading flip.

### FL-04 (High) — Final Loading import cancels bookings it failed to save  *(code)*
**Where:** `saveImport` lines 490–513. `savedContainerNumbers` = `created ∪ updated` (successful rows only). The cancel sweep runs for every live booking of the agent in the round whose container is **not** in that set.
**Effect:**
- a manifest row that is `invalid`, `unresolved` or `ambiguous` is not in the set, so an existing booking for that container is **Cancelled** even though it is in the file;
- an `insertMany`/`bulkWrite` error (caught, pushed to `failed`) has the same result;
- the three writes (insert, update, status sweep) are not in a transaction; a failure midway leaves a half-applied manifest;
- Cancelled is terminal (no API path back), and the F-07 guard only helps when the booking is invoiced.
**Fix:** refuse the whole save when any manifest row is not saveable or any write failed (all-or-nothing in a transaction), and build the "keep" set from the file's container numbers, not from the rows that happened to succeed. Add a preview summary "N bookings will be cancelled" with explicit confirmation.

### FL-05 (Medium) — Final Loading → Cancelled is unreachable  *(code)*
`booking.service.update` (line 187) and `manualBooking.service.update` (line 180) throw "Final Loading bookings cannot be edited" **before** the transition map is consulted; `BookingForm.jsx:49` locks the form the same way. The map (`Final Loading: ['Cancelled']`) is therefore dead code. CLAUDE.md and `docs/04` say the move is allowed. A single wrongly confirmed container can only be removed by the Final Loading import (FL-04's risk) or, if not invoiced, hard delete.
**Fix (owner choice):** allow a status-only change to Cancelled for Final Loading (refuse when invoiced → credit note), or correct the docs.

### FL-06 (Medium) — Voyage Cancelled / Round Completed ignore live bookings  *(code, extends RV-39)*
`voyage.service.update` has no booking check on a move to Cancelled (only `deleteVoyage` has). The capacity engine drops Cancelled voyages and emits `BOOKING_PORT_NOT_IN_ROUND` for their bookings, while reports/dashboard still count Final Loading bookings as revenue and `BookingItem` still lists them for invoicing. `round.update` to Completed does not look at voyages (the close checklist later blocks on open voyages).
**Fix:** refuse (or require move/cancel of the bookings first) like the round-cancel guard already does.

### FL-07 (Low) — BookingItem sync is eventual and silent
`scheduleSync` runs in `setImmediate` and swallows errors (`logger.error`). `listEligible` re-syncs before the wizard reads, so invoicing self-heals; reports that read `BookingItem` directly could lag. Locked items by design never shrink (corrections are notes) — see FL-03 for how an import can still diverge.

### FL-08 (Low) — Voyage-port lookup uses the live route
`booking.service.getVoyagePortIds` aggregates `routes`/`routelegs` by the voyage's `serviceId`. After a route edit (allowed while no round is Active/Completed) it can list ports that are not in the round, or omit ones that are. The round's snapshot is the source of truth everywhere else. Impact is limited because the dropdown only informs the form; POL/POD come from the voyage.

### FL-09 (Low) — Duplicate containers
No unique index and no service check on `containerNumber` within a round. The form can create the same container twice (double capacity, double invoice item). Import keeps a `containerNumber → one doc` map, but `updateMany({containerNumber:{$in}})` marks **all** duplicates Final Loading. DB currently has none.

### FL-10 (Low) — Layer 1 details
`manualBooking.service.create` stores `data.status || 'Pending'` (Layer 2 coerces Cancelled to Pending; `docs/04` says both do). A Layer 1 booking can be created already Cancelled. One Layer 1 row is `Final Loading` in the test DB although that status has no downstream effect for Layer 1. Delete has no guard by design.

### FL-11 (Low) — Manual voyage order
A manual voyage takes `lastVoyageSeq + 1`, i.e. the end of the chain. The capacity walk and discharge resolution use `sequence`; the UI's display re-sort (`voyageDisplayOrder.js`) is rendering-only. A manual voyage that logically sits between two legs is processed last. With FL-01 fixed this would matter; today it is masked.

### FL-12 / FL-13 (Info) — Data and docs
- Data: see 1.2. The 25 legacy rounds exercise the fallback paths (live route for manual-voyage ports, lazy `lastVoyageSeq`), which is useful for regression but means the snapshot rules were never exercised on the seeded rounds. Clean the probe leftovers with `seed:test-data -- --reset` before a demo.
- Docs to correct when the owner decides: `04` "Final Loading → Cancelled allowed" (FL-05); `04` "Create with status Cancelled is coerced to Pending" (Layer 2 only); `03` capacity formula (FL-01); CLAUDE.md status-flow line.

### FL-14 (Medium, owner decision) — No second round for a busy vessel
`round.service.create` calls `assertVesselFree` for any new round, including `Planned`. A vessel with an Active round cannot have the next round set up; the documented "known limitation" (docs/03). The DB index only restricts **Active** rounds, so relaxing the service check for Planned rounds would be safe. Decide before the commercial team needs advance planning.

---

## 5. Carried forward (not re-probed)
RV-17 (generated voyages have no dates or names), RV-36 (`RouteLeg.agentId` informational), RV-38 (voyage delete ignores Layer 1, tracking, unposted voyage expenses), RV-39 (status coupling, now also FL-06), RV-40 (service code/status edits unguarded), RV-41 (`round-ports` lists a repeated port twice).

## 6. Suggested order of work
1. **Owner decision on FL-01** (capacity formula) — until then capacity numbers and enforcement must not be relied on. Add unit tests for the cargo chain at the same time.
2. **Import hardening (FL-02, FL-03, FL-04)** in `bookingImport.service.js` only: server-side re-resolution, status/invoice guards on updates, all-or-nothing Final Loading with a "will cancel N" confirmation. Write a probe like `rounds-voyages-probe.js` for these paths first (it is the only place rules are verified against a real DB).
3. FL-05/FL-06: decide status rules (allow Final Loading → Cancelled with invoice guard; refuse voyage Cancelled / round Completed with live bookings) and align docs.
4. FL-14 decision, then FL-08/09/10/11 hygiene.
5. Run `npm run test:int` on a local replica set and add cases for the round/voyage/booking rules (none exist), then a browser pass over Routes, Rounds, Voyages, Bookings, Import.

## 7. Files read
Backend: `rounds/{round.service,round.logic,round.model,round.routes,roundLock}`, `voyages/{voyage.service,voyage.logic,voyage.model,voyage.routes,voyage.controller}`, `routes/route.service`, `services/{service.service,service.routes}`, `utils/{voyageGenerator,dependents}`, `bookings/{booking.service,booking.model,booking.validation,booking.routes,booking.controller,bookingImport.service,manualBooking.service}`, `capacity/capacity.service`, `billing/bookingItem.service`, `partnerSettlement/roundClose.service` (checklist), `agents/agent.service#assertBookingSource`. Frontend: module and page file lists, `BookingForm.jsx` (status lock). Docs: `03`, `04`, CLAUDE.md, `sprints/STATUS.md`, both existing audits.
**Not read in depth:** tracking module internals, reports/dashboard aggregations, invoice wizard, `route.controller`, frontend components other than the status lock. Re-check `docs/07`, `docs/08` before relying on them.
