# Graph Report - logistics  (2026-11-19)

## Corpus Check
- 554 files · ~443,424 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 11, .stackdump 1, .ico 1)

## Summary
- 3697 nodes · 9492 edges · 159 communities (149 shown, 10 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 1037 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bb810417`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- success
- getVoyageLabel
- rbac
- PermissionContext.jsx
- getVoyageLabel
- dashboard/page.jsx
- bookingSummary.service.js
- PageGuard
- agentAccounts/agentAccounts.service.js
- LoadingSpinner
- AgentForm.jsx
- backend/package.json
- escapeRegex.js
- partner.routes.js
- react
- config/constants.js
- 6. CRITICAL TECHNICAL RULES
- backend
- upload.js
- rounds-voyages-probe.js
- AppError
- frontend/package.json
- seed-test-data.js
- partnerSettlement.service.js
- BookingImport.jsx
- capacity/capacity.service.js
- backend/src/utils/money.js
- invoiceV2.service.js
- voyage.service.js
- auth.controller.js
- permission.model.js
- server.js
- partnerSettlement.logic.js
- vessel.service.js
- mongoose
- reports/reports.service.js
- open-items-probe.js
- CharterHistory.jsx
- bookingImport.service.js
- pickFields
- export/export.service.js
- route.service.js
- round.service.js
- ref_node_assert
- mailer.js
- booking.service.js
- AppError
- showErrorToast
- VoyageOverviewTab.jsx
- location.routes.js
- roundLock.js
- api.int.test.js
- e2e-masterdata.js
- responseHelper.js
- masterData2.test.js
- audit-fixes.int.test.js
- v2.int.test.js
- ManualBookingForm.jsx
- scripts
- expenseType.logic.js
- accounting.routes.js
- vessel.routes.js
- Capacity Engine — Audit Report (Version 2: Final Verification)
- System audit — 2026-11-19
- expense-module-analysis.md
- invoicePdfGenerator.js
- bookingItem.service.js
- paging.logic.js
- clean-coastal-locations.js
- Open items: decisions needed (plan only, 2026-11-19)
- reports-analysis.md
- scripts
- TtlCache
- Client
- 5.3 Schema Definitions
- manifest.json
- voyageRun.logic.test.js
- CodingRules.jsx
- 4. Findings
- build-location-data.js
- expense.service.js
- compilerOptions
- next.config.mjs
- postcss.config.mjs
- next
- rolling-pnl-analysis.md
- invoice.model.js
- Logistics & Shipping SaaS — MERN Stack MVP
- booking.controller.js
- status
- TrackingList.jsx
- Logistics & Shipping SaaS — MERN Stack MVP
- seed-locations.js
- 11 — Accounting: Ledger, Agent Accounts, Round Close & Partner Settlement
- 05 — Voyage Details page: plan (phase 1)
- voyage-details-probe.js
- Findings
- 03 — Rounds, Voyages & Capacity
- System Audit — 2026-08-03
- vessel.logic.js
- bookings-probe.js
- 00 — Architecture & Cross-cutting Rules
- Logistics & Shipping SaaS — MERN Stack MVP
- Logistics & Shipping SaaS — MERN Stack MVP
- 3. Findings
- | See §6 "Version 2" and sprints/v2-code-audit-2026-10-21.md before touching any money code
- Status — 2026-11-10
- city-coast-distance.js
- bookingVoyage.service.js
- 10 — Users, Auth, Roles, Permissions (RBAC) & Audit Logs
- AuditLogDetail.jsx
- 04 — Bookings
- Logistics & Shipping SaaS — MERN Stack MVP
- System Audit — 2026-09-01
- service.service.js
- containerType.service.js
- RoundRoutePicker.jsx
- voyageMatch.logic.js
- location-delete-probe.js
- Logistics & Shipping SaaS — MERN Stack MVP
- Logistics & Shipping SaaS — MERN Stack MVP
- voyage.model.js
- Logistics & Shipping SaaS — MERN Stack MVP
- expenseType.routes.js
- Logistics & Shipping SaaS
- probes-2.js
- coastal.logic.js
- getVoyagePortIds
- 5. FRONTEND STRUCTURE
- FLOW Maritime ERP - Version 2 FINAL AUDIT
- voyageSummary.logic.test.js
- CLAUDE.md — Logistics & Shipping Operations SaaS (MERN)
- voyageSummary.logic.js
- RoundRoutePicker
- partnerSettlement.test.js
- probes-1.js
- voyageMatch.logic.test.js
- Logistics & Shipping SaaS — MERN Stack MVP
- CLAUDE-full-reference.md
- server.js
- kind.logic.test.js
- 05 — Expenses
- 07 — Tracking
- vessel.logic.test.js
- 08 — Reports & Dashboard
- Addendum 2026-10-31 — re-read of the working tree (code only, nothing probed)
- VoyagePortStrip.jsx
- capacityLegs.logic.test.js
- city.model.js
- 4. BACKEND STRUCTURE
- 7. BUSINESS RULES
- Documentation Index
- 02 — Vessels
- BookingsSummaryCard
- frontend/README.md
- 2026-10-24/audit/README.md

## God Nodes (most connected - your core abstractions)
1. `success()` - 140 edges
2. `react` - 109 edges
3. `showErrorToast()` - 107 edges
4. `AppError` - 106 edges
5. `error()` - 101 edges
6. `PageGuard()` - 97 edges
7. `@tanstack/react-query` - 92 edges
8. `LoadingSpinner()` - 92 edges
9. `usePermission()` - 85 edges
10. `Button()` - 82 edges

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

## Communities (159 total, 10 thin omitted)

### Community 0 - "success"
Cohesion: 0.04
Nodes (113): create(), getById(), list(), remove(), update(), ALLOWED_CAPACITY_STATUSES, getRoundCapacity(), getVesselActiveCapacity() (+105 more)

### Community 1 - "getVoyageLabel"
Cohesion: 0.06
Nodes (43): 4.1 Voyages list page today (`/voyages`) — *code*, 4.2 Is there a voyage details page or route? — *code*, 4.3 Voyage model — every field (`voyage.model.js`) — *code*, 4.4 Booking models — every field — *code*, 4.5 Existing per-voyage totals — which collections — *code, probed*, 4.6 Revenue sources and currencies — *code, docs*, 4.7 Is the capacity engine safe to use for totals? — *code, unit, probed*, 4.8 Who can see voyages and revenue today — *code* (+35 more)

### Community 2 - "rbac"
Cohesion: 0.04
Nodes (84): auditLogger(), authMiddleware(), jwt, hasPermission(), methodToAction, rbac(), superAdminOnly(), agreementRules (+76 more)

### Community 3 - "PermissionContext.jsx"
Cohesion: 0.09
Nodes (42): Known gaps / gotchas, MEDIUM, EditInvoiceContent(), EditInvoicePage(), Can(), Modal(), PermissionContext, usePermission() (+34 more)

### Community 4 - "getVoyageLabel"
Cohesion: 0.18
Nodes (29): 1. Locate the Current Booking Report — Complete Flow, BookingRevenueDetailsPage(), BookingReport(), fmt(), BookingRevenueDetailsReport(), ExpenseReport(), fmt(), fmtAmt() (+21 more)

### Community 5 - "dashboard/page.jsx"
Cohesion: 0.10
Nodes (51): ADR-0005, 3.6 Dashboard `TopAgentsWidget`/`TopRoutesWidget` fire an unbounded query unconditionally, DashboardPage(), DashboardFilterBar(), DashboardFilterContext, DashboardFilterProvider(), EMPTY_FILTERS, useDashboardFilters() (+43 more)

### Community 6 - "bookingSummary.service.js"
Cohesion: 0.24
Nodes (16): emptyByStatus(), money(), portFilter(), portMatch(), sortRows(), STATUSES, summariseByStatus(), summariseEstimated() (+8 more)

### Community 7 - "PageGuard"
Cohesion: 0.05
Nodes (49): NewAgentPage(), AgentsPage(), AuditLogsPage(), BookingsPage(), EditExpenseContent(), EditExpensePage(), NewExpenseContent(), NewExpensePage() (+41 more)

### Community 8 - "agentAccounts/agentAccounts.service.js"
Cohesion: 0.09
Nodes (44): errorHandler(), accountIds(), advance(), agentLedgerLines(), bankCode(), bankOf(), buildStatement(), cancelCommission() (+36 more)

### Community 9 - "LoadingSpinner"
Cohesion: 0.09
Nodes (74): 4.1 Layout sketch, 4.2 States, 4.3 Tables reuse, 4.4 Quick actions, 4. UI, Frontend Analysis, 2. Status of the 9-1 Findings, InvoicesPage() (+66 more)

### Community 10 - "AgentForm.jsx"
Cohesion: 0.09
Nodes (36): 2. What changed since 2026-11-10, AgentDetailContent(), AgentDetailPage(), COLUMNS, CustomersPage(), FILTERS, TYPE_STYLES, BankAccountsRows() (+28 more)

### Community 11 - "backend/package.json"
Cohesion: 0.06
Nodes (44): author, dependencies, archiver@^7.0.1, bcryptjs@^2.4.3, compression@^1.7.4, cookie-parser@^1.4.6, cors@^2.8.5, dotenv@^16.4.5 (+36 more)

### Community 12 - "escapeRegex.js"
Cohesion: 0.13
Nodes (12): USER_STATUS, list(), list(), remove(), update(), createEntry(), getHistory(), getLatestPositions() (+4 more)

### Community 13 - "partner.routes.js"
Cohesion: 0.07
Nodes (36): express, router, { body, validationResult }, handle(), masterFields, nn, validateCreate, validateUpdate (+28 more)

### Community 14 - "react"
Cohesion: 0.07
Nodes (38): AcceptInviteInner(), AcceptInvitePage(), ForgotPasswordPage(), LoginPage(), ResetPasswordInner(), ResetPasswordPage(), DashboardLayout(), FALLBACK_NAV (+30 more)

### Community 15 - "config/constants.js"
Cohesion: 0.05
Nodes (43): AGENT_STATUS, AUDIT_ACTIONS, CONTAINER_SIZES, CONTAINER_TYPES, EXPENSE_CATEGORIES, EXPENSE_COST_CLASSIFICATIONS, PAYMENT_METHODS, SERVICE_APPLICABILITY (+35 more)

### Community 16 - "6. CRITICAL TECHNICAL RULES"
Cohesion: 0.04
Nodes (47): 6. CRITICAL TECHNICAL RULES, AppError vs legacy throws, Audit logger — fire-and-forget, Authentication (Sprint020 — BREAKING CHANGE), autoNumber.js, Booking Import Table — Responsive Overflow Containment (Sprint 032), Booking POL/POD Server-Derivation + Round→Voyage Cascading Filters (Sprint 030), Booking Primary Key (Sprint 021) (+39 more)

### Community 17 - "backend"
Cohesion: 0.06
Nodes (36): NEXT_PUBLIC_API_URL, build, condition, container_name, env_file, environment, healthcheck, networks (+28 more)

### Community 18 - "upload.js"
Cohesion: 0.19
Nodes (13): compressImage(), compressUpload(), fs, MAGIC_BYTES, matchesDeclaredType(), maxSizeMB, multer, multerBase (+5 more)

### Community 19 - "rounds-voyages-probe.js"
Cohesion: 0.11
Nodes (9): cleanup, Client, out, RUN, mongoose, routeSchema, mongoose, routeLegSchema (+1 more)

### Community 20 - "AppError"
Cohesion: 0.11
Nodes (25): create(), getAll(), list(), NOT_WRITABLE, update(), missingMappings(), assertMappings(), create() (+17 more)

### Community 21 - "frontend/package.json"
Cohesion: 0.06
Nodes (36): eslintConfig, dependencies, axios@^1.7.2, chart.js@^4.5.1, lottie-react@^3.1.2, next@^16.4.2, react@19.2.4, react-dom@19.2.4 (+28 more)

### Community 22 - "seed-test-data.js"
Cohesion: 0.15
Nodes (31): assertSafeTarget(), BOX_PREFIX, boxNo(), COMMODITIES, daysAgo(), daysAhead(), expense(), fullExpense() (+23 more)

### Community 23 - "partnerSettlement.service.js"
Cohesion: 0.08
Nodes (36): cancel(), expenseSchema, mongoose, hardDelete(), mongoose, vesselPartnerSchema, jvReserveMovementSchema, mongoose (+28 more)

### Community 24 - "BookingImport.jsx"
Cohesion: 0.15
Nodes (19): 6. Frontend Correctness & Consistency, BookingImportPage(), ExportPage(), useBookingLookups(), BookingImport(), EditableCell(), EXCEL_COLUMN_MAP, parseExcel() (+11 more)

### Community 25 - "capacity/capacity.service.js"
Cohesion: 0.18
Nodes (18): cargoRowSchema, manualBookingSchema, mongoose, ALLOWED_CAPACITY_STATUSES, cacheKey(), computeRoundCapacity(), computeRoutePreview(), computeVesselActiveCapacity() (+10 more)

### Community 26 - "backend/src/utils/money.js"
Cohesion: 0.12
Nodes (22): buildStatementRows(), categorizeLines(), expenseAccountCode(), positionDelta(), checkPaidBy(), convertToFda(), inTransaction(), isDup() (+14 more)

### Community 27 - "invoiceV2.service.js"
Cohesion: 0.06
Nodes (50): balanceMinor(), buildLine(), deriveStatus(), groupBookingsIntoItems(), bookingItemSchema, invoiceLineSchema, invoiceSettlementSchema, mongoose (+42 more)

### Community 28 - "voyage.service.js"
Cohesion: 0.14
Nodes (25): bad(), scheduleWarnings(), toTime(), validateVoyageState(), allocateSequence(), cancelVoyageBookings(), createVoyage(), getRoundRoutePorts() (+17 more)

### Community 29 - "auth.controller.js"
Cohesion: 0.10
Nodes (23): crypto, csrfProtection(), csrfTokenFor(), EXEMPT_PATHS, SAFE_METHODS, changePassword(), cookieOptions(), forgotPassword() (+15 more)

### Community 30 - "permission.model.js"
Cohesion: 0.28
Nodes (7): MODULES, actionSchema, mongoose, permissionSchema, ACTION_KEYS, getByRoleId(), saveByRoleId()

### Community 31 - "server.js"
Cohesion: 0.11
Nodes (20): connectDB(), mongoose, migrate(), MODELS, mongoose, DRY, ALL, bcrypt (+12 more)

### Community 32 - "partnerSettlement.logic.js"
Cohesion: 0.21
Nodes (14): computePositions(), computeProfit(), settleRound(), shareProfit(), suggestTransfers(), postClosingEntry(), getRoundPnL(), voyageDurationDays() (+6 more)

### Community 33 - "vessel.service.js"
Cohesion: 0.16
Nodes (16): assertMasterRules(), checkShares(), clearParticulars(), create(), deleteParticularsFile(), fs, getAll(), list() (+8 more)

### Community 34 - "mongoose"
Cohesion: 0.05
Nodes (37): ALLOW_PROD, APPLY, argv, ci, mongoose, TARGETS, handlingChargeSchema, mongoose (+29 more)

### Community 35 - "reports/reports.service.js"
Cohesion: 0.24
Nodes (14): classifyRevenueSizeBucket(), dateRange(), getBookingReport(), getBookingRevenueDetails(), getExpenseReport(), getRevenueReport(), getVoyagePerformance(), ADR-0001 (+6 more)

### Community 36 - "open-items-probe.js"
Cohesion: 0.15
Nodes (7): Client, freeVessel(), idOf(), mongoose, results, roundFixture(), steps

### Community 37 - "CharterHistory.jsx"
Cohesion: 0.53
Nodes (5): charterEntryError(), CharterHistory(), day(), EMPTY, money()

### Community 38 - "bookingImport.service.js"
Cohesion: 0.13
Nodes (28): analyseDischarge(), analyseRows(), assertImportAllowed(), ExcelJS, inTransaction(), loadExisting(), mongoose, norm() (+20 more)

### Community 39 - "pickFields"
Cohesion: 0.17
Nodes (18): coastalCountryError(), assertCoastal(), assertLocationUnused(), countRouteLegsReferencing(), createCity(), createCountry(), createPort(), createTerminal() (+10 more)

### Community 40 - "export/export.service.js"
Cohesion: 0.08
Nodes (29): exportZip(), addMetadataSheet(), ALLOWED_MODULES, archiver, buildExcelBuffer(), buildZipStream(), COLUMNS, ExcelJS (+21 more)

### Community 41 - "route.service.js"
Cohesion: 0.19
Nodes (10): mongoose, validateLegs(), assertLegShape(), assertNoConsecutivePorts(), bad(), checkLegReferences(), collectRefIds(), isId() (+2 more)

### Community 42 - "round.service.js"
Cohesion: 0.11
Nodes (26): bookingSchema, mongoose, hardDelete(), assertInitialStatus(), buildEditedLegs(), buildRouteSnapshot(), CANCELLABLE_VOYAGE_STATUSES, crypto (+18 more)

### Community 43 - "ref_node_assert"
Cohesion: 0.07
Nodes (20): assert, test, assert, test, assert, test, assert, test (+12 more)

### Community 44 - "mailer.js"
Cohesion: 0.18
Nodes (18): bcrypt, changePassword(), crypto, forgotPassword(), getMe(), jwt, login(), resetPassword() (+10 more)

### Community 45 - "booking.service.js"
Cohesion: 0.10
Nodes (38): required, validate(), create(), DISCHARGE_COLUMNS, dischargeFilter(), exportDischargeList(), getById(), hardDelete() (+30 more)

### Community 46 - "AppError"
Cohesion: 0.09
Nodes (41): create(), descendantIds(), FIELDS, HEADER_FIELDS, list(), prefixOf(), remove(), update() (+33 more)

### Community 47 - "showErrorToast"
Cohesion: 0.05
Nodes (72): AccountingRoute(), COLUMNS, ContainerTypesPage(), FILTERS, CATEGORY_STYLES, COLUMNS, ExpenseTypesPage(), FILTERS (+64 more)

### Community 48 - "VoyageOverviewTab.jsx"
Cohesion: 0.22
Nodes (14): Card(), fmt(), NEXT_NOTE, num(), STATUS_ORDER, StatusChips(), usd(), VoyageKpiCards() (+6 more)

### Community 49 - "location.routes.js"
Cohesion: 0.19
Nodes (14): express, router, { body, validationResult }, currency, handle(), portCode, validateCityCreate, validateCityUpdate (+6 more)

### Community 50 - "roundLock.js"
Cohesion: 0.20
Nodes (22): assertBookingsRoundOpen(), assertDocRoundOpen(), assertExpenseRoundOpen(), assertInvoiceRoundOpen(), assertItemsRoundOpen(), assertRoundOpen(), assertRoundOpenTx(), assertRoundsOpen() (+14 more)

### Community 51 - "api.int.test.js"
Cohesion: 0.13
Nodes (6): assert, bcrypt, { describe, it, before, after }, mongoose, path, { spawn }

### Community 52 - "e2e-masterdata.js"
Cohesion: 0.19
Nodes (6): brief(), check(), Client, expectStatus(), results, RUN

### Community 53 - "responseHelper.js"
Cohesion: 0.05
Nodes (48): BOOKING_STATUS, ROUND_STATUS, express, router, { body, validationResult }, handle(), validateCreate, validateUpdate (+40 more)

### Community 54 - "masterData2.test.js"
Cohesion: 0.36
Nodes (6): toAccountFields(), TYPE_MAP, validateChart(), seedChart(), assert, test

### Community 55 - "audit-fixes.int.test.js"
Cohesion: 0.19
Nodes (10): assert, { describe, it, before, after }, issueInvoice(), mkBookings(), mkRound(), mongoose, postPayable(), U (+2 more)

### Community 56 - "v2.int.test.js"
Cohesion: 0.16
Nodes (8): assert, { describe, it, before, after }, mkBookings(), mkRound(), mongoose, uniq(), USER, USER_ID

### Community 57 - "ManualBookingForm.jsx"
Cohesion: 0.08
Nodes (37): BookingDetailContent(), BookingDetailPage(), ManualBookingDetailPage(), NewManualBookingPage(), VoyageDetailPage(), useVoyage(), useVoyageSummary(), BookingDetailCard() (+29 more)

### Community 58 - "scripts"
Cohesion: 0.15
Nodes (13): scripts, dev, migrate:hard-delete-cleanup, migrate:masterdata, migrate:rounds-voyages, migrate:seed-accounts, seed, seed:chart (+5 more)

### Community 59 - "expenseType.logic.js"
Cohesion: 0.12
Nodes (15): contactFromLegacy(), DRY, expenseAccountCodeFor(), reports, steps, ALLOWED_SCOPES, LEVEL_LABEL, levelFromScopes() (+7 more)

### Community 60 - "accounting.routes.js"
Cohesion: 0.21
Nodes (11): { body, validationResult }, express, handle(), router, shared, ACCOUNT_TYPES, accountSchema, ALLOCATION_LEVELS (+3 more)

### Community 61 - "vessel.routes.js"
Cohesion: 0.20
Nodes (10): OWNERSHIP_TYPES, validateShares, express, router, { body, validationResult }, handle(), masterFields, nn (+2 more)

### Community 62 - "Capacity Engine — Audit Report (Version 2: Final Verification)"
Cohesion: 0.04
Nodes (52): capacityEnforcement(), computeVoyagePreview(), resolveTEU(), BUG-003 — L1 Fallback Creates Phantom Load/Discharge Events Instead of Excluding, BUG-004 — computeVoyagePreview Only Checks the Load Voyage, Not Transited Voyages, BUG-005 — previewCapacity API Endpoint Calls Non-Existent computeSegmentPreview, BUG-006 — Voyage Sorting Relies on sequence Without a Unique Compound Index, BUG-007 — utilisationPct Uses Math.round, Can Show 100% When Vessel Has Remaining Capacity (+44 more)

### Community 63 - "System audit — 2026-11-19"
Cohesion: 0.05
Nodes (32): Audit folder, 1. Verification status (be careful with this), 2.1 Overview, 2.2 Step by step, 2.3 Voyage assignment (the new core rule), 2.4 Who can do what, 2.5 Capacity (unchanged, R10), 2. The current flow (+24 more)

### Community 64 - "expense-module-analysis.md"
Cohesion: 0.05
Nodes (37): Additional scenarios implied by the current architecture (not explicitly, API endpoints, Architecture Risks, Backend Analysis, Backend workflow, Business Questions, Business Scenarios, Complete expense lifecycle, as it exists today (+29 more)

### Community 65 - "invoicePdfGenerator.js"
Cohesion: 0.35
Nodes (11): C, fillBox(), fmtDate(), fmtMoney(), fmtNum(), generateInvoicePdf(), hLine(), PDFDocument (+3 more)

### Community 66 - "bookingItem.service.js"
Cohesion: 0.17
Nodes (12): computeCommission(), 06 — Invoices (V2 billing), `BookingItem` (`billing.models.js`) — derived pricing group, Commission rules (`computeCommission`), Data model, `Invoice` (shared collection, `invoice.model.js`), `InvoiceLine`, `InvoiceSettlement` (+4 more)

### Community 67 - "paging.logic.js"
Cohesion: 0.22
Nodes (11): listCities(), listCountries(), listPorts(), listTerminals(), paged(), idParam(), mongoose, searchFilter() (+3 more)

### Community 68 - "clean-coastal-locations.js"
Cohesion: 0.16
Nodes (16): ALLOW_PROD, APPLY, applyRemovals(), argv, assertMayApply(), childCount(), CONFIRM_DB, countBy() (+8 more)

### Community 69 - "Open items: decisions needed (plan only, 2026-11-19)"
Cohesion: 0.15
Nodes (12): BK-03: reports and invoice snapshots vs the booking's own POL/POD, BK-04: round leg edits do not warn about bookings with stale leg keys, BK-05: a booking cannot be moved to another voyage, Decisions I need from you, F-09: a `roles:update` holder can grant any permission, FL-05: Final Loading -> Cancelled is unreachable through the API/UI, Open items: decisions needed (plan only, 2026-11-19), RV-40: service code editable once rounds exist (+4 more)

### Community 70 - "reports-analysis.md"
Cohesion: 0.06
Nodes (35): Booking Report Review (Sprint 034 — for reference, not re-analyzed in depth), Booking Revenue Details Review (Sprint 034 — for reference), Cross Module Consistency, Current Reporting Architecture, Dashboard Analysis, Duplicate calculations, Executive Summary, Expense Report (+27 more)

### Community 71 - "scripts"
Cohesion: 0.22
Nodes (9): devDependencies, concurrently@^9.2.4, scripts, build, dev, dev:backend, dev:frontend, start (+1 more)

### Community 72 - "TtlCache"
Cohesion: 0.13
Nodes (15): acceptInvite(), bcrypt, create(), crypto, getById(), invalidateUser(), inviteUser(), list() (+7 more)

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
Cohesion: 0.14
Nodes (15): assertBookingSource(), assertRoundBookable(), Invariants (enforced in the services, not only the UI), FL-06: a round can be Completed with live bookings, 4. Findings, FL-02 (High) — Import save skips the bookable checks  *(code)*, FL-04 (High) — Final Loading import cancels bookings it failed to save  *(code)*, FL-05 (Medium) — Final Loading → Cancelled is unreachable  *(code)* (+7 more)

### Community 79 - "build-location-data.js"
Cohesion: 0.08
Nodes (20): argv, cells, cityIndex, cityNames, COAST, coastKm(), { Country: LibCountry, City: LibCity }, distSeg() (+12 more)

### Community 81 - "expense.service.js"
Cohesion: 0.16
Nodes (18): assertTypeFitsScope(), create(), deleteFile(), deriveScope(), fs, getById(), hardDelete(), ADR-0002 (+10 more)

### Community 85 - "next"
Cohesion: 0.17
Nodes (9): ServiceDetailContent(), ServiceDetailPage(), Row(), ServiceDetailPage(), tabs, ServiceForm(), fmt(), ServiceRounds() (+1 more)

### Community 87 - "rolling-pnl-analysis.md"
Cohesion: 0.08
Nodes (25): Calculation Analysis — Every KPI, Combined, Current Business Purpose, Current expense assumptions, Current expense relationships, Current Filtering Options, Current Grouping Logic, Current limitations (Expense side) (+17 more)

### Community 88 - "invoice.model.js"
Cohesion: 0.10
Nodes (14): INVOICE_STATUS, INVOICE_TYPES, billToSchema, invoiceSchema, lineItemSchema, mongoose, exchangeRateSchema, mongoose (+6 more)

### Community 89 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.08
Nodes (23): 03 — Business Rules, 3.10 Deletion Rules, 3.11 Status Transition Rules, 3.1 Master Data Rules, 3.2 Route Rules, 3.3 Round Rules, 3.4 Voyage Auto-Generation Rules, 3.5 Booking Rules (+15 more)

### Community 90 - "booking.controller.js"
Cohesion: 0.15
Nodes (28): create(), dischargeList(), exportDischargeList(), fail(), getById(), getLookups(), getVoyagePorts(), list() (+20 more)

### Community 91 - "status"
Cohesion: 0.08
Nodes (30): status(), 01 — Master Data, Agent agreements (`modules/agreements`), Agents/Customers (`modules/customers`, `/customers`, perm `customers`) — the Customers tab, renamed 2026-10-27, Container types (`modules/containerTypes`, `/container-types`), Expense types and categories (`modules/expenseTypes`, `/expense-types`), Invoice Services (`modules/invoiceServices`, `/invoice-services`, perm `invoiceServices`) — Masters → Services, Partners (`modules/partners`, `/partners`) (+22 more)

### Community 92 - "TrackingList.jsx"
Cohesion: 0.18
Nodes (13): TrackingPage(), fmtDT(), InfoRow(), TRACKING_COLORS, TrackingDetailModal(), fmt(), STATUS_COLORS, TrackingHistoryTable() (+5 more)

### Community 93 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.10
Nodes (20): 06 — API Planning, 6.10 Rounds, 6.11 Voyages, 6.12 Bookings, 6.13 Expenses, 6.14 Invoices, 6.15 Tracking, 6.16 Reports (+12 more)

### Community 94 - "seed-locations.js"
Cohesion: 0.13
Nodes (12): country-state-city@^3.2.1, { Country: LibCountry }, DRY, insert(), lc(), norm(), run(), countrySchema (+4 more)

### Community 95 - "11 — Accounting: Ledger, Agent Accounts, Round Close & Partner Settlement"
Cohesion: 0.15
Nodes (13): 11 — Accounting: Ledger, Agent Accounts, Round Close & Partner Settlement, 1. Ledger (`modules/ledger`), 3. Round close and partner settlement (`/round-accounting`), 4. Tests, 6-digit master chart (2026-10-27), Chart of accounts (seeded by `accounts.seed.js`, idempotent), Close checklist, FX (`fx.service.js`) (+5 more)

### Community 96 - "05 — Voyage Details page: plan (phase 1)"
Cohesion: 0.12
Nodes (19): voyageStatusTotals(), getDetail(), 05 — Voyage Details page: plan (phase 1), 10. Later phases (not planned, not built), 11. Decisions for the owner, 12. What I checked vs what I assumed, 2. Definitions: every number on the page, 3.1 Endpoints (+11 more)

### Community 97 - "voyage-details-probe.js"
Cohesion: 0.15
Nodes (4): Client, mongoose, results, STATUSES

### Community 98 - "Findings"
Cohesion: 0.08
Nodes (26): saveLegs(), Audit — Service → Route legs → Round → Voyages (up to "set booking") — 2026-10-26, Design questions for the owner (Route ↔ Service), Findings, Proposed fix sprint (no code written yet beyond RV-00), Remediation status (2026-10-26, same day — sprint `sprints/rounds-voyages-2026-10-26-sprint.md`), Reproduce, RV-00 (High) — FIXED 2026-10-26 — vessel without reefer plugs could not be created (+18 more)

### Community 99 - "03 — Rounds, Voyages & Capacity"
Cohesion: 0.11
Nodes (19): 03 — Rounds, Voyages & Capacity, Capacity engine (per leg, rewritten 2026-11-10 — fixes FL-01 / BK-02), Concepts, Creating a voyage (`voyage.service.createVoyage`), Database changes / deployment, Deleting, Known limitations, Related modules (+11 more)

### Community 100 - "System Audit — 2026-08-03"
Cohesion: 0.11
Nodes (17): 1.1 NoSQL injection in password reset → account takeover, 1. CRITICAL, 2.1 `Round.hardDelete`'s new Voyage cascade orphans Layer-1 bookings and Expenses, 2.2 Discharge-import RBAC gap — wrong permission gates a cross-agent bulk mutation, 2. HIGH, 3.1 File upload accepts spoofed Content-Type — no magic-byte validation, 3.3 Payment History table no longer shows the per-booking "Applied To" breakdown, contradicting the sprint's own comment, 3.4 Bulk-delete selection state not reset across BookingList.jsx tabs (+9 more)

### Community 101 - "vessel.logic.js"
Cohesion: 0.26
Nodes (12): blank(), CHARTER_TYPES, charterDateError(), hireRateFromMinor(), hireRateToMinor(), missingRequired(), prepareCharterHistory(), present() (+4 more)

### Community 102 - "bookings-probe.js"
Cohesion: 0.16
Nodes (4): cleanup, Client, out, RUN

### Community 104 - "00 — Architecture & Cross-cutting Rules"
Cohesion: 0.12
Nodes (17): 00 — Architecture & Cross-cutting Rules, Audit logger (`middleware/auditLogger.js`), Authentication (`middleware/auth.js`), Backend layout, Commands, CSRF (`middleware/csrf.js`), Data flow at a glance, Delete guards (`utils/dependents.js`) (+9 more)

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
Cohesion: 0.09
Nodes (22): 10. AUTO-NUMBER FORMATS, 11. RBAC — CURRENT STATE, 12. API QUICK REFERENCE, 13. ENVIRONMENT, 14. DEMO CREDENTIALS, 15. VPS DEPLOYMENT, 16. KNOWN ISSUES / GOTCHAS, 17. AI AGENT WORKFLOW (+14 more)

### Community 109 - "Status — 2026-11-10"
Cohesion: 0.12
Nodes (16): 2026-11-02 — Accounting chart CRUD, Audit (2026-10-26), Audit 2026-11-10, Audit open items, part 1 (2026-11-19, nothing committed), Docs sync (2026-10-31), Follow-up 2026-11-10 (after the audit), How to use, Locations: sea / coastal only (2026-11-19) (+8 more)

### Community 110 - "city-coast-distance.js"
Cohesion: 0.16
Nodes (14): argv, buildIndex(), COAST, { Country: LibCountry, City: LibCity }, CUTOFFS, distanceToCoast(), distSegKm(), fs (+6 more)

### Community 111 - "bookingVoyage.service.js"
Cohesion: 0.22
Nodes (15): mongoose, move(), moveBooking(), moveManualBooking(), bad(), describe(), loadBookableRound(), loadRoundVoyages() (+7 more)

### Community 112 - "10 — Users, Auth, Roles, Permissions (RBAC) & Audit Logs"
Cohesion: 0.25
Nodes (8): 10 — Users, Auth, Roles, Permissions (RBAC) & Audit Logs, Audit logs (`/audit-logs`, perm `auditLogs`), Authentication flow (`/auth`), Frontend, Roles (`/roles`, perm `roles`), Schemas, Seeded roles (`npm run seed`), Users (`/users`, perm `users`)

### Community 113 - "AuditLogDetail.jsx"
Cohesion: 0.27
Nodes (9): AuditLogDetailPage(), ACTION_STYLE, AuditLogDetail(), fmt(), getDiff(), MODULE_ROUTES, renderValue(), ValueDisplay() (+1 more)

### Community 114 - "04 — Bookings"
Cohesion: 0.13
Nodes (15): 04 — Bookings, Create / update / delete rules, Discharge list (screen + Excel), `discharge` — match-only (reworked), Excel import (`bookingImport.service.js`, `importRules.logic.js`), Layer 1 `kind`: Estimate or Allocation (2026-11-19), Moving a booking, cancelling a loaded one, report ports (2026-11-19), Partner label and partner users (+7 more)

### Community 115 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.15
Nodes (12): 01 — Project Overview, 1.1 System Description, 1.2 System Purpose, 1.3 Technology Stack, 1.4 Architecture Type, 1.5 Users of the System, 1.6 Key Business Entities, 1.7 MVP Deliverables (+4 more)

### Community 116 - "System Audit — 2026-09-01"
Cohesion: 0.17
Nodes (11): 2.1 Backend module inventory (23), 2.2 Frontend feature modules (18) / App Router routes (42 segments), 2.3 The core domain model (condensed — see `CLAUDE.md` for full detail), 2. System Architecture, 3. The Uncommitted Working-Tree Change (WIP, not yet in `CLAUDE.md`), 4. Security & RBAC, 7. Performance, Caching & Dependencies, 8. Audit Findings — Ranked High → Medium → Low (+3 more)

### Community 117 - "service.service.js"
Cohesion: 0.26
Nodes (7): create(), mongoose, update(), codeChanged(), lockedMessage(), assert, test

### Community 118 - "containerType.service.js"
Cohesion: 0.39
Nodes (7): assertIsoFree(), clean(), create(), getAll(), list(), update(), teuFactorForSize()

### Community 119 - "RoundRoutePicker.jsx"
Cohesion: 0.35
Nodes (10): FixedVoyageRoute(), FreeRoutePicker(), portLabel(), callIndex(), defaultPolIndex(), fixedRouteStart(), podChoices(), polChoices() (+2 more)

### Community 120 - "voyageMatch.logic.js"
Cohesion: 0.32
Nodes (11): bad(), checkChosenVoyage(), compare(), DEAD_STATUS, DEPARTED_STATUS, findVoyageForBooking(), matchRun(), notDeparted() (+3 more)

### Community 121 - "location-delete-probe.js"
Cohesion: 0.24
Nodes (3): Client, mongoose, results

### Community 122 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.17
Nodes (11): 02 — System Workflow, 2.1 Main Business Flow, 2.2 Master Data Workflow, 2.3 Round Creation Workflow, 2.4 Voyage Lifecycle, 2.5 Booking Workflow, 2.6 Expense Workflow, 2.7 Vessel Tracking Workflow (+3 more)

### Community 123 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.17
Nodes (11): 09 — Security Rules, 9.1 Authentication, 9.2 Authorization (RBAC), 9.3 Input Validation, 9.4 Data Protection, 9.5 API Security, 9.6 File Upload Security, 9.7 Error Handling & Information Disclosure (+3 more)

### Community 124 - "voyage.model.js"
Cohesion: 0.20
Nodes (9): VOYAGE_DIRECTION, VOYAGE_STATUS, mongoose, portCallSchema, voyageSchema, { body, validationResult }, handle(), validateCreate (+1 more)

### Community 125 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.18
Nodes (10): 04 — Module Relationships, 4.1 Entity Relationship Overview, 4.2 Detailed Relationship Table, 4.3 One-to-One Relationships, 4.4 One-to-Many Relationships, 4.5 Many-to-One Relationships, 4.6 Reference Directions, 4.7 Cascade / Deletion Strategy (+2 more)

### Community 126 - "expenseType.routes.js"
Cohesion: 0.22
Nodes (8): { body, validationResult }, express, router, { body, validationResult }, handle(), mapping, validateCreate, validateUpdate

### Community 127 - "Logistics & Shipping SaaS"
Cohesion: 0.18
Nodes (10): Backend (`backend/.env`), Development Notes, Environment Variables, Frontend (`frontend/.env.local`), Logistics & Shipping SaaS, Prerequisites, Project Structure, Setup — Backend (+2 more)

### Community 128 - "probes-2.js"
Cohesion: 0.20
Nodes (4): mongoose, out, path, U

### Community 129 - "coastal.logic.js"
Cohesion: 0.29
Nodes (9): ESTUARY_PORT_CODES, isLandlockedCountry(), KNOWN_LOCODE_FIXES, LANDLOCKED, LANDLOCKED_COUNTRY_CODES, norm(), portReviewFlags(), assert (+1 more)

### Community 130 - "getVoyagePortIds"
Cohesion: 0.04
Nodes (52): getVoyagePortIds(), getVoyagePorts(), previewImport(), BUG-002 — portAsFrom/portAsTo Maps Overwrite Repeated Ports in Circular Routes, BUG-002 — portAsFrom/portAsTo Maps Overwrite Repeated Ports in Circular Routes, 1. HOW THE VOYAGE SELECTOR CURRENTLY WORKS, 1. HOW THE VOYAGE SELECTOR CURRENTLY WORKS, 2. HOW POL/POD ARE POPULATED — THE ROOT ISSUE (+44 more)

### Community 131 - "5. FRONTEND STRUCTURE"
Cohesion: 0.29
Nodes (7): 5. FRONTEND STRUCTURE, Key frontend files changed, Sprints 042-046, Key frontend files — current state, New files added in Sprint 020, New files added in Sprint 048, New files added in Sprints 035-041, New files added in Sprints 042-046

### Community 132 - "FLOW Maritime ERP - Version 2 FINAL AUDIT"
Cohesion: 0.11
Nodes (18): 10. Revision history, 1. Verdict, 2. Evidence ledger (everything below was run today), 3. NEW findings from the final audit, 5. What is solid (verified, not assumed), 6. Residual risk register, 7. Release readiness checklist, 8. How to repeat this audit (+10 more)

### Community 134 - "CLAUDE.md — Logistics & Shipping Operations SaaS (MERN)"
Cohesion: 0.18
Nodes (10): Architecture map, Before coding, CLAUDE.md — Logistics & Shipping Operations SaaS (MERN), Commands, Docs & history, Env & demo, Locations (2026-11-19), Module docs (`docs/`) (+2 more)

### Community 135 - "voyageSummary.logic.js"
Cohesion: 0.22
Nodes (5): AT_PORT, LIVE, nextPort(), revenueCard(), view()

### Community 136 - "RoundRoutePicker"
Cohesion: 0.22
Nodes (10): canBook(), Voyage Details (2026-11-19, Sprints A, B and C done; browser pass not done), Voyage Details page (`/voyages/[id]`, 2026-11-19; plan `docs/05-voyage-details-plan.md`), 1. Current state (checked), 6.1 Unit tests (`npm test`, pure logic) — `backend/test/voyageSummary.logic.test.js` and additions to `bookingSummary.logic.test.js`, 6.2 HTTP probe — new `backend/scripts/audit-probes/voyage-details-probe.js` (test DB, dev server; prints results, **does not write a result file under `backend/`**, see S-16), 6.3 Manual browser checklist (for you; I have no browser), 6. Tests (+2 more)

### Community 137 - "partnerSettlement.test.js"
Cohesion: 0.22
Nodes (9): assert, coll, ledger(), M(), paid, shares, test, Accounting (Masters → Accounting, `/accounting`, module `accounting`) and chart of accounts (+1 more)

### Community 138 - "probes-1.js"
Cohesion: 0.22
Nodes (4): mongoose, out, path, U

### Community 139 - "voyageMatch.logic.test.js"
Cohesion: 0.39
Nodes (6): assert, call(), east(), run(), test, west()

### Community 140 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.25
Nodes (7): 07 — Folder Architecture, 7.1 Root Structure, 7.2 Backend Folder Structure, 7.3 Frontend Folder Structure, 7.4 File Naming Rules, 7.5 Module Registration Pattern, Logistics & Shipping SaaS — MERN Stack MVP

### Community 141 - "CLAUDE-full-reference.md"
Cohesion: 0.25
Nodes (7): CLAUDE.MD — AI Agent Master Reference, Current Sprint: 001-048 shipped | V2 049-053 + audit High fixes + "V2-only conversion" (2026-10-23): implemented in the, Last Updated: 2026-10-23 — Version 2 is now THE system (no feature flags, no V1 invoicing). Implemented, NOT committed, Logistics & Shipping SaaS — MERN Stack, | NEXT: run npm run test:int on a replica set, V2 Medium audit findings, Sprint 054 (migration, deliberately skipped), | NOT verified against a database: integration tests need a replica set (Docker was unavailable), working tree. Feature flags and the V1 invoice/payment/agent-financial-account code are REMOVED.

### Community 142 - "server.js"
Cohesion: 0.22
Nodes (8): app, compression, cookieParser, cors, express, helmet, morgan, shutdown()

### Community 143 - "kind.logic.test.js"
Cohesion: 0.22
Nodes (5): assert, calls, path, { pathToFileURL }, test

### Community 144 - "05 — Expenses"
Cohesion: 0.29
Nodes (7): 05 — Expenses, Attachments, Freeze rules, How expenses are used elsewhere, Routes, Schema `Expense`, Scope (derived, never stored)

### Community 145 - "07 — Tracking"
Cohesion: 0.29
Nodes (7): 07 — Tracking, Create rules (`tracking.service.createEntry`), Principle, Relationship to voyage status, Routes, Schema `TrackingHistory`, Used by

### Community 146 - "vessel.logic.test.js"
Cohesion: 0.40
Nodes (3): assert, NOW, test

### Community 147 - "08 — Reports & Dashboard"
Cohesion: 0.40
Nodes (5): 08 — Reports & Dashboard, Dashboard (`/dashboard`), Export of report data, Frontend, Revenue definition (system-wide)

### Community 148 - "Addendum 2026-10-31 — re-read of the working tree (code only, nothing probed)"
Cohesion: 0.40
Nodes (5): Addendum 2026-10-31 — re-read of the working tree (code only, nothing probed), RV-38 (Medium) — Voyage delete does not look at Layer 1 bookings, tracking or unposted expenses, RV-39 (Low) — Voyage and round status are loosely coupled, RV-40 (Low) — Service code / status edits are unguarded once rounds exist, RV-41 (Info) — Route ports for manual voyages

### Community 149 - "VoyagePortStrip.jsx"
Cohesion: 0.67
Nodes (3): fmt(), STATE_LABEL, VoyagePortStrip()

### Community 150 - "capacityLegs.logic.test.js"
Cohesion: 0.33
Nodes (3): assert, east, test

### Community 152 - "4. BACKEND STRUCTURE"
Cohesion: 0.33
Nodes (6): 4. BACKEND STRUCTURE, `/backend/src/`, New/changed files, Sprint 048, New/changed files, Sprints 035-041, New/changed files, Sprints 042-046, New files added in Sprint 020

### Community 153 - "7. BUSINESS RULES"
Cohesion: 0.33
Nodes (6): 7. BUSINESS RULES, Booking Workflow, Dashboard — SuperAdmin Only, Expense File Serving — Authenticated, Final Loading Import, Tracking — Append-only

### Community 154 - "Documentation Index"
Cohesion: 0.67
Nodes (3): Conventions used in these docs, Documentation Index, Reading order

### Community 155 - "02 — Vessels"
Cohesion: 0.29
Nodes (7): 02 — Vessels, Capacity endpoints (module `capacity`), Partner shares (`modules/partners/vesselPartner.model.js`, `vesselShares.js`), Related, Routes, Rules, Stats (`GET /vessels/:id/stats`, `getVesselStats`)

### Community 157 - "BookingsSummaryCard"
Cohesion: 0.50
Nodes (4): 3. SPRINT STATUS, Invoice Booking Selection UX + Agent/Invoice Booking Summaries (Sprint 044), BookingsSummaryCard(), fmtMoney()

### Community 160 - "frontend/README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

## Knowledge Gaps
- **14 isolated node(s):** `ADR-0002`, `ADR-0002`, `ADR-0001`, `ADR-0001`, `ADR-0004` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1423 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `mongoose` connect `mongoose` to `bookingSummary.service.js`, `agentAccounts/agentAccounts.service.js`, `backend/package.json`, `escapeRegex.js`, `partner.routes.js`, `server.js`, `config/constants.js`, `rounds-voyages-probe.js`, `seed-test-data.js`, `partnerSettlement.service.js`, `city.model.js`, `capacity/capacity.service.js`, `backend/src/utils/money.js`, `invoiceV2.service.js`, `voyage.service.js`, `permission.model.js`, `server.js`, `vessel.service.js`, `reports/reports.service.js`, `open-items-probe.js`, `bookingImport.service.js`, `route.service.js`, `round.service.js`, `booking.service.js`, `AppError`, `api.int.test.js`, `audit-fixes.int.test.js`, `v2.int.test.js`, `accounting.routes.js`, `paging.logic.js`, `clean-coastal-locations.js`, `expense.service.js`, `invoice.model.js`, `booking.controller.js`, `seed-locations.js`, `voyage-details-probe.js`, `city-coast-distance.js`, `bookingVoyage.service.js`, `service.service.js`, `location-delete-probe.js`, `voyage.model.js`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `showErrorToast()` (e.g. with `Hard rules (never break)` and `Frontend conventions`) actually correct?**
  _`showErrorToast()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ADR-0002`, `ADR-0002`, `ADR-0001` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `success` be split into smaller, more focused modules?**
  _Cohesion score 0.041621943947525344 - nodes in this community are weakly interconnected._
- **Why does `showErrorToast()` connect `showErrorToast` to `PermissionContext.jsx`, `System Audit — 2026-08-03`, `PageGuard`, `export/export.service.js`, `00 — Architecture & Cross-cutting Rules`, `LoadingSpinner`, `AgentForm.jsx`, `react`, `10 — Users, Auth, Roles, Permissions (RBAC) & Audit Logs`, `System Audit — 2026-09-01`, `next`, `BookingImport.jsx`, `ManualBookingForm.jsx`, `BookingsSummaryCard`?**
  _High betweenness centrality (0.128) - this node is a cross-community bridge._
- **Should `getVoyageLabel` be split into smaller, more focused modules?**
  _Cohesion score 0.0641025641025641 - nodes in this community are weakly interconnected._
- **Why does `rbac()` connect `rbac` to `success`, `getVoyageLabel`, `export/export.service.js`, `RoundRoutePicker`, `LoadingSpinner`, `partner.routes.js`, `10 — Users, Auth, Roles, Permissions (RBAC) & Audit Logs`, `location.routes.js`, `04 — Bookings`, `System Audit — 2026-09-01`, `responseHelper.js`, `partnerSettlement.service.js`, `accounting.routes.js`, `vessel.routes.js`, `expenseType.routes.js`, `System audit — 2026-11-19`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._