"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Pencil, Archive, RotateCcw } from "lucide-react";
import {
  archiveColour,
  reactivateColour,
} from "@/actions/admin-colours";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Row = { id: string; name: string; isActive: boolean };

/**
 * Row actions dropdown for /admin/colours table.
 * Edit / Archive / Reactivate. Hard-delete (with IN_USE guard) lands in
 * Plan 18-04 alongside cascade-rename infrastructure.
 *
 * Base UI 1.3 quirk per CLAUDE.md commit 51a90c9:
 *   DropdownMenuLabel MUST be wrapped in DropdownMenuGroup. Without the
 *   wrapper, MenuGroupRootContext assertion fires at render.
 */
export function ColourRowActions({ row }: { row: Row }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="inline-flex items-center justify-end gap-2">
      {error ? (
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
          {/* Delete — added in Plan 18-04 alongside cascade-rename + IN_USE guard */}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
