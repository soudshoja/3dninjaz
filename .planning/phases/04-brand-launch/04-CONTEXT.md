# Phase 4: Brand + Launch — Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase is the final polish before 3D Ninjaz goes live on `3dninjaz.com`. Phase 1 shipped the foundation (scaffold, auth, admin), Phase 2 shipped the storefront and bag, Phase 3 shipped checkout + orders. Phase 4 adds the three missing layers required for a public B2C launch in Malaysia: (1) brand-consistent metadata, icons, and SEO so the site surfaces properly in search and social embeds, (2) static trust content (About, Contact, Privacy, Terms) required both by common sense and by the PDPA 2010 consent that Phase 1 already wired into the registration form, and (3) a responsive polish sweep across every route to satisfy RESP-01/02/03. A final launch-readiness plan replaces the `coming-soon/` page currently served from `3dninjaz.com` with the Next.js app and flips the site from `noindex` to indexable.

No new database tables, no new API routes, no new runtime dependencies. All Phase 4 work is content, metadata, accessibility, performance, and deployment config.

</domain>

<integration_points>
## Integration Points

### Root Layout & Metadata (Plan 04-01)
- `src/app/layout.tsx` — currently exports a placeholder `metadata` object with title "Print Ninjaz - 3D Printed Products". Needs upgrade to the full Next.js 15 `Metadata` object including `metadataBase`, `title.template`, `openGraph`, `twitter`, `icons`, `robots`, `alternates.canonical`, and a `verification` placeholder. Fonts are already wired (Russo One, Chakra Petch) — do not touch.
- `src/app/(store)/layout.tsx` — existing store shell. No metadata changes here; per-page metadata handled by each route. Nav/footer in this layout need footer link additions (About, Contact, Privacy, Terms) — touched by Plan 04-03.
- Favicons — multi-size set (16/32/180/192/512 + apple-touch-icon + .ico) already exists in `coming-soon/`. Copy to `src/app/icon-*.png` + `apple-icon.png` (Next.js 15 convention) so the framework auto-injects `<link rel="icon">` tags without manual `<head>` work.

### Static Content Pages (Plan 04-02)
- New route group: `src/app/(store)/about/page.tsx`, `src/app/(store)/contact/page.tsx`, `src/app/(store)/privacy/page.tsx`, `src/app/(store)/terms/page.tsx`. All four inherit the store layout (nav + footer) and so get brand framing for free.
- The Phase 1 registration form already links `/privacy` — see `src/components/auth/register-form.tsx` line 148. Plan 04-02 makes that link resolve to real content instead of 404.
- WhatsApp CTA — `wa.me/<MY-format-number>` deep link. Requires the user-supplied business number (MY country code 60, no plus, no leading zero on the area code: e.g. `60123456789`). Placeholder `wa.me/60000000000` used until user fills in the real number; see Open Decisions.

### Responsive Polish (Plan 04-03)
- Every existing route is in scope: `/`, `/shop`, `/shop?category=`, `/products/[slug]`, `/bag`, `/checkout`, `/orders`, `/orders/[id]`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/admin` and all admin subroutes, plus the new Phase 4 static pages. Breakpoint sweep at 320/375/390/768/1024/1440.
- Store layout footer gains four new links (About, Contact, Privacy, Terms) — added by this plan so they appear on every customer-facing page. Nav gains an "About" and "Contact" entry on desktop; mobile nav collapses into a drawer if not already present.
- Image audit: every `next/image` instance must have explicit `width`/`height` or `fill`+`sizes` to prevent CLS. All hero/product images preloaded with `priority` only where above-the-fold.

### Launch Readiness (Plan 04-04)
- `coming-soon/` is currently served from the domain root via cPanel (static files). Deploy swap: the Next.js app assumes that slot. Mechanism depends on cPanel setup — either Node.js app under `~/public_html/nextjs/` proxied via `.htaccess`, or subdomain. Plan 04-04 is a checkpoint-heavy plan because the deploy path is user-specific.
- `.htaccess` in `public_html/` must enforce HTTPS + HSTS and (if serving Next.js via proxy) forward all requests to the Node.js app port. Plan 04-04 writes this.
- `robots.txt` and `sitemap.xml`: Next.js 15 supports `src/app/robots.ts` and `src/app/sitemap.ts` — generate from known static routes + active product slugs (via Drizzle read on deploy). MUST exclude `/admin`, `/api`, `/orders`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/bag`, `/checkout` — only public browse routes get indexed.
</integration_points>

<assumptions>
## Assumptions

