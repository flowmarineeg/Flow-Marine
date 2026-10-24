# 03 — Business Rules
# Logistics & Shipping SaaS — MERN Stack MVP

---

> **STATUS NOTE (current through Sprint 046):** these are the original
> MVP-era business rules. Booking rules in particular have since changed
> substantially — see claude.md Sections 6-9 for the CURRENT rules
> (dual-layer bookings, containerNumber as primary match key, POL/POD
> always server-derived from the voyage, Expense Round/Voyage/Port scope,
> Invoice multi-booking + explicit payment allocation + admin manual status
> override, Final-Loading-only revenue eligibility, post-Final-Loading
> Discharge/Remaining outcome). Do not implement against this file's
> booking/invoice/expense rules without cross-checking claude.md first.

---

## 3.1 Master Data Rules

### Vessel
- Vessel Code must be unique across the system.
- IMO Number must be unique if provided.
- Status can be: `Active`, `Inactive`, `Under Maintenance`, `Sold`
- A vessel cannot be deleted if it is assigned to an active Round.
- Ownership Type: `Owned`, `Chartered`, `Leased`
- Charter Start/End Dates are required only if Ownership Type is `Chartered`.

### Agent
- Agent Code must be unique across the system.
- Email format must be validated.
- Status can be: `Active`, `Inactive`
- An agent cannot be deleted if linked to active Bookings or Invoices.

### Location (Country → City → Port → Terminal)
- Country must exist before a City can be created.
- City must exist before a Port can be created.
- Port must exist before a Terminal can be created.
- All dropdowns in forms must filter based on the selected parent.
- No orphan records allowed (e.g., a Port without a City).
- Country and City names must be unique at their level.
- Port names must be unique within their City.
- Terminal names must be unique within their Port.

### Container Type
- Code must be unique.
- Size options: `20ft`, `40ft`, `40HC`, `45ft`
- Type options: `Dry`, `Reefer`, `Open Top`, `Flat Rack`, `Tank`

### Expense Type
- Expense Name must be unique.
- Category: `Port Expense`, `Operating Expense`, `Other`

### Service
- Service Code must be unique.
- A Service can have only one active Route at a time.
- Default Vessel is optional at creation but required before creating a Round.
- Status: `Active`, `Inactive`

---

## 3.2 Route Rules

- A Route belongs to exactly one Service.
- A Route must have a minimum of 2 legs to be valid.
- Legs are ordered by Sequence number (1, 2, 3, ...).
- Sequence numbers must be consecutive with no gaps.
- Each leg must have a Port selected (Country, City, Port are required; Terminal is optional).
- A Route cannot be modified if a Round using this Service is in `Active` or `Completed` status.

---

## 3.3 Round Rules

- Round Number is auto-generated: `R000001`, `R000002`, etc.
- A Round must reference an existing Service.
- The Service must have a valid Route with at least 2 legs.
- Default Vessel is auto-filled from the Service but can be overridden.
- A Vessel can only be in one Active Round at a time.
- Start Date must be before End Date.
- On Round save: Voyages are automatically generated (see Section 3.4).
- Round Status: `Planned`, `Active`, `Completed`, `Cancelled`
- A Cancelled Round cannot be re-activated.
- A Completed Round cannot be modified.

---

## 3.4 Voyage Auto-Generation Rules

- Voyages are NEVER created manually.
- They are ALWAYS generated automatically when a Round is saved.
- Voyage count = number of Route Legs - 1.
- Example: Route has 4 legs (A→B→C→D), generates 3 voyages (A→B, B→C, C→D).
- Voyage Number format: `[ServiceCode]-[RoundNumber]-[SequenceNumber]`
  - Example: `SEN-R000001-01`, `SEN-R000001-02`
- POL = departure port (leg[n])
- POD = arrival port (leg[n+1])
- Initial Status: `Scheduled`
- ETD and ETA are left blank at generation (filled manually later).
- If a Round is regenerated (route changed), old Voyages are deleted and new ones created — **only if no Bookings exist**.
- If Bookings exist on any Voyage, regeneration is blocked and an error is shown.

