---
status: partial
phase: 21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-
source: [21-VERIFICATION.md]
started: 2026-07-08T00:00:00Z
updated: 2026-07-08T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. SMOKE Part A — dev UI walkthrough (test-mode key, zero cost)
expected: Run 21-SMOKE.md items 1-17 on dev (app.3dninjaz.com) as a logged-in admin. All 17 pass; item 10 (Approve) fails gracefully with "Could not start printability analysis. Try again shortly." — this is correct dev behavior since Meshy's test-mode key rejects print/analyze.
result: [pending]

### 2. Sweep cron registration + closed-tab check
expected: Register the `*/5` crontab line on dev per 21-DEPLOY-NOTES.md §3 (or run the sweep once by hand via SSH), then run SMOKE item 14. An orphaned in-flight row advances without any client polling; sweep log shows `[meshy-sweep]` lines.
result: [pending]

### 3. SMOKE Part B — prod-gated real-credit run
expected: After Part A is approved and prod cutover is done (real MESHY_API_KEY, MESHY_STORAGE_DIR, mkdir per 21-DEPLOY-NOTES.md), run items 18-24: real model, Approve → ready with real printability data, repair flow, STL opens in Bambu Studio, multi-color 3MF with color regions, credit reconciliation, 3-day retexture window (record findings into 21-CONTEXT.md). All pass; downloads open cleanly in Bambu Studio.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