- Phases 1, 2, and 3 are shipped (or scaffolded enough that their routes exist). Plan 04-03 needs those routes to exist to audit them. If any are missing at planning-execution time, Plan 04-03 audits only what exists and logs the gap.
- The logo files in `public/logo.png` and `coming-soon/logo.png` are the same artwork. If the user has a refined launch logo, it replaces `public/logo.png` and favicons get regenerated — out of scope for this phase, a hand-off note.
- PDPA 2010 compliance at the "small-medium business" tier: data collection notice, consent (already implemented), purpose limitation (stated in policy), retention period, customer deletion/correction rights, and a contact email for data requests. Print Ninjaz does NOT require formal Department of Personal Data Protection registration at this stage (below threshold).
- No analytics in v1 per user brief. Google Analytics / PostHog / Plausible deferred. When/if added, it must appear in the privacy policy's "third parties" section.
- Lighthouse mobile ≥ 90 on Performance, ≥ 95 Accessibility, ≥ 90 Best Practices, ≥ 90 SEO is a HARD gate for Plan 04-03 sign-off.
- Next.js Image + cPanel Node.js runtime: image optimization works via Next.js built-in loader (not Vercel's). No third-party CDN in v1.

</assumptions>

<open_decisions>
## Open Decisions

These need user input before Plan 04-02 execution. Defaults are used if unanswered.

| ID | Decision | Default (if silent) |
|----|----------|---------------------|
| Q4-01 | **WhatsApp business number** — full MY number in `wa.me` format (e.g. `60123456789`). Used on Contact page CTA and footer. | Placeholder `60000000000` with a TODO comment; executor blocks final commit until replaced. |
| Q4-02 | **Registered company name and business address** — required for PDPA policy and Contact page. "3D Ninjaz" may be a trading name; the legal entity might differ (sole proprietor, Sdn Bhd, etc.). | Use "3D Ninjaz, Kuala Lumpur, Malaysia" as trading name; policy notes "Registered business details available on request." |
| Q4-03 | **SST / tax registration number** — Malaysia SST if registered. Displayed in footer or Terms page if applicable. | Omit — Terms page notes "Prices are inclusive of any applicable taxes." |
| Q4-04 | **DPO / data-request contact email** — dedicated inbox for PDPA data subject requests. | `hello@3dninjaz.com` (same address used in coming-soon footer). |
| Q4-05 | **Social handles** — Instagram, TikTok, optionally Facebook. Used in footer social row. | Leave `#` placeholder links (matches coming-soon behaviour). |
| Q4-06 | **Retention period** for customer data. Typical MY SME: 7 years for order records (tax), 2 years for marketing opt-ins. | 7 years for order/invoice data, 3 years for account/profile data post-last-login, indefinite for anonymised analytics. |
| Q4-07 | **Deploy mechanism on cPanel** — Node.js selector under `public_html/nextjs/` with `.htaccess` proxy, OR subdomain `app.3dninjaz.com` with root redirect, OR full swap replacing `coming-soon/` files. | Plan 04-04 presents the options as a `checkpoint:decision` task; no default assumed. |

The planner has marked these as a `checkpoint:decision` task at the top of Plan 04-02 (content questions) and Plan 04-04 (deploy mechanism). The executor pauses for user input.

</open_decisions>

<canonical_refs>
## Canonical References

- `CLAUDE.md` — stack, palette, Conventions
- `.planning/ROADMAP.md` — Phase 4 requirements + success criteria (note: ROADMAP says "green/blue/black" — superseded by DECISIONS.md D-01 unified palette)
- `.planning/phases/02-storefront-cart/DECISIONS.md` — **authoritative palette and mobile rules**
- `.planning/phases/02-storefront-cart/02-CONTEXT.md` — store shell structure and D2-01..23
- `coming-soon/index.html` + `styles.css` — live brand reference; also source of favicon/OG image patterns
- `src/app/demo/page.tsx` + `src/app/demo-v2/page.tsx` — visual contract for the brand
- `src/components/auth/register-form.tsx` — PDPA checkbox (already shipped, links to `/privacy`)

</canonical_refs>

<specifics>
## Specific Ideas

- Use Next.js 15's file-based icon convention (`src/app/icon.png`, `src/app/apple-icon.png`) — eliminates manual `<link rel="icon">` tags. The multi-size set from `coming-soon/` maps directly.
- Open Graph image: reuse `public/logo.png` for v1 (same as coming-soon does). Future upgrade: a dedicated 1200×630 social card. Out of scope.
- JSON-LD: two blocks only — `Organization` (name, url, logo, sameAs for socials) and `WebSite` (name, url, potentialAction SearchAction is OPTIONAL since there's no search in v1 — skip it). Emit from `src/app/layout.tsx` via `<script type="application/ld+json">` in the root component.
- Privacy policy structure mirrors standard MY PDPA templates: (1) who we are, (2) what data we collect, (3) purpose, (4) third parties (PayPal, mail provider), (5) retention, (6) your rights (access/correction/withdrawal), (7) cookies (essential only — session + cart), (8) contact. Written in plain English, not legalese.
- WhatsApp link uses `https://wa.me/{number}?text=Hi%203D%20Ninjaz%2C%20I%20have%20a%20question` — pre-fills a friendly message.
- Footer reorganises into three columns on desktop: Shop (homepage, /shop, categories if any), Company (About, Contact), Legal (Privacy, Terms). On mobile stacks vertically. Matches common MY e-com footer patterns.
- Responsive sweep uses Playwright MCP or Chrome DevTools with emulated viewports; no actual devices required. Every route gets a screenshot at 390×844 saved under `.planning/phases/04-brand-launch/screenshots/` (gitignored).

</specifics>

<deferred>
## Deferred Ideas

- Cookie consent banner — PDPA does not require explicit cookie banner for essential cookies; analytics cookies (when added) will trigger banner requirement. Deferred to v1.1.
- Multi-language (Malay/Chinese) — out of scope per PROJECT.md
- Live chat widget — WhatsApp link satisfies the customer contact requirement (BRAND-04). Live chat is a v2 feature.
- Sitemap submission to Google Search Console — user action post-launch, documented in Plan 04-04 notes but not a task.
- Customer review request emails post-delivery — not a v1 feature.
- SEO content pages (buying guides, 3D print material explainers) — content marketing, v2.

</deferred>

---

*Phase: 04-brand-launch*
*Context gathered: 2026-04-16*
