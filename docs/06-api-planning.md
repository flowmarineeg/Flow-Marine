# 06 — API Planning
# Logistics & Shipping SaaS — MERN Stack MVP

---

> **STATUS NOTE (current through Sprint 046):** original MVP-era API plan.
> No route documented here was ever removed, but many gained new optional
> query params/body fields since (booking/expense/report endpoints
> especially) and several genuinely new endpoints were added (Agent
> Financial Account, Payments, Booking Revenue Details, Dashboard
> port-activity/missing-final-loading, Booking Import template/template-
> columns, Booking Discharge import). See claude.md Section 12 (API
> Quick Reference) for the current, fully-annotated endpoint list — this
> file is not kept in sync route-by-route.

---

## 6.1 API Conventions

- Base URL: `/api/v1/`
- All requests require `Authorization: Bearer <token>` except `/auth/login`
- All responses follow this shape:
```json
{ "success": true, "data": {}, "message": "OK", "pagination": {} }
{ "success": false, "message": "Error", "errors": [] }
```
- Pagination params: `?page=1&limit=20&search=&status=&sortBy=createdAt&sortOrder=desc`
- File uploads: `multipart/form-data`
- Dates: ISO 8601 strings

---

## 6.2 Auth Routes

| Method | Route | Description |
|---|---|---|
| POST | `/api/v1/auth/login` | Login, returns JWT |
| POST | `/api/v1/auth/logout` | Logout (audit log) |
| GET | `/api/v1/auth/me` | Current user profile |
| PATCH | `/api/v1/auth/change-password` | Change own password |

---

## 6.3 User Management

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/users` | List users (paginated) |
| GET | `/api/v1/users/:id` | Get user |
| POST | `/api/v1/users` | Create user |
| PUT | `/api/v1/users/:id` | Update user |
| DELETE | `/api/v1/users/:id` | Soft delete user |

---

## 6.4 Roles & Permissions

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/roles` | List roles |
| POST | `/api/v1/roles` | Create role |
| PUT | `/api/v1/roles/:id` | Update role |
| DELETE | `/api/v1/roles/:id` | Delete role (non-system only) |
| GET | `/api/v1/permissions/:roleId` | Get all permissions for role |
| PUT | `/api/v1/permissions/:roleId` | Save all permissions for role (bulk) |

---

## 6.5 Vessel Master

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/vessels` | List vessels |
| GET | `/api/v1/vessels/:id` | Get vessel |
| POST | `/api/v1/vessels` | Create vessel |
| PUT | `/api/v1/vessels/:id` | Update vessel |
| DELETE | `/api/v1/vessels/:id` | Soft delete |

---

## 6.6 Agent Master

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/agents` | List agents |
| GET | `/api/v1/agents/:id` | Get agent |
| POST | `/api/v1/agents` | Create agent |
| PUT | `/api/v1/agents/:id` | Update agent |
| DELETE | `/api/v1/agents/:id` | Soft delete |

---

## 6.7 Location Master

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/locations/countries` | List countries |
| POST | `/api/v1/locations/countries` | Create country |
| PUT | `/api/v1/locations/countries/:id` | Update country |
| DELETE | `/api/v1/locations/countries/:id` | Delete country |
| GET | `/api/v1/locations/cities?countryId=` | List cities by country |
| POST | `/api/v1/locations/cities` | Create city |
| PUT | `/api/v1/locations/cities/:id` | Update city |
| DELETE | `/api/v1/locations/cities/:id` | Delete city |
| GET | `/api/v1/locations/ports?cityId=` | List ports by city |
| POST | `/api/v1/locations/ports` | Create port |
| PUT | `/api/v1/locations/ports/:id` | Update port |
| DELETE | `/api/v1/locations/ports/:id` | Delete port |
| GET | `/api/v1/locations/terminals?portId=` | List terminals by port |
| POST | `/api/v1/locations/terminals` | Create terminal |
| PUT | `/api/v1/locations/terminals/:id` | Update terminal |
| DELETE | `/api/v1/locations/terminals/:id` | Delete terminal |

---

## 6.8 Container Types & Expense Types

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/container-types` | List |
| POST | `/api/v1/container-types` | Create |
| PUT | `/api/v1/container-types/:id` | Update |
| DELETE | `/api/v1/container-types/:id` | Soft delete |
| GET | `/api/v1/expense-types` | List |
| POST | `/api/v1/expense-types` | Create |
| PUT | `/api/v1/expense-types/:id` | Update |
| DELETE | `/api/v1/expense-types/:id` | Soft delete |

