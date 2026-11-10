# Audit — Routes → Rounds → Voyages → Bookings: current flow and what remains (2026-11-10)

Written after the bookings rework (`sprints/bookings-2026-11-10-sprint.md`, `docs/04`) and the routes/rounds/voyages rework of 2026-11-08 (`docs/03`). It does three things: (1) describes the **flow as the code works today**, (2) lists **everything still open**, old and new, with its basis, (3) says exactly **what was and was not verified**. Nothing was changed while writing it.

**Evidence labels:** *probed* = reproduced on the dev server + Atlas test DB by a probe script; *unit* = covered by `npm test`; *code* = read in the code only, not run; *docs* = documentation claim only.

> **Update, same day (follow-up request):** **BK-01 fixed** (partner users refused on `GET /ledger/account-lookup`; staff unchanged), **FL-01 and BK-02 fixed** (capacity rewritten per leg, both layers, owner-approved R10 exception), **FL-06 voyage part fixed** (cancelling a voyage cancels its bookings; "round Completed with live bookings" is still open), test DB **re-seeded** (29/29, trial balance balanced), probes re-run on the fresh data. Browser pass **not possible** in this session (no browser tool): only `next build` + lint. Statuses below marked ✅ were updated; the original text is kept for history.

## 1. Verification status (be careful with this)
| Check | Result (2026-11-10) |
|---|---|
| `npm test` | (original run: 104; **now 112 / 112**, +8 `capacityLegs.logic`) 104 / 104 pass (pure logic: voyage match 10, import rules 8, route/round/voyage logic, money, ledger, settlement …) |
| `scripts/audit-probes/bookings-probe.js` | 39 / 39 (BK, IM, FL-02/03/04, DS, PT groups) |
| `scripts/audit-probes/rounds-voyages-probe.js` | 64 / 64 |
| `scripts/e2e-masterdata.js` | not re-run in this sprint (last 111/111 on 2026-10-27) |
| Frontend | `npm run build` OK; `eslint` clean on the touched files only (the repo has other pre-existing lint errors) |
| **Not run** | `npm run test:int` (needs a local replica set; not run since the V2-only conversion), a **manual browser pass** of the new screens, `seed:test-data -- --reset` with the changed seed, Notion §12 update |

## 2. The current flow

### 2.1 Overview
```
Service (liner) ──► Route (ordered legs, details)
                         │ copied at creation
                         ▼
Vessel ──► Round  (own editable legs, routeSnapshot.legs[legKey])   status: Planned → Active → Completed | Cancelled
                         │ user adds each run (never generated)
                         ▼
              Voyage = one run over a range of the round's legs, one direction
              V0001E (leg 1→4), V0002W (leg 4→1) …   status: Scheduled → Departed → In Transit → Arrived → Completed | Cancelled
                         ▲
                         │ server finds it (voyageMatch): visits POL, later POD
Agent ─► Round ─► POL / POD (any ports of the legs) ─► Booking (L1 estimate / L2 container)
                         │ Pending → Confirmed → Final Loading (Cancelled)
                         ▼
        Final Loading import (manifest) ─► BookingItems ─► Invoices ─► ledger ─► Round close / partner settlement
                         ▼
        Discharge list (Round+POL+POD) ─► Excel ─► Discharge import (Discharged / Remaining)
```
The Round also has an independent **financial axis** `closeStatus` Open → ReadyToClose → Closed (reopen with reason). A Closed round rejects every mutation (`409 ROUND_CLOSED`).

