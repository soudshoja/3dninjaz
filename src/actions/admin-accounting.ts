"use server";

// ============================================================================
// Admin accounting actions: CRUD for expenses / assets (+ asset payments) /
// transfers (payouts table).
//
// requireAdmin() is the FIRST await in EVERY export (CVE-2025-29927: middleware
// alone is bypassable). All form input flows through zod (validators.ts). This
// file is "use server" so it exports ONLY async functions; row types and the
// MutateResult shape live in @/lib/accounting-types and
// @/lib/accounting-entry-types.
// ============================================================================

import { db } from "@/lib/db";
import { expenses, assets, assetPayments, payouts } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, like, lt, or, sql, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  expenseSchema,
  assetSchema,
  assetPaymentSchema,
  payoutSchema,
  type ExpenseInput,
} from "@/lib/validators";
import { toNum } from "@/lib/profit";
import { nextDayYmd } from "@/lib/accounting-entry-range";
import { round2 } from "@/lib/accounting-format";
import type {
  MutateResult,
  ExpenseRow,
  AssetRow,
  AssetPaymentRow,
  PayoutRow,
  BankMatch,
} from "@/lib/accounting-types";
import type {
  AssetWithPayments,
  ExpenseFacets,
  ExpenseFilters,
} from "@/lib/accounting-entry-types";
import { knownVendorLabels } from "@/lib/invoice-parser";

const OVERVIEW = "/admin/accounting";

/** form value -> trimmed string or null. */
function s(fd: FormData, k: string): string | null {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
}
function req(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}
function checked(fd: FormData, k: string): boolean {
  const v = fd.get(k);
  return v === "on" || v === "true" || v === "1";
}

function revalidateAll() {
  for (const p of ["", "/expenses", "/assets", "/payouts", "/income", "/paypal", "/summary"]) {
    revalidatePath(`${OVERVIEW}${p}`);
  }
}

