import {
  mysqlTable,
  varchar,
  char,
  text,
  mediumtext,
  longtext,
  boolean,
  int,
  decimal,
  timestamp,
  datetime,
  mysqlEnum,
  json,
  index,
  unique,
} from "drizzle-orm/mysql-core";
import { relations, sql } from "drizzle-orm";
import { MALAYSIAN_STATES } from "@/lib/validators";

// ============================================================================
// Better Auth Tables
// Column names match Better Auth's Drizzle adapter expectations.
// IDs are text (Better Auth generates string IDs); we use varchar(36) to fit
// both UUID and nanoid style identifiers without wasting space.
// ============================================================================

export const user = mysqlTable("user", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Better Auth admin plugin fields
  role: varchar("role", { length: 32 }).notNull().default("customer"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  // PDPA consent (D-09, AUTH-05) — server-side timestamp, not boolean
  pdpaConsentAt: timestamp("pdpa_consent_at"),
  // Phase 6 06-01 — soft-delete marker for /account/close (T-06-01-PDPA, D-06)
  // Set by /account/close action; requireUser() rejects sessions whose row has this set.
  deletedAt: timestamp("deleted_at"),
  // Admin mini-CRM (2026-05-29) — free-text notes admin-only, plus a tag
  // array for segmentation. Both nullable so existing rows stay valid.
  // MariaDB stores JSON as LONGTEXT; admin actions ensure-array on read.
  notes: text("notes"),
  tags: json("tags").$type<string[]>(),
  // guest-order linking + contact (nullable — existing rows unaffected)
  phone: varchar("phone", { length: 32 }),
});

export const session = mysqlTable("session", {
  id: varchar("id", { length: 36 }).primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = mysqlTable("account", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: varchar("account_id", { length: 255 }).notNull(),
  providerId: varchar("provider_id", { length: 64 }).notNull(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = mysqlTable("verification", {
  id: varchar("id", { length: 36 }).primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ============================================================================
// Application Tables
// ============================================================================

// Phase 8 (08-01) — 2-level taxonomy.
// Categories own subcategories; products reference a subcategory which rolls
// up to its parent. We keep categories.name UNIQUE (display-only scope) but
// subcategory slugs only need to be unique WITHIN a parent (so two parents
// can each have a "General" subcategory without collision).
//
// position columns drive admin-sorted menu order; default 0 so newly-created
// rows land at the top until an admin reorders them.
export const categories = mysqlTable("categories", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`(UUID())`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  position: int("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const subcategories = mysqlTable(
  "subcategories",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`(UUID())`),
    categoryId: varchar("category_id", { length: 36 })
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 120 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    position: int("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    // Slug uniqueness is scoped to the parent category (two categories can
    // each have a "general" subcategory).
    categorySlugUnique: unique("uq_subcategory_slug").on(t.categoryId, t.slug),
    categoryIdx: index("idx_subcategory_category").on(t.categoryId),
  }),
);

export const products = mysqlTable("products", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`(UUID())`),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 220 }).notNull().unique(),
  description: text("description").notNull(),
  // Relative URLs served from public/uploads/products/<id>/<file>.
  // Stored as JSON array of strings OR ImageEntryV2 objects (MySQL has no native array type).
  // Phase 19 (19-10) — widened from string[] to accept {url, caption?, alt?} objects.
  // Read sites use ensureImagesV2() which handles both shapes.
  images: json("images").$type<string[] | Array<{ url: string; caption?: string | null; alt?: string | null }>>().notNull().default([]),
  // Index into `images` that should be used as the storefront card thumbnail.
  // Defaults to 0 so existing rows behave identically. Out-of-range values
  // (image deleted after selection) are coerced back to 0 at the read site.
  thumbnailIndex: int("thumbnail_index").notNull().default(0),
  materialType: varchar("material_type", { length: 64 }),
  // Phase 19 (19-01) — productType discriminator + tier-pricing columns.
  // 'stocked' = existing variant flow; 'configurable' = made-to-order with
  // configurator builder + tier table. All existing rows DEFAULT to 'stocked'
  // so the variant code path is untouched (D-14 backwards compat).
  productType: mysqlEnum("productType", ["stocked", "configurable", "keychain", "vending", "simple"]).notNull().default("stocked"),
  // Tier-pricing trio (NULL for stocked products):
  //   maxUnitCount = highest count the admin wants to price (e.g., 8 for keychain)
  //   priceTiers   = JSON object {"1":7,"2":9,...} stored as LONGTEXT — round-trip via ensureTiers()
  //   unitField    = name of the config field whose value-length drives lookup ("name" for keychain)
  maxUnitCount: int("maxUnitCount"),
  priceTiers: text("priceTiers"),
  unitField: varchar("unitField", { length: 64 }),
  // Per-tier shipping weight (parallel to priceTiers): JSON object
  //   {"1":15,"2":18,...} of GRAMS keyed by unit count (same key space as
  //   priceTiers). Stored as LONGTEXT — round-trip via ensureTiers(). NULL =
  //   no per-tier weight; shipping falls back to the variant/product/default
  //   ladder. Lets the clicker/keychain weight scale with character count.
  weightTiers: text("weight_tiers"),
  estimatedProductionDays: int("estimated_production_days"),
  isActive: boolean("is_active").notNull().default(true), // ADM-04
  isFeatured: boolean("is_featured").notNull().default(false), // D-12
  categoryId: varchar("category_id", { length: 36 }).references(
    () => categories.id
  ),
  // Phase 8 (08-01) — subcategory FK. Nullable during transition; once nav
  // and filters fully switch over, products.categoryId will be retired in a
  // follow-up phase. ON DELETE SET NULL so deleting a subcategory orphans
  // products (admin must reassign) instead of cascading.
  subcategoryId: varchar("subcategory_id", { length: 36 }).references(
    () => subcategories.id,
    { onDelete: "set null" }
  ),
  // Phase 9 (09-01) — shipping dimensions for Delyva courier pricing. All
  // nullable so existing rows stay valid; when absent we fall back to
  // shippingConfig.defaultWeightKg + a cubical default dimension server-side.
  shippingWeightKg: decimal("shipping_weight_kg", { precision: 8, scale: 3 }),
  shippingLengthCm: int("shipping_length_cm"),
  shippingWidthCm: int("shipping_width_cm"),
  shippingHeightCm: int("shipping_height_cm"),
  // Bug 3 — hide the flat-rate price pill on the storefront PDP when a
  // product uses multi-option Select fields whose prices determine cost.
  // Default FALSE = existing behaviour (always show the top price pill).
  hideBasePrice: boolean("hide_base_price").notNull().default(false),
  // Quick task 260705-azw — visual-only shape discriminator for keychain-type
  // products (square = existing keycap row; round = circular body). Default
  // preserves all existing rows' rendering.
  keychainShape: mysqlEnum("keychainShape", ["square", "round"]).notNull().default("square"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .onUpdateNow(),
}, (t) => ({
  subcategoryIdx: index("idx_products_subcategory").on(t.subcategoryId),
}));

// ============================================================================
// Phase 16 — product_options + product_option_values tables
// Generic options/values model replaces the hardcoded size enum.
// Positional option1..option6 columns on product_variants (Shopify-proven pattern).
// Legacy size column preserved during dual-read window (dropped in 16-07).
// ============================================================================

export const productOptions = mysqlTable(
  "product_options",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    productId: varchar("product_id", { length: 36 })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 64 }).notNull(),
    position: int("position").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    // One option name per product (e.g. can't have two "Size" options)
    productNameUnique: unique("uq_product_option_name").on(t.productId, t.name),
    // Position uniqueness scoped to product (max 6 options)
    productPositionUnique: unique("uq_product_option_position").on(t.productId, t.position),
    productIdx: index("idx_product_options_product").on(t.productId),
  }),
);

export const productOptionValues = mysqlTable(
  "product_option_values",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    optionId: varchar("option_id", { length: 36 })
      .notNull()
      .references(() => productOptions.id, { onDelete: "cascade" }),
    value: varchar("value", { length: 64 }).notNull(),
    position: int("position").notNull().default(0),
    // Optional color swatch for visual picker (Color option type)
    swatchHex: varchar("swatch_hex", { length: 7 }),
    // Phase 18 — link to library colour (NULL = freeform/custom one-off).
    // Lazy reference; `colors` table is declared at the bottom of this file.
    // FK enforced at the live DB via scripts/phase18-colours-migrate.cjs
    // (ON DELETE RESTRICT) for defense-in-depth alongside app-level guard.
    colorId: varchar("color_id", { length: 36 }).references(() => colors.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // One value string per option (no "Medium" duplicates)
    optionValueUnique: unique("uq_option_value").on(t.optionId, t.value),
    optionIdx: index("idx_option_values_option").on(t.optionId),
  }),
);

// ============================================================================
// Phase 19 (19-01) — product_config_fields
// Configurator inputs (text/number/colour/select) for made-to-order products.
// configJson is stored as LONGTEXT (mysql2 returns string) — parse via
// ensureConfigJson() per fieldType (D-03). FK cascades on product delete.
// ============================================================================

export const productConfigFields = mysqlTable(
  "product_config_fields",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    productId: varchar("productId", { length: 36 })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: int("position").notNull().default(0),
    fieldType: mysqlEnum("fieldType", ["text", "number", "colour", "select", "textarea", "keycapseq"]).notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    helpText: varchar("helpText", { length: 200 }),
    required: boolean("required").notNull().default(true),
    locked: boolean("locked").notNull().default(false),
    configJson: text("configJson"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    productIdx: index("idx_pcf_product").on(t.productId, t.position),
  }),
);

