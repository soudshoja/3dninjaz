import {
  mysqlTable,
  varchar,
  text,
  mediumtext,
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

export const categories = mysqlTable("categories", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`(UUID())`),
  name: varchar("name", { length: 100 }).notNull().unique(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const products = mysqlTable("products", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`(UUID())`),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 220 }).notNull().unique(),
  description: text("description").notNull(),
  // Relative URLs served from public/uploads/products/<id>/<file>.
  // Stored as JSON array of strings (MySQL has no native array type).
  // Max 10 enforced at app level (raised from 5 post-launch).
  images: json("images").$type<string[]>().notNull().default([]),
  // Index into `images` that should be used as the storefront card thumbnail.
  // Defaults to 0 so existing rows behave identically. Out-of-range values
  // (image deleted after selection) are coerced back to 0 at the read site.
  thumbnailIndex: int("thumbnail_index").notNull().default(0),
  materialType: varchar("material_type", { length: 64 }),
  estimatedProductionDays: int("estimated_production_days"),
  isActive: boolean("is_active").notNull().default(true), // ADM-04
  isFeatured: boolean("is_featured").notNull().default(false), // D-12
  categoryId: varchar("category_id", { length: 36 }).references(
    () => categories.id
  ),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .onUpdateNow(),
});

export const productVariants = mysqlTable("product_variants", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`(UUID())`),
  productId: varchar("product_id", { length: 36 })
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  size: mysqlEnum("size", ["S", "M", "L"]).notNull(), // D-13
  price: decimal("price", { precision: 10, scale: 2 }).notNull(), // MYR
  widthCm: decimal("width_cm", { precision: 6, scale: 1 }),
  heightCm: decimal("height_cm", { precision: 6, scale: 1 }),
  depthCm: decimal("depth_cm", { precision: 6, scale: 1 }),
  // Phase 5 05-01 — per-variant inventory toggle (INV-01) and optional low-stock
  // alert threshold (INV-02). inStock defaults TRUE so existing rows remain
  // available after migration; lowStockThreshold is null until admin sets it.
  inStock: boolean("in_stock").notNull().default(true),
  lowStockThreshold: int("low_stock_threshold"),
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
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(
  productVariants,
  ({ one }) => ({
    product: one(products, {
      fields: [productVariants.productId],
      references: [products.id],
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
  size: mysqlEnum("size", ["S", "M", "L"]).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
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
  whatsappNumber: varchar("whatsapp_number", { length: 32 }).notNull(),
  whatsappNumberDisplay: varchar("whatsapp_number_display", { length: 32 }).notNull(),
  instagramUrl: varchar("instagram_url", { length: 500 }).notNull().default("#"),
  tiktokUrl: varchar("tiktok_url", { length: 500 }).notNull().default("#"),
  bannerText: varchar("banner_text", { length: 500 }),
  bannerEnabled: boolean("banner_enabled").notNull().default(false),
  // NULL means free-shipping disabled
  freeShipThreshold: decimal("free_ship_threshold", { precision: 10, scale: 2 }),
  // SST (Malaysian Sales & Service Tax). Default OFF per Phase 4 D-03.
  sstEnabled: boolean("sst_enabled").notNull().default(false),
  sstRate: decimal("sst_rate", { precision: 4, scale: 2 }).notNull().default("6.00"),
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
    whatsappNumber: "60000000000",
    whatsappNumberDisplay: "+60 00 000 0000",
    instagramUrl: "#",
    tiktokUrl: "#",
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

export function seedEmailTemplates(): EmailTemplateSeed[] {
  // Stub HTML — Wave 3 plan 05-06 replaces with the real template content
  // pulled from src/lib/email/order-confirmation.ts.
  return [
    {
      key: "order_confirmation",
      subject: "Your 3D Ninjaz order {{order_number}} is confirmed",
      html: `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#F7FAF4;color:#0B1020;padding:24px;"><h1>Thanks, {{customer_name}}!</h1><p>Your order {{order_number}} is confirmed. Total: {{order_total}}.</p>{{items_table}}<p><a href="{{order_link}}">View your order</a></p></body></html>`,
      variables: [
        "customer_name",
        "order_number",
        "order_total",
        "order_link",
        "items_table",
      ],
    },
    {
      key: "password_reset",
      subject: "Reset your 3D Ninjaz password",
      html: `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#F7FAF4;color:#0B1020;padding:24px;"><h1>Hi {{customer_name}},</h1><p>Click below to reset your password. The link expires in 1 hour.</p><p><a href="{{reset_link}}">Reset password</a></p><p>If you did not request this, ignore this email.</p></body></html>`,
      variables: ["customer_name", "reset_link"],
    },
  ];
}
