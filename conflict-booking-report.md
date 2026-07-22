# Booking Selection Workflow — Voyage vs POL/POD Conflict Analysis

Status: **ANALYSIS ONLY — no code changed.** Awaiting approval before any
solution is proposed or implemented.

Scope: Layer 2 (Operational Booking), Layer 1 (Manual Booking), Booking
Import, Final Loading Import. Booking selection workflow only — capacity
engine internals are referenced only where they consume `voyageId`/`polId`/
`podId`, per Sprint 029.

---

## 1. HOW THE VOYAGE SELECTOR CURRENTLY WORKS

All four booking-creation paths (`BookingForm.jsx`, `ManualBookingForm.jsx`,
`BookingImport.jsx` for both `importType=booking` and `importType=finalLoading`)
present a single **Voyage** dropdown, populated from `GET /voyages` (all
non-Cancelled/non-Completed voyages), rendered as:

```
{voyageNumber} — {polId.name} → {podId.name} ({etd}) [{status}]
```

Each option is one **Voyage document** — i.e. one leg/sequence entry inside a
Round's `voyageIds[]` chain (`voyage.model.js`: `roundId`, `serviceId`,
`polId`, `podId`, `sequence`). A Round with 4 ports called (A→B→C→D) has 3
Voyage documents: A→B, B→C, C→D.

Once a Voyage is selected:
- Its `_id` is stored on the booking as `booking.voyageId` (Layer 2 and
  Layer 1 both require this, `required: true` on the schema).
- The frontend calls `GET /bookings/voyage-ports/:voyageId` →
  `booking.service.js#getVoyagePorts` → `getVoyagePortIds(voyageId)`.

## 2. HOW POL/POD ARE POPULATED — THE ROOT ISSUE

`getVoyagePortIds` (`booking.service.js:31-56`) does **not** return the two
ports of the selected voyage. It runs an aggregation that:

1. Matches the voyage by `_id`.
2. Looks up `routes` by `route.serviceId === voyage.serviceId`.
3. Looks up `routelegs` by `routeId`.
4. Projects `legs.portId` — i.e. **every port in the entire route** for that
   voyage's service.

```js
const getVoyagePortIds = async (voyageId) => {
  const result = await Voyage.aggregate([
    { $match: { _id: ... } },
    { $lookup: { from: 'routes', localField: 'serviceId', foreignField: 'serviceId', as: 'route' } },
    { $unwind: { path: '$route', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'routelegs', localField: 'route._id', foreignField: 'routeId', as: 'legs' } },
    { $project: { portIds: '$legs.portId' } },
  ]);
  return (result[0].portIds || []).map(String);
};
```

**Consequence**: the POL and POD `<select>` options in `BookingForm.jsx`,
`ManualBookingForm.jsx`, and the import scope are identical **no matter which
of the round's voyages is selected** — because the query key is
`voyage.serviceId`, not `voyage._id`, `voyage.polId`, or `voyage.podId`.
Selecting Voyage A→B or Voyage B→C on the same round/service yields the exact
same POL/POD port list (every port on the route: A, B, C, D).

## 3. WHETHER VOYAGE AND POL/POD DUPLICATE THE SAME RESPONSIBILITY

Yes, and asymmetrically:

- **Voyage** is presented to the user as if it selects a specific segment
  (`A → B`), shown as the dropdown label and echoed in the "Voyage No / ETD /
  ETA" info strip.
- **POL/POD** are presented as if they are independently, freely choosable
  from the round's entire route — completely decoupled from whichever voyage
  leg is selected.
- Nothing in the frontend or backend validates that `polId === voyage.polId`
  or `podId === voyage.podId`. The only backend check
  (`booking.service.js#create`, `manualBooking.service.js#create`) is that
  `polId`/`podId` are each *somewhere* in `getVoyagePortIds(voyageId)` (the
  full route) and that `polId !== podId`. That is the full extent of
  validation.

So today, `voyageId` functions as a **Round/Service selector in disguise**
(it resolves the route, hence the full port list) while `polId`/`podId` are
the *only* fields that actually carry POL→POD segment meaning — but they are
unconstrained relative to the voyage doc the user picked. Two different form
fields both claim to express "which segment is this booking on," and only
one of them (POL/POD) is actually capable of expressing it precisely; the
other (Voyage) is capable of expressing something coarser (which round/
service) that the UI mislabels as segment-precise.

## 4. CONFLICTS, INVALID COMBINATIONS, AND UX PROBLEMS

### 4.1 Silent semantic mismatch (the core defect)
A user can select Voyage **B→C** and then pick POL **A**, POD **D** (both
valid per `getVoyagePortIds`, since A and D are on the same route). Nothing
rejects this. The saved booking has:
```
booking.voyageId = <B→C voyage doc>
booking.polId    = A
booking.podId    = D
```
This is internally inconsistent: the anchor voyage's own `polId`/`podId`
(B/C) have no relationship to the booking's stated POL/POD (A/D).

