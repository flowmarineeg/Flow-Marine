# Graph Report - logistics  (2026-11-10)

## Corpus Check
- 506 files · ~368,159 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 11, .stackdump 1, .ico 1)

## Summary
- 3311 nodes · 8573 edges · 162 communities (153 shown, 9 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 874 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `54dc194f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- error
- BookingReport.jsx
- auth.js
- PermissionContext.jsx
- utils/constants.js
- dashboard/page.jsx
- badRequest
- PageGuard
- agentAccounts/agentAccounts.service.js
- LoadingSpinner
- react
- backend/package.json
- escapeRegex
- partner.routes.js
- @tanstack/react-query
- config/constants.js
- 6. CRITICAL TECHNICAL RULES
- backend
- upload.js
- rounds-voyages-probe.js
- AppError
- frontend/package.json
- seed-test-data.js
- partnerSettlement.service.js
- react-hot-toast
- capacity/capacity.service.js
- expense.service.js
- invoiceV2.service.js
- voyage.service.js
- auth.controller.js
- permission.model.js
- seed.js
- backend/src/utils/money.js
- vessel.service.js
- ledger.service.js
- reports/reports.service.js
- useAuth
- VesselForm.jsx
- bookingImport.service.js
- BookingImport.jsx
- export/export.service.js
- roundsVoyages.logic.test.js
- round.service.js
- ref_node_assert
- mailer.js
- booking.service.js
- partner.service.js
- showErrorToast
- user.service.js
- location.routes.js
- roundLock.js
- api.int.test.js
- e2e-masterdata.js
- booking.routes.js
- masterData2.test.js
- audit-fixes.int.test.js
- v2.int.test.js
- ManualBookingForm.jsx
- scripts
- expenseType.logic.js
- accounting.routes.js
- vessel.routes.js
- Capacity Engine — Audit Report (Version 2: Final Verification)
- rbac
- expense-module-analysis.md
- invoicePdfGenerator.js
- AuditLogDetail.jsx
- getVoyagePortIds
- success
- round.routes.js
- reports-analysis.md
- scripts
- TtlCache
- Client
- 5.3 Schema Definitions
- manifest.json
- voyageRun.logic.test.js
- CodingRules.jsx
- 4. Findings
- vessel.model.test.js
- mongoose
- compilerOptions
- next.config.mjs
- postcss.config.mjs
- rolling-pnl-analysis.md
- Findings
- Logistics & Shipping SaaS — MERN Stack MVP
- booking.controller.js
- status
- created
- Logistics & Shipping SaaS — MERN Stack MVP
- VesselDetail.jsx
- agent.model.js
- paginate
- Hard rules (never break)
- Findings
- 03 — Rounds, Voyages & Capacity
- System Audit — 2026-08-03
- getVoyageLabel
- bookings-probe.js
- docs/README.md
- 00 — Architecture & Cross-cutting Rules
- Logistics & Shipping SaaS — MERN Stack MVP
- Logistics & Shipping SaaS — MERN Stack MVP
- 3. Findings
- | See §6 "Version 2" and sprints/v2-code-audit-2026-10-21.md before touching any money code
- Status — 2026-11-10
- deleteVoyage
- RoundCapacityReport.jsx
- auth/auth.service.js
- responseHelper.js
- 04 — Bookings
- Logistics & Shipping SaaS — MERN Stack MVP
- System Audit — 2026-09-01
- Full audit — Routes → Rounds → Voyages → Bookings (data flow + current status) — 2026-11-05
- ExpenseForm.jsx
- auth.routes.js
- voyageMatch.logic.js
- expenseV2.service.js
- Logistics & Shipping SaaS — MERN Stack MVP
- Logistics & Shipping SaaS — MERN Stack MVP
- assertRoundBookable
- Logistics & Shipping SaaS — MERN Stack MVP
- Booking Report — Technical Analysis (Pre-Migration)
- Logistics & Shipping SaaS
- probes-2.js
- voyage.routes.js
- bookingVoyage.service.js
- user.routes.js
- FLOW Maritime ERP - Version 2 FINAL AUDIT
- Audit — Service → Route legs → Round → Voyages (up to "set booking") — 2026-10-26
- probes-1.js
- agentAccounts.logic.js
- containerType.validation.js
- agentAccounts.routes.js
- billing.routes.js
- voyageMatch.logic.test.js
- Logistics & Shipping SaaS — MERN Stack MVP
- CLAUDE-full-reference.md
- 7. IMPACT SURVEY
- BookingDetailCard.jsx
- vessel.controller.js
- 07 — Tracking
- 5. FRONTEND STRUCTURE
- System Audit — 2026-10-20
- agent.controller.js
- bookingImport.controller.js
- capacityLegs.logic.test.js
- 05 — Expenses
- 4. BACKEND STRUCTURE
- 7. BUSINESS RULES
- CharterHistory.jsx
- 13. ENVIRONMENT
- 17. AI AGENT WORKFLOW
- BookingsSummaryCard
- FINAL CLASSIFICATION SUMMARY
- FINAL CLASSIFICATION SUMMARY
- frontend/README.md
- 2026-10-24/audit/README.md

## God Nodes (most connected - your core abstractions)
1. `success()` - 140 edges
2. `showErrorToast()` - 107 edges
3. `AppError` - 105 edges
4. `react` - 101 edges
5. `error()` - 100 edges
6. `PageGuard()` - 95 edges
7. `@tanstack/react-query` - 92 edges
8. `LoadingSpinner()` - 85 edges
9. `Button()` - 82 edges
10. `usePermission()` - 81 edges

## Surprising Connections (you probably didn't know these)
- `Schema `Round`` --references--> `status()`  [INFERRED]
  docs/03-rounds-voyages.md → backend/scripts/audit-probes/probes-1.js
- `Schema `Voyage`` --references--> `status()`  [INFERRED]
  docs/03-rounds-voyages.md → backend/scripts/audit-probes/probes-1.js
- ``discharge` — match-only (reworked)` --references--> `status()`  [INFERRED]
  docs/04-bookings.md → backend/scripts/audit-probes/probes-1.js
- `Schema `Booking`` --references--> `status()`  [INFERRED]
  docs/04-bookings.md → backend/scripts/audit-probes/probes-1.js
- ``Invoice` (shared collection, `invoice.model.js`)` --references--> `status()`  [INFERRED]
  docs/06-invoices.md → backend/scripts/audit-probes/probes-1.js

## Import Cycles
- 2-file cycle: `backend/src/modules/agentAccounts/agentAccounts.service.js -> backend/src/modules/billing/invoiceV2.service.js -> backend/src/modules/agentAccounts/agentAccounts.service.js`

## Communities (162 total, 9 thin omitted)

### Community 0 - "error"
Cohesion: 0.09
Nodes (33): wrap(), getBookingReport(), getBookingRevenueDetails(), getExpenseReport(), getRevenueReport(), getRoundCapacityReport(), getRoundPnL(), getVoyagePerformance() (+25 more)

### Community 1 - "BookingReport.jsx"
Cohesion: 0.20
Nodes (26): 1. Locate the Current Booking Report — Complete Flow, BookingRevenueDetailsPage(), RevenueReportPage(), BookingReport(), fmt(), BookingRevenueDetailsReport(), ExpenseReport(), fmt() (+18 more)

### Community 2 - "auth.js"
Cohesion: 0.07
Nodes (39): auditLogger(), authMiddleware(), jwt, methodToAction, express, router, validateCreate, validateUpdate (+31 more)

### Community 3 - "PermissionContext.jsx"
Cohesion: 0.09
Nodes (37): AgentDetailContent(), AgentDetailPage(), EditInvoiceContent(), EditInvoicePage(), NewInvoiceContent(), NewInvoicePage(), Can(), PermissionContext (+29 more)

### Community 4 - "utils/constants.js"
Cohesion: 0.06
Nodes (39): COLUMNS, ContainerTypesPage(), FILTERS, CATEGORY_STYLES, COLUMNS, ExpenseTypesPage(), FILTERS, api (+31 more)

### Community 5 - "dashboard/page.jsx"
Cohesion: 0.10
Nodes (51): ADR-0005, 3.6 Dashboard `TopAgentsWidget`/`TopRoutesWidget` fire an unbounded query unconditionally, DashboardPage(), DashboardFilterBar(), DashboardFilterContext, DashboardFilterProvider(), EMPTY_FILTERS, useDashboardFilters() (+43 more)

### Community 6 - "badRequest"
Cohesion: 0.09
Nodes (26): handle(), { body, validationResult }, handle(), mapping, validateCreate, validateUpdate, { body, validationResult }, handle() (+18 more)

### Community 7 - "PageGuard"
Cohesion: 0.06
Nodes (35): AgentsPage(), AuditLogsPage(), BookingsPage(), COLUMNS, CustomersPage(), FILTERS, TYPE_STYLES, ExpensesPage() (+27 more)

### Community 8 - "agentAccounts/agentAccounts.service.js"
Cohesion: 0.10
Nodes (37): accountIds(), advance(), agentLedgerLines(), bankCode(), bankOf(), buildStatement(), cancelCommission(), cancelCommissionTx() (+29 more)

### Community 9 - "LoadingSpinner"
Cohesion: 0.15
Nodes (50): Frontend Analysis, 2. Status of the 9-1 Findings, NewManualBookingPage(), InvoicesPage(), TrackingPage(), Badge(), BADGE_STYLES, Button() (+42 more)

### Community 10 - "react"
Cohesion: 0.10
Nodes (35): NewAgentPage(), LocationsContent(), LocationsPage(), TABS, BankAccountsRows(), cleanBankAccounts(), emptyBankAccount(), ic() (+27 more)

### Community 11 - "backend/package.json"
Cohesion: 0.07
Nodes (40): author, dependencies, archiver@^7.0.1, compression@^1.7.4, cookie-parser@^1.4.6, cors@^2.8.5, country-state-city@^3.2.1, dotenv@^16.4.5 (+32 more)

### Community 12 - "escapeRegex"
Cohesion: 0.05
Nodes (51): assertBookingSource(), create(), getAll(), list(), NOT_WRITABLE, update(), list(), assertIsoFree() (+43 more)

### Community 13 - "partner.routes.js"
Cohesion: 0.08
Nodes (31): { body, validationResult }, handle(), masterFields, nn, express, router, { body, validationResult }, handle() (+23 more)

### Community 14 - "@tanstack/react-query"
Cohesion: 0.12
Nodes (26): useAgents(), fmt(), NEXT_STATUS, RoundDetailPage(), RoundForm(), idOf(), RoundLegsPanel(), emptyLeg() (+18 more)

### Community 15 - "config/constants.js"
Cohesion: 0.06
Nodes (39): AUDIT_ACTIONS, CONTAINER_SIZES, CONTAINER_TYPES, EXPENSE_CATEGORIES, EXPENSE_COST_CLASSIFICATIONS, INVOICE_STATUS, INVOICE_TYPES, PAYMENT_METHODS (+31 more)

### Community 16 - "6. CRITICAL TECHNICAL RULES"
Cohesion: 0.04
Nodes (47): 6. CRITICAL TECHNICAL RULES, AppError vs legacy throws, Audit logger — fire-and-forget, Authentication (Sprint020 — BREAKING CHANGE), autoNumber.js, Booking Import Table — Responsive Overflow Containment (Sprint 032), Booking POL/POD Server-Derivation + Round→Voyage Cascading Filters (Sprint 030), Booking Primary Key (Sprint 021) (+39 more)

### Community 17 - "backend"
Cohesion: 0.06
Nodes (36): NEXT_PUBLIC_API_URL, build, condition, container_name, env_file, environment, healthcheck, networks (+28 more)

### Community 18 - "upload.js"
Cohesion: 0.16
Nodes (14): compressImage(), compressUpload(), fs, MAGIC_BYTES, matchesDeclaredType(), maxSizeMB, multer, multerBase (+6 more)

### Community 19 - "rounds-voyages-probe.js"
Cohesion: 0.17
Nodes (4): cleanup, Client, out, RUN

### Community 20 - "AppError"
Cohesion: 0.13
Nodes (21): expenseAccountCodeFor(), agreeStatement(), buildListQuery(), assertCodeFree(), create(), getById(), list(), update() (+13 more)

### Community 21 - "frontend/package.json"
Cohesion: 0.07
Nodes (32): eslintConfig, dependencies, axios@^1.7.2, chart.js@^4.5.1, next@^16.4.2, react@19.2.4, react-dom@19.2.4, react-hook-form@^7.52.1 (+24 more)

### Community 22 - "seed-test-data.js"
Cohesion: 0.05
Nodes (65): assertSafeTarget(), BOX_PREFIX, boxNo(), COMMODITIES, daysAgo(), daysAhead(), expense(), fullExpense() (+57 more)

### Community 23 - "partnerSettlement.service.js"
Cohesion: 0.08
Nodes (36): cancel(), expenseSchema, mongoose, hardDelete(), mongoose, vesselPartnerSchema, jvReserveMovementSchema, mongoose (+28 more)

### Community 24 - "react-hot-toast"
Cohesion: 0.09
Nodes (27): AcceptInviteInner(), AcceptInvitePage(), ForgotPasswordPage(), LoginPage(), ResetPasswordInner(), ResetPasswordPage(), ManualBookingDetailPage(), Home() (+19 more)

### Community 25 - "capacity/capacity.service.js"
Cohesion: 0.09
Nodes (31): run(), bookingSchema, mongoose, cargoRowSchema, manualBookingSchema, mongoose, ALLOWED_CAPACITY_STATUSES, cacheKey() (+23 more)

### Community 26 - "expense.service.js"
Cohesion: 0.20
Nodes (16): assertTypeFitsScope(), create(), deleteFile(), deriveScope(), fs, getById(), hardDelete(), ADR-0002 (+8 more)

### Community 27 - "invoiceV2.service.js"
Cohesion: 0.05
Nodes (52): balanceMinor(), buildLine(), computeCommission(), deriveStatus(), groupBookingsIntoItems(), bookingItemSchema, invoiceLineSchema, invoiceSettlementSchema (+44 more)

### Community 28 - "voyage.service.js"
Cohesion: 0.14
Nodes (24): bad(), scheduleWarnings(), toTime(), validateVoyageState(), allocateSequence(), cancelVoyageBookings(), createVoyage(), getRoundRoutePorts() (+16 more)

### Community 29 - "auth.controller.js"
Cohesion: 0.18
Nodes (13): crypto, csrfProtection(), csrfTokenFor(), EXEMPT_PATHS, SAFE_METHODS, changePassword(), cookieOptions(), forgotPassword() (+5 more)

### Community 30 - "permission.model.js"
Cohesion: 0.28
Nodes (7): MODULES, actionSchema, mongoose, permissionSchema, ACTION_KEYS, getByRoleId(), saveByRoleId()

### Community 31 - "seed.js"
Cohesion: 0.08
Nodes (30): connectDB(), mongoose, migrate(), MODELS, mongoose, DRY, ALL, bcrypt (+22 more)

### Community 32 - "backend/src/utils/money.js"
Cohesion: 0.12
Nodes (26): computePositions(), computeProfit(), settleRound(), shareProfit(), suggestTransfers(), postClosingEntry(), getRoundPnL(), voyageDurationDays() (+18 more)

### Community 33 - "vessel.service.js"
Cohesion: 0.16
Nodes (16): assertMasterRules(), checkShares(), clearParticulars(), create(), deleteParticularsFile(), fs, getAll(), list() (+8 more)

### Community 34 - "ledger.service.js"
Cohesion: 0.13
Nodes (15): immutableError(), makeImmutable(), OPS, journalEntrySchema, mongoose, SOURCE_TYPES, journalEntryLineSchema, mongoose (+7 more)

### Community 35 - "reports/reports.service.js"
Cohesion: 0.24
Nodes (14): classifyRevenueSizeBucket(), dateRange(), getBookingReport(), getBookingRevenueDetails(), getExpenseReport(), getRevenueReport(), getVoyagePerformance(), ADR-0001 (+6 more)

### Community 36 - "useAuth"
Cohesion: 0.18
Nodes (14): DashboardLayout(), FALLBACK_NAV, metadata, RootLayout(), getTitle(), Header(), NAV, Sidebar() (+6 more)

### Community 37 - "VesselForm.jsx"
Cohesion: 0.22
Nodes (15): EditVesselPage(), NewVesselPage(), bpToPct(), JvMatrix(), pctToBp(), validateRows(), bpToPct(), pctToBp() (+7 more)

### Community 38 - "bookingImport.service.js"
Cohesion: 0.12
Nodes (28): analyseDischarge(), analyseRows(), assertImportAllowed(), ExcelJS, inTransaction(), loadExisting(), mongoose, norm() (+20 more)

### Community 39 - "BookingImport.jsx"
Cohesion: 0.31
Nodes (7): BookingImportPage(), BookingImport(), EditableCell(), EXCEL_COLUMN_MAP, parseExcel(), ROW_STYLES, SummaryBadge()

### Community 40 - "export/export.service.js"
Cohesion: 0.21
Nodes (13): addMetadataSheet(), ALLOWED_MODULES, archiver, buildExcelBuffer(), buildZipStream(), COLUMNS, ExcelJS, exportSingle() (+5 more)

### Community 42 - "round.service.js"
Cohesion: 0.09
Nodes (34): assertInitialStatus(), buildEditedLegs(), buildRouteSnapshot(), CANCELLABLE_VOYAGE_STATUSES, crypto, INITIAL_STATUSES, newLegKey(), assertNoLiveBookings() (+26 more)

### Community 43 - "ref_node_assert"
Cohesion: 0.10
Nodes (14): contactFromLegacy(), assert, test, assert, test, assert, test, assert (+6 more)

### Community 44 - "mailer.js"
Cohesion: 0.23
Nodes (12): nodemailer@^6.10.1, forgotPassword(), resetPassword(), resendInvite(), escapeHtml(), nodemailer, sendInvitationEmail(), sendMail() (+4 more)

### Community 45 - "booking.service.js"
Cohesion: 0.11
Nodes (35): capacityEnforcement(), required, validate(), create(), DISCHARGE_COLUMNS, dischargeFilter(), exportDischargeList(), getById() (+27 more)

### Community 46 - "partner.service.js"
Cohesion: 0.09
Nodes (30): create(), descendantIds(), FIELDS, HEADER_FIELDS, list(), prefixOf(), remove(), update() (+22 more)

### Community 47 - "showErrorToast"
Cohesion: 0.12
Nodes (27): AccountingRoute(), AccountForm(), AccountingPage(), buildTree(), ChartTab(), TYPES, ExchangeRates(), DateCell() (+19 more)

### Community 48 - "user.service.js"
Cohesion: 0.35
Nodes (10): acceptInvite(), bcrypt, create(), crypto, getById(), invalidateUser(), inviteUser(), list() (+2 more)

### Community 49 - "location.routes.js"
Cohesion: 0.19
Nodes (14): express, router, { body, validationResult }, currency, handle(), portCode, validateCityCreate, validateCityUpdate (+6 more)

### Community 50 - "roundLock.js"
Cohesion: 0.38
Nodes (15): assertBookingsRoundOpen(), assertDocRoundOpen(), assertExpenseRoundOpen(), assertInvoiceRoundOpen(), assertItemsRoundOpen(), assertRoundOpen(), assertRoundOpenTx(), assertRoundsOpen() (+7 more)

### Community 51 - "api.int.test.js"
Cohesion: 0.12
Nodes (6): assert, bcrypt, { describe, it, before, after }, mongoose, path, { spawn }

### Community 52 - "e2e-masterdata.js"
Cohesion: 0.19
Nodes (6): brief(), check(), Client, expectStatus(), results, RUN

### Community 53 - "booking.routes.js"
Cohesion: 0.18
Nodes (12): BOOKING_STATUS, express, router, { body, validationResult }, handle(), validateCreate, validateUpdate, { body, validationResult } (+4 more)

### Community 54 - "masterData2.test.js"
Cohesion: 0.12
Nodes (18): ALL_CITIES, CITY_COUNTRIES, COUNTRIES_ONLY, { Country: LibCountry, City: LibCity }, DRY, lc(), run(), uniqueCityNames() (+10 more)

### Community 55 - "audit-fixes.int.test.js"
Cohesion: 0.19
Nodes (10): assert, { describe, it, before, after }, issueInvoice(), mkBookings(), mkRound(), mongoose, postPayable(), U (+2 more)

### Community 56 - "v2.int.test.js"
Cohesion: 0.16
Nodes (8): assert, { describe, it, before, after }, mkBookings(), mkRound(), mongoose, uniq(), USER, USER_ID

### Community 57 - "ManualBookingForm.jsx"
Cohesion: 0.15
Nodes (21): useBookingLookups(), BookingForm(), FieldLabel(), fmtMoney(), ic(), SectionCard(), DischargeListBody(), DischargeListExportModal() (+13 more)

### Community 58 - "scripts"
Cohesion: 0.15
Nodes (13): scripts, dev, migrate:hard-delete-cleanup, migrate:masterdata, migrate:rounds-voyages, migrate:seed-accounts, seed, seed:chart (+5 more)

### Community 59 - "expenseType.logic.js"
Cohesion: 0.29
Nodes (6): ALLOWED_SCOPES, LEVEL_LABEL, levelFromScopes(), OPERATIONAL_LEVELS, scopeAllowed(), scopeError()

### Community 60 - "accounting.routes.js"
Cohesion: 0.21
Nodes (11): { body, validationResult }, express, handle(), router, shared, ACCOUNT_TYPES, accountSchema, ALLOCATION_LEVELS (+3 more)

### Community 61 - "vessel.routes.js"
Cohesion: 0.20
Nodes (10): OWNERSHIP_TYPES, validateShares, express, router, { body, validationResult }, handle(), masterFields, nn (+2 more)

### Community 62 - "Capacity Engine — Audit Report (Version 2: Final Verification)"
Cohesion: 0.05
Nodes (42): computeVoyagePreview(), resolveTEU(), BUG-003 — L1 Fallback Creates Phantom Load/Discharge Events Instead of Excluding, BUG-004 — computeVoyagePreview Only Checks the Load Voyage, Not Transited Voyages, BUG-005 — previewCapacity API Endpoint Calls Non-Existent computeSegmentPreview, BUG-006 — Voyage Sorting Relies on sequence Without a Unique Compound Index, BUG-007 — utilisationPct Uses Math.round, Can Show 100% When Vessel Has Remaining Capacity, BUG-008 — L1 totalTEU Is Pre-Computed at Save Time, Not Refreshed If resolveTEU Changes (+34 more)

### Community 63 - "rbac"
Cohesion: 0.07
Nodes (38): hasPermission(), rbac(), redactBank(), express, ADR-0001, notOwnRole(), ownRoleId(), ownRoleOrRoles() (+30 more)

### Community 64 - "expense-module-analysis.md"
Cohesion: 0.05
Nodes (37): Additional scenarios implied by the current architecture (not explicitly, API endpoints, Architecture Risks, Backend Analysis, Backend workflow, Business Questions, Business Scenarios, Complete expense lifecycle, as it exists today (+29 more)

### Community 65 - "invoicePdfGenerator.js"
Cohesion: 0.35
Nodes (11): C, fillBox(), fmtDate(), fmtMoney(), fmtNum(), generateInvoicePdf(), hLine(), PDFDocument (+3 more)

### Community 66 - "AuditLogDetail.jsx"
Cohesion: 0.27
Nodes (9): AuditLogDetailPage(), ACTION_STYLE, AuditLogDetail(), fmt(), getDiff(), MODULE_ROUTES, renderValue(), ValueDisplay() (+1 more)

### Community 67 - "getVoyagePortIds"
Cohesion: 0.07
Nodes (34): getVoyagePortIds(), getVoyagePorts(), BUG-002 — portAsFrom/portAsTo Maps Overwrite Repeated Ports in Circular Routes, BUG-002 — portAsFrom/portAsTo Maps Overwrite Repeated Ports in Circular Routes, 1. HOW THE VOYAGE SELECTOR CURRENTLY WORKS, 1. HOW THE VOYAGE SELECTOR CURRENTLY WORKS, 2. HOW POL/POD ARE POPULATED — THE ROOT ISSUE, 3. WHETHER VOYAGE AND POL/POD DUPLICATE THE SAME RESPONSIBILITY (+26 more)

### Community 68 - "success"
Cohesion: 0.10
Nodes (31): ALLOWED_CAPACITY_STATUSES, getRoundCapacity(), getVesselActiveCapacity(), previewCapacity(), getFleetUtilisation(), getStats(), deleteCity, deleteCountry (+23 more)

### Community 69 - "round.routes.js"
Cohesion: 0.27
Nodes (8): ROUND_STATUS, express, router, { body, validationResult }, handle(), validateCreate, validateLegs, validateUpdate

### Community 70 - "reports-analysis.md"
Cohesion: 0.06
Nodes (35): Booking Report Review (Sprint 034 — for reference, not re-analyzed in depth), Booking Revenue Details Review (Sprint 034 — for reference), Cross Module Consistency, Current Reporting Architecture, Dashboard Analysis, Duplicate calculations, Executive Summary, Expense Report (+27 more)

### Community 71 - "scripts"
Cohesion: 0.22
Nodes (9): devDependencies, concurrently@^9.2.4, scripts, build, dev, dev:backend, dev:frontend, start (+1 more)

### Community 72 - "TtlCache"
Cohesion: 0.18
Nodes (5): softDelete(), TtlCache, Cache (`utils/cache.js`), BUG-001 — Stale Cache Served After Failed invalidateRoundCache Call, BUG-001 — Stale Cache Served After Failed invalidateRoundCache Call

### Community 74 - "5.3 Schema Definitions"
Cohesion: 0.07
Nodes (29): 05 — Database Planning, 5.1 Database Configuration, 5.2 Collections, 5.3 Schema Definitions, 5.4 Auto-Number Strategy, 5.5 Deletion / Cascade Rules, agents, auditLogs (+21 more)

### Community 75 - "manifest.json"
Cohesion: 0.29
Nodes (6): background_color, display, icons, name, short_name, theme_color

### Community 76 - "voyageRun.logic.test.js"
Cohesion: 0.33
Nodes (3): assert, legs, test

### Community 77 - "CodingRules.jsx"
Cohesion: 0.40
Nodes (5): Card(), CodingRules(), DIMENSIONS, LEVELS, RULES

### Community 78 - "4. Findings"
Cohesion: 0.08
Nodes (26): previewImport(), 7. IMPACT SURVEY, Backend validation (`booking.service.js`, `manualBooking.service.js`), Booking creation (Layer 1 & Layer 2), Business rules (`claude.md` §6 "Layer 2 Import Architecture — Sprint 026"), Capacity engine (`capacity.service.js`), Final Loading Import reconciliation, Import flow (`bookingImport.service.js`, `BookingImport.jsx`) (+18 more)

### Community 79 - "vessel.model.test.js"
Cohesion: 0.40
Nodes (3): assert, base, test

### Community 81 - "mongoose"
Cohesion: 0.08
Nodes (19): USER_STATUS, handlingChargeSchema, mongoose, offsetBatchSchema, statementSchema, agentAgreementSchema, handlingFeeSchema, mongoose (+11 more)

### Community 87 - "rolling-pnl-analysis.md"
Cohesion: 0.08
Nodes (25): Calculation Analysis — Every KPI, Combined, Current Business Purpose, Current expense assumptions, Current expense relationships, Current Filtering Options, Current Grouping Logic, Current limitations (Expense side) (+17 more)

### Community 88 - "Findings"
Cohesion: 0.08
Nodes (24): overdueMatch(), Known gaps / gotchas, 08 — Reports & Dashboard, Consistency notes, Dashboard (`/dashboard`), Export of report data, Frontend, Reports (+16 more)

### Community 89 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.08
Nodes (23): 03 — Business Rules, 3.10 Deletion Rules, 3.11 Status Transition Rules, 3.1 Master Data Rules, 3.2 Route Rules, 3.3 Round Rules, 3.4 Voyage Auto-Generation Rules, 3.5 Booking Rules (+15 more)

### Community 90 - "booking.controller.js"
Cohesion: 0.21
Nodes (20): create(), dischargeList(), exportDischargeList(), fail(), getById(), getLookups(), getVoyagePorts(), list() (+12 more)

### Community 91 - "status"
Cohesion: 0.12
Nodes (21): status(), 01 — Master Data, Agent agreements (`modules/agreements`), Agents/Customers (`modules/customers`, `/customers`, perm `customers`) — the Customers tab, renamed 2026-10-27, Container types (`modules/containerTypes`, `/container-types`), Expense types and categories (`modules/expenseTypes`, `/expense-types`), Invoice Services (`modules/invoiceServices`, `/invoice-services`, perm `invoiceServices`) — Masters → Services, Locations (`modules/locations`, `/locations`, perm module `locations`) (+13 more)

### Community 92 - "created"
Cohesion: 0.10
Nodes (20): create(), createCategory(), deleteCategory(), getById(), getCategories(), list(), remove(), update() (+12 more)

### Community 93 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.10
Nodes (20): 06 — API Planning, 6.10 Rounds, 6.11 Voyages, 6.12 Bookings, 6.13 Expenses, 6.14 Invoices, 6.15 Tracking, 6.16 Reports (+12 more)

### Community 94 - "VesselDetail.jsx"
Cohesion: 0.18
Nodes (18): VesselDetailPage(), barColor(), CapacityTimeline(), fmt(), textColor(), ActiveRoundCapacity(), BOOKING_COLORS, BookingDoughnut() (+10 more)

### Community 95 - "agent.model.js"
Cohesion: 0.12
Nodes (15): AGENT_STATUS, agentSchema, contactSchema, mongoose, getLookups(), roundPorts(), contactSchema, CUSTOMER_TYPES (+7 more)

### Community 96 - "paginate"
Cohesion: 0.13
Nodes (16): create(), getById(), list(), remove(), update(), create(), getAttachment(), getById() (+8 more)

### Community 97 - "Hard rules (never break)"
Cohesion: 0.11
Nodes (16): exportZip(), Architecture map, Before coding, CLAUDE.md — Logistics & Shipping Operations SaaS (MERN), Commands, Docs & history, Env & demo, Hard rules (never break) (+8 more)

### Community 98 - "Findings"
Cohesion: 0.12
Nodes (18): saveLegs(), Findings, Proposed fix sprint (no code written yet beyond RV-00), RV-00 (High) — FIXED 2026-10-26 — vessel without reefer plugs could not be created, RV-01 (High) — Round created with a vessel that does not exist  *(probed)*, RV-02 / RV-03 (Low) — Inactive service / vessel accepted by the API  *(probed)*, RV-04 / RV-05 (Medium) — Rounds created as Completed / Cancelled  *(probed)*, RV-07 (High) — Two Active rounds on one vessel  *(probed)* (+10 more)

### Community 99 - "03 — Rounds, Voyages & Capacity"
Cohesion: 0.11
Nodes (18): 03 — Rounds, Voyages & Capacity, Capacity engine (per leg, rewritten 2026-11-10 — fixes FL-01 / BK-02), Concepts, Creating a voyage (`voyage.service.createVoyage`), Database changes / deployment, Deleting, Known limitations, Related modules (+10 more)

### Community 100 - "System Audit — 2026-08-03"
Cohesion: 0.11
Nodes (17): 1.1 NoSQL injection in password reset → account takeover, 1. CRITICAL, 2.1 `Round.hardDelete`'s new Voyage cascade orphans Layer-1 bookings and Expenses, 2.2 Discharge-import RBAC gap — wrong permission gates a cross-agent bulk mutation, 2. HIGH, 3.1 File upload accepts spoofed Content-Type — no magic-byte validation, 3.3 Payment History table no longer shows the per-booking "Applied To" breakdown, contradicting the sprint's own comment, 3.4 Bulk-delete selection state not reset across BookingList.jsx tabs (+9 more)

### Community 101 - "getVoyageLabel"
Cohesion: 0.21
Nodes (12): fmt(), ICONS, Stat(), VoyageCapacityCard(), fmtDT(), InfoRow(), TRACKING_COLORS, TrackingDetailModal() (+4 more)

### Community 102 - "bookings-probe.js"
Cohesion: 0.16
Nodes (4): cleanup, Client, out, RUN

### Community 103 - "docs/README.md"
Cohesion: 0.33
Nodes (3): Conventions used in these docs, Documentation Index, Reading order

### Community 104 - "00 — Architecture & Cross-cutting Rules"
Cohesion: 0.12
Nodes (16): 00 — Architecture & Cross-cutting Rules, Audit logger (`middleware/auditLogger.js`), Authentication (`middleware/auth.js`), Backend layout, Commands, CSRF (`middleware/csrf.js`), Data flow at a glance, Delete guards (`utils/dependents.js`) (+8 more)

### Community 105 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.12
Nodes (15): 10.10 UX & Frontend, 10.11 Integration, 10.12 DevOps & Infrastructure, 10.13 Rule: How to Add Future Features, 10.1 Purpose of This Document, 10.2 Authentication & Security, 10.3 Notifications, 10.4 Document Generation (+7 more)

### Community 106 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.13
Nodes (14): 08 — Development Roadmap, 8.10 Phase 9 — Reports & Export (Sprints 011–012), 8.11 Phase 10 — QA & Stabilization (Sprint 013), 8.12 Phase 11+ — Post-MVP Sprints (014-041, condensed index), 8.1 Phase Overview, 8.2 Phase 1 — Foundation & Auth (Sprints 001–002), 8.3 Phase 2 — Simple Master Data (Sprints 003–004), 8.4 Phase 3 — Location Master (Sprint 005) (+6 more)

### Community 107 - "3. Findings"
Cohesion: 0.13
Nodes (14): 1. Verdict, 3. Findings, 5. Not audited today, 6. Suggested order of work, 7. Release gates, A-1 (High) V2 code is entirely uncommitted, A-2 (High) Money paths unverified against a database, A-3 (Medium) Frontend lint is red (22 errors) (+6 more)

### Community 108 - "| See §6 "Version 2" and sprints/v2-code-audit-2026-10-21.md before touching any money code"
Cohesion: 0.13
Nodes (15): 10. AUTO-NUMBER FORMATS, 11. RBAC — CURRENT STATE, 12. API QUICK REFERENCE, 14. DEMO CREDENTIALS, 15. VPS DEPLOYMENT, 16. KNOWN ISSUES / GOTCHAS, 18. DOCUMENTATION FILES, 1.5. COMMANDS (+7 more)

### Community 109 - "Status — 2026-11-10"
Cohesion: 0.13
Nodes (14): 2026-11-02 — Accounting chart CRUD, Audit (2026-10-26), Audit 2026-11-10, Bookings rework (2026-11-10), Docs sync (2026-10-31), Follow-up 2026-11-10 (after the audit), How to use, Master data rework (2026-10-25) (+6 more)

### Community 110 - "deleteVoyage"
Cohesion: 0.14
Nodes (14): deleteVoyage(), 3. NEW findings from the final audit, F-1 (High, FIXED) - the H5 fix broke every voyage deletion, F-2 (High for deployment, OPEN) - `seed.js` is broken and not in git, F-3 (High for governance, OPEN) - planning and audit documents are ignored by git again, F-4 (Low) - integration harness readiness timeout, F-5 (Info) - dependency advisories unchanged, F-6 (Info) - frontend lint baseline (+6 more)

### Community 111 - "RoundCapacityReport.jsx"
Cohesion: 0.26
Nodes (9): RoundCapacityPage(), fmt(), getCapacityRowPod(), getCapacityRowPol(), RoundCapacityReport(), CapacityWarnings(), buildLegPositionMap(), resolveLegPos() (+1 more)

### Community 112 - "auth/auth.service.js"
Cohesion: 0.21
Nodes (12): bcryptjs@^2.4.3, jsonwebtoken@^9.0.2, bcrypt, changePassword(), crypto, getMe(), jwt, login() (+4 more)

### Community 113 - "responseHelper.js"
Cohesion: 0.22
Nodes (9): express, router, { body, validationResult }, validateCreate, validateUpdate, checkModuleExportPermission(), express, router (+1 more)

### Community 114 - "04 — Bookings"
Cohesion: 0.15
Nodes (13): 04 — Bookings, Create / update / delete rules, Discharge list (screen + Excel), `discharge` — match-only (reworked), Excel import (`bookingImport.service.js`, `importRules.logic.js`), Partner label and partner users, Routes, Schema `Booking` (+5 more)

### Community 115 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.15
Nodes (12): 01 — Project Overview, 1.1 System Description, 1.2 System Purpose, 1.3 Technology Stack, 1.4 Architecture Type, 1.5 Users of the System, 1.6 Key Business Entities, 1.7 MVP Deliverables (+4 more)

### Community 116 - "System Audit — 2026-09-01"
Cohesion: 0.15
Nodes (12): 2.1 Backend module inventory (23), 2.2 Frontend feature modules (18) / App Router routes (42 segments), 2.3 The core domain model (condensed — see `CLAUDE.md` for full detail), 2. System Architecture, 3. The Uncommitted Working-Tree Change (WIP, not yet in `CLAUDE.md`), 6. Frontend Correctness & Consistency, 7. Performance, Caching & Dependencies, 8. Audit Findings — Ranked High → Medium → Low (+4 more)

### Community 117 - "Full audit — Routes → Rounds → Voyages → Bookings (data flow + current status) — 2026-11-05"
Cohesion: 0.15
Nodes (9): Audit folder, 1.1 Code and verification state, 1.2 Test DB snapshot (Atlas `test` DB, read-only query 2026-11-05), 1. Current system status, 3. What works (verified in code today), 5. Carried forward (not re-probed), 6. Suggested order of work, 7. Files read (+1 more)

### Community 118 - "ExpenseForm.jsx"
Cohesion: 0.28
Nodes (9): EditExpenseContent(), EditExpensePage(), NewExpenseContent(), NewExpensePage(), ExpenseForm(), ic(), ADR-0002, ADR-0003 (+1 more)

### Community 119 - "auth.routes.js"
Cohesion: 0.23
Nodes (10): authLimiter, express, { rateLimit }, router, { body, validationResult }, handleValidation(), validateChangePassword, validateForgotPassword (+2 more)

### Community 120 - "voyageMatch.logic.js"
Cohesion: 0.32
Nodes (11): bad(), checkChosenVoyage(), compare(), DEAD_STATUS, DEPARTED_STATUS, findVoyageForBooking(), matchRun(), notDeparted() (+3 more)

### Community 121 - "expenseV2.service.js"
Cohesion: 0.26
Nodes (10): checkPaidBy(), convertToFda(), inTransaction(), isDup(), mongoose, postExpense(), reverseExpense(), expenseTypeSchema (+2 more)

### Community 122 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.17
Nodes (11): 02 — System Workflow, 2.1 Main Business Flow, 2.2 Master Data Workflow, 2.3 Round Creation Workflow, 2.4 Voyage Lifecycle, 2.5 Booking Workflow, 2.6 Expense Workflow, 2.7 Vessel Tracking Workflow (+3 more)

### Community 123 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.17
Nodes (11): 09 — Security Rules, 9.1 Authentication, 9.2 Authorization (RBAC), 9.3 Input Validation, 9.4 Data Protection, 9.5 API Security, 9.6 File Upload Security, 9.7 Error Handling & Information Disclosure (+3 more)

### Community 124 - "assertRoundBookable"
Cohesion: 0.18
Nodes (10): assertRoundBookable(), generateVoyages(), Invariants (enforced in the services, not only the UI), RV-32 / RV-33 / RV-37 (Medium / Info) — Non-atomic multi-step writes  *(code-only)*, 2.1 Entities and ownership, 2.2 Data flow, step by step, 2.3 Status machines (as enforced in code), 2.4 Guard matrix (what protects what) (+2 more)

### Community 125 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.18
Nodes (10): 04 — Module Relationships, 4.1 Entity Relationship Overview, 4.2 Detailed Relationship Table, 4.3 One-to-One Relationships, 4.4 One-to-Many Relationships, 4.5 Many-to-One Relationships, 4.6 Reference Directions, 4.7 Cascade / Deletion Strategy (+2 more)

### Community 126 - "Booking Report — Technical Analysis (Pre-Migration)"
Cohesion: 0.18
Nodes (10): 2. Data Source Analysis, 3. Current Report Structure — Every Column, Traced, 4. Business Logic, 5. Problems Caused by the Migration to Layer 1 + Layer 2, 6. Required Migration (Description Only — Not Implemented), 7. Impact Analysis, 8. Recommendation (Migration Strategy Only — No Implementation Steps), Booking Report — Technical Analysis (Pre-Migration) (+2 more)

### Community 127 - "Logistics & Shipping SaaS"
Cohesion: 0.18
Nodes (10): Backend (`backend/.env`), Development Notes, Environment Variables, Frontend (`frontend/.env.local`), Logistics & Shipping SaaS, Prerequisites, Project Structure, Setup — Backend (+2 more)

### Community 128 - "probes-2.js"
Cohesion: 0.20
Nodes (4): mongoose, out, path, U

### Community 129 - "voyage.routes.js"
Cohesion: 0.24
Nodes (8): VOYAGE_DIRECTION, VOYAGE_STATUS, express, router, { body, validationResult }, handle(), validateCreate, validateUpdate

### Community 130 - "bookingVoyage.service.js"
Cohesion: 0.44
Nodes (9): bad(), describe(), loadBookableRound(), loadRoundVoyages(), match(), mongoose, previewVoyage(), resolveVoyage() (+1 more)

### Community 131 - "user.routes.js"
Cohesion: 0.29
Nodes (8): express, router, { body, validationResult }, handle(), validateAcceptInvite, validateCreate, validateInvite, validateUpdate

### Community 132 - "FLOW Maritime ERP - Version 2 FINAL AUDIT"
Cohesion: 0.20
Nodes (9): 10. Revision history, 1. Verdict, 2. Evidence ledger (everything below was run today), 5. What is solid (verified, not assumed), 6. Residual risk register, 7. Release readiness checklist, 8. How to repeat this audit, 9. Sign-off (+1 more)

### Community 133 - "Audit — Service → Route legs → Round → Voyages (up to "set booking") — 2026-10-26"
Cohesion: 0.20
Nodes (10): Addendum 2026-10-31 — re-read of the working tree (code only, nothing probed), Audit — Service → Route legs → Round → Voyages (up to "set booking") — 2026-10-26, Design questions for the owner (Route ↔ Service), Remediation status (2026-10-26, same day — sprint `sprints/rounds-voyages-2026-10-26-sprint.md`), Reproduce, RV-38 (Medium) — Voyage delete does not look at Layer 1 bookings, tracking or unposted expenses, RV-39 (Low) — Voyage and round status are loosely coupled, RV-40 (Low) — Service code / status edits are unguarded once rounds exist (+2 more)

### Community 134 - "probes-1.js"
Cohesion: 0.22
Nodes (4): mongoose, out, path, U

### Community 135 - "agentAccounts.logic.js"
Cohesion: 0.28
Nodes (4): buildStatementRows(), categorizeLines(), expenseAccountCode(), positionDelta()

### Community 136 - "containerType.validation.js"
Cohesion: 0.28
Nodes (7): express, router, { body, validationResult }, handle(), iso, validateCreate, validateUpdate

### Community 137 - "agentAccounts.routes.js"
Cohesion: 0.25
Nodes (6): agreementRules, { body, query, validationResult }, express, handle(), money, router

### Community 138 - "billing.routes.js"
Cohesion: 0.25
Nodes (5): { body, validationResult }, express, handle(), noteValidators, router

### Community 139 - "voyageMatch.logic.test.js"
Cohesion: 0.39
Nodes (6): assert, call(), east(), run(), test, west()

### Community 140 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.25
Nodes (7): 07 — Folder Architecture, 7.1 Root Structure, 7.2 Backend Folder Structure, 7.3 Frontend Folder Structure, 7.4 File Naming Rules, 7.5 Module Registration Pattern, Logistics & Shipping SaaS — MERN Stack MVP

### Community 141 - "CLAUDE-full-reference.md"
Cohesion: 0.25
Nodes (7): CLAUDE.MD — AI Agent Master Reference, Current Sprint: 001-048 shipped | V2 049-053 + audit High fixes + "V2-only conversion" (2026-10-23): implemented in the, Last Updated: 2026-10-23 — Version 2 is now THE system (no feature flags, no V1 invoicing). Implemented, NOT committed, Logistics & Shipping SaaS — MERN Stack, | NEXT: run npm run test:int on a replica set, V2 Medium audit findings, Sprint 054 (migration, deliberately skipped), | NOT verified against a database: integration tests need a replica set (Docker was unavailable), working tree. Feature flags and the V1 invoice/payment/agent-financial-account code are REMOVED.

### Community 142 - "7. IMPACT SURVEY"
Cohesion: 0.25
Nodes (8): 7. IMPACT SURVEY, Backend validation (`booking.service.js`, `manualBooking.service.js`), Booking creation (Layer 1 & Layer 2), Business rules (`claude.md` §6 "Layer 2 Import Architecture — Sprint 026"), Capacity engine (`capacity.service.js`), Final Loading Import reconciliation, Import flow (`bookingImport.service.js`, `BookingImport.jsx`), Reports (`reports.service.js`) and Invoices (`invoice.service.js`)

### Community 143 - "BookingDetailCard.jsx"
Cohesion: 0.46
Nodes (6): BookingDetailContent(), BookingDetailPage(), BookingDetailCard(), fmt(), fmtMoney(), InfoRow()

### Community 144 - "vessel.controller.js"
Cohesion: 0.29
Nodes (6): create(), getById(), getStats(), list(), remove(), update()

### Community 145 - "07 — Tracking"
Cohesion: 0.29
Nodes (7): 07 — Tracking, Create rules (`tracking.service.createEntry`), Principle, Relationship to voyage status, Routes, Schema `TrackingHistory`, Used by

### Community 146 - "5. FRONTEND STRUCTURE"
Cohesion: 0.29
Nodes (7): 5. FRONTEND STRUCTURE, Key frontend files changed, Sprints 042-046, Key frontend files — current state, New files added in Sprint 020, New files added in Sprint 048, New files added in Sprints 035-041, New files added in Sprints 042-046

### Community 147 - "System Audit — 2026-10-20"
Cohesion: 0.29
Nodes (6): 1. Executive Summary, 3. CRITICAL, 4. HIGH, 6. Dependencies — fresh `npm audit`, 2026-10-20, 9. Recommended Order of Work, System Audit — 2026-10-20

### Community 148 - "agent.controller.js"
Cohesion: 0.33
Nodes (5): create(), getById(), list(), remove(), update()

### Community 149 - "bookingImport.controller.js"
Cohesion: 0.60
Nodes (5): downloadTemplate(), fail(), preview(), save(), templateColumns()

### Community 150 - "capacityLegs.logic.test.js"
Cohesion: 0.33
Nodes (3): assert, east, test

### Community 151 - "05 — Expenses"
Cohesion: 0.33
Nodes (6): 05 — Expenses, Attachments, Freeze rules, How expenses are used elsewhere, Schema `Expense`, Scope (derived, never stored)

### Community 152 - "4. BACKEND STRUCTURE"
Cohesion: 0.33
Nodes (6): 4. BACKEND STRUCTURE, `/backend/src/`, New/changed files, Sprint 048, New/changed files, Sprints 035-041, New/changed files, Sprints 042-046, New files added in Sprint 020

### Community 153 - "7. BUSINESS RULES"
Cohesion: 0.33
Nodes (6): 7. BUSINESS RULES, Booking Workflow, Dashboard — SuperAdmin Only, Expense File Serving — Authenticated, Final Loading Import, Tracking — Append-only

### Community 154 - "CharterHistory.jsx"
Cohesion: 0.53
Nodes (5): charterEntryError(), CharterHistory(), day(), EMPTY, money()

### Community 155 - "13. ENVIRONMENT"
Cohesion: 0.40
Nodes (5): 13. ENVIRONMENT, Backend `.env`, Backend packages (Sprint020 additions), Frontend `.env.local`, Frontend packages (Sprint020)

### Community 156 - "17. AI AGENT WORKFLOW"
Cohesion: 0.40
Nodes (5): 17. AI AGENT WORKFLOW, After completing work, Before writing any code, Implementation order, Never change

### Community 157 - "BookingsSummaryCard"
Cohesion: 0.50
Nodes (4): 3. SPRINT STATUS, Invoice Booking Selection UX + Agent/Invoice Booking Summaries (Sprint 044), BookingsSummaryCard(), fmtMoney()

### Community 158 - "FINAL CLASSIFICATION SUMMARY"
Cohesion: 0.50
Nodes (4): ✅ Confirmed Bugs (6), 💡 Enhancements (10), ❌ False Positives (2), FINAL CLASSIFICATION SUMMARY

### Community 159 - "FINAL CLASSIFICATION SUMMARY"
Cohesion: 0.50
Nodes (4): ✅ Confirmed Bugs (6), 💡 Enhancements (10), ❌ False Positives (2), FINAL CLASSIFICATION SUMMARY

### Community 160 - "frontend/README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

## Knowledge Gaps
- **14 isolated node(s):** `ADR-0002`, `ADR-0002`, `ADR-0001`, `ADR-0001`, `ADR-0004` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1264 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `showErrorToast()` connect `showErrorToast` to `PermissionContext.jsx`, `utils/constants.js`, `PageGuard`, `LoadingSpinner`, `react`, `@tanstack/react-query`, `BookingDetailCard.jsx`, `react-hot-toast`, `BookingsSummaryCard`, `VesselForm.jsx`, `BookingImport.jsx`, `ManualBookingForm.jsx`, `rbac`, `4. Findings`, `Hard rules (never break)`, `System Audit — 2026-08-03`, `00 — Architecture & Cross-cutting Rules`, `| See §6 "Version 2" and sprints/v2-code-audit-2026-10-21.md before touching any money code`, `System Audit — 2026-09-01`, `ExpenseForm.jsx`?**
  _High betweenness centrality (0.183) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `showErrorToast()` (e.g. with `Hard rules (never break)` and `Frontend conventions`) actually correct?**
  _`showErrorToast()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ADR-0002`, `ADR-0002`, `ADR-0001` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `error` be split into smaller, more focused modules?**
  _Cohesion score 0.09388335704125178 - nodes in this community are weakly interconnected._
- **Why does `Hard rules (never break)` connect `Hard rules (never break)` to `backend/src/utils/money.js`, `agentAccounts/agentAccounts.service.js`, `export/export.service.js`, `partner.service.js`, `showErrorToast`, `upload.js`, `roundLock.js`, `status`, `rbac`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Should `auth.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06623376623376623 - nodes in this community are weakly interconnected._
- **Why does `mongoose` connect `mongoose` to `bookingVoyage.service.js`, `agentAccounts/agentAccounts.service.js`, `backend/package.json`, `escapeRegex`, `partner.routes.js`, `config/constants.js`, `rounds-voyages-probe.js`, `seed-test-data.js`, `partnerSettlement.service.js`, `capacity/capacity.service.js`, `invoiceV2.service.js`, `voyage.service.js`, `permission.model.js`, `seed.js`, `vessel.service.js`, `ledger.service.js`, `reports/reports.service.js`, `bookingImport.service.js`, `round.service.js`, `booking.service.js`, `partner.service.js`, `api.int.test.js`, `masterData2.test.js`, `audit-fixes.int.test.js`, `v2.int.test.js`, `accounting.routes.js`, `booking.controller.js`, `agent.model.js`, `expenseV2.service.js`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._