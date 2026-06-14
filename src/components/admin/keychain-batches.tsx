"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, CircleCheckBig, Hash, User, Layers } from "lucide-react";
import {
  markKeychainPartPrinted,
  setKeychainAssembled,
  type KeychainBatches as KeychainBatchesData,
  type KeychainBaseBatch,
  type KeychainClickerLetterBatch,
  type KeychainAssemblyUnit,
} from "@/actions/admin-production";
import { BRAND } from "@/lib/brand";

const GREEN = "#1FA300";
const INK = "#0B1020";
const AMBER = "#b45309";

// ── Small reusable primitives ─────────────────────────────────────────────────

function Chip({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={
        accent
          ? { background: `${BRAND.blue}18`, color: "#0A4FB3" }
          : { background: "rgba(11,16,32,0.06)", color: "rgba(11,16,32,0.65)" }
      }
    >
      {children}
    </span>
  );
}

function PartChip({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
      style={
        done
          ? { background: "rgba(31,163,0,0.12)", color: GREEN }
          : { background: "rgba(245,158,11,0.12)", color: AMBER }
      }
    >
      {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
      {label}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-base font-extrabold uppercase tracking-wider mb-3"
      style={{ color: INK }}
    >
      {children}
    </h3>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div
      className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-foreground/50"
      style={{ borderColor: "rgba(11,16,32,0.14)" }}
    >
      {label}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div
      className="mb-4 rounded-lg px-3 py-2 text-sm font-semibold text-white"
      style={{ background: "#be123c" }}
      role="alert"
    >
      {msg}
    </div>
  );
}

// ── Bases section ─────────────────────────────────────────────────────────────

function BaseBatchCard({
  batch,
  onToggle,
}: {
  batch: KeychainBaseBatch;
  onToggle: (ids: string[], done: boolean) => void;
}) {
  const ids = batch.items.map((u) => u.itemId);
  const isDone = batch.allDone;

  return (
    <div
      className="rounded-2xl border bg-white p-4"
      style={{
        borderColor: isDone ? "rgba(31,163,0,0.35)" : "rgba(11,16,32,0.10)",
        opacity: isDone ? 0.75 : 1,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-lg font-extrabold break-words"
            style={{ color: isDone ? GREEN : INK, textDecoration: isDone ? "line-through" : "none" }}
          >
            {batch.base} base
          </p>
          <p className="text-xs text-foreground/50 mt-0.5">
            {batch.doneCount}/{batch.items.length} printed
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-sm font-bold tabular-nums shrink-0"
          style={{ background: `${BRAND.blue}14`, color: "#0A4FB3" }}
        >
          ×{batch.totalQty}
        </span>
      </div>

      {/* Customer list — each row ticks that single item independently */}
      <ul className="space-y-0.5 mb-3">
        {batch.items.map((u) => (
          <li key={u.itemId}>
            <button
              type="button"
              onClick={() => onToggle([u.itemId], !u.baseDone)}
              aria-pressed={u.baseDone}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition-colors hover:bg-black/[0.04]"
            >
              <span
                className="grid h-4 w-4 shrink-0 place-items-center rounded border-2 transition-colors"
                style={
                  u.baseDone
                    ? { background: GREEN, borderColor: GREEN, color: "#fff" }
                    : { background: "#fff", borderColor: "rgba(11,16,32,0.25)", color: "transparent" }
                }
              >
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              <span
                className="font-semibold"
                style={{
                  color: u.baseDone ? "rgba(11,16,32,0.45)" : INK,
                  textDecoration: u.baseDone ? "line-through" : "none",
                }}
              >
                {u.name || u.clientName}
              </span>
              <span className="font-mono" style={{ color: "#94a3b8" }}>
                #{u.invoiceNumber}
              </span>
              {u.quantity > 1 && (
                <span style={{ color: BRAND.blue }}>×{u.quantity}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {/* Whole-batch shortcut — ticks/unticks every item at once */}
      <button
        type="button"
        onClick={() => onToggle(ids, !isDone)}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-80"
        style={
          isDone
            ? { background: "rgba(11,16,32,0.06)", color: INK }
            : { background: GREEN, color: "#fff" }
        }
      >
        {isDone ? (
          <>Undo whole base batch</>
        ) : (
          <>
            <CircleCheckBig className="h-4 w-4" />
            Mark all {batch.items.length} printed
          </>
        )}
      </button>
    </div>
  );
}

// ── Clicker + Letter section ──────────────────────────────────────────────────

function ClickerLetterBatchCard({
  batch,
  onToggle,
}: {
  batch: KeychainClickerLetterBatch;
  onToggle: (ids: string[], done: boolean) => void;
}) {
  const ids = batch.items.map((u) => u.itemId);
  const isDone = batch.allDone;

  return (
    <div
      className="rounded-2xl border bg-white p-4"
      style={{
        borderColor: isDone ? "rgba(31,163,0,0.35)" : "rgba(11,16,32,0.10)",
        opacity: isDone ? 0.75 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-base font-extrabold break-words"
            style={{ color: isDone ? GREEN : INK, textDecoration: isDone ? "line-through" : "none" }}
          >
            {batch.clicker} clicker
          </p>
          <p className="text-sm font-semibold break-words" style={{ color: "#475569" }}>
            + {batch.letter} letter
          </p>
          <p className="text-xs text-foreground/50 mt-0.5">
            {batch.doneCount}/{batch.items.length} printed
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-sm font-bold tabular-nums shrink-0"
          style={{ background: `${BRAND.purple}14`, color: BRAND.purple }}
        >
          ×{batch.totalQty}
        </span>
      </div>

      <ul className="space-y-0.5 mb-3">
        {batch.items.map((u) => (
          <li key={u.itemId}>
            <button
              type="button"
              onClick={() => onToggle([u.itemId], !u.clickerLetterDone)}
              aria-pressed={u.clickerLetterDone}
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition-colors hover:bg-black/[0.04]"
            >
              <span
                className="grid h-4 w-4 shrink-0 place-items-center rounded border-2 transition-colors"
                style={
                  u.clickerLetterDone
                    ? { background: GREEN, borderColor: GREEN, color: "#fff" }
                    : { background: "#fff", borderColor: "rgba(11,16,32,0.25)", color: "transparent" }
                }
              >
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              <span
                className="font-semibold"
                style={{
                  color: u.clickerLetterDone ? "rgba(11,16,32,0.45)" : INK,
                  textDecoration: u.clickerLetterDone ? "line-through" : "none",
                }}
              >
                {u.name || u.clientName}
              </span>
              <span className="font-mono" style={{ color: "#94a3b8" }}>#{u.invoiceNumber}</span>
              {u.quantity > 1 && <span style={{ color: BRAND.purple }}>×{u.quantity}</span>}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onToggle(ids, !isDone)}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-opacity hover:opacity-80"
        style={
          isDone
            ? { background: "rgba(11,16,32,0.06)", color: INK }
            : { background: BRAND.purple, color: "#fff" }
        }
      >
        {isDone ? (
          <>Undo whole batch</>
        ) : (
          <>
            <CircleCheckBig className="h-4 w-4" />
            Mark all {batch.items.length} printed
          </>
        )}
      </button>
    </div>
  );
}

// ── Assembly section ──────────────────────────────────────────────────────────

function AssemblyRow({
  unit,
  onAssemble,
}: {
  unit: KeychainAssemblyUnit;
  onAssemble: (itemId: string, done: boolean) => void;
}) {
  const assembled = unit.productionDone;
  const canAssemble = unit.bothPartsDone;

  return (
    <div
      className="flex items-start gap-3 rounded-xl border px-3 py-2.5"
      style={{
        background: assembled ? "rgba(31,163,0,0.05)" : "#fff",
        borderColor: assembled ? "rgba(31,163,0,0.30)" : "rgba(11,16,32,0.10)",
      }}
    >
      {/* Assembled checkbox */}
      <button
        type="button"
        disabled={!canAssemble && !assembled}
        onClick={() => onAssemble(unit.itemId, !assembled)}
        aria-pressed={assembled}
        title={
          assembled
            ? "Undo assembled"
            : canAssemble
              ? "Mark assembled"
              : "Print both parts first"
        }
        className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        style={
          assembled
            ? { background: GREEN, borderColor: GREEN, color: "#fff" }
            : canAssemble
              ? { background: "#fff", borderColor: "rgba(11,16,32,0.30)", color: "transparent" }
              : { background: "#f1f5f9", borderColor: "rgba(11,16,32,0.12)", color: "transparent" }
        }
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </button>

      <div className="min-w-0 flex-1">
        {/* Name + invoice */}
        <div className="flex flex-wrap items-center gap-2">
          <p
            className="text-sm font-bold"
            style={{
              color: assembled ? "rgba(11,16,32,0.45)" : INK,
              textDecoration: assembled ? "line-through" : "none",
            }}
          >
            {unit.name || "(no name)"}
          </p>
          <span className="inline-flex items-center gap-1 text-xs text-foreground/50">
            <Hash className="h-3 w-3" />
            {unit.invoiceNumber}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-foreground/50">
            <User className="h-3 w-3" />
            {unit.clientName}
          </span>
        </div>

        {/* Colour description */}
        <p className="text-xs text-foreground/60 mt-0.5 break-words">
          {unit.base} base / {unit.clicker} + {unit.letter}
        </p>

        {/* Part status chips */}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <PartChip done={unit.baseDone} label="base" />
          <PartChip done={unit.clickerLetterDone} label="clicker+letter" />
          {unit.quantity > 1 && <Chip accent>×{unit.quantity}</Chip>}
        </div>
      </div>
    </div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────

export function KeychainBatchesView({ data }: { data: KeychainBatchesData }) {
  const [bases, setBases] = useState<KeychainBaseBatch[]>(data.bases);
  const [clickerLetters, setClickerLetters] = useState<KeychainClickerLetterBatch[]>(
    data.clickerLetters,
  );
  const [assembly, setAssembly] = useState<KeychainAssemblyUnit[]>(data.assembly);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Toggle base batch ────────────────────────────────────────────────────
  function onToggleBase(ids: string[], done: boolean) {
    setError(null);
    // Optimistic update
    setBases((prev) =>
      prev.map((b) => {
        const idSet = new Set(ids);
        const items = b.items.map((u) => (idSet.has(u.itemId) ? { ...u, baseDone: done } : u));
        const doneCount = items.filter((u) => u.baseDone).length;
        return { ...b, items, doneCount, allDone: doneCount === items.length };
      }),
    );
    // Sync assembly panel
    setAssembly((prev) => {
      const idSet = new Set(ids);
      return prev.map((u) =>
        idSet.has(u.itemId)
          ? { ...u, baseDone: done, bothPartsDone: done && u.clickerLetterDone }
          : u,
      );
    });
    startTransition(async () => {
      const res = await markKeychainPartPrinted(ids, "base", done);
      if (!res.ok) setError(res.error ?? "Could not update base batch.");
    });
  }

  // ── Toggle clicker+letter batch ──────────────────────────────────────────
  function onToggleClickerLetter(ids: string[], done: boolean) {
    setError(null);
    setClickerLetters((prev) =>
      prev.map((b) => {
        const idSet = new Set(ids);
        const items = b.items.map((u) =>
          idSet.has(u.itemId) ? { ...u, clickerLetterDone: done } : u,
        );
        const doneCount = items.filter((u) => u.clickerLetterDone).length;
        return { ...b, items, doneCount, allDone: doneCount === items.length };
      }),
    );
    setAssembly((prev) => {
      const idSet = new Set(ids);
      return prev.map((u) =>
        idSet.has(u.itemId)
          ? { ...u, clickerLetterDone: done, bothPartsDone: u.baseDone && done }
          : u,
      );
    });
    startTransition(async () => {
      const res = await markKeychainPartPrinted(ids, "clickerLetter", done);
      if (!res.ok) setError(res.error ?? "Could not update clicker+letter batch.");
    });
  }

  // ── Assemble a unit ──────────────────────────────────────────────────────
  function onAssemble(itemId: string, done: boolean) {
    setError(null);
    setAssembly((prev) =>
      prev.map((u) => (u.itemId === itemId ? { ...u, productionDone: done } : u)),
    );
    startTransition(async () => {
      const res = await setKeychainAssembled(itemId, done);
      if (!res.ok) {
        setError(res.error ?? "Could not update assembly.");
        // Revert optimistic update on error
        setAssembly((prev) =>
          prev.map((u) => (u.itemId === itemId ? { ...u, productionDone: !done } : u)),
        );
      }
    });
  }

  const totalUnits = assembly.length;
  const assembledCount = assembly.filter((u) => u.productionDone).length;

  return (
    <div>
      {error ? <ErrorBanner msg={error} /> : null}

      {/* Summary line */}
      {totalUnits > 0 ? (
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <p className="text-sm text-foreground/60">
            <span className="font-bold" style={{ color: INK }}>
              {totalUnits}
            </span>{" "}
            keychain{totalUnits === 1 ? "" : "s"} in production
          </p>
          {pending ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/50">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </span>
          ) : null}
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
            style={
              assembledCount === totalUnits && totalUnits > 0
                ? { background: "rgba(31,163,0,0.12)", color: GREEN }
                : { background: "rgba(245,158,11,0.12)", color: AMBER }
            }
          >
            {assembledCount === totalUnits && totalUnits > 0 ? (
              <CircleCheckBig className="h-3.5 w-3.5" />
            ) : null}
            {assembledCount}/{totalUnits} assembled
          </span>
        </div>
      ) : null}

      {totalUnits === 0 ? (
        <Empty label="No orders are flagged for keychain production. Flag an order using the 'Add to production' button on the order detail page." />
      ) : (
        <div className="space-y-8">
          {/* ── Section 1: Bases to print ── */}
          <section>
            <SectionTitle>
              <span className="inline-flex items-center gap-2">
                <Layers className="h-4 w-4" style={{ color: BRAND.blue }} />
                Bases to print
              </span>
            </SectionTitle>
            {bases.length === 0 ? (
              <Empty label="No base batches." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {bases.map((b) => (
                  <BaseBatchCard
                    key={b.base}
                    batch={b}
                    onToggle={onToggleBase}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Section 2: Clicker + Letter to print ── */}
          <section>
            <SectionTitle>
              <span className="inline-flex items-center gap-2">
                <Layers className="h-4 w-4" style={{ color: BRAND.purple }} />
                Clicker + Letter to print
              </span>
            </SectionTitle>
            {clickerLetters.length === 0 ? (
              <Empty label="No clicker+letter batches." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {clickerLetters.map((b) => (
                  <ClickerLetterBatchCard
                    key={`${b.clicker}|||${b.letter}`}
                    batch={b}
                    onToggle={onToggleClickerLetter}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Section 3: Assembly ── */}
          <section>
            <SectionTitle>
              <span className="inline-flex items-center gap-2">
                <CircleCheckBig className="h-4 w-4" style={{ color: GREEN }} />
                Assembly
              </span>
            </SectionTitle>
            <p className="mb-3 text-xs text-foreground/50">
              Tick a keychain as assembled once both parts are printed. The checkbox is locked until both the base and clicker+letter are done.
            </p>
            <div className="flex flex-col gap-2">
              {assembly.map((u) => (
                <AssemblyRow key={u.itemId} unit={u} onAssemble={onAssemble} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
