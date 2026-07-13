import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "@/lib/db/schema";
import { sendResetPasswordEmail } from "@/lib/mailer";
import { sendWelcomeEmail } from "@/actions/send-emails";
import { normalizePhoneMy } from "@/lib/phone";
import { publicOrigin } from "@/lib/public-url";
import { isNull, eq } from "drizzle-orm";
import type { Tenant } from "@/lib/tenant/platform-schema";

// ============================================================================
// Phase 24 (24-02) — auth.ts converted from a module-scope Better Auth
// singleton into a per-tenant factory. See ARCHITECTURE.md:226-232 for the
// three hazards this fixes: (1) databaseHooks closing over a singleton db
// (guest-order linking could cross tenants), (2) welcome/reset emails using
// the global transport, (3) a HARDCODED trustedOrigins array (the exact bug
// class behind incident d421bd9).
//
// Local structural alias — mirrors src/lib/tenant/pool-manager.ts's own
// `TenantDb` definition (MySql2Database<typeof schema>) without importing
// it, so this file has no ordering dependency on that module's export
// within the wave. TS is structural: a value typed via either alias
// satisfies the other.
// ============================================================================
type TenantDb = MySql2Database<typeof schema>;

/**
 * Today's exact static trustedOrigins array, reproduced byte-for-byte for
 * single mode (and the synthesized "single" tenant). In registry mode,
 * origins are derived from the tenant's registry domain — NEVER a hardcoded
 * literal (the d421bd9 incident class).
 */
function tenantTrustedOrigins(tenant: Tenant): string[] {
  const registryMode =
    process.env.TENANT_MODE === "registry" && tenant.id !== "single";

  if (!registryMode) {
    return [
      process.env.BETTER_AUTH_URL || "http://localhost:3000",
      "https://app.3dninjaz.com", // Production subdomain (current live)
      "https://3dninjaz.com", // Apex domain (defensive — in case forms post or we swap)
      "http://localhost:3000", // Local development
      "http://127.0.0.1:3000", // Local development (IP)
    ];
  }

  return [
    publicOrigin(tenant),
    `https://${tenant.primaryDomain}`,
    "http://localhost:3000", // Local development
    "http://127.0.0.1:3000", // Local development (IP)
  ];
}

/**
 * Per-tenant Better Auth factory. Closes over the PASSED tenant db (never a
 * module singleton), so `databaseHooks` — guest-order phone-linking and the
 * welcome-email dispatch — can never touch another tenant's data. `baseURL`
 * and `trustedOrigins` derive from the tenant's registry domain in registry
 * mode; single mode reproduces today's exact env-driven behavior
 * byte-for-byte.
 */
export function buildTenantAuth(tenant: Tenant, tenantDb: TenantDb) {
  const registryMode =
    process.env.TENANT_MODE === "registry" && tenant.id !== "single";

  return betterAuth({
    database: drizzleAdapter(tenantDb, {
      provider: "mysql",
      schema: schema,
    }),
    // W5/W8 byte-identity: today auth.ts sets NO explicit baseURL and lets
    // Better Auth INFER it per-request. BETTER_AUTH_URL (when set) always
    // wins, unchanged. In single mode with BETTER_AUTH_URL unset (e.g. local
    // dev) this expression evaluates to `undefined`, so Better Auth keeps
    // inferring EXACTLY as today — pinning it to publicOrigin(tenant) here
    // would wrongly bake the prod origin into local dev (the W5 regression).
    // Registry mode with no BETTER_AUTH_URL override derives the tenant's
    // registry canonical domain.
    baseURL: process.env.BETTER_AUTH_URL ?? (registryMode ? publicOrigin(tenant) : undefined),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        // Await the SMTP send. Previously `void sendResetPasswordEmail(...)`,
        // but on Node-runtime server handlers Next.js may abort the pending
        // promise after the Better Auth response returns to the client, so
        // password-reset emails were silently failing. sendResetPasswordEmail
        // catches its own SMTP errors and never throws, so awaiting only
        // adds latency, never risk. Same fix pattern as the welcome and
        // order-confirmation emails (see PR #39).
        await sendResetPasswordEmail({
          to: user.email,
          name: user.name,
          url,
          tenant,
        });
      },
    },
    // Welcome email now fires from a server-side Better Auth hook (after the
    // user row is inserted) instead of the client fire-and-forget that the
    // signup forms used to do. Previously the browser would redirect away
    // before the `void sendWelcomeEmail(...)` POST finished, so the email
    // was cancelled mid-flight and never delivered. The hook runs inside
    // the signup handler, so the response only returns once the send has
    // been attempted (errors are caught + logged inside sendWelcomeEmail).
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Welcome email — threads the closed-over `tenant` (this hook is
            // a buildTenantAuth(tenant, db) parameter, so no new resolution
            // is needed). Byte-identical in single mode (one transport).
            try {
              await sendWelcomeEmail(user.email, user.name, tenant);
            } catch (err) {
              console.error("[auth] welcome email dispatch failed:", err);
            }

            // Guest-order linking: if the new user provided a phone number,
            // find all guest orders (userId IS NULL) whose shippingPhone
            // normalizes to the same canonical Malaysian number, then assign
            // them to this new account.
            //
            // Runs against `tenantDb` — the db PASSED into buildTenantAuth,
            // never a module singleton — so a new user on Tenant B can never
            // link Tenant A's guest orders (ARCHITECTURE.md:226-232 hazard 1).
            //
            // Low-volume at launch — in-memory filter across all guest orders
            // is acceptable. Add a DB index on orders.shipping_phone if volume
            // grows to justify it.
            const rawPhone = (user as { phone?: string | null }).phone;
            if (rawPhone && rawPhone.trim().length <= 32) {
              try {
                const normalizedNew = normalizePhoneMy(rawPhone);
                if (normalizedNew) {
                  const guestOrders = await tenantDb
                    .select({
                      id: schema.orders.id,
                      shippingPhone: schema.orders.shippingPhone,
                    })
                    .from(schema.orders)
                    .where(isNull(schema.orders.userId));

                  const toLink = guestOrders.filter(
                    (o) => normalizePhoneMy(o.shippingPhone) === normalizedNew,
                  );

                  for (const o of toLink) {
                    await tenantDb
                      .update(schema.orders)
                      .set({ userId: user.id })
                      .where(eq(schema.orders.id, o.id));
                  }

                  if (toLink.length > 0) {
                    console.info(
                      `[auth] linked ${toLink.length} guest order(s) to new user ${user.id} via phone ${normalizedNew}`,
                    );
                  }
                }
              } catch (err) {
                // A linking failure must never break signup.
                console.error("[auth] guest-order linking failed:", err);
              }
            }
          },
        },
      },
    },
    user: {
      additionalFields: {
        pdpaConsentAt: {
          type: "date",
          required: false,
          input: true, // Allow setting during signup (D-09)
        },
        // phone: used for guest-order linking when the user registers after a
        // guest checkout. Stored on the user row; normalised in the hook above.
        // The DB column is varchar(32); values longer than 32 chars are rejected
        // by the linking hook defensively (skipped) and the DB constraint at the
        // storage layer.
        phone: {
          type: "string",
          required: false,
          input: true,
        },
      },
    },
    trustedOrigins: tenantTrustedOrigins(tenant),
    plugins: [
      admin({
        defaultRole: "customer", // D-08: all registrations default to customer
      }),
    ],
  });
}
