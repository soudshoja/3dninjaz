"use client";

import { useState, useTransition } from "react";
import {
  Check,
  ChevronDown,
  CircleCheckBig,
  GripVertical,
  Loader2,
  PackageCheck,
  Hash,
  User,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  toggleProductionItemDone,
  setOrderProductionDone,
  reorderProductionLineItems,
  type ProductionBoard as Board,
  type ProductionOrder,
  type ProductionLineItem,
} from "@/actions/admin-production";

const GREEN = "#1FA300"; // brand green (dark) — strong contrast for "done"
const INK = "#0B1020";

function recompute(order: ProductionOrder): ProductionOrder {
  const doneCount = order.items.filter((i) => i.done).length;
  return { ...order, doneCount, totalCount: order.items.length };
}

/** Small status pill: x / y made. */
function ProgressPill({ done, total }: { done: number; total: number }) {
  const complete = total > 0 && done === total;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
      style={
        complete
          ? { background: "rgba(31,163,0,0.12)", color: GREEN }
          : { background: "rgba(245,158,11,0.14)", color: "#b45309" }
      }
    >
      {complete ? <CircleCheckBig className="h-3.5 w-3.5" /> : null}
      {done}/{total} made
    </span>
  );
}

export function ProductionBoardView({ board }: { board: Board }) {
  const [production, setProduction] = useState<ProductionOrder[]>(board.production);
  const [processed, setProcessed] = useState<ProductionOrder[]>(board.processed);
  const [lineItems, setLineItems] = useState<ProductionLineItem[]>(board.lineItems);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleExpand(orderId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  // ── Tick a single line of an order ────────────────────────────────────────
  function onToggleItem(order: ProductionOrder, itemId: string, done: boolean) {
    setError(null);
    // optimistic: update item, then re-bucket the order if it flipped complete
    const updated = recompute({
      ...order,
      items: order.items.map((i) => (i.id === itemId ? { ...i, done } : i)),
    });
    const nowComplete = updated.doneCount === updated.totalCount;

    setProduction((prev) => {
      const without = prev.filter((o) => o.id !== order.id);
      return nowComplete ? without : sortByCreated([...without, updated]);
    });
    setProcessed((prev) => {
      const without = prev.filter((o) => o.id !== order.id);
      return nowComplete ? sortByCreated([...without, updated]) : without;
    });
    // keep the line-queue in sync (done lines leave the queue)
    setLineItems((prev) =>
      done
        ? prev.filter((l) => l.id !== itemId)
        : prev.some((l) => l.id === itemId)
          ? prev
          : [
              ...prev,
              {
                id: itemId,
                name: order.items.find((i) => i.id === itemId)?.name ?? "",
                quantity: order.items.find((i) => i.id === itemId)?.quantity ?? 1,
                orderId: order.id,
                invoiceNumber: order.invoiceNumber,
                clientName: order.clientName,
              },
            ],
    );

    startTransition(async () => {
      const res = await toggleProductionItemDone(itemId, done);
      if (!res.ok) setError(res.error ?? "Could not update the item.");
    });
  }

  // ── Mark a whole order made / reopen ──────────────────────────────────────
  function onMarkOrder(order: ProductionOrder, done: boolean) {
    setError(null);
    const updated = recompute({
      ...order,
      items: order.items.map((i) => ({ ...i, done })),
    });
    setProduction((prev) => {
      const without = prev.filter((o) => o.id !== order.id);
      return done ? without : sortByCreated([...without, updated]);
    });
    setProcessed((prev) => {
      const without = prev.filter((o) => o.id !== order.id);
      return done ? sortByCreated([...without, updated]) : without;
    });
    setLineItems((prev) =>
      done
        ? prev.filter((l) => l.orderId !== order.id)
        : (() => {
            const others = prev.filter((l) => l.orderId !== order.id);
            const re = order.items.map((i) => ({
              id: i.id,
              name: i.name,
              quantity: i.quantity,
              orderId: order.id,
              invoiceNumber: order.invoiceNumber,
              clientName: order.clientName,
            }));
            return [...others, ...re];
          })(),
    );
    startTransition(async () => {
      const res = await setOrderProductionDone(order.id, done);
      if (!res.ok) setError(res.error ?? "Could not update the order.");
    });
  }

  // ── Drag-to-sort the line queue (native HTML5 DnD) ────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);

  function onDragOverRow(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setLineItems((prev) => {
      const from = prev.findIndex((l) => l.id === dragId);
      const to = prev.findIndex((l) => l.id === targetId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function onDropPersist() {
    const ids = lineItems.map((l) => l.id);
    setDragId(null);
    startTransition(async () => {
      const res = await reorderProductionLineItems(ids);
      if (!res.ok) setError(res.error ?? "Could not save the new order.");
    });
  }

  return (
    <div>
      {error ? (
        <div
          className="mb-4 rounded-lg px-3 py-2 text-sm font-semibold text-white"
          style={{ background: "#be123c" }}
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <Tabs defaultValue="production" className="gap-4">
        <div className="flex items-center justify-between gap-3">
          <TabsList variant="line" className="h-auto">
            <TabsTrigger value="production" className="px-3 py-2 text-sm">
              Production
              <Count n={production.length} />
            </TabsTrigger>
            <TabsTrigger value="lines" className="px-3 py-2 text-sm">
              Line items
              <Count n={lineItems.length} />
            </TabsTrigger>
            <TabsTrigger value="processed" className="px-3 py-2 text-sm">
              Processed
              <Count n={processed.length} muted />
            </TabsTrigger>
          </TabsList>
          {pending ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/50">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </span>
          ) : null}
        </div>

        {/* ── Production tab — order cards with drawer-down ──────────────── */}
        <TabsContent value="production">
          {production.length === 0 ? (
            <Empty label="No orders in production. Paid orders appear here automatically." />
          ) : (
            <ul className="flex flex-col gap-3">
              {production.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  open={expanded.has(order.id)}
                  onToggleOpen={() => toggleExpand(order.id)}
                  onToggleItem={(itemId, done) => onToggleItem(order, itemId, done)}
                  onMarkAll={() => onMarkOrder(order, true)}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        {/* ── Line-items tab — flat sortable queue ──────────────────────── */}
        <TabsContent value="lines">
          {lineItems.length === 0 ? (
            <Empty label="No unmade line items. Everything is made." />
          ) : (
            <>
              <p className="mb-3 text-xs font-medium text-foreground/50">
                Drag rows to set your production order — saved automatically.
              </p>
              <ul className="flex flex-col gap-2">
                {lineItems.map((line) => (
                  <li
                    key={line.id}
                    draggable
                    onDragStart={() => setDragId(line.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      onDragOverRow(line.id);
                    }}
                    onDragEnd={onDropPersist}
                    className="flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5 transition-shadow hover:shadow-sm"
                    style={{
                      borderColor: "rgba(11,16,32,0.10)",
                      opacity: dragId === line.id ? 0.5 : 1,
                      cursor: "grab",
                    }}
                  >
                    <GripVertical
                      className="h-4 w-4 shrink-0 text-foreground/30"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={{ color: INK }}>
                        {line.name}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-foreground/55">
                        <span className="inline-flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          {line.invoiceNumber}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {line.clientName}
                        </span>
                        <span className="font-medium tabular-nums">×{line.quantity}</span>
                      </p>
                    </div>
                    <TickButton
                      done={false}
                      label={`Mark ${line.name} made`}
                      onClick={() => {
                        const order =
                          production.find((o) => o.id === line.orderId);
                        if (order) onToggleItem(order, line.id, true);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </TabsContent>

        {/* ── Processed tab — completed orders ──────────────────────────── */}
        <TabsContent value="processed">
          {processed.length === 0 ? (
            <Empty label="Nothing processed yet. Orders land here once every item is made." />
          ) : (
            <ul className="flex flex-col gap-3">
              {processed.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  processed
                  open={expanded.has(order.id)}
                  onToggleOpen={() => toggleExpand(order.id)}
                  onToggleItem={(itemId, done) => onToggleItem(order, itemId, done)}
                  onReopen={() => onMarkOrder(order, false)}
                />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Order card with expandable drawer ─────────────────────────────────────────
function OrderCard({
  order,
  open,
  processed = false,
  onToggleOpen,
  onToggleItem,
  onMarkAll,
  onReopen,
}: {
  order: ProductionOrder;
  open: boolean;
  processed?: boolean;
  onToggleOpen: () => void;
  onToggleItem: (itemId: string, done: boolean) => void;
  onMarkAll?: () => void;
  onReopen?: () => void;
}) {
  return (
    <li
      className="overflow-hidden rounded-2xl border bg-white"
      style={{ borderColor: processed ? "rgba(31,163,0,0.35)" : "rgba(11,16,32,0.10)" }}
    >
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[rgba(24,119,242,0.04)]"
        style={{ minHeight: 56 }}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          style={{
            background: processed ? "rgba(31,163,0,0.12)" : "rgba(24,119,242,0.10)",
            color: processed ? GREEN : "#0A4FB3",
          }}
        >
          {processed ? (
            <PackageCheck className="h-5 w-5" />
          ) : (
            <Hash className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold" style={{ color: INK }}>
            {order.clientName}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-xs text-foreground/55">
            <span className="font-semibold">{order.invoiceNumber}</span>
            <span aria-hidden>·</span>
            <span>
              {order.totalCount} item{order.totalCount === 1 ? "" : "s"}
            </span>
          </span>
        </span>
        <ProgressPill done={order.doneCount} total={order.totalCount} />
        <ChevronDown
          className="h-5 w-5 shrink-0 text-foreground/40 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          className="border-t px-4 py-3"
          style={{ borderColor: "rgba(11,16,32,0.08)" }}
        >
          <ul className="flex flex-col gap-1.5">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5"
                style={{ background: item.done ? "rgba(31,163,0,0.06)" : "transparent" }}
              >
                <TickButton
                  done={item.done}
                  label={`${item.done ? "Unmark" : "Mark"} ${item.name} made`}
                  onClick={() => onToggleItem(item.id, !item.done)}
                />
                <span
                  className="min-w-0 flex-1 text-sm"
                  style={{
                    color: item.done ? "rgba(11,16,32,0.45)" : INK,
                    textDecoration: item.done ? "line-through" : "none",
                  }}
                >
                  {item.name}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground/50">
                  ×{item.quantity}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-end">
            {processed ? (
              <button
                type="button"
                onClick={onReopen}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors hover:bg-[rgba(11,16,32,0.04)]"
                style={{ borderColor: "rgba(11,16,32,0.15)", color: INK, minHeight: 40 }}
              >
                Reopen for production
              </button>
            ) : (
              <button
                type="button"
                onClick={onMarkAll}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90"
                style={{ background: GREEN, minHeight: 40 }}
              >
                <CircleCheckBig className="h-4 w-4" />
                Mark all made
              </button>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

// ── Round tick button ─────────────────────────────────────────────────────────
function TickButton({
  done,
  label,
  onClick,
}: {
  done: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      style={
        done
          ? { background: GREEN, borderColor: GREEN, color: "#fff" }
          : { background: "#fff", borderColor: "rgba(11,16,32,0.25)", color: "transparent" }
      }
    >
      <Check className="h-4 w-4" strokeWidth={3} />
    </button>
  );
}

function Count({ n, muted = false }: { n: number; muted?: boolean }) {
  return (
    <span
      className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums"
      style={
        muted
          ? { background: "rgba(31,163,0,0.12)", color: GREEN }
          : { background: "rgba(24,119,242,0.12)", color: "#0A4FB3" }
      }
    >
      {n}
    </span>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div
      className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-foreground/50"
      style={{ borderColor: "rgba(11,16,32,0.15)" }}
    >
      {label}
    </div>
  );
}

function sortByCreated(list: ProductionOrder[]): ProductionOrder[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
