# Logistics & Shipping SaaS

A full-stack MERN logistics operations platform for managing vessels, routes, voyages, bookings, expenses, invoices, and vessel tracking.

---

## Prerequisites

- Node.js >= 18.x
- MongoDB **replica set** (Atlas, or local `mongod --replSet`) — money features use transactions; a standalone `mongod` will fail
- npm >= 9.x

---

## Project Structure

```
logistics/
  backend/     → Express + MongoDB API
  frontend/    → Next.js UI
  docs/        → Current module documentation (start at docs/README.md); docs/audit/ = current audit; docs/archive/ = history
  sprints/     → STATUS.md (current status); sprints/archive/ = sprint specs 001–053
  CLAUDE.md    → AI instruction file / hard rules
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

## Status

Sprints 001–048 shipped; Version 2 (accounting ledger, V2 invoices, agent accounts, round close and partner settlement — sprints 049–053) is in the working tree on branch `version-4`, uncommitted. The integration tests (`npm run test:int`) have not run since the V2-only conversion. See `sprints/STATUS.md` for the short current status and `docs/audit/` for open findings.

Modules: vessels, master data (locations, services/routes, agents, container types, expense types, partners), rounds & voyages with a TEU capacity engine, two-layer bookings with Excel import (booking / final loading / discharge), expenses (PDA/FDA, ledger posting), V2 invoices (settlements, credit/debit notes, commission), tracking, 7 reports + dashboard, Excel/ZIP export, users/roles/RBAC with audit logs.

---

## Development Notes

- See `CLAUDE.md` for coding standards and the hard rules (read it before touching any code)
- See `docs/README.md` for the module documentation (architecture, data flow, schemas, routes, rules)
- Historical planning docs and sprint specs are archived in `docs/archive/` and `sprints/archive/`
- API base: `/api/v1/`
- Auth: httpOnly cookie JWT (set by `POST /auth/login`) — **not** a Bearer
  token; the browser sends it automatically (`axios` `withCredentials:true`).
  An `Authorization: Bearer <token>` header is accepted as a fallback for
  non-browser API clients only.
