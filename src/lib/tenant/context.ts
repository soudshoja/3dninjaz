import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveDomain, warmRegistry } from "./registry";
import { getTenantDb } from "./pool-manager";
import { getTenantAuth } from "./auth-cache";
import type { Tenant } from "./platform-schema";

// ============================================================================
// Phase 23 (23-04) — getTenantContext(): binds the current request's Host
// header to a resolved { tenant, db, auth }. This is the handler-layer trust
// boundary TEN-03 requires: an unrecognized Host hard-fails via notFound()
// and NEVER falls back to an existing tenant (ARCHITECTURE.md anti-pattern
// 2 / PITFALLS.md Pitfall 4 — ProxyPreserveHost forwards arbitrary/spoofable
// Host values, so the app is the last line of defense).
//
// Phase 24 (24-03): auth added to the resolved shape via getTenantAuth.
//
// Does NOT touch src/middleware.ts — middleware keeps maintenance-mode-only
// duties and gains no trust responsibilities (CVE-2025-29927 discipline:
// tenant identity is resolved in the handler layer, never trusted from a
// middleware-set header). src/lib/auth-helpers.ts's guards now consume this
// resolved shape directly (24-03).
// ============================================================================

export class TenantSuspendedError extends Error {
  constructor(public tenantId: string) {
    super(`Tenant ${tenantId} is suspended`);
    this.name = "TenantSuspendedError";
  }
}

/**
 * Inner resolver — exported separately from the `cache()`-wrapped
 * `getTenantContext` so it can be unit-tested directly. React `cache()`
 * only memoizes inside a request-scoped render dispatcher that a real
 * Next.js server render installs; a bare test harness has no such
 * dispatcher, so testing this function directly is how the resolution
 * LOGIC (as opposed to per-request memoization, which is React's own
 * guarantee) is verified — see context.test.ts.
 */
export async function resolveTenantContext(): Promise<{
  tenant: Tenant;
  db: ReturnType<typeof getTenantDb>;
  auth: ReturnType<typeof getTenantAuth>;
}> {
  // Warm before resolve — resolveDomain() is synchronous once warm and
  // returns null on a cold cache (registry.ts's documented contract).
  await warmRegistry();

  const h = await headers();
  const host = (h.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  const tenant = resolveDomain(host);
  if (!tenant) notFound(); // NEVER fall back to a default tenant — TEN-03
  if (tenant.status === "suspended") {
    throw new TenantSuspendedError(tenant.id); // -> 503-class, distinct from notFound
  }
  const db = getTenantDb(tenant);
  return { tenant, db, auth: getTenantAuth(tenant, db) };
}

/**
 * getTenantContext() — React cache() memoizes this per request so repeated
 * calls within one RSC render / server action share a single resolve. Wraps
 * (rather than directly passes) resolveTenantContext so the exported
 * `getTenantContext` is unambiguously the ARCHITECTURE.md reference shape
 * (`cache(async ...)`), while resolveTenantContext stays independently
 * unit-testable (see context.test.ts).
 */
export const getTenantContext = cache(async () => resolveTenantContext());
