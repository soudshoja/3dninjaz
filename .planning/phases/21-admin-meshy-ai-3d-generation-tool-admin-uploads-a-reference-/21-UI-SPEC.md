# Phase 21 UI Design Contract: Admin Meshy AI 3D Generation Tool

**Gathered:** 2026-07-07
**Method:** ui-ux-pro-max design intelligence search + direct precedent audit of this codebase's existing `/admin/*` pages (orders list, order status badges, dispute evidence uploader) — brand/pattern values below come from the codebase, NOT from ui-ux-pro-max's generic output (its default color/font suggestions for a generic "admin dashboard" query were indigo/Fira Code, which contradicts this project's already-locked brand and was discarded; its UX-state and shadcn-table guidance was kept, see rationale below).

<domain>
## Scope

Three admin-only pages: list, upload/create, detail/review. Internal tool — no customer-facing surface, no mobile-first requirement (admin desktop-first, but must not break on tablet since staff may review on the shop floor).
</domain>

<decisions>
## Design System (locked — matches existing project brand, do not introduce new tokens)

- **Colors:** `BRAND.blue` #1E8BFF, `BRAND.green` #39E600, `BRAND.purple` #A855F7, `BRAND.ink` #0B1020, `BRAND.cream` #F7FAF4. Import from `@/lib/brand` — never hardcode hex in new components (existing convention, see `admin-order-status-badge.tsx`).
- **Typography:** `font-[var(--font-heading)]` for page titles (h1/h2), default body font elsewhere. No new font import — Fira Code/Fira Sans from the generic ui-ux-pro-max search is REJECTED, this project uses Chakra Petch as its display face already.
- **Page wrapper:** `<main className="min-h-screen" style={{backgroundColor: BRAND.cream, color: BRAND.ink}}>` → `<div className="mx-auto max-w-6xl px-4 py-8">` — exact pattern from `src/app/(admin)/admin/orders/page.tsx`. Reuse verbatim for `/admin/meshy`.
- **Cards:** `rounded-2xl` white cards for empty states and detail panels, matching the orders page's `rounded-2xl p-8 text-center` empty-state block.
- **Component library:** shadcn/ui `<Table>` (TableHeader/TableBody/TableRow/TableCell/TableHead) for the list view — ui-ux-pro-max flagged this as the correct primitive over a div-grid; adopt it, this project doesn't currently use shadcn Table anywhere but should for a genuinely tabular list (status/thumbnail/date/credits columns).
- **Forms:** plain `useState` + `useTransition` + a Server Action, NOT react-hook-form/Zod-resolver. ui-ux-pro-max's shadcn guidance recommends RHF+Zod, but this project's actual upload-form precedent (`dispute-evidence-uploader.tsx`) uses controlled state + `useTransition` + client-side guard mirroring a server-side check — match that, not the generic recommendation, for consistency with every other admin upload flow in this codebase.
- **Icons:** Lucide (already the project's icon set per CLAUDE.md — "Lucide React ... consistent style").
- **No emoji icons, cursor-pointer on all clickable rows/buttons, 150-300ms transitions, disable-and-spinner on every async button** — carried over from ui-ux-pro-max's UX-guideline domain search, these are genuinely useful cross-cutting rules this codebase already mostly follows.

## Status badge (NEW component: `admin-meshy-status-badge.tsx`)

Mirror `admin-order-status-badge.tsx` exactly — same `STATUS_THEME` record pattern, same pill shape (`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide`), tinted bg (`${BRAND.color}22`) + solid fg, `aria-label`.

| Status | bg | fg | label |
|---|---|---|---|
| `generating` | `${BRAND.blue}22` | `BRAND.blue` | "Generating" |
| `awaiting_review` | `${BRAND.purple}22` | `BRAND.purple` | "Awaiting review" |
| `revising` | `${BRAND.purple}22` | `BRAND.purple` | "Revising" |
| `analyzing` | `${BRAND.blue}22` | `BRAND.blue` | "Analyzing" |
| `repairing` | `#fef3c7` | `#92400e` | "Repairing" |
| `processing_multicolor` | `#fef3c7` | `#92400e` | "Processing colors" |
| `ready` | `${BRAND.green}22` | `BRAND.green` | "Ready" |
| `failed` | `#fee2e2` | `#991b1b` | "Failed" |
| `canceled` | `${BRAND.ink}18` | `BRAND.ink` | "Canceled" |

(amber tones `#fef3c7`/`#92400e` and red `#fee2e2`/`#991b1b` already appear as literal values in `admin-order-status-badge.tsx` for its own in-review/terminal-failure states — reuse those exact values rather than inventing new ones, keeps the two badge components visually paired.)

## Page 1: `/admin/meshy` (list)

```
[Page wrapper: cream bg, max-w-6xl]
  <header>
    h1 "Meshy Generations"                    [+ New Generation button, top-right, BRAND.green]
    p  "Photo → 3D model → print-ready file"
  </header>

  <Table>
    <TableHeader>
      Thumbnail | Prompt/Source | Status | Credits Used | Created | (row click → detail)
    </TableHeader>
    <TableBody>
      {each generation}
        TableRow, cursor-pointer, hover:bg-black/[0.02], onClick → /admin/meshy/[id]
        - Thumbnail cell: 48x48 rounded-lg <img> from localThumbnailPath, OR a
          neutral placeholder icon (Lucide `ImageOff`) if still generating/no
          thumbnail yet — never point at meshyThumbnailUrl (expires)
        - Status cell: <AdminMeshyStatusBadge status={...} />
        - Credits cell: right-aligned, tabular-nums
    </TableBody>
  </Table>

  Empty state (0 generations): rounded-2xl centered card, "No generations yet."
  + New Generation CTA inside the empty card (matches orders page empty-state pattern)
</main>
```

**Loading state:** skeleton rows (animate-pulse bg-black/5 blocks matching column widths) while the list server-fetches — per ui-ux-pro-max's "Loading States" rule (skeleton over blank screen for >300ms operations). Given this is a server component reading from Drizzle directly (standard pattern in this repo), the skeleton only matters if a client-side polling refresh is added later; for the initial SSR load a skeleton isn't needed (no client-side wait).

## Page 2: `/admin/meshy/new` (upload — dedicated page, not a modal)

Reasoning for a dedicated page over a modal: the upload form has real content (photo + prompt + guardrail copy) and the admin may want to reference the pre-flight guidance while composing — a full page matches the weight of `dispute-evidence-uploader.tsx`'s form, not a lightweight modal action.

```
[Page wrapper, max-w-2xl narrower than list — this is a focused single-task form]
  <header> h1 "New Generation" </header>

  <form> (plain useState + useTransition + Server Action, per dispute-evidence-uploader.tsx pattern)
    Photo upload:
      - Single-file <input type="file" accept="image/jpeg,image/png"> behind a
        styled dropzone-look button (not a raw file input — match the visual
        weight of other admin upload components)
      - Live thumbnail preview once selected (URL.createObjectURL)
      - Guardrail copy directly under the dropzone, small muted text:
        "Best results: single centered subject, plain background, even
        lighting. Busy/cluttered photos often fail to generate."
      - Client-side size guard mirroring server check (max file size — reuse
        whatever cap the upload pipeline elsewhere in this repo enforces)

    Style prompt (optional):
      - <textarea> 3 rows, 600 char hard cap with a live "N/600" counter
        (exact pattern already used elsewhere in this codebase for prompt/
        text-length fields — reuse that counter component if one exists,
        e.g. the keychain text field's "0/8"-style counter convention)

    Submit:
      - <Button> BRAND.green, disabled while pending, shows a spinner +
        "Generating..." label during useTransition pending state
      - On success: router.push to /admin/meshy/[newId] (straight to detail
        page, which will show status=generating with a live poll)
      - On error (e.g. pre-flight rejection): inline error banner ABOVE the
        form (not a toast — matches this project's existing inline-error
        convention for admin forms), specific message from the pre-flight
        check (image_too_complex etc.), not a generic "failed"
  </form>
```

## Page 3: `/admin/meshy/[id]` (detail/review — the most novel page)

```
[Page wrapper, max-w-6xl, two-column on desktop >= lg, stacked on mobile/tablet]

  <header>
    ← Back to Meshy Generations
    h1 "{prompt or 'Untitled generation'}"        <AdminMeshyStatusBadge />
    p  "Created {date} by {admin name}"
  </header>

  [LEFT COLUMN — ~60% width]

    3D Model Viewer card (rounded-2xl, white, aspect-square):
      - <model-viewer> web component pointed at the LOCAL glb path
        (localModelFiles.glb) — NEVER meshyThumbnailUrl/model_urls directly
      - While status=generating (no local glb yet): show the ORIGINAL
        uploaded source photo instead, with a subtle pulsing border/overlay
        + small caption "Generating 3D model..." — never a blank/black box
        (direct lesson from the earlier keychain-3D-preview incident this
        session: a placeholder must ALWAYS render something, never nothing)
      - Below the viewer: a horizontal row of small action buttons that
        change based on status (see State Matrix below)

    Revision History (below the viewer, only rendered if meshy_revisions
    rows exist):
      - Vertical list, most recent first, each row:
        "Revision {N} · {endpointUsed label} · {date}"
        + changeNote text if present
        + small thumbnail if that revision produced one
      - Collapsed/expandable if > 3 revisions (accordion, not infinite scroll)

  [RIGHT COLUMN — ~40% width, sticky on desktop]

    Printability Report card (rounded-2xl, white) — ONLY rendered once
    printabilityStatus is non-null (i.e. after Approve → Analyze has run).
    This is the one genuinely new UI pattern in this codebase — spec below.

    Credits card: small rounded-xl card, "{creditsUsed} credits used this
    generation" — plain text, right-aligned number, no chart needed at this
    scale (ui-ux-pro-max's chart-domain guidance is irrelevant here, this
    is a single running total, not a data series).

    Download card (only when status=ready):
      - "Download STL" button (BRAND.blue), "Download 3MF" button (BRAND.
        purple, only shown if isMultiColor) — both hit the authenticated
        route handler, both trigger a real browser download not a new tab

### State Matrix — action buttons under the model viewer

| status | Buttons shown |
|---|---|
| `generating` | none (disabled "Generating..." ghost button with spinner) |
| `awaiting_review` | "Request Retexture" (opens inline prompt textarea, secondary style) · "Regenerate" (secondary, confirm-dialog "this creates a new full-price generation") · "Approve" (primary, BRAND.green) |
| `revising` | none, same generating-style ghost state |
| `analyzing` | none, ghost state, label "Checking printability..." |
| (after analyze resolves, still same `analyzing`→ transitions to next) | Printability Report card appears; if `printabilityStatus` is `warning`/`error`, an additional **"Repair this model? (10 credits)"** button appears in that card itself (not under the viewer) — per the locked decision, this requires an explicit click, never auto-fires |
| `repairing` | ghost state, "Repairing..." |
| (healthy or post-repair, multicolor not yet run) | "Run Multi-Color Conversion (10 credits)" button appears (secondary, BRAND.purple outline) — optional, admin's choice, not forced into the happy path |
| `processing_multicolor` | ghost state, "Converting to multi-color..." |
| `ready` | Download card becomes active (see above); model viewer keeps showing the final glb |
| `failed` | Error banner card instead of the report card: shows `taskErrorType` + `taskErrorMessage` in plain language, "Try Again" button that goes back to a fresh `/admin/meshy/new` (not a silent retry — a failed generation's task is dead, per the retry-policy rule in the skill: `invalid_input` errors must surface to the admin, never auto-retry) |
| `canceled` | Same as failed but neutral/ink-toned banner, no error detail needed |

### Printability Report card (NEW pattern — spec in full since nothing like it exists in this codebase yet)

```
┌─────────────────────────────────────┐
│  Printability Check          [pill] │  <- pill: "Healthy" (green) /
│                                       │     "Needs attention" (amber) /
│                                       │     "Not printable" (red) /
│                                       │     "Unknown" (grey) — same tinted-
│                                       │     pill visual language as the
│                                       │     status badge, NOT a new pattern
│  ✓ Watertight                        │  <- each diagnostic row: Lucide
│  ⚠ 12 non-manifold edges             │     Check (green) or AlertTriangle
│  ✓ No holes detected                 │     (amber) icon + label + value.
│  ✓ No degenerate faces               │     Only render rows the analyze
│                                       │     response actually returned —
│                                       │     don't fabricate zeros for
│                                       │     fields Meshy didn't send.
│  [Repair this model? (10 credits)]   │  <- ONLY rendered if pill is
└─────────────────────────────────────┘     amber/red. Secondary button
                                             style (BRAND.blue outline),
                                             NOT green/primary — this is a
                                             deliberate spend decision, not
                                             the happy-path action.
```

Card header pill uses the SAME color mapping as `printabilityStatus` (healthy=green, warning=amber, error=red, unknown=ink-grey) — reuse the tinted-pill pattern from the status badge rather than inventing a fourth visual language for "is this thing okay" states across three different UI surfaces (order status, generation status, printability status all use the same pill grammar now).

</decisions>

<specifics>
## Component file list for the planner

New files:
- `src/components/admin/admin-meshy-status-badge.tsx` — mirrors `admin-order-status-badge.tsx`
- `src/components/admin/admin-meshy-list.tsx` (or inline in the page if simple enough) — the shadcn Table
- `src/components/admin/admin-meshy-upload-form.tsx` — mirrors `dispute-evidence-uploader.tsx` structurally
- `src/components/admin/admin-meshy-detail.tsx` — the two-column layout, model-viewer, action-button state machine
- `src/components/admin/admin-meshy-printability-card.tsx` — the new report card pattern above
- `src/components/admin/admin-meshy-revision-history.tsx` — the accordion list

Routes:
- `src/app/(admin)/admin/meshy/page.tsx`
- `src/app/(admin)/admin/meshy/new/page.tsx`
- `src/app/(admin)/admin/meshy/[id]/page.tsx`

Sidebar nav: add a "Meshy" or "3D Generation" entry to the existing admin sidebar nav component (find it via wherever "Colours"/"Coupons" entries live per the memory note on colour-management's sidebar entry — same list, same styling, new icon e.g. Lucide `Box` or `Sparkles`... actually avoid `Sparkles` (reads as an "AI magic" cliché icon) — prefer `Box` or `Cuboid` for a literal 3D-object icon).
</specifics>

<canonical_refs>
## Canonical References

- `src/components/admin/admin-order-status-badge.tsx` — status badge pattern to mirror exactly
- `src/components/admin/dispute-evidence-uploader.tsx` — upload form pattern (controlled state + useTransition + Server Action) to mirror
- `src/app/(admin)/admin/orders/page.tsx` — page wrapper + empty-state pattern to mirror
- `src/lib/brand.ts` — BRAND color constants, import not hardcode
- `.planning/phases/21-admin-meshy-ai-3d-generation-tool-admin-uploads-a-reference-/21-CONTEXT.md` — the architecture decisions this UI must serve (status enum values, printabilityReport JSON shape, action semantics)
</canonical_refs>

<deferred>
## Deferred Ideas

- Data-table sorting/filtering/pagination (TanStack Table) — v1 volume (~15-25 generations/month) doesn't need it, a plain table is fine; add if the list ever gets long enough to matter.
- Live SSE progress bar — v1 uses polling per 21-CONTEXT.md; a simple "Generating..." ghost state is enough, no percentage-based progress bar (Meshy doesn't expose fine-grained progress anyway, only PENDING/IN_PROGRESS/SUCCEEDED/FAILED).
- Chart/analytics view of credit spend over time — noted as irrelevant at this scale in the decisions above; revisit only if usage volume grows enough to want a trend view.
</deferred>