### 4.2 Downstream effect on the capacity engine (direct link to Sprint 029)
`capacity.service.js` anchors every booking's "load event" on
`voyageIndexById[String(booking.voyageId)]` — i.e. it trusts `voyageId` as
the *physical loading leg*, then walks forward from there to find the
voyage whose `toPort === booking.podId` (`resolveDischargeIdx`). It never
checks `booking.polId` against the anchor voyage's own `polId` at all.

Two concrete failure modes given the 4.1 scenario:
- If the booking's `polId` (A) does not match the anchor voyage B→C's own
  `polId` (B), the cargo is still recorded as "loaded" on voyage B→C in the
  Onboard/Loaded/Remaining chain — i.e. TEU counted at the wrong leg,
  understating true capacity pressure on voyage A→B (where the container is
  physically loaded) and overstating it on B→C.
- This is exactly the class of mismatch the Sprint 029 `loadedExact` field
  was built to filter out of the **display** ("Loaded" column). A booking
  like this will now show `loadedExact.teu = 0` at every voyage row (its
  `polId`/`podId` never match any single anchor voyage's own `fromPort`/
  `toPort` pair unless it happens to be single-leg), silently vanishing from
  the "Loaded" column while still fully counted in Onboard/Remaining/
  Utilization. Sprint 029 made a real display bug more accurate, but it also
  makes this underlying data-integrity gap **visible** as bookings that
  contribute to Onboard TEU but never appear as "Loaded" anywhere.

### 4.3 Import flow inherits the same ambiguity, at scale
`bookingImport.service.js#previewImport`/`saveImport` require a single
`voyageId` for the whole file (chosen once in `BookingImport.jsx`), but each
**row** carries its own free-text `pol`/`pod` (resolved to ports via
`portMap`, looked up system-wide by name/code — not scoped to the selected
voyage or even the selected voyage's route). A single import batch against
Voyage B→C can contain rows whose POL/POD point anywhere in the port master
list, with no cross-check against the voyage's route at all (`previewImport`
resolves `pol`/`pod` from a global `Port.find({isDeleted:false})`, unlike the
manual/L2 form path which at least filters through `getVoyagePortIds`).
This is a **wider** hole than the manual entry paths: bulk data entry error
(wrong POL/POD text in the spreadsheet, or the wrong Voyage picked for the
whole batch) can silently produce hundreds of bookings anchored to a voyage
leg that has no relationship to their actual stated segment.

### 4.4 Final Loading Import reconciliation scope compounds the risk
Final Loading Import cancels every booking in `(voyageId, agentId)` scope
whose `containerNumber` is not in the manifest (`bookingImport.service.js:
297-306`). If the operator selects the wrong Voyage (easy to do, since
Voyage no longer reliably signals "this is the A→B leg" once multiple
voyages on the same round present identical POL/POD choices), the
cancellation blast radius is scoped to the wrong voyage — potentially
cancelling live bookings on the correct leg while leaving the wrong leg's
bookings untouched.

### 4.5 UX friction
- The Voyage dropdown label (`voyageNumber — POL → POD`) implies the voyage
  IS the segment, training users to expect POL/POD to auto-narrow to that
  pair. They don't — the POL/POD selects still show the whole route,
  contradicting the label's promise.
- On voyage change, `polId`/`podId` are reset to blank (`useEffect` in both
  forms) — the user must always manually reconfirm and there is no
  post-hoc validation that what they pick is coherent with what they had
  just seen advertised on the Voyage row (ETD/ETA/Status card shows the
  voyage's own POL/POD, but the port selects below let them override that
  entirely).
- No inline warning of any kind when POL/POD chosen diverge from the
  selected voyage's own `polId`/`podId`.

### 4.6 Editing constraint adds to the confusion
On edit, `voyageId` is disabled (`disabled={isEditing}` in both forms) but
POL/POD remain editable (only `isLocked` — Final Loading/Cancelled — blocks
them). So an existing booking's POL/POD can be changed post-creation to any
port on the (original) voyage's whole route, while the voyage anchor itself
is frozen — widening the gap between "which voyage this is anchored to" and
"what segment it now claims to represent" over the booking's lifetime.

## 5. SHOULD THE SELECTOR ACTUALLY REPRESENT THE ROUND?

Given §2–§4, yes — functionally, today's "Voyage" selector already **behaves
like a Round selector**: it resolves to `voyage.serviceId → route → all
ports`, which is round/service-level information, not voyage-leg-level
information. The dropdown even lists every voyage-leg of the same round
side-by-side with the exact same effective POL/POD choice set, which is
redundant — from the perspective of "what ports can I choose," selecting any
one of a round's N voyages is equivalent to selecting the round itself.

