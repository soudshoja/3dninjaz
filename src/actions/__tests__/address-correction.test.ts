/**
 * flagAddressCorrection / clearAddressCorrection — 260922-shipto.
 * Refuses non-shipped/delivered statuses, refuses an empty note, requires
 * admin, sets the three columns on success, and clear unsets them.
 * Run: npx vitest run src/actions/__tests__/address-correction.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const requireAdmin = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({ requireAdmin: () => requireAdmin() }));

// admin-orders.ts pulls in a wide import graph (email, WhatsApp, PDF, coupons)
// for its other exports — none of that is exercised by these tests, but
// several of those modules `import "server-only"`, which throws outside a
// real Next.js server render. Stub them out so the module graph loads.
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

let mockOrder: Record<string, unknown> | undefined;
const setSpy = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => (mockOrder ? [mockOrder] : [])),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((v: unknown) => {
        setSpy(v);
        return { where: vi.fn(async () => [{ affectedRows: 1 }]) };
      }),
    })),
  },
}));

// eslint-disable-next-line import/first
import {
  flagAddressCorrection,
  clearAddressCorrection,
} from "@/actions/admin-orders";

function order(o: Record<string, unknown> = {}) {
  return {
    id: "o1",
    status: "shipped",
    ...o,
  };
}

beforeEach(() => {
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue(undefined);
  setSpy.mockClear();
  mockOrder = order();
});

describe("flagAddressCorrection", () => {
  it("requires admin (rejection propagates, nothing written)", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized"));
    await expect(flagAddressCorrection("o1", "wrong unit number")).rejects.toThrow(
      "Unauthorized",
    );
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("refuses an empty note", async () => {
    const res = await flagAddressCorrection("o1", "   ");
    expect(res.ok).toBe(false);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("refuses a note over 2000 characters", async () => {
    const res = await flagAddressCorrection("o1", "x".repeat(2001));
    expect(res.ok).toBe(false);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("refuses a cancelled order", async () => {
    mockOrder = order({ status: "cancelled" });
    const res = await flagAddressCorrection("o1", "wrong unit number");
    expect(res.ok).toBe(false);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("refuses a pending (editable) order", async () => {
    mockOrder = order({ status: "pending" });
    const res = await flagAddressCorrection("o1", "wrong unit number");
    expect(res.ok).toBe(false);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("refuses a processing order", async () => {
    mockOrder = order({ status: "processing" });
    const res = await flagAddressCorrection("o1", "wrong unit number");
    expect(res.ok).toBe(false);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("returns not found for a missing order", async () => {
    mockOrder = undefined;
    const res = await flagAddressCorrection("nope", "wrong unit number");
    expect(res).toMatchObject({ ok: false });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("succeeds on a shipped order and sets the three columns", async () => {
    const res = await flagAddressCorrection("o1", "  wrong unit number  ");
    expect(res).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledTimes(1);
    const setArg = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.addressCorrectionRequested).toBe(true);
    expect(setArg.addressCorrectionNote).toBe("wrong unit number");
    expect(setArg.addressCorrectionRequestedAt).toBeInstanceOf(Date);
  });

  it("succeeds on a delivered order", async () => {
    mockOrder = order({ status: "delivered" });
    const res = await flagAddressCorrection("o1", "wrong postcode");
    expect(res).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it("re-flagging an already-flagged order just updates the note/timestamp (idempotent-safe)", async () => {
    mockOrder = order({
      addressCorrectionRequested: true,
      addressCorrectionNote: "old note",
    });
    const res = await flagAddressCorrection("o1", "updated note");
    expect(res).toEqual({ ok: true });
    const setArg = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.addressCorrectionNote).toBe("updated note");
  });
});

describe("clearAddressCorrection", () => {
  it("requires admin (rejection propagates, nothing written)", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized"));
    await expect(clearAddressCorrection("o1")).rejects.toThrow("Unauthorized");
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("returns not found for a missing order", async () => {
    mockOrder = undefined;
    const res = await clearAddressCorrection("nope");
    expect(res).toMatchObject({ ok: false });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("unsets the three columns", async () => {
    mockOrder = order({
      addressCorrectionRequested: true,
      addressCorrectionNote: "wrong unit number",
    });
    const res = await clearAddressCorrection("o1");
    expect(res).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledTimes(1);
    const setArg = setSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.addressCorrectionRequested).toBe(false);
    expect(setArg.addressCorrectionNote).toBeNull();
    expect(setArg.addressCorrectionRequestedAt).toBeNull();
  });
});
