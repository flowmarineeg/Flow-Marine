# 10 — Future Improvements
# Logistics & Shipping SaaS — MERN Stack MVP

---

> **STATUS NOTE (current through Sprint 046):** the MVP (Sprints 001-013) is
> long since shipped, and 33 further sprints (014-046, of which 041 is
> still planning-only) have since built past it — see claude.md and
> sprints/STATUS.md for the full current picture. Several items below have
> since been implemented; each is marked `✅ DONE — Sprint XXX` in its own
> Notes column rather than deleted, so the original numbering stays a
> stable reference (Section 10.13's own "remove it" rule is superseded here
> in favor of leaving a paper trail). Items with no such mark are still
> genuinely unbuilt as of Sprint 046. (Sprints 042-046 introduced no new
> item for this list — Discharge import, invoice manual override, voyage
> display ordering, and the booking-summary/UX cleanups were all direct
> client requests, not items drawn from this backlog.)

## 10.1 Purpose of This Document

This document captures all features, improvements, and architectural changes that are deliberately excluded from the MVP. These are valid ideas that should be implemented after the MVP is stable and in use. Nothing in this document should be built during the MVP phase.

---

## 10.2 Authentication & Security

| # | Improvement | Notes |
|---|---|---|
| 1 | Refresh token mechanism | Replace 24h JWT with short-lived access + refresh token pair |
| 2 | Rate limiting on login | ✅ DONE — Sprint 020 (`express-rate-limit`, 20 req/15min on login/forgot/reset-password) |
| 3 | Two-factor authentication (2FA) | OTP via email or authenticator app |
| 4 | Session management | View and revoke active sessions per user |
| 5 | Password reset via email | ✅ DONE — forgot-password/reset-password flow, time-limited reset token |
| 6 | IP whitelisting per user/role | Restrict access by IP for sensitive roles |

---

## 10.3 Notifications

| # | Improvement | Notes |
|---|---|---|
| 7 | Email notifications | Voyage departure reminders, invoice due date alerts |
| 8 | In-app notifications | Bell icon with real-time notification feed |
| 9 | SMS alerts | Critical alerts via Twilio or similar |
| 10 | Webhook support | Push events to external systems on status changes |

---

## 10.4 Document Generation

| # | Improvement | Notes |
|---|---|---|
| 11 | Bill of Lading (B/L) generation | PDF generation from booking data |
| 12 | Cargo Manifest | Auto-generated per voyage from bookings |
| 13 | Invoice PDF | ✅ DONE — Sprint 020 (PDFKit, GET /invoices/:id/pdf) |
| 14 | Booking Confirmation | PDF confirmation email attachment |

---

## 10.5 Vessel Tracking

| # | Improvement | Notes |
|---|---|---|
| 15 | AIS integration | Real-time vessel position from AIS provider (e.g., MarineTraffic) |
| 16 | Map view | Interactive map showing vessel positions |
| 17 | Geofence alerts | Alert when vessel enters/exits a port zone |
| 18 | ETA auto-update | Auto-update ETA based on AIS speed and position |

---

## 10.6 Financial Features

| # | Improvement | Notes |
|---|---|---|
| 19 | Multi-currency conversion | Live exchange rates + base currency reporting — still NOT done; Sprint 035 explicitly assumed a single operating currency and deferred this |
| 20 | Payment recording | ✅ DONE (and exceeded) — Sprint 033: explicit per-booking `Payment.allocations[]`, void-not-edit correction model |
| 21 | Credit note | Raise credit notes against invoices |
| 22 | AR/AP aging report | Overdue invoice aging analysis — partially covered by Agent Financial Account (Sprint 033) balance/remaining figures, but no dedicated aging-bucket report exists |
| 23 | Budget vs Actual | Compare planned expense budgets to actuals |
| 24 | GL export | Export journal entries for accounting software integration |

---

## 10.7 Customer Portal

| # | Improvement | Notes |
|---|---|---|
| 25 | Shipper self-service portal | Shippers can view bookings and track cargo |
| 26 | Online booking request | External agents can submit booking requests |
| 27 | Invoice portal | Agents can view and download their invoices |

