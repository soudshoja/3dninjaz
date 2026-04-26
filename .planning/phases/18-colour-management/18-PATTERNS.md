# Phase 18: Colour Management — Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 21 (15 CREATE, 6 MODIFY)
**Analogs found:** 20 / 21 (one — `colour-picker-dialog.tsx` — has only partial precedents; assemble from variant-editor `Dialog` + checkbox grids)

> Naming caveat: scripts/`phase18-preorder.cjs` and `scripts/phase18-sku-backfill.cjs` already exist (carried over from earlier work). Do **not** name the new migration applicator `phase18-migrate.cjs` — pick a distinct name like `phase18-colours-migrate.cjs` to avoid confusion with the unrelated existing scripts. Likewise `phase18-seed-colours.ts` or just `seed-colours.ts` for the seed script (RESEARCH.md uses `scripts/seed-colours.ts` directly).

> Helper-file caveat: CONTEXT.md / RESEARCH.md show `getReadableTextOn` living in **two** spots — `src/lib/colours.ts` *and* `src/lib/colour-contrast.ts`. The planner must reconcile to a single file. Recommendation: keep contrast math in `src/lib/colour-contrast.ts` (small, pure, no DB) and keep DB-aware helpers (`slugifyColourBase`, `buildColourSlugMap`, `getColourPublic`, `getColourAdmin`) in `src/lib/colours.ts`. The pattern-map below assigns analogs to **both** locations so either choice has an analog row.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/db/schema.ts` (MODIFY) | schema (Drizzle table defs) | DDL | `productOptionValues` block at `src/lib/db/schema.ts:206-224` and `productVariants` block at `:226-299` | exact — additive in same file |
| `scripts/phase18-colours-migrate.cjs` (CREATE) | migration applicator (raw SQL DDL) | DDL | `scripts/phase16-migrate.cjs` (CREATE TABLE + ALTER ADD COLUMN with FK) and `scripts/phase17-migrate.cjs` (idempotent ADD COLUMN only) | exact role + same data flow |
| `scripts/seed-colours.ts` (CREATE) | seed script (Node tsx, idempotent upsert) | batch / file-I/O + DB write | `scripts/seed-categories.ts` (idempotent two-tier seed with ensureCategory/ensureSubcategory) and `scripts/seed-admin.ts` (existing-row guard, log w/o secrets, exit codes) | role-match, both `tsx --env-file=.env.local` style |
| `src/lib/colours.ts` (CREATE) | utility (slug, query helpers `getColourPublic`/`getColourAdmin`) | request-response (read-only) | `src/lib/catalog.ts` (admin/public split via `eq(products.isActive, true)` filter; manual hydration helpers `hydrateProducts`) and slug helper at `src/actions/products.ts:22-30` | role-match |
| `src/lib/colour-contrast.ts` (CREATE) | utility (pure math, no DB) | transform | `src/lib/sku.ts` for "small pure helper module" precedent; `src/lib/format.ts` (`formatMYR`, `toDatetimeLocal`) | partial — pure-function helper module, no exact precedent for WCAG luminance |
| `src/actions/admin-colours.ts` (CREATE) | server actions (admin CRUD) | request-response (CRUD) | `src/actions/admin-coupons.ts` (lines 1-200, full file is 200 lines — list/get/create/update/deactivate/reactivate/delete + in-use guard returning structured error) | **exact** — copy-and-adapt |
| `src/app/(admin)/admin/colours/page.tsx` (CREATE) | route (RSC list page) | request-response | `src/app/(admin)/admin/coupons/page.tsx` (lines 1-128) | **exact** |
| `src/app/(admin)/admin/colours/new/page.tsx` (CREATE) | route (RSC create form host) | request-response | `src/app/(admin)/admin/coupons/new/page.tsx` (lines 1-40) | **exact** |
| `src/app/(admin)/admin/colours/[id]/edit/page.tsx` (CREATE) | route (RSC edit form host) | request-response | `src/app/(admin)/admin/coupons/[id]/edit/page.tsx` (lines 1-47) | **exact** |
| `src/components/admin/colour-form.tsx` (CREATE) | component (client form, useTransition) | request-response | `src/components/admin/coupon-form.tsx` (lines 1-258, full file) | **exact** — direct mirror with renamed fields |
| `src/components/admin/colour-row.tsx` (CREATE) | component (table row actions w/ inline confirm modal) | request-response | `src/components/admin/coupon-row-actions.tsx` (lines 1-146) | **exact** — copy + add hex-swatch cell render and IN_USE error block |
| `src/components/admin/colour-picker-dialog.tsx` (CREATE) | component (modal, multi-select, batch confirm) | request-response (single batched action) | `src/components/admin/variant-editor.tsx` Dialog usage (`Dialog/DialogContent/DialogHeader/DialogTitle/DialogFooter` imports at `:51-56`; `setDeleteOptionDialog`/`setDeleteValueDialog` confirmation pattern at `:172-224`) | role-match — assemble from existing Dialog primitive |
| `src/components/store/colour-filter-section.tsx` (CREATE) | component (sidebar accordion w/ chips) | request-response (URL-synced filter) | `src/components/store/category-chips.tsx` (lines 1-65, full file: chips, accent rotation, active-state hex tinting, useSearchParams) | role-match — chip rendering + `Link href` URL pattern |
| `src/content/admin-guide/products/colours.md` (CREATE) | content (admin docs frontmatter MD) | static content | `src/content/admin-guide/products/variants-sizes.md` (lines 1-60+) | **exact** |
| `src/components/admin/variant-editor.tsx` (MODIFY) | component (mount picker + label freeform) | request-response | self (lines 437-478 — values list + add-value input row; lines 51-56 Dialog imports) | self-modify |
| `src/components/store/variant-selector.tsx` (MODIFY) | component (always-visible swatch caption) | request-response | self (lines 201-267 — existing swatch render path that needs the caption added) | self-modify |
| `src/app/(store)/shop/page.tsx` (MODIFY) | route (extend SearchParams + render filter) | request-response | self (lines 21, 35-46 SearchParams + resolveProducts; lines 134-141 Sidebar mount; lines 236-309 ShopSidebar) | self-modify |
| `src/lib/catalog.ts` (MODIFY) | service (add available-colour query for /shop) | request-response (DISTINCT JOIN) | self (lines 98-253 `hydrateProducts` manual-hydration pattern) and `src/actions/products.ts:328-426` (no-LATERAL multi-query) | self-modify, follow project pattern |
| `src/actions/variants.ts` (MODIFY) | server actions (attach + cascade rename helpers) | request-response | self (`addOptionValue` lines 207-260, `renameOptionValue` lines 262-316; `revalidateProductSurfaces` lines 41-53) | self-modify |
| `src/lib/validators.ts` (MODIFY) | schema (Zod) | transform | self (lines 615-625 `productOptionValueSchema` — has `swatchHex` regex `^#[0-9a-fA-F]{6}$`; lines 1-30 `categorySchema`/`subcategorySchema` for the basic name+optional-slug shape) | self-modify |

