---
phase: 04-brand-launch
plan: 01
subsystem: seo
tags: [metadata, open-graph, twitter-card, json-ld, favicons, schema-org, nextjs15]

requires:
  - phase: 01-foundation
    provides: Next.js 15 App Router scaffold with root layout.tsx and Russo One + Chakra Petch font wiring to extend.
provides:
  - Full Next.js 15 Metadata object on every route (title template, description, keywords, openGraph, twitter, robots, alternates.canonical, metadataBase).
  - Separate Viewport export with themeColor #0B1020 and accessibility-safe maximumScale 5.
  - Multi-size favicon set served via Next.js file-based icon convention (icon.png 512, icon-16/32/192/512.png, apple-icon.png 180, favicon.ico).
  - Organization + WebSite JSON-LD blocks emitted on every page via a React-safe JsonLd server component using text-children escaping.
  - Centralised SITE constant in src/lib/site-metadata.ts as the single source of truth for future page-level metadata helpers.
  - Default Open Graph card at /og-default.png (placeholder from logo.png, pending dedicated 1200x630 design pass).
affects:
  - 04-02-static-content (About/Contact/Privacy/Terms pages import SITE for per-page metadata and JSON-LD)
  - 04-03-responsive-polish (viewport meta already in place; no changes required)
  - 04-04-launch-readiness (robots index:true, canonical, sitemap/robots.ts integrate against metadataBase)
  - Future phases: all page-level `generateMetadata()` helpers import SITE

tech-stack:
  added:
    - "Next.js 15 file-based icon convention (src/app/icon*.png, apple-icon.png)"
    - "Schema.org JSON-LD (Organization + WebSite)"
  patterns:
    - "Centralised SITE constant imported by root layout and page-level metadata"
    - "Safe JSON-LD rendering via React text-children (auto-escaped)"
    - "Viewport separated from Metadata per Next.js 15 API"

key-files:
  created:
    - "src/lib/site-metadata.ts"
    - "src/components/seo/json-ld.tsx"
    - "public/og-default.png"
    - "src/app/icon.png"
    - "src/app/icon-16.png"
    - "src/app/icon-32.png"
    - "src/app/icon-192.png"
    - "src/app/icon-512.png"
    - "src/app/apple-icon.png"
  modified:
    - "src/app/layout.tsx"
    - "src/app/favicon.ico (overwrote Next scaffold placeholder)"

key-decisions:
  - "Reuse logo.png as v1 og-default.png placeholder; defer 1200x630 social-card design to a future plan."
  - "Render JSON-LD via React text-children escaping — safer, matches Next.js docs pattern, and SITE data is fully server-controlled."
  - "Emit WebSite.potentialAction SearchAction pointing at /shop?q={search_term_string} even though search is not yet built — safe forward-declaration, better SEO when search ships."
  - "Build sameAs from an explicit [instagram, tiktok] array (not Object.values on socials) so email is not accidentally leaked into a social-profile field."
  - "Keep robots: index:true here; coming-soon noindex removal is a separate Plan 04-04 concern."

patterns-established:
  - "SITE single-source-of-truth: future pages must import SITE from @/lib/site-metadata instead of hard-coding brand strings."
  - "JsonLd component: drop-in server component for any schema.org block; extend with additional JSON-LD types (Product, Breadcrumb) in later phases."
  - "File-based icons: no manual <link rel=\"icon\"> markup — add PNGs to src/app/ and Next.js handles the rest."

requirements-completed: [BRAND-01, BRAND-05]

status: complete
duration: 10m
completed: 2026-04-19
---

# Phase 4 Plan 01: Root Metadata + Favicons + JSON-LD Summary

**Replaced placeholder Print Ninjaz metadata with full Next.js 15 Metadata + Viewport exports sourced from a centralised SITE constant; installed multi-size favicon set via file-based icon convention; mounted React-safe Organization + WebSite JSON-LD blocks in the root layout.**

## Performance

- **Duration:** ~10 min (execution only; does not include parallel-coordination wait)
- **Started:** 2026-04-19T16:35:45Z
- **Completed:** 2026-04-19T16:45:41Z
- **Tasks:** 3
- **Files modified:** 10 (3 created for Task 1, 7 for Task 2, 1 modified for Task 3)
- **Commits:** 3 atomic task commits on `master`

## Accomplishments

