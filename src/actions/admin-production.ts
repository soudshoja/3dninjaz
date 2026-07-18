"use server";

import { db } from "@/lib/db";
import { orders, orderItems, products, productConfigFields } from "@/lib/db/schema";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { formatOrderNumber, isManualLine } from "@/lib/orders";
import { ensureOrderItemConfigData, type KeycapSlot } from "@/lib/config-fields";
import {
  parseKeychainParts,
  parseKeycapSequence,
  type KeychainParts,
} from "@/lib/keychain-parts";
import { KEYCAP_ICON_BY_ID } from "@/lib/keycap-icons";

// ============================================================================
// Production board — admin fulfilment queue.
//
// Paid + processing orders flow in automatically. Each line item carries a
// `productionDone` tick; when every item of an order is ticked the order falls
// into the Processed tab. The line-wise queue is sortable (productionSort).
//
// SECURITY: every exported function calls `await requireAdmin()` FIRST
// (CVE-2025-29927 — middleware is not a boundary).
// MariaDB 10.11: no LATERAL — manual select + inArray hydration.
// ============================================================================

/** Statuses that put an order on the production floor. */
const PRODUCTION_STATUSES = ["paid", "processing"] as const;

export type ProductionItem = {
  id: string;
  /** Full single-line label (product + details) — used where space is tight. */
  name: string;
  /** Base product name (heading). */
  productName: string;
  /** Configured/variant details, one chip each — what to actually produce. */
  details: string[];
  /** Size (S/M/L) if the product carries one. */
  size: string | null;
  quantity: number;
  done: boolean;
  sort: number | null;
};

export type ProductionOrder = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  createdAt: string; // ISO
  items: ProductionItem[];
  doneCount: number;
  totalCount: number;
};

export type ProductionLineItem = {
  id: string;
  name: string;
  productName: string;
  details: string[];
  size: string | null;
  quantity: number;
  orderId: string;
  invoiceNumber: string;
  clientName: string;
};

export type ProductionBoard = {
  production: ProductionOrder[];
  processed: ProductionOrder[];
  lineItems: ProductionLineItem[];
};

/**
 * Break a line into the detail needed to actually produce/print it:
 * the base product name plus each configured/variant attribute as its own
 * chip (e.g. `"ELLIE" (5 your name)`, `Matte Pastel Periwinkle base`, …).
 */
