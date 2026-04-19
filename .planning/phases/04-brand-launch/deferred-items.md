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

## From Plan 04-03 execution (2026-04-16)

### DEF-04-03-01 — Turbopack build-time RHF resolver inference error in `src/components/checkout/address-form.tsx`

**Status:** BLOCKING for `npm run build` (turbopack), but **out of Plan 04-03 scope**. Owned by the parallel Plan 03-02 executor (Phase 3 Wave 2 checkout work).

**Discovery:** Running the plan-mandated `npm run build` verify step failed with:

```
./src/components/checkout/address-form.tsx:29:5
Type error: Type 'Resolver<{ ...; country?: "Malaysia" | undefined; }>' is not assignable to type
'Resolver<{ ...; country: "Malaysia"; }>'.
  Types of parameters 'options' and 'options' are incompatible.
    Type 'string | undefined' is not assignable to type 'string'.
```

Location: `useForm<AddressFormValues>({ resolver: zodResolver(orderAddressSchema), ... })`.

Root cause: Zod schema produces `country: "Malaysia"` (required literal) but the inferred
`AddressFormValues` has `country?: "Malaysia" | undefined` (optional with default), creating a
resolver generic mismatch. Typical fixes: use `zodResolver<AddressFormValues>(...)` with explicit
generic, or align the schema's `.default("Malaysia")` with a `.pipe(z.literal("Malaysia"))` to
strip optionality, or update `AddressFormValues` type to match.

**Why not fixed here:** Plan 04-03 scope explicitly excludes `src/components/checkout/*` and
`src/actions/orders.ts` — those are Plan 03-02 territory under active parallel execution. Touching
them would stomp 03-02's in-flight work.

**Workaround used for 04-03 verify:**
- `npx tsc --noEmit` (repo-wide) passes with exit 0 — my Plan 04-03 files type-check cleanly.
- The turbopack build error is isolated to the checkout form; it does not touch any Plan 04-03 file.
- Next's dev server + start server cover the routes Plan 04-03 actually sweeps (storefront
  pages; `/checkout` is intentionally out of scope of the responsive audit because it is stubbed
  during parallel execution).

**Suggested fix (for 03-02 owner):** Either add explicit generic `useForm<AddressFormValues>`
with `zodResolver<AddressFormValues, unknown, AddressFormValues>(orderAddressSchema)`, or update
the form values type to make `country` required (drop the `?`), or change the schema default
pattern to use `.transform()` so the output type retains the literal.

**Follow-up:** 03-02 executor to resolve before its own build verify.
