import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { products, productVariants } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";
import { VariantStockToggle } from "@/components/admin/variant-stock-toggle";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin · Inventory",
  robots: { index: false, follow: false },
};

/**
 * /admin/inventory — flat list of every active product's variants with a
 * per-row in-stock toggle + low-stock threshold input. Mirrors the existing
 * admin-orders pattern: card with horizontally scrollable table inside.
 *
 * v1 manual inventory (PROJECT.md out-of-scope: real quantity tracking
 * deferred). The yellow indicator on /admin/products list (added by
 * VariantStockToggle's threshold field) flags items the operator should
 * eyeball — but actual quantity counts are NOT tracked here.
 */
export default async function AdminInventoryPage() {
  await requireAdmin();

  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      productSlug: products.slug,
      isActive: products.isActive,
      variantId: productVariants.id,
      size: productVariants.size,
      price: productVariants.price,
      inStock: productVariants.inStock,
      lowStockThreshold: productVariants.lowStockThreshold,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .orderBy(asc(products.name), asc(productVariants.size));

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Inventory
          </h1>
          <p className="mt-1 text-slate-600">
            {rows.length} variants · toggle to show &quot;Sold out&quot; on the
            storefront.
          </p>
        </header>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold mb-2">No variants yet.</p>
            <p className="text-sm text-slate-600">
              Add a product first.{" "}
              <Link
                href="/admin/products/new"
                className="underline decoration-dotted"
              >
                Create product
              </Link>
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
          >
            <div className="overflow-x-auto">
              <table className="min-w-[820px] w-full text-sm">
                <thead>
                  <tr
                    className="text-left"
                    style={{ backgroundColor: `${BRAND.ink}0d` }}
                  >
                    <th className="p-3">Product</th>
                    <th className="p-3">Size</th>
                    <th className="p-3">Price</th>
                    <th className="p-3">Stock toggle</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.variantId}
                      className="border-t border-black/10"
                    >
                      <td className="p-3">
                        <Link
                          href={`/products/${r.productSlug}`}
                          className="font-semibold underline decoration-dotted"
                          style={{ color: BRAND.ink }}
                        >
                          {r.productName}
                        </Link>
                        {!r.isActive ? (
                          <span className="ml-2 text-xs text-slate-500">
                            (inactive)
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 font-mono text-sm">{r.size}</td>
                      <td className="p-3 whitespace-nowrap font-bold">
                        {formatMYR(r.price)}
                      </td>
                      <td className="p-3">
                        <VariantStockToggle
                          variantId={r.variantId}
                          initialInStock={!!r.inStock}
                          initialThreshold={r.lowStockThreshold ?? null}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
