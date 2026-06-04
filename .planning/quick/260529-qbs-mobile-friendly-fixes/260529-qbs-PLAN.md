---
phase: 260529-qbs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/store/footer-subscribe-form.tsx
  - src/components/store/product-detail.tsx
  - src/components/store/product-gallery.tsx
  - src/components/store/configurable-image-gallery.tsx
  - src/components/store/social-links.tsx
  - src/components/store/site-footer.tsx
  - src/components/auth/unified-auth-form.tsx
  - src/components/auth/login-form.tsx
  - src/components/auth/register-form.tsx
autonomous: true
requirements: [QBS-01, QBS-02, QBS-03, QBS-04, QBS-05]

must_haves:
  truths:
    - "Footer newsletter email input renders at 16px so iOS does not zoom on focus"
    - "Standard stocked-product PDP shows a sticky add-to-bag bar on mobile, like simple/configurable PDPs"
    - "Gallery dot indicators have a >=44x44px tappable hit-zone while the visual dot stays small"
    - "Social icon links and footer contact links present >=44x44px tap targets on mobile"
    - "Auth login/register text inputs are 48px tall and Sign In/Register tab triggers are >=44px tall"
  artifacts:
    - path: "src/components/store/footer-subscribe-form.tsx"
      provides: "16px email input (text-base)"
      contains: "text-base"
    - path: "src/components/store/product-detail.tsx"
      provides: "Mobile sticky add-to-bag bar on the stocked PDP branch"
      contains: "lg:hidden fixed bottom-0"
    - path: "src/components/store/product-gallery.tsx"
      provides: "44x44 hit-zone wrapping each dot button"
    - path: "src/components/store/configurable-image-gallery.tsx"
      provides: "44x44 hit-zone wrapping each dot button"
    - path: "src/components/store/social-links.tsx"
      provides: "min 44x44 tap target on each social link"
      contains: "min-h-[44px]"
    - path: "src/components/store/site-footer.tsx"
      provides: "min 44px tall inline contact links"
      contains: "min-h-[44px]"
    - path: "src/components/auth/unified-auth-form.tsx"
      provides: "h-12 inputs + min-h-[44px] tab triggers"
      contains: "h-12"
  key_links:
    - from: "src/components/store/product-detail.tsx"
      to: "AddToBagButton (customer) / sticky bar"
      via: "sticky bar only renders in customer mode (!onAddToOrder), reusing selectedVariant"
      pattern: "lg:hidden fixed bottom-0"
---

<objective>
Fix 5 confirmed mobile-friendliness gaps in the 3D Ninjaz storefront, verified LIVE at 375/390px on app.3dninjaz.com via Playwright. Mobile-first Tailwind class swaps/additions plus one sticky-footer port. Minimal diff, no refactors.

Purpose: Eliminate iOS focus-zoom, missing mobile CTA, and sub-44px tap targets that hurt the mobile shopping experience.
Output: 9 storefront/auth component files updated; no admin files touched; typecheck stays green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# The five fixes are confirmed REAL (verified live at 375/390px). Do NOT
# re-investigate whether they exist. Only the implementation is required.

# Brand palette + MariaDB/Better Auth/deploy quirks live in ./CLAUDE.md.
# This task touches ONLY presentation classes + one component port — no DB,
# no auth logic, no server actions.

# CONSTRAINTS (hard):
# - Mobile-first Tailwind. Minimal diff: class additions/swaps only, except
#   the one sticky-footer port in product-detail.tsx.
# - Do NOT change input FONT sizes on auth (already 16px via Input primitive).
#   Only change input HEIGHTS and tab-trigger heights.
# - Do NOT touch any admin files (src/app/(admin), src/components/admin).
# - No refactors. No behavior changes beyond the listed fixes.

<interfaces>
<!-- The exact sticky-CTA pattern to PORT (from simple-product-view.tsx lines 703-734). -->
<!-- Reuse this shape in product-detail.tsx. Note: simple-product-view uses a
     bespoke <button>; product-detail's customer path uses <AddToBagButton>,
     which manages its own cart wiring + disabled/"Pick a variant" label.
     So the sticky bar should RENDER A SECOND <AddToBagButton> with the SAME
     props the in-page one receives — NOT a hand-rolled button. -->

