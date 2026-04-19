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
