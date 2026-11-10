# Status — 2026-11-10

Fresh status file. The previous one and every sprint spec (001–053) are in `sprints/archive/`.

## Follow-up 2026-11-10 (after the audit)
Owner asked for: re-seed, browser pass, BK-01, working capacity per POL/POD for both layers, voyage cancel cancels its bookings. **Done:** test DB re-seeded (`seed:test-data -- --reset` 29/29, balanced; `seed:chart`, `seed:locations`, `migrate:masterdata`); BK-01 (partner users refused on `/ledger/account-lookup`); **capacity rewritten per leg** (`capacity.service.js` + `capacityLegs.logic.js`, R10 exception approved; segments aboard, both layers, L1+L2 pre-flight, per-leg table in the report); **voyage cancel cascades** to its L1/L2 bookings (transaction, 409 if invoiced); old probe scripts moved to the new booking request shape. Verified: `npm test` 112/112, `bookings-probe` 45/45, `rounds-voyages-probe` 64/64, `e2e-masterdata` 111/111 on the fresh data, frontend build OK. **Not done: browser pass** (no browser tool in the session), `test:int`, Notion §12.

## Audit 2026-11-10
`docs/audit/routes-rounds-voyages-bookings-audit-2026-11-10.md`: current flow + all open items (new BK-01…BK-11, FL status, carried-over) + ordered to-do. Code reading + the existing probes; nothing changed.

## Bookings rework (2026-11-10)
Sprint `sprints/bookings-2026-11-10-sprint.md` (plan approved by the owner, D1–D8 = recommendations; result at its end), docs `docs/04`. Brief (`prompt.txt`): no voyage picker — Agent → Round → import type; the server assigns the voyage from the booking's POL/POD (east/west by port order, intermediate ports allowed); Layer 1 = light estimate, Layer 2 = full details; partner label + partner users; discharge list by POL→POD exported to Excel.
- Backend: `voyageMatch.logic`, `bookingVoyage.service`, `importRules.logic`, `partnerScope`, `bookingLookups`; booking/manual models (`polLegKey/podLegKey/partnerId/source`), services, import rewritten (FL-02/03/04 fixed), discharge scoped by POD, `Role.isPartnerRole` + `User.partnerId` + rbac partner guard.
- Frontend: `RoundRoutePicker`, both booking forms, import, list, discharge list modal, users/roles forms, permission context.
- Verified: `npm test` 104/104; `bookings-probe` 39/39 and `rounds-voyages-probe` 64/64 against the dev server + Atlas test DB; frontend lint clean on touched files, `npm run build` OK. **Not done:** `test:int`, manual browser pass, re-run of the updated `seed:test-data` (reset), FL-01 capacity per leg (R10, owner: leave), Notion §12 update.

## Routes → Rounds → Voyages rework (2026-11-08)
Sprint `sprints/routes-rounds-voyages-2026-11-08-sprint.md` (plan, owner answers, result). Owner brief: route = details + legs; round = route + vessel, the route legs are **copied into the round and editable there**; **voyages are no longer generated** — the user adds each one as a run over a range of the round's legs with a direction (`V0001E` leg 1→4, `V0002W` leg 4→1).
- Backend: `Voyage` +`direction/fromLegKey/toLegKey/portCalls`; `Round.routeSnapshot.legs[].legKey`; `round.create` makes no voyages; `PUT /rounds/:id/legs`; `voyage.createVoyage` (replaces `createManualVoyage`), `POST /voyages/:id/refresh-port-calls`; number `V`+global 4-digit counter+E/W/N/S; leg edits warn instead of locking; round Active no longer departs voyage 1; RV-38 + RV-39 fixed. `voyageGenerator.js`, `capacity.service.js`, `teuResolver.js` untouched (R10).
- Frontend: `RoundLegsPanel` (leg editor on the round), new `VoyageAddForm` (direction, from/to leg, per-port dates), direction/legs columns, "Refresh ports", per-port dates in `VoyageEditForm`.
- Verified 2026-11-08: `npm test` 86/86; `rounds-voyages-probe` rewritten, 64/64 against the dev server + Atlas test DB; `e2e-masterdata` 111/111 after `seed:chart`; fresh `seed:test-data -- --reset` 27/27 (trial balance balanced); frontend `eslint` clean on the touched files and `/rounds`, `/rounds/[id]`, `/voyages`, `/routes` compile on the dev server (200). **Not done:** `npm run build` (the dev server is running; Turbopack cannot build a copy), a manual browser pass, `test:int`, Notion proposal §12 update.
- **Old test data was dropped** (owner): no migration; rounds/voyages created before this change are unsupported by the new screens. Rebuild with `seed:test-data -- --reset`, `seed:chart`, `seed:locations`, `migrate:masterdata`.
- Next: the booking sprint (POL/POD inside a run, import voyage resolution, capacity per leg / FL-01).

