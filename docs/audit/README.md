# Audit folder

| File | Status |
|---|---|
| [system-audit-2026-11-19.md](system-audit-2026-11-19.md) | **Current.** Full system audit: real verification results (unit, e2e, probes, lint, build, `npm audit`; `test:int` not run), what changed since 2026-11-10 (locations cleanup, pagination, booking voyage views), the flow today, the Voyage model and revenue sources, security and access, money paths, all carried-over findings with current status, new findings S-01…S-21, data state and a prioritised to-do list. |
| [routes-rounds-voyages-bookings-audit-2026-11-10.md](routes-rounds-voyages-bookings-audit-2026-11-10.md) | History (2026-11-10). Flow after the bookings rework + BK-01…BK-11, FL status. Superseded by the 2026-11-19 audit. |
| [system-audit-2026-10-25.md](system-audit-2026-10-25.md) | History (2026-10-25). IDs F-01…F-12. F-01…F-11 fixed 2026-10-25, F-12 open; status carried into the 2026-11-19 audit. |
| [routes-rounds-voyages-bookings-system-audit-2026-11-05.md](routes-rounds-voyages-bookings-system-audit-2026-11-05.md) | History (2026-11-05). IDs FL-01…FL-14; status carried into the 2026-11-19 audit. |
| [rounds-voyages-flow-audit-2026-10-26.md](rounds-voyages-flow-audit-2026-10-26.md) | History (2026-10-26). IDs RV-00…RV-41; status carried into the 2026-11-19 audit. |

Older audits (`system-audit-2026-10-24.md`, `v2-final-audit-2026-10-21.md`, `v2-code-audit-2026-10-21.md`) are in `docs/archive/2026-10-24/audit/` and `sprints/archive/`. They pre-date the V2-only conversion and are history only.

When a finding is fixed, change its row to `Fixed (date, how)` rather than deleting it. A new audit gets a new dated file; update the table above.