function itemView(item: typeof orderItems.$inferSelect): {
  name: string;
  productName: string;
  details: string[];
  size: string | null;
} {
  const productName = item.productName;
  const size = item.size ?? null;
  let details: string[] = [];
  if (!isManualLine(item)) {
    const cfg = ensureOrderItemConfigData(item.configurationData);
    if (cfg?.computedSummary) {
      details = cfg.computedSummary
        .split("·")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (item.variantLabel) {
      details = item.variantLabel
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  const name = details.length
    ? `${productName} (${details.join(" · ")})`
    : productName;
  return { name, productName, details, size };
}

/**
 * Load the full production board: in-production orders (≥1 unmade item),
 * processed orders (all made), and the flattened sortable line queue.
 */
export async function getProductionBoard(): Promise<ProductionBoard> {
  await requireAdmin();

  const orderRows = await db
    .select({
      id: orders.id,
      shippingName: orders.shippingName,
      status: orders.status,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(inArray(orders.status, [...PRODUCTION_STATUSES]))
    .orderBy(asc(orders.createdAt));

  if (orderRows.length === 0) {
    return { production: [], processed: [], lineItems: [] };
  }

  const ids = orderRows.map((o) => o.id);
  const items = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, ids));

  // Group items by order, preserving a stable per-order order (id asc).
  const itemsByOrder = new Map<string, (typeof items)[number][]>();
  for (const it of items) {
    const list = itemsByOrder.get(it.orderId) ?? [];
    list.push(it);
    itemsByOrder.set(it.orderId, list);
  }

  const production: ProductionOrder[] = [];
  const processed: ProductionOrder[] = [];

  for (const o of orderRows) {
    const its = (itemsByOrder.get(o.id) ?? []).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    if (its.length === 0) continue; // nothing to make
    const mapped: ProductionItem[] = its.map((it) => {
      const v = itemView(it);
      return {
        id: it.id,
        name: v.name,
        productName: v.productName,
        details: v.details,
        size: v.size,
        quantity: it.quantity,
        done: it.productionDone,
        sort: it.productionSort,
      };
    });
    const doneCount = mapped.filter((m) => m.done).length;
    const card: ProductionOrder = {
      id: o.id,
      invoiceNumber: formatOrderNumber(o.id),
      clientName: o.shippingName,
      createdAt: (o.createdAt instanceof Date
        ? o.createdAt
        : new Date(o.createdAt)
      ).toISOString(),
      items: mapped,
      doneCount,
      totalCount: mapped.length,
    };
    if (doneCount === mapped.length) processed.push(card);
    else production.push(card);
  }

  // Flatten unmade items into the sortable line queue. Sort by productionSort
  // (nulls last), then by the parent order's createdAt for a stable default.
  const orderCreatedAt = new Map(
    orderRows.map((o) => [
      o.id,
      (o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt)).getTime(),
    ]),
  );
  const lineItems: ProductionLineItem[] = items
    .filter((it) => !it.productionDone)
    .map((it) => {
      const card =
        production.find((p) => p.id === it.orderId) ??
        processed.find((p) => p.id === it.orderId);
      return {
        it,
        view: itemView(it),
        clientName: card?.clientName ?? "",
        invoiceNumber: card?.invoiceNumber ?? formatOrderNumber(it.orderId),
      };
    })
    .sort((a, b) => {
      const sa = a.it.productionSort;
      const sb = b.it.productionSort;
      if (sa != null && sb != null) return sa - sb;
      if (sa != null) return -1;
      if (sb != null) return 1;
      return (
        (orderCreatedAt.get(a.it.orderId) ?? 0) -
        (orderCreatedAt.get(b.it.orderId) ?? 0)
      );
    })
    .map(({ it, view, clientName, invoiceNumber }) => ({
      id: it.id,
      name: view.name,
      productName: view.productName,
      details: view.details,
      size: view.size,
      quantity: it.quantity,
      orderId: it.orderId,
      invoiceNumber,
      clientName,
    }));

  return { production, processed, lineItems };
}

/** Tick / untick a single line item as made. */
export async function toggleProductionItemDone(
  orderItemId: string,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (typeof orderItemId !== "string" || orderItemId.length === 0) {
    return { ok: false, error: "Invalid item." };
  }
  try {
    await db
      .update(orderItems)
      .set({ productionDone: done })
      .where(eq(orderItems.id, orderItemId));
    revalidatePath("/admin/production");
    return { ok: true };
  } catch (err) {
    console.error("[production] toggle failed", orderItemId, err);
    return { ok: false, error: "Could not update the item." };
  }
}

/** Mark every line of an order as made (or unmade) in one go. */
export async function setOrderProductionDone(
  orderId: string,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (typeof orderId !== "string" || orderId.length === 0) {
    return { ok: false, error: "Invalid order." };
  }
  try {
    await db
      .update(orderItems)
      .set({ productionDone: done })
      .where(eq(orderItems.orderId, orderId));
    revalidatePath("/admin/production");
    return { ok: true };
  } catch (err) {
    console.error("[production] bulk toggle failed", orderId, err);
    return { ok: false, error: "Could not update the order." };
  }
}

/**
 * Persist the admin's line-wise production order. `orderedIds` is the full
 * visible queue top-to-bottom; each item's productionSort is set to its index.
 */
export async function reorderProductionLineItems(
  orderedIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { ok: true };
  }
  // Guard: only touch ids that are real, unmade line items.
  const valid = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(
      and(
        inArray(orderItems.id, orderedIds),
        eq(orderItems.productionDone, false),
      ),
    );
  const validIds = new Set(valid.map((v) => v.id));
  try {
    let sort = 0;
    for (const id of orderedIds) {
      if (!validIds.has(id)) continue;
      await db
        .update(orderItems)
        .set({ productionSort: sort })
        .where(eq(orderItems.id, id));
      sort += 1;
    }
    revalidatePath("/admin/production");
    return { ok: true };
  } catch (err) {
    console.error("[production] reorder failed", err);
    return { ok: false, error: "Could not save the new order." };
  }
}

// ============================================================================
// Keychain batch production — Task 2.
//
// Three new exports:
//   setOrderInProduction  — flag/unflag an order for the production floor
//   getKeychainBatches    — aggregate all in-production keychain units by part
//   markKeychainPartPrinted — tick base or clicker+letter batch done
//   setKeychainAssembled    — final assembly tick (requires both parts done)
// ============================================================================

/**
 * Flag or unflag an order for the keychain production floor.
 * Sets orders.productionAddedAt = now (on=true) or null (on=false).
 * Any order status is accepted — the flag is independent of fulfilment status.
 */
export async function setOrderInProduction(
  orderId: string,
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (typeof orderId !== "string" || orderId.length === 0) {
    return { ok: false, error: "Invalid order." };
  }
  try {
    await db
      .update(orders)
      .set({ productionAddedAt: on ? new Date() : null })
      .where(eq(orders.id, orderId));
    revalidatePath("/admin/production");
    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    return { ok: true };
  } catch (err) {
    console.error("[production] setOrderInProduction failed", orderId, err);
    return { ok: false, error: "Could not update the order." };
  }
}

// ── Keychain batch types ──────────────────────────────────────────────────────

/** A single customer keychain unit inside a batch. */
export type KeychainUnit = {
  itemId: string;
  orderId: string;
  invoiceNumber: string;
  clientName: string;
  /** Customer's chosen name text (e.g. "ATHIYYA"). */
  name: string;
  /**
   * Number of LETTER keycap boxes to print = letter-slot count (NOT total
   * slots, NOT name.length). For a mixed letter+icon sequence this is the
   * `letterCount` from the structured sequence; icon slots do NOT count here —
   * they print in the separate icon batch. Drives BASE + CLICKER+LETTER box
   * maths (`letters × qty`). See Pitfall 1 (25-RESEARCH.md).
   */
  letters: number;
  base: string;
  clicker: string;
  letter: string;
  quantity: number;
  baseDone: boolean;
  clickerLetterDone: boolean;
  /** True when the icon parts of this unit are printed (mixed units only). */
  iconDone: boolean;
  productionDone: boolean;
  /** Base body shape — product-level attribute, drives BASE batch splitting. */
  shape: "square" | "round";
  /**
   * The decoded mixed keycap sequence (letters + icons in order) for this unit,
   * or [] for legacy/letter-only/round orders with no structured sequence.
   * Drives the icon batch grouping (by icon id, D-11).
   */
  slots: KeycapSlot[];
  /** Icon-slot count in this unit's sequence (0 for all-letter/legacy units). */
  iconCount: number;
  /** 0-based index of this physical keychain within its order line. Each unit
   *  of a quantity-N line becomes its own item-wise row (all sharing itemId). */
  unitIndex: number;
};

/** Aggregated base-colour printing batch. */
export type KeychainBaseBatch = {
  base: string;
  totalQty: number;
  items: KeychainUnit[];
  doneCount: number;
  allDone: boolean;
  /** Base body shape shared by every item in this batch. */
  shape: "square" | "round";
};

/** Aggregated clicker+letter printing batch (printed together as one piece). */
export type KeychainClickerLetterBatch = {
  clicker: string;
  letter: string;
  totalQty: number;
  items: KeychainUnit[];
  doneCount: number;
  allDone: boolean;
  /** Clicker/letter body shape shared by every item in this batch. */
  shape: "square" | "round";
};

/**
 * Aggregated icon printing batch (D-11). Icon keycaps print as a fixed WHITE
 * shell + baked accent parts — colours are FIXED per icon design, not chosen by
 * the customer — so they do NOT share the letter's Base/Clicker/Letter
 * colour-driven grouping. They batch by icon id only (icons are square-only per
 * D-01, so no shape in the key). One icon-print entry per icon slot.
 */
export type KeychainIconBatch = {
  /** Catalog icon id, e.g. "alien". */
  iconId: string;
  /** Human label from the catalog, e.g. "Alien" (falls back to the id). */
  iconLabel: string;
  /** Total icon prints = Σ (count of this icon id in a unit × unit qty). */
  totalQty: number;
  /** Distinct units that include this icon (deduped — one entry per unit). */
  items: KeychainUnit[];
  doneCount: number;
  allDone: boolean;
};

/** Assembly view of a single keychain unit. */
export type KeychainAssemblyUnit = KeychainUnit & {
  /**
   * True when the unit is ready to assemble — both baseDone AND
   * clickerLetterDone, AND (for mixed units with icons) iconDone. A unit with
   * `iconCount === 0` ignores the icon condition (letter-only behaviour).
   */
  bothPartsDone: boolean;
};

export type KeychainBatches = {
  bases: KeychainBaseBatch[];
  clickerLetters: KeychainClickerLetterBatch[];
  /** Icon print batches, keyed by icon id (D-11). Empty for all-letter stores. */
  icons: KeychainIconBatch[];
  assembly: KeychainAssemblyUnit[];
};

/**
 * Load all in-production orders (productionAddedAt IS NOT NULL), parse their
 * keychain items, and group them into base / clicker+letter / assembly batches.
 *
 * MariaDB 10.11 safe: two sequential SELECTs + in-memory join.
 */
export async function getKeychainBatches(): Promise<KeychainBatches> {
  await requireAdmin();

  // 1) Orders that have been flagged for the production floor.
  const orderRows = await db
    .select({
      id: orders.id,
      shippingName: orders.shippingName,
      status: orders.status,
      productionAddedAt: orders.productionAddedAt,
    })
    .from(orders)
    .where(isNotNull(orders.productionAddedAt))
    .orderBy(asc(orders.productionAddedAt));

  if (orderRows.length === 0) {
    return { bases: [], clickerLetters: [], icons: [], assembly: [] };
  }

  const ids = orderRows.map((o) => o.id);
  const clientNameById = new Map(orderRows.map((o) => [o.id, o.shippingName]));

  // 2) All items for those orders.
  const itemRows = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, ids));

  // 3) Parse keychain parts — skip non-keychain lines.
  const matched: { it: (typeof itemRows)[number]; parts: KeychainParts }[] = [];
  for (const it of itemRows) {
    const parts = parseKeychainParts(it.configurationData);
    if (!parts) continue; // not a keychain line — skip
    matched.push({ it, parts });
  }

  // 3a) Resolve base SHAPE per product — one extra MariaDB-safe query
  // (manual select + inArray, no LATERAL). Guard the empty-array case to
  // avoid an `IN ()` query.
  const productIds = [
    ...new Set(matched.map((m) => m.it.productId).filter((id) => id !== "manual")),
  ];
  const shapeByProductId = new Map<string, "square" | "round">();
  if (productIds.length > 0) {
    const shapeRows = await db
      .select({ id: products.id, keychainShape: products.keychainShape })
      .from(products)
      .where(inArray(products.id, productIds));
    for (const r of shapeRows) shapeByProductId.set(r.id, r.keychainShape);
  }

  // 3b) Resolve the keycapseq field id per product — the position-0 mixed
  // sequence field seeded on SQUARE keychains (25-03). We read the structured
  // letter/icon sequence from configurationData.values[seqFieldId] so icons
  // batch by id and letters count correctly (Pitfall 1). Manual select +
  // inArray hydration (MariaDB 10.11 — no LATERAL). Absent for round/legacy
  // products, which then fall through to the legacy parseKeychainParts count.
  const seqFieldByProductId = new Map<string, string>();
  if (productIds.length > 0) {
    const fieldRows = await db
      .select({
        id: productConfigFields.id,
        productId: productConfigFields.productId,
      })
      .from(productConfigFields)
      .where(
        and(
          inArray(productConfigFields.productId, productIds),
          eq(productConfigFields.fieldType, "keycapseq"),
        ),
      );
    for (const r of fieldRows) seqFieldByProductId.set(r.productId, r.id);
  }

  // Split each order line into its `quantity` physical keychains — one item-wise
  // unit (quantity 1) per keychain — so the floor sees a qty-2 line as two rows
  // of its per-name letter count, never a single flattened "letters × qty" total.
  // Every split unit keeps the same order_item id, so marking a part printed (or
  // assembled) still toggles the whole line's copies together.
  const units: KeychainUnit[] = matched.flatMap(({ it, parts }) => {
    const shape: "square" | "round" =
      it.productId === "manual" ? "square" : (shapeByProductId.get(it.productId) ?? "square");

    // Structured-first read of the mixed letter/icon sequence. When a keycapseq
    // field exists AND the line carries a sequence, use it; otherwise fall
    // through to the legacy letter count (round + historical letter-only orders).
    const seqFieldId =
      it.productId === "manual" ? undefined : seqFieldByProductId.get(it.productId);
    const seqParts = seqFieldId
      ? parseKeycapSequence(it.configurationData, seqFieldId)
      : null;
    // Pitfall 1: the count feeding the BASE + CLICKER+LETTER batches is the
    // LETTER-slot count — never total slots, never name.length. Icons are
    // excluded here; they print in the icon batch.
    const letterCount = seqParts?.letterCount ?? parts.letters;
    const slots: KeycapSlot[] = seqParts?.slots ?? [];
    const iconCount = seqParts?.iconCount ?? 0;

    const copies = Math.max(1, it.quantity);
    return Array.from({ length: copies }, (_, unitIndex) => ({
      itemId: it.id,
      orderId: it.orderId,
      invoiceNumber: formatOrderNumber(it.orderId),
      clientName: clientNameById.get(it.orderId) ?? "",
      name: parts.name,
      letters: letterCount,
      base: parts.base,
      clicker: parts.clicker,
      letter: parts.letter,
      quantity: 1,
      baseDone: it.baseDone,
      clickerLetterDone: it.clickerLetterDone,
      iconDone: it.iconDone,
      productionDone: it.productionDone,
      shape,
      slots,
      iconCount,
      unitIndex,
    }));
  });

  // 4) Group BASES — by shape + base colour composite key. Round and square
  // bodies of the SAME colour are physically different STLs and cannot be
  // printed together, so shape is folded into the grouping key.
  const baseMap = new Map<string, KeychainUnit[]>();
  for (const u of units) {
    const key = `${u.shape}|||${u.base}`;
    const list = baseMap.get(key) ?? [];
    list.push(u);
    baseMap.set(key, list);
  }
  const bases: KeychainBaseBatch[] = Array.from(baseMap.entries())
    .map(([key, items]) => {
      const [shape, base] = key.split("|||") as ["square" | "round", string];
      const totalQty = items.reduce((s, u) => s + u.quantity, 0);
      const doneCount = items.filter((u) => u.baseDone).length;
      return { base, shape, totalQty, items, doneCount, allDone: doneCount === items.length };
    })
    .sort((a, b) => b.totalQty - a.totalQty);

  // 5) Group CLICKER+LETTER — by shape + clicker + letter composite key.
  // Round and square clicker/letter pieces of the SAME colours are physically
  // different STLs and cannot be printed together, so shape is folded into
  // the grouping key (mirrors the BASE grouping above).
  const clMap = new Map<string, KeychainUnit[]>();
  for (const u of units) {
    const key = `${u.shape}|||${u.clicker}|||${u.letter}`;
    const list = clMap.get(key) ?? [];
    list.push(u);
    clMap.set(key, list);
  }
  const clickerLetters: KeychainClickerLetterBatch[] = Array.from(clMap.entries())
    .map(([key, items]) => {
      const [shape, clicker, letter] = key.split("|||") as ["square" | "round", string, string];
      const totalQty = items.reduce((s, u) => s + u.quantity, 0);
      const doneCount = items.filter((u) => u.clickerLetterDone).length;
      return {
        clicker,
        letter,
        totalQty,
        items,
        doneCount,
        allDone: doneCount === items.length,
        shape,
      };
    })
    .sort((a, b) => b.totalQty - a.totalQty);

  // 5b) Group ICONS — by icon id ONLY (D-11). Icon keycaps print as a fixed
  // white shell + baked accent parts (colours fixed per icon), so they do NOT
  // share the letter colour grouping; and icons are square-only (D-01), so no
  // shape is folded into the key. A unit is pushed at most once per distinct
  // icon id (so doneCount/allDone track units, not slot instances); the
  // per-icon slot instances are counted separately into totalQty.
  const iconMap = new Map<string, KeychainUnit[]>();
  for (const u of units) {
    const seen = new Set<string>();
    for (const s of u.slots) {
      if (s.t !== "I") continue;
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const list = iconMap.get(s.id) ?? [];
      list.push(u);
      iconMap.set(s.id, list);
    }
  }
  const icons: KeychainIconBatch[] = Array.from(iconMap.entries())
    .map(([iconId, items]) => {
      const iconLabel = KEYCAP_ICON_BY_ID[iconId]?.label ?? iconId;
      const totalQty = items.reduce((sum, u) => {
        const n = u.slots.filter((s) => s.t === "I" && s.id === iconId).length;
        return sum + n * u.quantity;
      }, 0);
      const doneCount = items.filter((u) => u.iconDone).length;
      return {
        iconId,
        iconLabel,
        totalQty,
        items,
        doneCount,
        allDone: doneCount === items.length,
      };
    })
    .sort((a, b) => a.iconLabel.localeCompare(b.iconLabel));

  // 6) Assembly — flat list sorted shape-first (so same-shape units stay
  // contiguous), then clientName, then name. For a single-shape store every
  // unit shares one shape, so this falls through to the original ordering.
  // Readiness (bothPartsDone) also requires iconDone for units that carry
  // icons; a unit with iconCount === 0 is unaffected (letter-only behaviour).
  const assembly: KeychainAssemblyUnit[] = units
    .map((u) => ({
      ...u,
      bothPartsDone:
        u.baseDone && u.clickerLetterDone && (u.iconCount === 0 || u.iconDone),
    }))
    .sort((a, b) => {
      const sc = a.shape.localeCompare(b.shape);
      if (sc !== 0) return sc;
      const nc = a.clientName.localeCompare(b.clientName);
      if (nc !== 0) return nc;
      return a.name.localeCompare(b.name);
    });

  return { bases, clickerLetters, icons, assembly };
}

