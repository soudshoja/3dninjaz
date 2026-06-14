"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  Loader2,
  CircleCheckBig,
  Layers,
  Boxes,
  ChevronDown,
  CheckCheck,
  Hammer,
} from "lucide-react";
import {
  markKeychainPartPrinted,
  setKeychainAssembled,
  type KeychainBatches as KeychainBatchesData,
  type KeychainBaseBatch,
  type KeychainClickerLetterBatch,
  type KeychainAssemblyUnit,
} from "@/actions/admin-production";
import { BRAND } from "@/lib/brand";

/**
 * Keychain batches — admin production console.
 *
 * Workshop layout: a sticky progress header + a segmented switch so only ONE
 * focused section shows at a time (Bases / Clicker+Letter / Assembly) instead
 * of one endless stacked scroll. Done batches auto-collapse; the Assembly list
 * defaults to "Ready to assemble" so the admin sees actionable work first.
 *
 * Box maths: each name spells one keycap per letter, so boxes = letters × qty.
 */

const INK = "#0B1020";
const GREEN = "#1FA300";
const AMBER = "#b45309";
const BLUE = BRAND.blue;
const PURPLE = BRAND.purple;

type View = "bases" | "clicker" | "assembly";
type AssemblyFilter = "ready" | "waiting" | "done";

const boxesOf = (items: { letters: number; quantity: number }[]) =>
  items.reduce((s, u) => s + u.letters * u.quantity, 0);

// ── Primitives ────────────────────────────────────────────────────────────────

function ProgressBar({
  done,
  total,
  accent,
}: {
  done: number;
  total: number;
  accent: string;
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(11,16,32,0.08)" }}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, background: pct === 100 ? GREEN : accent }}
      />
    </div>
  );
}

function TickBox({ done, accent }: { done: boolean; accent: string }) {
  return (
    <span
      className="grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors"
      style={
        done
          ? { background: accent, borderColor: accent, color: "#fff" }
          : { background: "#fff", borderColor: "rgba(11,16,32,0.22)", color: "transparent" }
      }
    >
      <Check className="h-3 w-3" strokeWidth={3.5} />
    </span>
  );
}

/** The keycap-count pill — the production-critical number. */
function BoxPill({ n, accent, muted = false }: { n: number; accent: string; muted?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold tabular-nums"
      style={
        muted
          ? { background: "rgba(11,16,32,0.06)", color: "rgba(11,16,32,0.55)" }
          : { background: `${accent}16`, color: accent }
      }
      title={`${n} keycap box${n === 1 ? "" : "es"} to print`}
    >
      <Boxes className="h-3 w-3" />
      {n}
    </span>
  );
}

// ── Colour batch card (shared by Bases + Clicker/Letter) ──────────────────────

