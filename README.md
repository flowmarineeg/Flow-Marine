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

## Sprint Status

| Sprint | Description                     | Status      |
| ------ | ------------------------------- | ----------- |
| 001    | Environment & Project Setup     | ✅ Complete |
| 002    | Auth, Users, Roles, RBAC, Email | ✅ Complete |
| 003    | Vessel & Agent Masters          | ⏳ Pending  |
| 004    | Container Types & Expense Types | ⏳ Pending  |
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
- See `docs/` for all planning documents
- See `sprints/` for task breakdown — work through sprints in order
- API base: `/api/v1/`
- All protected routes require: `Authorization: Bearer <token>`
