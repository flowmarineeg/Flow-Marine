# 05 — Database Planning
# Logistics & Shipping SaaS — MERN Stack MVP

---

> **STATUS NOTE (current through Sprint 046):** this is the ORIGINAL MVP
> schema plan and is now substantially superseded for `bookings`,
> `expenses`, and `invoices` in particular. Confirmed, current deviations:
> `bookings.quantity`/`slotCount` were REMOVED (Sprint 025/026 — one
> booking = one container; `totalFreight` is still server-computed but no
> longer `quantity × freightRate`); `bookings.polId`/`podId` are no longer
> client-set, always server-derived from the voyage; `bookings` gained
> `dischargeStatus`/`dischargedAt` (Sprint 045, additive, independent of
> `status`); a parallel `manualbookings` collection (Layer 1) was added
> (Sprint 023) with its own `cargoRows[]` shape; `expenses` gained `portId`
> (Sprint 036, inferred scope, never a stored `scope` field); `permissions`
> gained an `override` action (Sprint 046, additive boolean, invoices-only
> in practice); `invoices` was restructured to
> header+`lineItems[]` with a new sibling `payments` collection (Sprint
> 033). Do NOT use this file's `bookings`/`expenses`/`invoices` field lists
> for new work — read the actual current models (or claude.md Section 6)
> instead. Every other collection below (masters, rounds, voyages,
> tracking, audit log) remains structurally accurate.

---

## 5.1 Database Configuration

- **Database:** MongoDB | **ODM:** Mongoose | **Name:** `logistics_saas`
- All schemas: `timestamps: true`, `createdBy` + `updatedBy` → users
- Soft delete pattern: `isDeleted: Boolean (default: false)`, `deletedAt: Date`
- Auto-numbers via `counters` collection with atomic `$inc`

---

## 5.2 Collections

| # | Collection | Description |
|---|---|---|
| 1 | `counters` | Auto-number sequences |
| 2 | `users` | System users |
| 3 | `roles` | RBAC roles |
| 4 | `permissions` | Module-level permissions per role |
| 5 | `vessels` | Fleet master |
| 6 | `agents` | Agent master |
| 7 | `countries` | Location L1 |
| 8 | `cities` | Location L2 |
| 9 | `ports` | Location L3 |
| 10 | `terminals` | Location L4 |
| 11 | `containerTypes` | Container type master |
| 12 | `expenseTypes` | Expense type master |
| 13 | `services` | Service master |
| 14 | `routes` | Route per service |
| 15 | `routeLegs` | Ordered port legs per route |
| 16 | `rounds` | Operational rounds |
| 17 | `voyages` | Auto-generated voyage legs |
| 18 | `bookings` | Cargo bookings |
| 19 | `expenses` | Operational expenses |
| 20 | `invoices` | Invoice records |
| 21 | `trackingHistory` | Vessel position history (append-only) |
| 22 | `auditLogs` | System audit trail |

---

## 5.3 Schema Definitions

### counters
```
_id: String   // 'round' | 'booking' | 'invoice'
seq: Number   // current counter value
```

### users
```
name: String (required)
email: String (required, unique)
password: String (required, bcrypt hashed)
roleId: ObjectId → roles (required)
status: Enum['Active','Inactive'] (default: Active)
lastLogin: Date
isDeleted: Boolean | deletedAt: Date
Indexes: email(unique), roleId, status
```

### roles
```
name: String (required, unique)
description: String
isSystem: Boolean  // protects SuperAdmin from deletion
isDeleted: Boolean
Indexes: name(unique)
```

### permissions
```
roleId: ObjectId → roles (required)
module: String (required)  // 'vessels','bookings', etc.
actions: {
  create: Boolean, read: Boolean, update: Boolean,
  delete: Boolean, view: Boolean, hidden: Boolean
}
Indexes: roleId+module (compound unique)
```

### vessels
```
vesselCode: String (required, unique)
vesselName: String (required)
imoNumber: String (unique, sparse)
flag, callSign, ownerName: String
ownershipType: Enum['Owned','Chartered','Leased'] (required)
charterStartDate, charterEndDate: Date
teuCapacity, dwt, builtYear: Number
status: Enum['Active','Inactive','Under Maintenance','Sold']
notes: String
isDeleted: Boolean | deletedAt: Date
Indexes: vesselCode(unique), imoNumber(unique sparse), status
```

### agents
```
agentCode: String (required, unique)
agentName: String (required)
country, city, port, address, contactPerson, mobile, email: String
status: Enum['Active','Inactive']
isDeleted: Boolean | deletedAt: Date
Indexes: agentCode(unique), status
```

### countries
```
name: String (required, unique)
code: String (required, unique)  // ISO 2-letter
isDeleted: Boolean
```

### cities
```
name: String (required)
countryId: ObjectId → countries (required)
isDeleted: Boolean
Indexes: name+countryId (compound unique), countryId
```

### ports
```
name: String (required)
code: String  // UNLOCODE
cityId: ObjectId → cities (required)
countryId: ObjectId → countries (required)
isDeleted: Boolean
Indexes: name+cityId (compound unique), cityId, countryId
```

### terminals
```
name: String (required)
portId: ObjectId → ports (required)
isDeleted: Boolean
Indexes: name+portId (compound unique), portId
```

### containerTypes
```
code: String (required, unique)
description: String
size: Enum['20ft','40ft','40HC','45ft'] (required)
type: Enum['Dry','Reefer','Open Top','Flat Rack','Tank'] (required)
isDeleted: Boolean
```

### expenseTypes
```
name: String (required, unique)
category: Enum['Port Expense','Operating Expense','Other'] (required)
isDeleted: Boolean
```