Sticky bar wrapper (copy classes/style, swap the button child):
```tsx
{/* Sticky mobile CTA */}
<div
  className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-4 pb-safe-area-inset-bottom"
  style={{
    backgroundColor: "rgba(247,250,244,0.96)",
    backdropFilter: "blur(12px)",
    borderTop: `2px solid ${BRAND.ink}10`,
    paddingTop: 12,
    paddingBottom: 16,
  }}
>
  {/* button child here */}
</div>
<div className="lg:hidden h-24" aria-hidden="true" />
```

Customer add-to-bag in product-detail.tsx today (the `!onAddToOrder` branch, ~lines 440-453):
```tsx
<AddToBagButton
  selectedVariant={
    !soldOut && selectedHydrated
      ? { ...selectedHydrated, isPreorder: isPreorderSelected }
      : null
  }
  productId={product.id}
  productSlug={product.slug}
  productName={product.name}
  productImage={product.images[0] ?? null}
  firstMissingOptionName={firstMissingOptionName}
/>
```

AddToBagButton: handles its own onClick (writes Zustand cart + opens drawer +
analytics), its own disabled state, and its own "Pick a variant" label when
`selectedVariant === null`. It carries `mt-6 w-full rounded-full ... min-h-[60px]`
baked in — that is fine inside the fixed bar. It renders a transient "Added!"
flash; a second instance flashing is acceptable.

pb-safe-area-inset-bottom: confirmed already used in simple-product-view.tsx —
it is a recognized utility in this Tailwind setup. Use the SAME class.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Footer email 16px + sticky stocked-PDP CTA</name>
  <files>src/components/store/footer-subscribe-form.tsx, src/components/store/product-detail.tsx</files>
  <action>
FIX 1 (footer-subscribe-form.tsx, QBS-01): On the email `<input>` (currently
line ~118), change the `text-sm` class to `text-base` so it renders at 16px and
iOS does not zoom on focus. Change ONLY that one token. Do NOT touch the input's
existing `min-h-[48px]` or any other class. The submit button keeps `text-sm`.

FIX 2 (product-detail.tsx, QBS-02): The STANDARD stocked PDP branch (the fall-
through `return (...)` starting ~line 228 — the one with "Choose Your Size" and
<AddToBagButton>) has NO sticky mobile add-to-bag bar, unlike SimpleProductView
and ConfigurableProductView. Port the sticky-CTA pattern from
simple-product-view.tsx (lines 703-734) into THIS branch.

Implementation:
  - Add the sticky bar + spacer just before the final closing `</div>` of the
    outer `<div className="min-h-screen" ...>` wrapper (i.e. as the last
    children of that root div, AFTER the inner `max-w-6xl` container closes).
  - Use the EXACT wrapper classes/style from the <interfaces> block
    (`lg:hidden fixed bottom-0 left-0 right-0 z-40 px-4 pb-safe-area-inset-bottom`
    + the inline style with rgba bg, blur, borderTop, paddingTop 12,
    paddingBottom 16). Follow with `<div className="lg:hidden h-24" aria-hidden="true" />`.
  - The button CHILD must be a SECOND `<AddToBagButton>` with the SAME props the
    in-page customer one receives (selectedVariant computed identically:
    `!soldOut && selectedHydrated ? { ...selectedHydrated, isPreorder: isPreorderSelected } : null`,
    plus productId/productSlug/productName/productImage/firstMissingOptionName).
  - GUARD: the sticky bar must render ONLY in customer mode. Wrap it in
    `{!onAddToOrder && ( ... )}` so the POS/admin "Add to order" flow gets NO
    sticky bar (admins are not on mobile storefront). The spacer div should also
    be inside that same `!onAddToOrder` guard so POS layout is unchanged.
  - Do NOT alter the existing in-page add-to-bag card, the POS button, the
    variant selector, or any other markup. Do NOT touch the `simple` /
    `configurable` early-return branches (they already have sticky bars).
    `BRAND` is already imported.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>footer email input uses `text-base`; stocked PDP renders a `lg:hidden fixed bottom-0` sticky bar containing a second AddToBagButton, guarded by `!onAddToOrder`, with a `lg:hidden h-24` spacer; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: Gallery dot 44x44 hit-zones</name>
  <files>src/components/store/product-gallery.tsx, src/components/store/configurable-image-gallery.tsx</files>
  <action>
