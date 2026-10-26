# 11 — Accounting: Ledger, Agent Accounts, Round Close & Partner Settlement

Modules `ledger`, `agentAccounts`, `partnerSettlement` (+ `agreements`, `partners`). Routes `/ledger`, `/agent-accounts`, `/round-accounting`, `/partners`. There is **no ledger browsing UI** yet; the money screens are the invoice panel, agent V2 panel (`AgentV2Panel`), `RoundAccountingPanel`, expense actions and partner form.

## 1. Ledger (`modules/ledger`)
Double-entry, append-only, integer minor units.

| Model | Key fields |
|---|---|
| `Account` | `code` (4 digits, unique), `name`, `type` Asset/Liability/Equity/Revenue/Expense, `isSystem`, `isActive`, `parentId` |
| `JournalEntry` | `entryNumber` (`JE-…`), `date`, `roundId?`, `sourceType` (Invoice, Settlement, Expense, Commission, HandlingFee, PartnerSettlement, Round, Opening, Manual, Reversal), `sourceId`, `memo`, `currency`, `fxRate`, `status Posted|Reversed`, `reversesEntryId` (unique partial index), `reversalReason`, `postedBy` |
| `JournalEntryLine` | `entryId`, `accountId`, `debitMinor` XOR `creditMinor` (>0, safe integer), `currency`, dimensions `partnerId`, `agentId`, `roundId`, `voyageId`, `date` |
| `ExchangeRate` | `(from,to,date)` unique, `rate>0`, `source` |

**Immutability** (`immutable.js`): all update/delete query ops and non-new `save` throw `409 LEDGER_IMMUTABLE`. The single sanctioned mutation is flipping `status` to `Reversed` through the raw collection inside the reversal transaction.

### `LedgerService.post(entry, lines, {session, allowClosed})` — the only write path
1. `assertBalanced`: ≥2 lines, each exactly one side, sums equal **per currency** (`LEDGER_UNBALANCED`/`LEDGER_BAD_LINE`).
2. Unless `allowClosed`, `assertRoundOpenTx` (bumps `Round.lockVersion`; closed → `ROUND_CLOSED`).
3. Accounts resolved by code, must exist and be active.
4. Opens its own transaction when no `session` is passed; allocates `JE-` number; inserts entry + lines.
`allowClosed` is used only by the round-closing entry and by paying/unpaying partner transfers (which happen after close).

`reverse(entryId, reason, …)`: posts the mirror entry (`sourceType: Reversal`, `reversesEntryId`), flips the original to `Reversed`. Double reversal impossible (unique index + status check).

`trialBalance({roundId, dateFrom, dateTo})` → rows per account×currency, per-currency totals, `balanced`.

### Chart of accounts (seeded by `accounts.seed.js`, idempotent)
| Code | Name | Type | Code | Name | Type |
|---|---|---|---|---|---|
| 1010 | Company Bank | Asset | 2000 | Agent Payable | Liability |
| 1020 | Cash | Asset | 2100 | Accrued Expenses | Liability |
| 1100 | Agent Receivable | Asset | 2200 | JV Reserve | Liability |
| 1110 | Agent Advances | Asset | 2300 | Unapplied Receipts | Liability |
| 1200 | Partner Current Account | Asset | 3000 | Retained / Partner Equity | Equity |
| 1300 | PDA Prepaid / Advance | Asset | 4000 / 4100 | Freight / Other Revenue | Revenue |
| 5000 | Port Expenses | Expense | 5100 | Hire Expense | Expense |
| 5200 | Agency Fees | Expense | 5300 | Handling Fees | Expense |
| 5400 | Commission | Expense | 5900 / 5990 | Other Voyage Costs / FX Gain-Loss | Expense |
(`1300`, `2100`, `2300`, `4100`, `5990` are defined but not posted to by current code.)

### Routes `/ledger`
`GET /accounts`, `GET /trial-balance` (perm `ledger`), `GET /exchange-rates` (`ledger`), `PUT /exchange-rates` (`ledger:manage`). No journal-entry list/detail endpoint exists yet.

