# Audit folder

| File | What it is |
|---|---|
| `system-audit-2026-10-24.md` | **Latest system audit** (post V2-only conversion): tests, lint, RBAC coverage, advisories, git risk, release gates G1–G5. Start here. |
| `v2-final-audit-2026-10-21.md` | **Final audit of Version 2** (release-readiness verdict, evidence ledger, re-verification of every earlier finding, new findings F-1..F-8, release gates). Start here. |
| `../../sprints/v2-code-audit-2026-10-21.md` | The module-by-module V2 code audit (revision 2): 7 High / 14 Medium / 10 Low findings, probe log, route permission matrix, fix status. |
| `../../backend/scripts/audit-probes/` | Scripts that reproduce the audit findings against a disposable database. |
| `../../backend/test/int/` | Integration tests (ledger, HTTP/RBAC, audit regressions, V1 regression). |

Not under version control yet: see finding F-3 (the root `.gitignore` ignores `docs/`, `sprints/` and `CLAUDE.md`).
