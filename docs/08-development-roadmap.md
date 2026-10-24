# 08 — Development Roadmap
# Logistics & Shipping SaaS — MERN Stack MVP

---

> **STATUS NOTE (current through Sprint 046):** Sections 8.1-8.11 below
> describe the ORIGINAL 13-sprint MVP roadmap (Sprints 001-013) exactly as
> planned, and it shipped as described. The project did not stop there —
> 33 further sprints (014-046, of which 041 is still planning-only) extended
> it well past MVP scope. See Section 8.12 below for a condensed index of
> that later work, and claude.md (Section 3 sprint table) / sprints/STATUS.md
> for full detail. Two MVP-era
> assumptions visible below are no longer true and are called out inline
> where they appear: `totalFreight = quantity × freightRate` (Section 8.7 —
> `quantity` was removed from Booking in Sprint 025/026, replaced by "one
> booking = one container"; `totalFreight` is still server-computed, just
> not via a quantity multiplication on Layer 2 anymore) and "All 5 reports"
> (Section 8.10 — grew to 9 reports by Sprint 034/035).

## 8.1 Phase Overview

| Phase | Name | Sprints | Outcome |
|---|---|---|---|
| 1 | Foundation & Auth | 001, 002 | Working skeleton + login + RBAC |
| 2 | Simple Master Data | 003, 004 | Vessels, Agents, ContainerTypes, ExpenseTypes |
| 3 | Location Master | 005 | Country → City → Port → Terminal |
| 4 | Service & Route | 006 | Services + Route Leg Editor |
| 5 | Round & Voyage Engine | 007 | Rounds + Auto-Voyage Generation |
| 6 | Bookings | 008 | Bookings with auto-calc freight |
| 7 | Expenses & Invoices | 009 | Expenses (with upload) + Invoices |
| 8 | Tracking & Audit Log | 010 | Vessel tracking history + Audit viewer |
| 9 | Reports & Export | 011, 012 | All 5 reports + Excel/ZIP export |
| 10 | QA & Stabilization | 013 | Polish, testing, handover |

---

## 8.2 Phase 1 — Foundation & Auth (Sprints 001–002)

**Goal:** Deployable skeleton. Login works. JWT protected routes. RBAC middleware active.

Backend deliverables:
- Express app with modular router registration
- MongoDB connection + env config + constants
- JWT auth middleware
- RBAC permission middleware (reads permissions collection)
- Global error handler
- Audit log model + middleware (auto-fires on POST/PUT/PATCH/DELETE)
- User model + Role model + Permission model
- Auth routes: login, logout, /me, change-password
- User CRUD routes
- Role CRUD routes
- Permission bulk-save route per role
- SuperAdmin seed script

Frontend deliverables:
- Next.js App Router scaffold
- Axios instance with JWT interceptor (attach token, handle 401)
- AuthContext + useAuth hook
- PermissionContext + usePermission hook
- Login page (React Hook Form + validation)
- Protected layout (Sidebar, Header, Breadcrumbs)
- Dashboard shell (placeholder cards)
- Users list + form pages
- Roles list + Permission matrix page

---

## 8.3 Phase 2 — Simple Master Data (Sprints 003–004)

**Goal:** All simple masters are fully functional with UI, validation, and export.

Modules: Vessels, Agents, Container Types, Expense Types

Per module deliverables:
- Mongoose model with all fields, enums, indexes
- Service layer with pagination, filter, soft delete
- Controller with standard CRUD
- Validation rules
- List page (table, search, status filter, pagination, export button)
- Form page (create + edit, validation, toast feedback)
- Soft delete with confirmation dialog
- Excel export for each table

---

## 8.4 Phase 3 — Location Master (Sprint 005)

**Goal:** Hierarchical location system fully operational with cascading dropdowns.

Deliverables:
- Country / City / Port / Terminal models, services, controllers, routes
- Single location management page with tabs per level
- Cascading filter: selecting Country filters Cities, selecting City filters Ports, etc.
- Reusable `<LocationSelect>` component for use across all other modules
- Block deletion if child records exist

---

## 8.5 Phase 4 — Service & Route (Sprint 006)

**Goal:** Services can be created with a full route leg editor.

Deliverables:
- Service model, service, controller, routes
- Service list + form pages
- Route model + RouteLeg model
- Route service: create, replace, retrieve legs ordered by sequence
- Route leg editor embedded inside Service detail page
- Minimum 2 legs validation
- Location dropdowns in each leg use `<LocationSelect>` component
- Manual sequence ordering (numbered inputs)

---

## 8.6 Phase 5 — Round & Voyage Engine (Sprint 007)

**Goal:** Creating a Round automatically generates all Voyages for the service route.

Deliverables:
- Round model, service, controller, routes
- Auto-number: R000001
- `voyageGenerator.js` utility:
  - Reads route legs for selected service
  - Creates one voyage per consecutive leg pair
  - Voyage number: ServiceCode-RoundNumber-Seq
- Round list + form pages
- Round detail page showing generated voyages
- Voyage model, service, controller, routes
- Voyage edit form (ETD, ETA, ATD, ATA, Status only — no create/delete in UI)
- Status transition validation
- Block voyage regeneration if bookings exist

---

## 8.7 Phase 6 — Bookings (Sprint 008)

**Goal:** Cargo bookings on voyages with automatic freight calculation.