## Pattern Assignments

### `src/actions/admin-colours.ts` (server actions, CRUD)

**Analog:** `src/actions/admin-coupons.ts` (lines 1-200, full file). Same shape: list/get/create/update/soft-toggle/hard-delete with structured-error guard.

**Imports + header pattern** (lines 1-9 of `admin-coupons.ts`):

```typescript
"use server";

import { db } from "@/lib/db";
import { coupons, couponRedemptions } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import { couponSchema } from "@/lib/validators";
```

For Phase 18, swap to: `colors`, `productOptionValues` (for IN_USE check), `colourSchema`. Add `inArray`/`and` from drizzle-orm if needed for cascade-rename WHERE clause.

**`requireAdmin()` first await + Zod parse + structured error** (lines 102-136):

```typescript
export async function createCoupon(
  formData: FormData,
): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseCouponForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  const id = randomUUID();
  try {
    await db.insert(coupons).values({
      id,
      code: data.code,
      // ...
    });
  } catch (err: unknown) {
    const raw = String((err as Error)?.message ?? "");
    if (raw.includes("ER_DUP_ENTRY") || raw.includes("Duplicate entry")) {
      return { ok: false, error: "Code already exists" };
    }
    console.error("[admin-coupons] createCoupon failed:", err);
    return { ok: false, error: "Unable to create coupon" };
  }
  revalidatePath("/admin/coupons");
  return { ok: true, id };
}
```

**In-use deletion guard returning structured error** (lines 182-200) — this is the precedent for SPEC §4 `{code: "IN_USE", products: [...]}`:

```typescript
export async function deleteCoupon(id: string): Promise<MutateResult> {
  await requireAdmin();

  // T-05-03-delete-audit — refuse if redemptions exist
  const [redRow] = await db
    .select({ c: count() })
    .from(couponRedemptions)
    .where(eq(couponRedemptions.couponId, id));
  if (Number(redRow?.c ?? 0) > 0) {
    return {
      ok: false,
      error:
        "Cannot delete — coupon has redemptions. Deactivate instead to preserve the audit trail.",
    };
  }
  await db.delete(coupons).where(eq(coupons.id, id));
  revalidatePath("/admin/coupons");
  return { ok: true };
}
```

For Phase 18 the IN_USE shape is richer — return `{ ok: false, error: "Cannot delete — in use", code: "IN_USE", products: [{id, name}] }`. Replace the `count()` query with a join: `select pov.id, p.id, p.name from product_option_values pov inner join product_variants pv on pv.option1ValueId = pov.id ... or pv.option6ValueId = pov.id inner join products p on p.id = pv.productId where pov.colorId = :id` (manual hydration per `src/actions/products.ts:328-426` to dodge LATERAL).

**Soft-archive twin actions** (lines 168-180): `deactivateCoupon` / `reactivateCoupon` map directly to `archiveColour` / `reactivateColour` (toggle `is_active`).

**Cascade-rename helper** (NEW for Phase 18, no exact analog):
- Pattern reference: `src/actions/variants.ts:262-316` `renameOptionValue` shows the existing `swatchHex` plumbing and the `labelCache` invalidation across all six positional slots — re-use the multi-slot WHERE pattern but anchor on `colorId` instead of `valueId`.
- Use `db.transaction` (mysql2 supports it; see `src/actions/variants.ts:setDefaultVariant` for an existing in-repo transaction precedent).
- Diff-aware UPDATE per D-11: read pre-rename `colors.name` first, then `UPDATE pov SET value = :new_name, swatch_hex = :new_hex WHERE color_id = :id AND value = :old_name` — single round trip per cascade.

---

### `src/components/admin/colour-form.tsx` (component, form)

**Analog:** `src/components/admin/coupon-form.tsx` (lines 1-258, full file). Direct mirror.

**Imports + state pattern** (lines 1-44 of `coupon-form.tsx`):

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { createCoupon, updateCoupon } from "@/actions/admin-coupons";

// ...

export function CouponForm({
  mode,
  initial,
}: {
  mode: "new" | "edit";
  initial?: CouponInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // ...
}
```

**Submit handler with `useTransition`** (lines 46-69):

```typescript
const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  setError(null);
  const fd = new FormData(e.currentTarget);

  startTransition(async () => {
    const res =
      mode === "new"
        ? await createCoupon(fd)
        : await updateCoupon(initial!.id, fd);
    if (res.ok) {
      router.push("/admin/coupons");
      router.refresh();
    } else {
      setError(res.error);
    }
  });
};
```

For Phase 18 swap routes to `/admin/colours`. **Caveat (CLAUDE.md AD-06 reactivity contract):** the project rule "no `router.refresh()` in mutation paths" applies to the variant editor where local state is owned by the client component. The coupon form deliberately uses `router.refresh()` because it navigates to a server-rendered list page on success — that's fine. Phase 18 colour form can follow coupon-form here.

**Form field markup pattern** (lines 77-97 — text input):

```typescript
<div>
  <label htmlFor="cf-code" className="block text-sm font-semibold mb-1">
    Code
  </label>
  <input
    id="cf-code"
    name="code"
    type="text"
    required
    minLength={3}
    maxLength={32}
    defaultValue={initial?.code ?? ""}
    disabled={mode === "edit"}
    className="w-full rounded-xl border-2 px-4 py-3 text-sm uppercase tracking-wide font-mono min-h-[48px] disabled:bg-slate-100"
    style={{ borderColor: `${BRAND.ink}33` }}
    placeholder="SAVE20"
  />
  <p className="mt-1 text-xs text-slate-500">
    A-Z, 0-9, _, - · 3 to 32 characters · case-normalised to UPPER.
  </p>