export const productVariants = mysqlTable("product_variants", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`(UUID())`),
  productId: varchar("product_id", { length: 36 })
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  // Phase 16-07: size column dropped — run scripts/phase16-cleanup.cjs on live DB.
  price: decimal("price", { precision: 10, scale: 2 }).notNull(), // MYR
  // Phase 10 (10-01) — per-variant unit cost (MYR). Nullable so existing rows
  // remain valid; the admin fills in cost retroactively. Admin product form
  // renders a live margin readout; order-level profit summary snapshots this
  // value into order_items.unit_cost at checkout.
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }),
  // Phase 5 05-01 — per-variant inventory toggle (INV-01) and optional low-stock
  // alert threshold (INV-02). inStock defaults TRUE so existing rows remain
  // available after migration; lowStockThreshold is null until admin sets it.
  inStock: boolean("in_stock").notNull().default(true),
  lowStockThreshold: int("low_stock_threshold"),
  // Phase 13 — optional stock tracking per variant.
  // stock: quantity on hand (ignored when track_stock = 0).
  // trackStock: when false (default), variant is on-demand — always available,
  //   stock column is ignored, no OOS badge ever shown. When true, the stock
  //   value is checked at checkout and decremented on capture.
  stock: int("stock").notNull().default(0),
  trackStock: boolean("track_stock").notNull().default(false),
  // Phase 14 — cost breakdown fields. All nullable so existing rows stay valid.
  // When costPriceManual=1 the existing costPrice is authoritative (admin typed
  // a total manually). When 0, costPrice is auto-computed from the breakdown and
  // persisted on save. storeSettings provides the rate defaults; these fields
  // are per-variant overrides.
  filamentGrams: decimal("filament_grams", { precision: 8, scale: 2 }),
  printTimeHours: decimal("print_time_hours", { precision: 6, scale: 2 }),
  laborMinutes: decimal("labor_minutes", { precision: 6, scale: 1 }),
  otherCost: decimal("other_cost", { precision: 10, scale: 2 }),
  filamentRateOverride: decimal("filament_rate_override", { precision: 8, scale: 2 }),
  laborRateOverride: decimal("labor_rate_override", { precision: 8, scale: 2 }),
  costPriceManual: boolean("cost_price_manual").notNull().default(false),
  // Phase 16 — generic option value references (positional, Shopify-style)
  // NULL during dual-read window; set after backfill script runs.
  // Caveman session: option4/5/6 added to raise cap from 3 → 6.
  option1ValueId: varchar("option1_value_id", { length: 36 }),
  option2ValueId: varchar("option2_value_id", { length: 36 }),
  option3ValueId: varchar("option3_value_id", { length: 36 }),
  option4ValueId: varchar("option4_value_id", { length: 36 }),
  option5ValueId: varchar("option5_value_id", { length: 36 }),
  option6ValueId: varchar("option6_value_id", { length: 36 }),
  // Phase 16 — per-variant fields
  sku: varchar("sku", { length: 64 }),
  imageUrl: text("image_url"),
  // Denormalized label for fast rendering: "Small / Red", "Head", etc.
  labelCache: varchar("label_cache", { length: 200 }),
  position: int("position").notNull().default(0),
  // Phase 17 — sale pricing + default-variant flag + per-variant shipping weight
  //
  // salePrice: optional lower price. Effective price = salePrice ?? price
  //   when the sale window is active.
  // saleFrom, saleTo: UTC TIMESTAMPs. Each nullable — NULL means "no bound on
  //   that side". Both NULL = active as soon as salePrice is set.
  // isDefault: admin-marked default combo; at most one per product (app-layer
  //   transaction enforced in setDefaultVariant).
  // weightG (AD-08): per-variant Delyva shipping weight override in grams.
  //   NULL means inherit products.shippingWeightKg × 1000; if that is also
  //   NULL, quoteForCart falls back to defaultWeightKg and emits a warn log.
  salePrice: decimal("sale_price", { precision: 10, scale: 2 }),
  saleFrom: timestamp("sale_from"),
  saleTo: timestamp("sale_to"),
  isDefault: boolean("is_default").notNull().default(false),
  weightG: int("weight_g"),
  // Phase 18 — when variant is tracked AND stock=0, allowPreorder=TRUE keeps
  // it visible on PDP with a "Pre-order" badge + button label. Default FALSE
  // means OOS tracked variants are hidden entirely.
  allowPreorder: boolean("allow_preorder").notNull().default(false),
});

// ============================================================================
// Relations
// ============================================================================

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
  subcategories: many(subcategories),
}));

export const subcategoriesRelations = relations(
  subcategories,
  ({ one, many }) => ({
    category: one(categories, {
      fields: [subcategories.categoryId],
      references: [categories.id],
    }),
    products: many(products),
  }),
);

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  subcategory: one(subcategories, {
    fields: [products.subcategoryId],
    references: [subcategories.id],
  }),
  variants: many(productVariants),
  options: many(productOptions),
}));

export const productOptionsRelations = relations(
  productOptions,
  ({ one, many }) => ({
    product: one(products, {
      fields: [productOptions.productId],
      references: [products.id],
    }),
    values: many(productOptionValues),
  }),
);

export const productOptionValuesRelations = relations(
  productOptionValues,
  ({ one }) => ({
    option: one(productOptions, {
      fields: [productOptionValues.optionId],
      references: [productOptions.id],
    }),
  }),
);

export const productVariantsRelations = relations(
  productVariants,
  ({ one }) => ({
    product: one(products, {
      fields: [productVariants.productId],
      references: [products.id],
    }),
    // Phase 16 — positional option value references (explicit relationName per FK)
    option1Value: one(productOptionValues, {
      fields: [productVariants.option1ValueId],
      references: [productOptionValues.id],
      relationName: "variant_option1",
    }),
    option2Value: one(productOptionValues, {
      fields: [productVariants.option2ValueId],
      references: [productOptionValues.id],
      relationName: "variant_option2",
    }),
    option3Value: one(productOptionValues, {
      fields: [productVariants.option3ValueId],
      references: [productOptionValues.id],
      relationName: "variant_option3",
    }),
    option4Value: one(productOptionValues, {
      fields: [productVariants.option4ValueId],
      references: [productOptionValues.id],
      relationName: "variant_option4",
    }),
    option5Value: one(productOptionValues, {
      fields: [productVariants.option5ValueId],
      references: [productOptionValues.id],
      relationName: "variant_option5",
    }),
    option6Value: one(productOptionValues, {
      fields: [productVariants.option6ValueId],
      references: [productOptionValues.id],
      relationName: "variant_option6",
    }),
  })
);

// ============================================================================
// Phase 3: Orders & Order Items (D3-11, D3-13)
// - orders.paypalOrderId is UNIQUE so PayPal idempotency is enforced at the DB
// - order_items intentionally has NO FK to products/variants — products may
//   be deleted but order history must remain immutable. We snapshot name,
//   slug, image, unitPrice at order-creation time.
// - user FK has NO cascade delete — deleting a user must not destroy order
//   rows (PDPA audit requirement; customerEmail is snapshotted for contact).
// ============================================================================

// Phase 20 (20-01) — extended from 6 to 8 values. New statuses support the
// POS draft-order flow (D-19, D-20). Order MUST stay in sync with OrderStatus
// in src/lib/orders.ts. Live DB ENUM extended via scripts/phase20-migrate.cjs.
export const orderStatusValues = [
  "pending",
  "awaiting_customer",
  "awaiting_payment_review",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

// Phase 7 (07-01) — additive enum for distinguishing customer-self-checkout
// orders ('web') from admin-booked manual orders ('manual'). Default 'web' so
// every existing row remains unchanged after migration. Per D-07-05.
export const orderSourceTypeValues = ["web", "manual"] as const;

export const orders = mysqlTable("orders", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`(UUID())`),
  // Nullable for guest checkout — userId is null when the order is placed
  // without an account. DO NOT add .notNull() here.
  // NO cascade — keep orders if user is deleted (PDPA audit, D3-23)
  userId: varchar("user_id", { length: 36 }).references(() => user.id),
  // Token for the emailed guest order-view link. Null for authenticated orders.
  guestAccessToken: varchar("guest_access_token", { length: 64 }),
  status: mysqlEnum("status", orderStatusValues).notNull().default("pending"),
  // PayPal identifiers (nullable until each phase of the payment flow completes)
  paypalOrderId: varchar("paypal_order_id", { length: 64 }).unique(),
  paypalCaptureId: varchar("paypal_capture_id", { length: 64 }),
  // Phase 20 (20-01) — payment method used (NULL for legacy rows, 'paypal' for
  // existing captured orders after back-fill in scripts/phase20-migrate.cjs).
  // D-21: set at status-transition time by the checkout/slip-upload actions.
  paymentMethod: mysqlEnum("payment_method", ["paypal", "bank_transfer"]),
  // Money (MYR) — decimal(10,2) stores up to 99,999,999.99
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("MYR"),
  // Customer email snapshot — survives user deletion (PDPA audit, D3-23)
  customerEmail: varchar("customer_email", { length: 255 }).notNull(),
  // Shipping address snapshot (set at checkout, never mutated)
  shippingName: varchar("shipping_name", { length: 200 }).notNull(),
  shippingPhone: varchar("shipping_phone", { length: 32 }).notNull(),
  shippingLine1: varchar("shipping_line1", { length: 200 }).notNull(),
  shippingLine2: varchar("shipping_line2", { length: 200 }),
  shippingCity: varchar("shipping_city", { length: 100 }).notNull(),
  shippingState: varchar("shipping_state", { length: 64 }).notNull(),
  shippingPostcode: varchar("shipping_postcode", { length: 10 }).notNull(),
  shippingCountry: varchar("shipping_country", { length: 64 })
    .notNull()
    .default("Malaysia"),
  // Admin-only internal notes (D3-18)
  notes: text("notes"),
  // Phase 7 (07-01) — additive columns for manual-order, refund-tracking, and
  // PayPal-financials mirror. Every column is nullable or has a default so
  // existing Phase 3-6 rows remain valid. Per D-07-05, D-07-06, D-07-08.
  sourceType: mysqlEnum("source_type", orderSourceTypeValues)
    .notNull()
    .default("web"),
  customItemName: varchar("custom_item_name", { length: 200 }),
  customItemDescription: text("custom_item_description"),
  // MariaDB stores JSON as LONGTEXT; the read site uses ensureJsonArray helper
  // (CLAUDE.md quirk).
  customImages: json("custom_images").$type<string[]>(),
  refundedAmount: decimal("refunded_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  // Amount the customer has actually paid. Set = totalAmount on payment
  // confirmation. When an admin adds items afterwards, totalAmount grows while
  // amountPaid stays put, so balance due = totalAmount − amountPaid (2026-06-13).
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  paypalFee: decimal("paypal_fee", { precision: 10, scale: 2 }),
  paypalNet: decimal("paypal_net", { precision: 10, scale: 2 }),
  sellerProtection: varchar("seller_protection", { length: 32 }),
  paypalSettleDate: timestamp("paypal_settle_date"),
  // Phase 9b — Delyva courier selection captured at checkout. All nullable
  // because flat-rate orders (pre-Delyva wiring) don't populate these.
  shippingServiceCode: varchar("shipping_service_code", { length: 50 }),
  shippingServiceName: varchar("shipping_service_name", { length: 120 }),
  shippingQuotedPrice: decimal("shipping_quoted_price", {
    precision: 10,
    scale: 2,
  }),
  // Phase 10 (10-01) — one-off order-level cost not tied to a line item
  // (rush material, upgraded packaging, courier surcharge we absorb, etc.).
  // NOT NULL with default 0 so existing rows remain valid. The optional note
  // is admin-only free text to explain the charge in the profit panel.
  extraCost: decimal("extra_cost", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  extraCostNote: varchar("extra_cost_note", { length: 255 }),
  // Order-level discount recorded on the order so it reflects everywhere
  // (admin detail, customer view, invoice, WhatsApp message). Set by a
  // checkout coupon OR by an admin applying a discount to a pending order.
  // discountAmount is the MYR value subtracted from subtotal; discountCode is
  // the coupon code (or "MANUAL" for an admin-entered amount). NOT NULL default
  // 0 so existing rows stay valid.
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  discountCode: varchar("discount_code", { length: 64 }),
  // 2026-06-14 — admin manually flags an order onto the production floor,
  // independent of payment status. NULL = not in production; a timestamp = the
  // moment the admin added it. Drives the Keychain batches view.
  productionAddedAt: timestamp("production_added_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const orderItems = mysqlTable("order_items", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`(UUID())`),
  orderId: varchar("order_id", { length: 36 })
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  // NO FK to products/variants — snapshot-only (D3-13)
  productId: varchar("product_id", { length: 36 }).notNull(),
  variantId: varchar("variant_id", { length: 36 }).notNull(),
  productName: varchar("product_name", { length: 200 }).notNull(),
  productSlug: varchar("product_slug", { length: 220 }).notNull(),
  // Nullable if the product had no image at order time
  productImage: text("product_image"),
  // Phase 16-07: size preserved for historical order rendering fallback.
  // New orders may have NULL size when placed after the phase-16 backfill.
  size: mysqlEnum("size", ["S", "M", "L"]),
  // Phase 16 — denormalized variant label snapshot ("Small / Red", "Head").
  // NULL for historical orders (pre-phase-16). New orders always populate.
  variantLabel: varchar("variant_label", { length: 200 }),
  // Phase 19 (19-01) — snapshot of cart-line configurationData JSON.
  // NULL for stocked-product line items. Read via ensureConfigurationData().
  configurationData: text("configuration_data"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  // Phase 10 (10-01) — snapshot of productVariants.costPrice at order-creation
  // time. Nullable: historical orders (pre-phase 10) + variants whose cost has
  // not been filled in retroactively stay NULL. Profit helper treats NULL as 0
  // but flags it via hasMissingCosts so admin can see which lines need input.
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }),
  quantity: int("quantity").notNull(),
  lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  // Production board (admin fulfilment). productionDone flips when the admin
  // ticks the line as made; productionSort is the admin-chosen ordering for the
  // line-wise production queue (NULL = unsorted, falls back to created order).
  productionDone: boolean("production_done").notNull().default(false),
  productionSort: int("production_sort"),
  // 2026-06-14 — keychain two-part batch tracking. A keychain prints as two
  // pieces: the Base (alone) and the Clicker+Letter (together as one). Each part
  // is ticked when its colour-batch is printed; productionDone is the final
  // assembly/packed tick once both parts are done.
  baseDone: boolean("base_done").notNull().default(false),
  clickerLetterDone: boolean("clicker_letter_done").notNull().default(false),
  // Phase 25 (25-01) — icon-print tick for mixed keycap sequences. A square
  // keychain slot can be a LETTER (base_done + clicker_letter_done) or an ICON
  // (icon_done). Mixed units are assemblable only when all three relevant parts
  // are done. Mirrors base_done / clicker_letter_done.
  iconDone: boolean("icon_done").notNull().default(false),
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(user, { fields: [orders.userId], references: [user.id] }),
  items: many(orderItems),
  paymentProofs: many(paymentProofs),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}));

