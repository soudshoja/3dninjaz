---
phase: 05
plan: 05
status: complete
subsystem: admin CSV bulk import
tags: [admin, csv, bulk-import, transactional, ssrf-defense]
dependency_graph:
  requires: [05-01]
  provides:
    - "/admin/products/import 3-stage UI (upload → preview → commit)"
    - "POST /api/admin/bulk-import upload endpoint"
    - "src/lib/csv.ts streaming parse + row normaliser"
    - "src/actions/admin-bulk-import.ts previewCsv + commitCsvImport"
key_files:
  created:
    - src/lib/csv.ts
    - src/actions/admin-bulk-import.ts
    - src/app/api/admin/bulk-import/route.ts
    - src/app/(admin)/admin/products/import/page.tsx
    - src/components/admin/csv-upload.tsx
    - src/components/admin/csv-preview.tsx
    - src/components/admin/csv-commit-report.tsx
decisions:
  - "Q-05-05 resolved: REJECT external image URLs to keep SSRF surface zero. Admin must upload images via existing image-uploader BEFORE CSV import and reference /uploads/products/... paths."
  - "Single transaction commit: any row failure rolls back ALL inserts. 'Best-effort partial import' was rejected — easier to re-run a fixed CSV than reconcile half-imported rows."
  - "Template CSV generated client-side from a 12-column header constant (no separate static file)."
  - "24h cleanup of /public/uploads/imports/ files is deferred (TODO)."
metrics:
  duration: ~30 min
  completed: 2026-04-19
---

# Phase 5 Plan 05-05: Admin CSV Bulk Product Import Summary

**One-liner:** Admin can upload a CSV (≤5MB, ≤1000 rows) at `/admin/products/import`, see a per-row valid/invalid preview with field-level errors, and commit the valid rows in a single transactional insert that rolls back on any failure.

## Architecture

```
Browser → POST /api/admin/bulk-import (multipart, 5MB cap, .csv only)
  └─> public/uploads/imports/<uuid>.csv → returns { fileName }
Browser → previewCsv(fileName) server action
  └─> parseCsvStream → normalizeCsvRow → bulkImportRowSchema → slug dedup
      → returns { validRows, invalidRows, summary }
Browser → commitCsvImport(fileName) server action (after confirm dialog)
  └─> previewCsv re-run + db.transaction(insert each row)
      → unlinks the temp file → returns { successes, failures }
```

## CSV columns (template)

```
name, slug, description, category_name, price_s, price_m, price_l,
material_type, estimated_production_days, image_url_1, image_url_2, image_url_3
```

- `slug` is optional; auto-derived from `name` via `slugifyForImport`.
- `category_name` must match an existing category (case-insensitive); if missing, the row is flagged invalid (admin creates category first).
- At least one of `price_s`/`price_m`/`price_l` is required (Zod `refine`).
- `image_url_N` columns must be `/uploads/products/...` paths; external `http(s)://` URLs are REJECTED (Q-05-05 / T-05-05-SSRF).

## Threat mitigations engaged

| Threat | Mitigation |
|---|---|
| T-05-05-EoP | `requireAdmin()` first await in every server action + API route |
| T-05-05-injection | 5 MB cap, 1000 row cap, strict column count |
| T-05-05-SSRF | External `http(s)://` image URLs rejected at normaliser |
| T-05-05-path-traversal | filename sanitised via `[^a-zA-Z0-9-.]` regex; constrained to `public/uploads/imports/` |
| T-05-05-state | Single `db.transaction`; any failure rolls back all inserts |
| T-05-05-storage | UUID file names; deleted after commit; 24h cleanup TODO |
| T-05-05-dup-slug | Dedup against existing DB slugs AND within the CSV |
| T-05-05-DoS | Accepted; mitigated by `requireAdmin()` (single trusted user) |

## UI

- **Upload zone**: drag-drop + file picker, client-side `.csv` extension check, 5MB pre-check, "Download template CSV" link generates a 12-column file with one example row.
- **Preview**: 3 stat cards (Total/Valid/Invalid in brand colors), Valid/Invalid tabs. Valid table shows first 100 rows with name/slug/prices/category/image count. Invalid table shows row index + per-field errors + raw data.
- **Commit**: Disabled when valid count = 0. 2-step confirm dialog ("Import N products? Cannot be undone.").
- **Report**: 2 stat cards (Imported/Failed), list of imported slugs (linked to PDP), failures by row, JSON download, link back to /admin/products.

## Mobile validation

- Upload zone is full-width on mobile.
- Preview tables are inside `min-w-[700-820px] overflow-x-auto` cards.
- Commit button is `min-h-[60px]` (D-04 primary CTA).
- 2-step confirm dialog buttons stack vertically on `<sm`.

## Deferred

- **Nightly cleanup** of orphan files in `public/uploads/imports/` after 24h. Add a cron task per phase 4 deploy notes (Option A `@reboot` precedent).

## Self-Check: PASSED

- ✅ All 7 created files exist (commit 5adf35b)
- ✅ /api/admin/bulk-import route accepts multipart, requires admin
- ✅ /admin/products/import renders the 3-stage UI
- ✅ tsc --noEmit clean
