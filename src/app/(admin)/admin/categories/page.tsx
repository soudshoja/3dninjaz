import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { getCategoriesWithCounts } from "@/actions/categories";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategoryForm } from "./category-form";
import { CategoryRowActions } from "./category-row-actions";

export const metadata: Metadata = {
  title: "Categories | 3D Ninjaz Admin",
};

export default async function AdminCategoriesPage() {
  const list = await getCategoriesWithCounts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl text-[var(--color-brand-text-primary)]">
          Categories
        </h1>
        <p className="text-sm text-[var(--color-brand-text-muted)]">
          Organize your products with categories.
        </p>
      </div>

      <CategoryForm />

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--color-brand-border)] bg-white p-12 text-center">
          <FolderOpen className="h-10 w-10 text-[var(--color-brand-text-muted)]" />
          <h2 className="font-heading text-lg">No categories yet</h2>
          <p className="text-sm text-[var(--color-brand-text-muted)]">
            Use the form above to create your first category.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--color-brand-border)] bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="w-24 text-center">Products</TableHead>
                <TableHead className="w-16 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="text-[var(--color-brand-text-muted)]">
                    {cat.slug}
                  </TableCell>
                  <TableCell className="text-center">
                    {cat.productCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <CategoryRowActions
                      id={cat.id}
                      name={cat.name}
                      productCount={cat.productCount}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
