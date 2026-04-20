"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import {
  deleteCategory,
  deleteSubcategory,
  moveCategory,
  moveSubcategory,
  updateCategory,
  updateSubcategory,
  createSubcategory,
} from "@/actions/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Subcategory = {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  position: number;
  productCount: number;
};

type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  position: number;
  legacyProductCount: number;
  subcategories: Subcategory[];
};

/**
 * Admin category tree — shows each category row with its subcategories
 * nested beneath, expandable/collapsible. Up/Down buttons reorder; Pencil
 * opens an edit dialog; Trash opens a confirm dialog. "Add Subcategory"
 * row inside each expanded category appends a new child.
 *
 * Scope: v1 uses up/down buttons only — drag-drop was explicitly deferred
 * in the plan.
 */
export function CategoryTree({ tree }: { tree: CategoryNode[] }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    // Start with every category expanded so admins immediately see
    // subcategories. Collapsed state is per-session.
    const init: Record<string, boolean> = {};
    for (const c of tree) init[c.id] = true;
    return init;
  });

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-3">
      {tree.map((cat, idx) => (
        <CategoryRow
          key={cat.id}
          cat={cat}
          expanded={!!expanded[cat.id]}
          onToggle={() => toggle(cat.id)}
          isFirst={idx === 0}
          isLast={idx === tree.length - 1}
          router={router}
        />
      ))}
    </div>
  );
}

function CategoryRow({
  cat,
  expanded,
  onToggle,
  isFirst,
  isLast,
  router,
}: {
  cat: CategoryNode;
  expanded: boolean;
  onToggle: () => void;
  isFirst: boolean;
  isLast: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function onMove(direction: "up" | "down") {
    startTransition(async () => {
      await moveCategory(cat.id, direction);
      router.refresh();
    });
  }

  const totalProducts =
    cat.subcategories.reduce((n, s) => n + s.productCount, 0) +
    cat.legacyProductCount;

  return (
    <div className="rounded-lg border border-[var(--color-brand-border)] bg-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium">{cat.name}</span>
            <span className="text-xs text-[var(--color-brand-text-muted)]">
              /{cat.slug}
            </span>
          </div>
          <div className="text-xs text-[var(--color-brand-text-muted)]">
            {cat.subcategories.length} subcategor
            {cat.subcategories.length === 1 ? "y" : "ies"} · {totalProducts}{" "}
            product{totalProducts === 1 ? "" : "s"}
            {cat.legacyProductCount > 0 ? (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">
                {cat.legacyProductCount} need subcategory assignment
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onMove("up")}
            disabled={pending || isFirst}
            aria-label="Move up"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onMove("down")}
            disabled={pending || isLast}
            aria-label="Move down"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setEditOpen(true)}
            aria-label="Edit"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDeleteOpen(true)}
            aria-label="Delete"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-[var(--color-brand-border)] bg-[var(--color-brand-cream,#F7FAF4)] px-3 py-2 space-y-2">
          {cat.subcategories.length === 0 ? (
            <p className="text-sm text-[var(--color-brand-text-muted)] px-2">
              No subcategories yet.
            </p>
          ) : (
            cat.subcategories.map((sub, i) => (
              <SubcategoryRow
                key={sub.id}
                sub={sub}
                isFirst={i === 0}
                isLast={i === cat.subcategories.length - 1}
                router={router}
              />
            ))
          )}
          <AddSubcategoryInline categoryId={cat.id} router={router} />
        </div>
      ) : null}

      <EditCategoryDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        cat={cat}
        onSaved={() => router.refresh()}
      />

      <DeleteCategoryDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        cat={cat}
        totalProducts={totalProducts}
        onDeleted={() => router.refresh()}
      />
    </div>
  );
}

