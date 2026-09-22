/**
 * updateOrderShipTo — 260922-shipto. Gated on ACTUAL Delyva shipment booking
 * state (hasActiveShipment), not order.status — refuses when an active
 * shipment exists, succeeds otherwise regardless of status (including the
 * new capability: succeeding on a `shipped` order with no active shipment).
 * Run: npx vitest run src/actions/__tests__/update-order-shipto.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireAdmin = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({ requireAdmin: () => requireAdmin() }));

// admin-orders.ts pulls in a wide import graph (email, WhatsApp, PDF, coupons)
// for its other exports — none of that is exercised here, but several of
// those modules `import "server-only"`, which throws outside a real Next.js
// server render. Stub them out so the module graph loads.
vi.mock("@/actions/coupons", () => ({ validateCoupon: vi.fn() }));
vi.mock("@/actions/send-emails", () => ({
  sendOrderProcessingEmail: vi.fn(),
  sendOrderShippedEmail: vi.fn(),
}));
vi.mock("@/lib/email/order-confirmation", () => ({
  sendOrderConfirmationEmail: vi.fn(),
}));
vi.mock("@/lib/whatsapp/sender", () => ({
  sendWhatsAppNotification: vi.fn(),
  sendWhatsAppInvoicePdf: vi.fn(),
}));
vi.mock("@/lib/pdf/render-invoice", () => ({
  renderInvoicePdfBase64: vi.fn(),
}));
vi.mock("@/lib/whatsapp/client", () => ({ sendMedia: vi.fn() }));
vi.mock("@/lib/whatsapp/events", () => ({ normalizeMsisdn: vi.fn() }));
vi.mock("@/lib/whatsapp/settings", () => ({ getWhatsappStateFresh: vi.fn() }));
vi.mock("@/lib/public-url", () => ({ publicUrl: vi.fn() }));

// Two queues, keyed by call order: 1st db.select() call in the action is the
// `orders` existence check, 2nd is the `orderShipments` lookup. We drive both
// off simple module-level state set per test.
let orderRow: Record<string, unknown> | undefined;
let shipmentRow: Record<string, unknown> | undefined;
let selectCallCount = 0;
const setSpy = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => {
      selectCallCount += 1;
      const call = selectCallCount;
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              if (call === 1) return orderRow ? [orderRow] : [];
              return shipmentRow ? [shipmentRow] : [];
            }),
          })),
        })),
      };
    }),
    update: vi.fn(() => ({
      set: vi.fn((v: unknown) => {
        setSpy(v);
        return { where: vi.fn(async () => [{ affectedRows: 1 }]) };
      }),
    })),
  },
}));

// eslint-disable-next-line import/first
import { updateOrderShipTo } from "@/actions/admin-orders";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    shippingName: "Ali bin Abu",
    shippingPhone: "+60123456789",
    shippingLine1: "No. 1, Jalan Test",
    shippingLine2: "",
    shippingCity: "Petaling Jaya",
    shippingState: "Selangor",
    shippingPostcode: "47300",
    ...overrides,
  };
}

beforeEach(() => {
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue(undefined);
  setSpy.mockClear();
  selectCallCount = 0;
  orderRow = { id: "o1" };
  shipmentRow = undefined;
});

describe("updateOrderShipTo", () => {
  it("requires admin (rejection propagates, nothing written)", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized"));
    await expect(updateOrderShipTo("o1", validInput())).rejects.toThrow(
      "Unauthorized",
    );
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("returns not found for a missing order", async () => {
    orderRow = undefined;
    const res = await updateOrderShipTo("nope", validInput());
    expect(res).toMatchObject({ ok: false });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("refuses when an active shipment exists (delyvaOrderId set, not cancelled)", async () => {
    shipmentRow = { delyvaOrderId: "DLV-123", statusCode: 110 };
    const res = await updateOrderShipTo("o1", validInput());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/cancel the shipment/i);
    }
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("succeeds when no shipment row exists at all", async () => {
    shipmentRow = undefined;
    const res = await updateOrderShipTo("o1", validInput());
    expect(res).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it("succeeds when a shipment row exists but has no delyvaOrderId (draft-only)", async () => {
    shipmentRow = { delyvaOrderId: null, statusCode: null };
    const res = await updateOrderShipTo("o1", validInput());
    expect(res).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it("succeeds when the existing shipment's booking is cancelled (statusCode 900)", async () => {
    shipmentRow = { delyvaOrderId: "DLV-123", statusCode: 900 };
    const res = await updateOrderShipTo("o1", validInput());
    expect(res).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it("NEW CAPABILITY: succeeds on a shipped order with no active shipment — status is irrelevant to this gate", async () => {
    orderRow = { id: "o1", status: "shipped" };
    shipmentRow = undefined;
    const res = await updateOrderShipTo("o1", validInput());
    expect(res).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses on a pending order when it somehow already has an active shipment", async () => {
    orderRow = { id: "o1", status: "pending" };
    shipmentRow = { delyvaOrderId: "DLV-999", statusCode: 110 };
    const res = await updateOrderShipTo("o1", validInput());
    expect(res.ok).toBe(false);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("still validates input before touching the shipment gate", async () => {
    const res = await updateOrderShipTo("o1", validInput({ shippingName: "" }));
    expect(res.ok).toBe(false);
    expect(setSpy).not.toHaveBeenCalled();
  });
});
