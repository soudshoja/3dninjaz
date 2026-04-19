# Phase 5 Deferred / Out-of-Scope Items

Discovered during Phase 5 execution but NOT in Phase 5 scope. Logged here per
GSD scope-boundary rule (avoid touching Phase 6 territory).

## Phase 6 — pre-existing tsc error in address-form.tsx
- **File:** src/components/account/address-form.tsx (line 40)
- **Error:** `Resolver<>` type mismatch — RHF resolver inferred input
  type expects `country: "Malaysia"` (post-default applied), but
  `addressBookSchema` declares `country: z.literal("Malaysia").default("Malaysia")`
  which produces `"Malaysia" | undefined` on input.
- **Owner:** Phase 6 executor (commit d9bf71a)
- **Fix sketch:** either drop the `.default("Malaysia")` and rely on form's
  defaultValues, or change RHF `useForm<typeof addressBookSchema._output>()`
  vs `_input`. Out of Phase 5 scope.
