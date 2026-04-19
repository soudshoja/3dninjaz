"use server";

import { db } from "@/lib/db";
import { categories, products } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { categorySchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

export type CategoryActionResult =
  | { success: true }
  | { error: Record<string, string[] | undefined> | string };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function createCategory(
  formData: FormData
): Promise<CategoryActionResult> {
  await requireAdmin();

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const name = parsed.data.name.trim();
  const slug = slugify(name) || `category-${Date.now().toString(36)}`;

  try {
    await db.insert(categories).values({ name, slug });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Duplicate") || msg.includes("unique")) {
      return { error: { name: ["Category already exists"] } };
    }
    throw e;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  return { success: true };
}

export async function getCategories() {
  return db.select().from(categories).orderBy(categories.name);
}

export async function getCategoriesWithCounts() {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      createdAt: categories.createdAt,
      productCount: sql<number>`COUNT(${products.id})`.mapWith(Number),
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .groupBy(categories.id, categories.name, categories.slug, categories.createdAt)
    .orderBy(categories.name);
  return rows;
}

export async function deleteCategory(
  id: string
): Promise<CategoryActionResult> {
  await requireAdmin();

  // Defensive: if products still reference this category, null them out first
  // so the FK doesn't block deletion. Admin already confirmed from the UI.
  await db
    .update(products)
    .set({ categoryId: null })
    .where(eq(products.categoryId, id));

  await db.delete(categories).where(eq(categories.id, id));

  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  return { success: true };
}
