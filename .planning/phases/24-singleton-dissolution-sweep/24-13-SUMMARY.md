---
phase: 24-singleton-dissolution-sweep
plan: 13
subsystem: auth
tags: [tenant-context, better-auth, rsc, singleton-dissolution]
dependency-graph:
  requires: [24-03]
  provides: [24-13-auth-gate-context]
  affects: [24-10]
tech-stack:
  added: []
  patterns:
    - "getTenantContext() as the single per-request source of the tenant-bound Better Auth instance in RSC auth gates"
key-files:
  created: []
  modified:
    - "src/app/(auth)/login/page.tsx"
    - "src/app/(auth)/register/page.tsx"
    - "src/app/(admin)/layout.tsx"
decisions: []
metrics:
  duration: "~15 min"
  completed: 2026-07-13
---

# Phase 24 Plan 13: Sweep the 3 auth-gating RSC surfaces off the `auth` singleton Summary

Converted the login page, register page, and admin layout — the three auth-gating RSC surfaces that the original single-grep (`import { db }`) sweep missed — to resolve Better Auth via `const { auth } = await getTenantContext()` instead of `import { auth } from "@/lib/auth"`.

## What Was Built

Applied the identical transform to all three files:
- Removed `import { auth } from "@/lib/auth"`.
- Added `import { getTenantContext } from "@/lib/tenant/context"`.
- Inserted `const { auth } = await getTenantContext();` immediately before each file's existing `auth.api.getSession({ headers: await headers() })` call.
- Left every redirect branch (isSafeNext/`?next=`/`?tab=` handling in login, role redirect in register, unauth→`/login?next=` and non-admin→`/account` in admin layout, plus the badge-count try/catch blocks) untouched.

In single-tenant mode, `getTenantContext()` resolves the synthesized single tenant and `getTenantAuth()` returns the same lazily-built Better Auth instance the deleted singleton wrapped, so behavior on the live store is unchanged.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `rg 'import \{ auth \}' "src/app/(auth)/login/page.tsx" "src/app/(auth)/register/page.tsx" "src/app/(admin)/layout.tsx"` → 0 matches.
- `rg 'from "@/lib/auth"'` across the 3 files → 0 matches.
- `rg "await getTenantContext\(\)"` across the 3 files → matches in all 3.
- `rg "auth.api.getSession"` across the 3 files → matches in all 3 (gate preserved).
- `npx tsc --noEmit | grep -v '^\.next/'` → clean, no output.

**Proof auth LOGIC is unchanged:** every `auth.api.getSession({ headers: await headers() })` call site, its arguments, and every downstream `if`/`redirect()` branch are byte-identical to the pre-change code — the only diff in each file is the import statement and the one added line `const { auth } = await getTenantContext();` that now supplies the same value the singleton previously supplied directly.

## Commits

- `6826faf` — refactor(24-13): resolve auth via getTenantContext in auth-gating RSC surfaces

## Self-Check: PASSED

- FOUND: src/app/(auth)/login/page.tsx (getTenantContext import + call present)
- FOUND: src/app/(auth)/register/page.tsx (getTenantContext import + call present)
- FOUND: src/app/(admin)/layout.tsx (getTenantContext import + call present)
- FOUND: commit 6826faf in `git log --oneline`
