import {
  mysqlTable,
  varchar,
  text,
  boolean,
  int,
  decimal,
  timestamp,
  mysqlEnum,
  json,
} from "drizzle-orm/mysql-core";
import { relations, sql } from "drizzle-orm";

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
  // Max 5 enforced at app level (D-03).
  images: json("images").$type<string[]>().notNull().default([]),
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
