import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  products,
  productVariants,
  productOptions,
  productOptionValues,
} from "@/lib/db/schema";
import { inArray, asc } from "drizzle-orm";
import { BRAND } from "@/lib/brand";
import { composeVariantLabel } from "@/lib/variants";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Inventory",
  robots: { index: false, follow: false },
};

/**
 * Phase 16-06 — /admin/inventory
 *
 * Per-variant inventory table. Replaces the old S/M/L 3-column grid with a
 * flat list of all variants across all active products. Each row shows:
 *   Product | Variant Label | SKU | Track Stock | Stock | In Stock | Low
 *
 * MariaDB no-LATERAL: 4 separate SELECTs joined in memory.
 */
export default async function AdminInventoryPage() {
  await requireAdmin();

  // 1. Fetch all active products
  const productRows = await db
    .select({ id: products.id, name: products.name, slug: products.slug })
    .from(products)
    .orderBy(asc(products.name));

  if (productRows.length === 0) {
    return (
      <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
        <div className="mx-auto max-w-5xl px-4 py-8">
          <h1 className="font-[var(--font-heading)] text-3xl mb-6">Inventory</h1>
          <p className="text-slate-600">No products found.</p>
        </div>
      </main>
    );
  }

  const productIds = productRows.map((p) => p.id);
  const productById = new Map(productRows.map((p) => [p.id, p]));

  // 2. Fetch all variants for all products, ordered by product then position
  const variantRows = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.productId, productIds))
    .orderBy(asc(productVariants.productId), asc(productVariants.position));

  // 3. Fetch options for all products
  const optionRows = await db
    .select()
    .from(productOptions)
    .where(inArray(productOptions.productId, productIds));

  // 4. Fetch all relevant option values
  const optionValueIds = [
    ...new Set(
      variantRows.flatMap((v) =>
        [v.option1ValueId, v.option2ValueId, v.option3ValueId].filter(
          (id): id is string => typeof id === "string",
        ),
      ),
    ),
  ];
  const valueRows =
    optionValueIds.length > 0
      ? await db
          .select()
          .from(productOptionValues)
          .where(inArray(productOptionValues.id, optionValueIds))
      : [];
  const valueById = new Map(valueRows.map((v) => [v.id, v]));

  // Build per-variant display rows
  type DisplayRow = {
    variantId: string;
    productId: string;
    productName: string;
    productSlug: string;
    label: string;
    sku: string | null;
    trackStock: boolean;
    stock: number;
    inStock: boolean;
    lowStockThreshold: number | null;
    isOOS: boolean;
  };

  const rows: DisplayRow[] = variantRows.map((v) => {
    const product = productById.get(v.productId)!;

    // Compose label from option values; fall back to labelCache / size
    const labelParts: string[] = [];
    for (const vid of [v.option1ValueId, v.option2ValueId, v.option3ValueId]) {
      if (vid) {
        const val = valueById.get(vid);
        if (val) labelParts.push(val.value);
      }
    }
    const label =
      labelParts.length > 0
        ? composeVariantLabel(labelParts)
        : (v.labelCache ?? v.size ?? "(default)");

    const trackedOOS = v.trackStock === true && (v.stock ?? 0) <= 0;
    const legacyOOS = v.trackStock !== true && v.inStock === false;
    const isOOS = trackedOOS || legacyOOS;

    return {
      variantId: v.id,
      productId: v.productId,
      productName: product.name,
      productSlug: product.slug,
      label,
      sku: v.sku ?? null,
      trackStock: v.trackStock ?? false,
      stock: v.stock ?? 0,
      inStock: v.inStock ?? true,
      lowStockThreshold: v.lowStockThreshold ?? null,
      isOOS,
    };
  });

  const oosCount = rows.filter((r) => r.isOOS).length;
  const totalVariants = rows.length;

  // Group by product for display
  const byProduct = new Map<string, DisplayRow[]>();
  for (const row of rows) {
    const list = byProduct.get(row.productId) ?? [];
    list.push(row);
    byProduct.set(row.productId, list);
  }

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">Inventory</h1>
            <p className="mt-1 text-slate-600 text-sm">
              {totalVariants} variant{totalVariants !== 1 ? "s" : ""} across{" "}
              {productRows.length} product{productRows.length !== 1 ? "s" : ""}.
              {oosCount > 0 ? (
                <span className="ml-2 font-semibold" style={{ color: "#dc2626" }}>
                  {oosCount} out of stock.
                </span>
              ) : (
                <span className="ml-2 font-semibold" style={{ color: BRAND.green }}>
                  All in stock.
                </span>
              )}
            </p>
          </div>
        </header>

        <div className="space-y-6">
          {productRows.map((product) => {
            const pRows = byProduct.get(product.id) ?? [];
            if (pRows.length === 0) return null;
            const anyOOS = pRows.some((r) => r.isOOS);
            return (
              <section
                key={product.id}
                className="rounded-2xl bg-white overflow-hidden border"
                style={{ borderColor: anyOOS ? "#dc262633" : "#e4e4e7" }}
              >
                <div
                  className="px-4 py-3 flex items-center justify-between gap-3"
                  style={{ backgroundColor: anyOOS ? "#fef2f2" : "#f4f4f5" }}
                >
                  <h2 className="font-semibold text-sm">{product.name}</h2>
                  <Link
                    href={`/admin/products/${product.id}/variants`}
                    className="text-xs underline decoration-dotted"
                    style={{ color: BRAND.purple }}
                  >
                    Edit variants →
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead style={{ backgroundColor: "#f9f9f9" }}>
                      <tr className="text-left text-xs text-slate-500 uppercase tracking-wide">
                        <th className="px-4 py-2">Variant</th>
                        <th className="px-4 py-2">SKU</th>
                        <th className="px-4 py-2 text-center">Track Stock</th>
                        <th className="px-4 py-2 text-center">Stock</th>
                        <th className="px-4 py-2 text-center">In Stock</th>
                        <th className="px-4 py-2 text-center">Low Threshold</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pRows.map((r) => (
                        <tr
                          key={r.variantId}
                          className="border-t border-black/5"
                          style={r.isOOS ? { backgroundColor: "#fef2f2" } : {}}
                        >
                          <td className="px-4 py-2 font-medium">
                            {r.label}
                            {r.isOOS ? (
                              <span
                                className="ml-2 text-xs font-bold rounded-full px-2 py-0.5"
                                style={{ backgroundColor: "#dc262615", color: "#dc2626" }}
                              >
                                OOS
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-slate-500">
                            {r.sku ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {r.trackStock ? (
                              <span className="text-xs font-semibold" style={{ color: BRAND.purple }}>Yes</span>
                            ) : (
                              <span className="text-xs text-slate-400">No</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center font-mono">
                            {r.trackStock ? r.stock : "—"}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {r.inStock ? (
                              <span className="text-xs font-semibold" style={{ color: BRAND.green }}>Yes</span>
                            ) : (
                              <span className="text-xs font-semibold" style={{ color: "#dc2626" }}>No</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center font-mono text-xs text-slate-500">
                            {r.lowStockThreshold ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <p className="text-slate-600 mt-6">No variants found. Add variants via the product editor.</p>
        ) : null}
      </div>
    </main>
  );
}
