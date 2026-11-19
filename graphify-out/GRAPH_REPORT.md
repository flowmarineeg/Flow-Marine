# Graph Report - logistics  (2026-11-17)

## Corpus Check
- 509 files · ~368,421 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 11, .stackdump 1, .ico 1)

## Summary
- 3322 nodes · 8594 edges · 164 communities (155 shown, 9 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 884 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `390492cd`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- error
- getVoyageLabel
- auth.js
- PermissionContext.jsx
- utils/constants.js
- dashboard/page.jsx
- expenseType.routes.js
- react
- agentAccounts/agentAccounts.service.js
- LoadingSpinner
- react
- backend/package.json
- escapeRegex
- partner.routes.js
- ServiceDetail.jsx
- config/constants.js
- 6. CRITICAL TECHNICAL RULES
- backend
- upload.js
- rounds-voyages-probe.js
- AppError
- frontend/package.json
- seed-test-data.js
- partnerSettlement.service.js
- PermissionMatrix.jsx
- capacity/capacity.service.js
- expense.service.js
- invoiceV2.service.js
- voyage.service.js
- auth.controller.js
- permission.model.js
- seed.js
- backend/src/utils/money.js
- vessel.service.js
- mongoose
- reports/reports.service.js
- Providers.jsx
- VesselForm.jsx
- bookingImport.service.js
- pickFields
- export/export.service.js
- roundsVoyages.logic.test.js
- round.service.js
- ref_node_assert
- mailer.js
- booking.service.js
- partner.service.js
- react-hot-toast
- user.service.js
- location.routes.js
- roundLock.js
- api.int.test.js
- e2e-masterdata.js
- badRequest
- masterData2.test.js
- audit-fixes.int.test.js
- v2.int.test.js
- ManualBookingForm.jsx
- scripts
- migrate-masterdata.js
- accounting.routes.js
- vessel.routes.js
- Capacity Engine — Audit Report (Version 2: Final Verification)
- rbac
- expense-module-analysis.md
- invoicePdfGenerator.js
- bookingItem.service.js
- Booking Selection Workflow — Voyage vs POL/POD Conflict Analysis
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
- agentAccounts.models.js
- compilerOptions
- next.config.mjs
- postcss.config.mjs
- rolling-pnl-analysis.md
- Findings
- Logistics & Shipping SaaS — MERN Stack MVP
- booking.controller.js
- status
- expenseType.controller.js
- Logistics & Shipping SaaS — MERN Stack MVP
- invoiceService.routes.js
- partnerSettlement.test.js
- paginate
- Hard rules (never break)
- Findings
- 03 — Rounds, Voyages & Capacity
- System Audit — 2026-08-03
- vessel.logic.js
- bookings-probe.js
- docs/README.md
- 00 — Architecture & Cross-cutting Rules
- Logistics & Shipping SaaS — MERN Stack MVP
- Logistics & Shipping SaaS — MERN Stack MVP
- 3. Findings
- | See §6 "Version 2" and sprints/v2-code-audit-2026-10-21.md before touching any money code
- Status — 2026-11-10
- deleteVoyage
- server.js
- Hard rules (never break)
- backend/src/utils/money.js
- 04 — Bookings
- Logistics & Shipping SaaS — MERN Stack MVP
- System Audit — 2026-09-01
- Full audit — Routes → Rounds → Voyages → Bookings (data flow + current status) — 2026-11-05
- containerType.service.js
- auth.routes.js
- voyageMatch.logic.js
- MEDIUM
- Logistics & Shipping SaaS — MERN Stack MVP
- Logistics & Shipping SaaS — MERN Stack MVP
- agentCommission.model.js
- Logistics & Shipping SaaS — MERN Stack MVP
- InvoiceList.jsx
- Logistics & Shipping SaaS
- probes-2.js
- voyage.routes.js
- Booking Selection Workflow — Voyage vs POL/POD Conflict Analysis
- user.routes.js
- FLOW Maritime ERP - Version 2 FINAL AUDIT
- Audit — Service → Route legs → Round → Voyages (up to "set booking") — 2026-10-26
- partnerSettlement.models.js
- agentAccounts.logic.js
- 7. IMPACT SURVEY
- auditLogger
- billing.models.js
- voyageMatch.logic.test.js
- Logistics & Shipping SaaS — MERN Stack MVP
- CLAUDE-full-reference.md
- 7. IMPACT SURVEY
- getVoyagePortIds
- vessel.controller.js
- 07 — Tracking
- role.controller.js
- System Audit — 2026-10-20
- agent.controller.js
- bookingImport.controller.js
- capacityLegs.logic.test.js
- deleteVoyage
- 4. BACKEND STRUCTURE
- 7. BUSINESS RULES
- Request pipeline
- 02 — Vessels
- 4. CONFLICTS, INVALID COMBINATIONS, AND UX PROBLEMS
- BookingsSummaryCard
- 4. CONFLICTS, INVALID COMBINATIONS, AND UX PROBLEMS
- Addendum 2026-10-31 — re-read of the working tree (code only, nothing probed)
- frontend/README.md
- 2026-10-24/audit/README.md
- 08 — Reports & Dashboard
- 09 — Export

## God Nodes (most connected - your core abstractions)
1. `success()` - 140 edges
2. `showErrorToast()` - 107 edges
3. `AppError` - 105 edges
4. `react` - 103 edges
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

## Communities (164 total, 9 thin omitted)

### Community 0 - "error"
Cohesion: 0.10
Nodes (31): wrap(), getBookingReport(), getBookingRevenueDetails(), getExpenseReport(), getRevenueReport(), getRoundCapacityReport(), getRoundPnL(), getVoyagePerformance() (+23 more)

### Community 1 - "getVoyageLabel"
Cohesion: 0.07
Nodes (66): 1. Locate the Current Booking Report — Complete Flow, BookingReportPage(), RevenueReportPage(), RoundCapacityPage(), VesselDetailPage(), BookingReport(), fmt(), BookingRevenueDetailsReport() (+58 more)

### Community 2 - "auth.js"
Cohesion: 0.08
Nodes (33): authMiddleware(), jwt, methodToAction, express, router, validateCreate, validateUpdate, express (+25 more)

### Community 3 - "PermissionContext.jsx"
Cohesion: 0.10
Nodes (39): Known gaps / gotchas, Button(), Modal(), useAgents(), useRounds(), useVoyages(), AgentV2Panel(), AgreementsTab() (+31 more)

### Community 4 - "utils/constants.js"
Cohesion: 0.05
Nodes (54): ForgotPasswordPage(), COLUMNS, ContainerTypesPage(), FILTERS, CATEGORY_STYLES, COLUMNS, ExpenseTypesPage(), FILTERS (+46 more)

### Community 5 - "dashboard/page.jsx"
Cohesion: 0.10
Nodes (51): ADR-0005, 3.6 Dashboard `TopAgentsWidget`/`TopRoutesWidget` fire an unbounded query unconditionally, DashboardPage(), DashboardFilterBar(), DashboardFilterContext, DashboardFilterProvider(), EMPTY_FILTERS, useDashboardFilters() (+43 more)

### Community 6 - "expenseType.routes.js"
Cohesion: 0.22
Nodes (8): { body, validationResult }, express, router, { body, validationResult }, handle(), mapping, validateCreate, validateUpdate

### Community 7 - "react"
Cohesion: 0.04
Nodes (69): AcceptInviteInner(), AcceptInvitePage(), LoginPage(), ResetPasswordInner(), ResetPasswordPage(), AgentDetailContent(), AgentDetailPage(), AgentsPage() (+61 more)

### Community 8 - "agentAccounts/agentAccounts.service.js"
Cohesion: 0.13
Nodes (32): accountIds(), advance(), agentLedgerLines(), agreeStatement(), bankCode(), bankOf(), buildStatement(), computeStatement() (+24 more)

### Community 9 - "LoadingSpinner"
Cohesion: 0.10
Nodes (73): Frontend Analysis, 2. Status of the 9-1 Findings, AuditLogsPage(), ExpensesPage(), Badge(), BADGE_STYLES, TONE, Can() (+65 more)

### Community 10 - "react"
Cohesion: 0.07
Nodes (43): NewAgentPage(), COLUMNS, CustomersPage(), FILTERS, TYPE_STYLES, LocationsContent(), LocationsPage(), TABS (+35 more)

### Community 11 - "backend/package.json"
Cohesion: 0.06
Nodes (44): author, dependencies, archiver@^7.0.1, compression@^1.7.4, cookie-parser@^1.4.6, cors@^2.8.5, country-state-city@^3.2.1, dotenv@^16.4.5 (+36 more)

### Community 12 - "escapeRegex"
Cohesion: 0.10
Nodes (22): list(), buildListQuery(), TYPES, list(), missingMappings(), assertMappings(), create(), createCategory() (+14 more)

### Community 13 - "partner.routes.js"
Cohesion: 0.05
Nodes (47): AGENT_STATUS, agentSchema, contactSchema, mongoose, { body, validationResult }, handle(), masterFields, nn (+39 more)

### Community 14 - "ServiceDetail.jsx"
Cohesion: 0.23
Nodes (12): idOf(), RoundLegsPanel(), emptyLeg(), LegRow(), RouteEditor(), Row(), ServiceDetailPage(), tabs (+4 more)

### Community 15 - "config/constants.js"
Cohesion: 0.06
Nodes (40): CONTAINER_SIZES, CONTAINER_TYPES, EXPENSE_CATEGORIES, EXPENSE_COST_CLASSIFICATIONS, INVOICE_STATUS, INVOICE_TYPES, OWNERSHIP_TYPES, PAYMENT_METHODS (+32 more)

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
Cohesion: 0.17
Nodes (4): cleanup, Client, out, RUN

### Community 20 - "AppError"
Cohesion: 0.11
Nodes (25): assertBookingSource(), create(), getAll(), list(), NOT_WRITABLE, update(), assertCodeFree(), create() (+17 more)

### Community 21 - "frontend/package.json"
Cohesion: 0.06
Nodes (36): eslintConfig, dependencies, axios@^1.7.2, chart.js@^4.5.1, lottie-react@^3.1.2, next@^16.4.2, react@19.2.4, react-dom@19.2.4 (+28 more)

### Community 22 - "seed-test-data.js"
Cohesion: 0.15
Nodes (31): assertSafeTarget(), BOX_PREFIX, boxNo(), COMMODITIES, daysAgo(), daysAhead(), expense(), fullExpense() (+23 more)

### Community 23 - "partnerSettlement.service.js"
Cohesion: 0.10
Nodes (31): accrueCommission(), cancel(), issue(), mongoose, vesselPartnerSchema, calculate(), calculateInner(), directMovements() (+23 more)

### Community 24 - "PermissionMatrix.jsx"
Cohesion: 0.28
Nodes (7): ACTION_COLORS, ACTIONS, MODULE_GROUPS, MODULE_LABELS, permissionsService, rolesService, MODULES

### Community 25 - "capacity/capacity.service.js"
Cohesion: 0.08
Nodes (36): capacityEnforcement(), run(), bookingSchema, mongoose, cargoRowSchema, manualBookingSchema, mongoose, ALLOWED_CAPACITY_STATUSES (+28 more)

### Community 26 - "expense.service.js"
Cohesion: 0.08
Nodes (35): expenseAccountCode(), expenseSchema, mongoose, assertTypeFitsScope(), create(), deleteFile(), deriveScope(), fs (+27 more)

### Community 27 - "invoiceV2.service.js"
Cohesion: 0.11
Nodes (29): agentAgreementSchema, handlingFeeSchema, mongoose, buildLine(), assertInvoiceCurrency(), bankAccountCode(), buildLineItemSnapshot(), createDraft() (+21 more)

### Community 28 - "voyage.service.js"
Cohesion: 0.14
Nodes (24): bad(), scheduleWarnings(), toTime(), validateVoyageState(), allocateSequence(), cancelVoyageBookings(), createVoyage(), getRoundRoutePorts() (+16 more)

### Community 29 - "auth.controller.js"
Cohesion: 0.18
Nodes (13): crypto, csrfProtection(), csrfTokenFor(), EXEMPT_PATHS, SAFE_METHODS, changePassword(), cookieOptions(), forgotPassword() (+5 more)

### Community 30 - "permission.model.js"
Cohesion: 0.24
Nodes (7): MODULES, actionSchema, mongoose, permissionSchema, ACTION_KEYS, getByRoleId(), saveByRoleId()

### Community 31 - "seed.js"
Cohesion: 0.11
Nodes (20): connectDB(), mongoose, migrate(), MODELS, mongoose, DRY, ALL, bcrypt (+12 more)

### Community 32 - "backend/src/utils/money.js"
Cohesion: 0.16
Nodes (17): computePositions(), computeProfit(), settleRound(), shareProfit(), suggestTransfers(), postClosingEntry(), getRoundPnL(), allocate() (+9 more)

### Community 33 - "vessel.service.js"
Cohesion: 0.10
Nodes (28): assertSharesUnlocked(), clearShares(), create(), getById(), getShares(), list(), mongoose, setShares() (+20 more)

### Community 34 - "mongoose"
Cohesion: 0.06
Nodes (28): counterSchema, mongoose, exchangeRateSchema, mongoose, journalEntrySchema, mongoose, SOURCE_TYPES, journalEntryLineSchema (+20 more)

### Community 35 - "reports/reports.service.js"
Cohesion: 0.22
Nodes (15): classifyRevenueSizeBucket(), dateRange(), getBookingReport(), getBookingRevenueDetails(), getExpenseReport(), getRevenueReport(), getVoyagePerformance(), ADR-0001 (+7 more)

### Community 36 - "Providers.jsx"
Cohesion: 0.39
Nodes (5): metadata, RootLayout(), Providers(), AuthProvider(), PermissionProvider()

### Community 37 - "VesselForm.jsx"
Cohesion: 0.19
Nodes (15): EditVesselPage(), NewVesselPage(), charterEntryError(), CharterHistory(), day(), EMPTY, money(), bpToPct() (+7 more)

### Community 38 - "bookingImport.service.js"
Cohesion: 0.09
Nodes (43): analyseDischarge(), analyseRows(), assertImportAllowed(), ExcelJS, inTransaction(), loadExisting(), mongoose, norm() (+35 more)

### Community 39 - "pickFields"
Cohesion: 0.11
Nodes (16): createCity(), createCountry(), createPort(), createTerminal(), listCities(), listCountries(), listPorts(), updateCity() (+8 more)

### Community 40 - "export/export.service.js"
Cohesion: 0.29
Nodes (9): addMetadataSheet(), ALLOWED_MODULES, buildExcelBuffer(), COLUMNS, ExcelJS, exportSingle(), flattenDoc(), fmtDate() (+1 more)

### Community 42 - "round.service.js"
Cohesion: 0.11
Nodes (28): assertInitialStatus(), buildEditedLegs(), buildRouteSnapshot(), CANCELLABLE_VOYAGE_STATUSES, crypto, INITIAL_STATUSES, newLegKey(), assertNoLiveBookings() (+20 more)

### Community 43 - "ref_node_assert"
Cohesion: 0.11
Nodes (11): assert, test, assert, test, assert, test, assert, test (+3 more)

### Community 44 - "mailer.js"
Cohesion: 0.18
Nodes (18): bcrypt, changePassword(), crypto, forgotPassword(), getMe(), jwt, login(), resetPassword() (+10 more)

### Community 45 - "booking.service.js"
Cohesion: 0.12
Nodes (31): required, validate(), create(), DISCHARGE_COLUMNS, dischargeFilter(), exportDischargeList(), getById(), hardDelete() (+23 more)

### Community 46 - "partner.service.js"
Cohesion: 0.09
Nodes (25): create(), descendantIds(), FIELDS, HEADER_FIELDS, list(), prefixOf(), remove(), update() (+17 more)

### Community 47 - "react-hot-toast"
Cohesion: 0.31
Nodes (9): AccountingRoute(), AccountForm(), AccountingPage(), buildTree(), ChartTab(), TYPES, ExchangeRates(), accountingService (+1 more)

### Community 48 - "user.service.js"
Cohesion: 0.27
Nodes (12): bcryptjs@^2.4.3, acceptInvite(), bcrypt, create(), crypto, getById(), invalidateUser(), inviteUser() (+4 more)

### Community 49 - "location.routes.js"
Cohesion: 0.10
Nodes (23): express, router, { body, validationResult }, currency, portCode, validateCityCreate, validateCityUpdate, validateCountryCreate (+15 more)

### Community 50 - "roundLock.js"
Cohesion: 0.17
Nodes (25): assertBookingsRoundOpen(), assertDocRoundOpen(), assertExpenseRoundOpen(), assertInvoiceRoundOpen(), assertItemsRoundOpen(), assertRoundBookable(), assertRoundOpen(), assertRoundOpenTx() (+17 more)

### Community 51 - "api.int.test.js"
Cohesion: 0.12
Nodes (6): assert, bcrypt, { describe, it, before, after }, mongoose, path, { spawn }

### Community 52 - "e2e-masterdata.js"
Cohesion: 0.19
Nodes (6): brief(), check(), Client, expectStatus(), results, RUN

### Community 53 - "badRequest"
Cohesion: 0.08
Nodes (28): BOOKING_STATUS, { body, validationResult }, express, handle(), noteValidators, router, express, router (+20 more)

### Community 54 - "masterData2.test.js"
Cohesion: 0.17
Nodes (14): ALL_CITIES, CITY_COUNTRIES, COUNTRIES_ONLY, { Country: LibCountry, City: LibCity }, DRY, lc(), run(), uniqueCityNames() (+6 more)

### Community 55 - "audit-fixes.int.test.js"
Cohesion: 0.19
Nodes (10): assert, { describe, it, before, after }, issueInvoice(), mkBookings(), mkRound(), mongoose, postPayable(), U (+2 more)

### Community 56 - "v2.int.test.js"
Cohesion: 0.16
Nodes (8): assert, { describe, it, before, after }, mkBookings(), mkRound(), mongoose, uniq(), USER, USER_ID

### Community 57 - "ManualBookingForm.jsx"
Cohesion: 0.09
Nodes (33): BookingImportPage(), NewManualBookingPage(), ExportPage(), useBookingLookups(), BookingForm(), FieldLabel(), fmtMoney(), ic() (+25 more)

### Community 58 - "scripts"
Cohesion: 0.15
Nodes (13): scripts, dev, migrate:hard-delete-cleanup, migrate:masterdata, migrate:rounds-voyages, migrate:seed-accounts, seed, seed:chart (+5 more)

### Community 59 - "migrate-masterdata.js"
Cohesion: 0.10
Nodes (17): contactFromLegacy(), DRY, expenseAccountCodeFor(), reports, steps, ALLOWED_SCOPES, LEVEL_LABEL, levelFromScopes() (+9 more)

### Community 60 - "accounting.routes.js"
Cohesion: 0.21
Nodes (11): { body, validationResult }, express, handle(), router, shared, ACCOUNT_TYPES, accountSchema, ALLOCATION_LEVELS (+3 more)

### Community 61 - "vessel.routes.js"
Cohesion: 0.22
Nodes (9): validateShares, express, router, { body, validationResult }, handle(), masterFields, nn, validateCreate (+1 more)

### Community 62 - "Capacity Engine — Audit Report (Version 2: Final Verification)"
Cohesion: 0.05
Nodes (48): computeVoyagePreview(), resolveTEU(), BUG-003 — L1 Fallback Creates Phantom Load/Discharge Events Instead of Excluding, BUG-005 — previewCapacity API Endpoint Calls Non-Existent computeSegmentPreview, BUG-006 — Voyage Sorting Relies on sequence Without a Unique Compound Index, BUG-007 — utilisationPct Uses Math.round, Can Show 100% When Vessel Has Remaining Capacity, BUG-008 — L1 totalTEU Is Pre-Computed at Save Time, Not Refreshed If resolveTEU Changes, BUG-009 — Vessel Starts Every Round at 0 TEU With No Residual Cargo Check (+40 more)

### Community 63 - "rbac"
Cohesion: 0.07
Nodes (37): hasPermission(), rbac(), express, ADR-0001, notOwnRole(), ownRoleId(), ownRoleOrRoles(), router (+29 more)

### Community 64 - "expense-module-analysis.md"
Cohesion: 0.05
Nodes (37): Additional scenarios implied by the current architecture (not explicitly, API endpoints, Architecture Risks, Backend Analysis, Backend workflow, Business Questions, Business Scenarios, Complete expense lifecycle, as it exists today (+29 more)

### Community 65 - "invoicePdfGenerator.js"
Cohesion: 0.35
Nodes (11): C, fillBox(), fmtDate(), fmtMoney(), fmtNum(), generateInvoicePdf(), hLine(), PDFDocument (+3 more)

### Community 66 - "bookingItem.service.js"
Cohesion: 0.12
Nodes (18): balanceMinor(), computeCommission(), deriveStatus(), groupBookingsIntoItems(), listEligible(), scheduleSync(), syncForVoyages(), 06 — Invoices (V2 billing) (+10 more)

### Community 67 - "Booking Selection Workflow — Voyage vs POL/POD Conflict Analysis"
Cohesion: 0.25
Nodes (7): 1. HOW THE VOYAGE SELECTOR CURRENTLY WORKS, 3. WHETHER VOYAGE AND POL/POD DUPLICATE THE SAME RESPONSIBILITY, 5. SHOULD THE SELECTOR ACTUALLY REPRESENT THE ROUND?, 6. HOW VOYAGE/SEGMENT SHOULD BE RESOLVED FROM POL/POD (CONCEPTUAL — NOT A PROPOSAL), 8. MIGRATION RISKS AND BACKWARD COMPATIBILITY, Booking Selection Workflow — Voyage vs POL/POD Conflict Analysis, SUMMARY

### Community 68 - "success"
Cohesion: 0.11
Nodes (27): ALLOWED_CAPACITY_STATUSES, getRoundCapacity(), getVesselActiveCapacity(), previewCapacity(), getFleetUtilisation(), getStats(), deleteCity, deleteCountry (+19 more)

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
Cohesion: 0.22
Nodes (9): 4. Findings, FL-01 (High) — Capacity: onboard is always 0 for the bookings the system can create  *(observed + code)*, FL-04 (High) — Final Loading import cancels bookings it failed to save  *(code)*, FL-05 (Medium) — Final Loading → Cancelled is unreachable  *(code)*, FL-08 (Low) — Voyage-port lookup uses the live route, FL-09 (Low) — Duplicate containers, FL-10 (Low) — Layer 1 details, FL-11 (Low) — Manual voyage order (+1 more)

### Community 79 - "vessel.model.test.js"
Cohesion: 0.40
Nodes (3): assert, base, test

### Community 81 - "agentAccounts.models.js"
Cohesion: 0.33
Nodes (4): handlingChargeSchema, mongoose, offsetBatchSchema, statementSchema

### Community 87 - "rolling-pnl-analysis.md"
Cohesion: 0.08
Nodes (25): Calculation Analysis — Every KPI, Combined, Current Business Purpose, Current expense assumptions, Current expense relationships, Current Filtering Options, Current Grouping Logic, Current limitations (Expense side) (+17 more)

### Community 88 - "Findings"
Cohesion: 0.12
Nodes (16): overdueMatch(), Dashboard (`/dashboard`), Carried forward from the previous audit (not re-verified here), F-01 (High) — FIXED 2026-10-25 — Shares lock can deadlock round closing (lock now only on a Final settlement), F-02 (High) — FIXED 2026-10-25 (as a guard) — Multi-currency rounds are only partly settled (close now blocked by ROUND_HAS_OTHER_CURRENCY; real multi-currency settlement not built), F-04 (Medium) — FIXED 2026-10-25 (non-base expenses excluded and reported separately) — Mixed-currency expense totals in Voyage Profitability, F-05 (Medium) — FIXED 2026-10-25 — Posted expense can change its partner payer, F-07 (Medium) — FIXED 2026-10-25 (blocks; no preview warning yet) — Final Loading import vs issued invoices (+8 more)

### Community 89 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.08
Nodes (23): 03 — Business Rules, 3.10 Deletion Rules, 3.11 Status Transition Rules, 3.1 Master Data Rules, 3.2 Route Rules, 3.3 Round Rules, 3.4 Voyage Auto-Generation Rules, 3.5 Booking Rules (+15 more)

### Community 90 - "booking.controller.js"
Cohesion: 0.23
Nodes (19): create(), dischargeList(), exportDischargeList(), fail(), getById(), getLookups(), getVoyagePorts(), list() (+11 more)

### Community 91 - "status"
Cohesion: 0.08
Nodes (31): status(), 01 — Master Data, Agent agreements (`modules/agreements`), Agents/Customers (`modules/customers`, `/customers`, perm `customers`) — the Customers tab, renamed 2026-10-27, Container types (`modules/containerTypes`, `/container-types`), Expense types and categories (`modules/expenseTypes`, `/expense-types`), Invoice Services (`modules/invoiceServices`, `/invoice-services`, perm `invoiceServices`) — Masters → Services, Locations (`modules/locations`, `/locations`, perm module `locations`) (+23 more)

### Community 92 - "expenseType.controller.js"
Cohesion: 0.20
Nodes (9): create(), createCategory(), deleteCategory(), getById(), getCategories(), list(), remove(), update() (+1 more)

### Community 93 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.10
Nodes (20): 06 — API Planning, 6.10 Rounds, 6.11 Voyages, 6.12 Bookings, 6.13 Expenses, 6.14 Invoices, 6.15 Tracking, 6.16 Reports (+12 more)

### Community 94 - "invoiceService.routes.js"
Cohesion: 0.16
Nodes (12): SERVICE_APPLICABILITY, SERVICE_STATUS, invoiceServiceSchema, mongoose, express, router, { body, validationResult }, handle() (+4 more)

### Community 95 - "partnerSettlement.test.js"
Cohesion: 0.14
Nodes (14): assert, coll, ledger(), M(), paid, shares, test, Accounting (Masters → Accounting, `/accounting`, module `accounting`) and chart of accounts (+6 more)

### Community 96 - "paginate"
Cohesion: 0.09
Nodes (28): create(), getById(), list(), remove(), update(), create(), getAttachment(), getById() (+20 more)

### Community 97 - "Hard rules (never break)"
Cohesion: 0.20
Nodes (9): Architecture map, Before coding, CLAUDE.md — Logistics & Shipping Operations SaaS (MERN), Commands, Docs & history, Env & demo, Module docs (`docs/`), Project (+1 more)

### Community 98 - "Findings"
Cohesion: 0.14
Nodes (14): Findings, RV-00 (High) — FIXED 2026-10-26 — vessel without reefer plugs could not be created, RV-01 (High) — Round created with a vessel that does not exist  *(probed)*, RV-02 / RV-03 (Low) — Inactive service / vessel accepted by the API  *(probed)*, RV-04 / RV-05 (Medium) — Rounds created as Completed / Cancelled  *(probed)*, RV-07 (High) — Two Active rounds on one vessel  *(probed)*, RV-13 (High) — Route changed under existing Planned rounds  *(probed)*, RV-17 (Low) — Generated voyages are bare  *(probed)* (+6 more)

### Community 99 - "03 — Rounds, Voyages & Capacity"
Cohesion: 0.11
Nodes (18): 03 — Rounds, Voyages & Capacity, Capacity engine (per leg, rewritten 2026-11-10 — fixes FL-01 / BK-02), Concepts, Creating a voyage (`voyage.service.createVoyage`), Database changes / deployment, Deleting, Known limitations, Related modules (+10 more)

### Community 100 - "System Audit — 2026-08-03"
Cohesion: 0.11
Nodes (17): 1.1 NoSQL injection in password reset → account takeover, 1. CRITICAL, 2.1 `Round.hardDelete`'s new Voyage cascade orphans Layer-1 bookings and Expenses, 2.2 Discharge-import RBAC gap — wrong permission gates a cross-agent bulk mutation, 2. HIGH, 3.1 File upload accepts spoofed Content-Type — no magic-byte validation, 3.3 Payment History table no longer shows the per-booking "Applied To" breakdown, contradicting the sprint's own comment, 3.4 Bulk-delete selection state not reset across BookingList.jsx tabs (+9 more)

### Community 101 - "vessel.logic.js"
Cohesion: 0.26
Nodes (12): blank(), CHARTER_TYPES, charterDateError(), hireRateFromMinor(), hireRateToMinor(), missingRequired(), prepareCharterHistory(), present() (+4 more)

### Community 102 - "bookings-probe.js"
Cohesion: 0.16
Nodes (4): cleanup, Client, out, RUN

### Community 103 - "docs/README.md"
Cohesion: 0.33
Nodes (3): Conventions used in these docs, Documentation Index, Reading order

### Community 104 - "00 — Architecture & Cross-cutting Rules"
Cohesion: 0.18
Nodes (11): 00 — Architecture & Cross-cutting Rules, Backend layout, Commands, Data flow at a glance, Delete guards (`utils/dependents.js`), Environment, Frontend conventions, Numbering (`utils/autoNumber.js`) (+3 more)

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
Cohesion: 0.07
Nodes (29): 10. AUTO-NUMBER FORMATS, 11. RBAC — CURRENT STATE, 12. API QUICK REFERENCE, 13. ENVIRONMENT, 14. DEMO CREDENTIALS, 15. VPS DEPLOYMENT, 16. KNOWN ISSUES / GOTCHAS, 17. AI AGENT WORKFLOW (+21 more)

### Community 109 - "Status — 2026-11-10"
Cohesion: 0.13
Nodes (14): 2026-11-02 — Accounting chart CRUD, Audit (2026-10-26), Audit 2026-11-10, Bookings rework (2026-11-10), Docs sync (2026-10-31), Follow-up 2026-11-10 (after the audit), How to use, Master data rework (2026-10-25) (+6 more)

### Community 110 - "deleteVoyage"
Cohesion: 0.25
Nodes (8): 3. NEW findings from the final audit, F-2 (High for deployment, OPEN) - `seed.js` is broken and not in git, F-3 (High for governance, OPEN) - planning and audit documents are ignored by git again, F-4 (Low) - integration harness readiness timeout, F-5 (Info) - dependency advisories unchanged, F-6 (Info) - frontend lint baseline, F-7 (Info) - documentation accuracy, F-8 (Info) - Docker test container

### Community 111 - "server.js"
Cohesion: 0.18
Nodes (10): errorHandler(), app, compression, cookieParser, cors, express, helmet, morgan (+2 more)

### Community 112 - "Hard rules (never break)"
Cohesion: 0.20
Nodes (9): exportZip(), archiver, buildZipStream(), Hard rules (never break), Output, 1. PROJECT IDENTITY, Known open gaps, System Summary (+1 more)

### Community 113 - "backend/src/utils/money.js"
Cohesion: 0.36
Nodes (10): add(), assertMinor(), CURRENCY_DECIMALS, decimalsOf(), format(), fromMinor(), numberToPlainString(), sub() (+2 more)

### Community 114 - "04 — Bookings"
Cohesion: 0.15
Nodes (13): 04 — Bookings, Create / update / delete rules, Discharge list (screen + Excel), `discharge` — match-only (reworked), Excel import (`bookingImport.service.js`, `importRules.logic.js`), Partner label and partner users, Routes, Schema `Booking` (+5 more)

### Community 115 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.15
Nodes (12): 01 — Project Overview, 1.1 System Description, 1.2 System Purpose, 1.3 Technology Stack, 1.4 Architecture Type, 1.5 Users of the System, 1.6 Key Business Entities, 1.7 MVP Deliverables (+4 more)

### Community 116 - "System Audit — 2026-09-01"
Cohesion: 0.22
Nodes (8): 1. Executive Summary, 2.1 Backend module inventory (23), 2.2 Frontend feature modules (18) / App Router routes (42 segments), 2.3 The core domain model (condensed — see `CLAUDE.md` for full detail), 2. System Architecture, 3. The Uncommitted Working-Tree Change (WIP, not yet in `CLAUDE.md`), 7. Performance, Caching & Dependencies, System Audit — 2026-09-01

### Community 117 - "Full audit — Routes → Rounds → Voyages → Bookings (data flow + current status) — 2026-11-05"
Cohesion: 0.15
Nodes (9): Audit folder, 1.1 Code and verification state, 1.2 Test DB snapshot (Atlas `test` DB, read-only query 2026-11-05), 1. Current system status, 3. What works (verified in code today), 5. Carried forward (not re-probed), 6. Suggested order of work, 7. Files read (+1 more)

### Community 118 - "containerType.service.js"
Cohesion: 0.33
Nodes (8): assertIsoFree(), clean(), create(), getAll(), hardDelete(), list(), update(), teuFactorForSize()

### Community 119 - "auth.routes.js"
Cohesion: 0.23
Nodes (10): authLimiter, express, { rateLimit }, router, { body, validationResult }, handleValidation(), validateChangePassword, validateForgotPassword (+2 more)

### Community 120 - "voyageMatch.logic.js"
Cohesion: 0.32
Nodes (11): bad(), checkChosenVoyage(), compare(), DEAD_STATUS, DEPARTED_STATUS, findVoyageForBooking(), matchRun(), notDeparted() (+3 more)

### Community 121 - "MEDIUM"
Cohesion: 0.20
Nodes (10): 6. Frontend Correctness & Consistency, 8. Audit Findings — Ranked High → Medium → Low, HIGH, LOW, MEDIUM, useContainerTypes(), usePorts(), useServices() (+2 more)

### Community 122 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.17
Nodes (11): 02 — System Workflow, 2.1 Main Business Flow, 2.2 Master Data Workflow, 2.3 Round Creation Workflow, 2.4 Voyage Lifecycle, 2.5 Booking Workflow, 2.6 Expense Workflow, 2.7 Vessel Tracking Workflow (+3 more)

### Community 123 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.17
Nodes (11): 09 — Security Rules, 9.1 Authentication, 9.2 Authorization (RBAC), 9.3 Input Validation, 9.4 Data Protection, 9.5 API Security, 9.6 File Upload Security, 9.7 Error Handling & Information Disclosure (+3 more)

### Community 124 - "agentCommission.model.js"
Cohesion: 0.25
Nodes (7): cancelCommission(), cancelCommissionTx(), deleteAgreement(), listCommissions(), agentCommissionSchema, mongoose, Routes

### Community 125 - "Logistics & Shipping SaaS — MERN Stack MVP"
Cohesion: 0.18
Nodes (10): 04 — Module Relationships, 4.1 Entity Relationship Overview, 4.2 Detailed Relationship Table, 4.3 One-to-One Relationships, 4.4 One-to-Many Relationships, 4.5 Many-to-One Relationships, 4.6 Reference Directions, 4.7 Cascade / Deletion Strategy (+2 more)

### Community 126 - "InvoiceList.jsx"
Cohesion: 0.36
Nodes (7): InvoicesPage(), downloadBlob(), fmt(), fmtMoney(), InvoiceList(), INVOICE_STATUS, INVOICE_TYPES

### Community 127 - "Logistics & Shipping SaaS"
Cohesion: 0.18
Nodes (10): Backend (`backend/.env`), Development Notes, Environment Variables, Frontend (`frontend/.env.local`), Logistics & Shipping SaaS, Prerequisites, Project Structure, Setup — Backend (+2 more)

### Community 128 - "probes-2.js"
Cohesion: 0.11
Nodes (8): mongoose, out, path, U, mongoose, out, path, U

### Community 129 - "voyage.routes.js"
Cohesion: 0.24
Nodes (8): VOYAGE_DIRECTION, VOYAGE_STATUS, express, router, { body, validationResult }, handle(), validateCreate, validateUpdate

### Community 130 - "Booking Selection Workflow — Voyage vs POL/POD Conflict Analysis"
Cohesion: 0.25
Nodes (7): 1. HOW THE VOYAGE SELECTOR CURRENTLY WORKS, 2. HOW POL/POD ARE POPULATED — THE ROOT ISSUE, 3. WHETHER VOYAGE AND POL/POD DUPLICATE THE SAME RESPONSIBILITY, 5. SHOULD THE SELECTOR ACTUALLY REPRESENT THE ROUND?, 8. MIGRATION RISKS AND BACKWARD COMPATIBILITY, Booking Selection Workflow — Voyage vs POL/POD Conflict Analysis, SUMMARY

### Community 131 - "user.routes.js"
Cohesion: 0.29
Nodes (8): express, router, { body, validationResult }, handle(), validateAcceptInvite, validateCreate, validateInvite, validateUpdate

### Community 132 - "FLOW Maritime ERP - Version 2 FINAL AUDIT"
Cohesion: 0.20
Nodes (9): 10. Revision history, 1. Verdict, 2. Evidence ledger (everything below was run today), 5. What is solid (verified, not assumed), 6. Residual risk register, 7. Release readiness checklist, 8. How to repeat this audit, 9. Sign-off (+1 more)

### Community 133 - "Audit — Service → Route legs → Round → Voyages (up to "set booking") — 2026-10-26"
Cohesion: 0.22
Nodes (9): saveLegs(), Audit — Service → Route legs → Round → Voyages (up to "set booking") — 2026-10-26, Design questions for the owner (Route ↔ Service), Proposed fix sprint (no code written yet beyond RV-00), Remediation status (2026-10-26, same day — sprint `sprints/rounds-voyages-2026-10-26-sprint.md`), Reproduce, RV-08 / RV-09 (Medium) — Same port on consecutive legs  *(probed)*, RV-10 / RV-11 / RV-12 (Medium) — Route legs are not validated against the master data  *(probed)* (+1 more)

### Community 134 - "partnerSettlement.models.js"
Cohesion: 0.29
Nodes (5): jvReserveMovementSchema, mongoose, partnerLine, partnerSettlementSchema, partnerTransferSchema

### Community 135 - "agentAccounts.logic.js"
Cohesion: 0.32
Nodes (3): buildStatementRows(), categorizeLines(), positionDelta()

### Community 136 - "7. IMPACT SURVEY"
Cohesion: 0.29
Nodes (7): 7. IMPACT SURVEY, Backend validation (`booking.service.js`, `manualBooking.service.js`), Booking creation (Layer 1 & Layer 2), Business rules (`claude.md` §6 "Layer 2 Import Architecture — Sprint 026"), Capacity engine (`capacity.service.js`), Final Loading Import reconciliation, Reports (`reports.service.js`) and Invoices (`invoice.service.js`)

### Community 137 - "auditLogger"
Cohesion: 0.10
Nodes (16): AUDIT_ACTIONS, auditLogger(), agreementRules, { body, query, validationResult }, express, handle(), money, router (+8 more)

### Community 138 - "billing.models.js"
Cohesion: 0.33
Nodes (4): bookingItemSchema, invoiceLineSchema, invoiceSettlementSchema, mongoose

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
Cohesion: 0.29
Nodes (7): 7. IMPACT SURVEY, Backend validation (`booking.service.js`, `manualBooking.service.js`), Booking creation (Layer 1 & Layer 2), Business rules (`claude.md` §6 "Layer 2 Import Architecture — Sprint 026"), Capacity engine (`capacity.service.js`), Final Loading Import reconciliation, Reports (`reports.service.js`) and Invoices (`invoice.service.js`)

### Community 143 - "getVoyagePortIds"
Cohesion: 0.33
Nodes (6): getVoyagePortIds(), getVoyagePorts(), BUG-002 — portAsFrom/portAsTo Maps Overwrite Repeated Ports in Circular Routes, BUG-002 — portAsFrom/portAsTo Maps Overwrite Repeated Ports in Circular Routes, 6. HOW VOYAGE/SEGMENT SHOULD BE RESOLVED FROM POL/POD (CONCEPTUAL — NOT A PROPOSAL), 2. HOW POL/POD ARE POPULATED — THE ROOT ISSUE

### Community 144 - "vessel.controller.js"
Cohesion: 0.29
Nodes (6): create(), getById(), getStats(), list(), remove(), update()

### Community 145 - "07 — Tracking"
Cohesion: 0.29
Nodes (7): 07 — Tracking, Create rules (`tracking.service.createEntry`), Principle, Relationship to voyage status, Routes, Schema `TrackingHistory`, Used by

### Community 146 - "role.controller.js"
Cohesion: 0.33
Nodes (5): create(), getById(), list(), remove(), update()

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

### Community 151 - "deleteVoyage"
Cohesion: 0.33
Nodes (6): deleteVoyage(), F-1 (High, FIXED) - the H5 fix broke every voyage deletion, RV-21 / RV-23 (Medium) — Capacity cache not invalidated  *(probed + code)*, RV-22 (Medium) — Deleting a middle voyage breaks the chain  *(probed)*, Summary, FL-06 (Medium) — Voyage Cancelled / Round Completed ignore live bookings  *(code, extends RV-39)*

### Community 152 - "4. BACKEND STRUCTURE"
Cohesion: 0.33
Nodes (6): 4. BACKEND STRUCTURE, `/backend/src/`, New/changed files, Sprint 048, New/changed files, Sprints 035-041, New/changed files, Sprints 042-046, New files added in Sprint 020

### Community 153 - "7. BUSINESS RULES"
Cohesion: 0.33
Nodes (6): 7. BUSINESS RULES, Booking Workflow, Dashboard — SuperAdmin Only, Expense File Serving — Authenticated, Final Loading Import, Tracking — Append-only

### Community 154 - "Request pipeline"
Cohesion: 0.33
Nodes (6): Audit logger (`middleware/auditLogger.js`), Authentication (`middleware/auth.js`), CSRF (`middleware/csrf.js`), RBAC (`middleware/rbac.js`), Request pipeline, Response shape

### Community 155 - "02 — Vessels"
Cohesion: 0.33
Nodes (6): 02 — Vessels, Capacity endpoints (module `capacity`), Related, Routes, Rules, Stats (`GET /vessels/:id/stats`, `getVesselStats`)

### Community 156 - "4. CONFLICTS, INVALID COMBINATIONS, AND UX PROBLEMS"
Cohesion: 0.33
Nodes (6): 4.1 Silent semantic mismatch (the core defect), 4.2 Downstream effect on the capacity engine (direct link to Sprint 029), 4.4 Final Loading Import reconciliation scope compounds the risk, 4.5 UX friction, 4.6 Editing constraint adds to the confusion, 4. CONFLICTS, INVALID COMBINATIONS, AND UX PROBLEMS

### Community 157 - "BookingsSummaryCard"
Cohesion: 0.50
Nodes (4): 3. SPRINT STATUS, Invoice Booking Selection UX + Agent/Invoice Booking Summaries (Sprint 044), BookingsSummaryCard(), fmtMoney()

### Community 158 - "4. CONFLICTS, INVALID COMBINATIONS, AND UX PROBLEMS"
Cohesion: 0.33
Nodes (6): 4.1 Silent semantic mismatch (the core defect), 4.2 Downstream effect on the capacity engine (direct link to Sprint 029), 4.4 Final Loading Import reconciliation scope compounds the risk, 4.5 UX friction, 4.6 Editing constraint adds to the confusion, 4. CONFLICTS, INVALID COMBINATIONS, AND UX PROBLEMS

### Community 159 - "Addendum 2026-10-31 — re-read of the working tree (code only, nothing probed)"
Cohesion: 0.40
Nodes (5): Addendum 2026-10-31 — re-read of the working tree (code only, nothing probed), RV-38 (Medium) — Voyage delete does not look at Layer 1 bookings, tracking or unposted expenses, RV-39 (Low) — Voyage and round status are loosely coupled, RV-40 (Low) — Service code / status edits are unguarded once rounds exist, RV-41 (Info) — Route ports for manual voyages

### Community 160 - "frontend/README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 162 - "08 — Reports & Dashboard"
Cohesion: 0.50
Nodes (4): 08 — Reports & Dashboard, Export of report data, Frontend, Revenue definition (system-wide)

### Community 163 - "09 — Export"
Cohesion: 0.50
Nodes (4): 09 — Export, Adding an exportable module, Endpoints, Exportable modules (`ALLOWED_MODULES` = keys of `COLUMNS`)

## Knowledge Gaps
- **14 isolated node(s):** `ADR-0002`, `ADR-0002`, `ADR-0001`, `ADR-0001`, `ADR-0004` (+9 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1268 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `showErrorToast()` connect `LoadingSpinner` to `PermissionContext.jsx`, `System Audit — 2026-08-03`, `utils/constants.js`, `VesselForm.jsx`, `react`, `00 — Architecture & Cross-cutting Rules`, `react`, `ServiceDetail.jsx`, `react-hot-toast`, `Hard rules (never break)`, `PermissionMatrix.jsx`, `MEDIUM`, `ManualBookingForm.jsx`, `BookingsSummaryCard`, `InvoiceList.jsx`, `rbac`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `showErrorToast()` (e.g. with `Hard rules (never break)` and `Frontend conventions`) actually correct?**
  _`showErrorToast()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ADR-0002`, `ADR-0002`, `ADR-0001` to the rest of the system?**
  _14 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `error` be split into smaller, more focused modules?**
  _Cohesion score 0.10252100840336134 - nodes in this community are weakly interconnected._
- **Why does `Hard rules (never break)` connect `Hard rules (never break)` to `backend/src/utils/money.js`, `Hard rules (never break)`, `agentAccounts/agentAccounts.service.js`, `LoadingSpinner`, `partner.service.js`, `upload.js`, `roundLock.js`, `status`, `rbac`?**
  _High betweenness centrality (0.126) - this node is a cross-community bridge._
- **Should `getVoyageLabel` be split into smaller, more focused modules?**
  _Cohesion score 0.06841448189762797 - nodes in this community are weakly interconnected._
- **Why does `mongoose` connect `mongoose` to `partnerSettlement.models.js`, `agentAccounts/agentAccounts.service.js`, `auditLogger`, `billing.models.js`, `backend/package.json`, `partner.routes.js`, `config/constants.js`, `rounds-voyages-probe.js`, `seed-test-data.js`, `partnerSettlement.service.js`, `capacity/capacity.service.js`, `expense.service.js`, `invoiceV2.service.js`, `voyage.service.js`, `permission.model.js`, `seed.js`, `vessel.service.js`, `reports/reports.service.js`, `bookingImport.service.js`, `pickFields`, `round.service.js`, `booking.service.js`, `partner.service.js`, `api.int.test.js`, `audit-fixes.int.test.js`, `v2.int.test.js`, `migrate-masterdata.js`, `accounting.routes.js`, `agentAccounts.models.js`, `invoiceService.routes.js`, `server.js`, `agentCommission.model.js`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._