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

export type QuoteService = {
  serviceCompany: {
    companyCode: string;
    name: string;
    logo?: string;
  };
  price: { amount: number; currency: string };
  etaMin?: number; // minutes
  etaMax?: number;
  // Other fields exist on the response — we surface the important ones only.
};

export type QuoteResponse = {
  services: QuoteService[];
};

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
   * POST /webhook/subscribe — register a webhook URL for a specific event.
   * Idempotent on (url, event) per Delyva docs.
   */
  subscribeWebhook: (event: string, url: string, secret: string) =>
    delyva<{ id?: string | number; event: string; url: string }>(
      "/webhook/subscribe",
      {
        method: "POST",
        body: JSON.stringify({ event, url, secret }),
      },
    ),

  /**
   * GET /user — account info + apiSecret. Cached at env level; avoid calling
   * repeatedly.
   */
  getUser: () => delyva<UserResponse>("/user"),
};

export { BASE as DELYVA_BASE, KEY as DELYVA_KEY, CUSTOMER_ID as DELYVA_CUSTOMER_ID_NUM };
