"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Package,
  Search,
  Star,
  Undo2,
  X,
} from "lucide-react";
import { undoBulkCost } from "@/actions/product-costs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductRowActions } from "@/app/(admin)/admin/products/product-row-actions";
import { InlineCostInput } from "@/components/admin/inline-cost-input";
import { BulkCostDialog, type BulkGroup } from "@/components/admin/bulk-cost-dialog";
import { computeMargin, formatPct, formatRm, optionKey } from "@/lib/product-cost-math";
import type { BulkCostChange, OptionCostRow, ProductCostRow } from "@/lib/product-cost-types";

const UNDO_SECONDS = 8;

type Overrides = Record<string, { cost: number | null }>;

/**
 * Products list with cost, margin, filters, coverage bar, inline cost edit,
 * row selection (shift-click ranges) and the bulk cost bar with undo.
 * Desktop shows a table, phones show cards with 44px touch targets.
 */
export function ProductsCostTable({
  rows,
  cardsOnly = false,
}: {
  rows: ProductCostRow[];
  /** Always render the touch-friendly card list (used by the phone cost screen). */
  cardsOnly?: boolean;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Overrides>({});
  // Just-saved option costs, by option key (a product's variants are its Select options).
  const [optionOverrides, setOptionOverrides] = useState<Record<string, number | null>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Phone UI: search, a Filters drawer, and a Select mode (checkboxes only when asked for).
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [missingOnly, setMissingOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClicked = useRef<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [undo, setUndo] = useState<{
    changes: BulkCostChange[];
    secondsLeft: number;
    message: string;
  } | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  // Server values with local (just saved) edits layered on top.
  const data = useMemo(
    () =>
      rows.map((r) => {
        const base = overrides[r.id] ? { ...r, cost: overrides[r.id].cost } : r;
        if (base.options.length === 0) return base;
        return {
          ...base,
          options: base.options.map((o) =>
            o.key in optionOverrides ? { ...o, cost: optionOverrides[o.key] } : o,
          ),
        };
      }),
    [rows, overrides, optionOverrides],
  );

  // A product is covered by its own cost, or when every one of its options has one.
  const hasCost = (r: ProductCostRow) =>
    r.cost !== null || (r.options.length > 0 && r.options.every((o) => o.cost !== null));
  const withCost = data.filter(hasCost).length;
  const coveragePct = data.length === 0 ? 0 : Math.round((withCost / data.length) * 100);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.categoryId && r.categoryName) map.set(r.categoryId, r.categoryName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const types = useMemo(() => [...new Set(rows.map((r) => r.productType))].sort(), [rows]);

  const visible = useMemo(
    () =>
      data.filter((r) => {
        if (missingOnly && hasCost(r)) return false;
        if (categoryFilter === "none" && r.categoryId !== null) return false;
        if (categoryFilter !== "all" && categoryFilter !== "none" && r.categoryId !== categoryFilter)
          return false;
        if (typeFilter !== "all" && r.productType !== typeFilter) return false;
        const q = query.trim().toLowerCase();
        if (q && !r.name.toLowerCase().includes(q)) return false;
        return true;
      }),
    [data, missingOnly, categoryFilter, typeFilter, query],
  );
  const visibleIds = useMemo(() => visible.map((r) => r.id), [visible]);

  // Drop selections that no longer exist (deleted product).
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(rows.flatMap((r) => [r.id, ...r.options.map((o) => o.key)]));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  // Undo countdown.
  useEffect(() => {
    if (!undo) return;
    if (undo.secondsLeft <= 0) {
      setUndo(null);
      return;
    }
    const t = setTimeout(
      () => setUndo((u) => (u ? { ...u, secondsLeft: u.secondsLeft - 1 } : u)),
      1000,
    );
    return () => clearTimeout(t);
  }, [undo]);

  const toggleRow = useCallback(
    (id: string, shift: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const anchor = lastClicked.current;
        if (shift && anchor && anchor !== id) {
          const a = visibleIds.indexOf(anchor);
          const b = visibleIds.indexOf(id);
          if (a !== -1 && b !== -1) {
            const [from, to] = a < b ? [a, b] : [b, a];
            // Range takes the state of the clicked row's new value.
            const makeSelected = !prev.has(id);
            for (let i = from; i <= to; i++) {
              if (makeSelected) next.add(visibleIds[i]);
              else next.delete(visibleIds[i]);
            }
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastClicked.current = id;
    },
    [visibleIds],
  );

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id));

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const selectedRows = useMemo(() => data.filter((r) => selected.has(r.id)), [data, selected]);
  // What the bulk dialog edits: each ticked product with ALL its options (variants) under
  // it, plus any option ticked on its own. An option shows the cost it uses today
  // (its own, else the product's).
  const bulkGroups = useMemo<BulkGroup[]>(
    () =>
      data.flatMap((p) => {
        const whole = selected.has(p.id);
        const opts = p.options.filter((o) => whole || selected.has(o.key));
        if (!whole && opts.length === 0) return [];
        return [
          {
            productId: p.id,
            name: p.name,
            product: whole
              ? { id: p.id, name: p.name, price: p.price, cost: p.cost, hasOwnCost: true, target: null }
              : null,
            options: opts.map((o) => ({
              id: o.key,
              name: o.label,
              price: o.price ?? p.price,
              cost: o.cost ?? p.cost,
              hasOwnCost: o.cost !== null,
              target: { productId: p.id, fieldId: o.fieldId, value: o.value },
            })),
          },
        ];
      }),
    [data, selected],
  );
  const selectedOptionCount = data.reduce(
    (n, p) => n + p.options.filter((o) => selected.has(o.key)).length,
    0,
  );
  const selectedCount = selectedRows.length + selectedOptionCount;

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onOptionSaved(key: string, cost: number | null) {
    setOptionOverrides((prev) => ({ ...prev, [key]: cost }));
  }

  function onSaved(id: string, cost: number | null) {
    setOverrides((prev) => ({ ...prev, [id]: { cost } }));
  }

  function focusNext(el: HTMLInputElement) {
    const all = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[data-cost-input]"),
    ).filter((i) => i.offsetParent !== null);
    const idx = all.indexOf(el);
    const next = idx >= 0 ? all[idx + 1] : undefined;
    if (next) next.focus();
    else el.blur();
  }

  function handleApplied(changes: BulkCostChange[], skipped: number) {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const c of changes) if (!c.option) next[c.id] = { cost: c.newCost };
      return next;
    });
    setOptionOverrides((prev) => {
      const next = { ...prev };
      for (const c of changes) {
        if (c.option) next[optionKey(c.id, c.option.fieldId, c.option.value)] = c.newCost;
      }
      return next;
    });
    setSelected(new Set());
    setUndoError(null);
    if (changes.length > 0) {
      setUndo({
        changes,
        secondsLeft: UNDO_SECONDS,
        message: `Updated ${changes.length} ${changes.length === 1 ? "item" : "items"}${
          skipped > 0 ? `, ${skipped} unchanged` : ""
        }.`,
      });
    }
    router.refresh();
  }

  async function handleUndo() {
    if (!undo) return;
    const res = await undoBulkCost({ changes: undo.changes });
    if (!res.ok) {
      setUndoError(res.error);
      setUndo(null);
      return;
    }
    setOverrides((prev) => {
      const next = { ...prev };
      for (const c of undo.changes) if (!c.option) next[c.id] = { cost: c.oldCost };
      return next;
    });
    setOptionOverrides((prev) => {
      const next = { ...prev };
      for (const c of undo.changes) {
        if (c.option) next[optionKey(c.id, c.option.fieldId, c.option.value)] = c.oldCost;
      }
      return next;
    });
    setUndo(null);
    router.refresh();
  }

  const clearFilters = missingOnly || categoryFilter !== "all" || typeFilter !== "all";

  /** Phone filter chip: same pill as the desktop "Missing cost" button, at thumb size. */
  const chip = (on: boolean) =>
    "h-11 rounded-full border px-4 text-base font-medium transition-colors " +
    (on
      ? "border-[var(--color-brand-ink)] bg-[var(--color-brand-ink)] text-white"
      : "border-[var(--color-brand-border)] bg-white text-[var(--color-brand-ink)]");

  /** "3 options" toggle shown under a product that has Select options. */
  const optionsToggle = (p: ProductCostRow) => {
    if (p.options.length === 0) return null;
    const own = p.options.filter((o) => o.cost !== null).length;
    const open = expanded.has(p.id);
    const Chevron = open ? ChevronDown : ChevronRight;
    return (
      <button
        type="button"
        onClick={() => toggleExpanded(p.id)}
        aria-expanded={open}
        className="inline-flex min-h-[44px] items-center gap-1 text-xs font-medium text-[var(--color-brand-blue)] hover:underline md:min-h-0"
      >
        <Chevron className="h-3.5 w-3.5" aria-hidden="true" />
        {p.options.length} {p.options.length === 1 ? "option" : "options"}
        {own > 0 ? `, ${own} with own cost` : ""}
      </button>
    );
  };

  /** What an option with no cost of its own falls back to (the amount shows in the input). */
  const fallbackText = (p: ProductCostRow, o: OptionCostRow) =>
    o.cost !== null ? "Own cost" : p.cost !== null ? "Uses product cost" : "No cost yet";

  const optionName = (p: ProductCostRow, o: OptionCostRow) =>
    new Set(p.options.map((x) => x.fieldId)).size > 1 ? `${o.fieldLabel}: ${o.label}` : o.label;

  return (
    <div className="space-y-4 pb-24">
      {/* Phone controls: search, To do / All, Filters, Select */}
      <div className={cardsOnly ? "space-y-3" : "space-y-3 md:hidden"}>
        <label className="relative block">
          <span className="sr-only">Search products</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-brand-text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products"
            autoComplete="off"
            className="h-12 w-full rounded-lg border border-[var(--color-brand-border)] bg-white pl-10 pr-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-blue)]/50"
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={missingOnly}
            onClick={() => setMissingOnly((v) => !v)}
            className={chip(missingOnly) + " tabular-nums"}
          >
            To do ({data.length - withCost})
          </button>
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((v) => !v)}
            className={chip(categoryFilter !== "all" || typeFilter !== "all")}
          >
            Filters
          </button>
          <button
            type="button"
            aria-pressed={selectMode}
            onClick={() => {
              setSelectMode((v) => !v);
              setSelected(new Set());
            }}
            className={chip(selectMode) + " ml-auto"}
          >
            {selectMode ? "Done" : "Select"}
          </button>
        </div>
        {filtersOpen && (
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="block text-sm text-[var(--color-brand-text-muted)]">Category</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-12 w-full rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-base"
              >
                <option value="all">All categories</option>
                <option value="none">Uncategorized</option>
                {categories.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-sm text-[var(--color-brand-text-muted)]">Type</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-12 w-full rounded-lg border border-[var(--color-brand-border)] bg-white px-3 text-base capitalize"
              >
                <option value="all">All types</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium tabular-nums">
              {withCost} of {data.length} have a cost
            </p>
            <Link
              href="/admin/products/costs-import"
              className="inline-flex min-h-[44px] items-center text-sm underline decoration-dotted"
            >
              Import from a file
            </Link>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={coveragePct}
            aria-label="Products with a cost"
          >
            <div
              className="h-full rounded-full bg-[var(--color-brand-green)] motion-safe:transition-[width] motion-safe:duration-200"
              style={{ width: `${coveragePct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Desktop controls */}
      <div className={cardsOnly ? "hidden" : "hidden space-y-4 md:block"}>
      {/* Coverage */}
      <div className="rounded-lg border border-[var(--color-brand-border)] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium tabular-nums">
            {withCost} of {data.length} {data.length === 1 ? "product has" : "products have"} a cost
          </p>
          <div className="flex flex-wrap gap-2">
            {cardsOnly ? (
              <Link
                href="/admin/products/costs"
                className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] px-3 text-sm font-medium hover:bg-muted md:h-9"
              >
                One product at a time
              </Link>
            ) : (
              <Link
                href="/admin/products/costs"
                className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] px-3 text-sm font-medium hover:bg-muted md:h-9"
              >
                Enter costs on your phone
              </Link>
            )}
            <Link
              href="/admin/products/costs-import"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[var(--color-brand-border)] px-3 text-sm font-medium hover:bg-muted md:h-9"
            >
              Import costs from a file
            </Link>
          </div>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={coveragePct}
          aria-label="Products with a cost"
        >
          <div
            className="h-full rounded-full bg-[var(--color-brand-green)] motion-safe:transition-[width] motion-safe:duration-200"
            style={{ width: `${coveragePct}%` }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => setMissingOnly((v) => !v)}
          aria-pressed={missingOnly}
          className={
            "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium md:h-9 " +
            (missingOnly
              ? "border-[var(--color-brand-ink)] bg-[var(--color-brand-ink)] text-white"
              : "border-[var(--color-brand-border)] bg-white hover:bg-muted")
          }
        >
          Missing cost ({data.length - withCost})
        </button>
        <div className="space-y-1">
          <label htmlFor="filter-category" className="block text-xs text-[var(--color-brand-text-muted)]">
            Category
          </label>
          <select
            id="filter-category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-11 rounded-md border border-[var(--color-brand-border)] bg-white px-3 text-sm md:h-9"
          >
            <option value="all">All categories</option>
            <option value="none">Uncategorized</option>
            {categories.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="filter-type" className="block text-xs text-[var(--color-brand-text-muted)]">
            Type
          </label>
          <select
            id="filter-type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-11 rounded-md border border-[var(--color-brand-border)] bg-white px-3 text-sm capitalize md:h-9"
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {clearFilters && (
          <button
            type="button"
            onClick={() => {
              setMissingOnly(false);
              setCategoryFilter("all");
              setTypeFilter("all");
            }}
            className="h-11 px-2 text-sm underline decoration-dotted md:h-9"
          >
            Clear filters
          </button>
        )}
        <p className="ml-auto text-sm tabular-nums text-[var(--color-brand-text-muted)]" aria-live="polite">
          Showing {visible.length} of {data.length}
        </p>
      </div>

      </div>

      {undoError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {undoError}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[var(--color-brand-border)] bg-white p-10 text-center">
          <Package className="h-8 w-8 text-[var(--color-brand-text-muted)]" aria-hidden="true" />
          <p className="font-medium">No products match these filters</p>
          <p className="text-sm text-[var(--color-brand-text-muted)]">
            {missingOnly && !clearFilters
              ? ""
              : "Clear the filters to see every product."}
          </p>
          <p className="text-sm text-[var(--color-brand-text-muted)] md:hidden">
            {query.trim() ? "Try a shorter search." : missingOnly && withCost === data.length ? "Every product has a cost." : ""}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div
            className={
              cardsOnly
                ? "hidden"
                : "hidden overflow-x-auto rounded-lg border border-[var(--color-brand-border)] bg-white md:block"
            }
          >
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label={
                        clearFilters
                          ? `Select all ${visible.length} matching products`
                          : "Select all products"
                      }
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected;
                      }}
                      onChange={toggleAllVisible}
                      className="h-4 w-4 accent-[var(--color-brand-blue)]"
                    />
                  </TableHead>
                  <TableHead className="w-14">Image</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-16 text-center">Featured</TableHead>
                  <TableHead className="w-16 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => {
                  const margin = computeMargin(p.price, p.cost);
                  const bad = p.cost !== null && p.price !== null && p.cost >= p.price;
                  return (
                    <Fragment key={p.id}>
                    <TableRow data-state={selected.has(p.id) ? "selected" : undefined}>
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.name}`}
                          checked={selected.has(p.id)}
                          onClick={(e) => {
                            // onChange does not expose shiftKey; handle on click.
                            e.stopPropagation();
                            toggleRow(p.id, e.shiftKey);
                          }}
                          onChange={() => {}}
                          className="h-4 w-4 accent-[var(--color-brand-blue)]"
                        />
                      </TableCell>
                      <TableCell>
                        {p.thumbUrl ? (
                          <Image
                            src={p.thumbUrl}
                            alt=""
                            width={48}
                            height={48}
                            className="h-12 w-12 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-100">
                            <Package className="h-5 w-5 text-gray-400" aria-hidden="true" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-[var(--color-brand-text-muted)]">
                          {p.categoryName ?? "Uncategorized"}
                        </p>
                        {optionsToggle(p) && <div>{optionsToggle(p)}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                          {p.productType}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">{p.priceLabel}</TableCell>
                      <TableCell className="text-right">
                        <InlineCostInput
                          productId={p.id}
                          value={p.cost}
                          label={`Cost for ${p.name}`}
                          onSaved={(c) => onSaved(p.id, c)}
                          onEnter={focusNext}
                        />
                      </TableCell>
                      <TableCell
                        className={
                          "text-right tabular-nums " + (bad ? "font-medium text-red-700" : "")
                        }
                        title={
                          p.productType === "keychain" ? "Margin of a 1-keycap keychain" : undefined
                        }
                      >
                        {margin === null ? (
                          <span className="text-[var(--color-brand-text-muted)]">-</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            {bad && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                            {formatPct(margin.pct)}
                            {bad && <span className="sr-only">cost is at or above price</span>}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.isActive ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Star
                          className={
                            p.isFeatured
                              ? "mx-auto h-4 w-4 fill-yellow-400 text-yellow-500"
                              : "mx-auto h-4 w-4 text-gray-300"
                          }
                          aria-label={p.isFeatured ? "Featured" : "Not featured"}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <ProductRowActions
                          id={p.id}
                          name={p.name}
                          isActive={p.isActive}
                          isFeatured={p.isFeatured}
                        />
                      </TableCell>
                    </TableRow>
                      {expanded.has(p.id) &&
                        p.options.map((o) => {
                          const optMargin = computeMargin(o.price ?? p.price, o.cost ?? p.cost);
                          return (
                            <TableRow
                              key={o.key}
                              className="bg-slate-50/70"
                              data-state={selected.has(o.key) ? "selected" : undefined}
                            >
                              <TableCell>
                                <input
                                  type="checkbox"
                                  aria-label={`Select option ${o.label} of ${p.name}`}
                                  checked={selected.has(o.key)}
                                  onChange={() => toggleRow(o.key, false)}
                                  className="h-4 w-4 accent-[var(--color-brand-blue)]"
                                />
                              </TableCell>
                              <TableCell />
                              <TableCell colSpan={2} className="pl-6 text-sm">
                                <span aria-hidden="true">↳ </span>
                                {optionName(p, o)}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {o.price !== null ? formatRm(o.price) : p.priceLabel}
                              </TableCell>
                              <TableCell className="text-right">
                                <InlineCostInput
                                  productId={p.id}
                                  option={{ fieldId: o.fieldId, value: o.value }}
                                  value={o.cost}
                                  placeholder={p.cost !== null ? p.cost.toFixed(2) : "0.00"}
                                  label={`Cost for ${o.label} of ${p.name}`}
                                  onSaved={(c) => onOptionSaved(o.key, c)}
                                  onEnter={focusNext}
                                />
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {optMargin === null ? (
                                  <span className="text-[var(--color-brand-text-muted)]">-</span>
                                ) : (
                                  formatPct(optMargin.pct)
                                )}
                              </TableCell>
                              <TableCell
                                colSpan={3}
                                className="whitespace-nowrap text-xs text-[var(--color-brand-text-muted)]"
                              >
                                {fallbackText(p, o)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Phone list: flat rows, big cost boxes, options always visible */}
          <div
            className={
              "overflow-hidden rounded-xl border border-[var(--color-brand-border)] bg-white" +
              (cardsOnly ? "" : " md:hidden")
            }
          >
            {selectMode && (
              <label className="flex min-h-[48px] items-center gap-3 border-b border-[var(--color-brand-border)] px-4 text-base font-medium">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allVisibleSelected && someVisibleSelected;
                  }}
                  onChange={toggleAllVisible}
                  className="h-6 w-6 accent-[var(--color-brand-blue)]"
                />
                {clearFilters || query.trim() ? `Select all ${visible.length} shown` : "Select all"}
              </label>
            )}
            <ul className="divide-y divide-[var(--color-brand-border)]">
              {visible.map((p) => {
                const margin = computeMargin(p.price, p.cost);
                const bad = p.cost !== null && p.price !== null && p.cost >= p.price;
                return (
                  <li key={p.id}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      {selectMode && (
                        <label className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center">
                          <input
                            type="checkbox"
                            aria-label={`Select ${p.name}`}
                            checked={selected.has(p.id)}
                            onChange={() => toggleRow(p.id, false)}
                            className="h-6 w-6 accent-[var(--color-brand-blue)]"
                          />
                        </label>
                      )}
                      {/* Tapping the name opens the product editor. Without this
                          link the phone list had no way in: Edit lived only in
                          the desktop table's actions menu. */}
                      <Link
                        href={`/admin/products/${p.id}/edit`}
                        aria-label={`Edit ${p.name}`}
                        className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-blue)]"
                      >
                        <span className="break-words text-base font-medium leading-snug text-[var(--color-brand-blue)]">
                          {p.name}
                        </span>
                        <span
                          className={
                            "text-sm tabular-nums " +
                            (bad ? "font-medium text-red-700" : "text-[var(--color-brand-text-muted)]")
                          }
                        >
                          {p.priceLabel}
                          {margin !== null
                            ? bad
                              ? " · Cost is at or above the price"
                              : ` · Margin ${formatPct(margin.pct)}`
                            : ""}
                        </span>
                      </Link>
                      <InlineCostInput
                        productId={p.id}
                        value={p.cost}
                        large
                        label={`Cost for ${p.name}`}
                        onSaved={(c) => onSaved(p.id, c)}
                        onEnter={focusNext}
                      />
                      {!selectMode && (
                        <ProductRowActions
                          id={p.id}
                          name={p.name}
                          isActive={p.isActive}
                          isFeatured={p.isFeatured}
                          large
                        />
                      )}
                    </div>
                    {p.options.length > 0 && (
                      <ul className="divide-y divide-[var(--color-brand-border)] border-t border-[var(--color-brand-border)] bg-gray-50">
                        {p.options.map((o) => (
                          <li key={o.key} className="flex items-center gap-3 py-2.5 pl-8 pr-4">
                            {selectMode && (
                              <label className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center">
                                <input
                                  type="checkbox"
                                  aria-label={`Select option ${o.label} of ${p.name}`}
                                  checked={selected.has(o.key)}
                                  onChange={() => toggleRow(o.key, false)}
                                  className="h-6 w-6 accent-[var(--color-brand-blue)]"
                                />
                              </label>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-base leading-snug">{optionName(p, o)}</p>
                              <p className="text-sm tabular-nums text-[var(--color-brand-text-muted)]">
                                {o.price !== null ? formatRm(o.price) : "Same price"} ·{" "}
                                {fallbackText(p, o)}
                              </p>
                            </div>
                            <InlineCostInput
                              productId={p.id}
                              option={{ fieldId: o.fieldId, value: o.value }}
                              value={o.cost}
                              large
                              placeholder={p.cost !== null ? p.cost.toFixed(2) : "0.00"}
                              label={`Cost for ${o.label} of ${p.name}`}
                              onSaved={(c) => onOptionSaved(o.key, c)}
                              onEnter={focusNext}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      {/* Selection bar */}
      {selectedCount > 0 && !undo && (
        <div
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-xl bg-[var(--color-brand-ink)] px-4 py-3 text-white shadow-lg"
          role="region"
          aria-label="Bulk actions"
        >
          <p className="text-sm font-medium tabular-nums">
            {selectedCount} selected
          </p>
          {selectedCount < visible.length && (
            <button
              type="button"
              onClick={() => setSelected(new Set(visibleIds))}
              className="min-h-[44px] text-sm underline decoration-dotted md:min-h-0"
            >
              Select all {visible.length} {clearFilters ? "matching" : ""}
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="h-12 gap-2 bg-white text-base text-[var(--color-brand-ink)] hover:bg-white/90 md:h-9 md:text-sm"
            >
              <ListChecks className="h-4 w-4" aria-hidden="true" />
              Edit cost
            </Button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10 md:h-9 md:w-9"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Undo bar */}
      {undo && (
        <div
          className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl items-center gap-3 rounded-xl bg-[var(--color-brand-ink)] px-4 py-3 text-white shadow-lg"
          role="status"
        >
          <p className="text-sm">{undo.message}</p>
          <Button
            type="button"
            onClick={handleUndo}
            className="ml-auto h-11 gap-2 bg-white text-[var(--color-brand-ink)] hover:bg-white/90 md:h-9"
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Undo ({undo.secondsLeft}s)
          </Button>
        </div>
      )}

      <BulkCostDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        groups={bulkGroups}
        onApplied={handleApplied}
      />
    </div>
  );
}
