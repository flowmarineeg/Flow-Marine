# Audit — Service → Route legs → Round → Voyages (up to "set booking") — 2026-10-26

**Scope:** the setup chain that must be correct before the first booking: Service, its Route and legs, Round creation, automatic voyage generation, manual voyages, voyage editing, status/cancel/delete, and the guards other modules apply to that chain. Stops where a booking is created (`booking.service.js` / `manualBooking.service.js` are read only for the checks they make on a voyage).
**Method:** code reading (backend `services`, `routes`, `rounds`, `voyages`, `locations`, `utils/voyageGenerator.js`, `roundLock.js`; frontend `RouteEditor`, `RoundForm`, `VoyageAddForm`, `VoyageEditForm`) **plus 32 runtime probes** against the running dev server and the disposable Atlas test DB (`backend/scripts/audit-probes/rounds-voyages-probe.js`, raw results in `rounds-voyages-probe.result.json`). Each finding says whether it was **probed** (observed) or **code-only**.
**Rules respected:** nothing here touches `capacity.service.js`, `teuResolver.js` or `voyageGenerator.js` (R10). Every proposed fix lives in the round / voyage / route / service / location services.
**State:** remediated the same day — see "Remediation status" at the end. The findings below are the original audit text (their "Fix" sections describe what was implemented unless the status table says otherwise).

Severity: **High** = breaks an invariant the docs promise or lets money-bearing records attach to a dead/ghost parent; **Medium** = wrong or misleading result under realistic use; **Low** = hygiene / UI already mitigates.

## What works (verified)
- N legs → N−1 voyages, chained (POD of voyage n = POL of voyage n+1), sequence 1..N−1, number `{serviceCode}-{roundNumber}-{seq:02d}` (RV-16).
- Route edit is refused while a round of the service is Active or Completed (RV-15); closed rounds reject every voyage/round mutation (`roundLock`).
- Booking is refused on a Cancelled/Completed *voyage* (`booking.service.js:123`, `manualBooking.service.js:131`); advance booking on a Planned round works (RV-27, intended).
- Route needs ≥ 2 legs and the round needs a route (service + validator).

## Summary
| ID | Sev | Probed | Step | One line |
|---|---|---|---|---|
| RV-00 | High | yes | prerequisite | **Fixed 2026-10-26** — a vessel could not be created without `reeferPlugs` (validator rejected `null`), so no round could be set up for a new vessel without a value |
| RV-01 | High | yes | Round create | Round accepted with a vessel id that does not exist |
| RV-07 | High | yes | Round activate | Two Planned rounds of one vessel can both become Active |
| RV-13 | High | yes | Route edit | Route replaced while a Planned round already has voyages from the old route → voyages and route diverge |
| RV-25 | High | yes | Round cancel | Cancelling a round leaves its voyages `Scheduled` |
| RV-26 | High | yes | → booking | Bookings are still accepted on voyages of a Cancelled round |
| RV-28 | High | yes | Service delete | Service deletable while Completed/Cancelled rounds reference it → rounds orphaned |
| RV-31 | Medium | yes | Port delete | Port deletable while generated voyages use it as POL/POD |
| RV-30 | Medium | yes | Agent delete | Agent deletable while it is the agent of a route leg |
| RV-10/11/12 | Medium | yes | Route save | Legs are not checked for consistency: port not in the stated city/country, unknown terminal, unknown port |
| RV-08/09 | Medium | yes | Route / generate | Same port on two consecutive legs saves, then generates a voyage with POL = POD |
| RV-04/05 | Medium | yes | Round create | A round can be created directly as `Completed` or `Cancelled` |
| RV-18/19/20 | Medium | yes | Voyage edit | No date or status sanity: ETA < ETD, outside the round window, `Departed` without ATD, leg 2 sails before leg 1 arrives |
| RV-21/23 | Medium | yes | Manual voyage / delete | `createManualVoyage` and `deleteVoyage` never call `invalidateRoundCache` → capacity is stale up to 60 s (rule in CLAUDE.md) |
| RV-22 | Medium | yes | Voyage delete | Deleting a middle generated voyage breaks the POL/POD chain |
| RV-32 | Medium | code | Round create | Round + voyages are not created atomically (orphan round if generation fails) |
| RV-33 | Medium | code | Route save | Route legs are replaced with delete-all then insert-all, not atomic |
| RV-02/03 | Low | yes | Round create | API accepts Inactive service / Inactive vessel (the UI dropdowns filter them) |
| RV-17 | Low | yes | Generate | Generated voyages have no dates and no name |
| RV-34 | Low | code | Round create | Vessel-conflict check is check-then-write, no index (race) |
| RV-35 | Low | code | Manual voyage | `-M` suffix branch is effectively dead; deleting the last voyage lets its number be reused |
| RV-36 | Info | code | Route | Leg `agentId` is stored but nothing downstream reads it |
| RV-37 | Info | code | Round delete | Cascade delete is multi-step, not transactional; two cleanup deletes swallow errors |

