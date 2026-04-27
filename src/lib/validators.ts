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
  price: z
    .string()
    .regex(
      /^\d+(\.\d{1,2})?$/,
      "Price must be a valid number with up to 2 decimal places"
    ),
  // Phase 10 (10-01) — per-variant unit cost (MYR). Empty string = leave NULL
  // in the DB. Admin can fill retroactively from the product form; same
  // regex as price so both columns stay consistent.
  costPrice: z
    .string()
    .regex(
      /^\d+(\.\d{1,2})?$/,
      "Cost must be a valid number with up to 2 decimal places",
    )
    .optional()
    .or(z.literal(""))
    .default(""),
  // Phase 13 — optional per-variant stock tracking.
  // trackStock = false (default) → on-demand, always available, stock ignored.
  // trackStock = true           → check + decrement stock at checkout.
  trackStock: z.boolean().default(false),
  stock: z.coerce.number().int().min(0).default(0),
  // Phase 14 — cost breakdown fields. All optional / nullable.
  // When costPriceManual=true, costPrice is the authoritative total; the
  // breakdown fields are ignored in the compute helper.
  filamentGrams: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a positive decimal")
    .optional()
    .or(z.literal(""))
    .default(""),
  printTimeHours: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a positive decimal")
    .optional()
    .or(z.literal(""))
    .default(""),
  laborMinutes: z
    .string()
    .regex(/^\d+(\.\d{1})?$/, "Must be a positive decimal")
    .optional()
    .or(z.literal(""))
    .default(""),
  otherCostBreakdown: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a positive decimal")
    .optional()
    .or(z.literal(""))
    .default(""),
  filamentRateOverride: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a positive decimal")
    .optional()
    .or(z.literal(""))
    .default(""),
  laborRateOverride: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a positive decimal")
    .optional()
    .or(z.literal(""))
    .default(""),
  costPriceManual: z.boolean().default(false),
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
  // Phase 19 (19-03) — product type discriminator. Defaults to 'stocked' for
  // backwards compat with existing forms that don't send this field.
  productType: z
    .enum(["stocked", "configurable"])
    .default("stocked"),
  variants: z
    .array(productVariantSchema)
    .default([]),
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
// Shared URL-or-empty helper — accepts a full http(s) URL, `#` placeholder,
// or empty string. Empty = hide from storefront (SocialLinks filters).
const optionalUrl = z
  .string()
  .max(500)
  .url()
  .or(z.literal("#"))
  .or(z.literal(""));

export const storeSettingsSchema = z.object({
  businessName: z.string().min(1).max(200),
  contactEmail: z.string().email(),
  // Phase 11 — optional generic phone (PSTN). Accepts empty string to
  // suppress the row in footer/contact. Loose format — admin may enter
  // international or local; we render exactly what they type.
  contactPhone: z.string().max(32).default(""),
  whatsappNumber: z
    .string()
    .regex(/^\d{7,15}$/, "Digits only, no +, e.g. 60123456789"),
  whatsappNumberDisplay: z.string().min(1).max(32),
  instagramUrl: optionalUrl,
  tiktokUrl: optionalUrl,
  // Phase 11 — per-platform social URLs.
  twitterUrl: optionalUrl,
  whatsappUrl: optionalUrl,
  facebookUrl: optionalUrl,
  likeUrl: optionalUrl,
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
  // Phase 14 — cost defaults (all optional; NULL = 0 in compute helper)
  defaultFilamentCostPerKg: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a positive decimal")
    .optional()
    .or(z.literal(""))
    .nullable(),
  defaultElectricityCostPerKwh: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Must be a positive decimal")
    .optional()
    .or(z.literal(""))
    .nullable(),
  defaultElectricityKwhPerHour: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/, "Must be a positive decimal")
    .optional()
    .or(z.literal(""))
    .nullable(),
  defaultLaborRatePerHour: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a positive decimal")
    .optional()
    .or(z.literal(""))
    .nullable(),
  defaultOverheadPercent: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Must be a positive decimal")
    .default("0"),
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

// ============================================================================
// Phase 16 — Variant Options System (AD-01..AD-08)
// ============================================================================

/**
 * Product option (e.g., "Size", "Color", "Part").
 * Max 3 options per product enforced at the action layer (Shopify default).
 */
export const productOptionSchema = z.object({
  name: z
    .string()
    .min(1, "Option name is required")
    .max(64, "Option name too long (max 64 chars)"),
  position: z.number().int().min(1).max(3),
});
export type ProductOptionInput = z.infer<typeof productOptionSchema>;

/**
 * Option value (e.g., "Small", "Red", "Head").
 * swatchHex is only relevant for Color-type options.
 */
export const productOptionValueSchema = z.object({
  value: z
    .string()
    .min(1, "Value is required")
    .max(64, "Value too long (max 64 chars)"),
  position: z.number().int().min(0),
  swatchHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #ff0000")
    .optional(),
});
export type ProductOptionValueInput = z.infer<typeof productOptionValueSchema>;

/**
 * Variant update — used by the inline variant matrix editor.
 * All fields optional so a single-field patch is valid.
 */
export const variantUpdateSchema = z.object({
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Price must be a valid decimal")
    .optional(),
  costPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional()
    .or(z.literal(""))
    .nullable(),
  stock: z.coerce.number().int().min(0).optional(),
  trackStock: z.boolean().optional(),
  inStock: z.boolean().optional(),
  sku: z.string().max(64).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  position: z.number().int().min(0).optional(),
  option1ValueId: z.string().uuid().optional().nullable(),
  option2ValueId: z.string().uuid().optional().nullable(),
  option3ValueId: z.string().uuid().optional().nullable(),
  option4ValueId: z.string().uuid().optional().nullable(),
  option5ValueId: z.string().uuid().optional().nullable(),
  option6ValueId: z.string().uuid().optional().nullable(),
  // Phase 14 cost breakdown passthrough
  filamentGrams: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().or(z.literal("")).nullable(),
  printTimeHours: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().or(z.literal("")).nullable(),
  laborMinutes: z.string().regex(/^\d+(\.\d{1})?$/).optional().or(z.literal("")).nullable(),
  otherCost: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().or(z.literal("")).nullable(),
  filamentRateOverride: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().or(z.literal("")).nullable(),
  laborRateOverride: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().or(z.literal("")).nullable(),
  costPriceManual: z.boolean().optional(),
  // Phase 17 — sale pricing + default flag + per-variant weight
  // NOTE: salePrice < price validation is deferred to the server action
  // (updateVariant / bulkUpdateVariants) because variantUpdateSchema is a
  // partial patch and price may not be present in the same patch payload.
  salePrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Sale price must be a valid decimal")
    .optional()
    .or(z.literal(""))
    .nullable(),
  saleFrom: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal(""))
    .nullable(),
  saleTo: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal(""))
    .nullable(),
  isDefault: z.boolean().optional(),
  // AD-08 — optional per-variant shipping weight (grams). NULL/omitted = inherit product weight.
  weightG: z.number().int().min(0).max(50000).nullable().optional(),
  // Phase 18 — allow pre-order when variant is OOS (tracked, stock=0). When
  // FALSE (default) the PDP hides OOS tracked variants entirely.
  allowPreorder: z.boolean().optional(),
});
export type VariantUpdateInput = z.infer<typeof variantUpdateSchema>;