// ============================================================================
// Phase 20 (20-01) — payment_proofs table
//
// Stores customer- and admin-uploaded payment slips for bank-transfer orders.
// One-to-many on order_id; each rejected slip is preserved (D-13).
// UUIDs are app-generated (randomUUID) per CLAUDE.md MariaDB quirk.
// No JSON columns — no ensureXxx helper needed for this table.
// Live table created via scripts/phase20-migrate.cjs.
//
// D-22 shape:
//   id                  CHAR(36) PK
//   orderId             CHAR(36) NOT NULL (FK enforced at live DB level)
//   imageUrl            VARCHAR(500) NOT NULL
//   thumbnailUrl        VARCHAR(500) NULL (NULL for PDFs)
//   mimeType            VARCHAR(64) NOT NULL
//   sizeBytes           INT NOT NULL
//   uploadedBy          ENUM('customer','admin') NOT NULL
//   uploadedByUserId    CHAR(36) NULL
//   status              ENUM('pending','approved','rejected') DEFAULT 'pending'
//   adminNote           TEXT NULL
//   reviewedBy          CHAR(36) NULL
//   reviewedAt          DATETIME NULL
//   createdAt           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
//   KEY idx_pp_order_status(order_id, status)
//   KEY idx_pp_status_created(status, created_at)
// ============================================================================

export const paymentProofs = mysqlTable(
  "payment_proofs",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    orderId: char("order_id", { length: 36 }).notNull(),
    imageUrl: varchar("image_url", { length: 500 }).notNull(),
    thumbnailUrl: varchar("thumbnail_url", { length: 500 }),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    sizeBytes: int("size_bytes").notNull(),
    uploadedBy: mysqlEnum("uploaded_by", ["customer", "admin"]).notNull(),
    uploadedByUserId: char("uploaded_by_user_id", { length: 36 }),
    status: mysqlEnum("status", ["pending", "approved", "rejected"])
      .notNull()
      .default("pending"),
    adminNote: text("admin_note"),
    reviewedBy: char("reviewed_by", { length: 36 }),
    reviewedAt: datetime("reviewed_at"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    orderStatusIdx: index("idx_pp_order_status").on(t.orderId, t.status),
    statusCreatedIdx: index("idx_pp_status_created").on(t.status, t.createdAt),
  }),
);

export const paymentProofsRelations = relations(paymentProofs, ({ one }) => ({
  order: one(orders, {
    fields: [paymentProofs.orderId],
    references: [orders.id],
  }),
}));

// ============================================================================
// Phase 21: Meshy AI 3D generation (21-01)
//
// Admin-only Meshy Image-to-3D generation workflow. Parent table tracks one
// admin-uploaded reference photo through the full pipeline (generate ->
// review -> revise/approve -> analyze/repair -> optional multicolor). Child
// table tracks retexture/regenerate revision history — revisionNumber is a
// real COUNT(*) at insert time, never a stored counter (21-CONTEXT decision).
//
// UUIDs are app-generated (randomUUID) per CLAUDE.md MariaDB quirk.
// printabilityReport + localModelFiles are JSON columns stored as LONGTEXT by
// MariaDB — mysql2 does not auto-parse; every read MUST go through a parse
// helper in src/lib/meshy/ (never re-declare an ensureXxx per call site).
// Live tables created via scripts/phase21-migrate.cjs; DEFAULT CHARSET matches
// the live-probed `user` table charset (never hardcoded — see migration script).
// product_id and approved_by carry NO FK constraint (app-layer only) per the
// resolved open question #2 in 21-CONTEXT.md — no v1 admin UI links a
// generation to a catalog product.
//
// DDL shape — meshy_generations:
//   id                       CHAR(36) PK
//   adminUserId              CHAR(36) NOT NULL (FK -> user.id)
//   productId                CHAR(36) NULL (no FK, no v1 UI)
//   sourceImagePath          VARCHAR(1024) NOT NULL
//   texturePrompt            VARCHAR(600) NULL
//   aiModel                  VARCHAR(32) NOT NULL DEFAULT 'meshy-6'
//   status                   ENUM(9 values) NOT NULL DEFAULT 'generating'
//   meshyTaskId              VARCHAR(64) NULL
//   meshyAnalyzeTaskId       VARCHAR(64) NULL
//   meshyRepairTaskId        VARCHAR(64) NULL
//   meshyMulticolorTaskId    VARCHAR(64) NULL
//   printabilityStatus       ENUM('healthy','warning','error','unknown') NULL
//   printabilityReport       LONGTEXT NULL (JSON)
//   isMultiColor             TINYINT(1) NOT NULL DEFAULT 0
//   localThumbnailPath       VARCHAR(1024) NULL
//   localModelFiles          LONGTEXT NULL (JSON)
//   creditsUsed              INT NOT NULL DEFAULT 0
//   taskErrorType            VARCHAR(64) NULL
//   taskErrorMessage         VARCHAR(512) NULL
//   modelReadyAt             DATETIME NULL
//   approvedAt               DATETIME NULL
//   approvedBy               CHAR(36) NULL (no FK)
//   createdAt                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
//   updatedAt                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
//   KEY idx_mg_status_updated(status, updated_at)
//   KEY idx_mg_created(created_at)
//   KEY idx_mg_product(product_id)
//
// DDL shape — meshy_revisions:
//   id                       CHAR(36) PK
//   generationId             CHAR(36) NOT NULL (FK -> meshy_generations.id ON DELETE CASCADE)
//   revisionNumber           INT NOT NULL
//   endpointUsed             ENUM('retexture','regenerate','remesh') NOT NULL
//   changeNote               VARCHAR(1000) NULL
//   newTexturePrompt         VARCHAR(600) NULL
//   meshyTaskId              VARCHAR(64) NULL
//   creditsUsed              INT NOT NULL DEFAULT 0
//   createdAt                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
//   KEY idx_mr_generation_created(generation_id, created_at)
// ============================================================================

export const meshyGenerations = mysqlTable(
  "meshy_generations",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    adminUserId: char("admin_user_id", { length: 36 }).notNull(),
    productId: char("product_id", { length: 36 }),
    sourceImagePath: varchar("source_image_path", { length: 1024 }).notNull(),
    texturePrompt: varchar("texture_prompt", { length: 600 }),
    aiModel: varchar("ai_model", { length: 32 }).notNull().default("meshy-6"),
    status: mysqlEnum("status", ["generating","awaiting_review","revising","analyzing","repairing","processing_multicolor","ready","failed","canceled"])
      .notNull()
      .default("generating"),
    meshyTaskId: varchar("meshy_task_id", { length: 64 }),
    meshyAnalyzeTaskId: varchar("meshy_analyze_task_id", { length: 64 }),
    meshyRepairTaskId: varchar("meshy_repair_task_id", { length: 64 }),
    meshyMulticolorTaskId: varchar("meshy_multicolor_task_id", { length: 64 }),
    printabilityStatus: mysqlEnum("printability_status", [
      "healthy",
      "warning",
      "error",
      "unknown",
    ]),
    printabilityReport: json("printability_report").$type<Record<string, unknown> | null>(),
    isMultiColor: boolean("is_multi_color").notNull().default(false),
    localThumbnailPath: varchar("local_thumbnail_path", { length: 1024 }),
    localModelFiles: json("local_model_files").$type<{
      glb?: string;
      stl?: string;
      threeMf?: string;
    } | null>(),
    creditsUsed: int("credits_used").notNull().default(0),
    taskErrorType: varchar("task_error_type", { length: 64 }),
    taskErrorMessage: varchar("task_error_message", { length: 512 }),
    modelReadyAt: datetime("model_ready_at"),
    approvedAt: datetime("approved_at"),
    approvedBy: char("approved_by", { length: 36 }),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    // NOTE: MySqlDateTimeBuilder (the `datetime()` column type) does not
    // expose `.onUpdateNow()` in the installed drizzle-orm 0.45.2 (that
    // helper only exists on `timestamp()` columns — MySqlDateColumnBaseBuilder).
    // `$onUpdateFn` is the documented ORM-level equivalent for any column
    // type. The live DDL (scripts/phase21-migrate.cjs) still declares the
    // authoritative `ON UPDATE CURRENT_TIMESTAMP` at the database level —
    // this is a client-side mirror so Drizzle-issued UPDATEs that omit
    // updatedAt still populate the correct SQL default.
    updatedAt: datetime("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`)
      .$onUpdateFn(() => sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    statusUpdatedIdx: index("idx_mg_status_updated").on(t.status, t.updatedAt),
    createdIdx: index("idx_mg_created").on(t.createdAt),
    productIdx: index("idx_mg_product").on(t.productId),
  }),
);

