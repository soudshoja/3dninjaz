// Types shared by the product-cost server code and the admin cost UI. Kept out
// of any "use server" file (those may only export async functions).

/**
 * One option ("variant") of a product's Select field. Its own cost is
 * optional: a blank cost means the product cost is used.
 */
export type OptionCostRow = {
  /** Stable key for selection / React: `${productId}::${fieldId}::${value}`. */
  key: string;
  fieldId: string;
  /** The option value stored on order lines (configValues[fieldId]). */
  value: string;
  label: string;
  /** Label of the Select field, shown when a product has more than one. */
  fieldLabel: string;
  /** Option price override, else null (the product price applies). */
  price: number | null;
  /** Own cost, else null (falls back to the product cost). */
  cost: number | null;
};

/** Address of one option, for server actions. */
export type OptionTarget = { productId: string; fieldId: string; value: string };

/** One product as the cost screens see it (admin-only; carries cost). */
export type ProductCostRow = {
  id: string;
  name: string;
  productType: string; // stocked | configurable | keychain | vending | simple
  categoryId: string | null;
  categoryName: string | null;
  isActive: boolean;
  isFeatured: boolean;
  thumbUrl: string | null;
  /** Representative sell price (lowest variant / lowest tier). */
  price: number | null;
  /** Human price label, e.g. "RM 7.00 - 22.00". */
  priceLabel: string;
  /** Price tiers by keycap count (keychains), else null. */
  tiers: Record<string, number> | null;
  cost: number | null;
  costPerExtra: number | null;
  /** ISO timestamp or null. */
  costUpdatedAt: string | null;
  /** Options of the product's Select field(s); empty for most products. */
  options: OptionCostRow[];
};

export type BulkCostMode =
  | { kind: "set"; amount: number }
  | { kind: "percent_of_price"; percent: number }
  | { kind: "adjust_rm"; delta: number }
  | { kind: "adjust_percent"; percent: number };

/** What a bulk apply changed; handed back so the client can offer Undo. */
export type BulkCostChange = {
  /** Product id (also for an option change; see `option`). */
  id: string;
  /** Set when this change is the cost of one Select option, not the product. */
  option?: { fieldId: string; value: string };
  oldCost: number | null;
  oldCostPerExtra: number | null;
  oldCostUpdatedAt: string | null;
  newCost: number | null;
};

export type BulkCostResult =
  | { ok: true; changes: BulkCostChange[]; skipped: number }
  | { ok: false; error: string };

export type OptionCostResult =
  | { ok: true; cost: number | null }
  | { ok: false; error: string };

export type SimpleCostResult =
  | { ok: true; cost: number | null; costPerExtra: number | null }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type CostImportIssue = { level: "error" | "warning"; message: string };

export type CostImportRow = {
  /** 1-based spreadsheet row number, for the report. */
  rowNumber: number;
  productId: string;
  /** Set on a variant row: the Select option this row costs ("fieldId|value"). */
  optionKey: string | null;
  optionLabel: string | null;
  sheetName: string;
  sheetPrice: number | null;
  /** Parsed new cost; null = blank (skipped). */
  newCost: number | null;
  newCostPerExtra: number | null;
  /** Current DB values (null when the product is unknown). */
  productName: string | null;
  productType: string | null;
  currentPrice: number | null;
  oldCost: number | null;
  oldCostPerExtra: number | null;
  /** What will happen on commit. */
  action: "update" | "unchanged" | "skip" | "error";
  newMarginPct: number | null;
  issues: CostImportIssue[];
};

/** Optional "also fill old order lines" step. In a dry run, `filled` = would fill. */
export type CostImportBackfill = {
  requested: boolean;
  filled: number;
  /** Lines left NULL because the keycap count could not be read. */
  unparsable: Array<{ orderItemId: string; productName: string; reason: string }>;
};

export type CostImportPreview = {
  ok: true;
  rows: CostImportRow[];
  counts: {
    total: number;
    update: number;
    unchanged: number;
    skip: number;
    error: number;
    warnings: number;
  };
  backfill: CostImportBackfill;
};

export type CostImportChange = {
  productId: string;
  /** Set when the change is one Select option's cost, not the product's. */
  optionKey?: string | null;
  name: string;
  oldCost: number | null;
  oldCostPerExtra: number | null;
  newCost: number | null;
  newCostPerExtra: number | null;
};

export type CostImportCommitResult =
  | {
      ok: true;
      updated: number;
      unchanged: number;
      skipped: number;
      errors: number;
      /** Old values of every product that changed (for the report). */
      changes: CostImportChange[];
      backfill: CostImportBackfill;
    }
  | { ok: false; error: string };
