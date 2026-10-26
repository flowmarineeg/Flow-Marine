# Documentation Index

Fresh module documentation, written 2026-10-25 from the code as it stands in the working tree (branch `version-4`).
Everything before this date is archived and **not authoritative**:

- `docs/archive/2026-10-24/` — old planning docs, analyses, old audits, the full historical CLAUDE.md
- `sprints/archive/` — sprint specs 001–053 and `STATUS.md`

If a statement here disagrees with the code, the code wins — fix the doc.

## Reading order

| # | Doc | Covers |
|---|-----|--------|
| 00 | [architecture.md](00-architecture.md) | Stack, request pipeline, auth/CSRF/RBAC/audit, errors, money, round lock, numbering, cache, env |
| 01 | [master-data.md](01-master-data.md) | Locations, services + routes, agents (port/booking roles), customers, container types (TEU), expense types/categories, partners, agreements — aligned with Notion §11 |
| 02 | [vessels.md](02-vessels.md) | Vessel schema (sections A–D), JV shares and lock, particulars PDF, redelivery alert, stats, delete guards |
| 03 | [rounds-voyages.md](03-rounds-voyages.md) | Rounds, voyage generation, status flows, capacity engine, round close |
| 04 | [bookings.md](04-bookings.md) | Layer 2 bookings, Layer 1 manual bookings, Excel import (3 types), discharge list |
| 05 | [expenses.md](05-expenses.md) | Scope rules, PDA/FDA, posting to ledger, attachments |
| 06 | [invoices.md](06-invoices.md) | Booking items, V2 invoices, settlements, credit/debit notes, commission, PDF |
| 07 | [tracking.md](07-tracking.md) | Append-only tracking history |
| 08 | [reports-dashboard.md](08-reports-dashboard.md) | Seven reports, ledger P&L, dashboard |
| 09 | [export.md](09-export.md) | Excel and ZIP export, discharge list |
| 10 | [users-roles-rbac.md](10-users-roles-rbac.md) | Users, invites, roles, permission matrix, audit logs |
| 11 | [accounting.md](11-accounting.md) | Ledger, agent accounts (SOA, netting, handling), partner settlement, reserve |
| — | [audit/](audit/) | Current audit (fresh, 2026-10-25) |

## Conventions used in these docs

- **Route** = path under `/api/v1`. **Perm** = `module:action` checked by `rbac(module, action)`; when no action is shown it is derived from the HTTP method (GET→read, POST→create, PUT/PATCH→update, DELETE→delete). SuperAdmin (`roleId.isSystem`) bypasses every check.
- **Minor units** = integer amounts (cents). Legacy fields (`amount`, `totalFreight`, `freightRate`) are still decimal numbers; V2 money fields end in `Minor`.
- "Layer 1" = `ManualBooking` (estimated / commercial). "Layer 2" = `Booking` (operational, one row per container).
- File references are relative to `backend/src/` unless stated.
