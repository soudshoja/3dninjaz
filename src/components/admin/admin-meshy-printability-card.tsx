import { Check, AlertTriangle, Loader2 } from "lucide-react";
import { BRAND } from "@/lib/brand";
import type { PrintabilityReport, PrintabilityStatus } from "@/lib/meshy/types";

/**
 * Phase 21 (21-07) — Printability Report card, the one genuinely new UI
 * pattern in this codebase (21-UI-SPEC §Printability Report card).
 *
 * Header pill reuses the SAME tinted-pill grammar as AdminMeshyStatusBadge
 * (rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide) rather
 * than inventing a fourth visual language for "is this thing okay" states.
 *
 * Diagnostic rows render ONLY the fields the analyze response actually
 * returned — parsePrintabilityReport (src/lib/meshy/types.ts) already drops
 * anything Meshy didn't send, so `report` here is the ground truth; no
 * fabricated zeros for absent fields.
 *
 * The repair button is a deliberate spend decision, not the happy path —
 * secondary BRAND.blue outline style, never green/primary — and only ever
 * renders when the parent has determined canRepair (status ready AND
 * printabilityStatus warning/error). This component never decides to repair
 * on its own; onRepair fires only on the admin's explicit click.
 */

const PRINTABILITY_THEME: Record<PrintabilityStatus, { bg: string; fg: string; label: string }> = {
  healthy: { bg: `${BRAND.green}22`, fg: BRAND.green, label: "Healthy" },
  warning: { bg: "#fef3c7", fg: "#92400e", label: "Needs attention" },
  error: { bg: "#fee2e2", fg: "#991b1b", label: "Not printable" },
  unknown: { bg: `${BRAND.ink}18`, fg: BRAND.ink, label: "Unknown" },
};

interface DiagnosticRow {
  key: string;
  clean: boolean;
  label: string;
}

function buildRows(report: PrintabilityReport): DiagnosticRow[] {
  const rows: DiagnosticRow[] = [];

  if (typeof report.is_watertight === "boolean") {
    rows.push({
      key: "is_watertight",
      clean: report.is_watertight,
      label: report.is_watertight ? "Watertight" : "Not watertight",
    });
  }
  if (typeof report.non_manifold_edge_count === "number") {
    const n = report.non_manifold_edge_count;
    rows.push({
      key: "non_manifold_edge_count",
      clean: n === 0,
      label: `${n} non-manifold edge${n === 1 ? "" : "s"}`,
    });
  }
  if (typeof report.hole_count === "number") {
    const n = report.hole_count;
    rows.push({
      key: "hole_count",
      clean: n === 0,
      label: n === 0 ? "No holes detected" : `${n} holes detected`,
    });
  }
  if (typeof report.degenerate_face_count === "number") {
    const n = report.degenerate_face_count;
    rows.push({
      key: "degenerate_face_count",
      clean: n === 0,
      label: `${n} degenerate face${n === 1 ? "" : "s"}`,
    });
  }
  if (typeof report.volume === "number") {
    // Volume is informational (a measurement, not a defect count) — always
    // rendered with the "clean" Check icon, never a warning triangle.
    rows.push({
      key: "volume",
      clean: true,
      label: `Volume: ${report.volume}`,
    });
  }

  return rows;
}

interface AdminMeshyPrintabilityCardProps {
  status: PrintabilityStatus;
  report: PrintabilityReport | null;
  onRepair: () => void;
  repairPending: boolean;
  canRepair: boolean;
}

export function AdminMeshyPrintabilityCard({
  status,
  report,
  onRepair,
  repairPending,
  canRepair,
}: AdminMeshyPrintabilityCardProps) {
  const theme = PRINTABILITY_THEME[status] ?? PRINTABILITY_THEME.unknown;
  const rows = report ? buildRows(report) : [];

  return (
    <section className="rounded-2xl bg-white p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-[var(--font-heading)] text-lg" style={{ color: BRAND.ink }}>
          Printability Check
        </h2>
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide whitespace-nowrap"
          style={{ backgroundColor: theme.bg, color: theme.fg }}
          aria-label={`Printability status: ${theme.label}`}
        >
          {theme.label}
        </span>
      </div>

      {rows.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-2">
              {row.clean ? (
                <Check size={16} style={{ color: BRAND.green }} />
              ) : (
                <AlertTriangle size={16} className="text-amber-600" />
              )}
              <span style={{ color: BRAND.ink }}>{row.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No diagnostics reported.</p>
      )}

      {canRepair ? (
        <button
          type="button"
          onClick={onRepair}
          disabled={repairPending}
          className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md border-2 px-4 py-2 text-sm font-bold disabled:opacity-50 transition-colors duration-150"
          style={{ borderColor: BRAND.blue, color: BRAND.blue, backgroundColor: "transparent" }}
        >
          {repairPending && <Loader2 size={16} className="animate-spin" />}
          Repair this model? (10 credits)
        </button>
      ) : null}
    </section>
  );
}
