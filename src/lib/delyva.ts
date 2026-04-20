import "server-only";

// ============================================================================
// Delyva delivery API client (server-only).
// Phase 9 (09-01). Typed fetch wrapper + DelyvaError for clean error surface.
//
// Design notes
//   - Never import this from a client component — the API key leaks.
//   - All responses from the Malaysian prod endpoint wrap the payload in
//     `{ data: ... }`. We unwrap in unwrap() at the end of delyva().
//   - Binary responses (PDF label) return the raw Response — caller is
//     responsible for arrayBuffer()/stream handling. We flag PDF-vs-JSON by
//     Content-Type.
//   - DelyvaError carries code/details/httpStatus so callers can build
//     targeted UX (e.g. "outside cancel window").
// ============================================================================

const BASE = process.env.DELYVA_BASE_URL ?? "https://api.delyva.app/v1.0";
const KEY = process.env.DELYVA_API_KEY ?? "";
const CUSTOMER_ID = Number(process.env.DELYVA_CUSTOMER_ID ?? 0);
const COMPANY_CODE = process.env.DELYVA_COMPANY_CODE ?? "my";

export class DelyvaError extends Error {
  constructor(
    public code: string,
    public details: unknown,
    public httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "DelyvaError";
  }
}

// --------------------------- Types ---------------------------

export type DelyvaAddress = {
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string; // ISO-2 (MY)
  coord?: { lat: number; lon: number };
};

export type DelyvaContact = DelyvaAddress & {
  name: string;
  email: string;
  phone: string;
};

export type DelyvaWeight = { unit: "kg"; value: number };
export type DelyvaDimension = { length: number; width: number; height: number };

export type DelyvaServiceAddon = { id: number; value: string };

export type QuoteInput = {
  origin: DelyvaAddress;
  destination: DelyvaAddress;
  weight: DelyvaWeight;
  itemType: "PARCEL" | "PACKAGE" | "BULKY";
  dimension?: DelyvaDimension;
  serviceAddon?: DelyvaServiceAddon[];
};

/**
 * Real shape of an entry in the /service/instantQuote `services[]` array.
 *
 * Verified live against api.delyva.app/v1.0 on 2026-04-20. Earlier doc drafts
 * claimed a flat `serviceCompany.companyCode` at the top level — that is
 * incorrect. The useful identifiers live inside the nested `service` object:
 *
 *   - `service.code`            e.g. "SPXDMY-PN-BD1"   <-- this is what you
 *     pass to POST /order as `serviceCode`
 *   - `service.name`            e.g. "SPX Express"
 *   - `service.serviceType`     e.g. "NDD" | "NDD-DROP" | "COD-NDD" | "INSTANT"
 *   - `service.serviceCompany.companyCode`  e.g. "SPXDMY"  <-- courier brand,
 *     useful for grouping/allowlisting multiple rate tiers of the same courier
 *   - `service.serviceCompany.name`         e.g. "SPX Express"
 *   - `service.serviceCompany.logo`
 *
 * Responses may also include entries that lack either block. All callers
 * should parse defensively — see `parseQuoteServices()` below.
 */
export type QuoteServiceCompany = {
  id?: number;
  companyCode: string;
  name: string;
  logo?: string;
};

export type QuoteServiceInner = {
  id?: number;
  code: string;
  name?: string;
  serviceType?: string;
  serviceCompany?: QuoteServiceCompany;
  operationType?: { cod?: boolean; pickup?: boolean; dropoff?: boolean };
};

export type QuoteService = {
  price: { amount: number; currency: string };
  weight?: { value: number };
  distance?: { value: number; unit: string };
  etaMin?: number; // minutes
  etaMax?: number;
  service?: QuoteServiceInner;
  // Defensive: some legacy responses surfaced a flat serviceCompany at the
  // top level. Keep optional so we can parse either shape.
  serviceCompany?: QuoteServiceCompany;
};

export type QuoteResponse = {
  services: QuoteService[];
};

/**
 * Normalized shape our app code consumes downstream — a single code+name+price
 * tuple that hides the nested / legacy structural variance of Delyva's response.
 */
export type NormalizedQuoteOption = {
  serviceCode: string; // e.g. "SPXDMY-PN-BD1" — pass to POST /order
  serviceName: string; // e.g. "SPX Express" — human label
  companyCode: string | null; // e.g. "SPXDMY" — brand grouping (optional)
  companyName: string | null; // e.g. "SPX Express"
  companyLogo: string | null;
  price: { amount: number; currency: string };
  etaMin: number | null;
  etaMax: number | null;
  serviceType: string | null;
};

