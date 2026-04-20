import { z } from "zod";

// Phase 8 (08-01) — slug is optional on input; action layer derives from
// name when omitted. When present, it is re-slugified defensively before
// persisting so admins can paste a friendly string and still get a safe
// URL-safe slug in the DB.
export const categorySchema = z.object({
  name: z
    .string()
    .min(1, "Category name is required")
    .max(100, "Category name too long (max 100 chars)"),
  slug: z
    .string()
    .max(120, "Slug too long (max 120 chars)")
    .optional(),
});

export const subcategorySchema = z.object({
  categoryId: z
    .string()
    .uuid("Invalid parent category"),
  name: z
    .string()
    .min(1, "Subcategory name is required")
    .max(120, "Subcategory name too long (max 120 chars)"),
  slug: z
    .string()
    .max(120, "Slug too long (max 120 chars)")
    .optional(),
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
    .max(10, "Maximum 10 images allowed"),
  // Index into images[] used as the storefront card thumbnail. Negative or
  // out-of-range values are coerced to 0 in the action layer when persisting.
  thumbnailIndex: z.coerce
    .number()
    .int()
    .min(0)
    .max(9)
    .optional()
    .default(0),
  materialType: z.string().optional().default(""),
  estimatedProductionDays: z.coerce
    .number()
    .int("Production days must be a whole number")
    .positive("Production days must be positive")
    .optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  categoryId: z.string().uuid().optional().nullable(),
  // Phase 8 (08-01) — products now pick a subcategory (which implies a
  // parent category). Nullable to keep backward compatibility while older
  // rows are backfilled; the storefront treats null-subcategory products
  // as "uncategorized" until admin edits them.
  subcategoryId: z.string().uuid().optional().nullable(),
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

// ============================================================================
// Phase 7 (07-03) — manual order creation schema
// Admin books a one-off custom order from /admin/orders/new. Image URLs are
// internal /uploads/... paths; external URLs rejected (T-07-03-money via
// upload pipeline).
// ============================================================================

export const manualOrderSchema = z.object({
  customerName: z.string().min(1, "Customer name is required").max(200),
  customerEmail: z
    .string()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("")),
  customerPhone: z.string().min(7).max(32),
  itemName: z.string().min(1, "Item name is required").max(200),
  itemDescription: z.string().max(2000).optional().or(z.literal("")),
  amount: z.coerce
    .number()
    .positive("Amount must be greater than 0")
    .max(99_999_999.99, "Amount exceeds the per-order maximum"),
  images: z
    .array(
      z
        .string()
        .min(1)
        .regex(
          /^\/uploads\/products\//,
          "Image URL must be a local upload path",
        ),
    )
    .max(6)
    .default([]),
  shipping: orderAddressSchema,
});
export type ManualOrderInput = z.input<typeof manualOrderSchema>;
export type ManualOrderOutput = z.output<typeof manualOrderSchema>;

// ============================================================================
// Phase 6: Customer Account (06-01)
// All schemas below are consumed by customer-side server actions and forms.
// ============================================================================

/**
 * Saved address book entry — `/account/addresses` CRUD form.
 * Country locked to Malaysia (v1 ships MY-only). State enforced via the
 * shared MALAYSIAN_STATES tuple so the dropdown + DB row stay in sync.
 */
export const addressBookSchema = z.object({
  fullName: z.string().min(2, "Full name is required").max(200),
  phone: z.string().regex(MY_PHONE, "Enter a Malaysian phone number"),
  line1: z.string().min(3, "Street address is required").max(200),
  line2: z.string().max(200).optional().nullable(),
  city: z.string().min(2, "City is required").max(100),
  state: z.enum(MALAYSIAN_STATES, {
    errorMap: () => ({ message: "Select a state" }),
  }),
  postcode: z.string().regex(/^\d{5}$/, "Postcode must be 5 digits"),
  country: z.literal("Malaysia").default("Malaysia"),
  isDefault: z.boolean().default(false),
});
export type AddressBookInput = z.infer<typeof addressBookSchema>;

/**
 * Wishlist add/toggle — heart button on PDP and product card.
 */
export const wishlistAddSchema = z.object({
  productId: z.string().uuid("Invalid product id"),
});
export type WishlistAddInput = z.infer<typeof wishlistAddSchema>;

/**
 * Cancel/return request — `/orders/[id]` Cancel and Return buttons (CUST-07).
 * Reason 10–1000 chars to ensure customers actually explain themselves while
 * preventing essay-length submissions.
 */
export const orderRequestTypeEnum = z.enum(["cancel", "return"]);
export type OrderRequestType = z.infer<typeof orderRequestTypeEnum>;

export const orderRequestSchema = z.object({
  orderId: z.string().uuid(),
  type: orderRequestTypeEnum,
  reason: z
    .string()
    .min(10, "Please provide at least 10 characters of context")
    .max(1000, "Reason too long (max 1000 chars)"),
});
export type OrderRequestInput = z.infer<typeof orderRequestSchema>;

/**
 * Account closure consent gate — typed-literal check (T-06-01-PDPA).
 * Prevents accidental deletes via JS coercion or stray clicks.
 */
export const accountCloseSchema = z.object({
  confirmText: z.literal("DELETE", {
    errorMap: () => ({ message: "Type DELETE to confirm" }),
  }),
});
export type AccountCloseInput = z.infer<typeof accountCloseSchema>;

/**
 * Profile (display name) update — `/account` ProfileForm.
 * Email change is a separate flow that lives in changeEmailSchema below.
 */
export const profileUpdateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/**
 * Email change — Better Auth's changeEmail expects current password.
 * The new email is verified via a link sent to the new address; the swap
 * happens only after the link is clicked.
 */
export const changeEmailSchema = z.object({
  newEmail: z.string().email("Enter a valid email"),
  currentPassword: z.string().min(1, "Enter your current password"),
});
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

/**
 * Password change — Better Auth's changePassword challenges currentPassword
 * server-side. We additionally enforce that the new password differs from
 * the current one to discourage no-op changes.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "New password must differ from current",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Review submission — `/orders/[id]` per-item ReviewSubmitForm (CUST-05).
 * Server-side buyer-gate (EXISTS subquery) enforces "must have purchased the
 * product" — see src/actions/reviews.ts.
 *
 * Phase 5 05-01 may also export a reviewSubmitSchema; keep this definition
 * stable so downstream consumers can import from either side without drift.
 */
export const reviewSubmitSchema = z.object({
  productId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  body: z
    .string()
    .min(10, "Review must be at least 10 characters")
    .max(2000, "Review too long (max 2000 chars)"),
});
export type ReviewSubmitInput = z.infer<typeof reviewSubmitSchema>;

// ============================================================================
// Phase 5: Admin Extensions (05-01)
// Schemas backing the admin coupons / inventory / settings / shipping /
// email templates / reviews / bulk-import surfaces. Every consumer is
// gated by requireAdmin() at the server-action boundary.
// ============================================================================

/**
 * Coupon discount type. Percentage is 0..100; fixed is MYR.
 */
export const couponTypeEnum = z.enum(["percentage", "fixed"]);
export type CouponType = z.infer<typeof couponTypeEnum>;

/**
 * Admin coupon create/edit. The `code` field is uppercase alnum + `_`/`-`
 * (3..32 chars) so it is safe in URLs, easy to type, and easy to share.
 *
 * superRefine guards (T-05-01-tampering):
 *   - percentage type cannot exceed 100
 *   - endsAt must be strictly after startsAt when both are set
 *
 * The Zod regex on amount keeps the value to 2 decimals (T-05-03-MYR-math).
 */
export const couponSchema = z
  .object({
    code: z
      .string()
      .regex(
        /^[A-Z0-9_-]{3,32}$/,
        "Code: 3-32 chars, A-Z, 0-9, underscore, dash",
      ),
    type: couponTypeEnum,
    amount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Amount: decimal with up to 2 places"),
    minSpend: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .optional()
      .nullable(),
    startsAt: z.string().datetime().optional().nullable(),
    endsAt: z.string().datetime().optional().nullable(),
    usageCap: z.coerce.number().int().positive().optional().nullable(),
    active: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.type === "percentage" && parseFloat(val.amount) > 100) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Percentage cannot exceed 100",
      });
    }
    if (
      val.startsAt &&
      val.endsAt &&
      new Date(val.endsAt) <= new Date(val.startsAt)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End date must be after start date",
      });
    }
  });
