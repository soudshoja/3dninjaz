import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Star, Plus, Package } from "lucide-react";
import { getProducts } from "@/actions/products";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductRowActions } from "./product-row-actions";

export const metadata: Metadata = {
  title: "Admin · Products",
  robots: { index: false, follow: false },
};

function formatPriceRange(
  variants: Array<{ price: string }>
): string {
  if (variants.length === 0) return "—";
  const prices = variants
    .map((v) => Number.parseFloat(v.price))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  if (prices.length === 0) return "—";
  const min = prices[0];
  const max = prices[prices.length - 1];
  if (min === max) return `MYR ${min.toFixed(2)}`;
  return `MYR ${min.toFixed(2)} – ${max.toFixed(2)}`;
}

export default async function AdminProductsPage() {
  const list = await getProducts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl text-[var(--color-brand-text-primary)]">
            Products
          </h1>
          <p className="text-sm text-[var(--color-brand-text-muted)]">
            Manage your 3D printed product catalog.
          </p>
        </div>
        <Link href="/admin/products/new">
          <Button className="h-10 gap-2 bg-[var(--color-brand-cta)] px-4 text-white hover:bg-[var(--color-brand-cta)]/90">
            <Plus className="h-4 w-4" />
            New Product
          </Button>
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--color-brand-border)] bg-white p-12 text-center">
          <Package className="h-10 w-10 text-[var(--color-brand-text-muted)]" />
          <h2 className="font-heading text-lg">No products yet</h2>
          <p className="text-sm text-[var(--color-brand-text-muted)]">
            Create your first 3D printed product to see it here.
          </p>
          <Link href="/admin/products/new">
            <Button className="mt-2 gap-2 bg-[var(--color-brand-cta)] text-white hover:bg-[var(--color-brand-cta)]/90">
              <Plus className="h-4 w-4" />
              Create a Product
            </Button>
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--color-brand-border)] bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price Range</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16 text-center">Featured</TableHead>
                <TableHead className="w-16 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((product) => {
                const firstImage = product.images?.[0];
                return (
                  <TableRow key={product.id}>
                    <TableCell>
                      {firstImage ? (
                        <Image
                          src={firstImage}
                          alt={product.name}
                          width={48}
                          height={48}
                          className="h-12 w-12 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded bg-gray-100">
                          <Package className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {product.name}
                    </TableCell>
                    <TableCell>
                      {product.category?.name ?? (
                        <span className="text-[var(--color-brand-text-muted)]">
                          Uncategorized
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{formatPriceRange(product.variants)}</TableCell>
                    <TableCell>
                      {product.isActive ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          Active
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Star
                        className={
                          product.isFeatured
                            ? "mx-auto h-4 w-4 fill-yellow-400 text-yellow-500"
                            : "mx-auto h-4 w-4 text-gray-300"
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <ProductRowActions
                        id={product.id}
                        name={product.name}
                        isActive={product.isActive}
                        isFeatured={product.isFeatured}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
