# Phase 02 Deferred Items

Out-of-scope discoveries during Phase 02 execution. Not blocking Phase 02 completion but should be addressed in a subsequent phase or GSD-quick.

## Pre-existing TypeScript error in `src/lib/orders.test.ts`

**Observed:** `npx tsc --noEmit` reports
`src/lib/orders.test.ts(7,8): error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.`

The file imports from `"./orders.ts"` (explicit `.ts` extension). `tsconfig.json` does not enable `allowImportingTsExtensions`, so the compiler flags it.

**Origin:** File exists from Phase 1 (orders test/lib scaffolding). Not touched in Phase 02.

**Fix:** Either drop the `.ts` extension (standard ESM resolution) or enable `allowImportingTsExtensions: true` + `noEmit: true` in `tsconfig.json`. Takes 30 seconds. Recommend a GSD-quick task before Phase 03 since Phase 03 will likely add more order-related tests and this error will keep surfacing.

**Impact on Phase 02:** None. All Phase 02 files typecheck cleanly. Dev/runtime behavior unaffected (Next.js + SWC handles `.ts` imports at runtime).