function BatchCard({
  title,
  sub,
  accent,
  items,
  doneCount,
  partDone,
  onToggleOne,
  onToggleAll,
}: {
  title: string;
  sub?: string;
  accent: string;
  items: KeychainAssemblyUnit[] | KeychainBaseBatch["items"];
  doneCount: number;
  partDone: (u: KeychainBaseBatch["items"][number]) => boolean;
  onToggleOne: (id: string, done: boolean) => void;
  onToggleAll: (ids: string[], done: boolean) => void;
}) {
  const total = items.length;
  const allDone = doneCount === total && total > 0;
  const totalBoxes = boxesOf(items);
  const [open, setOpen] = useState(!allDone);
  const ids = items.map((u) => u.itemId);

  return (
    <div
      className="overflow-hidden rounded-2xl border bg-white"
      style={{
        borderColor: allDone ? "rgba(31,163,0,0.30)" : "rgba(11,16,32,0.10)",
        boxShadow: allDone ? "none" : "0 1px 2px rgba(11,16,32,0.04)",
      }}
    >
      {/* Accent rail + header */}
      <div className="flex items-stretch">
        <span className="w-1 shrink-0" style={{ background: allDone ? GREEN : accent }} />
        <div className="min-w-0 flex-1 p-3">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-1.5">
                <p
                  className="truncate text-[15px] font-extrabold leading-tight"
                  style={{ color: allDone ? GREEN : INK }}
                >
                  {title}
                </p>
                {allDone ? <CheckCheck className="h-4 w-4 shrink-0" style={{ color: GREEN }} /> : null}
                <ChevronDown
                  className="h-4 w-4 shrink-0 transition-transform"
                  style={{ color: "rgba(11,16,32,0.4)", transform: open ? "rotate(180deg)" : "none" }}
                />
              </div>
              {sub ? (
                <p className="truncate text-xs font-semibold" style={{ color: "#64748b" }}>
                  {sub}
                </p>
              ) : null}
            </button>
            <BoxPill n={totalBoxes} accent={accent} muted={allDone} />
          </div>

          {/* progress */}
          <div className="mt-2 flex items-center gap-2">
            <ProgressBar done={doneCount} total={total} accent={accent} />
            <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: "rgba(11,16,32,0.5)" }}>
              {doneCount}/{total}
            </span>
          </div>
        </div>
      </div>

      {/* names */}
      {open ? (
        <div className="px-2 pb-2">
          <ul className="space-y-0.5">
            {items.map((u) => {
              const done = partDone(u);
              return (
                <li key={u.itemId}>
                  <button
                    type="button"
                    onClick={() => onToggleOne(u.itemId, !done)}
                    aria-pressed={done}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-black/[0.035]"
                  >
                    <TickBox done={done} accent={accent} />
                    <span
                      className="truncate text-[13px] font-bold"
                      style={{
                        color: done ? "rgba(11,16,32,0.4)" : INK,
                        textDecoration: done ? "line-through" : "none",
                      }}
                    >
                      {u.name || u.clientName || "(no name)"}
                    </span>
                    <span className="shrink-0 font-mono text-[10px]" style={{ color: "#94a3b8" }}>
                      #{u.invoiceNumber}
                    </span>
                    <span className="ml-auto">
                      <BoxPill n={u.letters * u.quantity} accent={accent} muted={done} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* mark all */}
          <button
            type="button"
            onClick={() => onToggleAll(ids, !allDone)}
            className="mt-1.5 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-opacity hover:opacity-80"
            style={
              allDone
                ? { background: "rgba(11,16,32,0.05)", color: "rgba(11,16,32,0.6)" }
                : { background: accent, color: "#fff" }
            }
          >
            {allDone ? (
              <>Undo all</>
            ) : (
              <>
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all {total} printed
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ── Assembly row ──────────────────────────────────────────────────────────────

function AssemblyRow({
  unit,
  onAssemble,
}: {
  unit: KeychainAssemblyUnit;
  onAssemble: (itemId: string, done: boolean) => void;
}) {
  const assembled = unit.productionDone;
  const canAssemble = unit.bothPartsDone;
  const boxes = unit.letters * unit.quantity;

  return (
    <div
      className="flex items-center gap-3 rounded-xl border px-3 py-2"
      style={{
        background: assembled ? "rgba(31,163,0,0.05)" : "#fff",
        borderColor: assembled ? "rgba(31,163,0,0.28)" : "rgba(11,16,32,0.10)",
      }}
    >
      <button
        type="button"
        disabled={!canAssemble && !assembled}
        onClick={() => onAssemble(unit.itemId, !assembled)}
        aria-pressed={assembled}
        title={assembled ? "Undo assembled" : canAssemble ? "Mark assembled" : "Print both parts first"}
        className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-colors disabled:cursor-not-allowed"
        style={
          assembled
            ? { background: GREEN, borderColor: GREEN, color: "#fff" }
            : canAssemble
              ? { background: "#fff", borderColor: GREEN, color: GREEN }
              : { background: "#f1f5f9", borderColor: "rgba(11,16,32,0.10)", color: "rgba(11,16,32,0.25)" }
        }
      >
        {assembled ? <Check className="h-4 w-4" strokeWidth={3} /> : <Hammer className="h-4 w-4" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className="truncate text-sm font-extrabold"
            style={{ color: assembled ? "rgba(11,16,32,0.45)" : INK, textDecoration: assembled ? "line-through" : "none" }}
          >
            {unit.name || "(no name)"}
          </p>
          <span className="shrink-0 font-mono text-[10px]" style={{ color: "#94a3b8" }}>
            #{unit.invoiceNumber}
          </span>
          <span className="ml-auto">
            <BoxPill n={boxes} accent={INK} muted={assembled} />
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs" style={{ color: "#64748b" }}>
          <span className="font-semibold" style={{ color: BLUE }}>{unit.base}</span> base ·{" "}
          <span className="font-semibold" style={{ color: PURPLE }}>{unit.clicker} + {unit.letter}</span>
        </p>
        {/* part dots */}
        <div className="mt-1 flex items-center gap-1.5">
          <PartDot on={unit.baseDone} label="base" />
          <PartDot on={unit.clickerLetterDone} label="clicker+letter" />
        </div>
      </div>
    </div>
  );
}

function PartDot({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
      style={on ? { background: "rgba(31,163,0,0.12)", color: GREEN } : { background: "rgba(245,158,11,0.12)", color: AMBER }}
    >
      <span
        className="grid h-3 w-3 place-items-center rounded-full"
        style={{ background: on ? GREEN : AMBER, color: "#fff" }}
      >
        {on ? <Check className="h-2 w-2" strokeWidth={4} /> : null}
      </span>
      {label}
    </span>
  );
}

// ── Segmented switch ──────────────────────────────────────────────────────────

function Seg({
  active,
  onClick,
  icon,
  label,
  count,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition-all sm:text-sm"
      style={
        active
          ? { background: accent, color: "#fff", boxShadow: "0 2px 8px rgba(11,16,32,0.12)" }
          : { background: "transparent", color: "rgba(11,16,32,0.55)" }
      }
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <span
        className="rounded-full px-1.5 text-[11px] tabular-nums"
        style={active ? { background: "rgba(255,255,255,0.25)" } : { background: "rgba(11,16,32,0.08)" }}
      >
        {count}
      </span>
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function KeychainBatchesView({ data }: { data: KeychainBatchesData }) {
  const [bases, setBases] = useState<KeychainBaseBatch[]>(data.bases);
  const [clickerLetters, setClickerLetters] = useState<KeychainClickerLetterBatch[]>(data.clickerLetters);
  const [assembly, setAssembly] = useState<KeychainAssemblyUnit[]>(data.assembly);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<View>("bases");
  const [aFilter, setAFilter] = useState<AssemblyFilter>("ready");

  // ── handlers (unchanged logic, per-item + whole-batch share the same fn) ────
  function onToggleBase(ids: string[], done: boolean) {
    setError(null);
    const idSet = new Set(ids);
    setBases((prev) =>
      prev.map((b) => {
        const items = b.items.map((u) => (idSet.has(u.itemId) ? { ...u, baseDone: done } : u));
        const doneCount = items.filter((u) => u.baseDone).length;
        return { ...b, items, doneCount, allDone: doneCount === items.length };
      }),
    );
    setAssembly((prev) =>
      prev.map((u) => (idSet.has(u.itemId) ? { ...u, baseDone: done, bothPartsDone: done && u.clickerLetterDone } : u)),
    );
    startTransition(async () => {
      const res = await markKeychainPartPrinted(ids, "base", done);
      if (!res.ok) setError(res.error ?? "Could not update base batch.");
    });
  }

  function onToggleClicker(ids: string[], done: boolean) {
    setError(null);
    const idSet = new Set(ids);
    setClickerLetters((prev) =>
      prev.map((b) => {
        const items = b.items.map((u) => (idSet.has(u.itemId) ? { ...u, clickerLetterDone: done } : u));
        const doneCount = items.filter((u) => u.clickerLetterDone).length;
        return { ...b, items, doneCount, allDone: doneCount === items.length };
      }),
    );
    setAssembly((prev) =>
      prev.map((u) => (idSet.has(u.itemId) ? { ...u, clickerLetterDone: done, bothPartsDone: u.baseDone && done } : u)),
    );
    startTransition(async () => {
      const res = await markKeychainPartPrinted(ids, "clickerLetter", done);
      if (!res.ok) setError(res.error ?? "Could not update clicker+letter batch.");
    });
  }

  function onAssemble(itemId: string, done: boolean) {
    setError(null);
    setAssembly((prev) => prev.map((u) => (u.itemId === itemId ? { ...u, productionDone: done } : u)));
    startTransition(async () => {
      const res = await setKeychainAssembled(itemId, done);
      if (!res.ok) {
        setError(res.error ?? "Could not update assembly.");
        setAssembly((prev) => prev.map((u) => (u.itemId === itemId ? { ...u, productionDone: !done } : u)));
      }
    });
  }

  // ── derived ────────────────────────────────────────────────────────────────
  const totalUnits = assembly.length;
  const assembledCount = assembly.filter((u) => u.productionDone).length;
  const totalBoxes = boxesOf(assembly);

  const ready = useMemo(() => assembly.filter((u) => u.bothPartsDone && !u.productionDone), [assembly]);
  const waiting = useMemo(() => assembly.filter((u) => !u.bothPartsDone && !u.productionDone), [assembly]);
  const doneList = useMemo(() => assembly.filter((u) => u.productionDone), [assembly]);
  const aList = aFilter === "ready" ? ready : aFilter === "waiting" ? waiting : doneList;

  if (totalUnits === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm"
        style={{ borderColor: "rgba(11,16,32,0.14)", color: "rgba(11,16,32,0.5)" }}
      >
        No orders are flagged for keychain production. Open an order and hit
        <span className="font-semibold" style={{ color: INK }}> “Add to production”</span> to start a batch.
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <div className="mb-3 rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: "#be123c" }} role="alert">
          {error}
        </div>
      ) : null}

      {/* ── Sticky console header ── */}
      <div
        className="sticky top-0 z-10 -mx-1 mb-4 rounded-2xl border px-3 py-3 backdrop-blur"
        style={{ background: "rgba(255,255,255,0.92)", borderColor: "rgba(11,16,32,0.10)" }}
      >
        {/* stat strip */}
        <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-xl font-black tabular-nums" style={{ color: INK }}>{totalUnits}</span>
            <span className="text-xs font-semibold" style={{ color: "#64748b" }}>keychains</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5">
            <Boxes className="h-4 w-4 self-center" style={{ color: BLUE }} />
            <span className="text-xl font-black tabular-nums" style={{ color: INK }}>{totalBoxes}</span>
            <span className="text-xs font-semibold" style={{ color: "#64748b" }}>boxes</span>
          </span>
          <span
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold tabular-nums"
            style={
              assembledCount === totalUnits
                ? { background: "rgba(31,163,0,0.12)", color: GREEN }
                : { background: "rgba(245,158,11,0.12)", color: AMBER }
            }
          >
            {assembledCount === totalUnits ? <CircleCheckBig className="h-3.5 w-3.5" /> : null}
            {assembledCount}/{totalUnits} assembled
          </span>
          {pending ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "#94a3b8" }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </span>
          ) : null}
        </div>

        {/* segmented switch */}
        <div className="flex gap-1 rounded-2xl p-1" style={{ background: "rgba(11,16,32,0.05)" }}>
          <Seg
            active={view === "bases"}
            onClick={() => setView("bases")}
            icon={<Layers className="h-4 w-4" />}
            label="Bases"
            count={bases.length}
            accent={BLUE}
          />
          <Seg
            active={view === "clicker"}
            onClick={() => setView("clicker")}
            icon={<Layers className="h-4 w-4" />}
            label="Clicker + Letter"
            count={clickerLetters.length}
            accent={PURPLE}
          />
          <Seg
            active={view === "assembly"}
            onClick={() => setView("assembly")}
            icon={<Hammer className="h-4 w-4" />}
            label="Assembly"
            count={ready.length}
            accent={GREEN}
          />
        </div>
      </div>

      {/* ── Bases ── */}
      {view === "bases" ? (
        bases.length === 0 ? (
          <Empty label="No base batches." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {bases.map((b) => (
              <BatchCard
                key={b.base}
                title={`${b.base}`}
                sub="base"
                accent={BLUE}
                items={b.items}
                doneCount={b.doneCount}
                partDone={(u) => u.baseDone}
                onToggleOne={(id, done) => onToggleBase([id], done)}
                onToggleAll={onToggleBase}
              />
            ))}
          </div>
        )
      ) : null}

      {/* ── Clicker + Letter ── */}
      {view === "clicker" ? (
        clickerLetters.length === 0 ? (
          <Empty label="No clicker+letter batches." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {clickerLetters.map((b) => (
              <BatchCard
                key={`${b.clicker}|||${b.letter}`}
                title={`${b.clicker}`}
                sub={`+ ${b.letter} letter`}
                accent={PURPLE}
                items={b.items}
                doneCount={b.doneCount}
                partDone={(u) => u.clickerLetterDone}
                onToggleOne={(id, done) => onToggleClicker([id], done)}
                onToggleAll={onToggleClicker}
              />
            ))}
          </div>
        )
      ) : null}

      {/* ── Assembly ── */}
      {view === "assembly" ? (
        <div>
          {/* filter chips */}
          <div className="mb-3 flex flex-wrap gap-2">
            <FilterChip active={aFilter === "ready"} onClick={() => setAFilter("ready")} label="Ready" n={ready.length} accent={GREEN} />
            <FilterChip active={aFilter === "waiting"} onClick={() => setAFilter("waiting")} label="Waiting on parts" n={waiting.length} accent={AMBER} />
            <FilterChip active={aFilter === "done"} onClick={() => setAFilter("done")} label="Done" n={doneList.length} accent={INK} />
          </div>

          {aList.length === 0 ? (
            <Empty
              label={
                aFilter === "ready"
                  ? "Nothing ready yet — print both parts for a keychain and it lands here."
                  : aFilter === "waiting"
                    ? "No keychains waiting — every part is printed. "
                    : "Nothing assembled yet."
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {aList.map((u) => (
                <AssemblyRow key={u.itemId} unit={u} onAssemble={onAssemble} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  n,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  n: number;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all"
      style={
        active
          ? { background: accent, color: "#fff" }
          : { background: "rgba(11,16,32,0.05)", color: "rgba(11,16,32,0.6)" }
      }
    >
      {label}
      <span
        className="rounded-full px-1.5 tabular-nums"
        style={active ? { background: "rgba(255,255,255,0.25)" } : { background: "rgba(11,16,32,0.08)" }}
      >
        {n}
      </span>
    </button>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div
      className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm"
      style={{ borderColor: "rgba(11,16,32,0.14)", color: "rgba(11,16,32,0.5)" }}
    >
      {label}
    </div>
  );
}
