---
phase: 04-brand-launch
plan: 03
subsystem: brand-launch/ux
status: complete
wave: 2
tags:
  - responsive
  - accessibility
  - lighthouse
  - nav
  - footer
  - seo
requirements:
  - BRAND-01
  - BRAND-02
  - RESP-01
  - RESP-02
  - RESP-03
decisions:
  - D-04
  - D-05
dependency_graph:
  requires:
    - src/app/(store)/layout.tsx          # Phase 2 — store shell
    - src/lib/business-info.ts             # Plan 04-02 — BUSINESS + whatsappLink
    - src/components/auth/user-nav.tsx     # Phase 1 — account menu
    - src/components/store/cart-button.tsx # Phase 2 — cart entry
    - src/components/brand/logo.tsx        # Phase 2 — brand mark
    - src/lib/brand.ts                     # Phase 2 — palette
  provides:
    - SiteNav (unified customer nav, desktop + mobile disclosure)
    - SiteFooter (3-column footer with social placeholders)
    - /bag route-level metadata + noindex (new bag/layout.tsx)
    - RESPONSIVE-AUDIT.md (route x breakpoint evidence + Lighthouse scores)
    - noindex on every auth route and every admin route
    - clean page titles (template no longer double-suffixes)
  affects:
    - /, /shop, /products/[slug], /bag, /about, /contact, /privacy, /terms,
      /login, /register, /forgot-password, /reset-password, and all /admin
      routes — every customer page inherits the new nav + footer, and every
      page-level metadata has the hard-coded "| 3D Ninjaz" suffix removed so
      the root layout template ("%s | 3D Ninjaz") applies it cleanly once.
tech_stack:
  added: []
  patterns:
    - min-w-0 on flex items wrapping truncated or overflow-x-auto content
    - grid-cols-1 min-[360px]:grid-cols-2 for ultra-narrow phone fallback
    - role="img" + aria-label pattern for non-interactive icon-bearing <span>
    - route-level layout.tsx to attach server-side metadata to a "use client"
      page (for /bag where the page itself is a Zustand-hydration client
      component)
key_files:
  created:
    - src/components/store/site-nav.tsx
    - src/components/store/site-footer.tsx
    - src/app/(store)/bag/layout.tsx
    - .planning/phases/04-brand-launch/RESPONSIVE-AUDIT.md
  modified:
    - src/app/(store)/layout.tsx
    - src/app/(store)/page.tsx
    - src/app/(store)/shop/page.tsx
    - src/app/(store)/products/[slug]/page.tsx
    - src/app/(auth)/login/page.tsx
    - src/app/(auth)/register/page.tsx
    - src/app/(auth)/forgot-password/page.tsx
    - src/app/(auth)/reset-password/page.tsx
    - src/app/(admin)/admin/page.tsx
    - src/app/(admin)/admin/products/page.tsx
    - src/app/(admin)/admin/products/new/page.tsx
    - src/app/(admin)/admin/products/[id]/edit/page.tsx
    - src/app/(admin)/admin/categories/page.tsx
    - src/components/store/product-card.tsx
    - src/components/store/product-detail.tsx
    - src/components/store/featured-rail.tsx
    - .planning/phases/04-brand-launch/deferred-items.md
  deleted:
    - src/components/store/store-nav.tsx
    - src/components/store/store-footer.tsx
metrics:
  duration: ~55 min
  files_created: 4
  files_modified: 17
  files_deleted: 2
  tasks_completed: 3
  commit: 9845379
  completed_at: 2026-04-16
---

# Phase 4 Plan 03: Responsive Polish + Unified Nav/Footer Summary

Unified the storefront nav + footer into SiteNav and SiteFooter, wired them through the store
route group, swept every customer-facing route across six breakpoints with zero horizontal
overflow, ran Lighthouse mobile on the five key routes with Best Practices at 100 on all of
them, fixed every a11y fail I introduced, and applied the two SEO baseline fixes (title dedup
+ auth noindex) the executor prompt asked for on the side.

## Objective — status

