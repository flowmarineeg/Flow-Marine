# 01 — Project Overview
# Logistics & Shipping SaaS — MERN Stack MVP

---

> **STATUS NOTE (current through Sprint 046):** this document describes the
> original MVP scope (Sprints 001-013). The system has since grown through
> Sprint 046 — dual-layer bookings (Layer 1 Manual + Layer 2 Operational,
> now including a post-Final-Loading Discharge outcome) with a TEU capacity
> engine, multi-booking invoices with explicit payment allocation AND an
> admin manual status override, 9 reports, and a rebuilt widget-based
> Dashboard are all now part of the system this overview predates. See
> claude.md for the current system identity/summary and sprints/STATUS.md
> for the full sprint list.

---

## 1.1 System Description

This system is a **Logistics & Shipping Operations Platform** built as a SaaS MVP for shipping companies.

It enables shipping operators to manage their entire operational flow — from defining services and routes, to generating voyage schedules, taking bookings, tracking expenses, raising invoices, and tracking vessel positions — all within a single system.

---

## 1.2 System Purpose

| Purpose | Description |
|---|---|
| Operations Management | Manage rounds, voyages, and vessel assignments |
| Booking Management | Handle cargo bookings per voyage |
| Financial Tracking | Track expenses and invoices per voyage/round |
| Vessel Tracking | Manual position updates with full history |
| Reporting | P&L, booking, revenue, and expense reports |
| Data Export | Excel and ZIP exports for all modules |

---

## 1.3 Technology Stack

### Frontend
| Technology | Role |
|---|---|
| Next.js (App Router) | UI Framework |
| TailwindCSS | Styling |
| React Query | Server state management |
| React Hook Form | Form state management |
| Axios | HTTP client |

### Backend
| Technology | Role |
|---|---|
| Node.js | Runtime |
| Express | Web framework |
| MongoDB | Database |
| Mongoose | ODM |
| JWT | Authentication |
| Multer | File upload handling |
| ExcelJS | Excel file generation |
| Archiver | ZIP file generation |

---

## 1.4 Architecture Type

**Simple Modular MERN**

- One codebase, two apps (frontend, backend)
- Modular folder structure: one folder per business module
- Simple REST API, no event-driven or microservice complexity
- No Redis, no message queues, no external caches

---

## 1.5 Users of the System

| User Type | Description |
|---|---|
| Super Admin | Full system access, manages users and roles |
| Operations Manager | Manages rounds, voyages, bookings |
| Finance Officer | Manages expenses, invoices, reports |
| Tracking Officer | Updates vessel tracking |
| Read-Only User | Views data only, no modifications |

All access is controlled by RBAC (Role-Based Access Control).

---

## 1.6 Key Business Entities

| Entity | Description |
|---|---|
| Vessel | The ship that operates a service |
| Agent | Port agent or shipping agent involved in operations |
| Location | Hierarchical: Country → City → Port → Terminal |
| Container Type | Type and size of container |
| Expense Type | Category of expense (port, operating, other) |
| Service | Named shipping service (e.g., Red Sea Express) |
| Route | Sequence of port legs for a service |
| Round | A scheduled run of a service with a vessel and dates |
| Voyage | Auto-generated leg of a round (port-to-port) |
| Booking | Cargo booking on a specific voyage |
| Expense | Cost incurred during a round or voyage |
| Invoice | Payment document raised against a booking/agent |
| Tracking | Manual vessel position update with history |

---

## 1.7 MVP Deliverables

At the end of the MVP, the system will deliver:

1. Working web application accessible via browser
2. Full RBAC with user and role management
3. Complete master data management
4. Full operational flow from Round → Booking
5. Expense and Invoice management
6. Manual vessel tracking with history
7. 5 report types
8. Excel and ZIP export for all modules
9. Audit log for all actions
10. Responsive UI with consistent design

---

## 1.8 Non-Goals (Not in MVP)

- No customer-facing portal
- No real-time GPS/AIS tracking integration
- No accounting or GL integration
- No email/SMS notifications
- No document generation (Bill of Lading, Manifest)
- No multi-language support
- No mobile app
- No payment gateway
