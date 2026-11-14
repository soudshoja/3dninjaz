import "server-only";
// Server side of the bulk cost import: reads the uploaded .xlsx / .csv, matches
// rows to products by id, applies the new costs in ONE transaction and (if
// asked) back-fills old order lines with an estimate.
//
// The dry run runs the exact same code as the commit inside a transaction that
// is rolled back, so the preview can never disagree with the real thing.

import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderItems, productVariants, products } from "@/lib/db/schema";
import { ensureTiers } from "@/lib/config-fields";
import {
  extractCostRows,
  summariseRows,
  validateCostRows,
  type ProductSnapshot,
} from "@/lib/product-cost-import-parse";
import { resolveUnitCosts } from "@/lib/product-cost";
import {
  costToNumber,
  deriveUnitCount,
  representativePrice,
  toCostString,
} from "@/lib/product-cost-math";
import type {
  CostImportBackfill,
  CostImportChange,
  CostImportPreview,
  CostImportRow,
} from "@/lib/product-cost-types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Thrown inside the dry-run transaction to force a rollback. */
class DryRunRollback extends Error {
  constructor(public readonly payload: ImportRun) {
    super("dry-run rollback");
  }
}

export type ImportRun = {
  rows: CostImportRow[];
  updated: number;
  unchanged: number;
  skipped: number;
  errors: number;
  changes: CostImportChange[];
  backfill: CostImportBackfill;
};

// File -> grid lives in product-cost-file.ts (DB-free, unit tested).
export { fileToGrid, MAX_IMPORT_BYTES } from "@/lib/product-cost-file";

// ---------------------------------------------------------------------------
// Product snapshots
// ---------------------------------------------------------------------------

