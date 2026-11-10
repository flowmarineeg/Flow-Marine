# 03 — Rounds, Voyages & Capacity

Modules `rounds`, `voyages`, `capacity`; utils `voyageGenerator.js`, `teuResolver.js`. Routes `/rounds`, `/voyages`, `/capacity`. UI: `/rounds`, `/rounds/[id]`, `/voyages`.

> **Rule R10:** do not modify `capacity.service.js`, `teuResolver.js`, `voyageGenerator.js` for money/V2 work. **Exception, owner decision 2026-11-10:** `capacity.service.js` was rewritten to work per leg (below); `teuResolver.js` and `voyageGenerator.js` are still untouched. Anything that mutates bookings, voyages or rounds must call `invalidateRoundCache(roundId)`.

## Concepts
- **Round** — one commercial cycle of a Service on a Vessel between two dates. It is the unit of P&L, closing and partner settlement.
- **Voyage** — one **run** over a range of the Round's legs in one direction (East / West / North / South), e.g. `V0001E` from leg 1 to leg 4 and `V0002W` back from leg 4 to leg 1. **Voyages are never generated**: the user adds each one after the round exists (reworked 2026-11-08, `sprints/routes-rounds-voyages-2026-11-08-sprint.md`). `polId`/`podId` are the first/last port of the run, so bookings, import, reports and invoices keep reading a voyage as POL → POD.
- **Round legs** — when a Round is created the Service route's legs are **copied into the round** (`routeSnapshot.legs`, each with a stable `legKey`) and can then be edited on the round without touching the Service route.

## Schema `Round`
`roundNumber` (unique `R000001`), `roundName`, `serviceId`, `vesselId`, `startDate < endDate`, `status`, `notes`, `voyageIds[]` (denormalised cache — reports resolve voyages via `Voyage.find({roundId})` instead).
V2 financial axis (independent of `status`): `v2` (true on every new Round), `closeStatus` `Open|ReadyToClose|Closed`, `settlementMode` `Accrual|Cash`, `carryForwardMinor`, `lockVersion`, `closedAt/By`, `reopenedAt/By`, `reopenReason`.
`routeSnapshot` = the round's **own editable legs** (`{routeId, capturedAt, legs[{sequence, legKey, countryId, cityId, portId, terminalId, agentId, portName, portCode}]}`, see "Round legs") and `lastVoyageSeq` (monotonic per-round voyage sequence, 0 at creation).
Indexes: serviceId, vesselId, status, startDate, and the partial unique `one_active_round_per_vessel` (`vesselId` where `status:'Active'`).

## Schema `Voyage`
`voyageNumber` (unique, **`V` + 4-digit global counter from 0001 + direction letter**: `V0001E`, `V0002W`, `V0003N`, `V0004S`; the letter comes from `direction`, which never changes), `voyageCode`, `voyageName`, `roundId`, `serviceId`, `direction` (`East|West|North|South`), `fromLegKey`/`toLegKey` (any two different legs of the round, forward or reverse), `portCalls[{legKey, portId, portName, portCode, eta, etd}]` (ports of the run in travel order, snapshot taken at creation / refresh), `polId`/`podId` (= first/last port call), `sequence` (creation order inside the round), `etd/eta/etp/atd/ata` (voyage-level: first departure / last arrival), `status`, `isManual` (always true for new voyages; kept for old data).
Indexes: `(roundId,sequence)`, `(roundId,status)`, `(serviceId,status,etd)`, `(status,etd)`, `isManual`.
Display uses `getVoyageLabel(v)` (name, fallback to number). Display re-sorting (`voyageDisplayOrder.js`, frontend) is rendering-only — **never write `Voyage.sequence`** from it.

## Status flows
| Entity | Flow (enforced in service) |
|---|---|
| Round (`round.service.js`) | Planned → Active \| Cancelled; Active → Completed \| Cancelled; Completed, Cancelled terminal. Service cannot change after creation. |
| Voyage (`voyage.service.js`) | Scheduled → Departed \| Cancelled; Departed → In Transit \| Arrived \| Cancelled; In Transit → Arrived \| Cancelled; **Arrived → Completed only**; Completed, Cancelled terminal. |
| Voyage override | holders of `voyages:override` (or SuperAdmin) skip the transition table entirely (`voyage.controller.js#update`) — never the date rules below. |