---

## 10.8 Reporting & Analytics

| # | Improvement | Notes |
|---|---|---|
| 28 | Dashboard KPI widgets | ✅ DONE — Sprint 039 (widget/section architecture, 6 sections) |
| 29 | Revenue trend charts | ✅ DONE — Sprint 039 (Dashboard Commercial section Revenue Trend chart) |
| 30 | Slot utilization heatmap | Partial — per-voyage utilisationPct exists (Capacity Engine, Round Capacity Report cards) but no heatmap visualization |
| 31 | Agent performance report | ✅ DONE — Sprint 034 Booking Revenue Details "Top Agents" + Sprint 033 Agent Financial Account |
| 32 | Vessel profitability report | Partial — Voyage Profitability Report (Sprint 035/036) is Round/Voyage-scoped, not a per-vessel-over-time P&L; Vessel Detail page has KPI stats but not full profitability |
| 33 | Scheduled reports | Auto-email reports on a schedule |

---

## 10.9 System & Architecture

| # | Improvement | Notes |
|---|---|---|
| 34 | Redis caching | Deliberately NOT adopted — claude.md explicitly forbids Redis; in-memory `cache.js` TTL map (Map-based) chosen instead and has scaled through Sprint 039's dashboard/capacity caching needs |
| 35 | Background job queue | Process exports, reports, notifications async (Bull/BullMQ) |
| 36 | File storage migration | Move uploads from local disk to S3 or Azure Blob Storage |
| 37 | Full-text search | Elasticsearch or MongoDB Atlas Search for global search |
| 38 | API versioning strategy | Formal `/api/v2/` rollout plan |
| 39 | Microservice split | Extract reports and export as separate service if load demands it |
| 40 | WebSocket support | Real-time tracking updates and notifications |

---

## 10.10 UX & Frontend

| # | Improvement | Notes |
|---|---|---|
| 41 | Dark mode | Tailwind dark mode toggle |
| 42 | Multi-language (i18n) | Arabic + English UI support |
| 43 | Mobile responsive improvements | Full mobile optimization beyond basic responsiveness |
| 44 | Keyboard shortcuts | Power-user navigation shortcuts |
| 45 | Bulk actions | Bulk status change, bulk export from list pages |
| 46 | Saved filter presets | Users can save their common filter combinations |
| 47 | Column visibility toggle | Show/hide columns in list tables |

---

## 10.11 Integration

| # | Improvement | Notes |
|---|---|---|
| 48 | Public REST API | Expose read endpoints for external consumers with API key auth |
| 49 | EDI integration | Electronic Data Interchange for shipping messages |
| 50 | Port community system | Integration with port authority systems |
| 51 | ERP connector | Export data to SAP / Oracle / Odoo |

---

## 10.12 DevOps & Infrastructure

| # | Improvement | Notes |
|---|---|---|
| 52 | CI/CD pipeline | GitHub Actions for auto-test + deploy |
| 53 | Docker containerization | ✅ DONE — Sprint 020 (backend/frontend Dockerfiles + docker-compose.yml) |
| 54 | Automated testing | Unit tests (Jest) + integration tests + E2E (Playwright) — still NOT done |
| 55 | Health check endpoint | ✅ DONE — GET /api/v1/health |
| 56 | Centralized logging | Winston + log aggregation (Datadog / ELK) |
| 57 | Database backups | Automated MongoDB Atlas backups or custom mongodump cron |
| 58 | Multi-tenant support | Separate data per company (tenant isolation) |

---

## 10.13 Rule: How to Add Future Features

When any item from this document is approved for development:

1. Remove it from this file.
2. Add it to the appropriate `docs/` file (business rules, DB schema, API planning, etc.).
3. Create a new sprint file in `/sprints/` for implementation.
4. Update `claude.md` MVP Scope section.
5. Follow the exact same module structure and coding standards as the MVP.
6. Write a database migration script if schema changes are needed — never modify existing documents manually.
