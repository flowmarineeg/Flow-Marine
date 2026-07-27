# Logistics & Shipping SaaS

A full-stack MERN logistics operations platform for managing vessels, routes, voyages, bookings, expenses, invoices, and vessel tracking.

---

## Prerequisites

- Node.js >= 18.x
- MongoDB (local or Atlas)
- npm >= 9.x

---

## Project Structure

```
logistics/
  backend/     → Express + MongoDB API
  frontend/    → Next.js UI
  docs/        → Planning documents
  sprints/     → Sprint task files
  claude.md    → AI instruction file
```

---

## Setup — Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in your values in .env:
#   MONGODB_URI=your_mongo_connection_string
#   JWT_SECRET=your_secret_min_32_chars
#   SMTP_EMAIL=your_gmail@gmail.com
#   SMTP_APP_PASSWORD=your_16char_app_password
#   ADMIN_EMAIL=admin@yourcompany.com
#   ADMIN_PASSWORD=YourStrongPassword
npm run dev
```

Backend runs on: http://localhost:5000
Health check: http://localhost:5000/api/v1/health

---

## Setup — Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on: http://localhost:3000

---

## Environment Variables

### Backend (`backend/.env`)

| Variable             | Description                         | Required |
| -------------------- | ----------------------------------- | -------- |
| `NODE_ENV`           | `development` or `production`       | Yes      |
| `PORT`               | API server port (default: 5000)     | No       |
| `MONGODB_URI`        | MongoDB connection string           | Yes      |
| `JWT_SECRET`         | JWT signing secret (min 32 chars)   | Yes      |
| `JWT_EXPIRES_IN`     | Token expiry (default: 24h)         | No       |
| `ALLOWED_ORIGIN`     | Frontend URL for CORS               | No       |
| `FRONTEND_URL`       | Used in email links                 | No       |
| `UPLOAD_MAX_SIZE_MB` | Max file upload in MB (default: 10) | No       |
| `ADMIN_EMAIL`        | Seed admin email                    | Yes      |
| `ADMIN_PASSWORD`     | Seed admin password                 | Yes      |
| `SMTP_EMAIL`         | Gmail address for sending emails    | Yes      |
| `SMTP_APP_PASSWORD`  | Gmail App Password (16 chars)       | Yes      |
| `SMTP_FROM_NAME`     | Display name in emails              | No       |

### Frontend (`frontend/.env.local`)

| Variable              | Description          |
| --------------------- | -------------------- |
| `NEXT_PUBLIC_API_URL` | Backend API base URL |

---

## Sprint Status (current through Sprint 041 — see `sprints/STATUS.md` for the full table)

The original 13-sprint MVP below shipped in full, and the project has
since grown through **41 sprints total**: dual-layer bookings (Layer 1
Manual + Layer 2 Operational) with a TEU capacity engine, a rebuilt
Invoice/Payment system with explicit payment allocation, an Agent
Financial Account, 9 reports (was 5), a Round/Voyage/Port-scoped Expense
module, a rebuilt widget-based Dashboard, and an updated 13-module Export.
**Sprint 037 was audit-only (no code); Sprint 041 is planning-approved but
NOT yet implemented** — see claude.md's "Known open gaps" section before
starting new work. Condensed post-MVP index:

| Sprints | Theme | Status |
| --- | --- | --- |
| 014-020 | Dashboard overhaul, booking import, RBAC audit, production hardening | ✅ Complete |
| 021-032 | Vessel Particulars, Booking Layer 1/2 split + Capacity Engine | ✅ Complete |
| 033 | Invoice & Agent Financial System | ✅ Complete |
| 034 | Booking Reports Modernization | ✅ Complete |
| 035-036 | Voyage Profitability Report + Expense Port-Level Costing | ✅ Complete |
| 037 | Reporting Modules Architecture Audit | ✅ Audit complete — no code |
| 038 | Reporting Consolidation (fixes from 037) | ✅ Complete |
| 039 | Dashboard Architecture & KPI rebuild | ✅ Complete |
| 040 | Bulk Export Module Update | ✅ Complete |
| 041 | RBAC Enforcement Audit, Performance & Caching Review | 🟡 Planning approved — **not yet implemented** |

Original MVP sprint table:

| Sprint | Description                     | Status      |
| ------ | ------------------------------- | ----------- |
| 001    | Environment & Project Setup     | ✅ Complete |
| 002    | Auth, Users, Roles, RBAC, Email | ✅ Complete |
| 003    | Vessel & Agent Masters          | ✅ Complete |
| 004    | Container Types & Expense Types | ✅ Complete |
| 005    | Location Master                 | ✅ Complete |
| 006    | Service & Route Editor          | ✅ Complete |
| 007    | Rounds & Voyage Engine          | ✅ Complete |
| 008    | Bookings                        | ✅ Complete |
| 009    | Expenses & Invoices             | ✅ Complete |
| 010    | Tracking & Audit Log            | ✅ Complete |
| 011    | Reports                         | ✅ Complete |
| 012    | Export (Excel & ZIP)            | ✅ Complete |
| 013    | QA & Stabilization              | ✅ Complete |

---

## Development Notes

- See `claude.md` for full coding standards and architecture rules
  (single source of truth — read it before touching any code)
- See `docs/` for all planning documents (docs 01-10 describe the original
  MVP scope and now carry status notes pointing to what's changed since)
- See `sprints/` for task breakdown — sprints 035-041 contain the full
  spec/ADRs for everything summarized above
- API base: `/api/v1/`
- Auth: httpOnly cookie JWT (set by `POST /auth/login`) — **not** a Bearer
  token; the browser sends it automatically (`axios` `withCredentials:true`).
  An `Authorization: Bearer <token>` header is accepted as a fallback for
  non-browser API clients only.