### services
```
serviceCode: String (required, unique)
serviceName: String (required)
defaultVesselId: ObjectId → vessels (optional)
description: String
status: Enum['Active','Inactive']
isDeleted: Boolean | deletedAt: Date
Indexes: serviceCode(unique), status
```

### routes
```
serviceId: ObjectId → services (required, unique)
name: String
isDeleted: Boolean
Indexes: serviceId(unique)
```

### routeLegs
```
routeId: ObjectId → routes (required)
sequence: Number (required)
countryId: ObjectId → countries (required)
cityId: ObjectId → cities (required)
portId: ObjectId → ports (required)
terminalId: ObjectId → terminals (optional)
Indexes: routeId+sequence (compound unique), routeId, portId
```

### rounds
```
roundNumber: String (required, unique)   // R000001
serviceId: ObjectId → services (required)
vesselId: ObjectId → vessels (required)
startDate: Date (required)
endDate: Date (required)
status: Enum['Planned','Active','Completed','Cancelled']
notes: String
voyageIds: [ObjectId] → voyages  // convenience reference
isDeleted: Boolean | deletedAt: Date
Indexes: roundNumber(unique), serviceId, vesselId, status, startDate
```

### voyages
```
voyageNumber: String (required, unique)  // SEN-R000001-01
roundId: ObjectId → rounds (required)
serviceId: ObjectId → services (required)
polId: ObjectId → ports (required)
podId: ObjectId → ports (required)
sequence: Number (required)
etd, eta, atd, ata: Date
status: Enum['Scheduled','Departed','In Transit','Arrived','Completed','Cancelled']
Indexes: voyageNumber(unique), roundId, polId, podId, status, etd
```

### bookings
```
bookingNumber: String (required, unique)  // BK-000001
voyageId: ObjectId → voyages (required)
agentId: ObjectId → agents (required)
shipper: String (required)
consignee: String (required)
polId: ObjectId → ports (required)
podId: ObjectId → ports (required)
containerTypeId: ObjectId → containerTypes (required)
quantity: Number (required, min:1)
slotCount: Number (required, min:1)
freightRate: Number (required, min:0)
totalFreight: Number  // AUTO = quantity * freightRate
commodity, remarks: String
status: Enum['Pending','Confirmed','Cancelled']
isDeleted: Boolean | deletedAt: Date
Indexes: bookingNumber(unique), voyageId, agentId, status, createdAt
```

### expenses
```
roundId: ObjectId → rounds    // ONE of these two is required
voyageId: ObjectId → voyages
expenseTypeId: ObjectId → expenseTypes (required)
agentId: ObjectId → agents (optional)
port: String
amount: Number (required, min:0)
currency: String (required)
expenseDate: Date (required)
description: String
attachmentUrl, attachmentOriginalName: String
Indexes: roundId, voyageId, expenseTypeId, expenseDate
```

### invoices
```
invoiceNumber: String (required, unique)  // INV-000001
bookingId: ObjectId → bookings (required)
agentId: ObjectId → agents (required)
invoiceDate: Date (required)
dueDate: Date (required, >= invoiceDate)
amount: Number (required)
currency: String (required)
status: Enum['Draft','Issued','Paid','Overdue','Cancelled']
notes: String
isDeleted: Boolean | deletedAt: Date
Indexes: invoiceNumber(unique), bookingId, agentId, status, invoiceDate
```

### trackingHistory (APPEND-ONLY)
```
voyageId: ObjectId → voyages (required)
roundId: ObjectId → rounds (required)
vesselId: ObjectId → vessels (required)
serviceId: ObjectId → services (required)
countryId: ObjectId → countries
cityId: ObjectId → cities
portId: ObjectId → ports (required)
terminalId: ObjectId → terminals (optional)
status: Enum['At Port','Departed','In Transit','Arrived','Anchored','Delayed']
remarks: String
lastUpdate: Date (required)
createdBy: ObjectId → users
// NO updatedBy, NO isDeleted — immutable records
Indexes: voyageId, roundId, vesselId, lastUpdate
```

### auditLogs
```
userId: ObjectId → users (required)
userEmail: String (denormalized for speed)
action: Enum['CREATE','UPDATE','DELETE','LOGIN','LOGOUT']
module: String (required)
recordId: ObjectId
recordNumber: String  // e.g. BK-000001
oldValues: Mixed
newValues: Mixed
ipAddress: String
userAgent: String
timestamp: Date (default: Date.now)
Indexes: userId, module, recordId, timestamp, action
```

---

## 5.4 Auto-Number Strategy

```javascript
const counter = await Counter.findOneAndUpdate(
  { _id: 'booking' },
  { $inc: { seq: 1 } },
  { new: true, upsert: true }
);
const bookingNumber = `BK-${String(counter.seq).padStart(6, '0')}`;
```

| Counter Key | Format | Example |
|---|---|---|
| `round` | R + 6 digits | R000001 |
| `booking` | BK- + 6 digits | BK-000001 |
| `invoice` | INV- + 6 digits | INV-000001 |
| voyage | ServiceCode-RoundNo-Seq | SEN-R000001-01 |

---

## 5.5 Deletion / Cascade Rules

| Entity | Rule |
|---|---|
| Country | Block if cities exist |
| City | Block if ports exist |
| Port | Block if terminals or routeLegs reference it |
| Service | Block if rounds exist; soft delete |
| Round | Block if bookings exist via voyages; soft delete |
| Voyage | No manual delete — system-managed |
| Booking | Block if invoice exists; soft delete |
| Invoice | Block if Paid; soft delete |
| Expense | Hard delete with confirmation |
| Vessel / Agent | Soft delete; block if in active operations |
