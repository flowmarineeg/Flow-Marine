# Open items: decisions needed (plan only, 2026-11-19)

**Plan only: no code was written for any item below.** Source: `docs/audit/system-audit-2026-11-19.md` and the code as read today. Sizes: **S** = under half a day, **M** = 1 to 2 days, **L** = 3+ days (with tests and docs). "Checked" = I read it in the code today. Nothing here was run in a browser.

Already done today (part 1, see `sprints/STATUS.md`): S-03, S-04, S-05 (non-breaking part), S-06 (11 of 12 errors), S-09, S-13, S-15, S-16.

## Summary table

| Item | One-line recommendation | Size |
|---|---|---|
| BK-03 | Show the booking's own POL/POD in reports; keep the voyage ports as a separate column | M |
| BK-04 | Warn (not block) when a leg edit leaves bookings with stale leg keys; list them | M |
| BK-05 | Add "move to another voyage" (same round, same ports, one transaction, not for Final Loading/invoiced) | M |
| FL-05 | Fix the edit lock so Final Loading -> Cancelled works through the API/UI with a reason; refuse if invoiced | S |
| FL-06 | Refuse Completed while live bookings exist (409), with an override for `rounds:override`-style admins | S |
| FL-14 | Keep one Active round per vessel, allow Planned rounds beside it | S |
| F-09 | Block granting permissions you do not hold yourself (no escalation) | M |
| RV-40 | Lock the service code once a round uses it | S |
| S-11 | Accept country-level coastal validation, add a distance check only to a warning | S/M |
| S-12 | Owner confirms the 24 terminals; map `PKKHA` to `PKKHI` with a script, then retire `PKKHA` | S |
| S-17 | Re-seed the test DB with `--reset` when you are ready (your call, it drops the DB) | S |
| test:int | Docker + a one-node replica set, 3 commands (section at the end) | S to set up, unknown to fix |

---

## BK-03: reports and invoice snapshots vs the booking's own POL/POD
**Today (checked).** Since 2026-11-10 a booking has its **own** `polId/podId` (any ports of the run, intermediate ones included). `reports.service.js` still builds its POL/POD columns from the **voyage** (`v.polId?.name`, `v.podId?.name`, lines near 275 and 455), so a booking from an intermediate port to another shows the voyage's first and last port. Invoice snapshots (the `BookingItem` rows taken when a booking is invoiced) were **not re-read** for this note: I did not verify what ports they copy. Money files were not touched.
**Option A.** Reports read the booking's own POL/POD (join the booking's ports), the voyage ports become a separate "Voyage route" column. **Option B.** Leave reports as they are and document that report ports are the voyage's.
**Recommendation: A for reports** (read-only change, no money posting). Look at the invoice snapshot separately before deciding anything there; a snapshot is frozen on issue and must not change.
**Risk.** Report totals do not change (they group by voyage), only labels; old bookings without keys read the ports as stored. A wrong join could duplicate rows (use populate, not `$lookup` with unwind of arrays). **Size M.**

## BK-04: round leg edits do not warn about bookings with stale leg keys
**Today (checked from the audit and `docs/03`).** Editing a round's legs (`PUT /rounds/:id/legs`) warns about voyages that use a changed leg, and `refresh-port-calls` is refused with live bookings. Bookings store `polLegKey/podLegKey`; if a leg key is removed or reordered, those bookings keep keys that point at nothing, and the capacity engine and the port filter fall back to port ids silently.
**Option A.** Extend the existing `warnings[]` of the leg edit with "N bookings use leg X" (count only, no block). **Option B.** Block removing or re-keying a leg that live bookings use (409).
**Recommendation: A first**, B only for a leg that is **deleted** (not just moved). Keeps the current "warn, do not lock" style.
**Risk.** A count query per removed leg on both booking collections; low. If B is chosen, users may be stuck needing to cancel bookings first. **Size M.**

