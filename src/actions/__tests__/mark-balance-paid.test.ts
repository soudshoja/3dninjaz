/**
 * markBalancePaid — refuses cancelled / nothing-due / nothing-paid orders,
 * requires admin, and otherwise settles the balance.
 * Run: npx vitest run src/actions/__tests__/mark-balance-paid.test.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/actions/shipping", () => ({ refreshOrderShipping: vi.fn() }));

const requireAdmin = vi.fn();
vi.mock("@/lib/auth-helpers", () => ({ requireAdmin: () => requireAdmin() }));

let mockOrder: Record<string, unknown> | undefined;
const setSpy = vi.fn();
let affectedRows = 1;

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
        return { where: vi.fn(async () => [{ affectedRows }]) };
      }),
    })),
  },
}));

// eslint-disable-next-line import/first
import { markBalancePaid } from "@/actions/admin-order-edit";
// eslint-disable-next-line import/first
import { canSettleBalance } from "@/lib/balance-settle";

function order(o: Record<string, unknown> = {}) {
  return {
    id: "o1",
    status: "paid",
    totalAmount: "111.90",
    amountPaid: "87.40",
    ...o,
  };
}

beforeEach(() => {
  requireAdmin.mockReset();
  requireAdmin.mockResolvedValue(undefined);
  setSpy.mockClear();
  affectedRows = 1;
  mockOrder = order();
});

describe("markBalancePaid", () => {
  it("requires admin (rejection propagates, nothing written)", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized"));
    await expect(markBalancePaid("o1")).rejects.toThrow("Unauthorized");
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("refuses a cancelled order", async () => {
    mockOrder = order({ status: "cancelled" });
    const res = await markBalancePaid("o1");
    expect(res.ok).toBe(false);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("refuses when nothing is due", async () => {
    mockOrder = order({ amountPaid: "111.90" });
    const res = await markBalancePaid("o1");
    expect(res).toMatchObject({ ok: false, error: "There is no balance due on this order." });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("refuses when no payment was ever recorded", async () => {
    mockOrder = order({ status: "pending", amountPaid: "0.00" });
    const res = await markBalancePaid("o1");
    expect(res.ok).toBe(false);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("returns not found for a missing order", async () => {
    mockOrder = undefined;
    expect(await markBalancePaid("nope")).toMatchObject({ ok: false });
  });

  it("settles the balance (amountPaid set from totalAmount)", async () => {
    const res = await markBalancePaid("o1");
    expect(res).toEqual({ ok: true });
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy.mock.calls[0][0]).toHaveProperty("amountPaid");
  });

  it("reports a concurrent change when the conditional update matches no row", async () => {
    affectedRows = 0;
    const res = await markBalancePaid("o1");
    expect(res.ok).toBe(false);
  });
});

describe("canSettleBalance", () => {
  it("allows a paid order with a balance", () => {
    expect(canSettleBalance({ status: "paid", totalAmount: "111.90", amountPaid: "87.40" })).toEqual({ ok: true });
  });
  it("handles float-ish values", () => {
    expect(canSettleBalance({ status: "paid", totalAmount: 0.3, amountPaid: 0.1 + 0.2 }).ok).toBe(false);
  });
});