export type CouponInput = z.infer<typeof couponSchema>;

/**
 * Customer-side coupon redemption — only the code is supplied; the server
 * re-fetches the coupon row and re-derives the discount (T-05-03-tampering).
 */
export const couponRedemptionInputSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[A-Z0-9_-]+$/, "Invalid code"),
});
export type CouponRedemptionInput = z.infer<typeof couponRedemptionInputSchema>;

/**
 * Review moderation status — admin queue can move pending → approved → hidden.
 * Storefront submission lives in `reviewSubmitSchema` (defined above by
 * Phase 6 06-01); this enum is the moderation-queue source of truth.
 */
export const reviewStatusEnum = z.enum(["pending", "approved", "hidden"]);
export type ReviewStatus = z.infer<typeof reviewStatusEnum>;

export const reviewModerationSchema = z.object({
  id: z.string().uuid(),
  status: reviewStatusEnum,
});
export type ReviewModerationInput = z.infer<typeof reviewModerationSchema>;

/**
 * Store settings singleton — `/admin/settings` form (SETTINGS-01).
 * Whatsapp number is digits only (E.164-ish without +) so wa.me links
 * concatenate cleanly. instagramUrl/tiktokUrl accept "#" or empty for
 * pre-launch placeholder values (Phase 4 D-05).
 */
