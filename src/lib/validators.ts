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

// ============================================================================
// Phase 3: Order Address + Status (D3-05, D3-11, D3-12)
// ============================================================================

/**
 * 13 Malaysian states + 3 federal territories. v1 ships to Malaysia only;
 * the dropdown + the FK-free varchar in orders.shippingState both enforce
 * membership in this list.
 */
export const MALAYSIAN_STATES = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Perak",
  "Perlis",
  "Pulau Pinang",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
  "Kuala Lumpur",
  "Labuan",
  "Putrajaya",
] as const;
export type MalaysianState = (typeof MALAYSIAN_STATES)[number];

/**
 * Must match `orderStatusValues` in src/lib/db/schema.ts and the
 * `OrderStatus` union in src/lib/orders.ts. All three are the same six
 * strings; keep them in sync when adding a new status.
 */
export const orderStatusEnum = z.enum([
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);
export type OrderStatus = z.infer<typeof orderStatusEnum>;

/**
 * Malaysian phone regex. Accepts:
 *   - optional +60 or leading 0 prefix
 *   - 9-11 digit body split by spaces or dashes for copy-paste robustness
 *
 * Caller should strip non-digits before storing so search/compare is stable.
 */
const MY_PHONE = /^(\+?60|0)?[\s-]?\d{2,3}[\s-]?\d{3,4}[\s-]?\d{3,4}$/;

export const orderAddressSchema = z.object({
  recipientName: z.string().min(2, "Name is required").max(200),
  phone: z.string().regex(MY_PHONE, "Enter a Malaysian phone number"),
  addressLine1: z.string().min(3, "Street address is required").max(200),
  addressLine2: z.string().max(200).optional().default(""),
  city: z.string().min(2, "City is required").max(100),
  state: z.enum(MALAYSIAN_STATES, {
    errorMap: () => ({ message: "Select a state" }),
  }),
  postcode: z.string().regex(/^\d{5}$/, "Postcode must be 5 digits"),
  country: z.literal("Malaysia").default("Malaysia"),
});
export type OrderAddressInput = z.infer<typeof orderAddressSchema>;