## Findings

### RV-00 (High) — FIXED 2026-10-26 — vessel without reefer plugs could not be created
`vessel.model.js:13` had `validate: Number.isInteger` with `default: null`; `Number.isInteger(null)` is false, so creating a vessel without `reeferPlugs` returned `400 Validation failed` even though the API validator marks it optional. Found while building the probe fixtures (the earlier master-data e2e always sent `reeferPlugs`). Fix: validator is now `(v) => v == null || Number.isInteger(v)`. Not covered by any test; add one.

### RV-01 (High) — Round created with a vessel that does not exist  *(probed)*
`round.service.js#create` (l.115) loads the Service and the Route but never loads the Vessel; `round.validation.js` only checks `isMongoId`. `POST /rounds` with a random ObjectId returned `201 Round created and voyages generated`.
**Effect:** a round with a ghost vessel: capacity has no `vessel.capacity`, the close checklist reports `NO_PARTNER_SHARES`, the populated vessel is `null` in every list. **Fix:** load the vessel in `create` and in `update` when `vesselId` changes; refuse if missing (and see RV-02/03).

### RV-07 (High) — Two Active rounds on one vessel  *(probed)*
The rule "a vessel can be on one Active round" is enforced in two places only: `create` (l.133, looks at existing *Active* rounds) and `update` when the **vessel changes** (l.215). Activating a **Planned** round does not re-run it. Probe: two Planned rounds on one vessel (overlapping dates accepted, which is fine for planning), then `PUT status Active` on both → both `200`.
**Effect:** the invariant in `docs/03` is false; the first-voyage cascade runs for both; vessel stats and active-vessel capacity (`/capacity/vessel/:id/active`) become ambiguous. **Fix:** run the conflict check in `update` whenever `status` becomes `Active`; add a partial unique index `{vesselId}` where `status:'Active'` to close the race (RV-34).

### RV-13 (High) — Route changed under existing Planned rounds  *(probed)*
`route.service.js#saveLegs` (l.26) refuses only when a round of the service is `Active` or `Completed` (l.41). A service with **Planned** rounds (which already own generated voyages, and may already have bookings) can have its route replaced: probe → route save `200`; the round's voyages still say *Jebel Ali>Jeddah, Jeddah>Port Said* while the route is now *Port Said>Shanghai>Singapore*, and `GET /voyages/round-ports/:roundId` (used by the manual-voyage form) now offers the **new** route's ports (RV-14).
**Effect:** voyage/route divergence; manual voyages validated against a route that does not match the round; a later reader of "the route" gets the wrong picture of a Planned round. Also `RouteLeg` rows are re-created with new `_id`s on every save.
**Fix options (needs your decision D-B):** (a) refuse while *any* non-Cancelled round has voyages from the route; (b) allow when the Planned rounds have no bookings and regenerate their voyages; (c) snapshot the route on the round at creation (`Round.routeSnapshot`) and let the service route evolve freely. (c) is the cleanest and also fixes RV-14.

### RV-25 / RV-26 (High) — A Cancelled round stays alive underneath  *(probed)*
`round.service.js#update` changes only the round's `status`. Probe: round → Cancelled; its voyages stay `Scheduled`; `POST /bookings/manual` on one of them returned `201`, because bookings check the **voyage** status only (`booking.service.js:123`) — never the round's.
**Effect:** capacity and reports keep counting a dead round's voyages; bookings can be attached to it; they can never be invoiced sensibly. **Fix:** on Active/Planned → Cancelled, cancel the round's non-terminal voyages (refuse if any has non-Cancelled bookings, or require cancelling them first — decision D-C); and make the two booking services refuse a voyage whose round is `Cancelled`/`Completed`.

### RV-28 (High) — Service deletable with Completed rounds  *(probed)*
`service.service.js#hardDelete` (l.107) looks only for `Planned`/`Active` rounds (l.115). A service whose only rounds are Completed/Cancelled was deleted `200`; afterwards `GET /rounds/:id` returns `serviceId: null` and the service's `Route`/`RouteLeg` rows stay behind as orphans. `docs` list "DEPENDENTS for … Service" as a known gap; this shows the effect.
**Fix:** replace the status filter with `assertNoDependents('service', id, DEPENDENTS.service)` (Round any status, Voyage, Invoice, Agreement if it references a service) and delete the service's `Route` + `RouteLeg` only when nothing blocks.