export const storeSettingsSchema = z.object({
  businessName: z.string().min(1).max(200),
  contactEmail: z.string().email(),
  whatsappNumber: z
    .string()
    .regex(/^\d{7,15}$/, "Digits only, no +, e.g. 60123456789"),
  whatsappNumberDisplay: z.string().min(1).max(32),
  instagramUrl: z
    .string()
    .url()
    .or(z.literal("#"))
    .or(z.literal("")),
  tiktokUrl: z
    .string()
    .url()
    .or(z.literal("#"))
    .or(z.literal("")),
  bannerText: z.string().max(500).optional().nullable(),
  bannerEnabled: z.boolean().default(false),
  freeShipThreshold: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional()
    .nullable(),
  sstEnabled: z.boolean().default(false),
  sstRate: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default("6.00"),
});
export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;

/**
 * Per-state flat shipping rate — `/admin/shipping` form (SHIP-01).
 * State must be one of MALAYSIAN_STATES so the row aligns with the seed.
 */
export const shippingRateSchema = z.object({
  state: z.enum(MALAYSIAN_STATES),
  flatRate: z.string().regex(/^\d+(\.\d{1,2})?$/, "Rate: decimal with 2 places"),
});
export type ShippingRateInput = z.infer<typeof shippingRateSchema>;

/**
 * Email template editor (`/admin/email-templates/[key]/edit`). HTML is
 * capped at 100KB to prevent a DoS upload (T-05-01-HTML); DOMPurify is
 * applied separately in src/lib/email/sanitize.ts before persistence and
 * before render (defense-in-depth).
 */
export const emailTemplateKeyEnum = z.enum([
  "order_confirmation",
  "password_reset",
]);
export type EmailTemplateKey = z.infer<typeof emailTemplateKeyEnum>;

export const emailTemplateSchema = z.object({
  key: emailTemplateKeyEnum,
  subject: z.string().min(1).max(200),
  html: z.string().min(10).max(100_000),
});
export type EmailTemplateInput = z.infer<typeof emailTemplateSchema>;

/**
 * Per-variant inventory toggle — used by Wave 2 plan 05-04 admin actions.
 */
export const variantInventorySchema = z.object({
  variantId: z.string().uuid(),
  inStock: z.boolean(),
  lowStockThreshold: z.coerce
    .number()
    .int()
    .nonnegative()
    .optional()
    .nullable(),
});
export type VariantInventoryInput = z.infer<typeof variantInventorySchema>;

/**
 * Admin user suspend/unsuspend — `/admin/users` row action (ADM-07).
 * `userId` is intentionally `z.string().min(1)` rather than `.uuid()` because
 * Better Auth user IDs are not strict UUIDs in every adapter version.
 */
export const userSuspendSchema = z.object({
  userId: z.string().min(1),
  suspend: z.boolean(),
  reason: z.string().max(500).optional().nullable(),
});
export type UserSuspendInput = z.infer<typeof userSuspendSchema>;

/**
 * Single CSV import row — used by `/admin/products/import` preview pass
 * (ADM-14). At least one of price_s/price_m/price_l is required (a product
 * with no priced variant is unsellable). External image URLs are rejected
 * by the row normaliser, not here.
 */
export const bulkImportRowSchema = z
  .object({
    name: z.string().min(1).max(100),
    slug: z
      .string()
      .regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, digits, dash only")
      .max(220)
      .optional(),
    description: z.string().min(1),
    category_name: z.string().optional().nullable(),
    price_s: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .optional()
      .nullable(),
    price_m: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .optional()
      .nullable(),
    price_l: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .optional()
      .nullable(),
    material_type: z.string().optional().nullable(),
    estimated_production_days: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .nullable(),
  })
  .refine((r) => r.price_s || r.price_m || r.price_l, {
    message: "At least one of price_s / price_m / price_l is required",
  });
export type BulkImportRowInput = z.infer<typeof bulkImportRowSchema>;