---

## 6.9 Services & Routes

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/services` | List services |
| GET | `/api/v1/services/:id` | Get service |
| POST | `/api/v1/services` | Create service |
| PUT | `/api/v1/services/:id` | Update service |
| DELETE | `/api/v1/services/:id` | Soft delete |
| GET | `/api/v1/services/:id/route` | Get route with legs |
| POST | `/api/v1/services/:id/route` | Create/replace route legs |
| PUT | `/api/v1/services/:id/route` | Update route legs |

---

## 6.10 Rounds

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/rounds` | List rounds |
| GET | `/api/v1/rounds/:id` | Get round with voyages |
| POST | `/api/v1/rounds` | Create round + auto-generate voyages |
| PUT | `/api/v1/rounds/:id` | Update round |
| DELETE | `/api/v1/rounds/:id` | Soft delete |
| GET | `/api/v1/rounds/:id/voyages` | List voyages for round |

---

## 6.11 Voyages

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/voyages` | List voyages |
| GET | `/api/v1/voyages/:id` | Get voyage |
| PUT | `/api/v1/voyages/:id` | Update voyage (ETD/ETA/ATD/ATA/Status) |

No POST or DELETE — voyages are system-managed.

---

## 6.12 Bookings

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/bookings` | List bookings |
| GET | `/api/v1/bookings/:id` | Get booking |
| POST | `/api/v1/bookings` | Create booking |
| PUT | `/api/v1/bookings/:id` | Update booking |
| DELETE | `/api/v1/bookings/:id` | Soft delete |

---

## 6.13 Expenses

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/expenses` | List expenses |
| GET | `/api/v1/expenses/:id` | Get expense |
| POST | `/api/v1/expenses` | Create expense (multipart for attachment) |
| PUT | `/api/v1/expenses/:id` | Update expense |
| DELETE | `/api/v1/expenses/:id` | Hard delete |

---

## 6.14 Invoices

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/invoices` | List invoices |
| GET | `/api/v1/invoices/:id` | Get invoice |
| POST | `/api/v1/invoices` | Create invoice |
| PUT | `/api/v1/invoices/:id` | Update invoice |
| DELETE | `/api/v1/invoices/:id` | Soft delete |

---

## 6.15 Tracking

| Method | Route | Description |
|---|---|---|
| POST | `/api/v1/tracking` | Add tracking update (appends to history) |
| GET | `/api/v1/tracking/:voyageId/history` | Get full tracking history for voyage |

---

## 6.16 Reports

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/reports/round-pnl?roundId=` | Round Profit & Loss |
| GET | `/api/v1/reports/voyage-performance?voyageId=` | Voyage performance |
| GET | `/api/v1/reports/bookings?...` | Booking report |
| GET | `/api/v1/reports/revenue?...` | Revenue report |
| GET | `/api/v1/reports/expenses?...` | Expense report |

---

## 6.17 Export

| Method | Route | Description |
|---|---|---|
| POST | `/api/v1/export/excel` | Export single module to Excel |
| POST | `/api/v1/export/zip` | Export multiple modules as ZIP |

Request body for excel: `{ module, filters, selectedIds }`
Request body for zip: `{ exports: [{ module, filters, selectedIds }] }`

---

## 6.18 Audit Logs

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/audit-logs` | List audit logs (paginated, filterable) |
| GET | `/api/v1/audit-logs/:id` | Get single audit log entry |

No POST/PUT/DELETE — audit logs are immutable.
