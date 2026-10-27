# 03 — Rounds, Voyages & Capacity

Modules `rounds`, `voyages`, `capacity`; utils `voyageGenerator.js`, `teuResolver.js`. Routes `/rounds`, `/voyages`, `/capacity`. UI: `/rounds`, `/rounds/[id]`, `/voyages`.

> **Rule R10:** do not modify `capacity.service.js`, `teuResolver.js`, `voyageGenerator.js` for money/V2 work. Anything that mutates bookings, voyages or rounds must call `invalidateRoundCache(roundId)`.

## Concepts
- **Round** — one commercial cycle of a Service on a Vessel between two dates. It is the unit of P&L, closing and partner settlement.
- **Voyage** — one leg (POL → POD) of a Round. Generated automatically, one per consecutive pair of the Service route's legs (N legs → N−1 voyages).

## Schema `Round`
`roundNumber` (unique `R000001`), `roundName`, `serviceId`, `vesselId`, `startDate < endDate`, `status`, `notes`, `voyageIds[]` (denormalised cache — reports resolve voyages via `Voyage.find({roundId})` instead).
V2 financial axis (independent of `status`): `v2` (true on every new Round), `closeStatus` `Open|ReadyToClose|Closed`, `settlementMode` `Accrual|Cash`, `carryForwardMinor`, `lockVersion`, `closedAt/By`, `reopenedAt/By`, `reopenReason`.
`routeSnapshot` (route as of creation, see below) and `lastVoyageSeq` (monotonic manual-voyage counter) were added 2026-10-26; both are absent on older rounds.
Indexes: serviceId, vesselId, status, startDate, and the partial unique `one_active_round_per_vessel` (`vesselId` where `status:'Active'`).

## Schema `Voyage`
`voyageNumber` (unique, `{serviceCode}-{roundNumber}-{seq:02d}`), `voyageCode`, `voyageName`, `roundId`, `serviceId`, `polId`, `podId`, `sequence`, `etd/eta/etp/atd/ata`, `status`, `isManual`.
Indexes: `(roundId,sequence)`, `(roundId,status)`, `(serviceId,status,etd)`, `(status,etd)`, `isManual`.
Display uses `getVoyageLabel(v)` (name, fallback to number). Display re-sorting (`voyageDisplayOrder.js`, frontend) is rendering-only — **never write `Voyage.sequence`** from it.

## Status flows
| Entity | Flow (enforced in service) |
|---|---|
| Round (`round.service.js`) | Planned → Active \| Cancelled; Active → Completed \| Cancelled; Completed, Cancelled terminal. Service cannot change after creation. |
| Voyage (`voyage.service.js`) | Scheduled → Departed \| Cancelled; Departed → In Transit \| Arrived \| Cancelled; In Transit → Arrived \| Cancelled; **Arrived → Completed only**; Completed, Cancelled terminal. |
| Voyage override | holders of `voyages:override` (or SuperAdmin) skip the transition table entirely (`voyage.controller.js#update`) — never the date rules below. |

Side effect: when a Round becomes **Active** (create with `status:Active`, or Planned→Active), its **first** voyage (lowest `sequence`, only if `Scheduled`) is moved to `Departed` and gets `atd = now` if it had none (`cascadeFirstVoyageToDeparted`). Not reversible, no tracking entry written. Later legs stay Scheduled.

## Routes
| Method | Path | Perm |
|---|---|---|
| GET | `/rounds`, `/rounds/:id`, `/rounds/:id/voyages` | `rounds` |
| POST | `/rounds` | `rounds` — creates round **and** voyages |
| PUT / DELETE | `/rounds/:id` | `rounds` |
| GET | `/voyages` (roundId, serviceId, status[comma list], polId, podId), `/voyages/:id`, `/voyages/round-ports/:roundId` | `voyages` |
| POST | `/voyages` | `voyages` — adds a **manual** voyage to a round |
| PUT / DELETE | `/voyages/:id` | `voyages` |
| GET | `/capacity/round/:roundId` | `rounds` |
| GET | `/capacity/vessel/:vesselId/active` | `vessels` |
| POST | `/capacity/preview` | `bookings` |
Round close / reopen / checklist: `/round-accounting/rounds/:id/*` — see below and [11](11-accounting.md).

## Invariants (enforced in the services, not only the UI)
1. A Round references an existing, **Active** Service and **Active** Vessel and a Service route with ≥ 2 legs.
2. A new Round starts only as `Planned` or `Active` (`round.logic.assertInitialStatus`).
3. A vessel has at most one `Active` Round: checked on create, on a vessel change **and whenever a Round becomes Active**; the partial unique index closes the race (`409 VESSEL_HAS_ACTIVE_ROUND`).
4. A Round keeps its own copy of the route it was generated from (`routeSnapshot`); editing the Service route never changes it.
5. A Cancelled or Completed Round accepts no new bookings (`roundLock.assertRoundBookable`, called by `booking.service` and `manualBooking.service` on top of the voyage-status check).
6. Voyage dates/status are validated on the **complete resulting state** (`voyage.logic.js`).
7. Multi-step writes are transactions: round creation, route-leg replacement, round cancel cascade, round delete, voyage create/delete, service delete.
8. Anything that changes a round's voyages calls `invalidateRoundCache(roundId)` after the write succeeded (manual voyage create and delete included).