/**
 * Defensive parser for the `services[]` array returned by /service/instantQuote.
 *
 * Handles:
 *  - Null / undefined / missing `services` field → []
 *  - Null entries in the array (Delyva occasionally returns placeholders)
 *  - Either shape: `{ service: { code, serviceCompany } }` (current) OR
 *    `{ serviceCompany: { companyCode } }` (legacy flat shape — unlikely now)
 *  - Entries with neither code nor companyCode → dropped
 */
export function parseQuoteServices(
  raw: QuoteResponse | { services?: unknown } | null | undefined,
): NormalizedQuoteOption[] {
  const list = Array.isArray(raw?.services) ? (raw!.services as unknown[]) : [];
  const out: NormalizedQuoteOption[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const s = entry as QuoteService;
    const inner = s.service;
    const flatCompany = s.serviceCompany;
    const innerCompany = inner?.serviceCompany;

    // Identifier used for booking — prefer the nested service.code; fall back
    // to companyCode only if the inner object is missing (legacy).
    const serviceCode =
      inner?.code ??
      innerCompany?.companyCode ??
      flatCompany?.companyCode ??
      null;
    if (!serviceCode) continue;

    const serviceName =
      inner?.name ??
      innerCompany?.name ??
      flatCompany?.name ??
      serviceCode;

    const company = innerCompany ?? flatCompany ?? null;

    const priceAmount = Number(s.price?.amount ?? 0);
    const priceCurrency = s.price?.currency ?? "MYR";

    out.push({
      serviceCode,
      serviceName,
      companyCode: company?.companyCode ?? null,
      companyName: company?.name ?? null,
      companyLogo: company?.logo ?? null,
      price: { amount: priceAmount, currency: priceCurrency },
      etaMin: typeof s.etaMin === "number" ? s.etaMin : null,
      etaMax: typeof s.etaMax === "number" ? s.etaMax : null,
      serviceType: inner?.serviceType ?? null,
    });
  }
  return out;
}

export type InventoryItem = {
  name: string;
  type: "PARCEL" | "PACKAGE" | "BULKY";
  price: { currency: string; amount: number };
  weight: DelyvaWeight;
  dimension?: DelyvaDimension;
  quantity: number;
};

export type CreateOrderInput = {
  serviceCode: string;
  source: string;
  extId?: string;
  referenceNo: string;
  origin: {
    scheduledAt: string; // ISO 8601
    inventory: InventoryItem[];
    contact: DelyvaContact;
  };
  destination: {
    scheduledAt: string;
    contact: DelyvaContact;
  };
  cod?: { currency: string; amount: number };
  insurance?: { currency: string; amount: number };
};

export type ProcessInput = {
  serviceCode: string;
  originScheduledAt: string;
  destinationScheduledAt: string;
};

export type OrderDetails = {
  id: number;
  statusCode: number;
  statusMessage?: string;
  consignmentNo?: string;
  trackingNo?: string;
  serviceCode?: string;
  personnel?: {
    name?: string;
    phone?: string;
    vehicle?: string;
    plate?: string;
    coord?: { lat: number; lon: number };
  };
  tracking?: Array<{ statusCode: number; at: string; note?: string }>;
};

export type UserResponse = {
  id: string;
  companyId: string;
  name: string;
  apiSecret: string;
  subscription?: string;
  // Many more fields exist; we only care about name/apiSecret for now.
};

// --------------------------- Core fetch ---------------------------

type DelyvaEnvelope<T> = { data?: T } & Partial<T>;

function unwrap<T>(body: unknown): T {
  // Delyva prod responses are shaped `{ data: {...} }`. Some legacy shapes
  // return the payload at the top level. Accept either.
  if (body && typeof body === "object" && "data" in (body as object)) {
    return (body as DelyvaEnvelope<T>).data as T;
  }
  return body as T;
}

async function delyva<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!KEY) throw new DelyvaError("CONFIG", null, 0, "DELYVA_API_KEY missing");

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Delyvax-Access-Token": KEY,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  // PDF label endpoint returns application/pdf — hand back the raw Response
  // so the caller can stream/buffer as needed.
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/pdf")) {
    if (!res.ok) {
      throw new DelyvaError(
        "PDF_ERROR",
        null,
        res.status,
        `Delyva ${path} returned ${res.status}`,
      );
    }
    return res as unknown as T;
  }

  let body: unknown = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }

  if (!res.ok || (body as { error?: boolean })?.error) {
    const b = body as {
      code?: string;
      message?: string;
      details?: unknown;
      error?: { code?: string; message?: string; details?: unknown };
    };
    throw new DelyvaError(
      b.code ?? b.error?.code ?? "UNKNOWN",
      b.details ?? b.error?.details,
      res.status,
      b.message ?? b.error?.message ?? `Delyva ${path} failed (${res.status})`,
    );
  }

  return unwrap<T>(body);
}

