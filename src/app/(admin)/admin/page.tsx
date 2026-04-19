import type { Metadata } from "next";
import { count, eq } from "drizzle-orm";
import { Package, FolderOpen, Eye } from "lucide-react";
import { db } from "@/lib/db";
import { products, categories } from "@/lib/db/schema";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  const [productTotalRow] = await db.select({ c: count() }).from(products);
  const [productActiveRow] = await db
    .select({ c: count() })
    .from(products)
    .where(eq(products.isActive, true));
  const [categoryTotalRow] = await db.select({ c: count() }).from(categories);

  const stats = [
    {
      label: "Total Products",
      value: productTotalRow.c,
      icon: Package,
      color: "text-[var(--color-brand-primary)]",
    },
    {
      label: "Active Products",
      value: productActiveRow.c,
      icon: Eye,
      color: "text-[var(--color-brand-success)]",
    },
    {
      label: "Total Categories",
      value: categoryTotalRow.c,
      icon: FolderOpen,
      color: "text-[var(--color-brand-secondary)]",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl text-[var(--color-brand-text-primary)]">
          Dashboard
        </h1>
        <p className="text-sm text-[var(--color-brand-text-muted)]">
          Overview of your 3D Ninjaz store.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {s.label}
                </CardTitle>
                <Icon className={`h-5 w-5 ${s.color}`} />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">{s.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