### RV-31, RV-30 (Medium) — Port / Agent deletable while the chain uses them  *(probed)*
`location.service.js` port delete (l.205-211) counts only terminals and **current** route legs. A port removed from the route by a later edit but still the POL/POD of generated voyages was deleted `200`. The agent delete guard (`dependents.js#DEPENDENTS.agent`) does not count `RouteLeg.agentId`; an agent used on a route leg was deleted `200`.
**Fix:** add `Voyage.polId/podId` to the port check; add `{model:'RouteLeg', field:'agentId'}` to `DEPENDENTS.agent` (and `Booking.agentId`, already a listed gap).

### RV-10 / RV-11 / RV-12 (Medium) — Route legs are not validated against the master data  *(probed)*
`route.service.js#saveLegs` and `route.validation.js` check only that `countryId/cityId/portId` are present Mongo ids. Probes, all `200 Route saved`: a leg whose port belongs to a different city; a `terminalId` that does not exist; a `portId` that does not exist. The UI's cascading selects prevent the first in normal use; direct API calls (and imports/scripts) do not.
**Fix:** in `saveLegs` load the ports in one query and require `port.cityId == leg.cityId`, `port.countryId == leg.countryId`; load terminals and require `terminal.portId == leg.portId`; refuse unknown ids. Optionally require `agentId` to be a Port agent for that port's country (see RV-36).

### RV-08 / RV-09 (Medium) — Same port on consecutive legs  *(probed)*
Route `[Jebel Ali, Jebel Ali, Jeddah]` saved; the round then generated a voyage *Jebel Ali → Jebel Ali*. `voyageGenerator.js` and `saveLegs` have no POL≠POD check (manual voyages do, in `voyage.service.js#createManualVoyage`). The same port repeated **non-consecutively** (a round trip A-B-C-A) is legitimate and must stay allowed.
**Fix in `saveLegs` (not the generator):** reject `legs[i].portId == legs[i+1].portId`.

### RV-04 / RV-05 (Medium) — Rounds created as Completed / Cancelled  *(probed)*
`round.validation.js#validateCreate` accepts any `ROUND_STATUS`; `create` uses `data.status || 'Planned'`. `POST /rounds {status:'Completed'}` → `201` with status Completed and a full set of voyages, bypassing the transition table. The UI's create form also offers every status. **Fix:** on create allow only `Planned` or `Active` (Active still runs the first-voyage cascade).

### RV-18 / RV-19 / RV-20 (Medium) — Voyage dates and status are free text  *(probed)*
`voyage.service.js#update` (l.185) copies `etd/eta/etp/atd/ata/status` without any relation check. Probes, all `200`: `eta` before `etd` and both outside the round's 2030-01..03 window; status → `Departed` with no `atd`; leg 2 scheduled to sail on 01-10 while leg 1 arrives 01-25. The round's own first-voyage cascade also sets `Departed` with no `atd` (documented behaviour, but it means "Departed" does not imply "has an actual departure").
**Fix (proposal):** reject `eta < etd`, `ata < atd`; warn (not block) when outside the round window or when `etd(n) < eta(n-1)`; require `atd` for `Departed` and `ata` for `Arrived` (or default them to now). Decision D-D on strictness.

### RV-21 / RV-23 (Medium) — Capacity cache not invalidated  *(probed + code)*
CLAUDE.md: any service mutating voyages must call `invalidateRoundCache(roundId)`. `voyage.service.js#update` does (l.203); `createManualVoyage` (l.106) and `deleteVoyage` (l.214) do not. Probe: the round had 4 voyages after adding a manual one, `GET /capacity/round/:id` still returned 3 rows; after deleting one it still returned 3. Booking screens read this engine for fit checks, so a new manual leg is invisible to capacity for up to 60 s.
**Fix:** one call in each function (the import is already there). `capacity.service.js` itself is not touched.

### RV-22 (Medium) — Deleting a middle voyage breaks the chain  *(probed)*
`deleteVoyage` only checks bookings and ledger dependents. Deleting voyage 2 of 3 returned `200` and left *A>B, C>D, D>A* — the capacity engine walks forward by POD, so everything loaded on voyage 1 for ports after B can no longer be matched. **Fix:** allow deleting only the **last** voyage (or a manual voyage), otherwise refuse with a message to cancel it instead (Cancelled voyages are already excluded from capacity with a warning).

