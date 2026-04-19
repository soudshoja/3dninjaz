"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Star, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import {
  deleteProduct,
  toggleProductActive,
  toggleProductFeatured,
} from "@/actions/products";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ProductRowActions({
  id,
  name,
  isActive,
  isFeatured,
}: {
  id: string;
  name: string;
  isActive: boolean;
  isFeatured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);

  function handleToggleActive() {
    startTransition(async () => {
      await toggleProductActive(id, !isActive);
      router.refresh();
    });
  }

  function handleToggleFeatured() {
    startTransition(async () => {
      await toggleProductFeatured(id, !isFeatured);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteProduct(id);
      setDeleteOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Actions for ${name}`}
              disabled={pending}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem render={<Link href={`/admin/products/${id}/edit`} />}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleToggleActive}>
            {isActive ? (
              <>
                <EyeOff className="mr-2 h-4 w-4" />
                Set Inactive
              </>
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Set Active
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleToggleFeatured}>
            <Star
              className={`mr-2 h-4 w-4 ${
                isFeatured ? "fill-yellow-400 text-yellow-500" : ""
              }`}
            />
            {isFeatured ? "Unfeature" : "Feature"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete product?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{name}&rdquo;? This will
              also remove all size variants. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
