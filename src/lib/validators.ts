import { z } from "zod";

export const categorySchema = z.object({
  name: z
    .string()
    .min(1, "Category name is required")
    .max(50, "Category name too long (max 50 chars)"),
});

export const productVariantSchema = z.object({
  size: z.enum(["S", "M", "L"]),
  price: z
    .string()
    .regex(
      /^\d+(\.\d{1,2})?$/,
      "Price must be a valid number with up to 2 decimal places"
    ),
  widthCm: z.string().optional().default(""),
  heightCm: z.string().optional().default(""),
  depthCm: z.string().optional().default(""),
});

export type ProductVariantInput = z.infer<typeof productVariantSchema>;

export const productSchema = z.object({
  name: z
    .string()
    .min(1, "Product name is required")
    .max(100, "Product name too long (max 100 chars)"),
  description: z.string().min(1, "Description is required"),
  // Relative /uploads/... URLs written by our own server action. Not absolute
  // URLs from an arbitrary origin — so we validate shape, not z.string().url().
  images: z
    .array(
      z
        .string()
        .min(1)
        .regex(/^\/uploads\/products\//, "Image URL must be a local upload path")
    )
    .max(5, "Maximum 5 images allowed"),
  materialType: z.string().optional().default(""),
  estimatedProductionDays: z.coerce
    .number()
    .int("Production days must be a whole number")
    .positive("Production days must be positive")
    .optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  categoryId: z.string().uuid().optional().nullable(),
  variants: z
    .array(productVariantSchema)
    .min(1, "At least one size variant is required"),
});

export type ProductInput = z.infer<typeof productSchema>;