/** UUID-ish pattern used to validate itemIds from the client. */
const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Mark a batch of keychain item IDs as having their base OR clicker+letter
 * part printed (or unprinted when done=false).
 *
 * Validates, dedupes, and caps the list at 500 items. Admin-only.
 */
export async function markKeychainPartPrinted(
  itemIds: string[],
  part: "base" | "clickerLetter",
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  if (!Array.isArray(itemIds)) {
    return { ok: false, error: "itemIds must be an array." };
  }
  const safe = [...new Set(itemIds.filter((id) => UUID_RE.test(id)))].slice(0, 500);
  if (safe.length === 0) {
    return { ok: false, error: "No valid item IDs provided." };
  }

  try {
    if (part === "base") {
      await db
        .update(orderItems)
        .set({ baseDone: done })
        .where(inArray(orderItems.id, safe));
    } else {
      await db
        .update(orderItems)
        .set({ clickerLetterDone: done })
        .where(inArray(orderItems.id, safe));
    }
    revalidatePath("/admin/production");
    return { ok: true };
  } catch (err) {
    console.error("[production] markKeychainPartPrinted failed", err);
    return { ok: false, error: "Could not update the items." };
  }
}

/**
 * Mark a batch of keychain item IDs as having their ICON parts printed (or
 * unprinted when done=false). Icon keycaps print as a fixed white shell + baked
 * accent parts, grouped by icon id (D-11) — a single per-item `iconDone` flag
 * covers every icon slot in the item.
 *
 * Copied in shape from markKeychainPartPrinted: validates, dedupes, and caps
 * the list at 500 items. Admin-only (requireAdmin FIRST — CVE-2025-29927).
 */