function SubcategoryRow({
  sub,
  isFirst,
  isLast,
  router,
}: {
  sub: Subcategory;
  isFirst: boolean;
  isLast: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function onMove(direction: "up" | "down") {
    startTransition(async () => {
      await moveSubcategory(sub.id, direction);
      router.refresh();
    });
  }

  function onDelete() {
    setDeleteError(null);
    startTransition(async () => {
      const res = await deleteSubcategory(sub.id);
      if ("error" in res) {
        setDeleteError(typeof res.error === "string" ? res.error : "Failed");
        return;
      }
      setDeleteOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--color-brand-border)] bg-white px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-medium">{sub.name}</span>
          <span className="text-xs text-[var(--color-brand-text-muted)]">
            /{sub.slug}
          </span>
        </div>
        <div className="text-xs text-[var(--color-brand-text-muted)]">
          {sub.productCount} product{sub.productCount === 1 ? "" : "s"}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onMove("up")}
          disabled={pending || isFirst}
          aria-label="Move up"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onMove("down")}
          disabled={pending || isLast}
          aria-label="Move down"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setEditOpen(true)}
          aria-label="Edit"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setDeleteOpen(true)}
          aria-label="Delete"
        >
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>

      <EditSubcategoryDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        sub={sub}
        onSaved={() => router.refresh()}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete subcategory?</DialogTitle>
            <DialogDescription>
              Remove &ldquo;{sub.name}&rdquo;?{" "}
              {sub.productCount > 0
                ? `${sub.productCount} product(s) are still assigned here — the delete will be blocked until you move them.`
                : "No products are assigned."}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className="text-sm text-red-500">{deleteError}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddSubcategoryInline({
  categoryId,
  router,
}: {
  categoryId: string;
  router: ReturnType<typeof useRouter>;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("categoryId", categoryId);
    fd.set("name", name);
    fd.set("slug", slug);

    startTransition(async () => {
      const res = await createSubcategory(fd);
      if ("error" in res) {
        const err = res.error;
        if (typeof err === "string") {
          setError(err);
        } else {
          const first = Object.values(err).find(
            (v): v is string[] => Array.isArray(v) && v.length > 0,
          );
          setError(first?.[0] ?? "Unable to create subcategory.");
        }
        return;
      }
      setName("");
      setSlug("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2 rounded-md border border-dashed border-[var(--color-brand-border)] bg-white px-3 py-2 md:flex-row md:items-end"
    >
      <div className="flex-1 space-y-1">
        <Label className="text-xs">New subcategory</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Planters"
          maxLength={120}
          required
          disabled={pending}
          className="h-9"
        />
      </div>
      <div className="flex-1 space-y-1">
        <Label className="text-xs">
          Slug{" "}
          <span className="text-[10px] text-[var(--color-brand-text-muted)]">
            (optional)
          </span>
        </Label>
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="e.g. planters"
          maxLength={120}
          disabled={pending}
          className="h-9"
        />
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={pending || !name.trim()}
        className="h-9 gap-2 bg-[var(--color-brand-cta)] text-white hover:bg-[var(--color-brand-cta)]/90"
      >
        <Plus className="h-4 w-4" />
        {pending ? "Adding..." : "Add"}
      </Button>
      {error ? (
        <p className="md:w-full text-sm text-red-500" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function EditCategoryDialog({
  open,
  onOpenChange,
  cat,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cat: CategoryNode;
  onSaved: () => void;
}) {
  const [name, setName] = useState(cat.name);
  const [slug, setSlug] = useState(cat.slug);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("slug", slug);

    startTransition(async () => {
      const res = await updateCategory(cat.id, fd);
      if ("error" in res) {
        const err = res.error;
        if (typeof err === "string") setError(err);
        else {
          const first = Object.values(err).find(
            (v): v is string[] => Array.isArray(v) && v.length > 0,
          );
          setError(first?.[0] ?? "Update failed");
        }
        return;
      }
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Edit category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1">
              <Label htmlFor="edit-cat-name">Name</Label>
              <Input
                id="edit-cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-cat-slug">Slug</Label>
              <Input
                id="edit-cat-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                maxLength={120}
                required
                disabled={pending}
              />
            </div>
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditSubcategoryDialog({
  open,
  onOpenChange,
  sub,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sub: Subcategory;
  onSaved: () => void;
}) {
  const [name, setName] = useState(sub.name);
  const [slug, setSlug] = useState(sub.slug);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("categoryId", sub.categoryId);
    fd.set("name", name);
    fd.set("slug", slug);

    startTransition(async () => {
      const res = await updateSubcategory(sub.id, fd);
      if ("error" in res) {
        const err = res.error;
        if (typeof err === "string") setError(err);
        else {
          const first = Object.values(err).find(
            (v): v is string[] => Array.isArray(v) && v.length > 0,
          );
          setError(first?.[0] ?? "Update failed");
        }
        return;
      }
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Edit subcategory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-1">
              <Label htmlFor="edit-sub-name">Name</Label>
              <Input
                id="edit-sub-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
                disabled={pending}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-sub-slug">Slug</Label>
              <Input
                id="edit-sub-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                maxLength={120}
                required
                disabled={pending}
              />
            </div>
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCategoryDialog({
  open,
  onOpenChange,
  cat,
  totalProducts,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cat: CategoryNode;
  totalProducts: number;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const hasProducts = totalProducts > 0;

  function onConfirm() {
    startTransition(async () => {
      await deleteCategory(cat.id);
      onOpenChange(false);
      onDeleted();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete category?</DialogTitle>
          <DialogDescription>
            Delete &ldquo;{cat.name}&rdquo;?{" "}
            {hasProducts
              ? `${totalProducts} product(s) are still linked and will lose their category. Subcategories will be removed.`
              : "This category has no products. Subcategories will be removed."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