### 2.2 Step by step
| # | Step | Where | Rules enforced today |
|---|---|---|---|
| 1 | **Service** (liner service) | Operations → Routes, `/services` | code unique; must be Active to open a new round; delete blocked by rounds of any status, voyages, tracking (`DEPENDENTS.service`) |
| 2 | **Route** = details + legs | `/services/:id/route` | ≥ 2 legs; country → city → port → terminal chain checked; no two consecutive identical ports (A-B-C-A allowed); replace is one transaction; legs informational agent only (RV-36) |
| 3 | **Round** | `/rounds` | Service Active, Vessel Active, route ≥ 2 legs, starts only Planned/Active, `startDate < endDate`, **one Active round per vessel** (partial unique index); route legs are **copied** into `routeSnapshot.legs` with a stable `legKey`; no voyages are created |
| 3a | Round legs | `PUT /rounds/:id/legs` | same validation as route; allowed on Planned/Active, not Closed; used legs stay editable, response carries `warnings[]` for voyages that no longer match |
| 4 | **Voyage** | `POST /voyages {roundId, direction, fromLegKey, toLegKey, …}` | round Planned/Active and open; two different legs of the round, forward or reverse; ports in travel order → `portCalls[]`; `polId/podId` = first/last port; number `V`+global counter+E/W/N/S; always `Scheduled`; overlap with a same-direction run is a **warning**, never an error |
| 4a | Voyage status | `PUT /voyages/:id` | transition table (override: `voyages:override`); Departed/In Transit/Arrived/Completed only while the round is Active; Departed needs `atd`, Arrived needs `ata`; `eta < etd` is an error; date outside the round is a warning |
| 4b | Refresh ports | `POST /voyages/:id/refresh-port-calls` | rebuilds `portCalls` from the round's current legs; **409 while live bookings use the voyage** |
| 4c | Delete | `DELETE /voyages/:id` | blocked by non-Cancelled bookings, L1 bookings of any status, tracking, any expense, ledger lines, invoiced items |
| 5 | **Booking (L2)** | `/bookings` form, import | body `{roundId, polId, podId, agentId, …}`; round bookable (not Cancelled/Completed) and open; **voyage found by `voyageMatch`** (below); `totalFreight = freightRate`; partner label; capacity pre-flight only when `ENABLE_CAPACITY_ENFORCEMENT` is on |
| 5a | **Booking (L1 estimate)** | `/bookings/manual` | same route/voyage rules; only agent, round, POL/POD, ≥1 cargo row (type + quantity) required, rate optional |
| 6 | Booking status | `PUT /bookings/:id` | Pending → Confirmed → Final Loading; Final Loading/Cancelled cannot be edited; voyage, ports, leg keys, number, discharge fields are never client-writable |
| 7 | **Final Loading import** | `/bookings/import` (type finalLoading) | a **manifest** for Round + Agent: every row valid or the whole file is refused; one transaction; manifest → Final Loading, every other live booking of the agent in the round → Cancelled; refused (`BOOKING_INVOICED`) if a would-be-cancelled booking is on a live invoice |
| 8 | Invoicing | `docs/06` | only Final Loading bookings become `BookingItem`s (re-synced after every booking write, fire-and-forget); issued invoices locked, corrections by notes |
| 9 | **Discharge** | discharge list modal + import type discharge | scope Round + Agent + POD [+ POL, Voyage]; matched → Discharged, other Final Loading bookings **of that scope** → Remaining; staff only |
| 10 | Round close | `docs/11` | blocked by open PDAs, draft invoices, voyages not Completed/Cancelled, vessel without shares; posts the closing entry; then everything is locked |

