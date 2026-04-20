import "server-only";
import {
  Client,
  Environment,
  LogLevel,
  OrdersController,
  PaymentsController,
} from "@paypal/paypal-server-sdk";

// Phase 7 (07-02) — DisputesController is NOT exposed by
// @paypal/paypal-server-sdk v2.3.x. We use direct fetch + OAuth bearer for
// every disputes/reporting endpoint via paypalApiBase() + getAccessToken()
// helpers below.

/**
 * Server-only PayPal SDK client singleton (D3-06).
 *
 * Why server-only:
 * - `import "server-only"` triggers a build error if any client component
 *   imports this file — guarantees PAYPAL_CLIENT_SECRET never leaks to the
 *   browser bundle.
 *
 * Why a singleton:
 * - The SDK caches OAuth access tokens internally (~9h TTL). Constructing a
 *   new Client per request would issue fresh token requests on every call.
 *   We stash the instance on `globalThis` so Next.js hot-reloads in dev
 *   reuse the cached client.
 */

/**
 * Currency enforced for every PayPal order in v1. MYR is supported by PayPal
 * only for Malaysian-registered business accounts. If the upstream account is
 * not Malaysian, the SDK will surface CURRENCY_NOT_SUPPORTED on ordersCreate —
 * that error must be caught and reported in Plan 02's create-order action.
 */
export const PAYPAL_CURRENCY = "MYR" as const;

declare global {
  // eslint-disable-next-line no-var
  var __paypalClient: Client | undefined;
}

/**
 * Returns Environment.Production when PAYPAL_ENV is "live" (or "production"),
 * otherwise Environment.Sandbox. Defaults to Sandbox when unset so a missing
 * env var cannot accidentally charge a live account.
 */
export function getPayPalEnvironment(): Environment {
  const env = (process.env.PAYPAL_ENV ?? "sandbox").toLowerCase();
  if (env === "live" || env === "production") return Environment.Production;
  return Environment.Sandbox;
}

/**
 * Reads the correct client ID / secret pair for the selected environment.
 * Live uses PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET.
 * Sandbox prefers PAYPAL_CLIENT_ID_SANDBOX / PAYPAL_CLIENT_SECRET_SANDBOX;
 * falls back to the plain PAYPAL_CLIENT_ID / SECRET if the sandbox-suffixed
 * vars are not set (operator-friendly for single-env setups).
 */
function resolveCredentials(): { clientId: string; clientSecret: string } {
  const isLive = getPayPalEnvironment() === Environment.Production;
  const clientId = isLive
    ? process.env.PAYPAL_CLIENT_ID
    : process.env.PAYPAL_CLIENT_ID_SANDBOX ?? process.env.PAYPAL_CLIENT_ID;
  const clientSecret = isLive
    ? process.env.PAYPAL_CLIENT_SECRET
    : process.env.PAYPAL_CLIENT_SECRET_SANDBOX ??
      process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "[paypal] PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set. See .env.local.example.",
    );
  }
  return { clientId, clientSecret };
}

/**
 * Returns the cached PayPal Client instance, constructing it on first call.
 * Subsequent calls return the same object so the SDK's internal token cache
 * is reused across requests.
 */
export function getPayPalClient(): Client {
  if (global.__paypalClient) return global.__paypalClient;

  const { clientId, clientSecret } = resolveCredentials();

  const client = new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: clientId,
      oAuthClientSecret: clientSecret,
    },
    timeout: 30_000,
    environment: getPayPalEnvironment(),
    logging: {
      logLevel:
        process.env.NODE_ENV === "production" ? LogLevel.Warn : LogLevel.Info,
      // NEVER log request/response bodies — they contain card metadata,
      // buyer PII, and occasionally the OAuth token on auth errors.
      logRequest: { logBody: false },
      logResponse: { logBody: false },
    },
  });

  global.__paypalClient = client;
  return client;
}

/**
 * Convenience: returns a fresh OrdersController bound to the singleton
 * client. Controllers are cheap to construct — safe to call per request.
 */
export function ordersController(): OrdersController {
  return new OrdersController(getPayPalClient());
}

