# 05 — Expenses

Modules `expenses`, `expenseTypes`; routes `/expenses`, `/expense-types`; perm modules `expenses`, `expenseTypes`. UI: `/expenses`, `/expenses/new`, `/expenses/[id]`, `/expense-types`.

## Schema `Expense`
| Field | Notes |
|---|---|
| `expenseTypeId` | required → `ExpenseType` |
| `roundId` / `voyageId` / `portId` | scope — see below |
| `agentId` | optional; **required** when `paidBy = PortAgent` |
| `amount` (decimal ≥0), `currency` (upper, ≤10), `expenseDate`, `description`, `port` (legacy free text, no longer written by the port-scope flow) | |
| `attachmentUrl`, `attachmentOriginalName` | one JPEG/PNG/PDF per expense |
| `kind` | `PDA` (estimate, never posts) or `FDA` (final, default) |
| `pdaExpenseId` | the PDA this FDA finalises; **unique partial index** → one FDA per PDA |
| `paidBy` | `PortAgent` \| `Company` \| `Partner` \| null; `paidByPartnerId` when Partner |
| `fundedFromReserve` | set by the JV-reserve flow |
| `ledgerEntryId`, `postedAt` | set when posted — the record is then frozen |
Indexes: `roundId`, `(voyageId,portId)`, `expenseTypeId`, `expenseDate`, `currency`, unique `pdaExpenseId` (partial).

## Scope (derived, never stored)
`deriveScope` infers it from which of the three ids are present:
- **Round** — `roundId` only.
- **Voyage** — `voyageId` only.
- **Port** — `voyageId` + `portId`; `portId` must be that voyage's POL or POD.
Invalid combinations are refused at write time: port without voyage, round together with voyage/port, none of them. List responses include `scope`.

**Expense type decides the scope** (master data 11.7, see [01](01-master-data.md)): `ROUND_LEVEL` accepts Round only; `VOYAGE_LEVEL` accepts Voyage or Port; `PORT_LEVEL` accepts Port only (`400 EXPENSE_LEVEL_MISMATCH`). Checked on create, and on update only when the type or scope changes. A type with `requiresPda` creates PDAs only — an explicit FDA is refused (`400 PDA_REQUIRED`); the FDA is created by converting the PDA. The expense form restricts the link buttons to the allowed scopes and forces "Estimate (PDA)" for such types.

## Routes
| Method | Path | Perm |
|---|---|---|
| GET | `/expenses` (page, limit, search, roundId, voyageId, portId, expenseTypeId, currency, dateFrom, dateTo, …) | `expenses` |
| GET | `/expenses/:id`, `/expenses/:id/attachment` | `expenses` |
| POST / PUT | `/expenses`, `/expenses/:id` (multipart: `compressUpload`) | `expenses` |
| DELETE | `/expenses/:id` | `expenses` |
| POST | `/expenses/:id/convert-fda` | `expenses:approve` |
| POST | `/expenses/:id/post` | `expenses:approve` |
| POST | `/expenses/:id/reverse` (body `reason`) | `expenses:approve` |
Type/category routes: see [01-master-data.md](01-master-data.md#expense-types-and-categories).

## Lifecycle
```
create PDA ──convert-fda──▶ FDA ──post──▶ Posted (ledger) ──reverse──▶ FDA (unposted)
create FDA ───────────────────▲
```
1. **Create** (round-lock check on the scope; `checkPaidBy`): `kind` defaults FDA. PDA = estimate; shows as an open item at round close.
2. **Convert to FDA** (`expenseV2.convertToFda`): only a PDA; creates a new FDA copying scope/type/agent, with the final `amount`/`currency`/`expenseDate`, `pdaExpenseId` set. Returns `{fda, pdaAmount, varianceMinor}` (variance only when currencies match). Second conversion → `409 PDA_ALREADY_CONVERTED` (unique index).
3. **Post** (`postExpense`, one transaction): atomically claims an FDA with `paidBy` set and not yet posted, then `LedgerService.post`:
   - **DR** expense account (`expenseAccountCode(type)` — by category/type, 5xxx) with `agentId`, `voyageId`
   - **CR** by payer: PortAgent → `2000 Agent Payable` (agentId); Partner → `1200 Partner Current Account` (partnerId); Company → `1010 Company Bank`
   - `roundId` taken from the expense or its voyage. PDA → `409 PDA_NOT_POSTABLE`; zero amount refused; no `paidBy` → `PAID_BY_REQUIRED`.
4. **Reverse** (`reverseExpense`): reason required; `ledger.reverse` mirrors the entry, clears `ledgerEntryId/postedAt`. The expense may then be corrected and re-posted.

## Freeze rules
- Posted expense (`ledgerEntryId`): changing `amount, currency, expenseTypeId, agentId, expenseDate`, `paidBy` (including `paidByPartnerId`; amount compared numerically), or the scope (`roundId/voyageId/portId`) → `409 EXPENSE_POSTED`. Delete → `EXPENSE_POSTED`.
- A PDA that has an FDA cannot be deleted (`HAS_DEPENDENTS`); delete the FDA first.
- `kind` can change only while unposted and not an FDA created from a PDA.
- Closed round → every write `ROUND_CLOSED` (both old and new scope are checked on update).

## Attachments
`GET /expenses/:id/attachment` streams the stored file (404 if missing on disk). Replacing a file or deleting the expense removes the old file. Files live in `backend/src/uploads/expenses/` (not served statically from the DB). See `middleware/upload.js` for type/size checks.

## How expenses are used elsewhere
- **Reports:** expense report and the Voyage Profitability P&L group by category `costClassification` (never category name); `Hire Rate` type costs rate × voyage days ([08](08-reports-dashboard.md)).
- **Ledger / settlement:** only **posted FDAs** reach round profit; unposted FDAs raise the `UNPOSTED_EXPENSES` close warning ([11](11-accounting.md)).
- **Round close:** open PDAs block the close (override needs `rounds:closeOverride` + reason).
- **JV reserve:** `POST /round-accounting/reserve/use` ties a reserve movement to an expense.
- **Export:** Excel module `expenses`.
