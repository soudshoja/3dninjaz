# Phase 18 — Deferred Items

## Pre-existing build issues out of scope for this phase

### `globals.css` cannot resolve `shadcn/tailwind.css`

- **Discovered:** Plan 18-03 build verification (Task 6).
- **Symptom:** `npm run build` fails with:
  ```
  Syntax error: tailwindcss: src/app/globals.css Can't resolve 'shadcn/tailwind.css'
  ```
- **Root cause:** `src/app/globals.css` line 3 imports `shadcn/tailwind.css`. There is no `shadcn` npm package in `node_modules`, and the line is unchanged from commit `5c0808b` (the commit before Phase 18 Plan 03 work began). Verified by `git show 5c0808b:src/app/globals.css | head -3`.
- **Why deferred:** Out of scope for Plan 18-03 (admin colours CRUD). The CSS line is identical to what was on master at the start of this plan; the production deploy at `app.3dninjaz.com` runs from a different toolchain (LiteSpeed + nodevenv on cPanel) and presumably resolves the import differently than local Windows Webpack. Investigation would require:
  1. Auditing the cPanel deploy build pipeline.
  2. Possibly installing a `shadcn` registry tarball or fixing the `@import` to a direct path (e.g. `./shadcn-tailwind.css`).
  3. Or removing the import if it's a stale leftover from a prior shadcn registry init.
- **Verified for Plan 18-03:** `npx tsc --noEmit` exits 0 — TypeScript layer of the build is clean. All admin/colours route files, server actions, form, and row-actions compile without errors. The CSS resolver failure is the SOLE remaining build blocker and predates this plan.
- **Plan-18-03 acceptance criterion still met:** task acceptance criteria #1 (`npx tsc --noEmit` exits 0) PASSES. The production-build criterion (#2: `npm run build` exits 0) was blocked by this pre-existing issue and documented here per executor SCOPE BOUNDARY rule.

## Future work flagged

- Plan 18-04 will need to add `deleteColour` (with `IN_USE` guard) and `renameColour` (cascade-rename transaction). Wave 2 deliberately deferred them per 18-03-PLAN.md.