export const meshyRevisions = mysqlTable(
  "meshy_revisions",
  {
    id: char("id", { length: 36 }).notNull().primaryKey(),
    generationId: char("generation_id", { length: 36 }).notNull(),
    revisionNumber: int("revision_number").notNull(),
    endpointUsed: mysqlEnum("endpoint_used", [
      "retexture",
      "regenerate",
      "remesh",
    ]).notNull(),
    changeNote: varchar("change_note", { length: 1000 }),
    newTexturePrompt: varchar("new_texture_prompt", { length: 600 }),
    meshyTaskId: varchar("meshy_task_id", { length: 64 }),
    creditsUsed: int("credits_used").notNull().default(0),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    generationCreatedIdx: index("idx_mr_generation_created").on(
      t.generationId,
      t.createdAt,
    ),
  }),
);

// NOTE: relations below are declared for completeness (Drizzle Studio, type
// inference) but reads MUST use manual multi-query hydration (MariaDB has no
// LATERAL join support) — never call
// db.query.meshyGenerations.findMany({ with: { revisions: true } }).
export const meshyGenerationsRelations = relations(meshyGenerations, ({ many }) => ({
  revisions: many(meshyRevisions),
}));

export const meshyRevisionsRelations = relations(meshyRevisions, ({ one }) => ({
  generation: one(meshyGenerations, {
    fields: [meshyRevisions.generationId],
    references: [meshyGenerations.id],
  }),
}));

// ============================================================================
// Phase 6: Customer Account (06-01)
// New tables: addresses, wishlists, order_requests, reviews
// New column on user: deletedAt (above)
//
// Notes:
//   - reviews table is OWNED by Phase 5 (05-01); we declare it here as a
//     forward-compat fallback. Drizzle-kit push is idempotent; if Phase 5
//     ships first the CREATE is skipped. Shape MUST match Phase 5 05-CONTEXT.
//   - addresses + wishlists cascade-delete on user (customer-only data).
//   - order_requests + reviews use NO cascade on userId — PDPA audit trail
//     survives account closure (D-06 7y orders / 3y accounts).
//   - "Only one default address per user" + "one pending request per order"
//     are enforced at app layer (MariaDB has no clean partial unique index).
// ============================================================================

export const addresses = mysqlTable(
  "addresses",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`(UUID())`),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    line1: varchar("line1", { length: 200 }).notNull(),
    line2: varchar("line2", { length: 200 }),
    city: varchar("city", { length: 100 }).notNull(),
    state: varchar("state", { length: 64 }).notNull(),
    postcode: varchar("postcode", { length: 10 }).notNull(),
    country: varchar("country", { length: 64 }).notNull().default("Malaysia"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    userIdx: index("addresses_user_idx").on(t.userId),
  }),
);

export const wishlists = mysqlTable(
  "wishlists",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`(UUID())`),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: varchar("product_id", { length: 36 })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userProductUnique: unique("wishlists_user_product_unique").on(
      t.userId,
      t.productId,
    ),
    userIdx: index("wishlists_user_idx").on(t.userId),
  }),
);

export const orderRequestTypeValues = ["cancel", "return"] as const;
export const orderRequestStatusValues = [
  "pending",
  "approved",
  "rejected",
  "shipped",
  "received",
  "expired",
] as const;

export const orderRequests = mysqlTable(
  "order_requests",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`(UUID())`),
    orderId: varchar("order_id", { length: 36 })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id), // NO cascade — PDPA audit
    type: mysqlEnum("type", orderRequestTypeValues).notNull(),
    reason: text("reason").notNull(),
    status: mysqlEnum("status", orderRequestStatusValues)
      .notNull()
      .default("pending"),
    adminNotes: text("admin_notes"),
    // Return-specific: per-item JSON [{orderItemId, qty}] (LONGTEXT, manual parse)
    items: longtext("items"),
    // Return-specific: 1–4 review photo paths JSON string[] (LONGTEXT, manual parse)
    photos: longtext("photos"),
    // Return-specific: customer-supplied courier and tracking number
    returnCourier: varchar("return_courier", { length: 120 }),
    returnTrackingNumber: varchar("return_tracking_number", { length: 160 }),
    // Timestamps for the 3-day ship-by window (null for cancel requests)
    approvedAt: timestamp("approved_at"),
    shippedAt: timestamp("shipped_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => ({
    orderIdx: index("order_requests_order_idx").on(t.orderId),
    orderStatusIdx: index("order_requests_order_status_idx").on(
      t.orderId,
      t.status,
    ),
  }),
);

// ============================================================================
// Return-flow JSON parse helpers (MariaDB stores JSON columns as LONGTEXT —
// mysql2 does NOT auto-parse; every read site must call these helpers).
// ============================================================================

export type ReturnItem = { orderItemId: string; qty: number };

export function ensureReturnItems(raw: unknown): ReturnItem[] {
  if (Array.isArray(raw)) return raw as ReturnItem[];
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ReturnItem[];
    } catch {
      // corrupt — return empty
    }
  }
  return [];
}

export function ensurePhotoArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {
      // corrupt — return empty
    }
  }
  return [];
}

export const reviewStatusValues = ["pending", "approved", "hidden"] as const;

export const reviews = mysqlTable(
  "reviews",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`(UUID())`),
    productId: varchar("product_id", { length: 36 })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id), // NO cascade — keep review audit even if user anonymized
    rating: int("rating").notNull(), // 1-5 enforced at Zod
    body: text("body").notNull(),
    status: mysqlEnum("status", reviewStatusValues).notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    productStatusIdx: index("reviews_product_status_idx").on(
      t.productId,
      t.status,
    ),
    userProductUnique: unique("reviews_user_product_unique").on(
      t.userId,
      t.productId,
    ),
  }),
);

export const addressesRelations = relations(addresses, ({ one }) => ({
  user: one(user, { fields: [addresses.userId], references: [user.id] }),
}));

export const wishlistsRelations = relations(wishlists, ({ one }) => ({
  user: one(user, { fields: [wishlists.userId], references: [user.id] }),
  product: one(products, {
    fields: [wishlists.productId],
    references: [products.id],
  }),
}));

export const orderRequestsRelations = relations(orderRequests, ({ one }) => ({
  order: one(orders, {
    fields: [orderRequests.orderId],
    references: [orders.id],
  }),
  user: one(user, { fields: [orderRequests.userId], references: [user.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, {
    fields: [reviews.productId],
    references: [products.id],
  }),
  user: one(user, { fields: [reviews.userId], references: [user.id] }),
}));

// ============================================================================
// Phase 5: Admin Extensions (05-01)
// New tables: coupons, coupon_redemptions, email_templates, store_settings,
//             shipping_rates, events
// New columns on product_variants: inStock, lowStockThreshold (above)
//
// Notes:
//   - Coupon usage_count + usage_cap allow race-safe atomic increment via
//     UPDATE ... WHERE (usage_cap IS NULL OR usage_count < usage_cap).
//   - coupon_redemptions.userId has NO cascade — audit survives user deletion
//     (PDPA D-06 retention).
//   - email_templates uses `key` as the PK so the seed/upsert is idempotent.
//   - store_settings is a singleton (id='default') for the whole site.
//   - shipping_rates has UNIQUE state — one row per Malaysian state/FT.
//   - events stores fire-and-forget client analytics (add_to_bag, etc) with
//     a sha256 IP hash (PDPA — never the raw IP).
// ============================================================================

export const couponTypeValues = ["percentage", "fixed"] as const;

export const coupons = mysqlTable(
  "coupons",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`(UUID())`),
    code: varchar("code", { length: 32 }).notNull().unique(),
    type: mysqlEnum("type", couponTypeValues).notNull(),
    // Percentage stored as e.g. "20.00" for 20%; fixed stored in MYR.
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    minSpend: decimal("min_spend", { precision: 10, scale: 2 }),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    usageCap: int("usage_cap"),
    usageCount: int("usage_count").notNull().default(0),
    active: boolean("active").notNull().default(true),
    // When TRUE (default) the coupon works for guests too; FALSE restricts it
    // to logged-in customers. Admin sets this per coupon at create/edit time.
    guestAllowed: boolean("guest_allowed").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    activeIdx: index("coupons_active_idx").on(t.active),
  }),
);

export const couponRedemptions = mysqlTable(
  "coupon_redemptions",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`(UUID())`),
    couponId: varchar("coupon_id", { length: 36 })
      .notNull()
      .references(() => coupons.id, { onDelete: "cascade" }),
    orderId: varchar("order_id", { length: 36 })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // Nullable — guest (no-account) redemptions still count against usage_cap
    // but have no user to attribute. Members keep their attribution. NO cascade
    // on the FK — audit survives user deletion (PDPA T-05-01-PDPA).
    userId: varchar("user_id", { length: 36 }).references(() => user.id),
    amountApplied: decimal("amount_applied", { precision: 10, scale: 2 }).notNull(),
    redeemedAt: timestamp("redeemed_at").notNull().defaultNow(),
  },
  (t) => ({
    couponIdx: index("coupon_redemptions_coupon_idx").on(t.couponId),
    orderIdx: index("coupon_redemptions_order_idx").on(t.orderId),
  }),
);

export const emailTemplateKeyValues = [
  "order_confirmation",
  "password_reset",
] as const;

