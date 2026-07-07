import { BRAND } from "@/lib/brand";
import type { MeshyGenerationStatus } from "@/lib/meshy/types";

/**
 * Admin-facing Meshy generation status badge. Mirrors
 * `admin-order-status-badge.tsx` (Phase 21 21-06) — same STATUS_THEME
 * record pattern, same pill shape, same aria-label convention. Visual
 * tokens come from the unified brand palette (src/lib/brand.ts — the
 * ONLY source of truth; 21-UI-SPEC.md's prose hexes are stale and are
 * NOT used here):
 *
 *   generating              → blue    (in-flight image-to-3d task)
 *   awaiting_review         → purple  (admin review gate)
 *   revising                → purple  (retexture/regenerate in flight)
 *   analyzing               → blue    (free printability check running)
 *   repairing                → amber   (explicit-click paid repair running)
 *   processing_multicolor    → amber   (explicit-click paid multicolor running)
 *   ready                   → green   (terminal success)
 *   failed                  → red     (terminal failure)
 *   canceled                → ink     (terminal, neutral abandon)
 *
 * Amber (`#fef3c7`/`#92400e`) and red (`#fee2e2`/`#991b1b`) literals are
 * deliberate — they match admin-order-status-badge.tsx's own in-review /
 * terminal-failure literals, keeping the two badge components visually
 * paired (21-UI-SPEC.md §Status badge).
 */

const STATUS_THEME: Record<MeshyGenerationStatus, { bg: string; fg: string; label: string }> = {
  generating:             { bg: `${BRAND.blue}22`,   fg: BRAND.blue,   label: "Generating" },
  awaiting_review:        { bg: `${BRAND.purple}22`, fg: BRAND.purple, label: "Awaiting review" },
  revising:               { bg: `${BRAND.purple}22`, fg: BRAND.purple, label: "Revising" },
  analyzing:              { bg: `${BRAND.blue}22`,   fg: BRAND.blue,   label: "Analyzing" },
  repairing:              { bg: "#fef3c7",           fg: "#92400e",    label: "Repairing" },
  processing_multicolor:  { bg: "#fef3c7",           fg: "#92400e",    label: "Processing colors" },
  ready:                  { bg: `${BRAND.green}22`,  fg: BRAND.green,  label: "Ready" },
  failed:                 { bg: "#fee2e2",           fg: "#991b1b",    label: "Failed" },
  canceled:               { bg: `${BRAND.ink}18`,    fg: BRAND.ink,    label: "Canceled" },
};

export function AdminMeshyStatusBadge({ status }: { status: MeshyGenerationStatus }) {
  const theme = STATUS_THEME[status] ?? STATUS_THEME.generating;
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide whitespace-nowrap"
      style={{ backgroundColor: theme.bg, color: theme.fg }}
      aria-label={`Generation status: ${theme.label}`}
    >
      {theme.label}
    </span>
  );
}
