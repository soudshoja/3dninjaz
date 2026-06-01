import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sendResetPasswordEmail } from "@/lib/mailer";
import { sendWelcomeEmail } from "@/actions/send-emails";
import { normalizePhoneMy } from "@/lib/phone";
import { isNull, eq } from "drizzle-orm";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "mysql",
    schema: schema,
  }),
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
          // Welcome email
          try {
            await sendWelcomeEmail(user.email, user.name);
          } catch (err) {
            console.error("[auth] welcome email dispatch failed:", err);
          }

          // Guest-order linking: if the new user provided a phone number,
          // find all guest orders (userId IS NULL) whose shippingPhone
          // normalizes to the same canonical Malaysian number, then assign
          // them to this new account.
          //
          // Low-volume at launch — in-memory filter across all guest orders
          // is acceptable. Add a DB index on orders.shipping_phone if volume
          // grows to justify it.
          const rawPhone = (user as { phone?: string | null }).phone;
          if (rawPhone && rawPhone.trim().length <= 32) {
            try {
              const normalizedNew = normalizePhoneMy(rawPhone);
              if (normalizedNew) {
                const guestOrders = await db
                  .select({ id: schema.orders.id, shippingPhone: schema.orders.shippingPhone })
                  .from(schema.orders)
                  .where(isNull(schema.orders.userId));

                const toLink = guestOrders.filter(
                  (o) => normalizePhoneMy(o.shippingPhone) === normalizedNew,
                );

                for (const o of toLink) {
                  await db
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
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || "http://localhost:3000",
    "https://app.3dninjaz.com", // Production subdomain (current live)
    "https://3dninjaz.com", // Apex domain (defensive — in case forms post or we swap)
    "http://localhost:3000", // Local development
    "http://127.0.0.1:3000", // Local development (IP)
  ],
  plugins: [
    admin({
      defaultRole: "customer", // D-08: all registrations default to customer
    }),
  ],
});