</div>
```

For Phase 18 `cf-code` becomes `cf-name` / `cf-hex` / `cf-previousHex` etc.; tap target stays `min-h-[48px]`; border stays `${BRAND.ink}33`. **Hex field** needs sibling `<input type="color">` per UI-SPEC §Surface 2 (no exact precedent in coupon-form — synthesise from the standard input shape, with `pattern="^#[0-9A-Fa-f]{6}$"`).

**Submit button + cancel button** (lines 237-255):

```typescript
<div className="flex flex-col gap-2 sm:flex-row">
  <button
    type="submit"
    disabled={pending}
    className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
    style={{ backgroundColor: BRAND.ink }}
  >
    {pending ? "Saving…" : mode === "new" ? "Create coupon" : "Save changes"}
  </button>
  <button
    type="button"
    onClick={() => router.push("/admin/coupons")}
    disabled={pending}
    className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
    style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
  >
    Cancel
  </button>
</div>
```

Phase 18: copy verbatim, swap "coupon" → "colour".

**Error block style** (lines 227-235) — also re-used by `colour-row.tsx` for the IN_USE banner:

```typescript
{error ? (
  <p
    role="alert"
    className="rounded-xl px-3 py-2 text-sm"
    style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
  >
    {error}
  </p>
) : null}
```

---

### `src/components/admin/colour-row.tsx` (component, row actions)

**Analog:** `src/components/admin/coupon-row-actions.tsx` (lines 1-146, full file).

**Inline confirm modal pattern** (lines 92-143 — directly maps to UI-SPEC §Surface 2 hard-delete modal AND §Surface 2 IN_USE error UI):

```typescript
{showConfirm ? (
  <div
    role="dialog"
    aria-modal="true"
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
  >
    <div
      className="w-full max-w-md rounded-2xl bg-white p-6"
      style={{ color: BRAND.ink }}
    >
      <h2 className="font-[var(--font-heading)] text-xl mb-2">
        Delete coupon {row.code}?
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        This is permanent. If the coupon has any redemptions, deletion
        will be refused — deactivate instead to preserve audit history.
      </p>
      {error ? (
        <p
          role="alert"
          className="rounded-xl px-3 py-2 text-sm mb-3"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => { setShowConfirm(false); setError(null); }}
          disabled={pending}
          className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={pending}
          className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
          style={{ backgroundColor: "#dc2626" }}
        >
          {pending ? "Deleting…" : "Delete permanently"}
        </button>
      </div>
    </div>
  </div>
) : null}
```

**Toggle-active server-action call** (lines 30-42):

```typescript
const onToggleActive = () => {
  setError(null);
  startTransition(async () => {
    const res = row.active
      ? await deactivateCoupon(row.id)
      : await reactivateCoupon(row.id);
    if (res.ok) {
      router.refresh();
    } else if ("error" in res) {
      setError(res.error);
    }
  });
};
```

For Phase 18, replace with `archiveColour` / `reactivateColour`. The IN_USE branch from `deleteColour` returns `{ ok: false, code: "IN_USE", products: [{id, name}] }`; render the product list in a richer banner per UI-SPEC §Surface 2 (heading "Cannot delete — in use", body lists products with `→ Open` lucide ExternalLink links, primary CTA "Archive instead").

---

### `src/app/(admin)/admin/colours/page.tsx` (route, RSC list page)

**Analog:** `src/app/(admin)/admin/coupons/page.tsx` (lines 1-128, full file).

**Page header pattern** (lines 1-41):

```typescript
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { listCoupons } from "@/actions/admin-coupons";
import { BRAND } from "@/lib/brand";
// ...

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Coupons",
  robots: { index: false, follow: false },
};

