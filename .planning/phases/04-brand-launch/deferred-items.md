# Phase 04 — Deferred Items (out-of-scope discoveries)

## From Plan 04-02 execution (2026-04-16)

### DEF-04-02-01 — Build-breaking type error in `src/app/layout.tsx`

**Status:** BLOCKING for `npm run build`, but **out of Plan 04-02 scope**. Owned by the parallel Plan 04-01 executor.

**Discovery:** While running the plan-mandated `npm run build` verify step, the turbopack build worker failed with:

```
./src/app/layout.tsx:94:25
Type error: A type predicate's type must be assignable to its parameter's type.
  Type 'string' is not assignable to type '"" | "info@3dninjaz.com"'.
```

Location: `sameAs: Object.values(SITE.socials).filter((v): v is string => ...)`.

Root cause: `SITE.socials` is declared with `as const`, so `Object.values(...)` returns a tuple of the literal union type `"" | "info@3dninjaz.com"`, which is already `string`. The `v is string` predicate narrows a subtype back to `string`, which TS flags as a non-assignable predicate on a narrower type. Dropping the predicate (or replacing with `Boolean`) fixes it.

**Why not fixed here:** Plan 04-02's scope boundary explicitly excludes `src/app/layout.tsx` ("Do NOT touch src/app/layout.tsx or src/app/icon* or src/app/favicon.ico — 04-01 territory"). Fixing it in this plan would stomp on the parallel 04-01 executor's in-flight work and cause a merge conflict on a file with active edits.

**Workaround used for 04-02 verify:** `npx tsc --noEmit` (repo-wide) passes with exit 0, confirming all Plan 04-02 files type-check cleanly. The error only manifests under turbopack's stricter build-time narrowing. Plan 04-02's own verification step treated `tsc` exit 0 + `Compiled successfully` as the pass signal.

**Suggested fix (for 04-01 owner):**
```ts
sameAs: Object.values(SITE.socials).filter(
  (v) => typeof v === "string" && v.length > 0 && v !== SITE.socials.email,
),
```
Remove the explicit `v is string` type predicate — filter() will still infer `string` from the `typeof` guard.

**Follow-up:** 04-01 executor to resolve before its own build verify, then Plan 04-02 build re-runs clean.
