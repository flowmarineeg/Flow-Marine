# Status — 2026-10-25

Fresh status file. The previous one and every sprint spec (001–053) are in `sprints/archive/`.

## State
- Branch `version-4`, working tree **uncommitted** (V2 sprints 049–053, audit High fixes, V2-only conversion).
- Seed on Atlas replica set passed 2026-10-24; `npm run test:int` **not run** since the conversion.
- Docs rewritten 2026-10-25 from the code: `docs/README.md` (index), `docs/00–11`, `docs/audit/system-audit-2026-10-25.md`. Old docs/sprints archived, not deleted.

## Open work (from `docs/audit/system-audit-2026-10-25.md`)
High: none open (F-01, F-02 fixed 2026-10-25; code only, `test:int` not run).
Medium: none open (F-03…F-07 fixed 2026-10-25; code only, `test:int` not run).
Low/Info: F-09 grant restriction (policy decision, not built) · F-12 `test:int` not run (needs a local replica set). F-08, F-10, F-11 fixed 2026-10-25.

## Master data rework (2026-10-25)
**Verified 2026-10-26 against the dev server + Atlas test DB** (fresh `seed:test-data -- --reset` 27/27, trial balance balanced; `backend/scripts/e2e-masterdata.js` 85/85; `migrate:masterdata` dry/real/real, second run 0 changes; `npm test` 57/57). Still not run: `test:int` (needs a local replica set), frontend manual pass. Implemented: partners, vessels (sections A–D, JV matrix, particulars PDF, redelivery alert), container types (ISO code, TEU factor), locations (local currency, UN/LOCODE), services (applicability, taxable, revenue account), expense types (level, PDA, accounts), port agents (booking-source role, agreement fields), customers. Plan and result: `sprints/masterdata-2026-10-25-sprint.md`. **Before using an existing database run `npm run migrate:masterdata`.**

## Next
0. Run `npm run migrate:masterdata -- --dry` then for real on a copy, then `npm run test:int` on a local replica set — the F-01…F-11 fixes and the master-data rework are untested against a DB.
1. Currency policy now = USD only (F-02 blocks close on non-USD lines, F-03 rejects non-USD invoices, F-04 excludes non-USD expenses from P&L). Real multi-currency needs a currency on bookings.
2. Commit the working tree.

## How to use
Keep this file short: current state, open work, next steps. Detail belongs in `docs/`. Update after each piece of work; add new sprint specs as `sprints/NNN-sprint.txt` (next number 055; 054 was skipped on purpose).
