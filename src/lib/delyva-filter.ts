import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { shippingServiceCatalog } from "@/lib/db/schema";
import type { ShippingConfigRow } from "@/lib/shipping-config";

// ============================================================================
// Phase 15 — shared service-catalog filter.
//
// Historical bug (BLOCKER 4, 2026-04-24): the admin-side quoteRatesForOrder
// was filtering Delyva responses by cfg.enabledServices (legacy JSON column
// on shipping_config), while the customer-side quoteForCart had already
// moved to shipping_service_catalog.is_enabled. Every toggle the admin
// flipped in /admin/shipping/delyva was silently ignored when booking from
// the order page.
//
// Both paths now call filterByEnabledCatalog() so the catalog is the single
// source of truth — with fallback to the legacy column when the catalog
// table has never been populated (backward-compat for pre-Phase-15 installs).
// ============================================================================

type ServiceLike = {
  serviceCode: string;
  companyCode: string | null;
};

/**
 * Filter a Delyva quote response by enabled services, preferring the
 * Phase-15 shipping_service_catalog table. Dual-set matching: a live rate
 * passes when either its serviceCode or companyCode appears in the enabled
 * set.
 *
 * Fallback order:
 *   1. catalog has ≥ 1 enabled row → filter by catalog.
 *   2. catalog is empty but cfg.enabledServices has entries → filter by
 *      legacy JSON column (backward-compat).
 *   3. both empty → pass-through (allow all).
 */
export async function filterByEnabledCatalog<T extends ServiceLike>(
  services: T[],
  cfg: Pick<ShippingConfigRow, "enabledServices">,
): Promise<T[]> {
  const catalogEnabledRows = await db
    .select({
      serviceCode: shippingServiceCatalog.serviceCode,
      companyCode: shippingServiceCatalog.companyCode,
    })
    .from(shippingServiceCatalog)
    .where(eq(shippingServiceCatalog.isEnabled, true));

  if (catalogEnabledRows.length === 0) {
    // Legacy fallback — pre-Phase-15 installs never populated the catalog.
    const legacyAllow = new Set(cfg.enabledServices);
    if (legacyAllow.size === 0) return services;
    return services.filter(
      (s) =>
        legacyAllow.has(s.serviceCode) ||
        (s.companyCode !== null && legacyAllow.has(s.companyCode)),
    );
  }

  const enabledServiceCodes = new Set(
    catalogEnabledRows.map((r) => r.serviceCode),
  );
  const enabledCompanyCodes = new Set(
    catalogEnabledRows.map((r) => r.companyCode).filter(Boolean),
  );
  return services.filter(
    (s) =>
      enabledServiceCodes.has(s.serviceCode) ||
      (s.companyCode !== null && enabledCompanyCodes.has(s.companyCode)),
  );
}
