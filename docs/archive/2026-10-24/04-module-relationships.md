# 04 — Module Relationships
# Logistics & Shipping SaaS — MERN Stack MVP

---

> **STATUS NOTE (current through Sprint 046):** original MVP-era module
> map. Since then, Booking became two parallel modules (ManualBooking/
> Layer 1 + Booking/Layer 2) both feeding one shared Capacity Engine —
> Layer 2 Booking now also carries a post-Final-Loading Discharge outcome
> that the Capacity Engine reads back (Sprint 045); Invoice gained a
> Payment module (one-to-many, explicit allocations) and a per-role
> manual-override permission (Sprint 046); Agent gained a Financial
> Account view composed from Round→Voyage→Booking; Expense gained a Port
> relationship (via Voyage's own POL/POD). See claude.md Sections 4-6 for
> the current module structure.

---

## 4.1 Entity Relationship Overview

```
Users ──────────────────────────────────────────────────────────────────────────┐
  │ belongs to                                                                   │ createdBy/updatedBy
  ▼                                                                              │ (on every document)
Roles ◄──────── Permissions                                                     │
                                                                                 ▼
Countries                                                               All Entities
  │ 1:M
  ▼
Cities
  │ 1:M
  ▼
Ports
  │ 1:M
  ▼
Terminals

Vessels ◄───────────────── Services ─────────────────► Routes ──────► RoutLegs
                                │                                         │
                                │ 1:M                                     │ references
                                ▼                                         │ Port/Terminal
                              Rounds ◄───────────────────────────────────┘
                                │ 1:M (auto-generates)
                                ▼
                             Voyages ◄──────────────────── TrackingHistory
                                │ 1:M
                                ▼
                            Bookings ──────────────────────► Invoices
                                │ M:1
                                ▼
                             Agents

Expenses ──────────► Round (OR) Voyage
        ──────────► ExpenseType
        ──────────► Agent
```

---

## 4.2 Detailed Relationship Table

| From | To | Type | Reference Field | Notes |
|---|---|---|---|---|
| User | Role | Many-to-One | `user.roleId` | One user has one role |
| Role | Permission | One-to-Many | `permission.roleId` | One role has many permissions |
| Service | Vessel | Many-to-One | `service.defaultVesselId` | Optional default |
| Service | Route | One-to-One | `route.serviceId` | One service, one route |
| Route | RouteLeg | One-to-Many | `routeLeg.routeId` | Many legs per route |
| RouteLeg | Country | Many-to-One | `routeLeg.countryId` | Location hierarchy |
| RouteLeg | City | Many-to-One | `routeLeg.cityId` | Location hierarchy |
| RouteLeg | Port | Many-to-One | `routeLeg.portId` | Required |
| RouteLeg | Terminal | Many-to-One | `routeLeg.terminalId` | Optional |
| Round | Service | Many-to-One | `round.serviceId` | Required |
| Round | Vessel | Many-to-One | `round.vesselId` | Assigned vessel |
| Round | Voyage | One-to-Many | `voyage.roundId` | Auto-generated |
| Voyage | Round | Many-to-One | `voyage.roundId` | Parent round |
| Voyage | Port (POL) | Many-to-One | `voyage.polId` | Port of loading |
| Voyage | Port (POD) | Many-to-One | `voyage.podId` | Port of discharge |
| Booking | Voyage | Many-to-One | `booking.voyageId` | Required |
| Booking | Agent | Many-to-One | `booking.agentId` | Required |
| Booking | ContainerType | Many-to-One | `booking.containerTypeId` | Required |
| Booking | Port (POL) | Many-to-One | `booking.polId` | From voyage route |
| Booking | Port (POD) | Many-to-One | `booking.podId` | From voyage route |
| Expense | Round | Many-to-One | `expense.roundId` | Nullable |
| Expense | Voyage | Many-to-One | `expense.voyageId` | Nullable |
| Expense | ExpenseType | Many-to-One | `expense.expenseTypeId` | Required |
| Expense | Agent | Many-to-One | `expense.agentId` | Optional |
| Invoice | Booking | Many-to-One | `invoice.bookingId` | Required |
| Invoice | Agent | Many-to-One | `invoice.agentId` | Required |
| TrackingHistory | Voyage | Many-to-One | `trackingHistory.voyageId` | Required |
| TrackingHistory | Round | Many-to-One | `trackingHistory.roundId` | Required |
| TrackingHistory | Vessel | Many-to-One | `trackingHistory.vesselId` | Required |
| TrackingHistory | Port | Many-to-One | `trackingHistory.portId` | Required |
| AuditLog | User | Many-to-One | `auditLog.userId` | Who performed the action |
| All entities | User | Many-to-One | `createdBy`, `updatedBy` | Standard on all documents |

---

## 4.3 One-to-One Relationships

| Relationship | Description |
|---|---|
| Service → Route | Each service has exactly one route definition |

---

## 4.4 One-to-Many Relationships

| Parent | Child | Description |
|---|---|---|
| Role | Permission | One role, many permission records |
| Country | City | One country contains many cities |
| City | Port | One city contains many ports |
| Port | Terminal | One port contains many terminals |
| Service | Round | One service can have many rounds over time |
| Route | RouteLeg | One route has many ordered legs |
| Round | Voyage | One round generates many voyages |
| Voyage | Booking | One voyage can have many bookings |
| Voyage | TrackingHistory | One voyage has a history of tracking updates |
| Booking | Invoice | One booking can have multiple invoices (rare, but allowed) |

---

## 4.5 Many-to-One Relationships

| Child | Parent | Description |
|---|---|---|
| Service | Vessel | Default vessel reference |
| Round | Service | Round belongs to a service |
| Round | Vessel | A specific vessel assigned |
| Voyage | Round | Auto-generated child of round |
| Booking | Voyage | Cargo booking for a voyage |
| Booking | Agent | Agent responsible for booking |
| Expense | ExpenseType | Category of expense |
| Expense | Agent | Agent involved in expense |
| Invoice | Agent | Invoice recipient |

---

## 4.6 Reference Directions

All references are stored as `ObjectId` on the **child** document pointing to the **parent**.

Example: A Booking stores `voyageId: ObjectId`, not the other way around.

Exception: Round stores an array `voyageIds: [ObjectId]` as a convenience reference.

---

## 4.7 Cascade / Deletion Strategy

| Action | Cascade Rule |
|---|---|
| Delete Country | Block if Cities reference it |
| Delete City | Block if Ports reference it |
| Delete Port | Block if Terminals or Route Legs reference it |
| Delete Terminal | Block if Route Legs reference it |
| Delete Service | Block if Rounds reference it; soft delete only |
| Delete Route | Not allowed; deactivate only |
| Delete Round | Block if Bookings exist via Voyages; soft delete |
| Delete Voyage | Not allowed manually; system-managed |
| Delete Vessel | Block if in Active Round; soft delete |
| Delete Agent | Block if in active Bookings or Invoices; soft delete |
| Delete Booking | Block if Invoice exists; soft delete |
| Delete Expense | Hard delete with confirmation |
| Delete Invoice | Block if Paid; soft delete |

---

## 4.8 Dependency Diagram

```
User/Role/Permission (Auth Layer — independent)
         │
         ▼
Location Masters (Country, City, Port, Terminal) — no dependencies
Vessel Master — no dependencies
Agent Master — no dependencies
ContainerType — no dependencies
ExpenseType — no dependencies
         │
         ▼
Service (depends on: Vessel)
         │
         ▼
Route + RouteLegs (depends on: Service, Location)
         │
         ▼
Round (depends on: Service, Vessel, Route)
         │
         ▼
Voyage (depends on: Round, Route Legs, Port)
         │
         ├──────────────────────────────────────────┐
         ▼                                          ▼
Booking (depends on: Voyage, Agent,        TrackingHistory
         ContainerType, Port)              (depends on: Voyage,
         │                                 Vessel, Round, Port)
         ├──────────┐
         ▼          ▼
Expense          Invoice
(Round OR       (depends on:
 Voyage)         Booking, Agent)
```