/** Known vendor labels (registry) plus distinct supplier names already used. */
export async function listKnownVendors(): Promise<string[]> {
  await requireAdmin();
  const rows = await db
    .selectDistinct({ name: expenses.supplierName })
    .from(expenses);
  const used = rows.map((r) => r.name).filter((n): n is string => !!n && n.trim() !== "");
  const set = new Set<string>([...knownVendorLabels(), ...used]);
  return [...set].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

type ExpenseDb = typeof expenses.$inferSelect;

function toExpenseRow(r: ExpenseDb): ExpenseRow {
  return {
    id: r.id,
    expenseDate: r.expenseDate,
    category: r.category,
    note: r.note ?? null,
    amount: r.amount,
    paidFrom: r.paidFrom,
    supplierName: r.supplierName ?? null,
    sourceDocUrl: r.sourceDocUrl ?? null,
    subcategory: r.subcategory ?? null,
    viaPaypal: Number(r.viaPaypal) === 1,
    currency: r.currency,
    amountOriginal: r.amountOriginal ?? null,
    fxRate: r.fxRate ?? null,
    projectTag: r.projectTag ?? null,
    bankMatch: r.bankMatch as BankMatch,
    bankAmount: r.bankAmount ?? null,
    externalRef: r.externalRef ?? null,
    dateIsEstimate: Number(r.dateIsEstimate) === 1,
  };
}

export async function listExpenses(filters: ExpenseFilters = {}): Promise<ExpenseRow[]> {
  await requireAdmin();
  const conds: SQL[] = [];
  if (filters.from) conds.push(gte(expenses.expenseDate, filters.from));
  if (filters.to) conds.push(lt(expenses.expenseDate, nextDayYmd(filters.to)));
  if (filters.category) conds.push(eq(expenses.category, filters.category as ExpenseDb["category"]));
  if (filters.paidFrom) conds.push(eq(expenses.paidFrom, filters.paidFrom as ExpenseDb["paidFrom"]));
  if (filters.bankMatch) conds.push(eq(expenses.bankMatch, filters.bankMatch as BankMatch));
  if (filters.projectTag) conds.push(eq(expenses.projectTag, filters.projectTag));
  const q = filters.q?.trim();
  if (q) {
    const pat = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const textMatch = or(
      like(expenses.supplierName, pat),
      like(expenses.note, pat),
      like(expenses.subcategory, pat),
      like(expenses.externalRef, pat),
    );
    if (textMatch) conds.push(textMatch);
  }
  const rows = await db
    .select()
    .from(expenses)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
  return rows.map(toExpenseRow);
}

/** Distinct vendors, subcategories and project tags for form suggestions + filters. */
export async function getExpenseFacets(): Promise<ExpenseFacets> {
  await requireAdmin();
  const [v, sc, pt] = await Promise.all([
    db.selectDistinct({ x: expenses.supplierName }).from(expenses),
    db.selectDistinct({ x: expenses.subcategory }).from(expenses),
    db.selectDistinct({ x: expenses.projectTag }).from(expenses),
  ]);
  const clean = (rows: { x: string | null }[], extra: string[] = []) =>
    [...new Set([...rows.map((r) => r.x ?? "").filter((x) => x.trim() !== ""), ...extra])].sort(
      (a, b) => a.localeCompare(b),
    );
  return {
    vendors: clean(v, knownVendorLabels()),
    subcategories: clean(sc),
    projectTags: clean(pt),
  };
}

export async function getExpenseById(id: string): Promise<ExpenseRow | null> {
  await requireAdmin();
  const [r] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  return r ? toExpenseRow(r) : null;
}

function parseExpenseForm(fd: FormData) {
  const currency = (s(fd, "currency") ?? "MYR").toUpperCase();
  const isMyr = currency === "MYR";
  return expenseSchema.safeParse({
    expenseDate: req(fd, "expenseDate"),
    category: fd.get("category"),
    subcategory: s(fd, "subcategory"),
    note: s(fd, "note"),
    amount: req(fd, "amount"),
    paidFrom: fd.get("paidFrom") ?? "bank",
    viaPaypal: checked(fd, "viaPaypal"),
    supplierName: s(fd, "supplierName"),
    sourceDocUrl: s(fd, "sourceDocUrl"),
    currency,
    amountOriginal: isMyr ? null : s(fd, "amountOriginal"),
    fxRate: isMyr ? null : s(fd, "fxRate"),
    projectTag: s(fd, "projectTag"),
    bankMatch: fd.get("bankMatch") ?? "unchecked",
    bankAmount: s(fd, "bankAmount"),
    externalRef: s(fd, "externalRef"),
    dateIsEstimate: checked(fd, "dateIsEstimate"),
  });
}

type ExpenseInputData = ExpenseInput;

function expenseValues(d: ExpenseInputData) {
  return {
    expenseDate: d.expenseDate,
    category: d.category,
    subcategory: d.subcategory ?? null,
    note: d.note ?? null,
    amount: d.amount,
    paidFrom: d.paidFrom,
    viaPaypal: d.viaPaypal ? 1 : 0,
    supplierName: d.supplierName ?? null,
    sourceDocUrl: d.sourceDocUrl ?? null,
    currency: d.currency,
    amountOriginal: d.amountOriginal ?? null,
    fxRate: d.fxRate ?? null,
    projectTag: d.projectTag ?? null,
    bankMatch: d.bankMatch,
    bankAmount: d.bankAmount ?? null,
    externalRef: d.externalRef ?? null,
    dateIsEstimate: d.dateIsEstimate ? 1 : 0,
  };
}

function expenseRuleError(d: ExpenseInputData): string | null {
  if (d.viaPaypal && d.paidFrom === "paypal") {
    return "A card charge made through PayPal is paid from the card, not from PayPal. Choose Credit card or Bank, or untick the PayPal box.";
  }
  return null;
}

export async function createExpense(fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseExpenseForm(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const ruleErr = expenseRuleError(parsed.data);
  if (ruleErr) return { ok: false, error: ruleErr };
  const id = randomUUID();
  try {
    await db.insert(expenses).values({ id, ...expenseValues(parsed.data) });
  } catch (e) {
    console.error("[admin-accounting] createExpense", e);
    return { ok: false, error: "Unable to create expense" };
  }
  revalidateAll();
  return { ok: true, id };
}

export async function updateExpense(id: string, fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseExpenseForm(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const ruleErr = expenseRuleError(parsed.data);
  if (ruleErr) return { ok: false, error: ruleErr };
  try {
    await db.update(expenses).set(expenseValues(parsed.data)).where(eq(expenses.id, id));
  } catch (e) {
    console.error("[admin-accounting] updateExpense", e);
    return { ok: false, error: "Unable to update expense" };
  }
  revalidateAll();
  return { ok: true, id };
}

export async function deleteExpense(id: string): Promise<MutateResult> {
  await requireAdmin();
  try {
    await db.delete(expenses).where(eq(expenses.id, id));
  } catch (e) {
    console.error("[admin-accounting] deleteExpense", e);
    return { ok: false, error: "Unable to delete expense" };
  }
  revalidateAll();
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// Assets and asset payments
// ---------------------------------------------------------------------------

type AssetDb = typeof assets.$inferSelect;
type AssetPaymentDb = typeof assetPayments.$inferSelect;

function toAssetRow(r: AssetDb): AssetRow {
  return {
    id: r.id,
    assetDate: r.assetDate,
    name: r.name,
    amount: r.amount,
    note: r.note ?? null,
    seller: r.seller ?? null,
    paidFrom: r.paidFrom,
    instalmentAmount: r.instalmentAmount ?? null,
    instalmentCount: r.instalmentCount ?? null,
  };
}

function toPaymentRow(p: AssetPaymentDb): AssetPaymentRow {
  return {
    id: p.id,
    assetId: p.assetId,
    paymentDate: p.paymentDate,
    amount: p.amount,
    paidFrom: p.paidFrom,
    instalmentNo: p.instalmentNo ?? null,
    bankMatch: p.bankMatch as BankMatch,
    note: p.note ?? null,
  };
}

/** Assets newest first, each with its payments and paid/remaining totals. */
export async function listAssets(): Promise<AssetWithPayments[]> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(assets)
    .orderBy(desc(assets.assetDate), desc(assets.createdAt));
  if (rows.length === 0) return [];
  // Manual hydration (MariaDB 10.11 has no LATERAL joins).
  const pays = await db
    .select()
    .from(assetPayments)
    .where(inArray(assetPayments.assetId, rows.map((r) => r.id)))
    .orderBy(assetPayments.paymentDate, assetPayments.createdAt);
  const byAsset = new Map<string, AssetPaymentRow[]>();
  for (const p of pays) {
    const list = byAsset.get(p.assetId) ?? [];
    list.push(toPaymentRow(p));
    byAsset.set(p.assetId, list);
  }
  return rows.map((r) => {
    const payments = byAsset.get(r.id) ?? [];
    const paidTotal = round2(payments.reduce((sum, p) => sum + toNum(p.amount), 0));
    return {
      ...toAssetRow(r),
      payments,
      paidTotal,
      remaining: round2(toNum(r.amount) - paidTotal),
      paymentCount: payments.length,
    };
  });
}

export async function getAssetById(id: string): Promise<AssetRow | null> {
  await requireAdmin();
  const [r] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return r ? toAssetRow(r) : null;
}

function parseAssetForm(fd: FormData) {
  return assetSchema.safeParse({
    assetDate: req(fd, "assetDate"),
    name: req(fd, "name"),
    amount: req(fd, "amount"),
    note: s(fd, "note"),
    seller: s(fd, "seller"),
    paidFrom: fd.get("paidFrom") ?? "bank",
    instalmentAmount: s(fd, "instalmentAmount"),
    instalmentCount: s(fd, "instalmentCount"),
  });
}

export async function createAsset(fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseAssetForm(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  if ((d.instalmentAmount && !d.instalmentCount) || (!d.instalmentAmount && d.instalmentCount)) {
    return { ok: false, error: "Enter both the instalment amount and the number of instalments, or neither." };
  }
  const paidInFull = checked(fd, "paidInFull");
  if (paidInFull && d.instalmentAmount) {
    return { ok: false, error: "An asset paid in full has no instalments. Untick one of them." };
  }
  const id = randomUUID();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(assets).values({
        id,
        assetDate: d.assetDate,
        name: d.name,
        amount: d.amount,
        note: d.note ?? null,
        seller: d.seller ?? null,
        paidFrom: d.paidFrom,
        instalmentAmount: d.instalmentAmount ?? null,
        instalmentCount: d.instalmentCount ?? null,
      });
      // An outright purchase also needs its payment row, otherwise no balance
      // would ever reflect the money that left.
      if (paidInFull) {
        await tx.insert(assetPayments).values({
          id: randomUUID(),
          assetId: id,
          paymentDate: d.assetDate,
          amount: d.amount,
          paidFrom: d.paidFrom,
          instalmentNo: null,
          bankMatch: "unchecked",
          note: null,
        });
      }
    });
  } catch (e) {
    console.error("[admin-accounting] createAsset", e);
    return { ok: false, error: "Unable to create asset" };
  }
  revalidateAll();
  return { ok: true, id };
}

export async function updateAsset(id: string, fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseAssetForm(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  if ((d.instalmentAmount && !d.instalmentCount) || (!d.instalmentAmount && d.instalmentCount)) {
    return { ok: false, error: "Enter both the instalment amount and the number of instalments, or neither." };
  }
  let blocked: string | null = null;
  try {
    await db.transaction(async (tx) => {
      // Lock the asset row so a payment cannot slip in between the check and the update.
      const [a] = await tx.select().from(assets).where(eq(assets.id, id)).limit(1).for("update");
      if (!a) {
        blocked = "Asset not found";
        return;
      }
      const [agg] = await tx
        .select({
          total: sql<string>`COALESCE(SUM(${assetPayments.amount}), 0)`,
          n: sql<string>`COUNT(*)`,
          maxNo: sql<string>`COALESCE(MAX(${assetPayments.instalmentNo}), 0)`,
        })
        .from(assetPayments)
        .where(eq(assetPayments.assetId, id));
      const paid = round2(toNum(agg?.total));
      const made = Number(agg?.n ?? 0);
      const maxNo = Number(agg?.maxNo ?? 0);
      if (round2(toNum(d.amount)) < paid - 0.004) {
        blocked = `The total cost cannot be lower than the RM ${paid.toFixed(2)} already paid.`;
        return;
      }
      if (d.instalmentCount != null && d.instalmentCount < made) {
        blocked = `The number of instalments cannot be lower than the ${made} payments already recorded.`;
        return;
      }
      if (d.instalmentCount != null && d.instalmentCount < maxNo) {
        blocked = `A recorded payment is already instalment ${maxNo}, so the number of instalments cannot be lower than that.`;
        return;
      }
      await tx
        .update(assets)
        .set({
          assetDate: d.assetDate,
          name: d.name,
          amount: d.amount,
          note: d.note ?? null,
          seller: d.seller ?? null,
          paidFrom: d.paidFrom,
          instalmentAmount: d.instalmentAmount ?? null,
          instalmentCount: d.instalmentCount ?? null,
        })
        .where(eq(assets.id, id));
    });
  } catch (e) {
    console.error("[admin-accounting] updateAsset", e);
    return { ok: false, error: "Unable to update asset" };
  }
  if (blocked) return { ok: false, error: blocked };
  revalidateAll();
  return { ok: true, id };
}

export async function deleteAsset(id: string): Promise<MutateResult> {
  await requireAdmin();
  try {
    // asset_payments rows go with it (ON DELETE CASCADE).
    await db.delete(assets).where(eq(assets.id, id));
  } catch (e) {
    console.error("[admin-accounting] deleteAsset", e);
    return { ok: false, error: "Unable to delete asset" };
  }
  revalidateAll();
  return { ok: true, id };
}

function parsePaymentForm(fd: FormData) {
  return assetPaymentSchema.safeParse({
    assetId: req(fd, "assetId"),
    paymentDate: req(fd, "paymentDate"),
    amount: req(fd, "amount"),
    paidFrom: fd.get("paidFrom") ?? "bank",
    instalmentNo: s(fd, "instalmentNo"),
    bankMatch: fd.get("bankMatch") ?? "unchecked",
    note: s(fd, "note"),
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Checks a payment against its asset. MUST run inside the same transaction as
 * the write: it locks the asset row (SELECT ... FOR UPDATE) so two payments
 * cannot both pass the check. Returns an error message, or null when fine.
 */
async function checkAssetPayment(
  tx: Tx,
  assetId: string,
  amount: string,
  instalmentNo: number | null | undefined,
  excludePaymentId?: string,
): Promise<string | null> {
  const [a] = await tx.select().from(assets).where(eq(assets.id, assetId)).limit(1).for("update");
  if (!a) return "Asset not found";
  const conds: SQL[] = [eq(assetPayments.assetId, assetId)];
  if (excludePaymentId) conds.push(sql`${assetPayments.id} <> ${excludePaymentId}`);
  const others = await tx
    .select({ amount: assetPayments.amount, instalmentNo: assetPayments.instalmentNo })
    .from(assetPayments)
    .where(and(...conds));
  const paid = others.reduce((sum, p) => sum + toNum(p.amount), 0);
  const left = round2(toNum(a.amount) - paid);
  if (round2(toNum(amount)) > left + 0.004) {
    return `That is more than the RM ${left.toFixed(2)} still owed on ${a.name}.`;
  }
  const count = a.instalmentCount;
  if (count != null) {
    if (others.length + 1 > count) {
      return `${a.name} has ${count} instalments and all ${count} are already recorded.`;
    }
    if (instalmentNo != null && instalmentNo > count) {
      return `Instalment ${instalmentNo} is past the ${count} instalments planned for ${a.name}.`;
    }
  }
  if (instalmentNo != null && others.some((p) => p.instalmentNo === instalmentNo)) {
    return `Instalment ${instalmentNo} is already recorded for ${a.name}.`;
  }
  return null;
}

export async function createAssetPayment(fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parsePaymentForm(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const id = randomUUID();
  let blocked: string | null = null;
  try {
    await db.transaction(async (tx) => {
      blocked = await checkAssetPayment(tx, d.assetId, d.amount, d.instalmentNo);
      if (blocked) return;
      await tx.insert(assetPayments).values({
        id,
        assetId: d.assetId,
        paymentDate: d.paymentDate,
        amount: d.amount,
        paidFrom: d.paidFrom,
        instalmentNo: d.instalmentNo ?? null,
        bankMatch: d.bankMatch,
        note: d.note ?? null,
      });
    });
  } catch (e) {
    console.error("[admin-accounting] createAssetPayment", e);
    return { ok: false, error: "Unable to record payment" };
  }
  if (blocked) return { ok: false, error: blocked };
  revalidateAll();
  return { ok: true, id };
}

export async function updateAssetPayment(id: string, fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parsePaymentForm(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  let blocked: string | null = null;
  try {
    await db.transaction(async (tx) => {
      blocked = await checkAssetPayment(tx, d.assetId, d.amount, d.instalmentNo, id);
      if (blocked) return;
      await tx
        .update(assetPayments)
        .set({
          paymentDate: d.paymentDate,
          amount: d.amount,
          paidFrom: d.paidFrom,
          instalmentNo: d.instalmentNo ?? null,
          bankMatch: d.bankMatch,
          note: d.note ?? null,
        })
        .where(and(eq(assetPayments.id, id), eq(assetPayments.assetId, d.assetId)));
    });
  } catch (e) {
    console.error("[admin-accounting] updateAssetPayment", e);
    return { ok: false, error: "Unable to update payment" };
  }
  if (blocked) return { ok: false, error: blocked };
  revalidateAll();
  return { ok: true, id };
}

export async function deleteAssetPayment(id: string): Promise<MutateResult> {
  await requireAdmin();
  try {
    await db.delete(assetPayments).where(eq(assetPayments.id, id));
  } catch (e) {
    console.error("[admin-accounting] deleteAssetPayment", e);
    return { ok: false, error: "Unable to delete payment" };
  }
  revalidateAll();
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// Transfers (the payouts table: money moved between two of our accounts)
// ---------------------------------------------------------------------------

type PayoutDb = typeof payouts.$inferSelect;

function toPayoutRow(r: PayoutDb): PayoutRow {
  return {
    id: r.id,
    payoutDate: r.payoutDate,
    amount: r.amount,
    paidInto: r.paidInto,
    fromAccount: r.fromAccount,
    note: r.note ?? null,
  };
}

export async function listPayouts(): Promise<PayoutRow[]> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(payouts)
    .orderBy(desc(payouts.payoutDate), desc(payouts.createdAt));
  return rows.map(toPayoutRow);
}

export async function getPayoutById(id: string): Promise<PayoutRow | null> {
  await requireAdmin();
  const [r] = await db.select().from(payouts).where(eq(payouts.id, id)).limit(1);
  return r ? toPayoutRow(r) : null;
}

function parseTransferForm(fd: FormData) {
  return payoutSchema.safeParse({
    payoutDate: req(fd, "payoutDate"),
    amount: req(fd, "amount"),
    fromAccount: fd.get("fromAccount") ?? "paypal",
    paidInto: fd.get("paidInto") ?? "bank",
    note: s(fd, "note"),
  });
}

export async function createPayout(fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseTransferForm(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const id = randomUUID();
  try {
    await db.insert(payouts).values({
      id,
      payoutDate: d.payoutDate,
      amount: d.amount,
      fromAccount: d.fromAccount,
      paidInto: d.paidInto,
      note: d.note ?? null,
    });
  } catch (e) {
    console.error("[admin-accounting] createPayout", e);
    return { ok: false, error: "Unable to create transfer" };
  }
  revalidateAll();
  return { ok: true, id };
}

export async function updatePayout(id: string, fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseTransferForm(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    await db
      .update(payouts)
      .set({
        payoutDate: d.payoutDate,
        amount: d.amount,
        fromAccount: d.fromAccount,
        paidInto: d.paidInto,
        note: d.note ?? null,
      })
      .where(eq(payouts.id, id));
  } catch (e) {
    console.error("[admin-accounting] updatePayout", e);
    return { ok: false, error: "Unable to update transfer" };
  }
  revalidateAll();
  return { ok: true, id };
}

export async function deletePayout(id: string): Promise<MutateResult> {
  await requireAdmin();
  try {
    await db.delete(payouts).where(eq(payouts.id, id));
  } catch (e) {
    console.error("[admin-accounting] deletePayout", e);
    return { ok: false, error: "Unable to delete transfer" };
  }
  revalidateAll();
  return { ok: true, id };
}
