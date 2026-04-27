/**
 * Phase 19-03 — TDD tests for updateProductType server action.
 *
 * Mocks: db (Drizzle chain), requireAdmin.
 * Tests the 5 behaviour cases defined in the plan.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireAdmin = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth-helpers", () => ({ requireAdmin: mockRequireAdmin }));

// Drizzle mock — we build a fluent chain mock that the action uses.
// The action does: db.select(...).from(...).where(...).limit(n)
// and db.update(...).set(...).where(...)
// We use a chainable mock factory.

let mockSelectResults: unknown[] = [];
let mockCountResults: { count: number }[] = [];
let mockUpdateCalled = false;
let mockRevalidatePathSpy = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePathSpy,
}));

// Track which query is being performed
let selectCallCount = 0;

vi.mock("@/lib/db", () => {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) return Promise.resolve(mockSelectResults);
      return Promise.resolve(mockCountResults);
    }),
    set: vi.fn().mockReturnThis(),
  };

  return {
    db: {
      select: vi.fn().mockReturnValue(chain),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    },
  };
});

vi.mock("@/lib/db/schema", () => ({
  products: { id: "id", productType: "productType" },
  productVariants: { productId: "productId" },
  productConfigFields: { productId: "productId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  sql: vi.fn((strings: TemplateStringsArray, ...vals: unknown[]) => ({
    sql: strings.join(""),
    vals,
  })),
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------

const { updateProductType } = await import("@/actions/configurator");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("updateProductType", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    selectCallCount = 0;
    mockSelectResults = [];
    mockCountResults = [];
    mockUpdateCalled = false;
    mockRevalidatePathSpy.mockClear();
  });

  it("returns {ok:false, error:'Product not found'} for a nonexistent product", async () => {
    mockSelectResults = []; // empty = not found
    const result = await updateProductType("nonexistent-id", "configurable");
    expect(result).toEqual({ ok: false, error: "Product not found" });
  });

  it("returns {ok:true} immediately when the product is already the requested type (no-op fast path)", async () => {
    mockSelectResults = [{ id: "p1", type: "configurable" }];
    const result = await updateProductType("p1", "configurable");
    expect(result).toEqual({ ok: true });
  });

  it("returns {ok:false, error:'Cannot change product type with attached variants'} when stocked product has variants", async () => {
    mockSelectResults = [{ id: "p1", type: "stocked" }];
    mockCountResults = [{ count: 3 }]; // 3 variants attached
    const result = await updateProductType("p1", "configurable");
    expect(result).toEqual({
      ok: false,
      error: "Cannot change product type with attached variants",
    });
  });

  it("returns {ok:false, error:'Cannot change product type with attached config fields'} when configurable product has config fields", async () => {
    mockSelectResults = [{ id: "p1", type: "configurable" }];
    mockCountResults = [{ count: 2 }]; // 2 config fields attached
    const result = await updateProductType("p1", "stocked");
    expect(result).toEqual({
      ok: false,
      error: "Cannot change product type with attached config fields",
    });
  });

  it("bubbles auth error when requireAdmin throws", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(updateProductType("p1", "configurable")).rejects.toThrow("Forbidden");
  });
});