FIX 3 (QBS-03): The mobile dot indicators are tiny (7x7 / 20x7 / 6x6) tap
targets. Give each dot a >=44x44px tappable hit-zone WITHOUT enlarging the
visible dot.

product-gallery.tsx — the dots block is the `<div className="flex md:hidden
justify-center gap-1.5" ...>` at ~line 206, mapping `images.map(...)` to dot
`<button>`s sized via inline `style={{ width: ..., height: 7 }}`.

Approach (minimal diff): keep the existing small visual dot, but make the
TAPPABLE element 44x44. Convert each entry so the `<button>` is the 44x44 hit-
zone (transparent, centered) and the small coloured dot becomes an inner
`<span>`:
  - The `<button>` gets `className="flex items-center justify-center"` with
    inline `style={{ width: 44, height: 44 }}` (override the old width/height),
    keep `type="button"`, `onClick={() => goToIndex(i)}`, and the existing
    `aria-label`. Remove the `rounded-full transition-all` from the button (move
    visual styling to the span). Keep `bg-transparent` (default).
  - Inside the button, render the visual dot as a `<span aria-hidden="true"
    className="rounded-full transition-all duration-200" style={{ width:
    i === activeIndex ? 20 : 7, height: 7, backgroundColor: i === activeIndex
    ? BRAND.blue : `${BRAND.ink}30` }} />`.
  - The outer container gap-1.5 can stay; with 44px hit-zones the dots may sit
    closer visually — that is fine, keep gap-1.5. If the row looks too wide that
    is acceptable; do NOT add horizontal scrolling or other layout changes.

configurable-image-gallery.tsx — same treatment for the dots block at ~line 252
(`Array.from({ length: totalThumbs }, (_, i) => ...)`). The visual dot here uses
`width: i === currentIdx ? 20 : 6, height: 6` and `i === currentIdx` for active.
Wrap identically: 44x44 transparent centered `<button>` + inner aria-hidden
`<span>` carrying the original width/height/backgroundColor. Preserve the
existing `aria-label` ternary ("Go to your preview" / `Go to display image ${i}`)
and `onClick={() => goToIndex(i)}`.

Do NOT touch the desktop thumbnail strip, arrows, or carousel logic in either
file.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>Each mobile dot in both galleries is a 44x44 centered transparent button wrapping an aria-hidden span that keeps the original small visual dot size/colour; onClick + aria-labels preserved; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 3: Social + footer contact + auth tap targets</name>
  <files>src/components/store/social-links.tsx, src/components/store/site-footer.tsx, src/components/auth/unified-auth-form.tsx, src/components/auth/login-form.tsx, src/components/auth/register-form.tsx</files>
  <action>
FIX 4 (social-links.tsx + site-footer.tsx, QBS-04):

social-links.tsx — each social `<a>` (the one with the default `itemClassName`,
~line 74) must be a >=44x44 tap target even when the icon `size` prop is smaller.
Add `min-h-[44px] min-w-[44px]` to the default `itemClassName` string (keep the
existing `inline-flex items-center justify-center rounded-full transition-...`
classes). The inline `style={{ width: size, height: size }}` sets the icon box;
the min-h/min-w floor guarantees the tap target. Do NOT remove the size style;
do NOT change the default `size` value or the icon `<Image>`.

site-footer.tsx — the inline brand-row contact links (the email + phone `<a>`s
at ~lines 240-283 that wrap a 14px `<svg>` and render ~16px tall) need a 44px-
tall tap target. On EACH of those two `<a>` elements, add `min-h-[44px]` and a
small horizontal padding `px-1` and ensure vertical centering — change their
class from `inline-flex items-center gap-1.5 transition-colors hover:text-zinc-900`
to `inline-flex items-center gap-1.5 min-h-[44px] px-1 transition-colors
hover:text-zinc-900`. Do NOT touch the mailto:/tel: hrefs, the SVGs, or the
contact-tile block above (those tiles already have `min-h-[48px]`). The
`<SocialLinks ... size={44}>` call stays as-is (Fix 4's social-links.tsx change
adds the floor).

