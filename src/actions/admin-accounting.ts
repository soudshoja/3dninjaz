"use server";

// ============================================================================
// Admin accounting actions — CRUD for expenses / assets / payouts + read
// wrappers for the summary/report/balances engine.
//
// requireAdmin() is the FIRST await in EVERY export (CVE-2025-29927 — middleware
// alone is bypassable). All form input flows through zod (validators.ts). This
// file is "use server" so it exports ONLY async functions; row types + the
// MutateResult shape live in @/lib/accounting-types.
// ============================================================================

import { db } from "@/lib/db";
import { expenses, assets, payouts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import { expenseSchema, assetSchema, payoutSchema } from "@/lib/validators";
import {
  getAccountingSummary,
  getSalesReport,
  getAccountBalances,
} from "@/lib/accounting";
import type {
  DateRange,
  AccountingSummary,
  SalesReportRow,
  AccountBalances,
} from "@/lib/accounting";
import type {
  MutateResult,
  ExpenseRow,
  AssetRow,
  PayoutRow,
} from "@/lib/accounting-types";
import { knownVendorLabels } from "@/lib/invoice-parser";

const OVERVIEW = "/admin/accounting";

/** form value → trimmed string or null. */
function s(fd: FormData, k: string): string | null {
  const v = String(fd.get(k) ?? "").trim();
  return v === "" ? null : v;
}
function req(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

// ---------------------------------------------------------------------------
// Read wrappers (summary / report / balances)
// ---------------------------------------------------------------------------

export async function readAccountingSummary(range: DateRange): Promise<AccountingSummary> {
  await requireAdmin();
  return getAccountingSummary(range);
}

export async function readSalesReport(range: DateRange): Promise<SalesReportRow[]> {
  await requireAdmin();
  return getSalesReport(range);
}

export async function readAccountBalances(): Promise<AccountBalances> {
  await requireAdmin();
  return getAccountBalances();
}

/** Known vendor labels (registry) ∪ distinct supplier names already used. */
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

export async function listExpenses(): Promise<ExpenseRow[]> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(expenses)
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
  return rows.map((r) => ({
    id: r.id,
    expenseDate: r.expenseDate,
    category: r.category,
    note: r.note ?? null,
    amount: r.amount,
    paidFrom: r.paidFrom,
    supplierName: r.supplierName ?? null,
    sourceDocUrl: r.sourceDocUrl ?? null,
  }));
}

export async function getExpenseById(id: string): Promise<ExpenseRow | null> {
  await requireAdmin();
  const [r] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!r) return null;
  return {
    id: r.id,
    expenseDate: r.expenseDate,
    category: r.category,
    note: r.note ?? null,
    amount: r.amount,
    paidFrom: r.paidFrom,
    supplierName: r.supplierName ?? null,
    sourceDocUrl: r.sourceDocUrl ?? null,
  };
}