/**
 * Convenience: returns a fresh PaymentsController bound to the singleton
 * client. Use for refund / capture-lookup flows in Plan 02 / Plan 04.
 */
export function paymentsController(): PaymentsController {
  return new PaymentsController(getPayPalClient());
}

// ============================================================================
// Phase 7 (07-02) — extended helpers
//
// Adds:
//   - getCaptureDetails(captureId): fetches gross / fee / net / seller-protection
//     for the /admin/payments financials panel.
//   - getAccessToken(): cached OAuth bearer for Reporting API + Disputes API
//     (the SDK does not expose either as a controller in v2.3.x).
//   - paypalApiBase(): per-environment base URL.
//
// Sibling files (paypal-refund.ts, paypal-disputes.ts, paypal-reporting.ts)
// import these helpers via "server-only" imports.
// ============================================================================

export type CaptureDetails = {
  id: string;
  status: string;
  grossValue: string;
  currency: string;
  feeValue: string | null;
  netValue: string | null;
  sellerProtection: string | null;
  createTime: string;
  updateTime: string;
  /**
   * PayPal v2 does not expose an explicit settle_date; updateTime when
   * status=COMPLETED is the proxy. Documented in 07-02 SUMMARY.
   */
  settleDate: string | null;
};

/**
 * Fetch a capture's full payment detail — gross MYR, PayPal fee, net to
 * seller, seller-protection eligibility, settle date. Used by the
 * /admin/payments enrichment in Plan 07-04 + the refund cap calc in
 * Plan 07-05.
 *
 * Returns null on 404 (capture not yet settled or invalid id).
 */
export async function getCaptureDetails(
  captureId: string,
): Promise<CaptureDetails | null> {
  try {
    const r = await paymentsController().getCapturedPayment({ captureId });
    const c = r.result;
    const breakdown = c.sellerReceivableBreakdown;
    return {
      id: c.id ?? captureId,
      status: c.status ?? "UNKNOWN",
      grossValue:
        breakdown?.grossAmount?.value ?? c.amount?.value ?? "0.00",
      currency:
        breakdown?.grossAmount?.currencyCode ??
        c.amount?.currencyCode ??
        "MYR",
      feeValue: breakdown?.paypalFee?.value ?? null,
      netValue: breakdown?.netAmount?.value ?? null,
      sellerProtection: c.sellerProtection?.status ?? null,
      createTime: c.createTime ?? new Date().toISOString(),
      updateTime: c.updateTime ?? new Date().toISOString(),
      settleDate: c.updateTime ?? null,
    };
  } catch (err) {
    const raw = (() => {
      try {
        return (
          JSON.stringify(err) + String((err as Error)?.message ?? "")
        );
      } catch {
        return String(err ?? "");
      }
    })();
    if (raw.includes("RESOURCE_NOT_FOUND") || raw.includes("404")) {
      return null;
    }
    console.error("[paypal] getCaptureDetails failed:", err);
    throw err;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __paypalToken: { token: string; expiresAt: number } | undefined;
}

/**
 * OAuth access token cached in module memory (~9h TTL via PayPal). Re-fetches
 * via /v1/oauth2/token with Basic auth when expired or missing.
 *
 * Used by paypal-disputes.ts, paypal-reporting.ts, and any direct-fetch
 * helper that needs a bearer string.
 */
export async function getAccessToken(): Promise<string> {
  const cached = global.__paypalToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const isLive = getPayPalEnvironment() === Environment.Production;
  const base = isLive
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
  const clientId = isLive
    ? process.env.PAYPAL_CLIENT_ID
    : process.env.PAYPAL_CLIENT_ID_SANDBOX ?? process.env.PAYPAL_CLIENT_ID;
  const secret = isLive
    ? process.env.PAYPAL_CLIENT_SECRET
    : process.env.PAYPAL_CLIENT_SECRET_SANDBOX ??
      process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new Error("[paypal] missing credentials for OAuth");
  }
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const r = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`[paypal] OAuth failed: ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  global.__paypalToken = {
    token: j.access_token,
    expiresAt: Date.now() + j.expires_in * 1000,
  };
  return j.access_token;
}

export function paypalApiBase(): string {
  return getPayPalEnvironment() === Environment.Production
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}