export default async function AdminCouponsPage() {
  await requireAdmin();
  const rows = await listCoupons();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-baseline md:justify-between">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
              Coupons
            </h1>
            <p className="mt-1 text-slate-600">
              {rows.length} {rows.length === 1 ? "coupon" : "coupons"}
            </p>
          </div>
          <Link
            href="/admin/coupons/new"
            className="inline-flex items-center rounded-full px-6 py-3 text-sm font-bold text-white whitespace-nowrap min-h-[48px]"
            style={{ backgroundColor: BRAND.green }}
          >
            + New coupon
          </Link>
        </header>
```

For Phase 18: title "Colours", count uses `rows.length === 1 ? "colour" : "colours"`, "+ New colour" button. **Note** UI-SPEC §Surface 1 says the new-colour button uses `BRAND.ink` fill, not `BRAND.green`. Reconcile: follow UI-SPEC (colour palette is locked there).

**Empty-state + table pattern** (lines 43-124): copy verbatim. The table needs an extra leftmost cell for the 24px hex circle (UI-SPEC §Surface 1):

```html
<td className="p-3">
  <span
    className="inline-block w-6 h-6 rounded-full"
    style={{ backgroundColor: c.hex, border: "1px solid #E2E8F0" }}
  />
</td>
```

---

### `src/app/(admin)/admin/colours/{new,[id]/edit}/page.tsx`

**Analog:** `src/app/(admin)/admin/coupons/new/page.tsx` (lines 1-40) and `src/app/(admin)/admin/coupons/[id]/edit/page.tsx` (lines 1-47).

Both 40-line files. Direct mirror with route + name swaps. The edit page handles `notFound()` when `getColour(id)` returns null (line 21 of edit/page.tsx):

```typescript
const coupon = await getCoupon(id);
if (!coupon) notFound();
```

Same pattern for `getColourAdmin(id)`.

---

### `src/components/admin/colour-picker-dialog.tsx` (component, modal)

**No single analog** — this is the one file requiring synthesis. Three precedents:

1. **shadcn Dialog already imported in variant-editor** (`src/components/admin/variant-editor.tsx:51-56`):

```typescript
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
```

2. **`Dialog` confirm-pattern in variant-editor** (`src/components/admin/variant-editor.tsx:172-224` — `setDeleteOptionDialog` and `setDeleteValueDialog` state machines show the open/close + transition pattern):

```typescript
const handleDeleteOptionConfirm = () => {
  if (!deleteOptionDialog) return;
  startTransition(async () => {
    const result = await deleteProductOption(deleteOptionDialog.optionId);
    setDeleteOptionDialog(null);
    if ("error" in result) {
      showToast(result.error, "error");
    } else {
      showToast(`Option deleted (${result.data?.variantsDeleted ?? 0} variants removed)`);
      await refresh();   // ← Pattern B: getVariantEditorData refetch
    }
  });
};
```

3. **Multi-select state + batch confirm** — no exact precedent, but `selectedIds: Set<string>` + `handleBulkOp` pattern in variant-editor at `:345-359` is the closest:

```typescript
const handleBulkOp = (op: BulkOp) => {
  if (selectedIds.size === 0) return;
  startTransition(async () => {
    const result = await bulkUpdateVariants(productId, Array.from(selectedIds), op);
    if ("error" in result) {
      showToast(result.error, "error");
    } else {
      showToast(`Bulk op applied to ${result.data?.affected ?? 0} variants`);
      // ...
      await refresh();
    }
  });
};
```

For Phase 18 picker: `selectedColourIds: Set<string>`, `handleConfirm` calls `attachLibraryColours(productId, optionId, Array.from(selectedColourIds))` then `await refresh()` (Pattern B per D-08).

**Row checkbox + hex chip + brand badge layout** — assemble from UI-SPEC §Surface 3 picker row spec directly (no source file has this exact composition; locked in UI-SPEC).

---

### `src/components/store/colour-filter-section.tsx` (component, sidebar accordion)

**Analog:** `src/components/store/category-chips.tsx` (lines 1-65, full file).

**Active-state computed from `useSearchParams`** (lines 18-21):

```typescript
export function CategoryChips({ categories }: { categories: Category[] }) {
  const params = useSearchParams();
  const active = params.get("category") ?? null;
  if (!categories.length) return null;
```

For Phase 18: `params.get("colour")?.split(",") ?? []`. This becomes a `Set<string>` of selected slugs.

**Chip rendering with hex tinting** (lines 42-62) — chip spec for Phase 18 differs (12px hex circle inside pill per D-15) but the `Link href` URL toggle logic is the precedent:

```typescript
{categories.map((c, i) => {
  const isActive = active === c.slug;
  const accent = ACCENTS[i % ACCENTS.length];
  return (
    <li key={c.id}>
      <Link
        href={`/shop?category=${encodeURIComponent(c.slug)}`}
        className="inline-flex items-center rounded-full px-5 py-2 text-sm font-bold min-h-[48px]"
        style={{
          backgroundColor: isActive ? accent : "white",
          color: isActive ? "white" : BRAND.ink,
          border: `2px solid ${accent}`,
        }}
        aria-current={isActive ? "page" : undefined}
      >
        {c.name}
      </Link>
    </li>
  );
})}
```

For Phase 18, replace `accent` with `chip.hex` (and use `getReadableTextOn(chip.hex)` from `colour-contrast.ts` for the active-text color), and replace `Link` href with a builder that toggles the slug in the comma-separated `?colour=` param while preserving `?category=` and `?subcategory=`:

```typescript
function toggleColourHref(currentParams: URLSearchParams, slug: string): string {
  const slugs = new Set((currentParams.get("colour") ?? "").split(",").filter(Boolean));
  if (slugs.has(slug)) slugs.delete(slug); else slugs.add(slug);
  const next = new URLSearchParams(currentParams);
  if (slugs.size === 0) next.delete("colour"); else next.set("colour", Array.from(slugs).join(","));
  return `/shop?${next.toString()}`;
}
```

**Sidebar mount in shop/page.tsx** — analog: existing `ShopSidebar` at `src/app/(store)/shop/page.tsx:236-309`. Phase 18 adds an `<hr>` then `<ColourFilterSection />` after the existing `<ul>` of categories.

---

### `src/components/store/variant-selector.tsx` (MODIFY — always-visible swatch caption)

**Self-modify reference** (`src/components/store/variant-selector.tsx:201-267` — current swatch render):

```typescript
{isColorOption ? (
  // Swatch buttons for color options
  <div className="flex flex-wrap gap-2">
    {visibleValues.map((val) => {
      // ...
      return (
        <button
          key={val.id}
          type="button"
          // ...
          className="relative rounded-full transition-all"
          style={{
            width: 40,
            height: 40,
            minWidth: 48,
            minHeight: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: available ? "pointer" : "not-allowed",
          }}
        >
          <span
            className="rounded-full block"
            style={{
              width: 32,
              height: 32,
              backgroundColor: val.swatchHex ?? "#ccc",
              border: isSelected
                ? "2px solid var(--color-brand-ink)"
                : isHovered
                  ? "2px dashed var(--color-brand-ink)"
                  : "1px solid #d1d5db",
              opacity: available ? 1 : 0.35,
              position: "relative",
            }}
          >
            {/* OOS diagonal-line overlay — KEEP unchanged */}
          </span>
        </button>
      );
    })}
  </div>
)
```

**Required change** per UI-SPEC §Surface 4: convert the `<button>` from a `flex` square (40×40 with min 48) into a vertical column (`flexDirection: "column"`, `gap: 4`), with the existing 32×32 circle on top and a new 12px caption below. Caption uses `Chakra_Petch` weight 500 default / weight 700 + `BRAND.ink` when selected; `text-zinc-700` default / `text-zinc-400 line-through` when OOS; `max-width: 80px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;`. Keep `aria-label` (now redundant SR text, but accessibility-safe per UI-SPEC).

---

### `scripts/phase18-colours-migrate.cjs` (CREATE — raw-SQL DDL applicator)

**Analog:** `scripts/phase16-migrate.cjs` (lines 1-200, full file) and `scripts/phase17-migrate.cjs` (lines 1-133, full file).

**Idempotent helper functions** (`phase17-migrate.cjs:23-61`):

```javascript
function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    // ... parse KEY=VALUE, strip quotes ...
    if (!process.env[key]) process.env[key] = val;
  }
}

async function columnExists(conn, dbName, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, tableName, columnName],
  );
  return rows.length > 0;
}

