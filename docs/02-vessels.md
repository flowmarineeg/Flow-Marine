# 02 — Vessels

Module `modules/vessels`, route `/vessels`, perm module `vessels`. UI: `/vessels`, `/vessels/new`, `/vessels/[id]`, `/vessels/[id]/edit`. Form follows the proposal §11.2 sections A–D.

## Schema `Vessel`
| Section | Fields |
|---|---|
| A. Identity & specifications (one card in the form: identity + specifications + particulars) | `vesselCode` (unique, upper, ≤20), `vesselName`, `imoNumber` (unique, 7 digits), `flag`, `callSign` (**required**), `capacity` (TEU slot capacity, **required** — the number the capacity engine divides by), `reeferPlugs`, `particularsFileUrl` / `particularsOriginalName` (PDF), plus `dwt`, `builtYear`, `manager`, `loa`, `beam`, `summerDraft`, `grossTonnage`, `netTonnage`, `suezGT`, `suezNT` |
| B. C/P bunker consumption profile (all optional; one card incl. the tank capacities) | `mainEngineFuelType`, `auxEngineFuelType`, `consumptionSeaMtDay`, `consumptionPortIdleMtDay`, `consumptionPortWorkingMtDay`; existing tank capacities `totalBunkerCapacity`, `vlsfoCapacity`, `mdoCapacity`, `fwCapacity` |
| C. Ownership & charter | `ownershipType` ∈ `Owned|Time Charter|Voyage Charter` (**required**), `ownerName`, `ownershipDescription`, **`ownerContacts[]`** (`name` required, `title`, `phone`, `email`), **`charterHistory[]`** (see below), `charterStartDate`/`charterEndDate` (= the latest entry's Delivery / Redelivery date, set by the server), and `defaultDailyHireRateMinor` (USD cents; the API takes/returns decimal `defaultDailyHireRate`; **required**; moved into this card 2026-10-27) |
| D. JV partners | the JV partner matrix (see below) |
| State | `status` ∈ `Active|Inactive|Under Maintenance|Sold`, `notes` |

Responses add derived fields (`vessel.logic.present`): `defaultDailyHireRate`, `redeliveryAlert`, `incompleteFields[]`; the detail response also has `sharesLocked`.

### Charter-party history (2026-10-27)
`charterHistory[]` entry: `charterPartyDate`, `deliveryDate` + `deliveryPriceMinor`, `redeliveryDate` (no redelivery price; USD minor units for the delivery price, the API takes/returns decimal `deliveryPrice`), `addedBy`, `createdAt`. It is an append-only history in practice: the form shows the **latest** entry, **View history** lists all, **Add new charter entry** appends. `PUT /vessels/:id` takes the whole list (entries keep their `_id`; `addedBy` is preserved); the **last** entry sets `charterStartDate`/`charterEndDate`, so the redelivery alert and the required-field rule for charter types keep working (a charter vessel needs at least one entry; redelivery after delivery; prices ≥ 0). Owned vessels send an empty list. `migrate:masterdata` builds one entry from existing charter dates.

## Routes
| Method | Path | Perm |
|---|---|---|
| GET | `/vessels` (page, limit, search, status) | `vessels` |
| GET | `/vessels/:id/stats` | `vessels` (declared before `/:id`) |
| GET | `/vessels/:id/partners` | `vessels` |
| PUT / DELETE | `/vessels/:id/partners` | `partners:manage` |
| GET / POST / DELETE | `/vessels/:id/particulars` — authenticated PDF download / upload (multipart field `file`, PDF only, magic-byte checked, stored in `uploads/vessels/`) / remove | `vessels` |
| GET / POST / PUT / DELETE | `/vessels`, `/vessels/:id` | `vessels` |

`POST/PUT /vessels` also accept an optional `shares: [{partnerId, shareBp}]`, validated first and saved **in the same transaction** as the vessel (all or nothing).

## Rules
- Code and IMO uniqueness checked in the service (400) and by unique indexes.
- Required on **every create and update** (judged on the merged record): `vesselName`, `imoNumber`, `callSign`, `capacity`, `ownershipType`, `defaultDailyHireRate`; for the two charter types also Delivery and Redelivery dates (redelivery after delivery). Older vessels missing them show an `incompleteFields` list and must be completed before they can be edited (`npm run migrate:masterdata` prints the report).
- **Redelivery alert:** a chartered vessel whose redelivery date is within 30 days (or past) gets `redeliveryAlert {level:'red', daysLeft, message}`, computed on read, shown in red on the vessel list and detail. No job.
- A vessel can only be on **one Active round** at a time (checked in Round create/update).
- **Delete** refused when the vessel is on a `Planned` or `Active` round, then `DEPENDENTS.vessel` (partner share rows, any round). The particulars file is removed with it.
- Updating/creating uses `pickFields(Vessel, data, ['particularsFileUrl','particularsOriginalName'])` — unknown keys and the file fields are not client-writable.
- Migration: `Chartered` and `Leased` become `Time Charter`.

## Partner shares (`modules/partners/vesselPartner.model.js`, `vesselShares.js`)
`VesselPartner {vesselId, partnerId, shareBp (1–10000)}`; unique `(vesselId, partnerId)`. The form edits shares as a percentage with 2 decimals (basis points underneath) with a live total.
- `PUT /vessels/:id/partners` body `{shares:[{partnerId, shareBp}]}` **replaces the whole set** in one transaction. `vesselShares.validateShares` requires: ≥1 row, no duplicate partner, integer 1–10000 each, total exactly **10000** (`SHARES_NOT_100`). All partners must exist.
- `DELETE /vessels/:id/partners` clears them.
- **Lock** (`assertSharesUnlocked`, `409 VESSEL_SHARES_LOCKED`): PUT and DELETE are refused once **any ledger line exists on one of the vessel's Rounds** (its first accounting entry) or a `Final` PartnerSettlement exists. Open Rounds with no money posted do **not** lock, so shares can be set or fixed before anything is posted (audit F-01). Later changes need the authorised correction process (reopen/reverse).

The shares drive round-close profit sharing — see [11-accounting.md](11-accounting.md).

## Stats (`GET /vessels/:id/stats`, `getVesselStats`)
Detail-page payload, **uncached**: counts of rounds by status, voyages, bookings by status (Layer 1 + Layer 2 merged, Cancelled excluded from headline totals), `totalRevenue` (non-Cancelled L1+L2 freight — note: differs from the reports' Final-Loading-only definition), TEU `capacityUsed/capacityPct` from the active round's peak onboard TEU, top-10 agents by booking count, last 10 rounds/voyages, last 10 tracking entries and `lastPosition`.

## Capacity endpoints (module `capacity`)
`GET /capacity/vessel/:vesselId/active` (perm `vessels`) returns the capacity result for the vessel's Active round — see [03](03-rounds-voyages.md#capacity-engine).

## Related
Rounds reference `vesselId`; tracking entries must match the round's vessel; expenses/settlements pay out per vessel shares; `JvReserveMovement` is per vessel; a Service's `defaultVesselId` points here.
