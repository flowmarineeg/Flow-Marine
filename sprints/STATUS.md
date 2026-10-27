# Status — 2026-10-25

Fresh status file. The previous one and every sprint spec (001–053) are in `sprints/archive/`.

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
Sprint `sprints/masterdata-2026-10-27-sprint.md`: vessel form regroup + owner contacts + charter-party history with prices + hire rate moved; Vessels/Agents (registration, tax, bank rows, AR account, profile removed); Agents/Customers (bank rows); locations library seed; 45ft = 2.25 TEU (master data only); Invoice Services master + Operations → Routes (liner services/route legs/rounds tab); Accounting tab (6-digit chart import, `accounting` RBAC module). Verified on the dev server + Atlas test DB: `e2e-masterdata.js` 111/111, rounds-voyages probe 47/47, `npm test` 76/76, frontend `build` OK. **Run `npm run seed` (new permission rows), `npm run migrate:masterdata`, `npm run seed:chart`, `npm run seed:locations` on any existing DB.** Ledger posting with the 6-digit chart is a later money sprint.

## Master data rework (2026-10-25)
**Verified 2026-10-26 against the dev server + Atlas test DB** (fresh `seed:test-data -- --reset` 27/27, trial balance balanced; `backend/scripts/e2e-masterdata.js` 85/85; `migrate:masterdata` dry/real/real, second run 0 changes; `npm test` 57/57). Still not run: `test:int` (needs a local replica set), frontend manual pass. Implemented: partners, vessels (sections A–D, JV matrix, particulars PDF, redelivery alert), container types (ISO code, TEU factor), locations (local currency, UN/LOCODE), services (applicability, taxable, revenue account), expense types (level, PDA, accounts), port agents (booking-source role, agreement fields), customers. Plan and result: `sprints/masterdata-2026-10-25-sprint.md`. **Before using an existing database run `npm run migrate:masterdata`.**

## Next
0. Run `npm run migrate:masterdata -- --dry` then for real on a copy, then `npm run test:int` on a local replica set — the F-01…F-11 fixes and the master-data rework are untested against a DB.
1. Currency policy now = USD only (F-02 blocks close on non-USD lines, F-03 rejects non-USD invoices, F-04 excludes non-USD expenses from P&L). Real multi-currency needs a currency on bookings.
2. Commit the working tree.

## How to use
Keep this file short: current state, open work, next steps. Detail belongs in `docs/`. Update after each piece of work; add new sprint specs as `sprints/NNN-sprint.txt` (next number 055; 054 was skipped on purpose).