### RV-32 / RV-33 / RV-37 (Medium / Info) — Non-atomic multi-step writes  *(code-only)*
- `round.service.js#create`: `nextNumber('round')` → `Round.create` → `generateVoyages` (`insertMany`) → `round.save()`. If voyage insertion fails (duplicate `voyageNumber`, network), a round with `voyageIds:[]` and a burned round number remain; the user sees an error but the round is listed. The deployment already requires a replica set, so a transaction around steps 4–7 is available and does not touch the generator.
- `route.service.js#saveLegs` (l.63, l.77): `deleteMany` then `insertMany`. A failure between them leaves a Service with a Route and **no legs**, and a concurrent `Round.create` in that window reads 0 legs.
- `round.service.js#hardDelete`: four dependent cleanups use `.catch(() => {})`; a failed `deleteMany` is silently ignored and the round delete proceeds.

### RV-02 / RV-03 (Low) — Inactive service / vessel accepted by the API  *(probed)*
`POST /rounds` on an `Inactive` service and an `Inactive` vessel both returned `201`. The Round form only lists active ones (`listActive`, `status:'Active'`), so this is an API-only gap. **Fix:** one check each in `create`.

### RV-17 (Low) — Generated voyages are bare  *(probed)*
Generated voyages have `etd/eta = null`, `voyageName/voyageCode = null` (the display falls back to `voyageNumber`), although the Round carries `startDate/endDate`. Manual voyages, in contrast, *require* a name (`voyage.validation.js`). Not a defect but a design gap (D-E): no transit-days on route legs, so nothing can prefill dates.

### RV-34 / RV-35 (Low) — Races and numbering  *(code-only)*
- RV-34: the vessel/Active conflict is read-then-write with no unique index.
- RV-35: manual voyage `sequence = last + 1` makes the `numExists` branch unreachable in practice; deleting the **last** voyage and adding another reuses the same `voyageNumber`, so an old reference (invoice snapshot, audit log) can point at a different voyage.

### RV-36 (Info) — Leg agent is dead data  *(code-only)*
`RouteLeg.agentId` is saved and shown in the editor, but a backend `grep` finds no reader outside the route module (the frontend only shows it in the editor): voyage generation, expenses, bookings and handling fees do not use it. Decide whether it should prefill the port agent on expenses/handling charges (D-F) or be removed.

## Design questions for the owner (Route ↔ Service)
The stated plan is "creating a Route and assigning it to a Service happens in the Rounds part". Today a Route is **owned 1:1 by a Service** (`Route.serviceId` unique) and edited inline on the service page (`/services/:id/route`); there is no standalone Route master, no reuse of one route by several services, no route versioning, and no per-leg transit time.
| # | Question | Recommendation |
|---|---|---|
| D-A | Keep Route 1:1 inside Service, or make a Route a master that a Service points to (`Service.routeId`)? | Keep 1:1 for now; add `Round.routeSnapshot` (D-B c) so a route can change without touching history. A shared Route master only if two services really share one itinerary. |
| D-B | Route edit when Planned rounds exist: block, regenerate, or snapshot? | Snapshot at round creation (cleanest; fixes RV-13/14). |
| D-C | Cancelling a round: cascade-cancel voyages, or refuse while bookings exist? | Cascade-cancel voyages; refuse if any has non-Cancelled bookings. |
| D-D | Voyage date rules: block or warn? | Block `eta<etd` / `ata<atd` and missing actuals for Departed/Arrived; warn on window/ordering. |
| D-E | Prefill voyage dates from the round window / per-leg transit days? | Add optional `transitDays` + `portStayDays` per leg and prefill `etd/eta` at generation; editable afterwards. |
| D-F | What is `RouteLeg.agentId` for? | Prefill the port agent on expenses/handling charges for that port-call, else remove it. |

## Proposed fix sprint (no code written yet beyond RV-00)
1. **Guards (small, safe):** RV-01, 02, 03, 04/05, 07 (+ partial unique index), RV-21/23 (two `invalidateRoundCache` calls), RV-22, RV-08/10/11/12 (route leg validation), RV-30/31/28 (dependents + Service entry).
2. **Atomicity:** RV-32 (transaction around create), RV-33 (transaction in `saveLegs`), RV-37 (stop swallowing cleanup errors).
3. **Behaviour (needs D-B, D-C, D-D answers):** RV-13/14, RV-25/26, RV-18/19/20.
4. **Tests:** pure-logic unit tests for the leg validator and date rules; extend `scripts/audit-probes/rounds-voyages-probe.js` as the regression check (all probes should flip to `ok`); `test:int` cases for the transactions once a local replica set is available.