## Round creation (`round.service.create`)
1. Validate (nothing is written yet): status ∈ {Planned, Active}; Service exists and is Active; Vessel exists and is Active; Service has a Route with **≥ 2 legs** and no two consecutive identical ports; the vessel is not on another Active round; `startDate < endDate`.
2. `nextNumber('round')` — an atomic counter **outside** the transaction. A rolled-back create burns a number (a gap is acceptable; a duplicate is impossible).
3. One transaction: create the Round (`v2:true`, `routeSnapshot`, `lastVoyageSeq = N-1`), `generateVoyages` inserts one Voyage per consecutive leg pair (status Scheduled), `round.voyageIds` is filled, and if created Active the first-voyage cascade runs. Any failure rolls everything back. (`voyageGenerator.js` is untouched: it joins the transaction through `mongoose.set('transactionAsyncLocalStorage', true)` in `config/db.js`.)
Returns `{round, voyages}`.

## Round update
Editable: `vesselId, startDate, endDate, status, notes, roundName`. Service cannot change.
- Vessel change → vessel must exist and be Active, and be free of another Active round.
- Status transitions follow the table above. **→ Active** re-runs the vessel-free check. **→ Cancelled** is refused (`409 ROUND_HAS_BOOKINGS`) while any non-Cancelled booking (Layer 1 or 2) exists on its voyages — bookings are never auto-cancelled; once none are live, the round and every voyage still `Scheduled / Departed / In Transit` become `Cancelled` in one transaction (`Arrived` / `Completed` voyages stay as history).
- Existing rounds whose Service or Vessel is later deactivated keep working; only **new** rounds (and a vessel change) require Active.
- Update → `invalidateRoundCache`.

## Route snapshot
`Round.routeSnapshot = { routeId, capturedAt, legs[{ sequence, countryId, cityId, portId, terminalId, agentId, portName, portCode }] }`, written at creation from the same leg list used to generate the voyages. `GET /voyages/round-ports/:roundId` and manual-voyage port validation read the snapshot; rounds **without** one (created before 2026-10-26) fall back to the live Service route. The Service route stays editable while it has no Active/Completed round (`route.service.saveLegs`); Planned rounds are unaffected because of the snapshot. Voyages are never regenerated when a route changes. `RoundDetail` shows the snapshot as "Route (at round creation)".

## Route legs (`route.service.saveLegs`)
Validated in full **before** any write: ≥ 2 legs; ids well-formed; country exists; city exists and belongs to the country; port exists and belongs to the city and country; terminal (if given) exists and belongs to the port; agent (if given) exists; **no two consecutive legs on the same port** (A-B-C-A is fine). References are batch-loaded. Replacement (upsert route, delete legs, insert legs) is one transaction, so a failure keeps the old legs and a concurrent reader never sees an empty route. `RouteLeg.agentId` is stored and protected by `DEPENDENTS.agent`, but is **informational**: no expense/handling workflow consumes it yet (RV-36 deferred).

## Manual voyages (`voyage.createManualVoyage`)
Adds a voyage to an existing, not Completed/Cancelled Round. POL and POD must both be on the round's route (snapshot, else live route) and differ. `sequence` comes from the round's monotonic `lastVoyageSeq` (allocated atomically; legacy rounds initialise it from `max(sequence)`), so the number of a deleted voyage is never issued again. Number format unchanged: `{serviceCode}-{roundNumber}-{seq:02d}`. `isManual:true`; pushed to `round.voyageIds` in the same transaction; capacity cache invalidated after commit. Returns the voyage plus `warnings[]`.

## Updating voyages
Editable: `etd, eta, etp, atd, ata, status, voyageCode, voyageName`. POL/POD/round never change. Calls the round-lock pre-check and invalidates the capacity cache.
- **Errors (400):** `eta < etd`, `ata < atd`, and — when the status changes into it — `Departed` without `atd`, `Arrived` without `ata`. The rule is checked against the merged state (stored values + patch). Legacy rows already `Departed` without an `atd` can still be edited for other fields. `voyages:override` skips only the transition table, never these.
- **Warnings (response `data.warnings[]`, still saved):** a date outside the round's `startDate`–`endDate`; `etd` earlier than the previous voyage's `eta`. Dates are never rewritten.

