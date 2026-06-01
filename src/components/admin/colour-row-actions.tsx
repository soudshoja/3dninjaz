"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MoreHorizontal,
  Pencil,
  Archive,
  RotateCcw,
  Trash2,
  ExternalLink,
  Heart,
} from "lucide-react";
import {
  archiveColour,
  reactivateColour,
  deleteColour,
  toggleMyColour,
} from "@/actions/admin-colours";
import { BRAND } from "@/lib/brand";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Row = { id: string; name: string; isActive: boolean; isMyColour: boolean };

type InUseProduct = { id: string; name: string; slug: string };

/**
 * Row actions dropdown for /admin/colours table.
 * Edit / Archive / Reactivate / Delete (Plan 18-04).
 *
 * Delete flow:
 *   - Click "Delete…" → opens two-step confirm modal.
 *   - Confirm → calls deleteColour(id).
 *   - If response code === "IN_USE", modal swaps to error mode showing
 *     affected products + "Archive instead" recovery CTA per UI-SPEC §Surface 2.
 *
 * Base UI 1.3 quirk per CLAUDE.md commit 51a90c9:
 *   DropdownMenuLabel MUST be wrapped in DropdownMenuGroup. Without the
 *   wrapper, MenuGroupRootContext assertion fires at render.
 */
export function ColourRowActions({ row }: { row: Row }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [inUseProducts, setInUseProducts] = useState<InUseProduct[] | null>(
    null,
  );
  const [isMyColour, setIsMyColour] = useState(row.isMyColour);

  const onToggleActive = () => {
    setError(null);
    startTransition(async () => {
      const res = row.isActive
        ? await archiveColour(row.id)
        : await reactivateColour(row.id);
      if (res.ok) {
        router.refresh();
      } else if ("error" in res) {
        setError(res.error);
      }
    });
  };

  const onDelete = () => {
    setError(null);
    setInUseProducts(null);
    startTransition(async () => {
      const res = await deleteColour(row.id);
      if (res.ok) {
        setShowDeleteConfirm(false);
        router.refresh();
      } else if ("code" in res && res.code === "IN_USE") {
        setInUseProducts(res.products);
        setError(res.error);
      } else if ("error" in res) {
        setError(res.error);
      }
    });
  };

  const onToggleMyColour = () => {
    setError(null);
    startTransition(async () => {
      const res = await toggleMyColour(row.id);
      if (res.ok) {
        setIsMyColour(!isMyColour);
        router.refresh();
      } else if ("error" in res) {
        setError(res.error);
      }
    });
  };

  const onArchiveInstead = () => {
    setError(null);
    startTransition(async () => {
      const res = await archiveColour(row.id);
      if (res.ok) {
        setShowDeleteConfirm(false);
        setInUseProducts(null);
        router.refresh();
      } else if ("error" in res) {
        setError(res.error);
      }
    });
  };

  const closeDeleteModal = () => {
    setShowDeleteConfirm(false);
    setInUseProducts(null);
    setError(null);
  };

  return (
    <div className="inline-flex items-center justify-end gap-2">
      {error && !showDeleteConfirm ? (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex items-center justify-center rounded-full w-10 h-10 hover:bg-slate-100 disabled:opacity-50"
          aria-label={`Actions for ${row.name}`}
          disabled={pending}
        >
          <MoreHorizontal className="w-5 h-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Base UI 1.3 quirk per CLAUDE.md — DropdownMenuLabel MUST be inside DropdownMenuGroup */}
          <DropdownMenuGroup>
            <DropdownMenuLabel>{row.name}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={<Link href={`/admin/colours/${row.id}/edit`} />}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleActive} disabled={pending}>
            {row.isActive ? (
              <>
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </>
            ) : (
              <>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reactivate
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onToggleMyColour} disabled={pending}>
            {isMyColour ? (
              <>
                <Heart className="mr-2 h-4 w-4" />
                Remove from My Colours
              </>
            ) : (
              <>
                <Heart className="mr-2 h-4 w-4" />
                Add to My Colours
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              setShowDeleteConfirm(true);
            }}
            disabled={pending}
            className="text-red-700"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showDeleteConfirm ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6"
            style={{ color: BRAND.ink }}
          >
            {inUseProducts && inUseProducts.length > 0 ? (
              <>
                <h2
                  className="font-[var(--font-heading)] text-xl mb-2"
                  style={{ color: "#991B1B" }}
                >
                  ⚠ Cannot delete — in use
                </h2>
                <p className="text-sm text-slate-700 mb-3">
                  This colour is used by {inUseProducts.length} product
                  {inUseProducts.length === 1 ? "" : "s"}:
                </p>
                <ul
                  className="mb-4 space-y-2 rounded-xl px-3 py-2 text-sm"
                  style={{ backgroundColor: "#FEE2E2" }}
                >
                  {inUseProducts.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold">{p.name}</span>
                      <Link
                        href={`/admin/products/${p.id}/edit`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs underline"
                        style={{ color: "#991B1B" }}
                      >
                        Open <ExternalLink className="w-3 h-3" />
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-slate-600 mb-4">
                  Archive instead? Archived colours stay on existing products
                  but disappear from the picker.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    disabled={pending}
                    className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
                    style={{
                      borderColor: `${BRAND.ink}33`,
                      color: BRAND.ink,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onArchiveInstead}
                    disabled={pending}
                    className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
                    style={{ backgroundColor: BRAND.ink }}
                  >
                    {pending ? "Archiving…" : "Archive instead"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-[var(--font-heading)] text-xl mb-2">
                  Delete {row.name} permanently?
                </h2>
                <p className="text-sm text-slate-600 mb-4">
                  This cannot be undone. If this colour is in use on any
                  product, deletion will be blocked and you&apos;ll see the
                  affected products.
                </p>
                {error ? (
                  <p
                    role="alert"
                    className="rounded-xl px-3 py-2 text-sm mb-3"
                    style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
                  >
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeDeleteModal}
                    disabled={pending}
                    className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
                    style={{
                      borderColor: `${BRAND.ink}33`,
                      color: BRAND.ink,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={pending}
                    className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
                    style={{ backgroundColor: "#EF4444" }}
                  >
                    {pending ? "Deleting…" : "Delete colour"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
