import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { getCategoriesWithSubcategories } from "@/actions/categories";
import { CategoryForm } from "./category-form";
import { CategoryTree } from "./category-tree";

export const metadata: Metadata = {
  title: "Admin · Categories",
  robots: { index: false, follow: false },
};

export default async function AdminCategoriesPage() {
  const tree = await getCategoriesWithSubcategories();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl text-[var(--color-brand-text-primary)]">
          Categories
        </h1>
        <p className="text-sm text-[var(--color-brand-text-muted)]">
          Organize products with a 2-level menu: categories contain
          subcategories, and products live in subcategories.
        </p>
      </div>

      <CategoryForm />

      {tree.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--color-brand-border)] bg-white p-12 text-center">
          <FolderOpen className="h-10 w-10 text-[var(--color-brand-text-muted)]" />
          <h2 className="font-heading text-lg">No categories yet</h2>
          <p className="text-sm text-[var(--color-brand-text-muted)]">
            Use the form above to create your first category.
          </p>
        </div>
      ) : (
        <CategoryTree tree={tree} />
      )}
    </div>
  );
}