Re-labeling/re-scoping the selector to genuinely be "Round" (or
"Round + Service," since a round already carries `serviceId`) would make the
UI's actual behavior match its real semantics, and would free POL/POD to be
the single source of truth for the segment — which the system already
requires downstream (booking schema stores `polId`/`podId` directly, not a
voyage-leg reference resolved at read time).

This is a **design direction worth approving**, not something to implement
without confirmation — it changes the primary key relationship the whole
booking module is built around (`booking.voyageId` required today; a
Round-based model would need `booking.roundId` + `polId` + `podId`, with the
specific `voyageId` **derived**, not selected).

## 6. HOW VOYAGE/SEGMENT SHOULD BE RESOLVED FROM POL/POD (CONCEPTUAL — NOT A PROPOSAL)

If the selector became Round-based, the specific voyage-leg a booking is
"loaded on" would need to be *derived*, not chosen, from `(roundId, polId)`:
walk the round's `voyageIds[]` in `sequence` order (already the pattern
`capacity.service.js` uses — `voyages.sort({ sequence: 1 })` +
`voyageIndexById`) and find the voyage whose own `polId` matches the
booking's selected POL. This is conceptually the same resolution
`resolveDischargeIdx` already performs for POD — the same mechanism would
just need to also apply to POL, and needs to be shared/reused rather than
re-implemented ad hoc in the booking module.

Edge cases this resolution would need to define (not resolved here — flagged
for the solution-design phase):
- A port appearing more than once in a round's chain (repeated port calls) —
  which occurrence does POL bind to? `resolveDischargeIdx`'s "first match
  walking forward from an anchor" pattern assumes an anchor already exists;
  without a voyage anchor, POL resolution has no "forward from" starting
  point and would need its own disambiguation rule.
  This exact repeated-port ambiguity is explicitly called out in
  `capacity.service.js`'s Step B comments as the reason a *global* port map
  was rejected in favor of voyage-anchored resolution — so it is a known,
  previously-solved-for hazard in this codebase, not a new concern.
- What happens if POL matches no voyage in the round at all (round doesn't
  call that port) — must reproduce today's `BOOKING_PORT_NOT_IN_ROUND`-style
  validation, but as a pre-save 400 rather than a capacity-engine warning.
- Manual/import flows would need equivalent resolution logic, not divergent
  copies — currently `getVoyagePortIds` is shared via
  `require('./booking.service').getVoyagePortIds` from
  `manualBooking.service.js`; a POL→voyage resolver would need the same
  shared placement.

## 7. IMPACT SURVEY

### Backend validation (`booking.service.js`, `manualBooking.service.js`)
- `create()`/`update()` port-membership checks (`validPortIds.includes(...)`)
  would need to become POL→voyage resolution instead of route-membership
  checks.
- `data.voyageId` would no longer be client-supplied; `data.roundId` (or
  equivalent) becomes the required input, with `voyageId` computed
  server-side before `Booking.create()`.

### Booking creation (Layer 1 & Layer 2)
- Both forms' `voyageId` field, `voyages-dropdown` query, and the
  `useEffect` that clears POL/POD on voyage change would be replaced by a
  `roundId`-driven flow; POL/POD dropdowns would need to source from the
  round's actual port chain (already computable — `Round.voyageIds` →
  populate `polId`/`podId`/`sequence`) instead of `getVoyagePortIds`'s
  route-wide list.
- `item?.voyageId` prefill on edit would need to resolve back to
  `roundId` for the dropdown to preselect correctly.

### Import flow (`bookingImport.service.js`, `BookingImport.jsx`)
- `previewImport`/`saveImport` currently key everything off one
  `voyageId` for the whole file. A Round-based model would need each row's
  own `pol`/`pod` resolved to a specific voyage within the chosen round
  (today rows are matched system-wide by port name/code with no per-row
  voyage awareness at all — see §4.3). This is the largest-surface change:
  existing dedup/match key is `(containerNumber, voyageId, agentId)`
  (Sprint 026 architecture, `claude.md` §"Layer 2 Import Architecture") —
  moving to round-scoped matching changes the identity key itself.

### Final Loading Import reconciliation
- Cancellation scope (`{ voyageId, agentId, containerNumber: $nin: manifest }`)
  would need to become round-scoped or per-resolved-voyage-scoped — a
  meaningful behavior change to the blast radius of automatic cancellation,
  requiring explicit sign-off given how destructive this step already is
  (§4.4).