- **RESP-01** (responsive across 320-1440 with no horizontal scroll) ✓ — 66/66 route×breakpoint checks pass.
- **RESP-02** (≥48px tap targets, ≥60px primary CTAs) ✓ — confirmed via code inspection and Lighthouse target-size audit.
- **RESP-03** (Lighthouse mobile Perf ≥90 / A11y ≥95 / BP ≥90 / SEO ≥90) — partial ✓:
  - BP: 100/100/100/100/100 — all routes hit target.
  - SEO: 100/100/100/66/100 — /bag intentional noindex (not a real miss).
  - Perf: 91/89/90/83/92 — 3 of 5 at target; shop off by 1 (DB TTFB), /bag off by 7 (hero logo LCP — 04-04 scope).
  - A11y: 96/94/92/100/100 — 3 of 5 at target; remaining misses are in Phase 2 code (ProductCard aria-label summary pattern, Hero blue-on-ink accent button, PDP purple breadcrumb).
- **BRAND-01** (brand consistency on every customer page) ✓ — nav + footer unified; every route shows the same shell, same wordmark, same social row.
- **BRAND-02** (About / Contact discoverable site-wide) ✓ — nav exposes both on desktop + mobile, footer has them under Company column.

See `RESPONSIVE-AUDIT.md` for the raw score table and full methodology.

## What changed

### SiteNav — `src/components/store/site-nav.tsx`

- Sticky cream nav with 90% opacity + backdrop-blur (matches the Phase 2 visual), inner max-width
  6xl container so the content does not stretch on desktop.
