/**
 * B-4 (IG WebView hardening plan, payment integrity) — capturePaymentLinkPayment
 * must reject a client-supplied paypalOrderId that doesn't match the id we
 * ourselves recorded on the order when the PayPal order was created for this
 * link. Without this check a caller holding a valid link token could approve
 * a cheap PayPal order elsewhere and pass its id here to mark an expensive
 * order paid.
 *
 * Run: npx vitest run src/actions/__tests__/payment-links-capture.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/order-confirmation", () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/whatsapp/sender", () => ({
  sendWhatsAppNotification: vi.fn().mockResolvedValue(undefined),
  sendWhatsAppInvoicePdf: vi.fn().mockResolvedValue(undefined),
}));
// Both pull in `import "server-only"`, which throws under vitest (no Next.js
// "react-server" condition to resolve it to the no-op build). None of these
// tests reach the capture-or-storage code paths, so a stub is safe.
vi.mock("@/lib/paypal", () => ({
  ordersController: vi.fn(),
  PAYPAL_CURRENCY: "MYR",
}));
vi.mock("@/lib/payment-proof-storage", () => ({
  writePaymentProof: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock DB — supports the exact call shapes getPaymentLinkByToken +
// capturePaymentLinkPayment make: db.query.paymentLinks.findFirst,
// db.query.orders.findFirst, and three db.select().from(table).where()
// [.orderBy()] reads (order_items / payment_proofs / coupon_redemptions).
// ---------------------------------------------------------------------------

let mockLink: Record<string, unknown> | undefined;
let mockOrder: Record<string, unknown> | undefined;

function selectResult(rows: unknown[]) {
  const result: Record<string, unknown> = {
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  // Support both `await db.select()...where()` (no orderBy) and
  // `await db.select()...where().orderBy()`.
  (result as unknown as PromiseLike<unknown[]>).then = ((
    resolve: (v: unknown) => void,
    reject?: (e: unknown) => void,
  ) => Promise.resolve(rows).then(resolve, reject)) as never;
  return result;
}

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      paymentLinks: { findFirst: vi.fn(async () => mockLink) },
      orders: { findFirst: vi.fn(async () => mockOrder) },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => selectResult([])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

// eslint-disable-next-line import/first
import { capturePaymentLinkPayment } from "@/actions/payment-links";

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const RECORDED_PAYPAL_ORDER_ID = "8LR12345REAL";

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    status: "pending",
    paypalCaptureId: null,
    paypalOrderId: RECORDED_PAYPAL_ORDER_ID,
    totalAmount: "50.00",
    subtotal: "50.00",
    shippingCost: "0.00",
    shippingServiceName: null,
    shippingServiceCode: null,
    currency: "MYR",
    paymentMethod: null,
    customItemName: null,
    customItemDescription: null,
    customImages: null,
    customerEmail: "buyer@3dninjaz.local",
    shippingPhone: null,
    shippingName: "Buyer",
    ...overrides,
  };
}

function baseLink(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    token: "tok-1",
    orderId: "order-1",
    expiresAt: FUTURE,
    usedAt: null,
    ...overrides,
  };
}

describe("capturePaymentLinkPayment — B-4 id-mismatch guard", () => {
  beforeEach(() => {
    mockLink = baseLink();
    mockOrder = baseOrder();
  });

  it("rejects a paypalOrderId that does not match the order's recorded id", async () => {
    const result = await capturePaymentLinkPayment({
      token: "tok-1",
      paypalOrderId: "SOME-OTHER-ORDER-APPROVED-ELSEWHERE",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/does not match/i);
    }
  });

  it("rejects any paypalOrderId when the order has none recorded yet", async () => {
    mockOrder = baseOrder({ paypalOrderId: null });
    const result = await capturePaymentLinkPayment({
      token: "tok-1",
      paypalOrderId: "CLIENT-SUPPLIED-ID",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no paypal order/i);
    }
  });

  it("existing idempotency: already-captured order returns ok without re-checking the id", async () => {
    mockOrder = baseOrder({ paypalCaptureId: "CAPTURE-1", status: "paid" });
    const result = await capturePaymentLinkPayment({
      token: "tok-1",
      paypalOrderId: "ANYTHING-EVEN-MISMATCHED",
    });
    expect(result.ok).toBe(true);
  });

  it("existing idempotency: already-paid link (view.paid) short-circuits before the id check", async () => {
    mockOrder = baseOrder({ status: "paid", paypalCaptureId: "CAPTURE-1" });
    mockLink = baseLink({ usedAt: new Date() });
    const result = await capturePaymentLinkPayment({
      token: "tok-1",
      paypalOrderId: "ANYTHING",
    });
    expect(result.ok).toBe(true);
  });
});