export async function markKeychainIconPrinted(
  itemIds: string[],
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  if (!Array.isArray(itemIds)) {
    return { ok: false, error: "itemIds must be an array." };
  }
  const safe = [...new Set(itemIds.filter((id) => UUID_RE.test(id)))].slice(0, 500);
  if (safe.length === 0) {
    return { ok: false, error: "No valid item IDs provided." };
  }

  try {
    await db
      .update(orderItems)
      .set({ iconDone: done })
      .where(inArray(orderItems.id, safe));
    revalidatePath("/admin/production");
    return { ok: true };
  } catch (err) {
    console.error("[production] markKeychainIconPrinted failed", err);
    return { ok: false, error: "Could not update the items." };
  }
}

/**
 * Mark a single keychain item as assembled (productionDone = done).
 *
 * When done=true, the item must have both baseDone AND clickerLetterDone set —
 * otherwise the admin is trying to assemble before both parts are printed.
 * When done=false (undo), no guard is applied.
 */
export async function setKeychainAssembled(
  itemId: string,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();

  if (typeof itemId !== "string" || !UUID_RE.test(itemId)) {
    return { ok: false, error: "Invalid item ID." };
  }

  if (done) {
    // Read current state — guard: letter parts (base + clicker+letter) must be
    // printed, AND — for a mixed unit that carries icons — the icon parts too.
    const [row] = await db
      .select({
        baseDone: orderItems.baseDone,
        clickerLetterDone: orderItems.clickerLetterDone,
        iconDone: orderItems.iconDone,
        productId: orderItems.productId,
        configurationData: orderItems.configurationData,
      })
      .from(orderItems)
      .where(eq(orderItems.id, itemId))
      .limit(1);

    if (!row) return { ok: false, error: "Item not found." };
    if (!row.baseDone || !row.clickerLetterDone) {
      return { ok: false, error: "Print both parts first." };
    }

    // Derive icon count from the structured sequence (D-11). A unit with no
    // icons is unaffected; a mixed unit needs its icon parts printed too.
    // Manual select + limit (MariaDB 10.11 — no LATERAL).
    if (row.productId && row.productId !== "manual") {
      const [seqField] = await db
        .select({ id: productConfigFields.id })
        .from(productConfigFields)
        .where(
          and(
            eq(productConfigFields.productId, row.productId),
            eq(productConfigFields.fieldType, "keycapseq"),
          ),
        )
        .limit(1);
      if (seqField) {
        const seqParts = parseKeycapSequence(row.configurationData, seqField.id);
        if ((seqParts?.iconCount ?? 0) > 0 && !row.iconDone) {
          return { ok: false, error: "Print the icon parts first." };
        }
      }
    }
  }

  try {
    await db
      .update(orderItems)
      .set({ productionDone: done })
      .where(eq(orderItems.id, itemId));
    revalidatePath("/admin/production");
    return { ok: true };
  } catch (err) {
    console.error("[production] setKeychainAssembled failed", itemId, err);
    return { ok: false, error: "Could not update the item." };
  }
}