### Capacity engine (`capacity.service.js`)
- Already anchors on `booking.voyageId` for `loadVoyageIdx`
  (`voyageIndexById[String(b.voyageId)]`). If `voyageId` becomes a derived
  field instead of user-supplied, the engine's anchoring becomes *more*
  reliable (guaranteed `polId === anchorVoyage.polId` by construction),
  which would make the Sprint 029 `exactSegment` flag closer to universally
  true for correctly-resolved bookings — a net improvement, not a new
  requirement on the capacity module itself. No capacity.service.js changes
  would be strictly required, but its behavior would materially improve as
  a side effect.

### Reports (`reports.service.js`) and Invoices (`invoice.service.js`)
- Both modules reference `polId`/`podId`/`voyageId` on bookings for
  aggregation/display. Need an inventory pass (not done in this report) to
  confirm none of them assume `voyageId` is client-chosen/independently
  meaningful in a way that a derived-`voyageId` model would break — likely
  low risk since they consume the field as populated data, not as an
  input, but must be verified explicitly before implementation.

### Business rules (`claude.md` §6 "Layer 2 Import Architecture — Sprint 026")
- `IMPORT SCOPE = (Voyage + Agent)`, `MATCHING KEY = Container Number`,
  `BUSINESS IDENTITY = (Voyage + Agent + Container Number)` are explicitly
  documented, current-sprint, load-bearing rules. Any move toward
  Round-based selection is a **direct amendment** to this documented
  architecture and must be treated as a deliberate, explicit decision, not
  a side effect of a UI fix.

## 8. MIGRATION RISKS AND BACKWARD COMPATIBILITY

- **Existing data**: `Booking.voyageId` and `ManualBooking.voyageId` are
  `required: true` today for thousands of potential existing rows. Any
  schema change (e.g., adding `roundId`, making `voyageId` derived/optional)
  needs a backfill migration, not just a schema edit — existing documents
  already have a `voyageId` that may or may not have `polId`/`podId`
  consistent with that voyage's own ports (per §4.1, some may not).
- **Auto-number / booking identity**: `bookingNumber` sequencing and
  `containerNumber` matching are independent of this change and unaffected
  — good, reduces blast radius.
- **Existing bookings with the §4.1 mismatch**: a migration would need a
  decision — leave as-is (frozen under old semantics), or attempt to
  re-resolve `voyageId` from `(roundId, polId)` and flag ones that don't
  cleanly resolve (e.g. repeated-port ambiguity from §6, or POL not found in
  round at all) for manual review.
- **API contract break**: `POST /bookings`, `POST /bookings/manual`,
  `POST /bookings/import/preview`, `POST /bookings/import/save` all
  currently require `voyageId` in the request body per
  `booking.validation.js` / `manualBooking.validation.js`. Any external
  integrations or the Excel import template (`EXCEL_COLUMN_MAP`) that assume
  this contract would need a coordinated frontend+backend release, not an
  incremental one — `voyageId` required→optional/removed is a breaking
  validation change.
- **Frontend caching**: `voyages-dropdown` / `voyage-ports` React Query keys
  are used across `BookingForm.jsx`, `ManualBookingForm.jsx`, and
  `BookingImport.jsx`; a Round-based rework touches all three consistently
  or leaves them inconsistent with each other mid-migration — a phased
  rollout would need to keep Layer 1, Layer 2, and Import in sync to avoid
  three different mental models existing simultaneously.
- **Capacity cache**: `invalidateRoundCache(roundId)` calls are already
  round-keyed everywhere in `booking.service.js`/`manualBooking.service.js`/
  `bookingImport.service.js` — this part of the system is already
  round-aware and would not need rework; it's evidence the "the real unit of
  work is the Round" reading in §5 is consistent with how the rest of the
  codebase already thinks about this domain.

---

## SUMMARY

The "Voyage" selector's dropdown value only ever narrows the POL/POD choice
set to "every port on this round's route" (via `serviceId`), never to the
specific two ports of the voyage-leg the user picked — so it currently
functions as a Round selector while being labeled and validated as if it
were a segment selector. POL/POD, meanwhile, are the only fields that
actually carry segment-level meaning, but nothing ties them back to the
voyage the user selected. This produces silently-invalid combinations that
propagate into the capacity engine's cargo-flow anchoring (directly visible
now via Sprint 029's `loadedExact` field), the import flow's per-row
POL/POD resolution (wider surface, no voyage-route cross-check at all today),
and Final Loading Import's cancellation blast radius.

No solution is proposed here per the instruction to analyze only. §5–§6
sketch the *direction* (Round-based selection with derived voyage
resolution) implied by the evidence in §1–§4, but the concrete design,
migration plan, and phased rollout require explicit approval before any
implementation work begins.

---
END OF ANALYSIS — awaiting approval before proposing or implementing any solution.
