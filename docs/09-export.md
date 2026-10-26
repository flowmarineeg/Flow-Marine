# 09 — Export

Module `modules/export`, route `/export`, perm module `export`. UI: `/export` (`ExportPanel`). Distinct from the **discharge list** (`GET /bookings/export/discharge-list`, [04](04-bookings.md)) and the partner-settlement workbook (`GET /round-accounting/rounds/:id/partner-settlement/excel`, [11](11-accounting.md)).

## Endpoints
| Method | Path | Body |
|---|---|---|
| POST | `/export/excel` | `{ module, filters?, selectedIds? }` → one `.xlsx` |
| POST | `/export/zip` | `{ exports: [{ module, filters?, selectedIds? }, …] }` → one `.zip`, one workbook per entry |

Both go through `rbac('export')` then `checkModuleExportPermission`: the caller needs the **`export` action on every requested module's own permission row** (SuperAdmin bypasses). Unknown modules → 400.

## Exportable modules (`ALLOWED_MODULES` = keys of `COLUMNS`)
`vessels, agents, containerTypes, expenseTypes, services, rounds, voyages, bookings (Layer 2), manualBookings (Layer 1), expenses, invoices, tracking, auditLogs`.
Not exportable: users, roles, locations, partners, ledger, agent accounts.
> `manualBookings` is not an RBAC module; its export is governed by the `bookings` `export` permission (audit F-08, fixed 2026-10-25).

## Output
- Filename `{module}-export-{YYYY-MM-DD}.xlsx`; header `X-Export-Count`.
- Sheet 1 = data with column set defined per module in `COLUMNS` (identity columns first, status/audit last); styled header, striped rows, frozen header row. Second sheet **Export Info**: module label, generated-at, generated-by, applied filters, row count.
- `fetchData` applies the same filter vocabulary as each module's list (search, status, date range, ids) or exactly `selectedIds` when given; `$unwind` uses `preserveNullAndEmptyArrays`; user regex input goes through `escapeRegex`.
- ZIP: archiver (level 9) streamed straight to the response (`buildZipStream`, not `exportZip`); workbooks are built in parallel and appended in request order. There is no cap on the number of entries (the old limit of 10 is commented out).

## Adding an exportable module
1. Add its columns to `COLUMNS` and a label to `MODULE_LABELS`.
2. Add a `case` in `fetchData`.
3. Make sure the module name exists in `config/constants.js#MODULES` so a role can be granted `export` on it.