Deliverables:
- Booking model, service, controller, routes
- Auto-number: BK-000001
- totalFreight = quantity × freightRate (computed in service layer, stored in DB)
- Booking list (filterable by voyage, agent, status)
- Booking form:
  - Voyage selector → auto-loads POL/POD options from route legs
  - Agent, Shipper, Consignee inputs
  - Container type + quantity + freight rate
  - Total freight display (read-only, auto-updated)
- Booking detail page
- Status transitions: Pending → Confirmed → Cancelled
- Block delete if invoice exists

---

## 8.8 Phase 7 — Expenses & Invoices (Sprint 009)

**Goal:** Expense tracking with file attachments and invoice management.

Deliverables:
- Expense model, service, controller, routes
- Multer setup: `/uploads/expenses/` destination, 10MB limit, PDF+image types only
- Expense list (filterable by round, voyage, type, date)
- Expense form: Round OR Voyage selector, type, agent, amount, currency, date, attachment upload
- Attachment download/preview link
- Invoice model, service, controller, routes
- Auto-number: INV-000001
- Invoice list (filterable by agent, booking, status)
- Invoice form: booking selector, agent auto-fill, date, due date, amount, currency
- Status transitions: Draft → Issued → Paid / Cancelled
- Block edit if Paid

---

## 8.9 Phase 8 — Tracking & Audit Log (Sprint 010)

**Goal:** Manual tracking updates with immutable history, plus audit log viewer.

Deliverables:
- TrackingHistory model (append-only)
- Tracking service: create entry only (no update/delete)
- Tracking form: Service → Vessel → Round → Voyage selectors, location selectors, status, remarks, datetime
- Tracking history table per voyage (most recent first)
- Audit Log list: paginated, filter by module / action / user / date range
- Audit Log detail: shows old vs new values diff, link to affected record
- Confirm all mutating routes (POST/PUT/PATCH/DELETE) are covered by audit middleware

---

## 8.10 Phase 9 — Reports & Export (Sprints 011–012)

**Goal:** All 5 reports and complete Excel/ZIP export capability.

Report deliverables:
- Round P&L: total revenue (bookings freight) vs total expenses per round
- Voyage Performance: bookings count, slot utilization, total freight per voyage
- Booking Report: filterable booking list with totals
- Revenue Report: freight revenue aggregated by service / date range
- Expense Report: expenses by category / round / voyage / date range

Export deliverables:
- Single module Excel export (filtered or selected rows) via ExcelJS
- Multi-module ZIP export via Archiver
- Export button on every list page
- Row checkbox selection on every list page
- Export Panel page for ZIP multi-export

---

## 8.11 Phase 10 — QA & Stabilization (Sprint 013)

**Goal:** Production-ready system, consistent and stable.

Checklist:
- All RBAC permissions verified per role (create/read/update/delete/view/hidden)
- All soft deletes confirmed working with cascade blocks
- All auto-numbers tested for uniqueness under concurrent requests
- All forms validated (frontend + backend)
- All empty states handled in UI
- All loading states shown
- All error states caught and displayed as toast
- Audit log coverage: verify every mutating endpoint is logged
- Export tested for large datasets
- Final environment setup documented in README

---

## 8.12 Phase 11+ — Post-MVP Sprints (014-041, condensed index)

**Not part of the original MVP scope above — added here so this roadmap
document doesn't stop looking current at Sprint 013.** Full detail for each
is in claude.md and the corresponding `sprints/0XX-sprint.txt`.

| Sprints | Theme | Outcome |
|---|---|---|
| 014-020 | Dashboard overhaul, booking import, tracking overhaul, RBAC audit, production hardening | httpOnly cookie auth, in-memory caching, Docker deployment, Sharp/PDFKit, security/perf pass |
| 021-032 | Booking Layer 1/2 split + Capacity Engine | ManualBooking (commercial) alongside Booking (operational, containerNumber primary key), voyage-anchored TEU capacity engine, Round-scoped Excel import |
| 033 | Invoice & Agent Financial System | Multi-booking invoices (header+lineItems[]), explicit Payment.allocations[], Agent Financial Account statement |
| 034 | Booking Reports Modernization | Dual-layer Booking Report, Booking Revenue Details (pricing-group revenue report) |
| 035-036 | Voyage Profitability + Expense Port Scope | Round P&L evolved into Voyage Profitability (Round+Voyage scope); Expense.portId (Round/Voyage/Port, inferred scope) |
| 037-038 | Reporting Consolidation | Audit (037, no code) + fixes (038): dead-field removal, unified Revenue rule, Expense Report Sprint 036 parity, VGM unit fix, Round Capacity Report rebuilt as per-voyage cards |
| 039 | Dashboard Rebuild | Widget/section architecture, Global Filter Bar, Quick Actions, revenue/utilisation drift fixes |
| 040 | Bulk Export Update | Schema-drift fixes, `manualBookings` export module, Export Info metadata sheet, working Date Range filter |
| 041 | RBAC/Perf/Bug Audit | **Planning approved, NOT yet implemented** — permission-endpoint scoping gap, 3 missing PageGuards, 2 uncached expensive reads, 1 redundant index, sequential ZIP export |

Current overall status: 36/41 sprints shipped, 1 audit-only, 1 planning-approved-not-yet-implemented. See claude.md "Known open gaps" (top of file) before starting any new work.
