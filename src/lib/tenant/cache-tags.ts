// t:<tenantId>: prefix — every unstable_cache key AND revalidateTag tag MUST
// flow through these. Landed before any consumer (Phase 23 success criterion
// 5) so partial prefixing is impossible. One Node process serves every
// tenant, so Next.js's unstable_cache/revalidateTag data cache is
// process-global (PITFALLS.md Pitfall 8) — an unprefixed tag is a
// cross-tenant cache leak. Phase 24 wires these into the existing
// src/lib/catalog.ts call sites during the singleton sweep.

/**
 * Namespaces a single cache tag to a tenant: "settings" -> "t:abc:settings".
 * tenantId is mandatory — an empty prefix would collapse every tenant into
 * one shared namespace, defeating the entire point of this helper.
 */
export function tenantTag(tenantId: string, tag: string): string {
  if (!tenantId) throw new Error("tenantTag: tenantId required");
  return `t:${tenantId}:${tag}`;
}

/**
 * Namespaces an unstable_cache keyParts array to a tenant:
 * tenantCacheKey("abc", "products", "list") -> ["t:abc", "products", "list"].
 * Called with no parts it still returns the namespace alone: ["t:abc"].
 */
export function tenantCacheKey(tenantId: string, ...parts: string[]): string[] {
  if (!tenantId) throw new Error("tenantCacheKey: tenantId required");
  return [`t:${tenantId}`, ...parts];
}
