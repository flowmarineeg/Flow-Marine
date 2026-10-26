# 02 — System Workflow
# Logistics & Shipping SaaS — MERN Stack MVP

---

> **STATUS NOTE (current through Sprint 046):** the diagrams below show the
> original MVP-era workflow. Since then: Bookings split into Layer 1
> (ManualBooking, commercial) + Layer 2 (Booking, operational,
> containerNumber-keyed, now also carrying a post-Final-Loading
> Discharged/Remaining outcome); the "REPORTS" box grew from 5 reports to 9
> (added Booking Revenue Details, Voyage Profitability/Round P&L evolved
> in place, Round Capacity Report); Invoices became multi-booking with
> explicit Payment allocation and an admin manual status override; Export
> grew from 12 to 13 modules. See system-flow.txt F-31 to F-43 for the
> current flows and claude.md for the full picture — this file's diagrams
> are kept as the original MVP reference, not updated line-by-line.

---

## 2.1 Main Business Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      MASTER DATA                            │
│  Vessel | Agent | Location | ContainerType | ExpenseType    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        SERVICE                              │
│          Service Code | Name | Default Vessel               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                         ROUTE                               │
│         Sequence of Port Legs (inside Service)              │
│         Each Leg: Country → City → Port → Terminal          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                         ROUND                               │
│     Service | Vessel | Start Date | End Date | Status       │
│            Round Number: R000001 (Auto)                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼ (AUTO-GENERATED ON ROUND SAVE)
┌─────────────────────────────────────────────────────────────┐
│                        VOYAGES                              │
│  SEN-R000001-01: Jeddah → Aqaba                            │
│  SEN-R000001-02: Aqaba → Sokhna                            │
│  SEN-R000001-03: Sokhna → Jeddah                           │
│  (One voyage per consecutive route leg pair)                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        BOOKINGS                             │
│  Voyage | Agent | Shipper | Consignee | Container | Freight │
│  Total Freight = Quantity × Freight Rate (Auto)             │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────┐   ┌─────────────────────────────────┐
│      EXPENSES       │   │           INVOICES               │
│  Round or Voyage    │   │  Linked to Booking / Agent       │
│  Type | Amount      │   │  Invoice Number | Due Date       │
│  Attachment         │   │  Amount | Currency | Status      │
└─────────────────────┘   └─────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────┐
│                   VESSEL TRACKING                           │
│   Manual Update: Position | Port | Status                   │
│   Every update saved to Tracking History                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       REPORTS                               │
│  Round P&L | Voyage Performance | Booking | Revenue |       │
│  Expense Report                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                        EXPORT                               │
│   Excel per table | Filtered Export | Selected Rows Export  │
│   Multiple exports as ZIP                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2.2 Master Data Workflow

Masters must be created in the following order because each depends on the previous:

1. **Locations** — Country, City, Port, Terminal (hierarchical)
2. **Vessels** — Ships available in the fleet
3. **Agents** — Port agents and shipping agents
4. **Container Types** — Types and sizes of containers
5. **Expense Types** — Categories of expenses
6. **Services** — Named shipping services (requires Vessels)
7. **Routes** — Created inside the Service wizard (requires Locations)

---

## 2.3 Round Creation Workflow

```
User opens Round form
  ↓
User selects Service
  → System auto-fills Default Vessel
  → System loads Route details
  ↓
User sets Start Date and End Date
  ↓
User sets Status (Planned / Active / Completed / Cancelled)
  ↓
User saves Round
  ↓
System generates Round Number (R000001, R000002, ...)
  ↓
System reads Route Legs for selected Service
  ↓
System creates Voyages:
  For each consecutive pair of legs (leg[0]→leg[1], leg[1]→leg[2], ...):
    → Create Voyage with:
      VoyageNumber = ServiceCode + "-" + RoundNumber + "-" + SequenceNumber
      POL = leg[n].port
      POD = leg[n+1].port
      Status = Scheduled
  ↓
Round saved with list of generated Voyage IDs
```

---

## 2.4 Voyage Lifecycle

```
Scheduled → Departed → In Transit → Arrived → Completed
                                             ↓
                                         Cancelled
```

Voyage status is manually updated. ETD/ETA are planned. ATD/ATA are actuals.

---

## 2.5 Booking Workflow

```
User selects Voyage
  ↓
User selects Agent, Shipper, Consignee
  ↓
User selects POL and POD (from voyage port list)
  ↓
User selects Container Type and Quantity
  ↓
User enters Freight Rate
  ↓
System auto-calculates Total Freight = Quantity × Freight Rate
  ↓
User selects Slot Count, Commodity, Remarks
  ↓
System generates Booking Number (auto)
  ↓
Booking saved with Status: Confirmed / Pending / Cancelled
```

---

## 2.6 Expense Workflow

```
User creates expense
  ↓
User selects: Round OR Voyage (one must be selected)
  ↓
User selects Expense Type
  ↓
User selects Agent
  ↓
User enters Port, Amount, Currency, Date, Description
  ↓
User optionally uploads attachment (PDF or image)
  ↓
Expense saved and linked to the Round or Voyage
```

---

## 2.7 Vessel Tracking Workflow

```
Tracking Officer opens Vessel Tracking form
  ↓
Selects: Service → Vessel → Round → Voyage
  ↓
Enters: Country → City → Port → Terminal
  ↓
Enters: Status, Remarks, Last Update (datetime)
  ↓
System saves the tracking update
  ↓
System appends entry to TrackingHistory for that Voyage
  ↓
History is always viewable (never deleted)
```

---

## 2.8 Report Workflow

| Report | Filter By | Output |
|---|---|---|
| Round P&L | Round, Date Range | Revenue vs Expenses per Round |
| Voyage Performance | Voyage, Service, Date Range | Booking count, Freight, Slots |
| Booking Report | Voyage, Agent, Status, Date Range | Booking list with totals |
| Revenue Report | Date Range, Service | Revenue aggregated |
| Expense Report | Date Range, Category, Round/Voyage | Expense breakdown |

---

## 2.9 Export Workflow

```
User views any table
  ↓
User can:
  A. Export All (current filter applied)
  B. Export Selected Rows (checkboxes)
  ↓
System generates Excel file via ExcelJS
  ↓
For multiple exports:
  User selects modules to export
  System generates all Excel files
  System packages into ZIP via Archiver
  User downloads ZIP
```