async function addColumnIfMissing(conn, dbName, tableName, columnName, ddl) {
  const exists = await columnExists(conn, dbName, tableName, columnName);
  if (exists) {
    console.log(`${tableName}.${columnName}  -> exists, skipping`);
    return;
  }
  await conn.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
  console.log(`${tableName}.${columnName}  -> added`);
}
```

**CREATE TABLE pattern with FK + InnoDB latin1** (`phase16-migrate.cjs:77-92`):

```javascript
await conn.query(`
  CREATE TABLE IF NOT EXISTS \`product_options\` (
    \`id\`         VARCHAR(36) NOT NULL,
    \`product_id\` VARCHAR(36) NOT NULL,
    \`name\`       VARCHAR(64) NOT NULL,
    \`position\`   INT NOT NULL DEFAULT 1,
    \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_product_option_name\`     (\`product_id\`, \`name\`),
    UNIQUE KEY \`uq_product_option_position\` (\`product_id\`, \`position\`),
    KEY \`idx_product_options_product\` (\`product_id\`),
    CONSTRAINT \`product_options_product_id_fk\`
      FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
`);
```

For Phase 18:
- `colors` table: `id VARCHAR(36) PK, name VARCHAR(64) NOT NULL, hex VARCHAR(7) NOT NULL, previous_hex VARCHAR(7) NULL, brand ENUM('Bambu','Polymaker','Other') NOT NULL, family_type ENUM('PLA','PETG','TPU','CF','Other') NOT NULL, family_subtype VARCHAR(48), code VARCHAR(32), is_active TINYINT(1) NOT NULL DEFAULT 1, created_at, updated_at, UNIQUE KEY uq_colors_brand_code (brand, code)`. **Charset MUST be `latin1 latin1_swedish_ci`** to match `product_option_values` (FK requires identical charset — RESEARCH.md note).
- `ALTER TABLE product_option_values ADD COLUMN color_id VARCHAR(36) NULL AFTER swatch_hex` + add the FK `CONSTRAINT product_option_values_color_id_fk FOREIGN KEY (color_id) REFERENCES colors(id) ON DELETE RESTRICT`. Use the `addColumnIfMissing` helper for the column add; for the FK, gate on a similar `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` existence check (not in the existing scripts — synthesize from same INFORMATION_SCHEMA pattern).

**Smoke check pattern** (`phase17-migrate.cjs:113-122`):

```javascript
const expectedNewCols = ["sale_price", "sale_from", "sale_to", "is_default", "weight_g"];
for (const col of expectedNewCols) {
  const ok = await columnExists(conn, dbName, "product_variants", col);
  if (!ok) {
    console.error(`MISSING product_variants.${col}`);
    process.exit(1);
  }
}
console.log("OK: all Phase 17 schema changes applied");
```

For Phase 18: assert `colors` table exists (via `SHOW TABLES`) and `product_option_values.color_id` exists.

---

### `scripts/seed-colours.ts` (CREATE — idempotent seed)

**Analog:** `scripts/seed-categories.ts` (lines 1-130, full file). Same shape: tsx + drizzle + idempotent two-tier upsert.

**Imports + invocation** (lines 1-18 of `seed-categories.ts`):

```typescript
/**
 * Phase 8 (08-01) — seed starter categories + subcategories appropriate
 * for a 3D-printing catalogue.
 *
 * Idempotent: ...
 *
 * Run with: npx tsx --env-file=.env.local scripts/seed-categories.ts
 */

import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../src/lib/db";
import { categories, subcategories } from "../src/lib/db/schema";
```

For Phase 18: import `colors` from `../src/lib/db/schema`, plus `fs`/`path` for HTML reads. RESEARCH.md `<seed-colours.ts shape>` block already provides the parser logic verbatim — copy it.

**ensure-existing-then-insert idempotent pattern** (lines 65-83):

```typescript
async function ensureCategory(
  name: string,
  slug: string,
  position: number,
): Promise<string> {
  const [existing] = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  if (existing) {
    console.log(`[seed-cat] category "${name}" exists`);
    return existing.id;
  }
  const id = randomUUID();
  await db.insert(categories).values({ id, name, slug, position });
  console.log(`[seed-cat] created category "${name}" (${id})`);
  return id;
}
```

For Phase 18, the equivalent natural-key check is `(brand, code)` when `code` non-null else `(brand, name)` — RESEARCH.md `upsertColour` already nails this. The script must log a final summary `inserts: N, updates: M, noops: K, skips: S` so the acceptance test (`SPEC §2: re-run = 0 inserts, 0 updates`) can read counts directly.

**Top-level run wrapper with exit codes** (lines 124-129):

```typescript
run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed-cat] failed:", err);
    process.exit(1);
  });
```

Copy verbatim with prefix `[seed-colours]`.

---

### `src/lib/db/schema.ts` (MODIFY — add `colors` table + `productOptionValues.colorId` column)

**Analog (in same file):** `productOptionValues` block at lines 206-224, `productOptions` block at lines 185-204, and `productVariants` enum/index helpers at 226-299.

**Existing `productOptionValues` block** (lines 206-224 — the table getting the FK):

```typescript
export const productOptionValues = mysqlTable(
  "product_option_values",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    optionId: varchar("option_id", { length: 36 })
      .notNull()
      .references(() => productOptions.id, { onDelete: "cascade" }),
    value: varchar("value", { length: 64 }).notNull(),
    position: int("position").notNull().default(0),
    // Optional color swatch for visual picker (Color option type)
    swatchHex: varchar("swatch_hex", { length: 7 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    optionValueUnique: unique("uq_option_value").on(t.optionId, t.value),
    optionIdx: index("idx_option_values_option").on(t.optionId),
  }),
);
```

For Phase 18, append a new `colorId` field after `swatchHex`:

```typescript
colorId: varchar("color_id", { length: 36 }),
//   .references(() => colors.id, { onDelete: "restrict" }),  // NB: forward ref — declare colors above this block
```

**Note on declaration order** — Drizzle reference helpers are lazy `() =>` so declaration order is flexible. To match the project's existing precedent (foreign-key target tables declared before referrers — see `productOptions` at :185 referencing `products` declared above), declare `colors` ABOVE the existing `productOptionValues` block, OR keep `colors` in a clearly marked "Phase 18" section at the bottom and rely on lazy resolution. RESEARCH.md `// ============= Phase 18 =============` header pattern supports the bottom-of-file approach (matches Phase 17 which appended its enums at the end).

**`mysqlEnum` import already present** (line 11) — `colors.brand` uses `mysqlEnum('brand', ['Bambu','Polymaker','Other'])` and `colors.familyType` uses `mysqlEnum('family_type', ['PLA','PETG','TPU','CF','Other'])`.

**Index pattern** (lines 197-202 — `productOptions` indexes):

```typescript
(t) => ({
  productNameUnique: unique("uq_product_option_name").on(t.productId, t.name),
  productPositionUnique: unique("uq_product_option_position").on(t.productId, t.position),
  productIdx: index("idx_product_options_product").on(t.productId),
}),
```

