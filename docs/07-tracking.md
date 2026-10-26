# 07 — Tracking

Module `modules/tracking`, route `/tracking`, perm module `tracking`. UI: `/tracking` (list + history modal + form).

## Principle
`TrackingHistory` is **append-only**: entries are created, never edited or deleted (no PUT/DELETE routes exist). The "current position" of a voyage is simply its newest entry.

## Schema `TrackingHistory`
`voyageId`, `roundId`, `vesselId`, `serviceId` (all required), `portId` (required), optional `countryId`, `cityId`, `terminalId`, `status` ∈ `At Port | Departed | In Transit | Arrived | Anchored | Delayed`, `remarks`, `lastUpdate` (the observation time), `createdBy`; `createdAt` only (no `updatedAt`).
Indexes: `(voyageId, lastUpdate desc)`, `roundId`, `vesselId`, `lastUpdate`.

## Routes
| Method | Path | Perm |
|---|---|---|
| GET | `/tracking` — filters `vesselId, voyageId, serviceId, status, dateFrom, dateTo, search` (regex on remarks), paginated | `tracking` |
| GET | `/tracking/latest` — newest entry per voyage (max 50), for dashboard widgets | `tracking` |
| GET | `/tracking/:voyageId/history` — paginated history + voyage | `tracking` |
| POST | `/tracking` | `tracking` (create) |
`/latest` is declared before `/:voyageId`.

## Create rules (`tracking.service.createEntry`)
1. Round-lock check on the voyage's round (a closed round rejects new entries).
2. Voyage must exist and belong to the submitted `roundId`.
3. `vesselId` must equal the round's vessel (`Vessel mismatch`).
4. `lastUpdate` must not be in the future.
5. Insert; response populated with voyage/round/vessel/service/port/terminal/country/city/creator.

## Relationship to voyage status
Tracking status and `Voyage.status` are **independent**. Round activation moves the first voyage to `Departed` without writing a tracking entry (known gap: using `voyages:override` can desync this cascade, affecting tracking data only).

## Used by
Vessel detail (`recentTracking`, `lastPosition`), dashboard "latest positions", Excel export module `tracking`.
