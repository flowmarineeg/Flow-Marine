# 03 — Rounds, Voyages & Capacity

Modules `rounds`, `voyages`, `capacity`; utils `voyageGenerator.js`, `teuResolver.js`. Routes `/rounds`, `/voyages`, `/capacity`. UI: `/rounds`, `/rounds/[id]`, `/voyages`.

> **Rule R10:** do not modify `capacity.service.js`, `teuResolver.js`, `voyageGenerator.js` for money/V2 work. Anything that mutates bookings, voyages or rounds must call `invalidateRoundCache(roundId)`.

## Concepts
- **Round** — one commercial cycle of a Service on a Vessel between two dates. It is the unit of P&L, closing and partner settlement.
- **Voyage** — one leg (POL → POD) of a Round. Generated automatically, one per consecutive pair of the Service route's legs (N legs → N−1 voyages).

## Schema `Round`
`roundNumber` (unique `R000001`), `roundName`, `serviceId`, `vesselId`, `startDate < endDate`, `status`, `notes`, `voyageIds[]` (denormalised cache — reports resolve voyages via `Voyage.find({roundId})` instead).
V2 financial axis (independent of `status`): `v2` (true on every new Round), `closeStatus` `Open|ReadyToClose|Closed`, `settlementMode` `Accrual|Cash`, `carryForwardMinor`, `lockVersion`, `closedAt/By`, `reopenedAt/By`, `reopenReason`.
Indexes: serviceId, vesselId, status, startDate.

## Schema `Voyage`
`voyageNumber` (unique, `{serviceCode}-{roundNumber}-{seq:02d}`), `voyageCode`, `voyageName`, `roundId`, `serviceId`, `polId`, `podId`, `sequence`, `etd/eta/etp/atd/ata`, `status`, `isManual`.
Indexes: `(roundId,sequence)`, `(roundId,status)`, `(serviceId,status,etd)`, `(status,etd)`, `isManual`.
Display uses `getVoyageLabel(v)` (name, fallback to number). Display re-sorting (`voyageDisplayOrder.js`, frontend) is rendering-only — **never write `Voyage.sequence`** from it.

## Status flows
| Entity | Flow (enforced in service) |
|---|---|
| Round (`round.service.js`) | Planned → Active \| Cancelled; Active → Completed \| Cancelled; Completed, Cancelled terminal. Service cannot change after creation. |
| Voyage (`voyage.service.js`) | Scheduled → Departed \| Cancelled; Departed → In Transit \| Arrived \| Cancelled; In Transit → Arrived \| Cancelled; **Arrived → Completed only**; Completed, Cancelled terminal. |
| Voyage override | holders of `voyages:override` (or SuperAdmin) skip the transition table entirely (`voyage.controller.js#update`). |

Side effect: when a Round becomes **Active** (create with `status:Active`, or Planned→Active), its **first** voyage (lowest `sequence`, only if `Scheduled`) is moved to `Departed` (`cascadeFirstVoyageToDeparted`). Not reversible, no tracking entry written. Later legs stay Scheduled.

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

## Round creation (`round.service.create`)
1. Service must exist and have a Route with **≥ 2 legs**.
2. The vessel must not already be on another **Active** round.
3. `startDate < endDate`.
4. `nextNumber('round')`, create Round (`v2:true`, `voyageIds:[]`).
5. `generateVoyages` inserts one Voyage per consecutive leg pair (status Scheduled); `round.voyageIds` is then filled.
6. If created Active → first-voyage cascade.
Returns `{round, voyages}`. Editable afterwards: `vesselId, startDate, endDate, status, notes, roundName`. Changing vessel re-checks the Active-conflict rule. Update → `invalidateRoundCache`.

## Manual voyages (`voyage.createManualVoyage`)
Adds a voyage to an existing, not Completed/Cancelled Round. POL and POD must both be on the service route, differ from each other, and `sequence = last + 1`. `isManual:true`; number gets a `-M` suffix on collision; pushed to `round.voyageIds`.

## Updating voyages
Editable: `etd, eta, etp, atd, ata, status, voyageCode, voyageName`. POL/POD/round never change. Calls the round-lock pre-check and invalidates the capacity cache.

## Deleting
- **Voyage:** refused with active (non-Cancelled) bookings, or `DEPENDENTS.voyage` (ledger lines, posted expenses, invoiced items). Removes unlocked `BookingItem`s, pulls it from `round.voyageIds`.
- **Round:** refused if any voyage has bookings, manual bookings or any expense (round- or voyage-scoped), or `DEPENDENTS.round`. Then deletes Suggested transfers, Draft settlements, unlocked `BookingItem`s, **its voyages**, and the round. The only cascade in the system.
- Round-lock pre-check applies to both.

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
