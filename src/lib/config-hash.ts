/**
 * Phase 19 (19-08) — Stable JSON hash for ConfigurationData.
 *
 * Browser-safe: NO node:crypto imports. Uses a pure-JS djb2 hash that runs
 * in both the Zustand store (browser) and server actions.
 *
 * D-11 / R4 mitigation: two configurations differing only in JSON key order
 * MUST hash identically — stableStringify sorts keys recursively.
 */

import type { ConfigurationData } from "./config-fields";

// ============================================================================
// stableStringify
// ============================================================================

/**
 * Deterministic JSON.stringify with recursively sorted object keys.
 * Arrays preserve element order (not sorted).
 * Primitives are passed through JSON.stringify directly.
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map((k) => {
      const v = (obj as Record<string, unknown>)[k];
      return `${JSON.stringify(k)}:${stableStringify(v)}`;
    });
  return "{" + sorted.join(",") + "}";
}

// ============================================================================
// hashConfigurationData
// ============================================================================

/**
 * Deterministic 8-char hex hash of a ConfigurationData object.
 *
 * Uses djb2 (pure-JS, browser-safe). The hash is only used for cart-line
 * key deduplication — collision resistance is NOT a security requirement.
 * For security hashing (e.g. HMAC), use node:crypto instead.
 *
 * Returns a zero-padded 8-character lowercase hex string.
 */
export function hashConfigurationData(c: ConfigurationData): string {
  const s = stableStringify(c);
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