// --------------------------- Public API ---------------------------

/**
 * Wrapper surface for Delyva endpoints used by admin + (later) checkout.
 * Every mutation path enforces the customerId from env so we never rely on
 * client-supplied identifiers.
 */
export const delyvaApi = {
  /**
   * POST /service/instantQuote — list courier options for a given parcel.
   */
  quote: (input: QuoteInput) =>
    delyva<QuoteResponse>("/service/instantQuote", {
      method: "POST",
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        companyCode: COMPANY_CODE,
        ...input,
      }),
    }),

  /**
   * POST /order with process: false — two-step booking. Follow with process()
   * to actually dispatch the courier.
   */
  createDraft: (input: CreateOrderInput) =>
    delyva<{ id: number; statusCode: number; referenceNo?: string }>("/order", {
      method: "POST",
      body: JSON.stringify({
        customerId: CUSTOMER_ID,
        companyCode: COMPANY_CODE,
        process: false,
        ...input,
      }),
    }),

  /**
   * POST /order/{id}/process — dispatch the previously-created draft.
   */
  process: (id: number, input: ProcessInput) =>
    delyva<{ id: number; statusCode: number; message?: string }>(
      `/order/${id}/process`,
      { method: "POST", body: JSON.stringify(input) },
    ),

  /**
   * GET /order/{id} — fetch latest state, personnel info, tracking timeline.
   */
  getOrder: (id: number | string) =>
    delyva<OrderDetails>(`/order/${id}`),

  /**
   * Same as getOrder but caps the outbound fetch at `timeoutMs` (default 5s)
   * via AbortController. Used by tracking render paths that must not hang a
   * page render — caller should fall back to the cached order_shipments row
   * when this throws a DelyvaError with code "TIMEOUT".
   *
   * Separate helper (rather than a flag on getOrder) so the happy path in
   * booking/cancel flows keeps the old "wait as long as it takes" semantics.
   */
  getOrderFast: async (
    id: number | string,
    timeoutMs = 5000,
  ): Promise<OrderDetails> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await delyva<OrderDetails>(`/order/${id}`, {
        signal: controller.signal,
      });
    } catch (e) {
      if (
        (e as { name?: string })?.name === "AbortError" ||
        (e as { code?: string })?.code === "ABORT_ERR"
      ) {
        throw new DelyvaError(
          "TIMEOUT",
          null,
          0,
          `Delyva /order/${id} did not respond within ${timeoutMs}ms`,
        );
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * GET /order/{id}/label — binary PDF. Caller must arrayBuffer().
   */
  label: (id: number | string) => delyva<Response>(`/order/${id}/label`),

  /**
   * POST /order/{id}/cancel — subject to service-specific time windows.
   * See SKILL.md cancellation rules.
   */
  cancel: (id: number | string) =>
    delyva<{ id: number; statusCode: number; message?: string }>(
      `/order/${id}/cancel`,
      { method: "POST", body: "{}" },
    ),

  /**
   * POST /webhook — register a webhook URL for a specific event.
   * Verified against api.delyva.app/v1.0 on 2026-04-20: the endpoint is
   * `/webhook` (not `/webhook/subscribe`) and only accepts { event, url }.
   * The `secret` field is rejected; HMAC verification on the receiver uses
   * DELYVA_WEBHOOK_SHARED_SECRET that Delyva signs outbound calls with.
   * Multiple subscriptions for the same (event, url) pair create duplicate
   * rows on Delyva's side — callers should delete duplicates via the
   * webhook list API if needed.
   */
  subscribeWebhook: (event: string, url: string, _secret?: string) =>
    delyva<{ id?: string | number; event: string; url: string }>("/webhook", {
      method: "POST",
      body: JSON.stringify({ event, url }),
    }),

  /**
   * GET /user — account info + apiSecret. Cached at env level; avoid calling
   * repeatedly.
   */
  getUser: () => delyva<UserResponse>("/user"),
};

export { BASE as DELYVA_BASE, KEY as DELYVA_KEY, CUSTOMER_ID as DELYVA_CUSTOMER_ID_NUM };