export async function createExpense(fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = expenseSchema.safeParse({
    expenseDate: req(fd, "expenseDate"),
    category: fd.get("category"),
    note: s(fd, "note"),
    amount: req(fd, "amount"),
    paidFrom: fd.get("paidFrom") ?? "bank",
    supplierName: s(fd, "supplierName"),
    sourceDocUrl: s(fd, "sourceDocUrl"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const id = randomUUID();
  try {
    await db.insert(expenses).values({
      id,
      expenseDate: d.expenseDate,
      category: d.category,
      note: d.note ?? null,
      amount: d.amount,
      paidFrom: d.paidFrom,
      supplierName: d.supplierName ?? null,
      sourceDocUrl: d.sourceDocUrl ?? null,
    });
  } catch (e) {
    console.error("[admin-accounting] createExpense", e);
    return { ok: false, error: "Unable to create expense" };
  }
  revalidatePath(`${OVERVIEW}/expenses`);
  revalidatePath(OVERVIEW);
  return { ok: true, id };
}

export async function updateExpense(id: string, fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = expenseSchema.safeParse({
    expenseDate: req(fd, "expenseDate"),
    category: fd.get("category"),
    note: s(fd, "note"),
    amount: req(fd, "amount"),
    paidFrom: fd.get("paidFrom") ?? "bank",
    supplierName: s(fd, "supplierName"),
    sourceDocUrl: s(fd, "sourceDocUrl"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    await db
      .update(expenses)
      .set({
        expenseDate: d.expenseDate,
        category: d.category,
        note: d.note ?? null,
        amount: d.amount,
        paidFrom: d.paidFrom,
        supplierName: d.supplierName ?? null,
        sourceDocUrl: d.sourceDocUrl ?? null,
      })
      .where(eq(expenses.id, id));
  } catch (e) {
    console.error("[admin-accounting] updateExpense", e);
    return { ok: false, error: "Unable to update expense" };
  }
  revalidatePath(`${OVERVIEW}/expenses`);
  revalidatePath(OVERVIEW);
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
  revalidatePath(`${OVERVIEW}/expenses`);
  revalidatePath(OVERVIEW);
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export async function listAssets(): Promise<AssetRow[]> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(assets)
    .orderBy(desc(assets.assetDate), desc(assets.createdAt));
  return rows.map((r) => ({
    id: r.id,
    assetDate: r.assetDate,
    name: r.name,
    amount: r.amount,
    note: r.note ?? null,
  }));
}

export async function getAssetById(id: string): Promise<AssetRow | null> {
  await requireAdmin();
  const [r] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!r) return null;
  return { id: r.id, assetDate: r.assetDate, name: r.name, amount: r.amount, note: r.note ?? null };
}

export async function createAsset(fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = assetSchema.safeParse({
    assetDate: req(fd, "assetDate"),
    name: req(fd, "name"),
    amount: req(fd, "amount"),
    note: s(fd, "note"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const id = randomUUID();
  try {
    await db.insert(assets).values({
      id,
      assetDate: d.assetDate,
      name: d.name,
      amount: d.amount,
      note: d.note ?? null,
    });
  } catch (e) {
    console.error("[admin-accounting] createAsset", e);
    return { ok: false, error: "Unable to create asset" };
  }
  revalidatePath(`${OVERVIEW}/assets`);
  revalidatePath(OVERVIEW);
  return { ok: true, id };
}

export async function updateAsset(id: string, fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = assetSchema.safeParse({
    assetDate: req(fd, "assetDate"),
    name: req(fd, "name"),
    amount: req(fd, "amount"),
    note: s(fd, "note"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    await db
      .update(assets)
      .set({ assetDate: d.assetDate, name: d.name, amount: d.amount, note: d.note ?? null })
      .where(eq(assets.id, id));
  } catch (e) {
    console.error("[admin-accounting] updateAsset", e);
    return { ok: false, error: "Unable to update asset" };
  }
  revalidatePath(`${OVERVIEW}/assets`);
  revalidatePath(OVERVIEW);
  return { ok: true, id };
}

export async function deleteAsset(id: string): Promise<MutateResult> {
  await requireAdmin();
  try {
    await db.delete(assets).where(eq(assets.id, id));
  } catch (e) {
    console.error("[admin-accounting] deleteAsset", e);
    return { ok: false, error: "Unable to delete asset" };
  }
  revalidatePath(`${OVERVIEW}/assets`);
  revalidatePath(OVERVIEW);
  return { ok: true, id };
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

export async function listPayouts(): Promise<PayoutRow[]> {
  await requireAdmin();
  const rows = await db
    .select()
    .from(payouts)
    .orderBy(desc(payouts.payoutDate), desc(payouts.createdAt));
  return rows.map((r) => ({
    id: r.id,
    payoutDate: r.payoutDate,
    amount: r.amount,
    paidInto: r.paidInto,
    note: r.note ?? null,
  }));
}

export async function getPayoutById(id: string): Promise<PayoutRow | null> {
  await requireAdmin();
  const [r] = await db.select().from(payouts).where(eq(payouts.id, id)).limit(1);
  if (!r) return null;
  return { id: r.id, payoutDate: r.payoutDate, amount: r.amount, paidInto: r.paidInto, note: r.note ?? null };
}

export async function createPayout(fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = payoutSchema.safeParse({
    payoutDate: req(fd, "payoutDate"),
    amount: req(fd, "amount"),
    paidInto: fd.get("paidInto") ?? "bank",
    note: s(fd, "note"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const id = randomUUID();
  try {
    await db.insert(payouts).values({
      id,
      payoutDate: d.payoutDate,
      amount: d.amount,
      paidInto: d.paidInto,
      note: d.note ?? null,
    });
  } catch (e) {
    console.error("[admin-accounting] createPayout", e);
    return { ok: false, error: "Unable to create payout" };
  }
  revalidatePath(`${OVERVIEW}/payouts`);
  revalidatePath(OVERVIEW);
  return { ok: true, id };
}

export async function updatePayout(id: string, fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = payoutSchema.safeParse({
    payoutDate: req(fd, "payoutDate"),
    amount: req(fd, "amount"),
    paidInto: fd.get("paidInto") ?? "bank",
    note: s(fd, "note"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    await db
      .update(payouts)
      .set({ payoutDate: d.payoutDate, amount: d.amount, paidInto: d.paidInto, note: d.note ?? null })
      .where(eq(payouts.id, id));
  } catch (e) {
    console.error("[admin-accounting] updatePayout", e);
    return { ok: false, error: "Unable to update payout" };
  }
  revalidatePath(`${OVERVIEW}/payouts`);
  revalidatePath(OVERVIEW);
  return { ok: true, id };
}

export async function deletePayout(id: string): Promise<MutateResult> {
  await requireAdmin();
  try {
    await db.delete(payouts).where(eq(payouts.id, id));
  } catch (e) {
    console.error("[admin-accounting] deletePayout", e);
    return { ok: false, error: "Unable to delete payout" };
  }
  revalidatePath(`${OVERVIEW}/payouts`);
  revalidatePath(OVERVIEW);
  return { ok: true, id };
}