### FX (`fx.service.js`)
`getRate(currency, date)` = latest stored rate on or before the date (same currency = 1; none → `400 FX_RATE_MISSING`). The rate is **copied onto the document** (invoice `fx`, entry `fxRate`); later rate changes never alter it. **Journal lines are stored in the transaction currency** — nothing converts them to USD (see audit F-02).

### Posting map (who posts what)
| Event | DR | CR | Source |
|---|---|---|---|
| Invoice issued | 1100 | 4000 | invoiceV2.issue |
| Credit note | 4000 | 1100 | createNote |
| Debit note | 1100 | 4000 | createNote |
| Cash settlement | 1010 / 1020 / 1200(partner) | 1100 | recordSettlement |
| Offset settlement | 2000 | 1100 | netting |
| Commission accrued | 5400 | 2000 | issue |
| Expense (FDA) posted | expense account (5xxx) | 2000 / 1200 / 1010 by payer | expenseV2.postExpense |
| Handling charges | 5300 | 2000 | handlingConfirm |
| Advance to agent | 1110 | bank | advance |
| Advance returned | bank | 1110 | returnAdvance |
| Pay agent | 2000 | bank | payAgent |
| Round close | 1200 per partner (± share) , 2200 for carry-forward | 3000 balancing | postClosingEntry |
| Partner transfer paid | 1200 (receiver) | 1200 (payer) | payTransfer |
| Reserve used | 2200 | 3000 | useReserve |
Every reversal mirrors the original.

## 2. Agent accounts (`/agent-accounts`, perm `agents`)
`loadAgent` refuses a **DirectLine** party for cash-offset operations. All agent cash paths (advance, return advance, pay agent, offset) first call **`lockAgent()`** (`$inc Agent.ledgerVersion`) so concurrent movements for one agent serialise — never remove it.