## Reproduce
`cd backend && npm run seed:test-data -- --reset` (SEED_ALLOW_REMOTE=yes), `npm run dev`, then `node scripts/audit-probes/rounds-voyages-probe.js`. The probe creates `ZS…` services, `ZV…` vessels and `E2E Probe` rounds and removes what it can; rounds that hold bookings remain (a `--reset` seed clears them). The run takes ~70 s because of the capacity-cache wait.

## Remediation status (2026-10-26, same day — sprint `sprints/rounds-voyages-2026-10-26-sprint.md`)
Evidence: `backend/scripts/audit-probes/rounds-voyages-probe.js` against a fresh dev server on the disposable Atlas test DB — **47 checks, 0 defects**; `npm test` 69/69; `scripts/e2e-masterdata.js` 85/85; frontend `npm run build` passes. **Not run:** `npm run test:int` (needs a local replica set), the frontend manual pass. "Tested" below = the named probe/unit test passed; HTTP probes exercise real transactions on the Atlas replica set.

| ID | Status | Change | Evidence |
|---|---|---|---|
| RV-00 | Fixed and tested | validator `v == null \|\| Number.isInteger(v)` | `test/vessel.model.test.js`, probe RV-00 |
| RV-01 | Fixed and tested | vessel loaded on create and on vessel change | RV-01, RV-01b |
| RV-02/03 | Fixed and tested | Service and Vessel must be Active for a new round / vessel change; existing rounds untouched | RV-02, RV-03 |
| RV-04/05 | Fixed and tested | initial status Planned/Active only (validator-independent, service + form) | unit, RV-04, RV-05, RV-04b |
| RV-07 | Fixed and tested | conflict check on every →Active | RV-07 |
| RV-34 | Fixed and tested | partial unique index `one_active_round_per_vessel` + `409 VESSEL_HAS_ACTIVE_ROUND`; `migrate:rounds-voyages` | RV-34 (parallel), RV-07c |
| RV-08/09 | Fixed and tested | consecutive identical ports refused before any write (also refused at round creation for legacy routes) | unit, RV-08 |
| RV-10/11/12 | Fixed and tested | batch-loaded country/city/port/terminal/agent ownership checks | unit, RV-10, RV-11, RV-12 |
| RV-13/14 | Fixed and tested | `Round.routeSnapshot`; manual-voyage ports read it; legacy fallback | unit, RV-13, RV-14 |
| RV-15 | Unchanged (already correct) | Active/Completed rounds still lock route edits | RV-15 |
| RV-25/26 | Fixed and tested | cancel refused while live bookings (409 `ROUND_HAS_BOOKINGS`), otherwise cascades to non-terminal voyages in a transaction; both booking services check the parent round | RV-25, RV-25b, RV-25c, RV-26, RV-26b |
| RV-28/29 | Fixed and tested | `DEPENDENTS.service` (rounds any status, voyages, tracking); Route+legs removed with an unused service in a transaction | RV-28, RV-28c |
| RV-30 | Fixed and tested | `DEPENDENTS.agent` += Booking, RouteLeg, round snapshots | RV-30, RV-30b |
| RV-31 | Fixed and tested | `DEPENDENTS.port` (voyages POL/POD, bookings, manual bookings, snapshots) | RV-31 |
| RV-18/19/20 | Fixed and tested | hard errors on the merged state; warnings in `data.warnings`; first-voyage cascade stamps `atd` | unit, RV-18, RV-19, RV-19b, RV-19c, RV-20, RV-20b, RV-04b |
| RV-21/23 | Fixed and tested | `invalidateRoundCache` after commit in create and delete | RV-21, RV-23, RV-22b (no TTL wait) |
| RV-22 | Fixed and tested | only a manual or the last generated voyage can be deleted | unit, RV-22, RV-22b |
| RV-32 | Fixed and tested | round + voyages + cascade in one transaction (forced insert failure leaves no round) | RV-32 |
| RV-33 | Fixed and tested | validate everything, then replace legs in one transaction (forced failure keeps old legs) | RV-33 |
| RV-37 | Fixed and tested | round delete guards + cleanup in one transaction, no swallowed errors | RV-37 |
| RV-35 | Fixed and tested | monotonic `Round.lastVoyageSeq`; the dead `-M` branch removed | RV-35 |
| RV-17 | Deferred | design gap; no invented dates, no `transitDays`/`portStayDays` (owner brief) | RV-17 asserts generated voyages stay bare |
| RV-36 | Deferred | `RouteLeg.agentId` kept and protected by `DEPENDENTS.agent`; no expense/handling flow has a port-call context to prefill without touching accounting | docs |

Residual risks: `test:int` has no cases for the new rules; rounds created before this change have no snapshot (fallback to the live route); the `-M` suffix removal assumes no legacy manual voyage already used it (the unique index still guards).
