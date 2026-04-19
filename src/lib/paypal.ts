import "server-only";
import {
  Client,
  Environment,
  LogLevel,
  OrdersController,
  PaymentsController,
} from "@paypal/paypal-server-sdk";

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
