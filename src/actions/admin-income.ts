"use server";

// ============================================================================
// Income entries (non-website income): projects, events, other income, and
// capital in / out. Website sales are ALWAYS derived from orders, so a source
// named "Website" is rejected by incomeEntrySchema.
//
// requireAdmin() is the FIRST await in every export (CVE-2025-29927). This is a
// "use server" file: async functions only. Types live in accounting-types / accounting-entry-types.
// ============================================================================

import { db } from "@/lib/db";
import { incomeEntries } from "@/lib/db/schema";
import { and, desc, eq, gte, like, lt, or, type SQL } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-helpers";
import { incomeEntrySchema } from "@/lib/validators";
import { nextDayYmd, normalizeRange } from "@/lib/accounting-entry-range";
import type { IncomeFilters } from "@/lib/accounting-entry-types";
import type { IncomeEntryRow, MutateResult, BankMatch } from "@/lib/accounting-types";

const OVERVIEW = "/admin/accounting";

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
  for (const p of ["", "/income", "/paypal", "/summary"]) revalidatePath(`${OVERVIEW}${p}`);
}

type IncomeDb = typeof incomeEntries.$inferSelect;

function toRow(r: IncomeDb): IncomeEntryRow {
  return {
    id: r.id,
    entryDate: r.entryDate,
    dateIsEstimate: Number(r.dateIsEstimate) === 1,
    kind: r.kind,
    sourceName: r.sourceName,
    amount: r.amount,
    account: r.account,
    projectTag: r.projectTag ?? null,
    bankMatch: r.bankMatch as BankMatch,
    note: r.note ?? null,
  };
}

export async function listIncomeEntries(filters: IncomeFilters = {}): Promise<IncomeEntryRow[]> {
  await requireAdmin();
  const conds: SQL[] = [];
  const range = normalizeRange(filters);
  if (range.from) conds.push(gte(incomeEntries.entryDate, range.from));
  if (range.to) conds.push(lt(incomeEntries.entryDate, nextDayYmd(range.to)));
  if (filters.kind) conds.push(eq(incomeEntries.kind, filters.kind as IncomeDb["kind"]));
  if (filters.account) conds.push(eq(incomeEntries.account, filters.account as IncomeDb["account"]));
  const q = filters.q?.trim();
  if (q) {
    const pat = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const m = or(
      like(incomeEntries.sourceName, pat),
      like(incomeEntries.note, pat),
      like(incomeEntries.projectTag, pat),
    );
    if (m) conds.push(m);
  }
  const rows = await db
    .select()
    .from(incomeEntries)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(incomeEntries.entryDate), desc(incomeEntries.createdAt));
  return rows.map(toRow);
}

export async function getIncomeEntryById(id: string): Promise<IncomeEntryRow | null> {
  await requireAdmin();
  const [r] = await db.select().from(incomeEntries).where(eq(incomeEntries.id, id)).limit(1);
  return r ? toRow(r) : null;
}

/** Distinct project tags used on income, for the form suggestions. */
export async function listIncomeProjectTags(): Promise<string[]> {
  await requireAdmin();
  const rows = await db.selectDistinct({ x: incomeEntries.projectTag }).from(incomeEntries);
  return rows
    .map((r) => r.x ?? "")
    .filter((x) => x.trim() !== "")
    .sort((a, b) => a.localeCompare(b));
}

function parseForm(fd: FormData) {
  return incomeEntrySchema.safeParse({
    entryDate: req(fd, "entryDate"),
    dateIsEstimate: checked(fd, "dateIsEstimate"),
    kind: fd.get("kind"),
    sourceName: req(fd, "sourceName"),
    amount: req(fd, "amount"),
    account: fd.get("account") ?? "bank",
    projectTag: s(fd, "projectTag"),
    bankMatch: fd.get("bankMatch") ?? "unchecked",
    note: s(fd, "note"),
  });
}

export async function createIncomeEntry(fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseForm(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const id = randomUUID();
  try {
    await db.insert(incomeEntries).values({
      id,
      entryDate: d.entryDate,
      dateIsEstimate: d.dateIsEstimate ? 1 : 0,
      kind: d.kind,
      sourceName: d.sourceName,
      amount: d.amount,
      account: d.account,
      projectTag: d.projectTag ?? null,
      bankMatch: d.bankMatch,
      note: d.note ?? null,
    });
  } catch (e) {
    console.error("[admin-income] createIncomeEntry", e);
    return { ok: false, error: "Unable to save income" };
  }
  revalidateAll();
  return { ok: true, id };
}

export async function updateIncomeEntry(id: string, fd: FormData): Promise<MutateResult> {
  await requireAdmin();
  const parsed = parseForm(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  try {
    await db
      .update(incomeEntries)
      .set({
        entryDate: d.entryDate,
        dateIsEstimate: d.dateIsEstimate ? 1 : 0,
        kind: d.kind,
        sourceName: d.sourceName,
        amount: d.amount,
        account: d.account,
        projectTag: d.projectTag ?? null,
        bankMatch: d.bankMatch,
        note: d.note ?? null,
      })
      .where(eq(incomeEntries.id, id));
  } catch (e) {
    console.error("[admin-income] updateIncomeEntry", e);
    return { ok: false, error: "Unable to update income" };
  }
  revalidateAll();
  return { ok: true, id };
}

export async function deleteIncomeEntry(id: string): Promise<MutateResult> {
  await requireAdmin();
  try {
    await db.delete(incomeEntries).where(eq(incomeEntries.id, id));
  } catch (e) {
    console.error("[admin-income] deleteIncomeEntry", e);
    return { ok: false, error: "Unable to delete income" };
  }
  revalidateAll();
  return { ok: true, id };
}