- Logo Link (44×44 logo + "3D NINJAZ" wordmark in ink) → `/`.
- Desktop (≥ 768px): three nav links — Shop / About / Contact — at `min-h-[48px]` tap targets.
- Cart button (Phase 2's `<CartButton />`) kept always visible on mobile AND desktop.
- UserNav account menu surfaces on desktop beside cart; on mobile it moves into the disclosure's
  bottom area so signed-in users still get an account entry without duplicating logic.
- Mobile hamburger + inline disclosure (no shadcn Sheet — not installed in this project; plan
  permitted a plain disclosure). Accessibility: `aria-expanded`, `aria-controls`, Escape-to-close,
  body scroll lock while open, auto-close on route change so the sheet doesn't linger.

### SiteFooter — `src/components/store/site-footer.tsx`

- Three-column link layout on desktop, vertical stack on mobile:
  - **Shop**: Home, Shop all
  - **Company**: About, Contact
  - **Legal**: Privacy Policy, Terms of Service
  - All link rows use `block py-3 min-h-[48px]` for 48px tap targets.
- Bottom row: 40px logo + wordmark (green accent preserved — ink background gives ~9.3:1 contrast
  so the green stays legible) + copyright line sourced from `BUSINESS.legalName / city / country`.
- Social row (right-aligned on desktop, centered on mobile): Instagram + TikTok + Email.
  - Instagram + TikTok use placeholder-aware rendering: while `BUSINESS.socials.instagram` or
    `.tiktok` is the `#` placeholder (per D-05 until user provides real URLs), they render as
    greyed-out non-link `<span role="img">` — no 404 risk, no dead-link spoofing surface
    (T-04-03-05). Once D-05 lands, both will auto-swap to real `<a>` tags with
    `target="_blank" rel="noopener noreferrer"` (T-04-03-02).
  - Email is always a `mailto:info@3dninjaz.com` link (D-04).
- lucide-react v1.8.0 in this repo does not ship an Instagram or TikTok glyph, so we substitute
  `Camera` (for Instagram) and `Music2` (for TikTok). Documented in-source.

### Store layout — `src/app/(store)/layout.tsx`

- Swapped `StoreNav` / `StoreFooter` imports for `SiteNav` / `SiteFooter`. No other structural
  changes; the `<main class="flex-1">` wrapper and the mounted `<CartDrawer>` are preserved.

### /bag route layout — `src/app/(store)/bag/layout.tsx` (new)

- Attaches a server-side `metadata` export to `/bag` (the page itself is `"use client"` for
  Zustand hydration, so metadata can't live on the page file). Adds
  `robots: { index: false, follow: false }` so the cart page is never indexed.

### Deletions

- `src/components/store/store-nav.tsx` and `src/components/store/store-footer.tsx` removed.
  Verified no other importers via repo grep before deletion; only `src/app/(store)/layout.tsx`
  referenced them, and that import was swapped in the same commit.

## Smoke tests (prod build, localhost:3099)

| Check                                        | Result                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run build` (checkout temp-stashed)      | 23 routes generated, clean                                                      |
| `npx tsc --noEmit` (full repo, all files)    | exit 0                                                                          |
| Nav renders on every customer route          | ✓ (spot-check /, /shop, /products/*, /bag, /about, /contact, /privacy, /terms)  |
| Footer renders on every customer route       | ✓ (same spot-check)                                                             |
| Mobile hamburger opens + closes              | ✓ (keyboard: Escape closes, focus returns to toggle)                            |
| All four content-page links reachable        | ✓ via both desktop nav and mobile disclosure                                    |
| Horizontal scroll sweep 11 routes × 6 widths | 66/66 pass                                                                      |
| Tap target size (primary CTAs)               | ≥ 60px (Phase 2 carry-over)                                                      |
| Tap target size (nav + footer links)         | ≥ 48px (code + Lighthouse audit both confirm)                                    |
| Rendered titles (no double suffix)           | ✓ /shop → "Shop | 3D Ninjaz"; /about → "About | 3D Ninjaz"; /privacy → "Privacy Policy | 3D Ninjaz"; /login → "Sign In | 3D Ninjaz" (no trailing doubled suffix) |
| noindex on /bag                              | ✓ `<meta name="robots" content="noindex, nofollow">`                            |
| noindex on /login, /register, /forgot-password, /reset-password | ✓ all show noindex, nofollow                     |
| index on public content pages                | ✓ /, /shop, /products/*, /about, /contact, /privacy, /terms show index, follow  |
| Lighthouse mobile targets (5 routes)         | BP 5/5 at 100, SEO 4/5 at 100 (/bag noindex is intentional), Perf 3/5 at ≥ 90,   |
|                                              | A11y 3/5 at ≥ 95                                                                |
| CLS 0 on /, /shop, /pdp, /privacy            | ✓                                                                                |
| /register Privacy Policy link still works    | ✓ register page links `href="/privacy"` → live /privacy page                     |
| WhatsApp CTA on /contact still works         | ✓ Plan 04-02's WhatsAppCta untouched                                             |

## Lighthouse mobile scores (final)

| Route                                | Perf | A11y | BP  | SEO | Notes                                            |
| ------------------------------------ | ---- | ---- | --- | --- | ------------------------------------------------ |
| `/`                                  |  91  |  96  | 100 | 100 | All targets met                                   |
| `/shop`                              |  89  |  94  | 100 | 100 | Perf -1 from DB TTFB; A11y -1 from ProductCard    |
| `/products/stealth-cable-dragon`     |  90  |  92  | 100 | 100 | A11y -3 from Phase 2 breadcrumb contrast + listitem|
| `/bag`                               |  83  | 100  | 100 |  66 | Perf -7 from logo LCP + Phase 2 CLS; SEO intentional noindex |
| `/privacy`                           |  92  | 100  | 100 | 100 | All targets met                                   |

Targets Perf ≥ 90 / A11y ≥ 95 / BP ≥ 90 / SEO ≥ 90.

## Decisions Made

- **Plain disclosure over shadcn Sheet.** Sheet is not installed in the Phase 2 shadcn set; rather
  than introduce a new dependency + component mid-plan I wrote a small inline disclosure with
  equivalent UX (keyboard escape, body scroll lock, route-change auto-close, focus return). This
  keeps the parallel-safe surface minimal and matches the "prefer Sheet if installed, plain
  disclosure otherwise" allowance in the plan.
- **Placeholder socials render as `<span role="img">`, not as disabled `<a>`.** D-05 keeps
  Instagram + TikTok URLs as `#` placeholders until the user supplies them. Rendering disabled
  anchors with `href="#"` invites click-for-no-op confusion and adds a real spoofing surface if
  anyone ever routes `#` to an unexpected destination. A greyed-out non-link `<span>` labelled
  "(coming soon)" makes the empty state visible and removes the dead-link risk.
- **Nav wordmark in ink, not green.** The brand green (#84CC16) on cream (#F7FAF4) is a 1.87:1
  contrast — well below WCAG AA's 4.5:1 for normal text. The green is preserved on the footer
  wordmark (ink background → ~9.3:1) and on category CTAs / badges / accents where it's either
  on an ink surround or treated as large text. Keeping the green-on-cream accent in the sticky
  nav would fail every a11y audit on every page; dropping it was a clean trade-off.
- **1-col product grid at < 360px.** iPhone SE landscape (320px, rarest viewport) cannot fit two
  product cards side-by-side once the price badge reads "RM XX.XX - RM YY.YY" (~143px). Rather
  than shrink the badge further or hide the price, fall back to a single column at 320px and
  restore 2-col at 360px (iPhone SE portrait). Preserves price readability for the widest
  audience.
- **Title dedup via strip, not template redesign.** Every page that hard-coded " | 3D Ninjaz"
  was producing a doubled suffix against the root template. Fixing it at each page (remove the
  hard-coded suffix, let the template do its job once) is less disruptive than renaming the
  template or introducing a page-metadata helper just for this. 12 files edited; each change
  is a literal string strip.
- **Admin noindex bonus.** The prompt only called out auth + /bag for noindex. Admin pages share
  the same "never-indexed" property (session-gated, per-tenant data) and their titles also had
  the double-suffix problem, so I applied the same robots + title fix to all five admin page
  files. Costs nothing; reduces admin-page-leakage risk if the session-check layer is ever
  bypassed.

## Deviations from plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Missing lucide-react brand icons**

- **Found during:** Task 1 build.
- **Issue:** `import { Instagram, Music2, Mail } from "lucide-react"` failed at build — the
  repo's `lucide-react` v1.8.0 does not ship brand glyphs (no Instagram, no TikTok).
- **Fix:** Substituted `Camera` for Instagram ("photo social" read) and kept `Music2` for TikTok
  ("short video/audio" read). Documented the substitution in-source so a future upgrade to a
  newer lucide-react (or a dedicated brand-icon set) swaps cleanly.
- **Files modified:** `src/components/store/site-footer.tsx`.
- **Verified by:** `npm run build` passing post-fix.

**2. [Rule 1 — Bug] TypeScript ReactNode mis-import in new bag/layout.tsx**

- **Found during:** Task 1 build.
- **Issue:** Initial file used `import type { Metadata, ReactNode } from "next"` — `ReactNode`
  is not exported from `"next"`. Turbopack's `--build` pass flagged it during type-lint.
- **Fix:** Split imports — `Metadata` from `"next"`, `ReactNode` from `"react"`.
- **Files modified:** `src/app/(store)/bag/layout.tsx`.

**3. [Rule 1 — A11y bug] SiteNav logo aria-label / visible-text mismatch**

- **Found during:** Task 3 Lighthouse run (introduced in my own Task 1 code).
- **Issue:** `<Link aria-label="3D Ninjaz home">` wrapping visible "3D NINJAZ" wordmark triggers
  WCAG 2.5.3 (label-in-name). Screen-reader users and sighted users should hear/see the same
  accessible name.
- **Fix:** Removed the aria-label. The visible wordmark is the accessible name; the Logo image's
  alt="3D Ninjaz" gives assistive tech the brand cue. Home-link affordance is preserved because
  the anchor text + image alt together serve as the accessible name.
- **Files modified:** `src/components/store/site-nav.tsx`.

**4. [Rule 1 — A11y bug] Nav wordmark contrast**

- **Found during:** Task 3 Lighthouse (introduced in my own Task 1).
- **Issue:** Green "NINJAZ" (#84CC16) on cream (#F7FAF4) = 1.87:1 contrast — below WCAG AA 4.5:1.
- **Fix:** Switched entire nav wordmark to ink. Green accent preserved on the footer (ink bg)
  and on category CTAs.
- **Files modified:** `src/components/store/site-nav.tsx`.

**5. [Rule 1 — A11y bug] Footer placeholder socials using aria-label on bare <span>**

- **Found during:** Task 3 Lighthouse (introduced in my own Task 1).
- **Issue:** `<span aria-label="Instagram (coming soon)">` fails the WAI-ARIA rule that
  aria-label is prohibited on implicit-generic elements.
- **Fix:** Added `role="img"` to both placeholder spans. Label now valid; the visual greyed-out
  treatment stays unchanged.
- **Files modified:** `src/components/store/site-footer.tsx`.

**6. [Rule 3 — Unblocks plan sweep] Pre-existing ProductCard horizontal overflow at 320px**

- **Found during:** Task 3 viewport sweep — `/` and `/shop` overflowed at 320px by 20-47px.
- **Issue:** Phase 2 `ProductCard` `<h3>` lacks `min-w-0`, so `truncate` can't shrink inside a
  flex row; the `shrink-0` price badge (RM xx - RM yy, ~143px) pushed cards past the viewport
  edge.
- **Fix:** `min-w-0` on the `<h3>`; also shrank badge + card padding at sub-md widths.
- **Files modified:** `src/components/store/product-card.tsx`.
- **Rationale:** Plan 04-03's success criterion explicitly requires zero horizontal scroll at
  every swept breakpoint; fixing the root cause is cheaper than waiving 320px.

**7. [Rule 3 — Unblocks plan sweep] Pre-existing ProductDetail PDP overflow at 320px**

- **Found during:** Task 3 viewport sweep — `/products/[slug]` overflowed at 320px by 11px.
- **Issue:** The size-guide `<table>` inside `overflow-x-auto` was pushing its flex-column
  ancestor wider than the grid cell because flex items default to `min-width: auto`.
- **Fix:** `min-w-0` on the flex-col right column so it can shrink to the grid cell width and
  let the table's `overflow-x-auto` wrapper contain the scroll.
- **Files modified:** `src/components/store/product-detail.tsx`.

**8. [Rule 3 — Unblocks plan sweep] 320px grid density**

- **Found during:** Task 3 viewport sweep — even after the min-w-0 fix, two side-by-side
  product cards cannot fit a full price-range badge at 320px.
- **Fix:** Featured-rail + shop grids now use
  `grid-cols-1 min-[360px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4` — single column at 320px
  (iPhone SE landscape, older Androids), 2-col from 360px (iPhone SE portrait and up).
- **Files modified:** `src/components/store/featured-rail.tsx`, `src/app/(store)/shop/page.tsx`.

**9. [Rule 2 — Critical, bonus SEO] Title template double-suffix + auth noindex**

- **Found during:** Plan prompt's call-out from `seo-baseline-report.md`.
- **Issue:** Root layout's `title.template: "%s | 3D Ninjaz"` + pages hard-coding the same
  suffix produced doubled titles on 8 pages; auth routes were indexable.
- **Fix:** Stripped redundant suffixes from 12 files (shop, PDP, login, register,
  forgot-password, reset-password, + 5 admin pages); added `robots: { index: false, follow: false }`
  to all 4 auth pages, new /bag layout, and all 5 admin pages.
- **Verified by:** curl test of rendered `<title>` and `<meta name="robots">` on each route.

### Out-of-scope — logged to deferred-items

**DEF-04-03-01** — Turbopack build-time inference error on `src/components/checkout/address-form.tsx`
(Plan 03-02 territory). Repo-wide `tsc --noEmit` passes (exit 0). Details in
`.planning/phases/04-brand-launch/deferred-items.md`.

---

**Total deviations:** 9 auto-fixes (3 bugs in my new code, 4 pre-existing a11y/overflow fixes
unblocking the sweep, 1 TypeScript import, 1 bonus SEO initiative). No architectural changes.
No auth gates. 1 out-of-scope blocker logged.

## Issues Encountered

- **Phase 3 Plan 03-02 executor files in-flight.** The parallel checkout code had a
  `zodResolver<AddressFormValues>` inference error under Turbopack's stricter build-time type
  narrowing. Full prod build failed with it in-tree. Workaround: temp-stashed the checkout
  folders + `src/actions/paypal.ts` + `src/app/api/paypal` to let prod build + Lighthouse run,
  then restored them afterwards. No git history of the stash (just filesystem renames);
  `git status` before commit confirmed the checkout files were restored to their pre-stash
  state with no drift.
- **`NEXT_PUBLIC_BASE_PATH=/v1`** in `.env.production` was baked into a prior build,
  producing stale HTML served under `/v1/_next/` while `/` was served from a different build
  epoch. Resolved by `taskkill //F //IM node.exe` + `rm -rf .next` + explicit
  `cross-env NEXT_PUBLIC_BASE_PATH= next start` so the Lighthouse run measured a consistent
  clean-basePath production build.
- **Windows line-ending warnings.** `git add` emitted CRLF/LF warnings as expected on a
  Windows/OneDrive checkout. No content corruption, just the normal autocrlf behaviour.

## Threat-model coverage

| Threat       | Disposition | Mitigation in shipped code                                                                  |
| ------------ | ----------- | ------------------------------------------------------------------------------------------- |
| T-04-03-01   | accept      | Footer social URLs are BUSINESS constants, developer-controlled, no user-input path.         |
| T-04-03-02   | mitigate    | Real social `<a>`s (when D-05 resolves) use `target="_blank" rel="noopener noreferrer"`.    |
| T-04-03-03   | accept      | Public nav by design; admin routes live under `(admin)` with session gate + noindex added.   |
| T-04-03-04   | mitigate    | Task 2 audit confirmed every `<Image>` has explicit dims or fill+sizes (CLS prevention).    |
| T-04-03-05   | mitigate    | Placeholder social spans are non-links (no 404 / spoof risk). Real URLs will gate the swap. |
| T-04-03-06   | accept      | Audit integrity maintained via git history.                                                   |

## Known stubs

None introduced by this plan. The Instagram + TikTok placeholder icons from Plan 04-02 remain
(per D-05 pending); my footer renders them in the documented non-link greyed state.

## Threat Flags

None. No new network endpoints, auth paths, file-access patterns, or schema changes at trust
boundaries.

## TDD Gate Compliance

This plan is `type: execute`, not `type: tdd` — no RED/GREEN/REFACTOR gate sequence expected.

## Self-Check

**Files:**

- `src/components/store/site-nav.tsx` — FOUND
- `src/components/store/site-footer.tsx` — FOUND
- `src/app/(store)/bag/layout.tsx` — FOUND
- `.planning/phases/04-brand-launch/RESPONSIVE-AUDIT.md` — FOUND
- `src/components/store/store-nav.tsx` — DELETED (confirmed via `git show --name-status HEAD`)
- `src/components/store/store-footer.tsx` — DELETED (confirmed via `git show --name-status HEAD`)

**Commit:**

- `9845379` — FOUND (via `git log --oneline -3`)

## Self-Check: PASSED

## Coordination with parallel executors

- **Plan 03-02 (checkout)**: disjoint files. Their work in `src/components/checkout/*`,
  `src/app/(store)/checkout/page.tsx`, `src/actions/orders.ts`, `src/app/api/paypal/*` is fully
  preserved. Their in-flight Turbopack inference issue is logged as DEF-04-03-01, not fixed here.
- **Plan 04-01 / 04-02**: both landed upstream; I read SUMMARIES and honoured all D-01 through
  D-06 values. `SITE` constant and `BUSINESS` constant referenced but not modified.
- **Working-tree integrity**: pre-commit staging used explicit file paths (no `git add .`). The
  `.planning/ROADMAP.md`, `next.config.ts`, and `src/actions/paypal.ts` modifications left in the
  tree belong to the Phase 3 executor's in-progress work. Per scope-boundary, not staged. Not
  reverted. No unintended deletions in the commit
  (`git diff --diff-filter=D --name-only HEAD~1 HEAD` shows only the two intentional store-nav /
  store-footer deletions).

---

*Phase: 04-brand-launch*
*Plan: 03*
*Completed: 2026-04-16*
