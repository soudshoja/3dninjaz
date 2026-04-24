import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { shippingConfig } from "@/lib/db/schema";

// ============================================================================
// Phase 9 (09-01) — internal shipping-config accessor.
//
// This file is NOT a server-action module ("use server" absent) so callers
// can export sync/async helpers without Next.js treating every export as an
// RPC endpoint. Server-actions in src/actions/shipping.ts import from here.
// ============================================================================

export const SHIPPING_CONFIG_ID = "default";

/**
 * Delyva itemType coercion. PACKAGE routes to Grab-only (returns 0 standard
 * couriers) so we force PARCEL whenever the stored config value is PACKAGE.
 * BULKY / DOCUMENT / PARCEL pass through unchanged. Centralised so every
 * Delyva call-site uses the same rule (CLAUDE.md "Delyva itemType shipping
 * type distinction").
 */
export function resolveItemType(
  configValue: string,
): "PARCEL" | "PACKAGE" | "BULKY" {
  if (configValue === "PACKAGE") return "PARCEL";
  if (configValue === "BULKY") return "BULKY";
  return "PARCEL";
}

export type ShippingConfigRow = {
  id: string;
  originAddress1: string;
  originAddress2: string | null;
  originCity: string;
  originState: string;
  originPostcode: string;
  originCountry: string;
  originContactName: string;
  originContactEmail: string;
  originContactPhone: string;
  defaultItemType: "PARCEL" | "PACKAGE" | "BULKY";
  defaultWeightKg: string;
  markupPercent: string;
  markupFlat: string;
  freeShippingThreshold: string | null;
  enabledServices: string[];
  updatedAt: Date;
};

export function parseEnabledServices(
  raw: string | null | undefined,
): string[] {
  // MariaDB JSON quirk — longtext comes back as a string. Be tolerant of
  // legacy shapes: either a JSON array or a CSV.
  if (!raw) return [];
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  } catch {
    // fallthrough to CSV parse
  }
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function rowToShippingConfig(
  r: typeof shippingConfig.$inferSelect,
): ShippingConfigRow {
  return {
    id: r.id,
    originAddress1: r.originAddress1,
    originAddress2: r.originAddress2 ?? null,
    originCity: r.originCity,
    originState: r.originState,
    originPostcode: r.originPostcode,
    originCountry: r.originCountry,
    originContactName: r.originContactName,
    originContactEmail: r.originContactEmail,
    originContactPhone: r.originContactPhone,
    defaultItemType: r.defaultItemType,
    defaultWeightKg: r.defaultWeightKg,
    markupPercent: r.markupPercent,
    markupFlat: r.markupFlat,
    freeShippingThreshold: r.freeShippingThreshold ?? null,
    enabledServices: parseEnabledServices(r.enabledServices as string | null),
    updatedAt: r.updatedAt,
  };
}

/**
 * Load the singleton shipping-config row. Throws if the row is missing —
 * callers in the admin path should always have run the Phase 9 migration.
 */
export async function loadShippingConfig(): Promise<ShippingConfigRow> {
  const rows = await db
    .select()
    .from(shippingConfig)
    .where(eq(shippingConfig.id, SHIPPING_CONFIG_ID))
    .limit(1);
  if (rows.length === 0) {
    throw new Error("shipping_config not initialized — run phase9 migration");
  }
  return rowToShippingConfig(rows[0]);
}