## Docs sync (2026-10-31)
- Notion proposal "FLOW Maritime ERP: Version 2 Proposal" got **section 12 "Routes, Rounds and Voyages: full flow"** (written from the code; old 12/13 are now 13/14).
- `docs/audit/rounds-voyages-flow-audit-2026-10-26.md` has an addendum with **RV-38…RV-41** (open, code reading only, nothing probed): voyage delete ignores Layer 1 bookings/tracking/unposted voyage expenses; manual voyage can be created in any status and voyage/round status are loosely coupled; service code edits unguarded; round-ports lists a repeated port twice.
- Fixed in docs: `docs/01-master-data.md` had an old copy of itself spliced into the Accounting section (removed); `docs/00` route map now lists `/customers`, `/invoice-services`, `/accounting`; `docs/README.md` audit rows; `docs/03` known limitations.
- `npm test` 76/76 re-run 2026-10-31. No code changed.

## Audit 2026-11-05 — Routes/Rounds/Voyages/Bookings
`docs/audit/routes-rounds-voyages-bookings-system-audit-2026-11-05.md` (code reading + one read-only query on the test DB; nothing run, nothing changed). New open findings FL-01…FL-14. High: FL-01 capacity `onboardTEU` is always 0 (formula nets discharge on the same voyage; enforcement and overbooking warnings cannot work; needs an owner decision, R10 file), FL-02/03/04 Excel import bypasses `assertRoundBookable`, overwrites Final Loading/invoiced bookings, and the Final Loading sweep cancels bookings whose row failed or was invalid.

## State
- Branch `version-4`, working tree **uncommitted** (V2 sprints 049–053, audit High fixes, V2-only conversion).
- Seed on Atlas replica set passed 2026-10-24; `npm run test:int` **not run** since the conversion.
- Docs rewritten 2026-10-25 from the code: `docs/README.md` (index), `docs/00–11`, `docs/audit/system-audit-2026-10-25.md`. Old docs/sprints archived, not deleted.

## Rounds / Voyages remediation (2026-10-26)
Sprint `sprints/rounds-voyages-2026-10-26-sprint.md`: all RV findings fixed and probe-tested except RV-17 and RV-36 (deferred by the brief). Probe 47/47, `npm test` 69/69, e2e-masterdata 85/85, frontend build OK; `test:int` and the frontend manual pass not run. **Before using an existing DB run `npm run migrate:rounds-voyages`** (creates the one-Active-round-per-vessel index; stops and lists round numbers if duplicates exist).

### Audit (2026-10-26)
`docs/audit/rounds-voyages-flow-audit-2026-10-26.md` — Service → Route legs → Round → generated voyages, up to booking. 32 runtime probes (`backend/scripts/audit-probes/rounds-voyages-probe.js`): 26 defects were found (RV-01…RV-37; High: ghost vessel on a round, two Active rounds per vessel, route edit under Planned rounds, Cancelled round leaves voyages open and bookable, Service deletable with Completed rounds). RV-00 fixed (vessel model rejected a missing `reeferPlugs`). Six owner decisions (D-A…D-F) listed in the audit before the fix sprint.