---

## 3.5 Booking Rules

- Booking Number is auto-generated (format: `BK-000001`).
- A Booking must be linked to exactly one Voyage.
- POL and POD must match ports that exist in the Voyage's route leg sequence.
- Total Freight = `Quantity × Freight Rate` (calculated automatically, never editable directly).
- Quantity must be a positive integer.
- Freight Rate must be a positive number.
- Slot Count must be a positive integer.
- Booking Status: `Pending`, `Confirmed`, `Cancelled`
- A Cancelled Booking cannot be re-confirmed.
- A Booking cannot be deleted if an Invoice has been raised against it.
- Agent is required. Shipper and Consignee are required.

---

## 3.6 Expense Rules

- An Expense must be linked to either a Round OR a Voyage — not both, and not neither.
- Amount must be a positive number.
- Currency is a free text field (e.g., USD, EUR, SAR) — no conversion in MVP.
- Attachment is optional. If provided, must be PDF or image format (jpg, jpeg, png).
- Maximum attachment size: 10MB.
- Expense Date is required and cannot be in the future.
- Expense Type must be selected from the Expense Type master.

---

## 3.7 Invoice Rules

- Invoice Number is auto-generated (format: `INV-000001`).
- An Invoice must be linked to exactly one Booking.
- Invoice Date is required.
- Due Date must be on or after Invoice Date.
- Invoice Status: `Draft`, `Issued`, `Paid`, `Overdue`, `Cancelled`
- A Paid Invoice cannot be modified.
- A Cancelled Invoice cannot be re-issued.
- Amount and Currency are required.

---

## 3.8 Vessel Tracking Rules

- Tracking updates are always manual. No automatic updates in MVP.
- Every tracking update must be saved to `TrackingHistory` — never overwrite.
- A tracking record must reference: Service, Vessel, Round, Voyage.
- Location fields (Country → City → Port → Terminal) follow the Location hierarchy.
- Terminal is optional in tracking updates.
- `Last Update` timestamp is required on every tracking entry.
- Status options: `At Port`, `Departed`, `In Transit`, `Arrived`, `Anchored`, `Delayed`
- Tracking History is read-only (view only, never editable or deletable).

---

## 3.9 Auto-Number Rules

All auto-numbers use a `counters` MongoDB collection with atomic increment:

| Entity | Format | Prefix | Padding |
|---|---|---|---|
| Round | R000001 | R | 6 digits |
| Booking | BK-000001 | BK- | 6 digits |
| Invoice | INV-000001 | INV- | 6 digits |
| Voyage | [SvcCode]-[RoundNo]-[Seq] | Dynamic | 2 digits seq |

The counter is incremented atomically using `findOneAndUpdate` with `$inc` to prevent duplicates in concurrent requests.

---

## 3.10 Deletion Rules

| Entity | Deletion Strategy | Condition |
|---|---|---|
| Vessel | Soft delete | Cannot delete if in Active Round |
| Agent | Soft delete | Cannot delete if in active Bookings/Invoices |
| Location | Soft delete | Cannot delete if referenced in Route Legs |
| Service | Soft delete | Cannot delete if has Rounds |
| Route | No delete | Edit only |
| Round | Soft delete | Cannot delete if has Bookings |
| Voyage | No manual delete | System-managed |
| Booking | Soft delete | Cannot delete if has Invoice |
| Expense | Hard delete | Allowed with confirmation |
| Invoice | Soft delete | Cannot delete if Paid |

---

## 3.11 Status Transition Rules

### Round
`Planned` → `Active` → `Completed`
`Planned` → `Cancelled`
`Active` → `Cancelled`

### Voyage
`Scheduled` → `Departed` → `In Transit` → `Arrived` → `Completed`
Any status → `Cancelled`

### Booking
`Pending` → `Confirmed`
`Pending` → `Cancelled`
`Confirmed` → `Cancelled`

### Invoice
`Draft` → `Issued` → `Paid`
`Draft` → `Cancelled`
`Issued` → `Overdue` (system check — future feature)
`Issued` → `Cancelled`