### 2.3 Voyage assignment (the new core rule)
`voyageMatch.logic.js` (pure, unit-tested) + `bookingVoyage.service.js`:
1. Candidates: voyages of the round that are **not** Cancelled/Completed and whose `portCalls` contain POL and, later in the run, POD. A westbound run lists its ports in reverse, so direction is implicit.
2. Repeated ports: nearest POD after the POL; `polLegKey`/`podLegKey` (stored on the booking) identify the exact call.
3. One candidate → assigned. Several → ranked by *not yet departed from POL*, then *earliest departure*; a strictly best one is assigned, a tie is **ambiguous** (`409 VOYAGE_AMBIGUOUS` with the candidates; `voyageId` is accepted only as a pick among them). None → `400 VOYAGE_UNRESOLVED`. POL = POD → `400`.
4. The booking keeps **its own POL/POD** (not the voyage's first/last port) and never changes voyage or ports after creation.

### 2.4 Who can do what
Staff: by role permissions (`bookings` + `import` / `export`; Final Loading and Discharge imports also need `update` + `delete`). **Partner users** (`Role.isPartnerRole`, `User.partnerId`): `rbac`/`hasPermission` refuse every module but `bookings`; inside it they see and create only their partner's bookings, always `Pending`, cannot change status/agent/label, cannot delete non-Pending, cannot use the discharge list/export, import only type `booking`. Pick-lists for the booking screens come from `GET /bookings/lookups` (no bank or money data). The partner label has **no effect on money**.

### 2.5 Capacity (unchanged, R10)
`capacity.service.js` is untouched. It nets discharge on the same voyage row (FL-01), loads a booking on the voyage whose first port equals the booking's POL, and discharges it on the first voyage at/after it whose POD equals the booking's POD. Numbers are **not reliable** (see FL-01 and BK-02).

## 3. Findings still open

### 3.1 New (found while writing this audit; *code* unless stated)
| ID | Sev | Area | Finding |
|---|---|---|---|
| **BK-01** ✅ **fixed** | Medium | Security / partner users | `GET /ledger/account-lookup` has **no `rbac`** (auth only; the other ledger routes have it). A partner user can read the chart-of-accounts lookup. Not probed; found by listing handlers without `rbac`. Fix: add `rbac('ledger')` (or an explicit partner refusal). Other route files gate at router level (`locations`, `reports`) or per handler; `auth/*` and `accept-invite` are public by design. Every route that uses only `auth` should be reviewed for partner users. |
| **BK-02** ✅ **fixed** (capacity per leg) | **High** (inherits FL-01) | Capacity | Booking POL/POD can now be intermediate ports, but the capacity engine still assumes one row per voyage and loads a booking only on the voyage whose **first** port equals its POL. A booking P2→P3 on a P1→P4 run is probably not loaded at all or flagged `BOOKING_PORT_NOT_IN_ROUND`. **Not probed.** Utilisation, peak, overbooking and `ENABLE_CAPACITY_ENFORCEMENT` stay wrong. Needs the FL-01 decision (R10 file); leg keys are already stored for it. |
| **BK-03** | Medium | Reports / invoices | Reports and invoice snapshots read the stored `polId/podId`; since 2026-11-10 that is the booking's own route, not the voyage's first/last port. The sprint plan said each report would be checked; **it was not**. Any report grouping "by voyage POL/POD", the booking report, revenue by route and invoice line text may now show different ports than before. |
| **BK-04** | Medium | Round legs vs bookings | Editing a round's legs (`PUT /rounds/:id/legs`) warns about **voyages** whose ports changed but not about **bookings** whose `polLegKey/podLegKey` point at a removed or re-pointed leg. `refresh-port-calls` is refused while live bookings exist, so the voyage keeps its old snapshot and the booking keeps its keys: consistent until someone refreshes, but nothing tells the user a booking's route is now stale. |
| **BK-05** | Medium | Booking lifecycle | A booking cannot be **moved to another voyage** (voyage and ports are immutable). The only route is delete + recreate, or the import "update" of a Pending/Confirmed booking. If a voyage is Cancelled (FL-06) its live bookings stay on it. |
| **BK-06** | Low | Usability | Two undated runs with the same ports tie every time, so **every** such row of an import (and every manual booking) needs a manual pick (`voyageOverrideId`, one dropdown per row). Entering `etd` on the runs removes it. |
| **BK-07** | Low | Partner users | (a) A partner set to Inactive after a user was created does not lock that user out. (b) Partner users can create **Layer 1** estimates, which count toward capacity (Pending counts) — an external party can influence the planning numbers. (c) `lookups` exposes all active agents' names/codes and all open rounds to partner users (intended, but it is more than their own data). |
| **BK-08** | Low | Import | Duplicate-container protection is only inside the file and against the same agent in the same round (FL-09 partly addressed). The manual form still allows duplicate container numbers; a container booked by two agents is not detected. |
| **BK-09** | Low | Import | `booking` imports are now all-or-nothing at the write step (rows that cannot be saved are still skipped and reported). A single DB error rolls the whole file back; numbers allocated by `nextNumberBatch` are burned (gaps, never duplicates). |
| **BK-10** | Low | Data | Bookings created before 2026-11-10 have no `polLegKey/podLegKey/partnerId/source` (read as unlabelled; ports as stored). The Atlas test DB has not been re-seeded with the changed seed, so it holds old-shape data next to probe leftovers. |
| **BK-11** | Info | Tests | No frontend tests; the new screens (route picker, import with ties, discharge modal, partner login) were only linted and built. The two new probes cover the API, not the UI. |

### 3.2 Carried over from the 2026-11-05 audit
| ID | Sev | State | One line |
|---|---|---|---|
| FL-01 | **High** ✅ | **fixed 2026-11-10** (R10 exception approved by the owner; per-leg engine, probed CP-01…05) | Capacity `onboardTEU` is always 0: utilisation 0 %, no overbooking warning, `warn|strict` enforcement cannot work. See BK-02 |
| FL-02, FL-03, FL-04 | High | **fixed 2026-11-10** | import trusted client ids / overwrote locked bookings / Final Loading sweep cancelled failed rows (probed + unit) |
| FL-05 | Medium | open | Final Loading → Cancelled unreachable via API/UI (edit lock before the transition map); only the import cancels. `docs` and CLAUDE.md say it is allowed |
| FL-06 | Medium | **partly fixed**: cancelling a voyage now cancels its bookings (probed VC-01); a round can still be Completed with live bookings | A voyage could be Cancelled, and a round Completed, with live bookings; they leave capacity but stay revenue and invoiceable |
| FL-07 | Low | open | BookingItem sync is fire-and-forget (`setImmediate`), failures only logged; locked items never shrink |
| FL-08 | Low | open | `/bookings/voyage-ports/:voyageId` (legacy) reads the live Service route, not the round snapshot. The new forms no longer use it |
| FL-09 | Low | **partly** | see BK-08 |
| FL-10 | Low | open | ManualBooking: no delete guard (by design); a lone Final Loading estimate has no meaning |
| FL-11 | Low | **superseded** | manual-voyage ordering no longer exists (voyages are runs); capacity still walks by `sequence` |
| FL-12 | Info | stale | test-DB counts in the old audit no longer apply |
| FL-13 | Info | open | docs vs code differences (FL-05, FL-10, FL-14) |
| FL-14 | Medium | open (owner decision) | A vessel with an Active round cannot get any new round, not even Planned, so the next cycle cannot be prepared in advance |

### 3.3 Carried over from older audits
| ID | State | One line |
|---|---|---|
| RV-17 | deferred | bare generated voyages — no longer applies (voyages are created by the user) |
| RV-36 | deferred | `RouteLeg.agentId` is informational, no workflow uses it |
| RV-40 | open (code) | service code edits are unguarded |
| RV-41 | closed by design | `round-ports` lists a repeated port once per leg, each with its own `legKey` |
| F-09 | partly fixed | permission save validated, but a `roles:update` holder can still grant any permission to another role |
| F-12 | open | `test:int` not run since the V2-only conversion; no frontend tests. The new booking rules have **no integration tests** (only unit + HTTP probes) |

## 4. What remains, in the order I would do it
0. ✅ Done in the follow-up: re-seed (29/29), BK-01, per-leg capacity (FL-01/BK-02), voyage cancel cascade. Still to do from this list: browser pass (needs a browser tool or the owner), items 4–8 below minus FL-01.
1. **Re-seed the test DB** with the updated seed (`SEED_ALLOW_REMOTE=yes npm run seed:test-data -- --reset`, then `seed:chart`, `seed:locations`, `migrate:masterdata`) and re-run both probes + `e2e-masterdata` on the clean data. Needs the owner's OK (drops the Atlas test DB).
2. **Browser pass** of: round + POL/POD picker (east, west, intermediate, tie), manual and import forms, discharge modal export + re-import, user/role forms, login as `partner@logistics.com`. Fix what it shows.
3. **BK-01** (one-line `rbac`) and a short review of every route that uses `auth` only, with a partner-user probe added to `bookings-probe.js`.
4. **BK-03**: check each report, the invoice snapshot and the BookingItem grouping against bookings whose POL/POD differ from the voyage's ends; decide what "route" means in each.
5. **FL-01 / BK-02 decision (R10)**: either allow a capacity rewrite that works per leg using `polLegKey/podLegKey`, or accept and document that capacity is indicative only. Add unit tests for the engine's cargo chain either way (none exist).
6. **FL-06 + BK-05**: refuse (or warn on) Cancelling a voyage / Completing a round with live bookings, and add a "move booking to another voyage" action.
7. **BK-04**: list affected bookings in the `PUT /rounds/:id/legs` warnings.
8. **FL-05, FL-14, RV-40, F-09** as separate small decisions; **test:int** on a local replica set including new cases for the booking rules; Notion §12 update.

## 5. Method and limits
Read: `docs/03`, `docs/04`, `docs/10`, the booking/import/partner/voyage-match/round-lock/rbac/auth/user/role code touched by the sprint, and the route files (handlers without `rbac` listed by a script). Run: the unit tests and the two probes above, `npm run build`, `eslint` on touched files. Everything marked *code* above was **not** executed. No external review, no load test, no penetration test of the partner-user boundary beyond the probe checks PT-01…PT-15.