## BK-05: a booking cannot be moved to another voyage
**Today (checked).** `voyageId`, POL/POD and leg keys are immutable after create (`validateUpdate` has no such fields). Wrong voyage = cancel and re-create.
**Option A.** A dedicated `POST /bookings/:id/move {voyageId}` for Layer 1 and Layer 2: same round, the new voyage must run the booking's POL then POD (`checkChosenVoyage`), refused for Final Loading, Cancelled or invoiced bookings, in one transaction with `invalidateRoundCache` and an audit entry. **Option B.** Keep immutable; document cancel + re-create.
**Recommendation: A, narrow** (same round only). It is the common real-world fix for a tie picked wrongly.
**Risk.** Capacity moves between voyages (cache must be cleared for the round); tracking and invoice links must not exist (hence the refusals). **Size M.**

## FL-05: Final Loading -> Cancelled is unreachable through the API/UI
**Today (checked, `booking.service.js` lines 20 to 26 and 221).** The transition map lists `Final Loading: ['Cancelled']`, but the update first throws "`Final Loading` bookings cannot be edited" (line 221), so only the Final Loading **import** can cancel. Layer 1 has the same pattern.
**Option A.** Allow a status-only update from Final Loading to Cancelled (nothing else editable), refused when the booking is on a live invoice (`BOOKING_INVOICED`), cache cleared. **Option B.** Remove the entry from the map and the docs: Final Loading is final.
**Recommendation: A**, because users will need to cancel a loaded booking that did not sail; with a required reason in the remarks.
**Risk.** Revenue (Final Loading only) drops when cancelled, so the dashboard and reports change after the fact; invoiced bookings must stay blocked. **Size S.**

## FL-06: a round can be Completed with live bookings
**Today (checked, `round.service.js` around 280 to 300).** Cancelling a voyage cancels its bookings and cancelling a round is refused with live bookings, but setting a round to `Completed` has no check on its live (Pending/Confirmed) bookings.
**Option A.** Refuse Completed (409 `ROUND_HAS_LIVE_BOOKINGS`) while Pending or Confirmed bookings exist (Final Loading is fine). **Option B.** Allow it with a warning listing the counts.
**Recommendation: A** (Completed closes the booking window, `assertRoundBookable`; leftovers would be stranded). Include an admin override only if you want one.
**Risk.** Rounds that are normally completed with a few stale Pending bookings will need cleaning first. **Size S.**

## FL-14: a vessel with an Active round cannot get even a Planned round
**Today (checked, `round.service.js:51 and 171`).** `assertVesselFree` runs on create and refuses any new round for a vessel that has an Active round. The unique index `one_active_round_per_vessel` already guarantees one **Active** round per vessel.
**Option A.** Apply `assertVesselFree` only when the new round is created as, or moved to, Active; Planned rounds are allowed beside an Active one. **Option B.** Keep the rule (current behaviour, documented).
**Recommendation: A**: planning the next round while the current one runs is normal, and the DB index still protects the Active state.
**Risk.** Activating the next round must then be refused until the first is Completed (already the index behaviour; make the message clear). **Size S.**

## F-09: a `roles:update` holder can grant any permission
**Today (checked, `permission.service.saveByRoleId`).** It validates module names and booleans only. A user with `roles:update` can give any other role (even a role they could then use via a second account) any permission, including `roles:update` itself; editing their own role is refused.
**Option A.** A user can only grant permissions they hold themselves (a subset rule). **Option B.** Only SuperAdmin can edit roles (`roles:update` stops being delegable).
**Recommendation: A** (keeps delegation, closes escalation). B is simpler if you only have one admin.
**Risk.** Touches login-adjacent permission code; test with every demo role. Partner roles must stay bookings-only. **Size M.**

## RV-40: service code editable once rounds exist
**Today (checked, `service.service.js` lines 88 to 91).** Update accepts a new `serviceCode` after checking duplicates only. Rounds, voyages and numbers reference the service by id, so data stays consistent, but codes appear in reports, exports and people's heads.
**Option A.** Refuse a code change when any round uses the service (`SERVICE_IN_USE`). **Option B.** Allow it, and write an audit entry (already automatic through the audit logger).
**Recommendation: A** (cheap, the name stays editable).
**Risk.** Low; a typo in a code can then only be fixed by creating a new service. **Size S.**

