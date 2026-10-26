# 09 — Security Rules
# Logistics & Shipping SaaS — MERN Stack MVP

---

> **STATUS NOTE (current through Sprint 046):** original MVP-era security
> rules; Sprint 020 later hardened auth (httpOnly cookie JWT, rate
> limiting, authenticated file serving) — see claude.md Section 6 for the
> current auth/security architecture. **Open, CONFIRMED, NOT YET FIXED
> gaps found by the Sprint 041 audit** (planning approved, no code written,
> STILL not implemented as of Sprint 046): `GET /permissions/:roleId`
> accepts any roleId with no caller-scoping check (any authenticated user
> can read any other role's full permission matrix); `roles/[id]/page.jsx`,
> `agents/[id]/page.jsx`, `agents/new/page.jsx` render with no
> `<PageGuard>` (backend RBAC still blocks the underlying writes/fetches —
> only the page shell is unguarded). Separately, Sprint 046 added a NEW,
> deliberate permission escalation of its own: a per-role `invoices:override`
> grant that lets its holder (or SuperAdmin) bypass the invoice
> paidAmount/Paid|Cancelled lock and force `status` to any value — this is
> an intentional admin capability, not a gap, but it IS new attack surface
> worth knowing about (see claude.md's Sprint 046 section). Also confirmed
> while building it: `import`/`export` permission actions (Sprint019) still
> have no UI toggle in `PermissionMatrix.jsx` — grantable only via direct
> DB write, a separate pre-existing gap. See
> sprints/041-sprint.txt before fixing either.

---

## 9.1 Authentication

- JWT (JSON Web Tokens) are used for all authentication.
- Tokens are signed with `JWT_SECRET` stored in `.env` — never hardcoded.
- Token expiry: `24h` for regular sessions (configurable via env).
- Tokens are sent in the `Authorization: Bearer <token>` header only. Never in query strings or cookies (MVP).
- On login: verify email + bcrypt-hashed password. Return signed JWT.
- On logout: log the action in audit log. Client discards the token.
- Passwords are hashed with `bcrypt` (salt rounds: 12).
- Plain-text passwords must never be stored or logged anywhere.
- Change-password endpoint requires current password verification before accepting new password.
- Failed login attempts are logged to audit log (not rate-limited in MVP — future improvement).

---

## 9.2 Authorization (RBAC)

- Every protected API route passes through two middleware layers in order:
  1. `auth.js` — verifies JWT, attaches `req.user`
  2. `rbac.js` — checks `req.user.roleId` against the permissions collection for the requested module + action
- The SuperAdmin role bypasses permission checks (`isSystem: true` on role).
- Permission check happens server-side on every request — client-side checks are UI hints only and are never trusted for security.
- If a user lacks permission: respond with `403 Forbidden`.
- If a token is missing or invalid: respond with `401 Unauthorized`.
- Module names in permissions must match exactly the module keys used in the RBAC middleware.
- The `hidden` action flag hides the module from the sidebar — it does NOT replace server-side checks.

---

## 9.3 Input Validation

- All API inputs are validated before reaching the controller or service layer.
- Use a dedicated `*.validation.js` file per module.
- Validate: required fields, data types, string lengths, enum values, number ranges, date formats.
- Never trust client-submitted values like `totalFreight` — always recompute server-side.
- Never trust client-submitted `bookingNumber`, `invoiceNumber`, `roundNumber` — always generate server-side.
- File uploads: validate MIME type and file size in Multer middleware before saving.
- Allowed file types for expense attachments: `image/jpeg`, `image/png`, `application/pdf`.
- Maximum file size: 10MB.
- Sanitize all string inputs: trim whitespace. Do not allow HTML injection in text fields.

---

## 9.4 Data Protection

- `.env` files are never committed to version control. Use `.env.example` as template.
- The `/uploads` directory is excluded from git via `.gitignore`.
- MongoDB connection string contains credentials — always loaded from env, never hardcoded.
- `JWT_SECRET` must be a long random string (minimum 32 characters).
- Old Values and New Values stored in audit logs must not include password fields — strip sensitive fields before logging.

---

## 9.5 API Security

- All routes (except `/api/v1/auth/login`) require a valid JWT.
- HTTP method restriction: routes only accept the HTTP methods they define. Express router handles this.
- Unknown routes return `404 Not Found` via a catch-all handler registered after all routes.
- CORS: configure `cors` middleware to allow only the frontend origin. Set in env: `ALLOWED_ORIGIN`.
- Helmet.js: use `helmet()` middleware to set secure HTTP headers.
- Rate limiting: not implemented in MVP — flag for Phase 2.
- Request size limit: set `express.json({ limit: '10mb' })` to prevent payload floods.

---

## 9.6 File Upload Security

- Multer is configured with `diskStorage` — files saved to `/src/uploads/`.
- File names are sanitized: use `Date.now() + '-' + originalname` pattern to avoid path traversal.
- Never serve uploaded files through Express directly in production — use a static file server or object storage (future).
- In MVP: Express serves `/uploads` as a static directory with auth check middleware in front.

---

## 9.7 Error Handling & Information Disclosure

- The global `errorHandler.js` middleware catches all unhandled errors.
- In production (`NODE_ENV=production`): return generic error message only. Never expose stack traces.
- In development (`NODE_ENV=development`): include stack trace in response for debugging.
- Mongoose validation errors are caught and returned as structured `errors[]` array.
- Duplicate key errors (MongoDB code 11000) are caught and returned as user-friendly messages.
- Never expose MongoDB ObjectIds in error messages that reveal internal structure unnecessarily.

---

## 9.8 Audit Log Security

- Audit logs are written by the server — never by the client.
- Audit log records are immutable: no UPDATE or DELETE routes on `auditLogs` collection.
- Only SuperAdmin and authorized roles can VIEW audit logs.
- IP address and User-Agent are captured from `req.ip` and `req.headers['user-agent']`.
- Old and new values are diff-captured: before saving a document update, read the current state first, then save, then log both.

---

## 9.9 Environment Variables Reference

```
# Backend
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/logistics_saas
JWT_SECRET=your-very-long-random-secret-here
JWT_EXPIRES_IN=24h
ALLOWED_ORIGIN=http://localhost:3000
UPLOAD_MAX_SIZE_MB=10

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
```

---

## 9.10 Security Checklist (Before Launch)

- [ ] All routes behind `authMiddleware` except `/auth/login`
- [ ] All mutating routes behind `rbacMiddleware`
- [ ] All mutating routes covered by `auditLogger` middleware
- [ ] `helmet()` applied to Express app
- [ ] CORS restricted to frontend origin only
- [ ] `.env` not committed to git
- [ ] `/uploads` not publicly accessible without auth
- [ ] Passwords never stored in plain text
- [ ] `totalFreight` and auto-numbers always computed server-side
- [ ] File upload validated for type and size
- [ ] Stack traces hidden in production responses
- [ ] SuperAdmin seeded on first run only (idempotent seed script)
