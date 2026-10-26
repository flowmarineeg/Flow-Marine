# 07 — Folder Architecture
# Logistics & Shipping SaaS — MERN Stack MVP

---

> **STATUS NOTE (current through Sprint 046):** original MVP-era folder
> layout. New module directories added since: `backend/src/modules/
> manualBookings/` (or equivalent Layer 1 booking module — Sprint 023),
> `capacity/` (Sprint 022), `payments/` (Sprint 033), and on the frontend
> `frontend/src/modules/dashboard/` (rebuilt from a single page into a
> Sections/Widgets tree — Sprint 039). No new module directory was added
> by Sprints 042-046 — every change landed inside an existing module
> (`bookings/`, `invoices/`, `permissions/`, `capacity/`, `rounds/`,
> `voyages/`) or as a new shared frontend file (`utils/errorToast.jsx`,
> `utils/voyageDisplayOrder.js`, `components/ui/BookingsSummaryCard.jsx`).
> The overall `modules/<feature>/{feature.model,service,controller,routes,
> validation}.js` convention this file documents is UNCHANGED and still
> followed by every new module added since. See claude.md Sections 4-5 for
> the current file inventory.

---

## 7.1 Root Structure

```
logistics/
  backend/
  frontend/
  docs/
  sprints/
  claude.md
  .gitignore
  README.md
```

---

## 7.2 Backend Folder Structure

```
backend/
  src/
    config/
      db.js                  # MongoDB connection
      env.js                 # Env var loading & validation
      constants.js           # App-wide constants and enums

    middleware/
      auth.js                # JWT verification, attaches req.user
      rbac.js                # Permission check middleware
      auditLogger.js         # Auto-log mutating requests
      errorHandler.js        # Global error handler (registered last)
      upload.js              # Multer configuration

    modules/
      auth/
        auth.routes.js
        auth.controller.js
        auth.service.js

      users/
        user.model.js
        user.routes.js
        user.controller.js
        user.service.js
        user.validation.js

      roles/
        role.model.js
        role.routes.js
        role.controller.js
        role.service.js
        role.validation.js

      permissions/
        permission.model.js
        permission.routes.js
        permission.controller.js
        permission.service.js

      vessels/
        vessel.model.js
        vessel.routes.js
        vessel.controller.js
        vessel.service.js
        vessel.validation.js

      agents/
        agent.model.js
        agent.routes.js
        agent.controller.js
        agent.service.js
        agent.validation.js

      locations/
        country.model.js
        city.model.js
        port.model.js
        terminal.model.js
        location.routes.js
        location.controller.js
        location.service.js
        location.validation.js

      containerTypes/
        containerType.model.js
        containerType.routes.js
        containerType.controller.js
        containerType.service.js
        containerType.validation.js

      expenseTypes/
        expenseType.model.js
        expenseType.routes.js
        expenseType.controller.js
        expenseType.service.js
        expenseType.validation.js

      services/
        service.model.js
        service.routes.js
        service.controller.js
        service.service.js
        service.validation.js

      routes/
        route.model.js
        routeLeg.model.js
        route.routes.js
        route.controller.js
        route.service.js
        route.validation.js

      rounds/
        round.model.js
        round.routes.js
        round.controller.js
        round.service.js
        round.validation.js

      voyages/
        voyage.model.js
        voyage.routes.js
        voyage.controller.js
        voyage.service.js
        voyage.validation.js

      bookings/
        booking.model.js
        booking.routes.js
        booking.controller.js
        booking.service.js
        booking.validation.js

      expenses/
        expense.model.js
        expense.routes.js
        expense.controller.js
        expense.service.js
        expense.validation.js

      invoices/
        invoice.model.js
        invoice.routes.js
        invoice.controller.js
        invoice.service.js
        invoice.validation.js

      tracking/
        trackingHistory.model.js
        tracking.routes.js
        tracking.controller.js
        tracking.service.js
        tracking.validation.js

      reports/
        reports.routes.js
        reports.controller.js
        reports.service.js

      export/
        export.routes.js
        export.controller.js
        export.service.js

      auditLogs/
        auditLog.model.js
        auditLog.routes.js
        auditLog.controller.js
        auditLog.service.js

      counters/
        counter.model.js
        counter.service.js    # autoNumber helper

    utils/
      autoNumber.js           # Generates R000001, BK-000001, etc.
      voyageGenerator.js      # Voyage auto-generation logic
      dateUtils.js            # Date formatting helpers
      logger.js               # Winston or simple logger
      responseHelper.js       # Standardized response builder

    uploads/                  # Multer file destination (gitignored)

  server.js                   # Entry: express app, middleware, routes, DB
  .env                        # Environment variables (gitignored)
  .env.example                # Template for env vars
  package.json
```

---

## 7.3 Frontend Folder Structure

