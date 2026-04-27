import {
  mysqlTable,
  varchar,
  text,
  mediumtext,
  longtext,
  boolean,
  int,
  decimal,
  timestamp,
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
  productType: mysqlEnum("productType", ["stocked", "configurable"]).notNull().default("stocked"),
  // Tier-pricing trio (NULL for stocked products):
  //   maxUnitCount = highest count the admin wants to price (e.g., 8 for keychain)
  //   priceTiers   = JSON object {"1":7,"2":9,...} stored as LONGTEXT — round-trip via ensureTiers()
  //   unitField    = name of the config field whose value-length drives lookup ("name" for keychain)
  maxUnitCount: int("maxUnitCount"),
  priceTiers: text("priceTiers"),
  unitField: varchar("unitField", { length: 64 }),
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
    fieldType: mysqlEnum("fieldType", ["text", "number", "colour", "select"]).notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    helpText: varchar("helpText", { length: 200 }),
    required: boolean("required").notNull().default(true),
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

export const orderStatusValues = [
  "pending",
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
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id), // NO cascade — keep orders if user is deleted (PDPA audit, D3-23)
  status: mysqlEnum("status", orderStatusValues).notNull().default("pending"),
  // PayPal identifiers (nullable until each phase of the payment flow completes)
  paypalOrderId: varchar("paypal_order_id", { length: 64 }).unique(),
  paypalCaptureId: varchar("paypal_capture_id", { length: 64 }),
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
});

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(user, { fields: [orders.userId], references: [user.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
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
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => user.id), // NO cascade — PDPA audit (T-05-01-PDPA)
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
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

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
    whatsappNumber: "60000000000",
    whatsappNumberDisplay: "+60 00 000 0000",
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

function brandedEmailTemplate(
  headingEmoji: string,
  heading: string,
  body: string,
  cta?: { text: string; url: string },
  ctaColor: string = "#0080ff"
): string {
  const ctaHtml = cta
    ? `<tr><td align="center" style="padding:16px 32px 32px">
        <a href="{{${cta.url}}}" style="display:inline-block;padding:12px 28px;background:${ctaColor};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">${cta.text}</a>
      </td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{subject}}</title>
</head>
<body style="margin:0;padding:0;background:#FAFAFA;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#3f3f46">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#FAFAFA;border-collapse:collapse">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:100%;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;border-collapse:collapse">
        <tr>
          <td align="center" style="padding:32px 32px 16px;border-collapse:collapse">
            <img src="https://app.3dninjaz.com/icons/ninja/logo.png" alt="3D Ninjaz" width="200" style="display:block;max-width:100%;height:auto">
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px 16px;border-collapse:collapse">
            <div style="font-size:80px">${headingEmoji}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 0;color:#0B1020;font-size:24px;font-weight:600;line-height:1.3;text-align:center;border-collapse:collapse">
            ${heading}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 32px;color:#3f3f46;font-size:15px;line-height:1.6;border-collapse:collapse">
            ${body}
          </td>
        </tr>
        ${ctaHtml}
        <tr>
          <td style="padding:16px 32px 32px;border-top:1px solid #f1f5f9;color:#71717a;font-size:13px;line-height:1.5;text-align:center;border-collapse:collapse">
            <p style="margin:0 0 8px">© {{current_year}} 3D Ninjaz · Kuala Lumpur, Malaysia</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function seedEmailTemplates(): EmailTemplateSeed[] {
  return [
    {
      key: "order_confirmation",
      subject: "Order #{{order_number}} confirmed — thanks from 3D Ninjaz 🥷",
      html: brandedEmailTemplate(
        "✓",
        "Your order is confirmed!",
        `<p>Thanks, {{customer_name}}!</p>
        <p>Your order <strong>#{{order_number}}</strong> is confirmed.</p>
        <p><strong>Total:</strong> {{order_total}}</p>
        {{items_table}}
        <p style="margin-top:16px">We'll prepare your 3D printed items and ship them ASAP.</p>`,
        { text: "View Order", url: "order_link" }
      ),
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
    {
      key: "order_shipped",
      subject: "Your 3D Ninjaz order is on its way! ({{courier_name}})",
      html: brandedEmailTemplate(
        "📦",
        "Your order is shipped!",
        `<p>Hey {{customer_name}},</p>
        <p>Your order <strong>#{{order_number}}</strong> has been dispatched.</p>
        <p><strong>Courier:</strong> {{courier_name}}<br>
        <strong>Tracking:</strong> {{tracking_no}}<br>
        <strong>Consignment:</strong> {{consignment_no}}</p>
        <p style="margin-top:16px">Click below to track your delivery in real-time.</p>`,
        { text: "Track Package", url: "tracking_link" }
      ),
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
    {
      key: "order_delivered",
      subject: "Your 3D Ninjaz order has been delivered 🎉",
      html: brandedEmailTemplate(
        "🎉",
        "Delivered!",
        `<p>Hey {{customer_name}},</p>
        <p>Your order <strong>#{{order_number}}</strong> has been delivered to your doorstep.</p>
        <p style="margin-top:16px">We hope you love your 3D printed items! If you have any questions, feel free to reach out.</p>`,
        { text: "View Order", url: "order_link" }
      ),
      variables: [
        "customer_name",
        "order_number",
        "order_link",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    {
      key: "order_refunded",
      subject: "Refund processed for order #{{order_number}}",
      html: brandedEmailTemplate(
        "💰",
        "Your refund has been processed",
        `<p>Hi {{customer_name}},</p>
        <p>We've refunded <strong>{{refund_amount}}</strong> for order <strong>#{{order_number}}</strong>.</p>
        <p style="margin-top:16px">The refund should appear in your account within 3-5 business days.</p>
        <p>If you have questions, contact us at <a href="mailto:{{support_email}}" style="color:#0080ff">{{support_email}}</a></p>`,
        { text: "View Order", url: "order_link" }
      ),
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
    {
      key: "order_cancelled",
      subject: "Order #{{order_number}} has been cancelled",
      html: brandedEmailTemplate(
        "❌",
        "Order cancelled",
        `<p>Hi {{customer_name}},</p>
        <p>Your order <strong>#{{order_number}}</strong> has been cancelled.</p>
        <p><strong>Reason:</strong> {{cancellation_reason}}</p>
        <p style="margin-top:16px">If this was unexpected, please contact us at <a href="mailto:{{support_email}}" style="color:#0080ff">{{support_email}}</a></p>`,
        { text: "Contact Support", url: "support_email" }
      ),
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
    {
      key: "password_reset",
      subject: "Reset your 3D Ninjaz password",
      html: brandedEmailTemplate(
        "🔑",
        "Reset your password",
        `<p>Hi {{customer_name}},</p>
        <p>We received a request to reset your password. Click the link below to create a new password.</p>
        <p style="margin-top:16px;font-size:13px;color:#666">This link expires in 1 hour. If you didn't request this, ignore this email.</p>`,
        { text: "Reset Password", url: "reset_link" }
      ),
      variables: [
        "customer_name",
        "reset_link",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    {
      key: "password_changed",
      subject: "Your 3D Ninjaz password was changed",
      html: brandedEmailTemplate(
        "✓",
        "Password updated",
        `<p>Hi {{customer_name}},</p>
        <p>Your password has been successfully changed.</p>
        <p style="margin-top:16px">If you didn't make this change, please contact us immediately at <a href="mailto:{{support_email}}" style="color:#0080ff">{{support_email}}</a></p>`,
        undefined
      ),
      variables: [
        "customer_name",
        "store_name",
        "store_url",
        "current_year",
        "support_email",
      ],
    },
    {
      key: "welcome",
      subject: "Welcome to 3D Ninjaz! 🥷",
      html: brandedEmailTemplate(
        "👋",
        "Welcome to 3D Ninjaz!",
        `<p>Hi {{customer_name}},</p>
        <p>Your account is ready to go. Browse our collection of unique 3D printed items and start shopping.</p>
        <p style="margin-top:16px">We can't wait to see what you'll love!</p>`,
        { text: "Shop Now", url: "shop_link", }
      ),
      variables: [
        "customer_name",
        "store_name",
        "store_url",
        "current_year",
        "shop_link",
      ],
    },
    {
      key: "newsletter_welcome",
      subject: "You're in! News from the 3D Ninjaz crew",
      html: brandedEmailTemplate(
        "📬",
        "Welcome to our newsletter!",
        `<p>Thanks for subscribing to 3D Ninjaz news.</p>
        <p>You'll be the first to hear about new products, exclusive deals, and behind-the-scenes 3D printing stories.</p>
        <p style="margin-top:24px;font-size:13px;color:#71717a">
          <a href="{{unsubscribe_link}}" style="color:#71717a">Unsubscribe</a>
        </p>`,
        undefined
      ),
      variables: [
        "subscriber_email",
        "store_name",
        "store_url",
        "current_year",
        "unsubscribe_link",
      ],
    },
    {
      key: "newsletter_unsubscribed",
      subject: "You've been unsubscribed from 3D Ninjaz updates",
      html: brandedEmailTemplate(
        "👋",
        "You've unsubscribed",
        `<p>Your email has been removed from our mailing list.</p>
        <p>You won't receive any further emails from us, but you can always resubscribe anytime from our website.</p>`,
        undefined
      ),
      variables: [
        "subscriber_email",
        "store_name",
        "store_url",
        "current_year",
      ],
    },
    {
      key: "dispute_opened_customer",
      subject: "Dispute opened for order #{{order_number}}",
      html: brandedEmailTemplate(
        "⚠️",
        "Dispute notification",
        `<p>Hi {{customer_name}},</p>
        <p>A dispute has been opened on your order <strong>#{{order_number}}</strong>.</p>
        <p><strong>Reason:</strong> {{dispute_reason}}</p>
        <p style="margin-top:16px">We're investigating and will keep you updated. Contact us at <a href="mailto:{{support_email}}" style="color:#0080ff">{{support_email}}</a> if you have additional details.</p>`,
        { text: "View Order", url: "order_link" }
      ),
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
    {
      key: "dispute_opened_admin",
      subject: "ADMIN: Dispute opened on order #{{order_number}}",
      html: brandedEmailTemplate(
        "⚠️",
        "New dispute alert",
        `<p>A dispute has been opened.</p>
        <p><strong>Customer:</strong> {{customer_name}}<br>
        <strong>Order:</strong> #{{order_number}}<br>
        <strong>Reason:</strong> {{dispute_reason}}<br>
        <strong>Amount:</strong> {{dispute_amount}}</p>
        <p style="margin-top:16px">Click below to view details and respond.</p>`,
        { text: "Review Dispute", url: "admin_link" },
        "#8A00C2"
      ),
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
  }),
);