| Route | Perm | What |
|---|---|---|
| `GET /:agentId/soa` | `agents` | Statement of account: running rows over accounts 1100/1110/2000 (position sign: **+ agent owes us, − we owe agent**), closing position, filters `currency, roundId, dateFrom, dateTo`; reversals resolve to their original source |
| `POST /:agentId/advance`, `/advance-return` | `agents:offset` | advance out / returned (return ≤ outstanding advance) |
| `POST /:agentId/pay` | `agents:offset` | pay what we owe (≤ payable balance `PAYMENT_EXCEEDS_PAYABLE`) |
| `POST /:agentId/offset` | `agents:offset` | **netting engine**: applies the agent's payable against their open invoices/debit notes; body `batchId` (idempotency key — a repeat returns `duplicate:true`), `strategy` `oldest`\|`sameRound`, `roundId`, `currency`. Skips invoices of closed rounds. Each allocation is an `Offset` `InvoiceSettlement` |
| `POST /:agentId/offset/:batchId/reverse` | `agents:offset` | voids every settlement of the batch (reason required) |
| `GET /:agentId/handling[/preview]`, `POST /:agentId/handling/confirm` | read / `offset` | handling fees: for Final Loading bookings of the agent in a Round, price `Load` (every Final Loading container) and `Discharge` (discharged containers) by the **active agreement's** `handlingFees` table (move × Full/Empty); `HandlingCharge` rows are unique per `(bookingId, moveType)` so a charge is never posted twice; unpriced moves are reported |
| `GET/POST /:agentId/statement` | read / `offset` | **Final settlement statement** per `(agent, round, currency)`: categorised ledger lines → `netMinor`, `direction` `AgentPaysUs|WePayAgent|Even`. Draft can be rebuilt |
| `POST /statements/:id/agree` → `/settle` | `agents:offset` | Draft → Agreed → Settled; settle runs a same-round netting (`stmt-<id>` batch) and records `residualMinor` (cash still to move) |
| `GET /:agentId/commissions`, `POST /commissions/:id/cancel` | read / `agents:commission` | cancel reverses DR 2000 / CR 5400 |
| `GET/POST/PUT/DELETE /:agentId/agreements` | `agents:update` | agreements ([01](01-master-data.md#agent-agreements-modulesagreements)) |
Pure rules (position sign, statement rows, ageing buckets 0-30/31-60/61-90/90+, offset allocation, handling plan) live in `agentAccounts.logic.js` with unit tests. There is **no ageing report endpoint** yet.

## 3. Round close and partner settlement (`/round-accounting`)
### State machine
`Round.closeStatus`: **Open → ReadyToClose → Closed**, and **Closed → Open** via reopen. Independent of `Round.status`.

| Route | Perm |
|---|---|
| `GET /rounds/:id/checklist` | `rounds` |
| `POST /rounds/:id/ready` | `rounds:close` |
| `POST /rounds/:id/close` — body `{mode Accrual|Cash, carryForwardMinor?, overrideReason?, currency?}` | `rounds:close`; `closeOverride` needed to close with open PDAs; `carryForward` needed for carry > 0 |
| `POST /rounds/:id/reopen` — body `{reason}` | `rounds:reopen` |
| `GET / POST /rounds/:id/partner-settlement` (POST = (re)calculate Draft) | `rounds` / `partners:manage` |
| `GET /rounds/:id/partner-settlement/excel` | `reports` |
| `POST /transfers/:id/pay`, `/unpay` | `partners:manage` |
| `GET /vessels/:id/reserve` | `vessels` |
| `POST /reserve/use` — `{expenseId, amountMinor}` | `rounds:useReserve` |

### Close checklist
Blockers: open PDAs (overridable with permission + written reason), **draft V2 invoices** in the round, voyages not Completed/Cancelled, vessel without partner shares, **ledger lines not in the settlement currency** (`ROUND_HAS_OTHER_CURRENCY`, default USD — settlement is single-currency). Warnings: FDAs not posted (excluded from profit), agent statements not Settled.

### Close (one transaction)
1. Claim `closeStatus:'Closed'` (concurrent close → `ROUND_CLOSED`); settlement mode and carry stored on the round.
2. Re-run the checklist inside the transaction; hard blockers abort.
3. `calculateInner`: read the round's ledger lines **in one currency** (default USD), profit = revenue(4xxx) − expense(5xxx) (Cash mode: revenue actually collected − expenses actually paid), minus `carryForwardMinor` withheld as reserve; `shareProfit` splits by `shareBp` with largest-remainder (`allocate`); partner net = paidDirect − collectedDirect + share; `suggestTransfers` (largest debtor pays largest creditor; money held back appears in `heldMinor`).
4. `postClosingEntry` (CR/DR 1200 per partner, CR 2200 for the carry, balancing 3000) with `allowClosed`.
5. `PartnerSettlement.status = 'Final'`; a `Hold` `JvReserveMovement` is written for the carry. Money events `round.close` / `round.close.override` are logged.

### Reopen
Reason required. Refused if any partner transfer is `Paid` (`ROUND_HAS_PAID_TRANSFERS`) or the reserve held at close has since been used (`RESERVE_ALREADY_USED`). Reverses the closing entry, reverses `Hold` movements, sets the settlement back to Draft, clears carry.

### Models (`partnerSettlement.models.js`)
`PartnerSettlement` (unique `(roundId,currency)`; revenue/expense/profit, carry, distributable, outstanding receivable/payable, `partners[]` lines, `heldMinor`, `Draft|Final`, `closingEntryId`), `PartnerTransfer` (`Suggested|Paid`, from/to partner, amount, ledger entry), `JvReserveMovement` (`Hold|Use`, per vessel/round, `Active|Reversed`). Reserve balance = Σ Hold − Σ Use (active, per currency).

## 4. Tests
`backend/test/{ledger,billing,agentAccounts,partnerSettlement,shares,money}.test.js` cover the pure logic (balance validation, allocation, grouping, statement rows, profit sharing, transfers). `backend/test/int/*` cover transactions and routes against a **local replica set** — they have **not been run since the V2-only conversion**.