A Round becoming **Active** no longer touches its voyages (the old "first voyage → Departed" cascade was removed 2026-11-08): voyage status is always set by the user. **A voyage only moves to Departed / In Transit / Arrived / Completed while its Round is Active** (`400`, RV-39; holders of `voyages:override` bypass it). A voyage is always created `Scheduled`.

## Routes
| Method | Path | Perm |
|---|---|---|
| GET | `/rounds`, `/rounds/:id`, `/rounds/:id/voyages` | `rounds` |
| POST | `/rounds` | `rounds` — creates the round with a copy of the route legs and **no voyages** |
| PUT | `/rounds/:id/legs` | `rounds` — replaces the round's own legs (full ordered list); returns the round + `warnings[]` |
| PUT / DELETE | `/rounds/:id` | `rounds` |
| GET | `/voyages` (roundId, serviceId, status[comma list], polId, podId), `/voyages/:id`, `/voyages/round-ports/:roundId` (the round's legs with `legKey`) | `voyages` |
| POST | `/voyages` | `voyages` — adds a voyage `{roundId, direction, fromLegKey, toLegKey, voyageName, voyageCode?, etd?, eta?, etp?, atd?, ata?, portCalls?[{legKey,eta,etd}]}` |
| POST | `/voyages/:id/refresh-port-calls` | `voyages` — rebuilds the voyage's ports from the round's current legs |
| PUT / DELETE | `/voyages/:id` | `voyages` |
| GET | `/capacity/round/:roundId` | `rounds` |
| GET | `/capacity/vessel/:vesselId/active` | `vessels` |
| POST | `/capacity/preview` | `bookings` |
Round close / reopen / checklist: `/round-accounting/rounds/:id/*` — see below and [11](11-accounting.md).

## Invariants (enforced in the services, not only the UI)
1. A Round references an existing, **Active** Service and **Active** Vessel and a Service route with ≥ 2 legs.
2. A new Round starts only as `Planned` or `Active` (`round.logic.assertInitialStatus`).
3. A vessel has at most one `Active` Round: checked on create, on a vessel change **and whenever a Round becomes Active**; the partial unique index closes the race (`409 VESSEL_HAS_ACTIVE_ROUND`).
4. A Round keeps its own copy of the route legs (`routeSnapshot`); editing the Service route never changes it, and editing the round's legs never changes the Service route.
5. A Cancelled or Completed Round accepts no new bookings (`roundLock.assertRoundBookable`, called by `booking.service` and `manualBooking.service` on top of the voyage-status check).
6. Voyage dates/status are validated on the **complete resulting state** (`voyage.logic.js`).
7. Multi-step writes are transactions: round creation, route-leg replacement, round cancel cascade, round delete, voyage create/delete, service delete.
8. Anything that changes a round's voyages calls `invalidateRoundCache(roundId)` after the write succeeded (voyage create, refresh and delete included).
9. A voyage always starts `Scheduled`, is created only on a Planned/Active round, and its run (`fromLegKey`→`toLegKey`) must name two different legs of the round; consecutive identical ports inside the run are refused.

## Round creation (`round.service.create`)
1. Validate (nothing is written yet): status ∈ {Planned, Active}; Service exists and is Active; Vessel exists and is Active; Service has a Route with **≥ 2 legs** and no two consecutive identical ports; the vessel is not on another Active round; `startDate < endDate`.
2. `nextNumber('round')` — an atomic counter **outside** the transaction. A rolled-back create burns a number (a gap is acceptable; a duplicate is impossible).
3. One transaction: create the Round (`v2:true`, `routeSnapshot` = copy of the route legs with a fresh `legKey` per leg, `voyageIds: []`, `lastVoyageSeq: 0`). **No voyages are generated** (`voyageGenerator.js` is no longer called; the file is untouched, R10).
Returns `{round, voyages: []}`; the UI sends the user to the round page to add voyages.

## Round update
Editable: `vesselId, startDate, endDate, status, notes, roundName`. Service cannot change.
- Vessel change → vessel must exist and be Active, and be free of another Active round.
- Status transitions follow the table above. **→ Active** re-runs the vessel-free check. **→ Cancelled** is refused (`409 ROUND_HAS_BOOKINGS`) while any non-Cancelled booking (Layer 1 or 2) exists on its voyages — bookings are never auto-cancelled; once none are live, the round and every voyage still `Scheduled / Departed / In Transit` become `Cancelled` in one transaction (`Arrived` / `Completed` voyages stay as history).
- Existing rounds whose Service or Vessel is later deactivated keep working; only **new** rounds (and a vessel change) require Active.
- Update → `invalidateRoundCache`.

## Round legs (`Round.routeSnapshot`, `round.service.updateLegs`)
`Round.routeSnapshot = { routeId, capturedAt, legs[{ sequence, legKey, countryId, cityId, portId, terminalId, agentId, portName, portCode }] }`, copied from the Service route at creation. It is the round's **own editable leg list**: `GET /voyages/round-ports/:roundId`, voyage creation and refresh read it (no fallback to the live route any more). The Service route stays editable while it has no Active/Completed round (`route.service.saveLegs`); the round is unaffected.

`PUT /rounds/:id/legs` with the full ordered list `[{legKey?, countryId, cityId, portId, terminalId?, agentId?}]`:
- same validation as the Service route (`route.service.validateLegs`: ≥ 2 legs, country → city → port chain, terminal in port, agent exists, no two consecutive identical ports);
- refused on a Completed/Cancelled round or a closed round (`ROUND_CLOSED`); allowed on Planned/Active;
- `legKey` is kept only if it already exists on the round and is not repeated; a new leg gets a new key; `sequence` is the list order;
- **legs used by voyages stay editable.** The change is saved; the response carries `warnings[]` naming each live voyage whose leg was removed or whose port no longer matches. Voyages keep their own `portCalls` snapshot (nothing is rewritten silently) until `POST /voyages/:id/refresh-port-calls`;
- invalidates the capacity cache.

## Route legs (`route.service.saveLegs`)
Validated in full **before** any write: ≥ 2 legs; ids well-formed; country exists; city exists and belongs to the country; port exists and belongs to the city and country; terminal (if given) exists and belongs to the port; agent (if given) exists; **no two consecutive legs on the same port** (A-B-C-A is fine). References are batch-loaded. Replacement (upsert route, delete legs, insert legs) is one transaction, so a failure keeps the old legs and a concurrent reader never sees an empty route. `RouteLeg.agentId` is stored and protected by `DEPENDENTS.agent`, but is **informational**: no expense/handling workflow consumes it yet (RV-36 deferred).

## Creating a voyage (`voyage.service.createVoyage`)
Input `{direction, fromLegKey, toLegKey, voyageName, voyageCode?, dates, portCalls?}` on an existing Planned/Active, not closed round.
1. `buildPortCalls(legs, from, to)` (`voyageRun.logic.js`): both keys must exist and differ; the ports are taken in travel order, **forward (leg 1 → 4) or reverse (4 → 1)**, including every leg in between. Per-port `eta/etd` may be sent in `portCalls` (a departure earlier than the arrival at the same port is `400`).
2. `polId`/`podId` = first/last port; voyage `etd`/`eta` default to the first departure / last arrival; status is forced to `Scheduled`; `direction` must be one of East/West/North/South.
3. Number: `nextNumber('voyage')` (atomic global counter, outside the transaction, so a failed create burns a number) + direction letter → `V0001E`. `sequence` comes from the round's monotonic `lastVoyageSeq` (so the position of a deleted voyage is never reused).
4. One transaction inserts the voyage and pushes it to `round.voyageIds`; the capacity cache is invalidated after commit.
Returns the voyage plus `warnings[]`: schedule warnings (below) and **overlap warnings** — another live voyage of the round has the same direction and shares legs (never an error; there is no limit on voyages per round).

`POST /voyages/:id/refresh-port-calls` rebuilds `portCalls`, `polId`, `podId` from the round's *current* legs (dates carried over by `legKey`); `400` if the voyage's `fromLegKey/toLegKey` no longer exist; `409` while live (non-Cancelled) bookings (Layer 1 or 2) use the voyage, because their POL/POD were copied from it.

## Updating voyages
Editable: `etd, eta, etp, atd, ata, status, voyageCode, voyageName`, and the per-port `portCalls[{legKey, eta, etd}]` dates. Direction, run, POL/POD and round never change. Calls the round-lock pre-check and invalidates the capacity cache.
- **Errors (400):** `eta < etd`, `ata < atd`, and — when the status changes into it — `Departed` without `atd`, `Arrived` without `ata`. The rule is checked against the merged state (stored values + patch). Legacy rows already `Departed` without an `atd` can still be edited for other fields. `voyages:override` skips only the transition table, never these.
- **Warnings (response `data.warnings[]`, still saved):** a date outside the round's `startDate`–`endDate`; `etd` earlier than the previous voyage's `eta`. Dates are never rewritten.

## Deleting
- **Voyage:** any voyage may go (voyages are independent runs, so there is no chain to protect); survivors are never renumbered. Refused with active (non-Cancelled) bookings, or `DEPENDENTS.voyage`: ledger lines, posted expenses, invoiced items and — since 2026-11-08 (RV-38) — Layer 1 `ManualBooking` of any status, tracking entries and unposted expenses. Removes unlocked `BookingItem`s and pulls it from `round.voyageIds` in one transaction; invalidates the capacity cache.
- **Round:** all guards and cleanup run in one transaction (no swallowed errors): refused if any voyage has bookings, manual bookings or any expense (round- or voyage-scoped), or `DEPENDENTS.round`. Then deletes Suggested transfers, Draft settlements, unlocked `BookingItem`s, **its voyages**, and the round. The only cascade in the system.
- **Service:** `DEPENDENTS.service` (rounds of **any** status, voyages, tracking). If nothing blocks, its Route + legs are deleted with it, in one transaction.
- **Port:** terminals, current route legs, and `DEPENDENTS.port` (voyages as POL/POD, bookings, manual bookings, round snapshots). **Agent:** `DEPENDENTS.agent` now also counts bookings, route legs and round snapshots.
- Round-lock pre-check applies to Round and Voyage deletes.

## Database changes / deployment
- `npm run migrate:rounds-voyages [-- --dry]` — idempotent. Reports vessels with more than one Active round (ids) and **stops without touching data** if any exist (complete/cancel the extras, re-run); otherwise creates `one_active_round_per_vessel`; reports legacy rounds without `routeSnapshot` (not backfilled: the original route is unknown). Back up `rounds` first; rollback `db.rounds.dropIndex('one_active_round_per_vessel')`.
- **Routes/rounds/voyages rework (2026-11-08): no data migration.** The owner dropped the old (test) data. Rounds and voyages created before this change have no `legKey` / `direction` / `portCalls` and are **not supported** by the new screens (voyage creation and leg edits need `legKey`s); rebuild the test DB with `SEED_ALLOW_REMOTE=yes npm run seed:test-data -- --reset`, then `seed:chart`, `seed:locations`, `migrate:masterdata`.
- Transactions need a replica set (already required by the project).
- Regression checks: `npm test` (pure logic, 86 passing) · `node scripts/audit-probes/rounds-voyages-probe.js` against a running dev server on the disposable DB (64 checks, rewritten 2026-11-08 for the new flow, also forces rollback paths by calling services directly).

## Known limitations
- Cancelling a round keeps `Arrived` voyages as they are.
- **Cancelling a voyage cancels its bookings (2026-11-10).** `PUT /voyages/:id {status:"Cancelled"}` cancels, in the **same transaction** as the voyage, every non-Cancelled Layer 2 booking and Layer 1 estimate on it; the response carries `cancelled: {bookings, estimates}`. Refused with `409` if one of the bookings is on a live invoice line (credit note / cancel the invoice first). BookingItems re-sync afterwards, the capacity cache is invalidated. The edit form warns before saving.
- Creating even a *Planned* round for a vessel that has an Active round is still refused (pre-existing behaviour, FL-14).
- RV-17 (bare generated voyages) no longer applies: voyages are created by the user. There is still no transit-days model. `RouteLeg.agentId` is informational (RV-36 deferred).
- **Bookings and intermediate ports (bookings sprint 2026-11-10, `docs/04`).** A booking now has its **own** `polId/podId` (any ports of the run, intermediate ones included); the server finds the voyage whose `portCalls` visit POL then POD (direction implicit) and stores `polLegKey/podLegKey`; ties between several runs are ranked (not yet departed, earliest departure) or reported `ambiguous`. The **capacity engine** was rewritten **per leg** the same day (section "Capacity engine"), so bookings that start or end at intermediate ports are counted on exactly the legs they sail.
- Fixed 2026-11-08: RV-38 (voyage delete now blocked by Layer 1 bookings, tracking, any expense), RV-39 (voyage always created Scheduled; Departed/In Transit/Arrived/Completed need an Active round unless `voyages:override`). Still open: RV-39's "Round → Completed ignores its voyages" part (FL-06, booking sprint), RV-40 (service code edits), RV-41 (`round-ports` lists a repeated port twice — now one row per leg with its own `legKey`, which is intended).
- UI: Services and their route editor live under Operations → Routes (`/routes`, `/routes/[id]`, perm `services` for the list and `routes` for the legs); Rounds at `/rounds`, `/rounds/[id]`; Voyages at `/voyages`.
- `test:int` has no cases for these rules yet (needs a local replica set).

## Capacity engine (per leg, rewritten 2026-11-10 — fixes FL-01 / BK-02)
`capacity.service.js` (cached 60 s per round) + the pure maths in `capacityLegs.logic.js` (unit-tested, `capacityLegs.logic.test.js`).

- **Model.** A voyage is one run; its `portCalls` give the ports in order, so it has *ports − 1* **segments** (port i → port i+1). A booking from POL to POD sits **aboard on every segment between its two calls** on the voyage the server assigned to it. TEU aboard per segment is compared with the vessel capacity. **Both layers count**: Layer 2 = one container, TEU from its size (`teuResolver`); Layer 1 = the estimate's `totalTEU`. Statuses counted: Pending, Confirmed, Final Loading (Cancelled never).
- **Position of a booking in its run:** its stored `polLegKey/podLegKey` when they still name its ports, otherwise the ports decide (older bookings, edited legs); a booking whose ports are not on its voyage's run is excluded with `BOOKING_PORT_NOT_IN_ROUND` / `L1_BOOKING_PORT_NOT_IN_ROUND`.
- **Runs are separate sailings:** cargo never carries from one voyage into the next. Cancelled voyages are excluded (and their bookings are cancelled with them). A booking marked **Remaining** by a discharge import stays aboard on every later segment of its run (warning `REMAINING_ONBOARD_PAST_DISCHARGE`).
- **Per voyage row** (shape kept for the existing screens): `loadedTEU`, `dischargedTEU` (totals over the run), `onboardTEU` = **peak over its segments**, `remainingTEU`/`utilisationPct` from that peak, `onboardStart` 0, `layer1/layer2`, `loadedExact` (bookings spanning the whole run), **new** `direction`, `segments[]` (`fromPort,toPort,loadedTEU` at the start port, `dischargedTEU` at the end port, `onboardTEU`, `remainingTEU`, `utilisationPct`, `layer1/layer2.onboardTEU`) and `ports[]`.
- Totals: `peakOnboardTEU`, `peakVoyageId`, `avgUtilisationPct` (of the voyage peaks), `totalLoadedTEU`, `totalBookedUnits`. `warnings[]`: `MISSING_CONTAINER_TYPE`, `MISSING_TEU_MAPPING`, `BOOKING_PORT_NOT_IN_ROUND`, `L1_BOOKING_PORT_NOT_IN_ROUND`, `CANCELLED_VOYAGES_EXCLUDED`, `REMAINING_ONBOARD_PAST_DISCHARGE`, and `VOYAGE_OVERBOOKED` **per overbooked segment** ("overbooked by N TEU between A and B").
- **Pre-flight:** `POST /capacity/preview {roundId, voyageId, containerTypeId, podId?, polId?}` and `computeRoutePreview`: would the TEU fit on **every** segment between POL and POD (no ports = the whole run); the answer names the worst leg. Used by `booking.service.create` **and** `manualBooking.service.create` when env `ENABLE_CAPACITY_ENFORCEMENT` is `warn` (created, `_capacityWarning` attached) or `strict` (400); `off` is the default.
- `GET /reports/round-capacity` wraps the same engine (`statuses` filter, uncached). UI: the voyage cards of the Round Capacity Report show a **per-leg table** (loaded, discharged, aboard, L1/L2, remaining, utilisation).
- Verified: unit tests; `bookings-probe` CP-01…05 (segment figures east and west, intermediate ports counted, preview); on the re-seeded DB utilisation is now real (e.g. Round C eastbound 31/34/31 TEU on 2,800 TEU) instead of always 0 %.

## Round closing (summary — full detail in [11](11-accounting.md))
`closeStatus` Open → ReadyToClose → Closed, Closed → Open via reopen (reason required). Close is blocked by: open PDAs (overridable with `rounds:closeOverride` + written reason), draft V2 invoices, voyages not Completed/Cancelled, vessel without partner shares. On close the settlement is calculated and a closing journal entry posted; a closed round rejects every further mutation (`ROUND_CLOSED`).

## Related modules
Bookings ([04](04-bookings.md)) hang off voyages; expenses ([05](05-expenses.md)) off round/voyage/port; tracking ([07](07-tracking.md)) off voyage; invoices ([06](06-invoices.md)) snapshot round+voyage; reports ([08](08-reports-dashboard.md)) aggregate by round.