- Root layout now emits a brand-polished `<head>` on every route: Open Graph (10 tags), Twitter Card (4 tags), theme-color (#0B1020), canonical URL, and two JSON-LD blocks (Organization + WebSite).
- Multi-size favicon set (16/32/192/512 PNGs + apple-touch 180 + legacy .ico) in place via Next.js 15 file-based convention — no manual `<link rel="icon">` markup required.
- SITE single-source-of-truth in `src/lib/site-metadata.ts` unblocks per-page `generateMetadata()` helpers in Plans 04-02 and later.
- JsonLd server component is re-usable for future schema.org types (Product, Breadcrumb, LocalBusiness).
- Build passes (`npm run build` → 23 routes generated, layout.tsx types clean). Dev server smoke test at port 3011 confirmed all metadata and icon routes render and serve correctly.

## Task Commits

Each task was committed atomically on `master` (parallel-safe — no files overlap with Phase 3 Wave 1 or Plan 04-02 executors):

1. **Task 1: SITE metadata module + JsonLd component + OG default image** — `26db83b` (feat)
2. **Task 2: Install multi-size favicon set via Next.js 15 file-based icons** — `17389cf` (feat)
3. **Task 3: Upgrade root layout with full Metadata, Viewport, and JSON-LD** — `a71d82b` (feat)

No plan-metadata commit (per coordination protocol, STATE.md and ROADMAP.md left untouched so the Phase 3 Wave 1 executor owns them during this parallel window).

## Files Created / Modified

- `src/lib/site-metadata.ts` (created) — `SITE` constant + `SiteMetadata` type: name, legalName, url, tagline, description, keywords, locale (`en_MY`), themeColor (`#0B1020`), socials (instagram/tiktok placeholders, email `info@3dninjaz.com` per D-04), ogImage. Reflects DECISIONS.md D-02 and D-05.
- `src/components/seo/json-ld.tsx` (created) — Typed server component rendering `<script type="application/ld+json">` via React text-children escaping. Zero unsafe-HTML surface; content is always `JSON.stringify`'d from server-controlled objects.
- `public/og-default.png` (created) — v1 copy of `public/logo.png`. TODO in `site-metadata.ts` flags future 1200×630 redesign.
- `src/app/icon.png` (created, 512×512, 176 KB) — primary favicon, served by Next at `/icon.png`.
- `src/app/icon-16.png`, `src/app/icon-32.png`, `src/app/icon-192.png`, `src/app/icon-512.png` (created) — explicit size variants.
- `src/app/apple-icon.png` (created, 180×180) — iOS home-screen icon.
- `src/app/favicon.ico` (modified — overwrote Next.js scaffold placeholder with brand favicon).
- `src/app/layout.tsx` (modified) — added `import type { Viewport }`, `SITE` import, `JsonLd` import; replaced placeholder metadata with full Metadata object; added Viewport export; mounted two JsonLd blocks after `{children}`. Fonts (Russo One + Chakra Petch) and `<html lang="en">` unchanged.

## Decisions Made

- **SITE as single source of truth.** Every brand-level string (name, description, tagline, theme color, socials) now lives in one module. Page-level metadata helpers in Plan 04-02 and beyond must import SITE rather than re-declaring values.
- **Safe JSON-LD pattern.** Chose React text-children escaping over raw-HTML injection — Next.js docs recommend this pattern, verifier checks it, and all JSON-LD inputs are server-side constants so there is no XSS surface even with `JSON.stringify`.
- **Explicit sameAs array.** Rather than `Object.values(SITE.socials).filter(...)`, build the sameAs array from `[instagram, tiktok]` explicitly. This keeps the email (`info@3dninjaz.com`) out of the sameAs social-profile array and is robust to future socials being added to the `SITE.socials` object without pollution.
- **WebSite.potentialAction already points at /shop?q=...** even before search ships. Harmless forward-declaration; Google resolves the action lazily, and when search lands in a future phase the tag is already correct.
- **Kept `robots: { index: true, follow: true }`** per the plan. Removing coming-soon's `noindex` is a separate Plan 04-04 concern against the production HTML file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Fixed TypeScript narrowing error in sameAs filter during `npm run build`**

- **Found during:** Task 3 verification (TypeScript compile)
- **Issue:** `SITE` was declared with `as const`, which narrowed `socials.instagram` to `""`, `socials.tiktok` to `""`, and `socials.email` to `"info@3dninjaz.com"`. The filter predicate `(v): v is string => ...` then failed with `Type 'string' is not assignable to type '"" | "info@3dninjaz.com"'`, breaking `npm run build`.
- **Fix:** Replaced `Object.values(SITE.socials).filter((v): v is string => ...)` with an explicit array `[SITE.socials.instagram, SITE.socials.tiktok].filter((v) => typeof v === "string" && v.length > 0)`. This also makes the intent cleaner (email is explicitly excluded from sameAs, not implicitly filtered).
- **Files modified:** `src/app/layout.tsx`
- **Verification:** `npm run build` passes (23 routes generated, no TS errors); verify check for unsafe HTML injection still clean.
- **Committed in:** `a71d82b` (Task 3 commit; the fix was folded into the single layout.tsx rewrite before the first successful build).

---

**Total deviations:** 1 auto-fixed (1 bug). No scope creep. No architectural changes. No auth gates.

**Impact on plan:** Fix was small and isolated; final layout.tsx still matches the plan's intent (sameAs populated from socials when handles land per D-05).

## Issues Encountered

- **Windows / OneDrive `.next` filesystem transient failure.** First `npm run build` after each `rm -rf .next` occasionally errored with `ENOENT _buildManifest.js.tmp` or a Node `UNKNOWN read` error. Retrying the build immediately succeeded. This is a known Windows/OneDrive symptom (Turbopack tmp-file contention with OneDrive sync). Not a code issue; documented here so future executors recognise it.
- **Port 3000 + 3001 already in use** by other dev servers returning 500s at session start. Worked around by starting the verification server on port 3011. No effect on code correctness.
- **Parallel executor stage queue.** At one point `git diff --cached` showed 11 files staged by the Phase 3 Wave 1 executor (schema.ts, paypal.ts, orders.ts, validators.ts, package.json, etc.). Poll-retried per prompt protocol; stage was clear on the first retry attempt, so no additional wait was needed.

## Smoke Tests (dev server on port 3011)

| Check | Command / URL | Result |
|-------|---------------|--------|
| Homepage renders | `curl -s http://localhost:3011/` | 200, ~118 KB HTML |
| Open Graph | `grep 'property="og:' /tmp/home-raw.html` | 10 tags present (title, description, url, site_name, locale=en_MY, image 1200x630, image:alt, type=website) |
| Twitter Card | `grep 'name="twitter:' ...` | 4 tags (card=summary_large_image, title, description, image) |
| Theme color | `grep 'name="theme-color"' ...` | `#0B1020` present |
| JSON-LD | `grep 'application/ld+json' ...` | 2 blocks: Organization + WebSite, both valid JSON |
| Icon link tags | `grep 'rel="icon\|apple-touch-icon"' ...` | 3 tags: favicon.ico (48×48), icon.png (512×512), apple-icon.png (180×180) |
| `/icon.png` served | `curl -sI http://localhost:3011/icon.png` | 200, content-type image/png |
| `/apple-icon.png` served | `curl -sI http://localhost:3011/apple-icon.png` | 200, content-type image/png |
| Title tag | `grep '<title>' ...` | `3D Ninjaz — 3D Printed Products \| 3D Ninjaz` (homepage `page.tsx` sets own title; template composes correctly) |

## Plan Success Criteria

- [x] `src/lib/site-metadata.ts` exports SITE with all required fields, typed (`SiteMetadata`)
- [x] `src/components/seo/json-ld.tsx` exports safe JsonLd (uses React text-children escaping, no raw-HTML injection)
- [x] All 7 favicon files present in `src/app/`
- [x] `src/app/layout.tsx` has full Metadata + Viewport exports + two JsonLd renders
- [x] Build passes (`npm run build` → 23 routes generated)
- [x] Dev server renders with full Open Graph, Twitter Card, theme-color, and JSON-LD
- [ ] Lighthouse SEO ≥ 90 on homepage — deferred to Plan 04-03 (responsive + perf sweep owns Lighthouse)
- [ ] JSON-LD validates at schema.org validator — manual step for QA; blocks emitted match required shape
- [ ] OG card renders in preview tool (opengraph.xyz) — manual step; requires public URL

## Next Plan Readiness

- Plan 04-02 (static content — About/Contact/Privacy/Terms) can now import `SITE` from `@/lib/site-metadata` for per-page titles and descriptions, and `<JsonLd>` for contact-page `Organization.contactPoint` enrichment.
- Plan 04-03 (responsive polish) inherits `viewport` meta already — no changes needed in that plan.
- Plan 04-04 (launch readiness) will remove the coming-soon `<meta robots="noindex">`, generate `robots.ts` + `sitemap.ts`, and flip the domain root from `public_html/` to the Next.js app. All of those depend on the metadataBase (`https://3dninjaz.com`) established here.

## Self-Check: PASSED

- FOUND: `src/lib/site-metadata.ts`
- FOUND: `src/components/seo/json-ld.tsx`
- FOUND: `public/og-default.png`
- FOUND: `src/app/icon.png`
- FOUND: `src/app/icon-16.png`
- FOUND: `src/app/icon-32.png`
- FOUND: `src/app/icon-192.png`
- FOUND: `src/app/icon-512.png`
- FOUND: `src/app/apple-icon.png`
- FOUND: `src/app/favicon.ico`
- FOUND: `src/app/layout.tsx` (with metadataBase, site-metadata, JsonLd, Organization, WebSite, and verified clean of unsafe-HTML injection)
- FOUND commit: `26db83b` (Task 1)
- FOUND commit: `17389cf` (Task 2)
- FOUND commit: `a71d82b` (Task 3)

---

*Phase: 04-brand-launch*
*Plan: 01*
*Completed: 2026-04-19*