## Open work (from `docs/audit/system-audit-2026-10-25.md`)
High: none open (F-01, F-02 fixed 2026-10-25; code only, `test:int` not run).
Medium: none open (F-03…F-07 fixed 2026-10-25; code only, `test:int` not run).
Low/Info: F-09 grant restriction (policy decision, not built) · F-12 `test:int` not run (needs a local replica set). F-08, F-10, F-11 fixed 2026-10-25.

## Master data update 2 (2026-10-27)
Sprint `sprints/masterdata-2026-10-27-sprint.md`: vessel form regroup + owner contacts + charter-party history with prices + hire rate moved; Vessels/Agents (registration, tax, bank rows, AR account, profile removed); Agents/Customers (bank rows); locations library seed; 45ft = 2.25 TEU (master data only); Invoice Services master + Operations → Routes (liner services/route legs/rounds tab); Accounting tab (6-digit chart import, `accounting` RBAC module). Verified on the dev server + Atlas test DB: `e2e-masterdata.js` 111/111, rounds-voyages probe 47/47, `npm test` 76/76, frontend `build` OK. Follow-ups the same day: Partners got `bankAccounts[]` (many bank rows; `migrate:masterdata` copies the old single bank), all country/city/port pickers became searchable (`SearchSelect`), redelivery price removed from the charter history, Accounting chart shown as a collapsible tree. **Run `npm run seed` (new permission rows), `npm run migrate:masterdata`, `npm run seed:chart`, `npm run seed:locations` on any existing DB.** Ledger posting with the 6-digit chart is a later money sprint.

## Master data rework (2026-10-25)
**Verified 2026-10-26 against the dev server + Atlas test DB** (fresh `seed:test-data -- --reset` 27/27, trial balance balanced; `backend/scripts/e2e-masterdata.js` 85/85; `migrate:masterdata` dry/real/real, second run 0 changes; `npm test` 57/57). Still not run: `test:int` (needs a local replica set), frontend manual pass. Implemented: partners, vessels (sections A–D, JV matrix, particulars PDF, redelivery alert), container types (ISO code, TEU factor), locations (local currency, UN/LOCODE), services (applicability, taxable, revenue account), expense types (level, PDA, accounts), port agents (booking-source role, agreement fields), customers. Plan and result: `sprints/masterdata-2026-10-25-sprint.md`. **Before using an existing database run `npm run migrate:masterdata`.**

## Next
0. Run `npm run migrate:masterdata -- --dry` then for real on a copy, then `npm run test:int` on a local replica set — the F-01…F-11 fixes and the master-data rework are untested against a DB.
1. Currency policy now = USD only (F-02 blocks close on non-USD lines, F-03 rejects non-USD invoices, F-04 excludes non-USD expenses from P&L). Real multi-currency needs a currency on bookings.
2. On any existing DB run `npm run seed`, `migrate:masterdata`, `seed:chart`, `seed:locations` (master data update 2), then click through Vessels, Vessels/Agents, Agents/Customers, Partners, Invoice Services, Routes, Accounting in the browser (never done).
3. Later money sprint: post to the 6-digit chart, header lock, mandatory dimensions (`docs/accounting/`).
4. Commit the working tree.

## How to use
Keep this file short: current state, open work, next steps. Detail belongs in `docs/`. Update after each piece of work; add new sprint specs as `sprints/NNN-sprint.txt` (next number 055; 054 was skipped on purpose).


## 2026-11-02 — Accounting chart CRUD
Chart of Accounts tab: add (posting account or sub-header), edit and delete for the 6-digit chart. Headers are editable too (name, Arabic name, active, normal balance); any account's code and parent can change (move; type follows the parent and cascades to descendants; cycles, non-header parents, duplicate codes and prefix mismatches refused). Delete is guarded by `DEPENDENTS.account`. Only the 4-digit ledger accounts (`isSystem`) are frozen; `isSystemLocked` no longer blocks anything. Fixed the legacy-group regex in `AccountingPage.jsx`. Not browser-tested, no integration or e2e cases yet; `npm test` 76/76, lint clean.