For Phase 18 `colors`: `unique("uq_colors_brand_code").on(t.brand, t.code)` — but MySQL allows multiple `(brand, NULL)` rows under a UNIQUE since NULL ≠ NULL, which is exactly what SPEC §1 wants ("Unique constraint on (brand, code) when code is non-null"). No extra filter needed; the natural NULL-not-equal-NULL behaviour gives the desired semantics. The seed script's fallback `(brand, name)` natural key for null-code rows is enforced at the application layer in `upsertColour` (RESEARCH.md), not by a DB UNIQUE.

---

### `src/lib/colours.ts` (CREATE — slug + DB-aware query helpers)

**Analog:** `src/actions/products.ts:22-30` (project's existing `slugify`):

```typescript
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
```

RESEARCH.md `slugifyColourBase` is identical. Re-use this pattern verbatim.

**Public-vs-admin query split** — analog: `src/lib/catalog.ts` (lines 255-287) shows the public-side `eq(products.isActive, true)` filter pattern:

```typescript
export async function getActiveProducts(): Promise<CatalogProduct[]> {
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(desc(products.createdAt));
  return hydrateProducts(rows);
}
```

For Phase 18, `getColourPublic(id)` returns `select({id, name, hex}).from(colors).where(and(eq(colors.id, id), eq(colors.isActive, true))).limit(1)` — strips `code/previous_hex/family_type/family_subtype/brand`. `getColourAdmin(id)` returns `select().from(colors).where(eq(colors.id, id))`.

**`buildColourSlugMap` runtime collision helper** — purely functional, RESEARCH.md provides the implementation. No DB analog needed.

---

### `src/lib/colour-contrast.ts` (CREATE — pure WCAG luminance helper)

**Analog (role precedent):** `src/lib/format.ts` (existing pure helpers like `formatMYR`, `toDatetimeLocal`, `fromDatetimeLocal` — small, side-effect-free utility module imported widely).

**Code excerpt** — UI-SPEC §"Color math helper" already provides the canonical implementation. No source file in repo currently does WCAG luminance, so this is the source of truth (synthesised from `ui-ux-pro-max` skill + WCAG 2.2 SC 1.4.11 per UI-SPEC):

```typescript
// src/lib/colour-contrast.ts
export function getReadableTextOn(hex: string): "#FFFFFF" | "#0B1020" {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.5 ? "#0B1020" : "#FFFFFF";
}
```

`#0B1020` is `BRAND.ink` (matches `src/lib/brand.ts:17`).

---

### `src/lib/validators.ts` (MODIFY — add `colourSchema`)

**Analog (in same file):** `productOptionValueSchema` at lines 615-625:

```typescript
export const productOptionValueSchema = z.object({
  value: z.string().min(1, "Value is required").max(64, "Value too long (max 64 chars)"),
  position: z.number().int().min(0),
  swatchHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #ff0000")
    .optional(),
});
export type ProductOptionValueInput = z.infer<typeof productOptionValueSchema>;
```

For Phase 18, the new `colourSchema` re-uses the same hex regex:

```typescript
export const colourSchema = z.object({
  name: z.string().min(1, "Name is required").max(64, "Name too long (max 64 chars)"),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Hex must be in the form #RRGGBB"),
  previousHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().or(z.literal("")).nullable(),
  brand: z.enum(["Bambu", "Polymaker", "Other"]),
  familyType: z.enum(["PLA", "PETG", "TPU", "CF", "Other"]),
  familySubtype: z.string().max(48).optional().or(z.literal("")).nullable(),
  code: z.string().max(32).optional().or(z.literal("")).nullable(),
  active: z.boolean().default(true),
});
export type ColourInput = z.infer<typeof colourSchema>;
```

The `parseCouponForm` helper pattern at `src/actions/admin-coupons.ts:89-100` shows how to coerce `FormData` → schema input (string → typed) — the colours form action follows the same parsing layer.

---

### `src/actions/variants.ts` (MODIFY — add `attachLibraryColours`, `cascadeRenameLibraryColour`, `detachLibraryColour`)

**Self-modify pattern:** the existing `addOptionValue` action at `src/actions/variants.ts:207-260` is the closest precedent for the new `attachLibraryColours` (it inserts a single `productOptionValues` row; Phase 18 inserts N in a transaction). Re-use the existing duplicate-check + position-counter logic, batched.

**Existing `addOptionValue` excerpt** (lines 207-259):

```typescript
export async function addOptionValue(
  optionId: string,
  value: string,
  swatchHex?: string,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();

  const trimmed = value.trim().slice(0, 64);
  if (!trimmed) return { error: "Value is required" };

  const existing = await db
    .select({ id: productOptionValues.id, position: productOptionValues.position })
    .from(productOptionValues)
    .where(eq(productOptionValues.optionId, optionId));

  // duplicate check ...
  const existingValues = await db
    .select({ value: productOptionValues.value })
    .from(productOptionValues)
    .where(eq(productOptionValues.optionId, optionId));
  if (existingValues.some((v) => v.value.toLowerCase() === trimmed.toLowerCase())) {
    return { error: `Value "${trimmed}" already exists` };
  }

  const nextPosition = existing.length > 0
    ? Math.max(...existing.map((v) => v.position)) + 1
    : 0;

  const id = randomUUID();
  await db.insert(productOptionValues).values({
    id,
    optionId,
    value: trimmed,
    position: nextPosition,
    swatchHex: swatchHex?.trim() || null,
  });

  // Get productId for revalidation
  const [option] = await db
    .select({ productId: productOptions.productId })
    .from(productOptions)
    .where(eq(productOptions.id, optionId))
    .limit(1);
  if (option) await revalidateProductSurfaces(option.productId);

  return { success: true, data: { id } };
}
```

For Phase 18 `attachLibraryColours(productId, optionId, colorIds: string[])`: load the colours from `colors` table, dedupe against existing `productOptionValues` (where `colorId` already attached or `value` already taken — return "already attached" warning per UI-SPEC §Surface 3 already-attached guard), insert N rows in one batch with `colorId` set + `value`/`swatchHex` snapshotted from `colors`. Wrap in `db.transaction` (the existing `setDefaultVariant` action elsewhere in this file is the project's transaction precedent — search `db.transaction` if needed).

**`renameOptionValue` cascade-pattern** (lines 262-316 — invalidates `labelCache` across all 6 positional slots):

```typescript
const [variants1, variants2, variants3, variants4, variants5, variants6] = await Promise.all([
  db.select().from(productVariants).where(eq(productVariants.option1ValueId, valueId)),
  db.select().from(productVariants).where(eq(productVariants.option2ValueId, valueId)),
  db.select().from(productVariants).where(eq(productVariants.option3ValueId, valueId)),
  db.select().from(productVariants).where(eq(productVariants.option4ValueId, valueId)),
  db.select().from(productVariants).where(eq(productVariants.option5ValueId, valueId)),
  db.select().from(productVariants).where(eq(productVariants.option6ValueId, valueId)),
]);
```

For `cascadeRenameLibraryColour(colourId, newName, newHex)` — D-11 diff-aware:

```typescript
export async function cascadeRenameLibraryColour(colourId: string, newName: string, newHex: string) {
  await requireAdmin();
  return db.transaction(async (tx) => {
    // 1. Read pre-state from colors row
    const [pre] = await tx.select({ name: colors.name, hex: colors.hex }).from(colors).where(eq(colors.id, colourId)).limit(1);
    if (!pre) return { error: "Colour not found" };
    // 2. Update colors row
    await tx.update(colors).set({ name: newName, hex: newHex }).where(eq(colors.id, colourId));
    // 3. Diff-aware UPDATE on product_option_values: only rows where value still matches old name
    const updateRes = await tx
      .update(productOptionValues)
      .set({ value: newName, swatchHex: newHex })
      .where(and(eq(productOptionValues.colorId, colourId), eq(productOptionValues.value, pre.name)));
    // 4. Invalidate labelCache on affected variants — same slot-by-slot pattern as renameOptionValue
    // ...
    return { success: true };
  });
}
```

**Revalidation helper already present** (lines 41-53 — `revalidateProductSurfaces`): re-use across all three new actions for any product whose variants were touched.

---

### `src/lib/catalog.ts` (MODIFY — available-colour query for /shop sidebar)

**Self-modify pattern:** the existing `hydrateProducts` (lines 98-253) shows the manual-multi-query hydration pattern. Phase 18 adds a new exported function `getAvailableColoursForShop(filters: { categorySlug?: string; subcategorySlug?: string })` that runs:

```sql
-- pseudo-SQL: actual implementation must be drizzle-style manual joins, no LATERAL
SELECT DISTINCT c.id, c.name, c.hex, c.brand
FROM colors c
INNER JOIN product_option_values pov ON pov.color_id = c.id
INNER JOIN product_variants pv ON
  pv.option1_value_id = pov.id OR pv.option2_value_id = pov.id OR ... OR pv.option6_value_id = pov.id
INNER JOIN products p ON pv.product_id = p.id
WHERE c.is_active = 1 AND p.is_active = 1
```

**No-LATERAL implementation pattern** — use `src/actions/products.ts:328-426` as the model. Issue 5 separate queries:

1. `select id from colors where is_active = true` → all candidate colour ids.
2. `select id, color_id, option_id from product_option_values where color_id in (...)` → linkage.
3. `select option1ValueId..option6ValueId, productId from product_variants where any(option_value_id) in (povIds)` — this is the only awkward step because `OR` across 6 columns isn't expressible in a single `eq`. Use raw `sql\`option1_value_id IN (?) OR option2_value_id IN (?) OR ...\`` with a single `inArray`, or issue 6 parallel `db.select().where(inArray(productVariants.option1ValueId, povIds))` queries and merge — pattern matches `renameOptionValue` lines 288-294.
4. `select id from products where id in (variantProductIds) and isActive = true` → final filter.
5. In-memory: keep colours that have ≥1 product surviving step 4.

For category/subcategory intersection, run step 4 with the additional `eq(products.categoryId, ...)` filter — re-use `getActiveProductsByCategorySlug` query plumbing already in this file.

**Filter shape passed to /shop** — the new `ShopPage` flow becomes:

```typescript
const colourSlugs = (await searchParams).colour?.split(",").filter(Boolean) ?? [];
// Pass colourSlugs to resolveProducts so it filters products by colour
```

`resolveProducts` (lines 187-234 of `shop/page.tsx`) is the analog for adding the new `colourSlugs` parameter; the existing 3-branch switch (subcategory / category / all) keeps the same shape, with each branch additionally intersecting on the colour filter when `colourSlugs.length > 0`.

---

### `src/content/admin-guide/products/colours.md` (CREATE)

**Analog:** `src/content/admin-guide/products/variants-sizes.md` (lines 1-60+ shown).

**Frontmatter pattern** (lines 1-6):

```yaml
---
title: Options, values, and variants
category: Products
tags: [variants, options, sizes, pricing, sku, pre-order, stock]
order: 4
---
```

For Phase 18:

```yaml
---
title: Managing colours
category: Products
tags: [colours, library, variants, picker, bambu, polymaker]
order: 5
---
```

The article should mirror `variants-sizes.md` section structure: introduction → "Understanding the structure" (library vs picker vs swatch) → "Managing the library" (CRUD how-to) → "Picking colours per product" (variant editor flow) → "Customer view" (PDP swatches + /shop filter) → "Cascade rename and archive" (diff-aware behaviour).

---

## Shared Patterns

### Authentication — `requireAdmin()` first await (CVE-2025-29927)

**Source:** `src/lib/auth-helpers.ts:14-21`

```typescript
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userWithRole = session?.user as unknown as { role: string } | undefined;
  if (!session || userWithRole?.role !== "admin") {
    throw new Error("Forbidden");
  }
  return session;
}
```

**Apply to:** every export in `src/actions/admin-colours.ts`, every cascade-rename helper added to `src/actions/variants.ts`, every server-component admin page (`/admin/colours/page.tsx`, `/new/page.tsx`, `/[id]/edit/page.tsx`). Project convention: `requireAdmin()` MUST be the **first** `await` in the handler — middleware-only checks are bypassable per CLAUDE.md.

### Error Handling — structured `MutateResult` with optional structured error code

**Source:** `src/actions/admin-coupons.ts:87` + `:182-200`

```typescript
type MutateResult = { ok: true; id?: string } | { ok: false; error: string };
```

**Apply to:** `admin-colours.ts` — but extend the failure shape to include the `IN_USE` discriminant per SPEC §4:

```typescript
type ColourMutateResult =
  | { ok: true; id?: string }
  | { ok: false; error: string }
  | { ok: false; code: "IN_USE"; error: string; products: { id: string; name: string }[] };
```

Render the `IN_USE` branch in `colour-row.tsx` per UI-SPEC §Surface 2 IN_USE error UI (heading red, listed product links with ExternalLink icon, "Archive instead" primary CTA). All other failure branches re-use the simple `bg-#fee2e2 text-#991b1b rounded-xl px-3 py-2 text-sm` block from `coupon-form.tsx:227-235`.

### Validation — Zod parse + first-issue surfacing

**Source:** `src/actions/admin-coupons.ts:106-109`

```typescript
const parsed = parseCouponForm(formData);
if (!parsed.success) {
  return { ok: false, error: parsed.error.issues[0].message };
}
const data = parsed.data;
```

**Apply to:** `createColour`, `updateColour` in `admin-colours.ts`. Use `parseColourForm(formData)` helper that mirrors `parseCouponForm` (lines 89-100).

### Reactivity (Phase 17 AD-06) — Pattern A vs Pattern B

**Source:** `src/components/admin/variant-editor.tsx:6-37` (contract docstring)

| Mutation | Pattern | Excerpt source |
|----------|---------|----------------|
| Field edit on `/admin/colours` row (toggle active) | A — optimistic + rollback | `coupon-row-actions.tsx:30-42` `onToggleActive` (currently uses `router.refresh()` — for Phase 18 colour-list page that's still acceptable because it's a server-rendered list, not a client-owned editor like variant-editor) |
| Create / update in form | A — `router.push()` to list after server confirms | `coupon-form.tsx:57-69` |
| Picker confirm (multi-add to a product) | B — `getVariantEditorData()` refetch | `variant-editor.tsx:181-184` `await refresh()` after `deleteProductOption` (existing precedent for shape-changing op) |
| Cascade rename | B — refresh both editor AND public PDP via `revalidateProductSurfaces` | `actions/variants.ts:41-53` |

**Apply to:** picker confirm in `colour-picker-dialog.tsx` MUST call the existing `getVariantEditorData(productId)` fn after `attachLibraryColours` resolves, then replace `options` + `variants` state — exactly the pattern at `variant-editor.tsx:181-184`.

### Revalidation — multi-surface invalidation

**Source:** `src/actions/variants.ts:41-53`

```typescript
async function revalidateProductSurfaces(productId: string): Promise<void> {
  revalidatePath(`/admin/products/${productId}/variants`);
  const [p] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (p) {
    revalidatePath(`/products/${p.slug}`);
    revalidatePath("/");
    revalidatePath("/shop");
  }
}
```

**Apply to:** `attachLibraryColours`, `cascadeRenameLibraryColour`, `detachLibraryColour`. For library-level mutations in `admin-colours.ts`, add a `revalidateColourSurfaces()` that hits `/admin/colours`, `/admin/colours/[id]/edit`, and `/shop` (because /shop sidebar derives its colour chips from this data).

### MariaDB no-LATERAL multi-query hydration

**Source:** `src/actions/products.ts:324-426` (full `getProduct` + `getProducts` block)

**Apply to:** `getAvailableColoursForShop` in `catalog.ts`, every join touching `colors → product_option_values → product_variants → products` chain (RESEARCH.md D-16, the IN_USE deletion guard, the cascade rename label-invalidator). Never use `db.query.X.findMany({ with: ... })`.

### Branding — palette source

**Source:** `src/lib/brand.ts:10-19`

```typescript
export const BRAND = {
  blue: "#1E8BFF",
  green: "#39E600",
  purple: "#A855F7",
  ink: "#0B1020",
  cream: "#F7FAF4",
} as const;
```

**Apply to:** every component file in this phase. UI-SPEC §Color locks the 60/30/10 split: backgrounds `#FFFFFF` / `BRAND.cream`, accents `BRAND.ink` (primary) + `BRAND.purple` (focus rings). Destructive uses `#EF4444` directly (not in `BRAND`); cf `coupon-form.tsx:230-234` and `coupon-row-actions.tsx:84,135-137` precedent.

### Tap-target rule — 48px minimum

**Source:** Phase 2 D-04 (referenced throughout `coupon-form.tsx` `min-h-[48px]` and `variant-selector.tsx:230-232` minWidth/minHeight 48).

**Apply to:** every interactive element added in this phase (form inputs, picker rows, chips on /shop, swatch buttons on PDP). Mobile picker: full-screen modal with 48px tap targets per UI-SPEC §Mobile.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/colour-contrast.ts` | utility (pure WCAG luminance helper) | transform | No existing WCAG-luminance helper in repo. UI-SPEC §"Color math helper" provides the canonical implementation; pattern-wise it slots into the same role as `src/lib/format.ts` (small pure helper module) but the math is novel for this codebase. |

All other files have role+flow analogs.

## Metadata

**Analog search scope:**
- `src/actions/` (admin-coupons.ts, products.ts, variants.ts)
- `src/components/admin/` (coupon-form.tsx, coupon-row-actions.tsx, variant-editor.tsx)
- `src/components/store/` (category-chips.tsx, variant-selector.tsx)
- `src/app/(admin)/admin/coupons/` (page, new, edit)
- `src/app/(store)/shop/` (page.tsx)
- `src/lib/` (auth-helpers.ts, catalog.ts, validators.ts, brand.ts, db/schema.ts)
- `src/content/admin-guide/products/` (variants-sizes.md frontmatter)
- `scripts/` (phase16-migrate.cjs, phase17-migrate.cjs, seed-categories.ts, seed-admin.ts)
- `Colours/bambu-lab-colors.html` (parser-shape verification)

**Files scanned:** 21 (15 read in full, 6 read targeted offsets/limits)

**Pattern extraction date:** 2026-04-26

**Naming reconciliation needed by planner:**
1. `phase18-migrate.cjs` is taken — pick `phase18-colours-migrate.cjs` (or similar) for the new applicator.
2. Reconcile `src/lib/colours.ts` vs `src/lib/colour-contrast.ts` — recommendation: keep contrast pure-math in `colour-contrast.ts`; keep DB+slug helpers in `colours.ts`.
3. UI-SPEC §Surface 1 says new-colour button uses `BRAND.ink`; `coupon` precedent uses `BRAND.green`. Follow UI-SPEC.