/**
 * Phase 16-06 — CSV import schema using generic option columns.
 *
 * Columns:
 *   option1_name        e.g. "Size"
 *   option1_values      pipe-separated e.g. "S|M|L"
 *   option1_prices      pipe-separated, aligned to option1_values e.g. "19.90|24.90|29.90"
 *   option2_name        optional second option e.g. "Color"
 *   option2_values      pipe-separated e.g. "Red|Blue"
 *   option2_prices      (optional) if omitted, all combos share option1 price
 *   option3_name        optional third option
 *   option3_values      pipe-separated
 *   option3_prices      (optional)
 *
 * Note: legacy price_s/price_m/price_l columns removed in Phase 17-04.
 * Use option1_name="Size", option1_values="S|M|L", option1_prices="x|y|z".
 */
export const bulkImportRowSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Slug: lowercase letters, digits, dash only")
    .max(220)
    .optional(),
  description: z.string().min(1),
  category_name: z.string().optional().nullable(),
  material_type: z.string().optional().nullable(),
  estimated_production_days: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .nullable(),
  // Generic option columns (phase 16)
  option1_name: z.string().max(50).optional().nullable(),
  option1_values: z.string().optional().nullable(),  // pipe-separated
  option1_prices: z.string().optional().nullable(),  // pipe-separated, aligned to values
  option2_name: z.string().max(50).optional().nullable(),
  option2_values: z.string().optional().nullable(),
  option2_prices: z.string().optional().nullable(),
  option3_name: z.string().max(50).optional().nullable(),
  option3_values: z.string().optional().nullable(),
  option3_prices: z.string().optional().nullable(),
});
export type BulkImportRowInput = z.infer<typeof bulkImportRowSchema>;

// ============================================================================
// Phase 18 — colours library
// ----------------------------------------------------------------------------
// Re-uses the hex regex from productOptionValueSchema (line 622). Optional
// fields use `.optional().or(z.literal("")).nullable()` so empty form inputs
// from FormData round-trip cleanly to null in the server action.
// ============================================================================

export const colourSchema = z.object({
  name: z.string().min(1, "Name is required").max(64, "Name too long (max 64 chars)"),
  hex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Hex must be in the form #RRGGBB"),
  previousHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Previous hex must be in the form #RRGGBB")
    .optional()
    .or(z.literal(""))
    .nullable(),
  brand: z.enum(["Bambu", "Polymaker", "Other"]),
  familyType: z.enum(["PLA", "PETG", "TPU", "CF", "Other"]),
  familySubtype: z
    .string()
    .max(48, "Family subtype too long (max 48 chars)")
    .optional()
    .or(z.literal(""))
    .nullable(),
  code: z
    .string()
    .max(32, "Code too long (max 32 chars)")
    .optional()
    .or(z.literal(""))
    .nullable(),
  isActive: z.boolean().default(true),
});
export type ColourInput = z.infer<typeof colourSchema>;