export const emailTemplates = mysqlTable("email_templates", {
  // Use `key` as the PK so seed/upsert is naturally idempotent.
  key: varchar("key", { length: 64 }).primaryKey(),
  subject: varchar("subject", { length: 200 }).notNull(),
  // mediumtext = up to 16MB; sanitised HTML body, capped at 100KB by Zod.
  html: mediumtext("html").notNull(),
  // List of supported {{var}} names — surfaced in the editor's variable sidebar.
  variables: json("variables").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const storeSettings = mysqlTable("store_settings", {
  // Singleton row — id='default'. Cached in memory for 60s (TTL invalidates on write).
  id: varchar("id", { length: 36 }).primaryKey().default("default"),
  businessName: varchar("business_name", { length: 200 }).notNull(),
  contactEmail: varchar("contact_email", { length: 255 }).notNull(),
  // Phase 11 — optional generic phone (PSTN). Separate from WhatsApp because
  // some businesses use different lines. Empty string = hide from storefront.
  contactPhone: varchar("contact_phone", { length: 32 }).notNull().default(""),
  whatsappNumber: varchar("whatsapp_number", { length: 32 }).notNull(),
  whatsappNumberDisplay: varchar("whatsapp_number_display", { length: 32 }).notNull(),
  instagramUrl: varchar("instagram_url", { length: 500 }).notNull().default("#"),
  tiktokUrl: varchar("tiktok_url", { length: 500 }).notNull().default("#"),
  // Phase 11 — per-platform social URLs for the branded ninja icon row in the
  // footer and /contact. Empty string = hide that icon from the storefront
  // (SocialLinks component filters out empty/null). `likeUrl` is a generic
  // extra slot (Google Reviews, Trustpilot, etc.). All default "" so
  // existing rows remain valid after migration.
  twitterUrl: varchar("twitter_url", { length: 500 }).notNull().default(""),
  whatsappUrl: varchar("whatsapp_url", { length: 500 }).notNull().default(""),
  facebookUrl: varchar("facebook_url", { length: 500 }).notNull().default(""),
  likeUrl: varchar("like_url", { length: 500 }).notNull().default(""),
  bannerText: varchar("banner_text", { length: 500 }),
  bannerEnabled: boolean("banner_enabled").notNull().default(false),
  // NULL means free-shipping disabled
  freeShipThreshold: decimal("free_ship_threshold", { precision: 10, scale: 2 }),
  // SST (Malaysian Sales & Service Tax). Default OFF per Phase 4 D-03.
  sstEnabled: boolean("sst_enabled").notNull().default(false),
  sstRate: decimal("sst_rate", { precision: 4, scale: 2 }).notNull().default("6.00"),
  // Phase 14 — store-level cost defaults. All nullable so zero-config deployments
  // work out of the box (missing rate → that cost component is treated as 0).
  // Admins set these once in /admin/settings; each variant can override filament
  // and labor rates individually. electricityKwhPerHour defaults to 0.15 (150W)
  // in the compute helper when NULL.
  defaultFilamentCostPerKg: decimal("default_filament_cost_per_kg", { precision: 8, scale: 2 }),
  defaultElectricityCostPerKwh: decimal("default_electricity_cost_per_kwh", { precision: 8, scale: 4 }),
  defaultElectricityKwhPerHour: decimal("default_electricity_kwh_per_hour", { precision: 6, scale: 3 }),
  defaultLaborRatePerHour: decimal("default_labor_rate_per_hour", { precision: 8, scale: 2 }),
  defaultOverheadPercent: decimal("default_overhead_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  // Phase 20 (20-01) — bank transfer details surfaced on the customer draft page.
  // D-16: if any of bankName/bankAccountNumber/bankAccountHolder is NULL/empty,
  // the Bank Transfer card is hidden entirely from the draft page (server guard).
  // D-18: draftLinkTemplate is a Mustache-style body for WhatsApp/email deeplinks.
  // Live DB columns added via scripts/phase20-migrate.cjs.
  bankName: varchar("bank_name", { length: 100 }),
  bankAccountNumber: varchar("bank_account_number", { length: 50 }),
  bankAccountHolder: varchar("bank_account_holder", { length: 200 }),
  draftLinkTemplate: text("draft_link_template"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

// ----------------------------------------------------------------------------
// WhatsApp notifications (Evolution API / Baileys) — feat/whatsapp-notifications
// ----------------------------------------------------------------------------

export const whatsappConnectionStateValues = ["close", "connecting", "open"] as const;

export const whatsappSettings = mysqlTable("whatsapp_settings", {
  // Singleton — id='default'. API key is NOT stored here (env only).
  id: varchar("id", { length: 36 }).primaryKey().default("default"),
  instanceName: varchar("instance_name", { length: 64 }).notNull().default("3dninjaz"),
  connectionState: mysqlEnum("connection_state", whatsappConnectionStateValues)
    .notNull()
    .default("close"),
  connectedNumber: varchar("connected_number", { length: 32 }),
  lastQrAt: timestamp("last_qr_at"),
  lastConnectedAt: timestamp("last_connected_at"),
  // Master toggle — when false, sender no-ops for ALL events.
  notificationsEnabled: boolean("notifications_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const whatsappNotifications = mysqlTable("whatsapp_notifications", {
  // event_key is the PK so seed/upsert is naturally idempotent.
  eventKey: varchar("event_key", { length: 64 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  template: text("template").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export type WhatsappSettingsSeed = typeof whatsappSettings.$inferInsert;
export type WhatsappNotificationSeed = typeof whatsappNotifications.$inferInsert;

export function seedWhatsappSettings(): WhatsappSettingsSeed {
  return {
    id: "default",
    instanceName: "3dninjaz",
    connectionState: "close",
    connectedNumber: null,
    notificationsEnabled: false,
  };
}

export const shippingRates = mysqlTable("shipping_rates", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`(UUID())`),
  // One row per MY state — UNIQUE so seed+upsert is safe.
  state: varchar("state", { length: 64 }).notNull().unique(),
  flatRate: decimal("flat_rate", { precision: 10, scale: 2 }).notNull().default("0.00"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const eventTypeValues = [
  "page_view",
  "add_to_bag",
  "checkout_started",
] as const;

export const events = mysqlTable(
  "events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`(UUID())`),
    event: mysqlEnum("event", eventTypeValues).notNull(),
    sessionId: varchar("session_id", { length: 64 }),
    // sha256(ip + salt) — never store raw IP (PDPA, T-05-02-PDPA).
    ipHash: varchar("ip_hash", { length: 64 }),
    path: varchar("path", { length: 200 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    eventCreatedIdx: index("events_event_created_idx").on(t.event, t.createdAt),
  }),
);

// ----------------------------------------------------------------------------
// Phase 5 relations
// ----------------------------------------------------------------------------

export const couponsRelations = relations(coupons, ({ many }) => ({
  redemptions: many(couponRedemptions),
}));

export const couponRedemptionsRelations = relations(
  couponRedemptions,
  ({ one }) => ({
    coupon: one(coupons, {
      fields: [couponRedemptions.couponId],
      references: [coupons.id],
    }),
    order: one(orders, {
      fields: [couponRedemptions.orderId],
      references: [orders.id],
    }),
    user: one(user, {
      fields: [couponRedemptions.userId],
      references: [user.id],
    }),
  }),
);

// ----------------------------------------------------------------------------
// Phase 5 seed helpers
// Each returns the row payload for a lazy first-load seed; Wave 2 callers
// invoke these in their getStoreSettings/listShippingRates/listEmailTemplates
// helpers when zero rows are detected.
// ----------------------------------------------------------------------------

export type StoreSettingsSeed = typeof storeSettings.$inferInsert;
export type ShippingRateSeed = typeof shippingRates.$inferInsert;
export type EmailTemplateSeed = typeof emailTemplates.$inferInsert;

export function seedStoreSettings(): StoreSettingsSeed {
  // Mirrors src/lib/business-info.ts BUSINESS const at Phase 5 land time.
  // Wave 2 plan 05-04 marks business-info.ts as deprecated and reads from DB.
  return {
    id: "default",
    businessName: "3D Ninjaz",
    contactEmail: "info@3dninjaz.com",
    contactPhone: "",
    whatsappNumber: "60167203048",
    whatsappNumberDisplay: "+60 16 720 3048",
    instagramUrl: "#",
    tiktokUrl: "#",
    twitterUrl: "",
    whatsappUrl: "",
    facebookUrl: "",
    likeUrl: "",
    bannerText: null,
    bannerEnabled: false,
    freeShipThreshold: null,
    sstEnabled: false,
    sstRate: "6.00",
  };
}

export function seedShippingRates(): ShippingRateSeed[] {
  return MALAYSIAN_STATES.map((state) => ({
    state,
    flatRate: "0.00",
  }));
}

// ============================================================================
// Phase 7 (07-01) — Manual Orders + PayPal Ops Mirror tables
//
// New tables: payment_links, dispute_cache, recon_runs.
// Per D-07-06, D-07-07, D-07-08 of the phase context.
//
// Notes:
//   - All UUIDs are app-generated (randomUUID) per CLAUDE.md MariaDB quirk.
//     The SQL DEFAULT (UUID()) here is a fallback for direct DB inserts.
//   - JSON columns become LONGTEXT in MariaDB. Read sites must JSON.parse.
//   - dispute_cache.orderId is NULLABLE because some PayPal disputes may not
//     map cleanly to a local order (admin must run sync to resolve).
//   - recon_runs.runDate is UNIQUE so the cron is idempotent (re-running for
//     the same MYT date is a no-op).
// ============================================================================

export const paymentLinks = mysqlTable(
  "payment_links",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`(UUID())`),
    orderId: varchar("order_id", { length: 36 })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdBy: varchar("created_by", { length: 36 })
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index("payment_links_order_idx").on(t.orderId),
  }),
);

export const disputeCache = mysqlTable(
  "dispute_cache",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`(UUID())`),
    disputeId: varchar("dispute_id", { length: 64 }).notNull().unique(),
    // NULLABLE — set when sync resolves the PayPal seller_transaction_id back
    // to our orders.paypalCaptureId.
    orderId: varchar("order_id", { length: 36 }).references(() => orders.id, {
      onDelete: "set null",
    }),
    status: varchar("status", { length: 32 }).notNull(),
    reason: varchar("reason", { length: 64 }),
    amount: decimal("amount", { precision: 10, scale: 2 }),
    currency: varchar("currency", { length: 3 }),
    createDate: timestamp("create_date").notNull(),
    updateDate: timestamp("update_date").notNull(),
    lastSyncedAt: timestamp("last_synced_at").notNull().defaultNow(),
    // Stored as LONGTEXT in MariaDB; full PayPal payload for evidence/audit.
    rawJson: mediumtext("raw_json"),
  },
  (t) => ({
    statusIdx: index("dispute_cache_status_idx").on(t.status),
    orderIdx: index("dispute_cache_order_idx").on(t.orderId),
  }),
);

export const reconRuns = mysqlTable("recon_runs", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`(UUID())`),
  // UNIQUE — one run per MYT date so the cron is idempotent.
  runDate: varchar("run_date", { length: 10 }).notNull().unique(),
  ranAt: timestamp("ran_at").notNull(),
  totalPaypalTxns: int("total_paypal_txns").notNull(),
  totalLocalTxns: int("total_local_txns").notNull(),
  driftCount: int("drift_count").notNull().default(0),
  driftJson: mediumtext("drift_json"),
  status: varchar("status", { length: 16 }).notNull(),
  errorMessage: text("error_message"),
});

export const paymentLinksRelations = relations(paymentLinks, ({ one }) => ({
  order: one(orders, {
    fields: [paymentLinks.orderId],
    references: [orders.id],
  }),
  creator: one(user, {
    fields: [paymentLinks.createdBy],
    references: [user.id],
  }),
}));

export const disputeCacheRelations = relations(disputeCache, ({ one }) => ({
  order: one(orders, {
    fields: [disputeCache.orderId],
    references: [orders.id],
  }),
}));

// ============================================================================
// Phase 9 (09-01) — Delyva delivery integration
//
// New tables: shipping_config (singleton), order_shipments (1:1 with orders
// in phase 1 — enforced by uq_shipments_order UNIQUE).
// New columns on products: shippingWeightKg + shippingLength/Width/HeightCm
// (all nullable, declared in products() above).
//
// MariaDB quirks (CLAUDE.md):
//   - JSON stored as LONGTEXT — serviceSnapshot + enabledServices are
//     longtext("…") and the read sites must JSON.parse.
//   - App-generated UUIDs via crypto.randomUUID() on INSERT.
//   - shipping_config is a singleton — id='default' — so repeated
//     INSERT…ON DUPLICATE KEY UPDATE is idempotent.
// ============================================================================

export const shippingConfig = mysqlTable("shipping_config", {
  id: varchar("id", { length: 36 }).primaryKey(), // always 'default'
  originAddress1: varchar("origin_address1", { length: 255 }).notNull(),
  originAddress2: varchar("origin_address2", { length: 255 }),
  originCity: varchar("origin_city", { length: 100 }).notNull(),
  originState: varchar("origin_state", { length: 100 }).notNull(),
  originPostcode: varchar("origin_postcode", { length: 10 }).notNull(),
  originCountry: varchar("origin_country", { length: 2 })
    .notNull()
    .default("MY"),
  originContactName: varchar("origin_contact_name", { length: 100 }).notNull(),
  originContactEmail: varchar("origin_contact_email", { length: 150 }).notNull(),
  originContactPhone: varchar("origin_contact_phone", { length: 30 }).notNull(),
  defaultItemType: mysqlEnum("default_item_type", [
    "PARCEL",
    "PACKAGE",
    "BULKY",
  ])
    .notNull()
    .default("PACKAGE"),
  // Fallback weight when the product row has no shippingWeightKg set.
  defaultWeightKg: decimal("default_weight_kg", { precision: 8, scale: 3 })
    .notNull()
    .default("0.5"),
  markupPercent: decimal("markup_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  markupFlat: decimal("markup_flat", { precision: 8, scale: 2 })
    .notNull()
    .default("0"),
  // NULL disables free shipping; non-null = MYR threshold on cart subtotal.
  freeShippingThreshold: decimal("free_shipping_threshold", {
    precision: 10,
    scale: 2,
  }),
  // JSON array of Delyva companyCodes — empty/null means "allow all".
  enabledServices: longtext("enabled_services"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

/**
 * Checkout drafts — a record the moment a customer types name + phone at
 * checkout, BEFORE any pay button is pressed. Gives the admin visibility of
 * "had a booking but didn't pay" (2026-06-13 request; previously these
 * customers left zero trace). Upserted client-side (debounced) keyed on a
 * per-browser draftKey; flipped to "converted" when a real order with the
 * same normalized phone (or userId) is created.
 */
export const checkoutDrafts = mysqlTable(
  "checkout_drafts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    // Per-browser key (crypto.randomUUID in localStorage) — upsert target.
    draftKey: varchar("draft_key", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 36 }),
    recipientName: varchar("recipient_name", { length: 200 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    // Digits-only national number (normalizeMsisdn) — conversion matching.
    phoneNorm: varchar("phone_norm", { length: 20 }).notNull(),
    email: varchar("email", { length: 255 }),
    // Partial address as typed — JSON {line1,line2,city,state,postcode}.
    addressJson: longtext("address_json"),
    // Compact bag snapshot — JSON [{name,quantity,unitPrice,lineTotal}].
    itemsJson: longtext("items_json"),
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0.00"),
    status: mysqlEnum("status", ["open", "converted", "dismissed"])
      .notNull()
      .default("open"),
    // Stale-draft digest bookkeeping (260815-rsk). Set once the daily 09:00 MYT
    // WhatsApp digest has reported this row; NULL = never reported. Deliberately
    // a timestamp and NOT a 4th status value — a reported draft is still "open",
    // so the admin filter, the open count and markDraftsConverted must keep
    // matching it.
    notifiedAt: timestamp("notified_at"),
    // Customer-facing 24h abandoned-checkout reminder (260816). Separate from
    // notifiedAt on purpose — that one tracks the ADMIN digest, and sharing a
    // single column would make sending one suppress the other. NULL = this
    // customer has never been reminded; set once, so exactly one reminder is
    // ever sent per draft.
    customerNotifiedAt: timestamp("customer_notified_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    draftKeyUnique: unique("uq_checkout_drafts_draft_key").on(t.draftKey),
    statusIdx: index("idx_checkout_drafts_status").on(t.status),
    phoneNormIdx: index("idx_checkout_drafts_phone_norm").on(t.phoneNorm),
  }),
);

export const orderShipments = mysqlTable(
  "order_shipments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    orderId: varchar("order_id", { length: 36 }).notNull(),
    // Delyva's numeric id stored as string — stays safe across BIGINT ranges.
    delyvaOrderId: varchar("delyva_order_id", { length: 50 }),
    serviceCode: varchar("service_code", { length: 50 }),
    consignmentNo: varchar("consignment_no", { length: 100 }),
    trackingNo: varchar("tracking_no", { length: 100 }),
    statusCode: int("status_code"),
    statusMessage: varchar("status_message", { length: 255 }),
    personnelName: varchar("personnel_name", { length: 100 }),
    personnelPhone: varchar("personnel_phone", { length: 30 }),
    // MYR — final price admin/customer paid (after markup rules).
    quotedPrice: decimal("quoted_price", { precision: 10, scale: 2 }),
    // JSON — full service object from the quote at booking time.
    serviceSnapshot: longtext("service_snapshot"),
    lastTrackingEventAt: timestamp("last_tracking_event_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    // Phase 1: one shipment per order. Split shipments are a future feature.
    orderIdUnique: unique("uq_shipments_order").on(t.orderId),
  }),
);

export const orderShipmentsRelations = relations(orderShipments, ({ one }) => ({
  order: one(orders, {
    fields: [orderShipments.orderId],
    references: [orders.id],
  }),
}));

// ============================================================================
// Phase 15 — Delyva service catalog
//
// One row per rate-tier code (e.g. "JNTMY-PN-BD1"). Populated by the admin
// clicking "Refresh catalog" which probes multiple corridors to discover the
// union of all services Delyva offers. Admin can toggle each tier on/off;
// checkout reads this table as the allowed-service filter.
//
// MariaDB quirks (CLAUDE.md):
//   - App-generated UUIDs via crypto.randomUUID() on INSERT.
//   - UPSERT: INSERT + ON DUPLICATE KEY UPDATE (MariaDB has no native UPSERT).
//     The action layer does this manually to preserve is_enabled.
//   - service_code is UNIQUE (uq_catalog_service_code) — the natural key.
// ============================================================================

export const shippingServiceCatalog = mysqlTable(
  "shipping_service_catalog",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    serviceCode: varchar("service_code", { length: 100 }).notNull().unique(),
    companyCode: varchar("company_code", { length: 50 }).notNull().default(""),
    companyName: varchar("company_name", { length: 120 }).notNull().default(""),
    serviceName: varchar("service_name", { length: 120 }),
    serviceType: varchar("service_type", { length: 20 }),
    samplePrice: decimal("sample_price", { precision: 10, scale: 2 }),
    etaMinMinutes: int("eta_min_minutes"),
    etaMaxMinutes: int("eta_max_minutes"),
    // Admin toggle — 1 = enabled (shown at checkout), 0 = hidden.
    isEnabled: boolean("is_enabled").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    companyIdx: index("idx_catalog_company").on(t.companyCode),
    enabledIdx: index("idx_catalog_enabled").on(t.isEnabled),
  }),
);

// ============================================================================
// Phase 12 — Email subscribers (newsletter)
//
// Rows are created by the storefront footer subscribe form (/api/subscribe)
// and managed by admins at /admin/subscribers. Unsubscribe tokens are used
// by the public /api/unsubscribe flow so email footers can offer one-click
// unsubscription (CAN-SPAM / GDPR basics).
//
// MariaDB quirks (CLAUDE.md):
//   - App-generated UUID + unsubscribe_token (crypto.randomBytes(16).hex) on
//     INSERT — no SQL defaults for these.
//   - status is an ENUM so Drizzle's mysqlEnum is a clean mapping.
//   - email is UNIQUE — the /api/subscribe route uses this to detect the
//     "reactivate a previously unsubscribed email" path.
// ============================================================================

export const emailSubscriberStatusValues = [
  "active",
  "unsubscribed",
  "bounced",
] as const;

export const emailSubscribers = mysqlTable(
  "email_subscribers",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    email: varchar("email", { length: 254 }).notNull().unique(),
    source: varchar("source", { length: 50 }),
    // Nullable — set when the subscriber signed up while authenticated.
    userId: varchar("user_id", { length: 36 }),
    status: mysqlEnum("status", emailSubscriberStatusValues)
      .notNull()
      .default("active"),
    // 32 hex chars = 16 random bytes; schema allows up to 64 for headroom.
    unsubscribeToken: varchar("unsubscribe_token", { length: 64 }).unique(),
    subscribedAt: timestamp("subscribed_at").notNull().defaultNow(),
    unsubscribedAt: timestamp("unsubscribed_at"),
    lastEmailSentAt: timestamp("last_email_sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    statusIdx: index("idx_email_subscribers_status").on(t.status),
    subscribedAtIdx: index("idx_email_subscribers_subscribed_at").on(
      t.subscribedAt,
    ),
  }),
);

// ============================================================================
// Neo-brutalist / claymorphism design system for all transactional emails.
//
// NOTE: The render-time sanitiser (src/lib/email/sanitize.ts) strips <html>,
// <head>, <style>, and <body> tags entirely — they are not in ALLOWED_TAGS.
// Mobile responsiveness is achieved via fluid width:100%/max-width on the
// outer wrapper rather than @media queries. Inline styles only.
// ============================================================================
function brandedEmailTemplate(opts: {
  icon: string;
  title: string;
  subtitle: string;
  bodyHtml: string;
  cta?: { text: string; url: string };
}): string {
  const { icon, title, subtitle, bodyHtml, cta } = opts;

  const ctaHtml = cta
    ? `<tr><td align="center" style="padding:0 28px 32px;border-collapse:collapse">
        <a href="{{${cta.url}}}" style="display:inline-block;padding:15px 30px;background:#C7E56B;color:#111111;text-decoration:none;border:3px solid #111111;border-radius:999px;box-shadow:5px 5px 0 #111111;font-size:16px;font-weight:900;letter-spacing:0.3px">${cta.text}</a>
      </td></tr>`
    : "";

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#D8ECFF;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <tr>
    <td align="center" style="padding:32px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="width:100%;max-width:640px;background:#ffffff;border:3px solid #111111;border-radius:26px;box-shadow:8px 8px 0 #111111;border-collapse:collapse">
        <!-- HEADER BAND -->
        <tr>
          <td align="center" style="background:#C7E56B;border-bottom:3px solid #111111;border-radius:23px 23px 0 0;padding:28px 24px 24px;border-collapse:collapse">
            <div style="display:inline-block;background:#ffffff;color:#111111;font-size:13px;font-weight:900;letter-spacing:1px;padding:10px 20px;border:3px solid #111111;border-radius:999px;box-shadow:4px 4px 0 #111111;margin-bottom:16px">3D NINJAZ</div>
            <div style="font-size:42px;line-height:1;margin-bottom:10px">${icon}</div>
            <div style="color:#111111;font-size:32px;font-weight:900;line-height:1.1;margin-bottom:12px">${title}</div>
            <div style="display:inline-block;background:#DCC3F3;color:#111111;border:3px solid #111111;border-radius:999px;font-size:14px;font-weight:800;padding:9px 16px">${subtitle}</div>
          </td>
        </tr>
        <!-- BODY -->
        <tr>
          <td style="padding:34px 28px 24px;border-collapse:collapse">
            ${bodyHtml}
          </td>
        </tr>
        <!-- CTA -->
        ${ctaHtml}
        <!-- HELP STRIP -->
        <tr>
          <td style="padding:0 28px 28px;border-collapse:collapse">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#DCC3F3;border:3px solid #111111;border-radius:18px;border-collapse:collapse">
              <tr>
                <td align="center" style="padding:16px 20px;color:#111111;font-size:14px;font-weight:700;border-collapse:collapse">
                  Need help? Contact us at <a href="mailto:{{support_email}}" style="color:#111111;font-weight:900">{{support_email}}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- FOOTER -->
        <tr>
          <td align="center" style="background:#111111;border-radius:0 0 23px 23px;padding:20px 24px;color:#ffffff;font-size:13px;font-weight:700;border-collapse:collapse">
            © {{current_year}} 3D Ninjaz &nbsp;·&nbsp;
            <a href="https://3dninjaz.com" style="color:#C7E56B;text-decoration:none;font-weight:700">3dninjaz.com</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

export function seedEmailTemplates(): EmailTemplateSeed[] {
  // Shared body styles
  const h = (text: string) =>
    `<p style="font-size:28px;font-weight:900;color:#111111;margin:0 0 14px">${text}</p>`;
  const p = (text: string) =>
    `<p style="font-size:16px;line-height:26px;color:#334155;margin:0 0 12px">${text}</p>`;
  const card = (rows: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F8FBFF;border:3px solid #111111;border-radius:20px;box-shadow:5px 5px 0 #DCC3F3;border-collapse:collapse;margin-bottom:20px">${rows}</table>`;
  const cardRow = (label: string, value: string, last = false) =>
    `<tr><td style="padding:14px 18px;border-collapse:collapse${last ? "" : ";border-bottom:2px dashed #111111"}"><div style="font-size:12px;font-weight:900;letter-spacing:.8px;color:#111111;text-transform:uppercase;margin-bottom:4px">${label}</div><div style="font-size:15px;font-weight:900;color:#111111">${value}</div></td></tr>`;
  const link = (href: string, text: string) =>
    `<a href="${href}" style="color:#111111;font-weight:900">${text}</a>`;

  return [
    // -----------------------------------------------------------------------
    {
      key: "order_confirmation",
      subject: "Order #{{order_number}} confirmed — thanks from 3D Ninjaz 🥷",
      html: brandedEmailTemplate({
        icon: "✅",
        title: "Order Confirmed!",
        subtitle: "Your 3D Ninjaz order is locked in",
        bodyHtml: `
          ${h("Thanks, {{customer_name}}!")}
          ${p("Your order <strong>#{{order_number}}</strong> has been confirmed and we are getting started right away.")}
          ${card(
            cardRow("Order Number", "#{{order_number}}") +
            cardRow("Order Total", "{{order_total}}", true)
          )}
          <div style="margin-bottom:20px">{{items_table}}</div>
          ${p("We will prepare your 3D printed items and ship them as soon as possible. You will receive a shipping notification the moment it leaves our hands.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: [
        "customer_name",
        "order_number",
        "order_total",
        "order_link",
        "items_table",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "order_processing",
      subject: "Your 3D Ninjaz order is being printed ({{order_number}})",
      html: brandedEmailTemplate({
        icon: "🖨️",
        title: "Printing Your Order!",
        subtitle: "Production is underway",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("Great news — your 3D Ninjaz order <strong>#{{order_number}}</strong> is now in production. Our printers are warming up and your item will be ready to ship soon.")}
          ${p("You can check the latest status anytime on your order page. We will send another notification the moment it ships.")}
        `,
        cta: { text: "View Your Order", url: "order_url" },
      }),
      variables: [
        "customer_name",
        "order_number",
        "order_url",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "order_shipped",
      subject: "Your 3D Ninjaz order is on its way! ({{courier_name}})",
      html: brandedEmailTemplate({
        icon: "📦",
        title: "Your Order Shipped!",
        subtitle: "On its way to you",
        bodyHtml: `
          ${h("Hey {{customer_name}},")}
          ${p("Your order <strong>#{{order_number}}</strong> has been dispatched and is on its way to you.")}
          ${card(
            cardRow("Courier", "{{courier_name}}") +
            cardRow("Tracking Number", "{{tracking_no}}") +
            cardRow("Consignment No.", "{{consignment_no}}", true)
          )}
          ${p("Click the button below to track your delivery in real-time.")}
        `,
        cta: { text: "Track Package", url: "tracking_link" },
      }),
      variables: [
        "customer_name",
        "order_number",
        "courier_name",
        "tracking_no",
        "consignment_no",
        "tracking_link",
        "order_link",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "order_delivered",
      subject: "Your 3D Ninjaz order has been delivered 🎉",
      html: brandedEmailTemplate({
        icon: "🎉",
        title: "Delivered!",
        subtitle: "Your order has arrived",
        bodyHtml: `
          ${h("Hey {{customer_name}},")}
          ${p("Your order <strong>#{{order_number}}</strong> has been delivered to your doorstep.")}
          ${p("We hope you love your 3D printed items! If anything is not quite right, do not hesitate to reach out — we are always happy to help.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: [
        "customer_name",
        "order_number",
        "order_link",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "order_refunded",
      subject: "Refund processed for order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "💰",
        title: "Refund Processed",
        subtitle: "Your money is on its way back",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("We have processed a refund for your order.")}
          ${card(
            cardRow("Order Number", "#{{order_number}}") +
            cardRow("Refund Amount", "{{refund_amount}}", true)
          )}
          ${p("The refund should appear in your account within 3–5 business days depending on your payment provider.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: [
        "customer_name",
        "order_number",
        "refund_amount",
        "order_link",
        "support_email",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "order_cancelled",
      subject: "Order #{{order_number}} has been cancelled",
      html: brandedEmailTemplate({
        icon: "❌",
        title: "Order Cancelled",
        subtitle: "Order #{{order_number}}",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("Your order <strong>#{{order_number}}</strong> has been cancelled.")}
          ${card(
            cardRow("Cancellation Reason", "{{cancellation_reason}}", true)
          )}
          ${p("If this cancellation was unexpected or you have questions, please reach out to us — we are here to help.")}
        `,
        cta: { text: "Contact Support", url: "support_email" },
      }),
      variables: [
        "customer_name",
        "order_number",
        "cancellation_reason",
        "order_link",
        "support_email",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "password_reset",
      subject: "Reset your 3D Ninjaz password",
      html: brandedEmailTemplate({
        icon: "🔑",
        title: "Reset Your Password",
        subtitle: "Action required within 1 hour",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("We received a request to reset your password. Click the button below to create a new password.")}
          ${p("This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email — your account is still secure.")}
        `,
        cta: { text: "Reset Password", url: "reset_link" },
      }),
      variables: [
        "customer_name",
        "reset_link",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "password_changed",
      subject: "Your 3D Ninjaz password was changed",
      html: brandedEmailTemplate({
        icon: "🔒",
        title: "Password Updated",
        subtitle: "Your account is secure",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("Your password has been successfully changed.")}
          ${p("If you did not make this change, please contact us immediately — your account security is our top priority.")}
        `,
      }),
      variables: [
        "customer_name",
        "store_name",
        "store_url",
        "current_year",
        "support_email",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "welcome",
      subject: "Welcome to 3D Ninjaz! 🥷",
      html: brandedEmailTemplate({
        icon: "🥷",
        title: "Welcome to 3D Ninjaz!",
        subtitle: "Your account is ready",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("Your account is ready to go. Browse our collection of unique 3D printed items and find something you will love.")}
          ${p("We print every item fresh — crafted just for you. No mass-produced stuff here.")}
        `,
        cta: { text: "Shop Now", url: "shop_link" },
      }),
      variables: [
        "customer_name",
        "store_name",
        "store_url",
        "current_year",
        "shop_link",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "newsletter_welcome",
      subject: "You're in! News from the 3D Ninjaz crew",
      html: brandedEmailTemplate({
        icon: "📬",
        title: "You're Subscribed!",
        subtitle: "Welcome to the crew",
        bodyHtml: `
          ${p("Thanks for subscribing to 3D Ninjaz news.")}
          ${p("You will be the first to hear about new products, exclusive deals, and behind-the-scenes 3D printing stories. Stay tuned!")}
          <p style="font-size:13px;color:#334155;margin-top:20px">${link("{{unsubscribe_link}}", "Unsubscribe anytime")}</p>
        `,
      }),
      variables: [
        "subscriber_email",
        "store_name",
        "store_url",
        "current_year",
        "unsubscribe_link",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "newsletter_unsubscribed",
      subject: "You've been unsubscribed from 3D Ninjaz updates",
      html: brandedEmailTemplate({
        icon: "👋",
        title: "You've Unsubscribed",
        subtitle: "We'll miss you!",
        bodyHtml: `
          ${p("Your email has been removed from our mailing list.")}
          ${p("You will not receive any further marketing emails from us. You can resubscribe anytime from our website if you change your mind.")}
        `,
      }),
      variables: [
        "subscriber_email",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "dispute_opened_customer",
      subject: "Dispute opened for order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "⚠️",
        title: "Dispute Notification",
        subtitle: "We're looking into it",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("A dispute has been opened on your order <strong>#{{order_number}}</strong>.")}
          ${card(
            cardRow("Dispute Reason", "{{dispute_reason}}", true)
          )}
          ${p("Our team is investigating and will keep you updated every step of the way. If you have additional details that may help, please reach out to us.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: [
        "customer_name",
        "order_number",
        "dispute_reason",
        "order_link",
        "support_email",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "dispute_opened_admin",
      subject: "ADMIN: Dispute opened on order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "🚨",
        title: "New Dispute Alert",
        subtitle: "Requires your attention",
        bodyHtml: `
          ${p("A new dispute has been opened and requires your review.")}
          ${card(
            cardRow("Customer", "{{customer_name}}") +
            cardRow("Order Number", "#{{order_number}}") +
            cardRow("Dispute Reason", "{{dispute_reason}}") +
            cardRow("Dispute Amount", "{{dispute_amount}}", true)
          )}
          ${p("Click below to view the full dispute details and respond.")}
        `,
        cta: { text: "Review Dispute", url: "admin_link" },
      }),
      variables: [
        "customer_name",
        "order_number",
        "dispute_reason",
        "dispute_amount",
        "admin_link",
        "store_name",
        "current_year",
      ],
    },
    // ========================================================================
    // 260601-afs — Return-for-replacement flow emails
    // ========================================================================
    {
      key: "return_requested",
      subject: "Return request received for order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "📦",
        title: "Return Request Received",
        subtitle: "Under review",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("We have received your return / replacement request for order <strong>#{{order_number}}</strong>.")}
          ${p("Our team will review your request and get back to you within 1 business day. You can track the status of your request on your order page.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: [
        "customer_name",
        "order_number",
        "order_link",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "return_approved",
      subject: "Return approved — ship your item back by {{ship_by_date}}",
      html: brandedEmailTemplate({
        icon: "✅",
        title: "Return Approved!",
        subtitle: "Next step: ship it back",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("Great news! Your return / replacement request for order <strong>#{{order_number}}</strong> has been approved.")}
          ${card(
            cardRow("Ship Back By", "{{ship_by_date}}") +
            cardRow("Return Address", "{{return_address}}", true)
          )}
          ${p("Once you have shipped, please visit your order page to submit your courier name and tracking number so we can confirm receipt and start your re-make.")}
          <p style="font-size:13px;color:#334155;margin:0">If you do not submit tracking within 3 days, the request will expire and you will need to contact support.</p>
        `,
        cta: { text: "Submit Tracking Number", url: "order_link" },
      }),
      variables: [
        "customer_name",
        "order_number",
        "ship_by_date",
        "return_address",
        "order_link",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "return_rejected",
      subject: "Update on your return request — order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "❌",
        title: "Return Request Update",
        subtitle: "Unable to approve at this time",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("After reviewing your return request for order <strong>#{{order_number}}</strong>, we are unable to approve it at this time.")}
          ${card(
            cardRow("Reason", "{{reason}}", true)
          )}
          ${p("If you believe this decision was made in error or you need further assistance, please contact us and we will do our best to help.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: [
        "customer_name",
        "order_number",
        "reason",
        "order_link",
        "support_email",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "return_received",
      subject: "We received your return — re-making your order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "🥷",
        title: "Return Received!",
        subtitle: "Re-make in progress",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("We have received your returned item for order <strong>#{{order_number}}</strong>. Thank you for sending it back!")}
          ${p("Our team is now working on your replacement. We will email you again once it has been shipped.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: [
        "customer_name",
        "order_number",
        "order_link",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    // -----------------------------------------------------------------------
    {
      key: "return_expired",
      subject: "Your return window has expired — order #{{order_number}}",
      html: brandedEmailTemplate({
        icon: "⏰",
        title: "Return Window Expired",
        subtitle: "Ship-by deadline passed",
        bodyHtml: `
          ${h("Hi {{customer_name}},")}
          ${p("Unfortunately the 3-day shipping window for your approved return on order <strong>#{{order_number}}</strong> has passed without a tracking number being submitted.")}
          ${p("If you still need help, please contact us or reach out via WhatsApp and we will do our best to assist you.")}
        `,
        cta: { text: "View Your Order", url: "order_link" },
      }),
      variables: [
        "customer_name",
        "order_number",
        "order_link",
        "support_email",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
  ];
}

// ============================================================================
// Phase 18 — colors library + product_option_values.color_id FK
// Admin-curated central colour catalogue (seeded once from Bambu/Polymaker
// reference HTML). product_option_values.color_id (declared above) is a lazy
// reference back to colors.id — Drizzle resolves () => colors.id at runtime.
// Live DB FK constraint added via scripts/phase18-colours-migrate.cjs.
// ============================================================================

export const colors = mysqlTable(
  "colors",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 64 }).notNull(),
    hex: varchar("hex", { length: 7 }).notNull(),
    // Polymaker old-packaging hex (D-02). NULL for Bambu / new lines.
    previousHex: varchar("previous_hex", { length: 7 }),
    brand: mysqlEnum("brand", ["Bambu", "Polymaker", "Other"]).notNull(),
    // Bambu RFID code or Polymaker SKU; NULL for one-offs / em-dash sources.
    code: varchar("code", { length: 32 }),
    // D-04 family split: coarse type (enum) + fine subtype (free string).
    familyType: mysqlEnum("family_type", [
      "PLA",
      "PETG",
      "TPU",
      "CF",
      "Other",
    ]).notNull(),
    familySubtype: varchar("family_subtype", { length: 48 }).notNull(),
    // Phase 20-xx — admin-marked "My Colour" (considered by admin for their use)
    isMyColour: boolean("is_my_colour").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    // MySQL/MariaDB allow multiple (brand, NULL) rows under UNIQUE since
    // NULL ≠ NULL — exactly the SPEC §1 semantics ("unique when code non-null").
    brandCodeUnique: unique("uq_colors_brand_code").on(t.brand, t.code),
    brandIdx: index("idx_colors_brand").on(t.brand),
    activeIdx: index("idx_colors_active").on(t.isActive),
    myColourIdx: index("idx_colors_my_colour").on(t.isMyColour),
  }),
);

// ============================================================================
// Custom Fonts — admin-uploaded .woff2/.woff brand fonts
//
// Stored at public/uploads/fonts/<id>/<filename>.
// familySlug is the CSS class suffix (ql-font-<slug>) and font-family name.
// isActive toggle lets admin hide a font without deleting it.
// ============================================================================

export const customFonts = mysqlTable("custom_fonts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  displayName: varchar("display_name", { length: 64 }).notNull(),
  familySlug: varchar("family_slug", { length: 32 }).notNull().unique(),
  fileUrl: varchar("file_url", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 64 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export type CustomFont = typeof customFonts.$inferSelect;

// ============================================================================
// Accounting tables — expenses, assets, payouts.
//
// Simple cash-basis bookkeeping. Sales/COGS/shipping/fees are derived from
// existing paid orders (see src/lib/accounting.ts); these three tables hold the
// manually-entered side: business expenses, one-off assets (register only —
// EXCLUDED from profit), and PayPal→Bank/Cash withdrawals (payouts).
//
// Standalone — no FKs into orders. App-generated UUIDs (crypto.randomUUID).
// Entry dates are VARCHAR(10) "YYYY-MM-DD" (admin picks via <input type=date>);
// compared lexicographically (= chronological) so no Date() coercion in WHERE.
// ============================================================================

export const expenseCategoryValues = [
  "materials",
  "utilities",
  "marketing",
  "shipping",
  "equipment",
  "other",
] as const;

export const accountValues = ["paypal", "bank", "cash"] as const;

export const expenses = mysqlTable(
  "expenses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    expenseDate: varchar("expense_date", { length: 10 }).notNull(), // YYYY-MM-DD
    category: mysqlEnum("category", expenseCategoryValues).notNull(),
    note: varchar("note", { length: 500 }),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    paidFrom: mysqlEnum("paid_from", accountValues).notNull().default("bank"),
    supplierName: varchar("supplier_name", { length: 200 }),
    // Relative URL to the archived invoice/receipt (PDF or image) when the
    // expense was created via invoice import. NULL for hand-entered rows.
    sourceDocUrl: varchar("source_doc_url", { length: 500 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    dateIdx: index("idx_expenses_date").on(t.expenseDate),
    categoryIdx: index("idx_expenses_category").on(t.category),
  }),
);

export const assets = mysqlTable(
  "assets",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    assetDate: varchar("asset_date", { length: 10 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({ dateIdx: index("idx_assets_date").on(t.assetDate) }),
);

export const payouts = mysqlTable(
  "payouts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    payoutDate: varchar("payout_date", { length: 10 }).notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    // Money leaves PayPal and lands here — models a PayPal→Bank/Cash transfer.
    // Gives the Bank/Cash balances an inflow source.
    paidInto: mysqlEnum("paid_into", ["bank", "cash"]).notNull().default("bank"),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({ dateIdx: index("idx_payouts_date").on(t.payoutDate) }),
);

export type Expense = typeof expenses.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Payout = typeof payouts.$inferSelect;

/**
 * Quotations (2026-08-18). The quotation is the FIRST document sent to a
 * client and carries the payment terms. When the client pays, the admin marks
 * it and a linked `orders` row is created, from which the EXISTING invoice
 * pipeline runs unchanged — nothing in `orders` / `order_items` changes for
 * this feature.
 *
 * Deliberately its own table rather than a flag on `orders`: a quotation is
 * not yet a sale, has its own number series, expires, and its client block is
 * free text (B2B contacts like "Khai Wong / Jo Malone London" are not
 * storefront accounts).
 *
 * See .planning/QUOTATION-SYSTEM-PLAN.md for the full rationale.
 */
export const quotationStatusValues = [
  "draft",
  "sent",
  "deposit_paid",
  "completed",
  "cancelled",
] as const;

export const quotations = mysqlTable(
  "quotations",
  {
    id: char("id", { length: 36 }).primaryKey(),
    // Own series, independent of order numbers. AUTO_INCREMENT so two admins
    // cannot mint the same number; rendered as "#0024".
    quoteNo: int("quote_no").autoincrement().notNull(),
    status: mysqlEnum("status", quotationStatusValues).notNull().default("draft"),

    // Client block — all free text, no FK to `user`.
    contactName: varchar("contact_name", { length: 200 }).notNull(),
    companyName: varchar("company_name", { length: 200 }),
    contactEmail: varchar("contact_email", { length: 255 }),
    contactPhone: varchar("contact_phone", { length: 32 }),
    contactAddress: text("contact_address"),
    // Optional soft link to a storefront account. No cascade.
    userId: varchar("user_id", { length: 36 }),

    // Document body
    projectDescription: text("project_description"),
    productionLeadTime: varchar("production_lead_time", { length: 120 }),
    // YYYY-MM-DD, matching the expenses.expenseDate convention (schema.ts:2190).
    validUntil: varchar("valid_until", { length: 10 }).notNull(),
    // JSON string[] stored as LONGTEXT — mysql2 does NOT auto-parse it.
    // Always read through ensureTermsArray() in src/lib/quotations.ts.
    terms: longtext("terms"),

    // Money (MYR), mirroring the precision used on `orders`.
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull().default("0.00"),
    totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
    currency: varchar("currency", { length: 3 }).notNull().default("MYR"),
    // 100.00 means payment in full up front, no deposit stage.
    depositPercent: decimal("deposit_percent", { precision: 5, scale: 2 }).notNull().default("50.00"),
    // Snapshot taken when the quote is sent, so later edits cannot move the
    // figure the client already agreed to.
    depositAmount: decimal("deposit_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),

    sentAt: timestamp("sent_at"),
    depositPaidAt: timestamp("deposit_paid_at"),
    completedAt: timestamp("completed_at"),

    // Conversion link. UNIQUE is the idempotency backstop: a double-click
    // cannot attach two orders to one quotation.
    orderId: char("order_id", { length: 36 }),
    notes: text("notes"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    quoteNoUnique: unique("uq_quotations_quote_no").on(t.quoteNo),
    orderIdUnique: unique("uq_quotations_order_id").on(t.orderId),
    statusCreatedIdx: index("idx_quotations_status_created").on(t.status, t.createdAt),
  }),
);

export const quotationItems = mysqlTable(
  "quotation_items",
  {
    id: char("id", { length: 36 }).primaryKey(),
    quotationId: char("quotation_id", { length: 36 }).notNull(),
    position: int("position").notNull().default(0),
    // The "Package Inclusion" column on the printed document.
    description: varchar("description", { length: 500 }).notNull(),
    quantity: int("quantity").notNull().default(1),
    unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
    lineTotal: decimal("line_total", { precision: 10, scale: 2 }).notNull(),
  },
  (t) => ({
    quotationIdx: index("idx_qi_quotation").on(t.quotationId, t.position),
  }),
);

export type Quotation = typeof quotations.$inferSelect;
export type QuotationItem = typeof quotationItems.$inferSelect;
export type QuotationStatus = (typeof quotationStatusValues)[number];