## S-11 and S-12: locations quality
**S-11, today (checked).** Coastal validation is by **country** (`coastal.logic.js`, 44 landlocked countries). A city or port created by hand 500 km inland in a coastal country is accepted; the 50 km rule exists only in the seed generator. 7,793 inland-looking cities are listed but not deleted.
- **Option A.** Accept the limit (document it). **Option B.** Add a distance-to-coast check on create (needs coordinates on the form and the coastline data at runtime).
- **Recommendation: A**, and finish the planned second cleanup pass on the listed cities with a distance check **in the script only**. A runtime check needs coordinates users do not have. **Size S** (A) / **L** (B).

**S-12, today (checked).** `terminals.json` (24 names, 10 ports) is hand-written from memory. Karachi has two ports: the old `PKKHA` (referenced by data) and the new `PKKHI` (real LOCODE).
- **Option A.** You confirm or correct the 24 terminal names; a one-off script repoints references from `PKKHA` to `PKKHI`, then deletes `PKKHA` (now safe through DEPENDENTS). **Option B.** Leave both.
- **Recommendation: A.** **Risk:** repointing touches voyages, bookings, route legs and round snapshots; do it in a dry run first and on the test DB. **Size S.**

## S-17: test DB probe leftovers
**Today (probed in the audit).** The test DB holds many probe records (e.g. 14 `E2E` ports, 13 services, 23 vessels, 24 customers, 10 agents, 5 cancelled `ZR` rounds), which skew lists and counts.
- **Option A.** `SEED_ALLOW_REMOTE=yes npm run seed:test-data -- --reset` (drops the whole test DB), then `seed:chart`, `seed:locations`, `migrate:masterdata`, then re-run the probes. **Option B.** Leave it.
- **Recommendation: A, when you say so** (I will not run `--reset` without your word). **Risk:** everything in the test DB is lost; the locations seed takes a while (49k cities). **Size S.**

## test:int (needs a local replica set)
**Today.** 59 integration tests (22 + 7 + 30 in `backend/test/int/`) cover the money paths and have **not run since the V2-only conversion**. They need a real MongoDB **replica set** (transactions), drop the target database, and refuse Atlas.
**What you need.** Docker Desktop (installed here: Docker 29.3.1; the audit found the daemon not running, so **start Docker Desktop first**). No local `mongod` is installed and none is needed. Nothing else to install.
**How to run (3 steps, from `backend/`):**
1. `docker run -d --name flow-test-mongo -p 27018:27017 mongo:7 --replSet rs0 --bind_ip_all`
2. `docker exec flow-test-mongo mongosh --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"` (once; the comment in the test file does not mention it, but a replica set needs it before transactions work)
3. PowerShell: `$env:TEST_MONGODB_URI="mongodb://localhost:27018/flow_v2_test?directConnection=true"; npm run test:int`
Stop it later with `docker rm -f flow-test-mongo`.
**Risk / unknown.** Because it has not run since the conversion, expect failures from old assumptions (the audit notes `audit-fixes.int.test.js` and `v2.int.test.js` are not updated for the ledger-line share lock). Fixing them is a separate task and touches test files only, unless a real money bug shows up (then it stops and comes back to you). **Size:** setup S; fixing failures unknown until the first run. **Recommendation:** run it once and report the failures before changing anything.

---

## Decisions I need from you
1. BK-03: A or B (and may I look at the invoice snapshot read-only?)
2. BK-04: A (warn) or B (block)?
3. BK-05: build "move to another voyage" (A) or keep immutable (B)?
4. FL-05: allow Final Loading -> Cancelled (A) or make Final Loading final (B)?
5. FL-06: refuse Completed with live bookings (A) or warn (B)?
6. FL-14: allow a Planned round beside an Active one (A) or keep (B)?
7. F-09: subset rule (A) or SuperAdmin-only role editing (B)?
8. RV-40: lock the service code (A) or leave (B)?
9. S-11: accept (A) or runtime distance check (B)? S-12: confirm terminal names and retire `PKKHA`?
10. S-17: reset the test DB now? test:int: do you want me to run it once after you start Docker?
