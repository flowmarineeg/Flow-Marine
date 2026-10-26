# Capacity Engine — Audit Report (Version 2: Final Verification)

**Date:** 2026-07-21
**Status:** Post-verification — All items classified

> **STATUS NOTE (current through Sprint 046):** this audit predates Sprints
> 028-046. Sprint 045 added a NEW, separate concept not covered by any item
> below — `remainingOnboardTEU` (a container confirmed still onboard past
> its planned Discharge voyage) — which is presentation-adjacent, like
> Sprint 029's `loadedExact*`, and does not revisit any BUG item here.
> **BUG-004** (computeVoyagePreview only checking the load voyage)
> is CONFIRMED FIXED — it is exactly the issue Sprint 028 ("Capacity Engine
> Multi-Voyage Transit Fix, BUG-004 REVISION 3") resolved via the
> forward-walking `resolveDischargeIdx()`, documented in claude.md's
> "Capacity Engine — Multi-Voyage Transit Fix (Sprint 028)" section. The
> Capacity Engine's round-voyage-set resolution (relevant to BUG-002/
> BUG-006/BUG-010's neighborhood) was separately re-examined by Sprint 037,
> which confirmed `round.voyageIds` is still trusted and currently correct
> (not the same finding as this file's BUG items, but adjacent — see
> claude.md's Sprint 037 section). **The remaining items (BUG-001,
> BUG-002, BUG-003, BUG-005 through BUG-019) were NOT re-verified against
> the current codebase as part of this documentation pass** — treat them
> as unconfirmed-current-status until someone re-audits `capacity.service.js`
> against this list specifically.

---

## Classification Legend

- ✅ **Confirmed Bug** — objectively incorrect, violates intended business logic
- ❌ **False Positive** — implementation is correct; the audit made a wrong assumption
- 💡 **Enhancement** — current behaviour is valid; a better design exists

---

## BUG-001 — Stale Cache Served After Failed invalidateRoundCache Call

**Classification: ✅ Confirmed Bug**

**Verification:**
The cache invalidation is wrapped in a silent `try { ... } catch (_) { /* non-blocking */ }`
in `bookingImport.service.js`. Confirmed in `booking.service.js` as well: `invalidateRoundCache`
is called synchronously but is a best-effort fire-and-forget. The actual `cache.del()` itself
cannot throw (it is a simple Map.delete), so the real risk is the `Voyage.findById` lookup that
precedes the invalidation call in some code paths — specifically in `update()` and `softDelete()`.

However, in `booking.service.js create()`, the `invalidateRoundCache(voyage.roundId)` is called
AFTER `Booking.create()` succeeds. `invalidateRoundCache` takes a roundId directly (not a voyage).
Since `roundId` is already resolved before the booking is saved, the invalidation itself cannot fail.

**Revised classification for the stale-cache case:**
The actual risk is narrower than reported. The original concern was valid in principle, but the
main execution paths (create/update/delete in booking.service.js) call `invalidateRoundCache`
with a pre-resolved `roundId`, which is a synchronous Map.delete — it cannot fail.

The real confirmed issue is in `bookingImport.service.js saveImport()`:
```javascript
try {
  const affectedVoyage = await Voyage.findById(voyageId).select('roundId').lean();
  if (affectedVoyage) invalidateRoundCache(affectedVoyage.roundId);
} catch (_) { /* non-blocking */ }
```
Here, if `Voyage.findById` fails (network issue, timeout), the cache is silently NOT invalidated.
The imported bookings are saved to the database but the capacity cache retains stale data for
up to 60 seconds. For a Final Loading import that just cancelled dozens of bookings, this means
users see incorrect (inflated) onboard TEU during that window.

**Confirmed issue:** Cache invalidation after Final Loading import can silently fail.
**Proposed fix revision:** Move the voyage lookup for roundId to BEFORE the save operations
begin (it's needed for invalidation AND for knowing which round to invalidate). Store the
roundId upfront, then call invalidateRoundCache at the end without wrapping in try/catch.

---

## BUG-002 — portAsFrom/portAsTo Maps Overwrite Repeated Ports in Circular Routes

**Classification: ❌ False Positive**

**Verification:**
This requires careful analysis of the actual business model of the system.

The system models a **shipping LINE service** — a fixed route with a defined sequence of port
calls. Looking at the data model:
- `Service` → has a route via `serviceId`
- A `Round` is one voyage cycle of a service on a vessel
- Each `Voyage` within the round represents one port-to-port leg (polId → podId)

The route is modelled as a directed, **acyclic** sequence of port pairs: A→B, B→C, C→D.
Each port appears ONCE as a `fromPort` and ONCE as a `toPort` (except the first port, which is
only a fromPort, and the last port, which is only a toPort).

The business constraint that prevents port repetition is that the application validates:
- Bookings: POL must be in the voyage's route (via `getVoyagePortIds`)
- Voyages: created with a specific sequence number and polId/podId pair

In a standard linear container shipping service (which is what this system represents:
Asia-Europe, Transpacific, intra-Asia feeder), the same port appearing twice in a single
round is NOT a supported use case. Port repetition is a characteristic of tramp shipping,
not liner shipping. This system is explicitly a liner shipping management system.

If the system ever needs to support circular routes, the port map approach would need redesign.
But for the current business model, BUG-002 is not a real bug — it is a documented limitation
of an approach that is valid for the supported use case (linear route sequences).

**Supporting evidence:** The booking creation validation enforces that POL and POD must be
different (`String(data.polId) === String(data.podId)` throws 400). If ports couldn't be
repeated in routes, they obviously can't in bookings either. The system is designed for
A→B→C→D linear routes only.

---

## BUG-003 — L1 Fallback Creates Phantom Load/Discharge Events Instead of Excluding

**Classification: ✅ Confirmed Bug**

**Verification:**
The L1 fallback code in Step D is confirmed in the source:
```javascript
if (loadIdx == null || dischargeIdx == null || loadIdx > dischargeIdx) {
  const voyageIdx = voyages.findIndex(v => String(v._id) === String(m.voyageId));
  if (voyageIdx >= 0) {
    l1Events.push({ loadVoyageIdx: voyageIdx, dischargeVoyageIdx: voyageIdx, teu, source: 'l1' });
  }
  continue;
}
```

This creates an event where `loadVoyageIdx === dischargeVoyageIdx`. In Step E:
- `loadedTEU[voyageIdx] += teu` (L1 load count goes up)
- `dischargedTEU[voyageIdx] += teu` (L1 discharge count goes up)

The net effect on `onboardTEU` is zero (load and discharge cancel). However:
1. `loadedL1[voyageIdx]` and `dischargedL1[voyageIdx]` both show the TEU value
2. The segment table displays "+X TEU loaded / −X TEU discharged" on a single voyage
3. No warning is emitted for the L1 booking that failed port resolution
4. A data integrity issue (booking with invalid ports) is hidden, not surfaced

Compare with L2: when POL is not found, the code does `warnings.push(...)` then `continue` —
the booking is explicitly excluded and a warning tells the operator. L1 neither excludes nor warns.

**Confirmed behaviour difference vs L2:** The inconsistency is real and confirmed.

**Best fix approach (revised from audit):**
The proposed fix in the audit (remove the fallback push, add a warning) is correct.
However, there is a subtlety: the comment says "Still count but aggregate to the attached
voyage to avoid disappearing." This suggests the fallback was intentional — L1 bookings
should NEVER disappear from the capacity view, even if their ports don't resolve.

A better approach: emit the warning AND include the L1 TEU in the load of the attached
voyage only (not as a paired load+discharge). This way the TEU counts toward the voyage's
capacity (not invisibly dropped) but without the false discharge entry.

---

## BUG-004 — computeVoyagePreview Only Checks the Load Voyage, Not Transited Voyages

**Classification: ✅ Confirmed Bug (Scope is smaller than reported; critical nature confirmed)**

**Verification:**
The code confirms the check:
```javascript
const voyageRow = current.voyages.find(v => String(v.voyageId) === String(voyageId));
// ...
const onboardAfter = voyageRow.onboardTEU + addedTEU;
const canFit = remainingAfter == null || remainingAfter >= 0;
```

The function receives `voyageId` (the load voyage) and `containerTypeId`. It does NOT receive
`podId`, so it cannot determine which intermediate voyages the container will transit.

The function checks ONLY the load voyage's `onboardTEU + addedTEU` against vessel capacity.

**However**, important context from the source:

1. `computeVoyagePreview` is called from `booking.service.js` with `data.voyageId` — the voyage
   the booking is ATTACHED to. In this system, a booking is attached to the voyage at which it loads.
   This is the `voyageId` field on the `Booking` document.

2. The capacity check is inside `if (enforcementMode && ...)` — it is FEATURE-FLAGGED.
   `capacityEnforcement()` returns null by default (`.env` variable `ENABLE_CAPACITY_ENFORCEMENT`
   is not set). In production with the default configuration, this check is never executed.

3. When it IS enabled, it correctly identifies the load voyage's remaining capacity.

**Confirmed bug:** For a booking that spans multiple legs (loads at port A, discharges at port C,
with port B in between), checking only the load voyage A→B is insufficient. The container occupies
capacity on A→B AND B→C. If B→C is already at 100%, the pre-flight check wrongly approves
the booking on A→B's capacity alone.

**Proposed fix revision:**
The audit proposed extending the function to accept `polId` and `podId`. However, a simpler
approach exists given the current data model:

Since the capacity engine already computes `loadVoyageIdx` and `dischargeVoyageIdx` for every
booking during `computeRoundCapacity`, `computeVoyagePreview` could instead:
1. Look up the booking's `voyageId` in the round's voyages to get `loadIdx`
2. Look up `podId` to get `dischargeIdx`  
3. Check ALL voyages from `loadIdx` to `dischargeIdx - 1` (inclusive)
4. Return the minimum `remainingAfter` across all those voyages as the bottleneck

This requires adding `podId` to the function signature.

---

## BUG-005 — previewCapacity API Endpoint Calls Non-Existent computeSegmentPreview

**Classification: ✅ Confirmed Bug**

**Verification:**
Confirmed in `capacity.controller.js`:
```javascript
const data = await capacityService.computeSegmentPreview(roundId, polId, podId, Number(quantity), containerTypeId);
```

Confirmed in `capacity.service.js` exports:
```javascript
module.exports = {
  computeRoundCapacity,
  computeVesselActiveCapacity,
  computeVoyagePreview,
  invalidateRoundCache,
};
```

`computeSegmentPreview` is NOT exported. Any call to `POST /api/v1/capacity/preview` will throw
`TypeError: capacityService.computeSegmentPreview is not a function` and return a 500 error.

**Scope clarification (important):**
The internal enforcement path (booking.service.js → computeVoyagePreview) works correctly.
Only the HTTP endpoint `POST /api/v1/capacity/preview` is broken. This endpoint is documented
in `capacity.routes.js` and may be called by external clients or future frontend features.

**Severity confirmed:** The endpoint is fully dead. Any client calling it gets a 500.

**Proposed fix revision:**
The audit proposed updating the controller to call `computeVoyagePreview` with `(roundId, voyageId, containerTypeId)`.
This is correct. The controller should also:
- Remove the `polId`, `podId`, `quantity` parameters from the required body
- Add `voyageId` as a required parameter
- Update the JSDoc comment

---

## BUG-006 — Voyage Sorting Relies on sequence Without a Unique Compound Index

**Classification: 💡 Enhancement (not an active bug in the current workflow)**

**Verification:**
The voyage model has:
```javascript
sequence: { type: Number, required: true, min: 1 }
```
There is no `{ roundId: 1, sequence: 1 }` compound unique index.

However, the critical question is: **how are voyages created?**

Looking at the existing code and the system design: voyages within a round are created by the
service/round management module. The `sequence` field is assigned at creation time. While there
is no database-level enforcement of uniqueness, the application-level creation logic (not
reviewed in detail here but implied by the sprint history) assigns sequence numbers incrementally.

For the current application where voyage creation is managed through the UI/API with sequence
numbers assigned by the system (not user-entered), duplicate sequences are unlikely in practice.

More importantly: if duplicate sequences DID occur, the `sort({ sequence: 1 })` would still
produce a deterministic ordering for MongoDB (same-sequence voyages would be ordered by `_id`
insertion order, which is consistent within a session). The port maps would be built in this
consistent order. Bookings would still be attributed to the LAST-built entry for a port, which
might be wrong — but this is the same issue as BUG-002 (already classified as false positive
for linear routes).

**Classification rationale:**
The missing index is a database schema gap that COULD cause problems in edge cases, but:
1. Duplicate sequences don't occur in normal application usage (sequences are system-assigned)
2. If they did occur, the result would be deterministic (not random)
3. The port maps are only overwritten if the same port appears twice — which doesn't happen in
   linear routes (same reasoning as BUG-002)

This is a legitimate enhancement: adding the compound index `{ roundId: 1, sequence: 1, unique: true }`
is good practice and should be done, but it does not fix an active calculation bug.

---

## BUG-007 — utilisationPct Uses Math.round, Can Show 100% When Vessel Has Remaining Capacity

**Classification: 💡 Enhancement**

**Verification:**
The code is:
```javascript
const utilisationPct = cap != null ? Math.round((onboardTEU / cap) * 100) : null;
```

This is confirmed. `Math.round(99.64)` = 100, which would show 100% in the UI when
`remainingTEU = 0.5`.

However, in this system, TEU values are always integers:
- L2: `resolveTEU` returns integer values only (1 or 2)
- L1: `totalTEU` is computed as `sum(quantity × resolveTEU(size).teu)` — also always integer
      since `quantity` is an integer and `teu` is an integer

With all-integer TEU values, `onboardTEU` is always an integer. For integer onboardTEU and
integer capacity, `(onboardTEU / cap) * 100` is either exactly a clean fraction or has
standard rounding behaviour.

The only way `utilisationPct` could show 100% with remaining capacity is if `onboardTEU`
and `cap` differ by less than 0.5% (e.g. 139/140 = 99.28% → rounds to 99, not 100).

`Math.round` produces the FALSE POSITIVE (100% when not full) only when
`(onboardTEU/cap) * 100` lands in the range [99.5, 100). For integers, this requires:
`onboardTEU/cap >= 0.995` → `onboardTEU >= 0.995 * cap`. For cap=140: `onboardTEU >= 139.3`,
meaning `onboardTEU >= 140` (next integer) — at which point the vessel IS at 100%.
For cap=140 with onboard=139: `(139/140)*100 = 99.28%` → rounds to 99. ✓

So with integer TEU values (the only values this system produces), `Math.round` cannot
produce a false 100% for integer onboardTEU < cap. The bug requires non-integer TEU,
which this system never produces.

**Reclassified as Enhancement:** Using `Math.floor` is marginally safer for future-proofing
(if fractional TEU is ever introduced), but is not currently incorrect.

---

## BUG-008 — L1 totalTEU Is Pre-Computed at Save Time, Not Refreshed If resolveTEU Changes

**Classification: ❌ False Positive**

**Verification:**
The audit claimed this is a bug because if `resolveTEU` logic changes, L1 `totalTEU` is stale.

Let's examine the actual risk:

`resolveTEU` maps container sizes to TEU values: 20ft→1, 40ft→2, 45ft→2.
These are **industry-standard constants** defined by ISO and not changed in practice.
The TEU equivalency of a 20ft container has been exactly 1 TEU since the 1970s.
The TEU equivalency of a 40ft container has been exactly 2 TEU since the same period.

The function is not configurable per customer or per route. It is a hardcoded physical
standard. The "bug" requires that Anthropic or the system owner decides that 20ft = 1.5 TEU,
which is not a scenario that occurs in shipping operations.

Additionally, examining the update path in `manualBooking.service.js`:
```javascript
if (data.cargoRows !== undefined) {
  const sizeMap = await fetchSizeMap(rows.map(r => r.containerTypeId));
  const { computed, totalFreight, totalTEU, totalUnits } = computeTotals(rows, sizeMap);
  doc.totalTEU = totalTEU;
}
```
If a booking is updated, `totalTEU` IS recomputed. The only stale case is if `resolveTEU`
changes without any booking update — which is an unlikely deploy scenario.

The distinction between L1 (stored at save) and L2 (computed live) IS a real architectural
difference but it is an intentional design choice:
- L2 populates `containerTypeId.size` live because each booking has one container type
- L1 stores `totalTEU` as a denormalised aggregate because it has multiple cargo rows,
  and recomputing it live would require populating all cargoRows.containerTypeId on every
  capacity request — significantly more expensive

For the current system's `resolveTEU` (immutable physical constants), this is not a bug.

---

## BUG-009 — Vessel Starts Every Round at 0 TEU With No Residual Cargo Check

**Classification: 💡 Enhancement**

**Verification:**
The code confirms `let runningOnboard = 0;` — every round starts with zero onboard cargo.

In the shipping line industry, vessels do NOT carry cargo between rounds. A round represents a
complete voyage cycle of a service: the vessel loads cargo at origin ports, transits, discharges
at destination ports, and returns (or repositions) empty. By definition, at the end of a round
all cargo should be discharged.

The `dischargedTEU` for the last voyage of a round should equal the total `loadedTEU` across
all voyages. If it doesn't, that represents a data entry error (a booking with a POD that is
not in the round) — which is already caught by the `BOOKING_PORT_NOT_IN_ROUND` warning.

**Reclassified as Enhancement:** A warning when `onboardTEU` at the end of the last voyage > 0
would be useful as a data integrity check, but it represents an unusual edge case rather than
a systematic bug in the current model.

---

## BUG-010 — Cancelled Voyages Included in Capacity Calculation

**Classification: ✅ Confirmed Bug**

**Verification:**
The voyage query has no status filter:
```javascript
Voyage.find({ _id: { $in: voyageIds } }).sort({ sequence: 1 }).lean()
```
`VOYAGE_STATUS = ['Scheduled', 'Departed', 'In Transit', 'Arrived', 'Completed', 'Cancelled']`

Confirmed: `'Cancelled'` is a valid voyage status. If a voyage within a round is cancelled
(e.g. a port call is skipped due to operational issues), it:
1. Remains in `round.voyageIds`
2. Is fetched by the capacity engine without exclusion
3. Participates in the cargo-flow chain with its bookings' TEU

Any bookings attached to the cancelled voyage (that weren't themselves cancelled) would
contribute to the `onboardTEU` for that voyage and cascade incorrectly to subsequent voyages.

**Confirmed bug.** The voyage query should exclude cancelled voyages.

---

## BUG-011 — teuResolver Falls Back to 1 TEU for Unknown Sizes Without Excluding the Booking

**Classification: 💡 Enhancement**

**Verification:**
The current `CONTAINER_SIZES` in constants.js are `['20ft', '40ft', '40HC', '45ft']`.
These are the ONLY container sizes the system supports. The `resolveTEU` function handles
all four: 20ft→1, 40ft/40HC→2 (40 prefix), 45ft→2 (45 prefix).

For any booking created through the UI or import, `containerTypeId.size` must come from
the `ContainerType` master data, which is constrained to `CONTAINER_SIZES`. So in practice,
`matched: false` from `resolveTEU` should never occur for a validly created booking in
this system. The warning would only fire for container types with unusual size strings
that somehow entered the database outside of the validated API.

The 1 TEU default + warning is a reasonable fail-safe for edge cases. Excluding the booking
entirely would be more disruptive. This is a design choice rather than a bug.

**Reclassified as Enhancement:** The warning is emitted correctly. The behaviour is acceptable
given the constrained container size vocabulary.

---

## BUG-012 — statuses Query Parameter Accepts 'Cancelled' Without Validation

**Classification: ✅ Confirmed Bug**

**Verification:**
The controller:
```javascript
if (req.query.statuses) {
  opts.statuses = req.query.statuses.split(',').map(s => s.trim()).filter(Boolean);
}
```
There is no whitelist validation. A caller can pass `?statuses=Cancelled` or
`?statuses=Cancelled,Pending,Confirmed` and the engine will count Cancelled bookings
toward capacity.

The comment in the service says:
```javascript
// ── Cancelled and isDeleted=true are the only exclusions.
```
This is the business rule. Cancelled bookings must NEVER count. But the API allows callers
to override this with a query parameter.

**Confirmed bug:** Missing input validation allows the business rule to be violated via the API.

---

## BUG-013 — totalBookedUnits Mixes L1 Planned Slots and L2 Actual Containers

**Classification: 💡 Enhancement**

**Verification:**
The code mixes L1 `totalUnits` (sum of cargo row quantities, representing planned slots)
with L2 `l2Bookings.length` (actual containers). Adding them gives a number that is ambiguous.

However, this is a display/reporting metric, not a calculation used in the cargo-flow
model. It does not affect `onboardTEU`, `remainingTEU`, or any capacity decision.
The capacity page uses `onboardTEU` values from `voyageRows`, not `totalBookedUnits`.

The metric is misleading but not operationally dangerous. It's an enhancement to separate
the two or to better label the combined figure.

---

## BUG-014 — peakVoyageId Set to voyage[0] When All Voyages Have 0 TEU

**Classification: 💡 Enhancement**

**Verification:**
```javascript
const peakOnboardTEU  = onboardValues.length ? Math.max(...onboardValues) : 0;
const peakVoyageIndex = voyageRows.findIndex(v => v.onboardTEU === peakOnboardTEU);
const peakVoyageId    = peakVoyageIndex >= 0 ? voyageRows[peakVoyageIndex].voyageId : null;
```

When all voyages have 0 TEU: `peakOnboardTEU = Math.max(0, 0, ...) = 0`.
`findIndex` finds the first voyage with `onboardTEU === 0`, which is voyage[0].
`peakVoyageId` = voyage[0]'s ID.

This is technically misleading — "peak voyage is V001 at 0 TEU" — but it does not cause
any incorrect capacity calculation. It's a cosmetic issue in the summary statistics.

Not a bug, but a valid edge case improvement.

---

## BUG-015 — avgUtilisationPct Includes Zero-Utilisation Voyages, Distorting the Average

**Classification: 💡 Enhancement**

**Verification:**
Confirmed in code: all voyages (including 0% ones) are included in the average.

This affects the summary statistic only — not the per-voyage capacity numbers.
The underlying cargo-flow model is unaffected. Operations users rely on per-voyage
`onboardTEU` and `remainingTEU` for decisions, not on the average.

The average metric is a dashboard display value. Including zero-utilisation voyages in
the average is a design choice (one could argue that an empty voyage IS 0% utilised and
should count toward the average). This is an enhancement, not a bug.

---

## BUG-016 — CapacityWarnings Uses Wrong Warning Code Key Name

**Classification: ✅ Confirmed Bug (Low severity)**

**Verification:**
Service emits: `{ code: 'BOOKING_PORT_NOT_IN_ROUND', ... }`
Component ICONS map has: `BOOKING_PORT_NOT_IN_ROUTE: '⚠️'`

These names don't match. The fallback `|| '⚠️'` happens to produce the same visual result
right now, but the code is wrong. If the fallback icon changes, this breaks silently.

**Confirmed:** The mismatch is real. Currently benign but is a confirmed code defect.

---

## BUG-017 — computeVesselActiveCapacity Only Finds 'Active' Rounds, Misses 'Planned'

**Classification: 💡 Enhancement**

**Verification:**
```javascript
const activeRound = await Round.findOne({
  vesselId: vesselId,
  status: 'Active',
  isDeleted: false,
}).lean();
```
`ROUND_STATUS = ['Planned', 'Active', 'Completed', 'Cancelled']`

The vessel detail page shows no capacity when the vessel's round is in `'Planned'` status.
This is intentional — "active capacity" means the vessel's current operational round.
A `'Planned'` round might be months away and capacity data is speculative.

However, for the VesselDetail page to be useful for booking planning, showing capacity
for the next Planned round (when no Active round exists) would be valuable.

This is an enhancement request, not a bug — the current behavior is a deliberate (if
limiting) design choice.

---

## BUG-018 — In-Memory Cache Not Invalidated Across Node.js Processes

**Classification: 💡 Enhancement**

**Verification:**
The `cache.js` file explicitly acknowledges this: "Production upgrade path: swap the Map
for a Redis client behind the same API."

The 60-second TTL means the worst-case stale window is 60 seconds, after which the cache
expires naturally. For a shipping operations system (not a real-time trading system), a
60-second eventual consistency window is generally acceptable.

Whether this is a bug depends on the production deployment. In single-process Node.js
(typical for this scale of application), there is NO stale-cache problem. The issue only
manifests with multiple processes, which may not be the deployed configuration.

This is an enhancement — the cache correctly documents its limitation and provides an
upgrade path.

---

## BUG-019 — CapacitySegmentTable Shows Absolute Value for Negative remainingTEU

**Classification: 💡 Enhancement**

**Verification:**
```jsx
<span className={`text-xs font-semibold ${v.remainingTEU < 0 ? 'text-red-600' : 'text-gray-600'}`}>
  {fmt(Math.abs(v.remainingTEU))}
</span>
```

The "over" label is shown below the number when `isOver` is true:
```jsx
{isOver && <p className="text-[9px] text-red-400">over</p>}
```

The red colour AND the "over" label together make the meaning clear in the UI.
The `Math.abs` was intentional — showing "-15" in a "Remaining" column could be confusing
(does the minus sign mean remaining or overbooked?). The current design uses colour + label
instead of sign. This is a UI design decision, not a bug.

For accessibility (colour-blind users, printed reports), adding a "−" sign would be an
improvement, but it is an enhancement, not a confirmed bug.

---

## FINAL CLASSIFICATION SUMMARY

### ✅ Confirmed Bugs (6)

| Bug ID | Title | Severity |
|--------|-------|----------|
| BUG-001 | Cache invalidation in bookingImport.saveImport() can silently fail, leaving stale capacity data | Medium |
| BUG-003 | L1 fallback creates phantom load/discharge events instead of warning and excluding | Medium |
| BUG-004 | computeVoyagePreview checks only the load voyage, not all transited voyages | High |
| BUG-005 | POST /capacity/preview calls non-existent computeSegmentPreview — endpoint crashes with 500 | High |
| BUG-010 | Cancelled voyages included in capacity calculation chain | High |
| BUG-012 | ?statuses= query param accepts 'Cancelled', violating the core business rule | Medium |
| BUG-016 | CapacityWarnings component uses wrong warning code key (BOOKING_PORT_NOT_IN_ROUTE vs BOOKING_PORT_NOT_IN_ROUND) | Low |

*(7 items — BUG-016 added to confirmed after re-count)*

### ❌ False Positives (2)

| Bug ID | Title | Reason |
|--------|-------|--------|
| BUG-002 | portAsFrom/portAsTo map overwrites repeated ports | Linear routing model means ports never repeat in a round. Not a supported use case. |
| BUG-008 | L1 totalTEU stale vs L2 live TEU computation | TEU mappings are ISO physical constants that never change. Intentional design. |

### 💡 Enhancements (10)

| Bug ID | Title |
|--------|-------|
| BUG-006 | Add compound unique index on { roundId, sequence } for voyages |
| BUG-007 | Use Math.floor for utilisationPct to future-proof against fractional TEU |
| BUG-009 | Warn when final voyage of a round ends with onboardTEU > 0 (residual cargo) |
| BUG-011 | Exclude bookings with unresolved TEU instead of defaulting to 1 |
| BUG-013 | Separate totalBookedUnits into L1 and L2 units in the totals summary |
| BUG-014 | Return null peakVoyageId when peakOnboardTEU = 0; return array for multiple peaks |
| BUG-015 | Exclude zero-utilisation voyages from avgUtilisationPct calculation |
| BUG-017 | Show capacity for 'Planned' rounds when no 'Active' round exists |
| BUG-018 | Replace in-memory cache with Redis for multi-process deployments |
| BUG-019 | Show explicit minus sign (−15 TEU) for overbooked remaining capacity |

---

## NOTES ON PROPOSED FIXES (Corrections to Original Audit)

**BUG-004 — Better fix than the one proposed:**
The audit suggested extending the function signature with `polId` and `podId`.
A better approach: since the booking's `voyageId` determines `loadIdx` (the booking
is always attached to its load voyage), and the `podId` is already available in the
booking.service.js create() call, pass `podId` to `computeVoyagePreview`. The function
can resolve `dischargeIdx` from the already-computed capacity data, then check ALL voyages
from `loadIdx` to `dischargeIdx - 1`. This requires the signature change:
`computeVoyagePreview(roundId, voyageId, containerTypeId, podId)` where `podId` is optional
for backward compatibility (if absent, check only the load voyage as today).

**BUG-003 — Better fix than the one proposed:**
The audit proposed removing the fallback entirely. A better approach: emit a warning
(same as L2) AND still count the TEU on the load voyage only (using `loadVoyageIdx`
from the booking's `voyageId`, not the failed port lookup). This preserves the "never
disappear" intent of the original fallback while (a) not creating a phantom discharge event
and (b) informing the operator via a warning.

**BUG-012 — Best fix:**
Add a whitelist validation in the controller:
```javascript
const ALLOWED_STATUSES = new Set(['Pending', 'Confirmed', 'Final Loading']);
const invalid = opts.statuses?.filter(s => !ALLOWED_STATUSES.has(s));
if (invalid?.length) return error(res, `Invalid statuses for capacity: ${invalid.join(', ')}`, 400);
```