FIX 5 (auth, QBS-05): Inputs are h-10 (40px) and tab triggers are 38px. Bump
input HEIGHTS to h-12 (48px) and tab triggers to min-h-[44px]. Do NOT change any
font size (inputs already render 16px via the Input primitive's text-base).

unified-auth-form.tsx:
  - Every `<Input ... className="h-10" />` (login email/password, register
    name/email/password/confirm, forgot email): change `h-10` to `h-12`. The
    submit `<Button ... className="h-10 w-full ...">` instances: change `h-10`
    to `h-12` too (keeps button visually aligned with the taller inputs).
  - TabBar `<button>` (~line 433): the className array has `"flex-1 pb-3 pt-1
    text-sm font-medium transition-colors"`. Add `min-h-[44px]` and centering so
    the label stays centred in the taller hit zone: change that string to
    `"flex-1 min-h-[44px] flex items-center justify-center pb-3 pt-1 text-sm
    font-medium transition-colors"`. Keep the active/inactive conditional classes
    (border-b-2 etc.) unchanged.

login-form.tsx — standalone login surface: change each `<Input ... className="h-10" />`
to `h-12` (email + password) and the submit `<Button ... className="h-10 w-full ...">`
to `h-12`. No tabs in this file.

register-form.tsx — change each `<Input ... className="h-10" />` (name, email,
password, confirmPassword) to `h-12` and the submit `<Button ... className="h-10
w-full ...">` to `h-12`. No font changes; leave the PDPA checkbox + helper text
untouched.

Do NOT alter any validation logic, redirects, or the Input/Button primitives
themselves — class swaps only.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>social-links default item has `min-h-[44px] min-w-[44px]`; footer inline email/phone links have `min-h-[44px] px-1`; all auth `<Input className="h-10">` and submit `<Button className="h-10 ...">` are now `h-12`; TabBar triggers carry `min-h-[44px] flex items-center justify-center`; no font-size changes; tsc clean.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes (repo CI gate is "Install + typecheck").
- No file under src/app/(admin) or src/components/admin was modified.
- Diff is class swaps/additions only, except the sticky-bar port in
  product-detail.tsx (one added block guarded by `!onAddToOrder`).
- Auth input font sizes unchanged (only heights changed).
- Visual verification (mobile screenshots + computed-size probe on localhost) is
  performed by the ORCHESTRATOR after execution — not part of this plan's verify.
</verification>

<success_criteria>
- Fix 1: footer email input class is `text-base` (16px).
- Fix 2: stocked PDP has a `lg:hidden fixed bottom-0` sticky AddToBagButton bar,
  customer-mode only, with safe-area bottom padding + a 24-unit spacer.
- Fix 3: gallery dots in both galleries have 44x44 transparent centered button
  hit-zones wrapping the original small visual dot.
- Fix 4: social links and footer inline contact links present >=44px tap targets.
- Fix 5: auth inputs are h-12 (48px); tab triggers >=44px; fonts unchanged.
- `npx tsc --noEmit` clean.
</success_criteria>

<output>
After completion, create `.planning/quick/260529-qbs-mobile-friendly-fixes/260529-qbs-SUMMARY.md`.

Commit guidance for the executor (ideal: ~5 atomic commits, one per fix):
  1. fix(store): footer newsletter input 16px to stop iOS zoom
  2. fix(store): sticky add-to-bag bar on standard stocked PDP
  3. fix(store): 44px tap hit-zones for gallery dots
  4. fix(store): 44px tap targets for social + footer contact links
  5. fix(auth): 48px inputs + 44px tab triggers on login/register
Tasks 1 and 3 each span two fixes (1 covers fix 1+2; 3 covers fix 4+5) — split
the commits per-fix as above even though they share a task.
</output>
