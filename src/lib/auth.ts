import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sendResetPasswordEmail } from "@/lib/mailer";
import { sendWelcomeEmail } from "@/actions/send-emails";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "mysql",
    schema: schema,
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      // Fire-and-forget so the handler response isn't blocked by SMTP latency.
      // Any SMTP errors are logged inside sendResetPasswordEmail.
      void sendResetPasswordEmail({
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
          try {
            await sendWelcomeEmail(user.email, user.name);
          } catch (err) {
            console.error("[auth] welcome email dispatch failed:", err);
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