async function loadSnapshots(
  tx: Tx,
  ids: string[],
): Promise<Map<string, ProductSnapshot>> {
  const map = new Map<string, ProductSnapshot>();
  if (ids.length === 0) return map;
  const rows = await tx
    .select({
      id: products.id,
      name: products.name,
      productType: products.productType,
      priceTiers: products.priceTiers,
      costPrice: products.costPrice,
      costPerExtraUnit: products.costPerExtraUnit,
    })
    .from(products)
    .where(inArray(products.id, ids));
  const variantRows = await tx
    .select({ productId: productVariants.productId, price: productVariants.price })
    .from(productVariants)
    .where(inArray(productVariants.productId, ids));
  const prices = new Map<string, number[]>();
  for (const v of variantRows) {
    const n = Number(v.price);
    if (!Number.isFinite(n)) continue;
    const b = prices.get(v.productId) ?? [];
    b.push(n);
    prices.set(v.productId, b);
  }
  for (const r of rows) {
    const type = r.productType ?? "stocked";
    map.set(r.id, {
      id: r.id,
      name: r.name,
      productType: type,
      price: representativePrice({
        productType: type,
        variantPrices: prices.get(r.id) ?? [],
        priceTiers: type === "stocked" ? null : ensureTiers(r.priceTiers),
      }),
      cost: costToNumber(r.costPrice),
      costPerExtra: costToNumber(r.costPerExtraUnit),
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Optional back-fill of old order lines
// ---------------------------------------------------------------------------

/**
 * Fill order_items.unit_cost for lines that have none (or only an earlier
 * 'estimate') using the CURRENT product costs, marking them 'estimate'.
 * 'snapshot' and 'manual' lines are never touched. Keychain lines whose keycap
 * count cannot be read are left as they are and listed.
 */
async function backfillOrderLines(tx: Tx): Promise<CostImportBackfill> {
  const lines = await tx
    .select({
      id: orderItems.id,
      productId: orderItems.productId,
      variantId: orderItems.variantId,
      productName: orderItems.productName,
      configurationData: orderItems.configurationData,
      unitCost: orderItems.unitCost,
      unitCostSource: orderItems.unitCostSource,
    })
    .from(orderItems)
    .where(or(isNull(orderItems.unitCost), eq(orderItems.unitCostSource, "estimate")));
  if (lines.length === 0) return { requested: true, filled: 0, unparsable: [] };

  const productIds = [...new Set(lines.map((l) => l.productId).filter((v) => !!v))];
  const productRows = await tx
    .select({
      id: products.id,
      productType: products.productType,
      costPerExtraUnit: products.costPerExtraUnit,
      unitField: products.unitField,
    })
    .from(products)
    .where(inArray(products.id, productIds));
  const byId = new Map(productRows.map((p) => [p.id, p]));

  const unparsable: CostImportBackfill["unparsable"] = [];
  const candidates: Array<{
    id: string;
    productId: string;
    variantId: string;
    values: Record<string, string> | null;
    existing: number | null;
  }> = [];

  for (const l of lines) {
    const p = byId.get(l.productId);
    if (!p) continue; // manual / deleted product: nothing to estimate from
    let values: Record<string, string> | null = null;
    if (l.configurationData) {
      try {
        const parsed = JSON.parse(l.configurationData) as { values?: Record<string, string> };
        if (parsed && typeof parsed.values === "object" && parsed.values) values = parsed.values;
      } catch {
        values = null;
      }
    }
    const needsCount =
      p.productType === "keychain" && costToNumber(p.costPerExtraUnit) !== null;
    if (needsCount && deriveUnitCount(p.unitField ?? null, values) === null) {
      unparsable.push({
        orderItemId: l.id,
        productName: l.productName,
        reason: "Could not read the keycap count from this line",
      });
      continue;
    }
    candidates.push({
      id: l.id,
      productId: l.productId,
      variantId: l.variantId,
      values,
      existing: costToNumber(l.unitCost),
    });
  }

  const resolved = await resolveUnitCosts(
    candidates.map((c) => ({
      productId: c.productId,
      variantId: c.variantId,
      configValues: c.values,
    })),
    tx,
  );

  // Group ids by the cost to write so we issue few UPDATEs.
  const byCost = new Map<string, string[]>();
  candidates.forEach((c, i) => {
    const next = resolved[i]?.unitCost ?? null;
    if (next === null) return;
    if (c.existing !== null && c.existing === next) return; // already that estimate
    const key = toCostString(next)!;
    const bucket = byCost.get(key) ?? [];
    bucket.push(c.id);
    byCost.set(key, bucket);
  });

  let filled = 0;
  for (const [cost, ids] of byCost) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      // Guard again in SQL so a manual edit made meanwhile is never overwritten.
      await tx
        .update(orderItems)
        .set({ unitCost: cost, unitCostSource: "estimate" })
        .where(
          and(
            inArray(orderItems.id, chunk),
            or(isNull(orderItems.unitCost), eq(orderItems.unitCostSource, "estimate")),
          ),
        );
      filled += chunk.length;
    }
  }
  return { requested: true, filled, unparsable };
}

// ---------------------------------------------------------------------------
// Run (dry or real)
// ---------------------------------------------------------------------------

async function runImportInTx(
  tx: Tx,
  grid: unknown[][],
  opts: { backfill: boolean },
): Promise<ImportRun> {
  const raw = extractCostRows(grid);
  const ids = [...new Set(raw.map((r) => r.productId).filter((v) => !!v))];
  const snapshots = await loadSnapshots(tx, ids);
  const rows = validateCostRows(raw, snapshots);

  const changes: CostImportChange[] = [];
  const now = new Date();
  for (const r of rows) {
    if (r.action !== "update") continue;
    const snap = snapshots.get(r.productId);
    if (!snap) continue;
    const nextCost = r.newCost ?? snap.cost;
    const nextExtra = r.newCostPerExtra ?? snap.costPerExtra;
    await tx
      .update(products)
      .set({
        costPrice: toCostString(nextCost),
        costPerExtraUnit: toCostString(nextExtra),
        costUpdatedAt: now,
      })
      .where(eq(products.id, r.productId));
    changes.push({
      productId: r.productId,
      name: snap.name,
      oldCost: snap.cost,
      oldCostPerExtra: snap.costPerExtra,
      newCost: nextCost,
      newCostPerExtra: nextExtra,
    });
  }

  const counts = summariseRows(rows);
  const backfill = opts.backfill
    ? await backfillOrderLines(tx)
    : { requested: false, filled: 0, unparsable: [] };

  return {
    rows,
    updated: changes.length,
    unchanged: counts.unchanged,
    skipped: counts.skip,
    errors: counts.error,
    changes,
    backfill,
  };
}

/** Dry run: same code path as commit, rolled back. */
export async function previewImport(
  grid: unknown[][],
  opts: { backfill: boolean },
): Promise<CostImportPreview> {
  try {
    await db.transaction(async (tx) => {
      const run = await runImportInTx(tx, grid, opts);
      throw new DryRunRollback(run);
    });
  } catch (err) {
    if (err instanceof DryRunRollback) {
      const run = err.payload;
      return {
        ok: true,
        rows: run.rows,
        counts: summariseRows(run.rows),
        backfill: run.backfill,
      };
    }
    throw err;
  }
  // Unreachable: the transaction callback always throws.
  throw new Error("dry run did not roll back");
}

/** Real commit: ONE transaction, all or nothing. Rows with errors are skipped. */
export async function commitImport(
  grid: unknown[][],
  opts: { backfill: boolean },
): Promise<ImportRun> {
  return db.transaction((tx) => runImportInTx(tx, grid, opts));
}

