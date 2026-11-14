import { describe, it, expect, vi, beforeEach } from "vitest";

// Storefront must NEVER leak product cost. These tests run the real catalog and
// variant hydration against a mocked database that returns rows full of cost
// data, then assert nothing cost-related survives into the rendered payload.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

// Queue-based thenable chain: every awaited query pops the next result.
const queue: unknown[][] = [];
vi.mock("@/lib/db", () => {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const m of ["from", "where", "orderBy", "limit", "innerJoin", "groupBy"]) {
      chain[m] = self;
    }
    chain.then = (resolve: (v: unknown) => unknown) => resolve(queue.shift() ?? []);
    return chain;
  };
  return { db: { select: () => makeChain() } };
});

import { getActiveProductBySlug, stripProductCosts, stripVariantCosts } from "./catalog";
import { hydrateProductVariants } from "./variants";

const SECRET_COST = "7.77";
const SECRET_EXTRA = "1.23";
const SECRET_VARIANT_COST = "4.56";

const productRow = {
  id: "p1",
  name: "Dragon",
  slug: "dragon",
  description: "d",
  images: JSON.stringify(["/uploads/products/p1/a.jpg"]),
  thumbnailIndex: 0,
  isActive: true,
  isFeatured: false,
  soldOut: false,
  categoryId: null,
  subcategoryId: null,
  productType: "keychain",
  priceTiers: JSON.stringify({ "1": 7, "2": 9 }),
  maxUnitCount: 2,
  costPrice: SECRET_COST,
  costPerExtraUnit: SECRET_EXTRA,
  costUpdatedAt: new Date("2026-11-01T00:00:00Z"),
};

const variantRow = {
  id: "v1",
  productId: "p1",
  price: "9.00",
  salePrice: null,
  saleFrom: null,
  saleTo: null,
  stock: 3,
  inStock: true,
  trackStock: false,
  sku: null,
  imageUrl: null,
  labelCache: "Small",
  position: 0,
  option1ValueId: null,
  option2ValueId: null,
  option3ValueId: null,
  option4ValueId: null,
  option5ValueId: null,
  option6ValueId: null,
  costPrice: SECRET_VARIANT_COST,
  filamentGrams: "10.0",
  printTimeHours: "1.5",
  laborMinutes: "5",
  otherCost: "0.20",
  filamentRateOverride: null,
  laborRateOverride: null,
  costPriceManual: true,
  isDefault: true,
  weightG: null,
  allowPreorder: false,
};

describe("storefront cost leak", () => {
  beforeEach(() => {
    queue.length = 0;
  });

  it("getActiveProductBySlug payload contains no product or variant cost", async () => {
    // Query order: product, variants, options (no categories/values needed).
    queue.push([productRow], [variantRow], []);
    const product = await getActiveProductBySlug("dragon");
    expect(product).not.toBeNull();
    const json = JSON.stringify(product);
    expect(json).not.toContain(SECRET_COST);
    expect(json).not.toContain(SECRET_EXTRA);
    expect(json).not.toContain(SECRET_VARIANT_COST);
    expect(json).not.toContain("costUpdatedAt");
    expect(Object.keys(product as object)).not.toContain("costPrice");
    expect(Object.keys(product as object)).not.toContain("costPerExtraUnit");
    // Price data still comes through.
    expect(json).toContain("9.00");
  });

  it("hydrateProductVariants (PDP + POS) strips variant cost by default", async () => {
    queue.push([], [variantRow]); // options empty, then variants
    const { variants } = await hydrateProductVariants("p1");
    const json = JSON.stringify(variants);
    expect(json).not.toContain(SECRET_VARIANT_COST);
    expect(variants[0].costPrice).toBeNull();
    expect(variants[0].filamentGrams).toBeNull();
  });

  it("hydrateProductVariants keeps cost only when the admin asks for it", async () => {
    queue.push([], [variantRow]);
    const { variants } = await hydrateProductVariants("p1", { includeCosts: true });
    expect(variants[0].costPrice).toBe(SECRET_VARIANT_COST);
  });

  it("strip helpers remove every cost key", () => {
    const stripped = stripProductCosts(productRow);
    expect(stripped).not.toHaveProperty("costPrice");
    expect(stripped).not.toHaveProperty("costPerExtraUnit");
    expect(stripped).not.toHaveProperty("costUpdatedAt");
    expect(stripped.name).toBe("Dragon");
    const v = stripVariantCosts(variantRow as never) as unknown as Record<string, unknown>;
    expect(v.costPrice).toBeNull();
    expect(v.otherCost).toBeNull();
  });
});