## Deleting
- **Voyage:** a **manual** voyage, or the **last generated** voyage, may go. A middle generated voyage is refused (`cancel it instead`) because it would break the POL/POD chain; survivors are never renumbered. Also refused with active (non-Cancelled) bookings, or `DEPENDENTS.voyage` (ledger lines, posted expenses, invoiced items). Removes unlocked `BookingItem`s and pulls it from `round.voyageIds` in one transaction; invalidates the capacity cache.
- **Round:** all guards and cleanup run in one transaction (no swallowed errors): refused if any voyage has bookings, manual bookings or any expense (round- or voyage-scoped), or `DEPENDENTS.round`. Then deletes Suggested transfers, Draft settlements, unlocked `BookingItem`s, **its voyages**, and the round. The only cascade in the system.
- **Service:** `DEPENDENTS.service` (rounds of **any** status, voyages, tracking). If nothing blocks, its Route + legs are deleted with it, in one transaction.
- **Port:** terminals, current route legs, and `DEPENDENTS.port` (voyages as POL/POD, bookings, manual bookings, round snapshots). **Agent:** `DEPENDENTS.agent` now also counts bookings, route legs and round snapshots.
- Round-lock pre-check applies to Round and Voyage deletes.

## Database changes / deployment
- `npm run migrate:rounds-voyages [-- --dry]` — idempotent. Reports vessels with more than one Active round (ids) and **stops without touching data** if any exist (complete/cancel the extras, re-run); otherwise creates `one_active_round_per_vessel`; reports legacy rounds without `routeSnapshot` (not backfilled: the original route is unknown). Back up `rounds` first; rollback `db.rounds.dropIndex('one_active_round_per_vessel')`.
- Transactions need a replica set (already required by the project).
- Regression checks: `npm test` (pure logic) · `node scripts/audit-probes/rounds-voyages-probe.js` against a running dev server on the disposable DB (47 checks, ~1 min, also forces rollback paths by calling services directly).

## Known limitations
- Rounds created before 2026-10-26 have no snapshot: editing their Service route (allowed while no round is Active/Completed) still changes what they read. Cancelling a round keeps `Arrived` voyages as they are.
- Creating even a *Planned* round for a vessel that has an Active round is still refused (pre-existing behaviour).
- Generated voyages have no dates or name and no transit-days model (RV-17 deferred). `RouteLeg.agentId` is informational (RV-36 deferred).
- `test:int` has no cases for these rules yet (needs a local replica set).

## Capacity engine
`capacity.service.js` computes per-voyage TEU flow for one Round and caches it 60 s per round.

- Inputs: non-Cancelled voyages in sequence order; Layer 2 bookings with status **Pending, Confirmed, Final Loading**; Layer 1 manual bookings (same statuses). Cancelled voyages and bookings are excluded (warning `CANCELLED_VOYAGES_EXCLUDED`).
- TEU per container from `ContainerType.size` (20→1, 40/40HC/45→2). Manual bookings use their stored `totalTEU`.
- A booking **loads** on its own voyage (matches its `polId`) and is **discharged** on the first voyage at or after it whose POD equals the booking `podId` (walks forward — never a global port map, so repeated ports are safe). A booking with `dischargeStatus:'Remaining'` is not subtracted at its planned discharge.
- Per voyage row: `loadedTEU`, `dischargedTEU`, `onboardStart` (= previous `onboardTEU`), `onboardTEU = onboardStart + loaded − discharged`, `remainingTEU = vessel.capacity − onboardTEU`, `utilisationPct`.
- Totals: `peakOnboardTEU`, `peakVoyageId`, `avgUtilisationPct`, `totalLoadedTEU`, `totalBookedUnits`. `warnings[]` include `MISSING_CONTAINER_TYPE`, `MISSING_TEU_MAPPING`, `BOOKING_PORT_NOT_IN_ROUND`, `Voyage … overbooked by N TEU`, and a "still onboard" warning for Remaining containers.
- `POST /capacity/preview` and `computeVoyagePreview(roundId, voyageId, containerTypeId, podId?)` answer "would one more container fit on every voyage it transits".
- Enforcement on booking create is controlled by env `ENABLE_CAPACITY_ENFORCEMENT`: off (default), `warn` (booking created, `_capacityWarning` attached), `strict` (400).
- `GET /reports/round-capacity` wraps the same engine with an optional `statuses` filter (uncached when used).

## Round closing (summary — full detail in [11](11-accounting.md))
`closeStatus` Open → ReadyToClose → Closed, Closed → Open via reopen (reason required). Close is blocked by: open PDAs (overridable with `rounds:closeOverride` + written reason), draft V2 invoices, voyages not Completed/Cancelled, vessel without partner shares. On close the settlement is calculated and a closing journal entry posted; a closed round rejects every further mutation (`ROUND_CLOSED`).

## Related modules
Bookings ([04](04-bookings.md)) hang off voyages; expenses ([05](05-expenses.md)) off round/voyage/port; tracking ([07](07-tracking.md)) off voyage; invoices ([06](06-invoices.md)) snapshot round+voyage; reports ([08](08-reports-dashboard.md)) aggregate by round.
