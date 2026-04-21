# Phase 09 — Theme Lightening + UX Polish

**Status:** COMPLETE  
**Completed:** 2026-04-20  
**Session:** 2026-04-20

## Goal

Lighten storefront theme to mostly-white with vivid accent pops; fix admin nav UX; add About Us page; add ninja mascot icons; fix nav breakpoints; add branded Apache error pages.

## What Shipped

| Commit | Description |
|--------|-------------|
| `72b9c12` | Refactor theme — storefront to mostly-white with vivid accent pops |
| `934ca1c` | About Us page with sibling story |
| `fa1fd2d` | Refactor About — remove trio portrait + fix sibling card colors + update copy |
| `9660ca6` | Fix About — align copy exactly with user spec |
| `8db737d` | Fix home — remove "hello ninja" from hero per user feedback |
| `3e1f9ac` | Fix checkout — drop PayPal wording from shipping hint |
| `7c84dcb` | Refactor admin nav — group sidebar into collapsible sections by function |
| `9284e78` | Fix admin nav — default groups to collapsed on first load |
| `039b771` | Fix admin nav — do not auto-open groups on `/admin` root |
| `d570f1e` | Admin nav — "View Storefront" link in admin header |
| `9b5ae9e` | Storefront — ninja mascot icons across homepage, bag, product, account touchpoints |
| `1ae3a99` | Nav — add ninja icons to About/Contact/Shop desktop links |
| `3918a96` | Fix nav — show desktop nav icons from `md` breakpoint (was `xl`) |
| `0466267` | Static branded 502/503/504 pages for Apache fallback |
| `fd04cb2` | Apache `ErrorDocument` + `Alias` for `/errors` + `/icons` (bypass proxy when node is down) |
| `bc801c5` | Fix checkout — restore +/− and courier-summary contrast on light theme |
| `8fe243d` | Fix admin email templates — replace `isomorphic-dompurify` with in-repo allowlist sanitizer (ERR_REQUIRE_ESM on prod) |
| `d178dbe` | Refactor auth — unify login at `/login` with role-based redirect + `?next` |
| `51a90c9` | Fix UI — wrap `DropdownMenuLabel` in Group (Base UI GroupRootContext error) |
| `1da01e9` | Scripts — add `ADMIN_RESET_PASSWORD=1` flag to `seed-admin` |
| `b089ad1` | CI — gate deploy workflow to manual dispatch until env secrets populated |
| `fe2569f` | Docs — mark PayPal live switch complete |

## Key Decisions

- **Theme:** white base with blue/green/purple accent — ink/cream dropped as backgrounds for storefront.
- **Admin nav:** collapsible groups (Products, Orders, Finance, Marketing, Settings, Support) — collapsed by default on root.
- **Apache error pages:** static HTML in `public/errors/` served directly by Apache via `Alias /errors /home/ninjaz/public_html/v1/errors` — survive Node downtime.
- **Base UI issue:** `DropdownMenuLabel` must be wrapped in a `DropdownMenuGroup`; Base UI 1.3 asserts `MenuGroupRootContext` at render.
- **DOMPurify fix:** `isomorphic-dompurify` uses ESM-only imports that break `require()` in CommonJS prod bundles — replaced with in-repo allowlist sanitizer.

## Deferred

- Privacy policy + Terms of Service pages not yet built (pre-launch task).
- Google Analytics / Plausible not wired.