```
frontend/
  src/
    app/                        # Next.js App Router
      (auth)/
        login/
          page.jsx
      (dashboard)/
        layout.jsx              # Sidebar + Header layout
        page.jsx                # Dashboard home
        vessels/
          page.jsx              # List
          new/page.jsx          # Create form
          [id]/page.jsx         # Detail / Edit
        agents/
          page.jsx
          new/page.jsx
          [id]/page.jsx
        locations/
          page.jsx
        container-types/
          page.jsx
        expense-types/
          page.jsx
        services/
          page.jsx
          new/page.jsx
          [id]/page.jsx
          [id]/route/page.jsx   # Route leg editor
        rounds/
          page.jsx
          new/page.jsx
          [id]/page.jsx
        voyages/
          page.jsx
          [id]/page.jsx
        bookings/
          page.jsx
          new/page.jsx
          [id]/page.jsx
        expenses/
          page.jsx
          new/page.jsx
          [id]/page.jsx
        invoices/
          page.jsx
          new/page.jsx
          [id]/page.jsx
        tracking/
          page.jsx
        reports/
          page.jsx
          round-pnl/page.jsx
          voyage-performance/page.jsx
          bookings/page.jsx
          revenue/page.jsx
          expenses/page.jsx
        export/
          page.jsx
        users/
          page.jsx
          new/page.jsx
          [id]/page.jsx
        roles/
          page.jsx
          [id]/page.jsx
        audit-logs/
          page.jsx
          [id]/page.jsx

    components/
      ui/                       # Shared atomic components
        Button.jsx
        Input.jsx
        Select.jsx
        Textarea.jsx
        Badge.jsx
        Modal.jsx
        Table.jsx
        Pagination.jsx
        SearchBar.jsx
        DatePicker.jsx
        FileUpload.jsx
        StatusBadge.jsx
        ConfirmDialog.jsx
        EmptyState.jsx
        LoadingSpinner.jsx
        Card.jsx
        Tooltip.jsx
      layout/
        Sidebar.jsx
        Header.jsx
        Breadcrumbs.jsx
        PageHeader.jsx
      forms/
        FormField.jsx           # Label + Input + Error wrapper
        LocationSelect.jsx      # Cascading Country>City>Port>Terminal
        FilterBar.jsx           # Reusable filter row for list pages

    modules/                    # Module-level components
      vessels/
        VesselList.jsx
        VesselForm.jsx
        VesselDetailCard.jsx
      agents/
        AgentList.jsx
        AgentForm.jsx
      locations/
        CountryTable.jsx
        CityTable.jsx
        PortTable.jsx
        TerminalTable.jsx
        LocationForm.jsx
      services/
        ServiceList.jsx
        ServiceForm.jsx
        RouteEditor.jsx         # Drag-reorder route legs
      rounds/
        RoundList.jsx
        RoundForm.jsx
        RoundVoyageList.jsx     # Shows generated voyages
      voyages/
        VoyageList.jsx
        VoyageEditForm.jsx
      bookings/
        BookingList.jsx
        BookingForm.jsx
        BookingDetailCard.jsx
      expenses/
        ExpenseList.jsx
        ExpenseForm.jsx
      invoices/
        InvoiceList.jsx
        InvoiceForm.jsx
      tracking/
        TrackingForm.jsx
        TrackingHistoryTable.jsx
      reports/
        RoundPnlReport.jsx
        VoyagePerformanceReport.jsx
        BookingReport.jsx
        RevenueReport.jsx
        ExpenseReport.jsx
      export/
        ExportPanel.jsx
      users/
        UserList.jsx
        UserForm.jsx
      roles/
        RoleList.jsx
        PermissionMatrix.jsx    # Module x Action grid
      auditLogs/
        AuditLogList.jsx
        AuditLogDetail.jsx

    services/                   # Axios API call functions
      api.js                    # Axios instance with interceptors
      auth.service.js
      users.service.js
      roles.service.js
      permissions.service.js
      vessels.service.js
      agents.service.js
      locations.service.js
      containerTypes.service.js
      expenseTypes.service.js
      services.service.js
      routes.service.js
      rounds.service.js
      voyages.service.js
      bookings.service.js
      expenses.service.js
      invoices.service.js
      tracking.service.js
      reports.service.js
      export.service.js
      auditLogs.service.js

    hooks/
      useAuth.js                # Auth state and actions
      usePermission.js          # Check permission for module+action
      useToast.js               # Toast notifications
      usePagination.js          # Pagination state helper
      useConfirm.js             # Confirm dialog hook

    context/
      AuthContext.jsx           # Auth state provider
      PermissionContext.jsx     # Permission map provider

    utils/
      formatters.js             # Date, currency, number formatting
      validators.js             # Client-side validation helpers
      constants.js              # Enums, status lists, etc.
      exportHelper.js           # Trigger file download

    config/
      axios.js                  # Axios base instance
      queryClient.js            # React Query client config

  public/
    logo.svg
    favicon.ico

  .env.local                    # Frontend env variables
  .env.example
  next.config.js
  tailwind.config.js
  package.json
```

---

## 7.4 File Naming Rules

| Type | Convention | Example |
|---|---|---|
| Backend model | `name.model.js` | `vessel.model.js` |
| Backend controller | `name.controller.js` | `booking.controller.js` |
| Backend service | `name.service.js` | `round.service.js` |
| Backend routes | `name.routes.js` | `voyage.routes.js` |
| Backend validation | `name.validation.js` | `expense.validation.js` |
| Frontend component | `PascalCase.jsx` | `VesselForm.jsx` |
| Frontend service | `name.service.js` | `vessels.service.js` |
| Frontend hook | `useCamelCase.js` | `usePermission.js` |
| Frontend context | `PascalCaseContext.jsx` | `AuthContext.jsx` |

---

## 7.5 Module Registration Pattern

Every backend module is registered in `server.js`:

```javascript
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', authMiddleware, usersRoutes);
app.use('/api/v1/vessels', authMiddleware, rbac('vessels'), vesselRoutes);
// ... all modules follow same pattern
app.use(errorHandler); // always last
```
