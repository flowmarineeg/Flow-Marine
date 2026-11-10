# Graph Report - logistics  (2026-11-10)

## Corpus Check
- Large corpus: 511 files · ~352,276 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 2324 nodes · 7070 edges · 87 communities (78 shown, 9 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 502 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- success() / error() / created()
- getVoyageLabel() / VesselDetail.jsx / voyageLabel.
- auth.js / rbac.js / rbac()
- react / usePermission() / BookingList.jsx
- react-hot-toast / errorToast.jsx / utils/constants
- dashboard/page.jsx / CommercialWidgets.jsx / Widge
- responseHelper.js / badRequest() / express-validat
- PageGuard() / LoadingSpinner() / next
- agentAccounts/agentAccounts.service.js / loadAgent
- Button() / PageHeader() / Button.jsx
- AgentForm.jsx / CustomerForm.jsx / PartnerForm.jsx
- backend/package.json / dependencies / bcryptjs
- escapeRegex() / expenseType.service.js / container
- masterValidators.js / customer.validation.js / par
- @tanstack/react-query / Badge() / RoundList.jsx
- config/constants.js / invoice.model.js / agent.mod
- pickFields() / location.service.js / accounting/ac
- backend / frontend / healthcheck
- upload.js / probes-1.js / probes-2.js
- mongoose / round.model.js / dependents.js
- AppError / AppError.js / customer.service.js
- frontend/package.json / dependencies / devDependen
- seed-test-data.js / seedRoundB() / seedRoundA()
- partnerSettlement.service.js / roundClose.service.
- TrackingList.jsx / axios.js / api
- voyage.model.js / capacity/capacity.service.js / b
- expense.service.js / expenseV2.service.js / expens
- invoiceV2.service.js / createDraft() / inTransacti
- voyage.service.js / voyageRun.logic.js / createVoy
- auth.routes.js / auth.controller.js / auth.validat
- seed.js / permission.model.js / permission.service
- server.js / logger.js / logger
- backend/src/utils/money.js / toMinor() / billing.l
- vessel.service.js / shares.test.js / validateShare
- ledger.service.js / nextNumber() / journalEntryLin
- reports/reports.service.js / partnerSettlement.log
- useAuth() / AuthContext.jsx / layout.jsx
- VesselForm.jsx / VesselForm() / partners/page.jsx
- bookingImport.service.js / autoNumber.js / saveImp
- BookingImport.jsx / downloadFile() / ExportButton.
- fetchData() / vessel.model.js / export/export.serv
- route.service.js / roundsVoyages.logic.test.js / r
- round.service.js / round.logic.js / create()
- ref_node_assert / ref_node_test / expenseType.logi
- auth/auth.service.js / mailer.js / sendInvitationE
- booking.service.js / port.model.js / create()
- partner.service.js / partnerSettlement.models.js /
- showErrorToast() / AccountingPage.jsx / ExchangeRa
- user.service.js / user.model.js / getById()
- location.routes.js / location.validation.js / hand
- roundLock.js / model() / assertRoundOpen()
- api.int.test.js / anon() / assert
- e2e-masterdata.js / Client / .req()
- booking.routes.js / manualBooking.validation.js / 
- seed-locations.js / city.model.js / country.model.
- audit-fixes.int.test.js / mkBookings() / mkRound()
- v2.int.test.js / uniq() / mkBookings()
- ManualBookingForm.jsx / ManualBookingDetail.jsx / 
- scripts / dev / migrate:hard-delete-cleanup
- migrate-masterdata.js / expenseType.logic.js / lev
- accounting.routes.js / account.model.js / handle()
- vessel.routes.js / vessel.validation.js / VESSEL_S
- bookingItem.service.js / billing.models.js / syncF
- manualBooking.service.js / invalidateRoundCache() 
- vessel.logic.js / blank() / hireRateFromMinor()
- invoicePdfGenerator.js / generateInvoicePdf() / rg
- AuditLogDetail.jsx / AuditLogDetail() / audit-logs
- VoyageList.jsx / VoyageEditForm.jsx / VoyageList()
- expenseType.routes.js / expenseType.validation.js 
- round.routes.js / round.validation.js / ROUND_STAT
- masterData2.test.js / chart.seed.js / chart.logic.
- scripts / package.json / devDependencies
- TtlCache / .constructor() / .del()
- Client / .req() / .del()
- Client / .req() / .del()
- manifest.json / background_color / display
- voyageRun.logic.test.js / assert / id()
- CodingRules.jsx / CodingRules() / Card()
- vessel.logic.test.js / assert / day()
- vessel.model.test.js / assert / base
- agentAgreement.model.js / agentAgreementSchema / h
- compilerOptions / jsconfig.json / paths
- next.config.mjs / nextConfig / next
- postcss.config.mjs / config

## God Nodes (most connected - your core abstractions)
1. `success()` - 137 edges
2. `error()` - 111 edges
3. `AppError` - 104 edges
4. `react` - 100 edges
5. `showErrorToast()` - 98 edges
6. `PageGuard()` - 94 edges
7. `@tanstack/react-query` - 89 edges
8. `LoadingSpinner()` - 85 edges
9. `Button()` - 82 edges
10. `usePermission()` - 81 edges

## Surprising Connections (you probably didn't know these)
- `handle()` --calls--> `badRequest()`  [EXTRACTED]
  backend/src/modules/accounting/accounting.routes.js → backend/src/utils/responseHelper.js
- `list()` --calls--> `escapeRegex()`  [EXTRACTED]
  backend/src/modules/accounting/accounting.service.js → backend/src/utils/escapeRegex.js
- `handle()` --calls--> `badRequest()`  [EXTRACTED]
  backend/src/modules/agentAccounts/agentAccounts.routes.js → backend/src/utils/responseHelper.js
- `agreeStatement()` --calls--> `AppError`  [EXTRACTED]
  backend/src/modules/agentAccounts/agentAccounts.service.js → backend/src/utils/AppError.js
- `list()` --calls--> `escapeRegex()`  [EXTRACTED]
  backend/src/modules/agents/agent.service.js → backend/src/utils/escapeRegex.js

## Import Cycles
- 2-file cycle: `backend/src/modules/agentAccounts/agentAccounts.service.js -> backend/src/modules/billing/invoiceV2.service.js -> backend/src/modules/agentAccounts/agentAccounts.service.js`

## Communities (87 total, 9 thin omitted)

### Community 0 - "success() / error() / created()"
Cohesion: 0.04
Nodes (125): create(), getById(), list(), remove(), update(), create(), exportDischargeList(), getById() (+117 more)

### Community 1 - "getVoyageLabel() / VesselDetail.jsx / voyageLabel."
Cohesion: 0.06
Nodes (69): BookingRevenueDetailsPage(), BookingReportPage(), ExpenseReportPage(), RevenueReportPage(), RoundCapacityPage(), RoundPnlPage(), VoyagePerformancePage(), BookingReport() (+61 more)

### Community 2 - "auth.js / rbac.js / rbac()"
Cohesion: 0.04
Nodes (67): auditLogger(), authMiddleware(), jwt, hasPermission(), methodToAction, rbac(), agreementRules, { body, query, validationResult } (+59 more)

### Community 3 - "react / usePermission() / BookingList.jsx"
Cohesion: 0.07
Nodes (57): AgentDetailContent(), AgentDetailPage(), BookingsPage(), NewInvoiceContent(), NewInvoicePage(), BookingsSummaryCard(), fmtMoney(), Can() (+49 more)

### Community 4 - "react-hot-toast / errorToast.jsx / utils/constants"
Cohesion: 0.05
Nodes (52): AcceptInviteInner(), AcceptInvitePage(), ForgotPasswordPage(), LoginPage(), ResetPasswordInner(), ResetPasswordPage(), COLUMNS, ContainerTypesPage() (+44 more)

### Community 5 - "dashboard/page.jsx / CommercialWidgets.jsx / Widge"
Cohesion: 0.10
Nodes (50): ADR-0005, DashboardPage(), DashboardFilterBar(), DashboardFilterContext, DashboardFilterProvider(), EMPTY_FILTERS, useDashboardFilters(), ACTIONS (+42 more)

### Community 6 - "responseHelper.js / badRequest() / express-validat"
Cohesion: 0.05
Nodes (47): VOYAGE_DIRECTION, VOYAGE_STATUS, { body, validationResult }, handle(), iso, validateUpdate, getFleetUtilisation(), getStats() (+39 more)

### Community 7 - "PageGuard() / LoadingSpinner() / next"
Cohesion: 0.08
Nodes (35): AgentsPage(), AuditLogsPage(), BookingDetailContent(), BookingDetailPage(), ManualBookingDetailPage(), EditExpenseContent(), EditExpensePage(), NewExpenseContent() (+27 more)

### Community 8 - "agentAccounts/agentAccounts.service.js / loadAgent"
Cohesion: 0.07
Nodes (41): buildStatementRows(), categorizeLines(), positionDelta(), handlingChargeSchema, mongoose, offsetBatchSchema, statementSchema, accountIds() (+33 more)

### Community 9 - "Button() / PageHeader() / Button.jsx"
Cohesion: 0.18
Nodes (34): NewManualBookingPage(), ExpensesPage(), InvoicesPage(), Button(), ConfirmDialog(), EmptyState(), MasterTable(), PageHeader() (+26 more)

### Community 10 - "AgentForm.jsx / CustomerForm.jsx / PartnerForm.jsx"
Cohesion: 0.08
Nodes (36): NewAgentPage(), COLUMNS, CustomersPage(), FILTERS, TYPE_STYLES, LocationsContent(), LocationsPage(), TABS (+28 more)

### Community 11 - "backend/package.json / dependencies / bcryptjs"
Cohesion: 0.06
Nodes (47): author, dependencies, archiver@^7.0.1, bcryptjs@^2.4.3, compression@^1.7.4, cookie-parser@^1.4.6, cors@^2.8.5, country-state-city@^3.2.1 (+39 more)

### Community 12 - "escapeRegex() / expenseType.service.js / container"
Cohesion: 0.09
Nodes (28): list(), assertIsoFree(), clean(), create(), getAll(), list(), update(), TYPES (+20 more)

### Community 13 - "masterValidators.js / customer.validation.js / par"
Cohesion: 0.07
Nodes (36): express, router, { body, validationResult }, handle(), masterFields, nn, validateCreate, validateUpdate (+28 more)

### Community 14 - "@tanstack/react-query / Badge() / RoundList.jsx"
Cohesion: 0.12
Nodes (30): RoundDetailPage(), RoundsPage(), Badge(), BADGE_STYLES, fmt(), NEXT_STATUS, RoundDetailPage(), RoundForm() (+22 more)

### Community 15 - "config/constants.js / invoice.model.js / agent.mod"
Cohesion: 0.06
Nodes (33): AGENT_STATUS, AUDIT_ACTIONS, CONTAINER_SIZES, CONTAINER_TYPES, EXPENSE_CATEGORIES, EXPENSE_COST_CLASSIFICATIONS, INVOICE_STATUS, INVOICE_TYPES (+25 more)

### Community 16 - "pickFields() / location.service.js / accounting/ac"
Cohesion: 0.08
Nodes (25): create(), descendantIds(), FIELDS, HEADER_FIELDS, list(), prefixOf(), remove(), update() (+17 more)

### Community 17 - "backend / frontend / healthcheck"
Cohesion: 0.06
Nodes (36): NEXT_PUBLIC_API_URL, build, condition, container_name, env_file, environment, healthcheck, networks (+28 more)

### Community 18 - "upload.js / probes-1.js / probes-2.js"
Cohesion: 0.07
Nodes (21): mongoose, out, path, U, mongoose, out, path, U (+13 more)

### Community 19 - "mongoose / round.model.js / dependents.js"
Cohesion: 0.09
Nodes (25): cleanup, out, RUN, run(), hardDelete(), exchangeRateSchema, mongoose, deletePort() (+17 more)

### Community 20 - "AppError / AppError.js / customer.service.js"
Cohesion: 0.12
Nodes (24): assertBookingSource(), create(), getAll(), list(), NOT_WRITABLE, update(), buildListQuery(), assertCodeFree() (+16 more)

### Community 21 - "frontend/package.json / dependencies / devDependen"
Cohesion: 0.07
Nodes (32): eslintConfig, dependencies, axios@^1.7.2, chart.js@^4.5.1, next@^16.4.2, react@19.2.4, react-dom@19.2.4, react-hook-form@^7.52.1 (+24 more)

### Community 22 - "seed-test-data.js / seedRoundB() / seedRoundA()"
Cohesion: 0.15
Nodes (31): assertSafeTarget(), BOX_PREFIX, boxNo(), COMMODITIES, daysAgo(), daysAhead(), expense(), fullExpense() (+23 more)

### Community 23 - "partnerSettlement.service.js / roundClose.service."
Cohesion: 0.12
Nodes (24): expenseSchema, mongoose, hardDelete(), mongoose, vesselPartnerSchema, calculate(), calculateInner(), directMovements() (+16 more)

### Community 24 - "TrackingList.jsx / axios.js / api"
Cohesion: 0.12
Nodes (18): api, ic(), nowLocal(), TrackingForm(), fmt(), STATUS_COLORS, TrackingHistoryTable(), fmtDT() (+10 more)

### Community 25 - "voyage.model.js / capacity/capacity.service.js / b"
Cohesion: 0.10
Nodes (23): bookingSchema, mongoose, cargoRowSchema, manualBookingSchema, mongoose, ALLOWED_CAPACITY_STATUSES, cacheKey(), computeRoundCapacity() (+15 more)

### Community 26 - "expense.service.js / expenseV2.service.js / expens"
Cohesion: 0.12
Nodes (26): expenseAccountCode(), assertTypeFitsScope(), create(), deleteFile(), deriveScope(), fs, getById(), hardDelete() (+18 more)

### Community 27 - "invoiceV2.service.js / createDraft() / inTransacti"
Cohesion: 0.14
Nodes (25): accrueCommission(), assertInvoiceCurrency(), bankAccountCode(), buildLineItemSnapshot(), cancel(), createDraft(), createNote(), deleteById() (+17 more)

### Community 28 - "voyage.service.js / voyageRun.logic.js / createVoy"
Cohesion: 0.15
Nodes (23): bad(), scheduleWarnings(), toTime(), validateVoyageState(), allocateSequence(), createVoyage(), getRoundRoutePorts(), mongoose (+15 more)

### Community 29 - "auth.routes.js / auth.controller.js / auth.validat"
Cohesion: 0.11
Nodes (22): crypto, csrfProtection(), csrfTokenFor(), EXEMPT_PATHS, SAFE_METHODS, changePassword(), cookieOptions(), forgotPassword() (+14 more)

### Community 30 - "seed.js / permission.model.js / permission.service"
Cohesion: 0.11
Nodes (20): MODULES, migrate(), ALL, bcrypt, CRUD, READ, ROLE_DEFS, seed() (+12 more)

### Community 31 - "server.js / logger.js / logger"
Cohesion: 0.14
Nodes (16): connectDB(), mongoose, MODELS, mongoose, DRY, errorHandler(), app, compression (+8 more)

### Community 32 - "backend/src/utils/money.js / toMinor() / billing.l"
Cohesion: 0.12
Nodes (19): balanceMinor(), buildLine(), deriveStatus(), add(), assertMinor(), CURRENCY_DECIMALS, decimalsOf(), format() (+11 more)

### Community 33 - "vessel.service.js / shares.test.js / validateShare"
Cohesion: 0.12
Nodes (19): validateShares(), assertMasterRules(), checkShares(), clearParticulars(), create(), deleteParticularsFile(), fs, getAll() (+11 more)

### Community 34 - "ledger.service.js / nextNumber() / journalEntryLin"
Cohesion: 0.13
Nodes (16): immutableError(), makeImmutable(), OPS, journalEntrySchema, mongoose, SOURCE_TYPES, journalEntryLineSchema, mongoose (+8 more)

### Community 35 - "reports/reports.service.js / partnerSettlement.log"
Cohesion: 0.15
Nodes (22): computePositions(), computeProfit(), settleRound(), shareProfit(), suggestTransfers(), classifyRevenueSizeBucket(), dateRange(), getBookingReport() (+14 more)

### Community 36 - "useAuth() / AuthContext.jsx / layout.jsx"
Cohesion: 0.17
Nodes (15): DashboardLayout(), FALLBACK_NAV, metadata, RootLayout(), Home(), getTitle(), Header(), NAV (+7 more)

### Community 37 - "VesselForm.jsx / VesselForm() / partners/page.jsx"
Cohesion: 0.18
Nodes (19): COLUMNS, FILTERS, PartnersPage(), service, charterEntryError(), CharterHistory(), day(), EMPTY (+11 more)

### Community 38 - "bookingImport.service.js / autoNumber.js / saveImp"
Cohesion: 0.14
Nodes (18): ExcelJS, normCntr(), normContainerStatus(), parseDg(), parseNum(), portPairKey(), previewDischargeImport(), previewImport() (+10 more)

### Community 39 - "BookingImport.jsx / downloadFile() / ExportButton."
Cohesion: 0.17
Nodes (14): BookingImportPage(), ExportPage(), ExportButton(), BookingImport(), EditableCell(), EXCEL_COLUMN_MAP, parseExcel(), ROW_STYLES (+6 more)

### Community 40 - "fetchData() / vessel.model.js / export/export.serv"
Cohesion: 0.12
Nodes (17): OWNERSHIP_TYPES, addMetadataSheet(), ALLOWED_MODULES, archiver, buildExcelBuffer(), buildZipStream(), COLUMNS, ExcelJS (+9 more)

### Community 41 - "route.service.js / roundsVoyages.logic.test.js / r"
Cohesion: 0.15
Nodes (13): mongoose, terminalSchema, mongoose, saveLegs(), validateLegs(), assertLegShape(), assertNoConsecutivePorts(), bad() (+5 more)

### Community 42 - "round.service.js / round.logic.js / create()"
Cohesion: 0.16
Nodes (18): assertInitialStatus(), buildEditedLegs(), buildRouteSnapshot(), CANCELLABLE_VOYAGE_STATUSES, crypto, INITIAL_STATUSES, newLegKey(), assertNoLiveBookings() (+10 more)

### Community 43 - "ref_node_assert / ref_node_test / expenseType.logi"
Cohesion: 0.12
Nodes (12): contactFromLegacy(), expenseAccountCodeFor(), assert, test, assert, test, assert, test (+4 more)

### Community 44 - "auth/auth.service.js / mailer.js / sendInvitationE"
Cohesion: 0.18
Nodes (18): bcrypt, changePassword(), crypto, forgotPassword(), getMe(), jwt, login(), resetPassword() (+10 more)

### Community 45 - "booking.service.js / port.model.js / create()"
Cohesion: 0.15
Nodes (16): capacityEnforcement(), required, validate(), create(), DISCHARGE_COLUMNS, getById(), getVoyagePortIds(), getVoyagePorts() (+8 more)

### Community 46 - "partner.service.js / partnerSettlement.models.js /"
Cohesion: 0.12
Nodes (15): assertSharesUnlocked(), clearShares(), create(), getById(), getShares(), hardDelete(), list(), mongoose (+7 more)

### Community 47 - "showErrorToast() / AccountingPage.jsx / ExchangeRa"
Cohesion: 0.25
Nodes (12): AccountingRoute(), AccountForm(), AccountingPage(), buildTree(), ChartTab(), TYPES, ExchangeRates(), bpToPct() (+4 more)

### Community 48 - "user.service.js / user.model.js / getById()"
Cohesion: 0.18
Nodes (14): USER_STATUS, remove(), mongoose, userSchema, acceptInvite(), bcrypt, create(), crypto (+6 more)

### Community 49 - "location.routes.js / location.validation.js / hand"
Cohesion: 0.19
Nodes (14): express, router, { body, validationResult }, currency, handle(), portCode, validateCityCreate, validateCityUpdate (+6 more)

### Community 50 - "roundLock.js / model() / assertRoundOpen()"
Cohesion: 0.33
Nodes (15): assertBookingsRoundOpen(), assertDocRoundOpen(), assertExpenseRoundOpen(), assertInvoiceRoundOpen(), assertItemsRoundOpen(), assertRoundBookable(), assertRoundOpen(), assertRoundOpenTx() (+7 more)

### Community 51 - "api.int.test.js / anon() / assert"
Cohesion: 0.12
Nodes (6): assert, bcrypt, { describe, it, before, after }, mongoose, path, { spawn }

### Community 52 - "e2e-masterdata.js / Client / .req()"
Cohesion: 0.19
Nodes (6): brief(), check(), Client, expectStatus(), results, RUN

### Community 53 - "booking.routes.js / manualBooking.validation.js / "
Cohesion: 0.18
Nodes (12): BOOKING_STATUS, express, router, { body, validationResult }, handle(), validateCreate, validateUpdate, { body, validationResult } (+4 more)

### Community 54 - "seed-locations.js / city.model.js / country.model."
Cohesion: 0.16
Nodes (12): ALL_CITIES, CITY_COUNTRIES, COUNTRIES_ONLY, { Country: LibCountry, City: LibCity }, DRY, lc(), run(), uniqueCityNames() (+4 more)

### Community 55 - "audit-fixes.int.test.js / mkBookings() / mkRound()"
Cohesion: 0.19
Nodes (10): assert, { describe, it, before, after }, issueInvoice(), mkBookings(), mkRound(), mongoose, postPayable(), U (+2 more)

### Community 56 - "v2.int.test.js / uniq() / mkBookings()"
Cohesion: 0.16
Nodes (8): assert, { describe, it, before, after }, mkBookings(), mkRound(), mongoose, uniq(), USER, USER_ID

### Community 57 - "ManualBookingForm.jsx / ManualBookingDetail.jsx / "
Cohesion: 0.26
Nodes (12): fmt(), fmtMoney(), fmtNum(), InfoRow(), ManualBookingDetail(), EMPTY_ROW, FieldLabel(), fmt() (+4 more)

### Community 58 - "scripts / dev / migrate:hard-delete-cleanup"
Cohesion: 0.15
Nodes (13): scripts, dev, migrate:hard-delete-cleanup, migrate:masterdata, migrate:rounds-voyages, migrate:seed-accounts, seed, seed:chart (+5 more)

### Community 59 - "migrate-masterdata.js / expenseType.logic.js / lev"
Cohesion: 0.18
Nodes (9): DRY, reports, steps, ALLOWED_SCOPES, LEVEL_LABEL, levelFromScopes(), OPERATIONAL_LEVELS, scopeAllowed() (+1 more)

### Community 60 - "accounting.routes.js / account.model.js / handle()"
Cohesion: 0.21
Nodes (11): { body, validationResult }, express, handle(), router, shared, ACCOUNT_TYPES, accountSchema, ALLOCATION_LEVELS (+3 more)

### Community 61 - "vessel.routes.js / vessel.validation.js / VESSEL_S"
Cohesion: 0.20
Nodes (10): VESSEL_STATUS, validateShares, express, router, { body, validationResult }, handle(), masterFields, nn (+2 more)

### Community 62 - "bookingItem.service.js / billing.models.js / syncF"
Cohesion: 0.21
Nodes (8): groupBookingsIntoItems(), bookingItemSchema, invoiceLineSchema, invoiceSettlementSchema, mongoose, listEligible(), scheduleSync(), syncForVoyages()

### Community 63 - "manualBooking.service.js / invalidateRoundCache() "
Cohesion: 0.35
Nodes (11): computeTotals(), create(), fetchSizeMap(), getById(), hardDelete(), list(), populate(), STATUS_TRANSITIONS (+3 more)

### Community 64 - "vessel.logic.js / blank() / hireRateFromMinor()"
Cohesion: 0.33
Nodes (10): blank(), CHARTER_TYPES, charterDateError(), hireRateFromMinor(), hireRateToMinor(), missingRequired(), prepareCharterHistory(), present() (+2 more)

### Community 65 - "invoicePdfGenerator.js / generateInvoicePdf() / rg"
Cohesion: 0.35
Nodes (11): C, fillBox(), fmtDate(), fmtMoney(), fmtNum(), generateInvoicePdf(), hLine(), PDFDocument (+3 more)

### Community 66 - "AuditLogDetail.jsx / AuditLogDetail() / audit-logs"
Cohesion: 0.27
Nodes (9): AuditLogDetailPage(), ACTION_STYLE, AuditLogDetail(), fmt(), getDiff(), MODULE_ROUTES, renderValue(), ValueDisplay() (+1 more)

### Community 67 - "VoyageList.jsx / VoyageEditForm.jsx / VoyageList()"
Cohesion: 0.30
Nodes (9): VoyagesPage(), ic(), toInputDate(), TRANSITIONS, VoyageEditForm(), fmt(), groupByRound(), VoyageList() (+1 more)

### Community 68 - "expenseType.routes.js / expenseType.validation.js "
Cohesion: 0.22
Nodes (8): { body, validationResult }, express, router, { body, validationResult }, handle(), mapping, validateCreate, validateUpdate

### Community 69 - "round.routes.js / round.validation.js / ROUND_STAT"
Cohesion: 0.27
Nodes (8): ROUND_STATUS, express, router, { body, validationResult }, handle(), validateCreate, validateLegs, validateUpdate

### Community 70 - "masterData2.test.js / chart.seed.js / chart.logic."
Cohesion: 0.36
Nodes (6): toAccountFields(), TYPE_MAP, validateChart(), seedChart(), assert, test

### Community 71 - "scripts / package.json / devDependencies"
Cohesion: 0.22
Nodes (9): devDependencies, concurrently@^9.2.4, scripts, build, dev, dev:backend, dev:frontend, start (+1 more)

### Community 75 - "manifest.json / background_color / display"
Cohesion: 0.29
Nodes (6): background_color, display, icons, name, short_name, theme_color

### Community 76 - "voyageRun.logic.test.js / assert / id()"
Cohesion: 0.33
Nodes (3): assert, legs, test

### Community 77 - "CodingRules.jsx / CodingRules() / Card()"
Cohesion: 0.40
Nodes (5): Card(), CodingRules(), DIMENSIONS, LEVELS, RULES

### Community 78 - "vessel.logic.test.js / assert / day()"
Cohesion: 0.40
Nodes (3): assert, NOW, test

### Community 79 - "vessel.model.test.js / assert / base"
Cohesion: 0.40
Nodes (3): assert, base, test

### Community 81 - "agentAgreement.model.js / agentAgreementSchema / h"
Cohesion: 0.50
Nodes (3): agentAgreementSchema, handlingFeeSchema, mongoose

## Knowledge Gaps
- **14 isolated node(s):** `ADR-0002`, `ADR-0002`, `ADR-0001`, `ADR-0001`, `ADR-0004` (+9 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 668 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `mongoose` connect `mongoose / round.model.js / dependents.js` to `agentAccounts/agentAccounts.service.js / loadAgent`, `backend/package.json / dependencies / bcryptjs`, `masterValidators.js / customer.validation.js / par`, `config/constants.js / invoice.model.js / agent.mod`, `pickFields() / location.service.js / accounting/ac`, `seed-test-data.js / seedRoundB() / seedRoundA()`, `partnerSettlement.service.js / roundClose.service.`, `voyage.model.js / capacity/capacity.service.js / b`, `expense.service.js / expenseV2.service.js / expens`, `invoiceV2.service.js / createDraft() / inTransacti`, `voyage.service.js / voyageRun.logic.js / createVoy`, `seed.js / permission.model.js / permission.service`, `server.js / logger.js / logger`, `vessel.service.js / shares.test.js / validateShare`, `ledger.service.js / nextNumber() / journalEntryLin`, `reports/reports.service.js / partnerSettlement.log`, `bookingImport.service.js / autoNumber.js / saveImp`, `fetchData() / vessel.model.js / export/export.serv`, `route.service.js / roundsVoyages.logic.test.js / r`, `round.service.js / round.logic.js / create()`, `booking.service.js / port.model.js / create()`, `partner.service.js / partnerSettlement.models.js /`, `user.service.js / user.model.js / getById()`, `api.int.test.js / anon() / assert`, `seed-locations.js / city.model.js / country.model.`, `audit-fixes.int.test.js / mkBookings() / mkRound()`, `v2.int.test.js / uniq() / mkBookings()`, `accounting.routes.js / account.model.js / handle()`, `bookingItem.service.js / billing.models.js / syncF`, `agentAgreement.model.js / agentAgreementSchema / h`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **What connects `ADR-0002`, `ADR-0002`, `ADR-0001` to the rest of the system?**
  _14 weakly-connected nodes found - possible missing edges._
- **Should `success() / error() / created()` be split into smaller, more focused modules?**
  _Cohesion score 0.038655788655788656 - nodes in this community are weakly interconnected._
- **Why does `success()` connect `success() / error() / created()` to `auth.js / rbac.js / rbac()`, `responseHelper.js / badRequest() / express-validat`, `auth.routes.js / auth.controller.js / auth.validat`, `accounting.routes.js / account.model.js / handle()`, `vessel.routes.js / vessel.validation.js / VESSEL_S`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Should `getVoyageLabel() / VesselDetail.jsx / voyageLabel.` be split into smaller, more focused modules?**
  _Cohesion score 0.0629076372817168 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react / usePermission() / BookingList.jsx` to `getVoyageLabel() / VesselDetail.jsx / voyageLabel.`, `AuditLogDetail.jsx / AuditLogDetail() / audit-logs`, `VoyageList.jsx / VoyageEditForm.jsx / VoyageList()`, `react-hot-toast / errorToast.jsx / utils/constants`, `useAuth() / AuthContext.jsx / layout.jsx`, `dashboard/page.jsx / CommercialWidgets.jsx / Widge`, `PageGuard() / LoadingSpinner() / next`, `BookingImport.jsx / downloadFile() / ExportButton.`, `Button() / PageHeader() / Button.jsx`, `AgentForm.jsx / CustomerForm.jsx / PartnerForm.jsx`, `VesselForm.jsx / VesselForm() / partners/page.jsx`, `@tanstack/react-query / Badge() / RoundList.jsx`, `showErrorToast() / AccountingPage.jsx / ExchangeRa`, `frontend/package.json / dependencies / devDependen`, `TrackingList.jsx / axios.js / api`, `ManualBookingForm.jsx / ManualBookingDetail.jsx / `?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Should `auth.js / rbac.js / rbac()` be split into smaller, more focused modules?**
  _Cohesion score 0.04493284493284493 - nodes in this community are weakly interconnected._