# Audit folder

| File | Status |
|---|---|
| [routes-rounds-voyages-bookings-audit-2026-11-10.md](routes-rounds-voyages-bookings-audit-2026-11-10.md) | **Newest.** Current flow of Route → Round → Voyage → Booking → Final Loading → Discharge (after the bookings rework) + everything still open: new BK-01…BK-11, FL-01…FL-14 status (FL-02/03/04 fixed), carried-over RV/F items, verification status and a prioritised to-do list. |
| [system-audit-2026-10-25.md](system-audit-2026-10-25.md) | **Current.** Static audit of the working tree. IDs F-01…F-12. F-01…F-11 fixed 2026-10-25, F-12 open. |
| [routes-rounds-voyages-bookings-system-audit-2026-11-05.md](routes-rounds-voyages-bookings-system-audit-2026-11-05.md) | **Latest.** Full flow + status of Routes → Rounds → Voyages → Bookings (import, capacity, BookingItem hand-off). IDs FL-01…FL-14, all open (2026-11-05): 4 High (capacity onboard always 0; import bypasses bookable checks, overwrites locked bookings, cancels bookings it failed to save). |
| [rounds-voyages-flow-audit-2026-10-26.md](rounds-voyages-flow-audit-2026-10-26.md) | **Current.** Service → Route → Round → Voyage chain. IDs RV-00…RV-37 remediated 2026-10-26 (RV-17/RV-36 deferred); RV-38…RV-41 added 2026-10-31 (code reading, open). |

Older audits (`system-audit-2026-10-24.md`, `v2-final-audit-2026-10-21.md`, `v2-code-audit-2026-10-21.md`) are in `docs/archive/2026-10-24/audit/` and `sprints/archive/`. They pre-date the V2-only conversion and are history only.

When a finding is fixed, change its row to `Fixed (date, how)` rather than deleting it. A new audit gets a new dated file; update the table above.
