/**
 * Phase 19-05 — TDD tests for saveTierTable server action.
 *
 * Tests: bad maxUnitCount, missing tier key, negative price, unknown unitField,
 * unitField wrong type, valid input acceptance.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireAdmin = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth-helpers", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Queue of results — each db.select().from().where().limit() pops from front
let selectResultQueue: unknown[][] = [];

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          const result = selectResultQueue.shift();
          return Promise.resolve(result ?? []);
        }),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      })),
    },
  };
});

vi.mock("@/lib/db/schema", () => ({
  products: { id: "id", slug: "slug" },
  productConfigFields: {
    id: "id",
    productId: "productId",
    fieldType: "fieldType",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args) => ({ and: args })),
  sql: vi.fn((strings: TemplateStringsArray) => ({ sql: strings.join("") })),
  asc: vi.fn((a) => ({ asc: a })),
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

const { saveTierTable } = await import("@/actions/configurator");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("saveTierTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    selectResultQueue = [];
  });

  it("rejects maxUnitCount = 0 (must be integer ≥ 1)", async () => {
    // Validation is synchronous — no DB calls needed
    const result = await saveTierTable("p1", 0, {}, "field-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("maxUnitCount must be an integer");
    }
  });

  it("rejects maxUnitCount = 201 (must be ≤ 200)", async () => {
    const result = await saveTierTable("p1", 201, {}, "field-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("maxUnitCount must be an integer");
    }
  });

  it("rejects priceTiers with missing key (1..maxUnitCount incomplete)", async () => {
    // maxUnitCount=3 but only keys "1","2" — missing "3"
    const result = await saveTierTable("p1", 3, { "1": 7, "2": 9 }, "field-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("priceTiers must have exactly keys");
    }
  });

  it("rejects priceTiers with extra key beyond maxUnitCount", async () => {
    // maxUnitCount=2 but key "3" present
    const result = await saveTierTable("p1", 2, { "1": 7, "2": 9, "3": 12 }, "field-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("priceTiers must have exactly keys");
    }
  });

  it("rejects negative price in tier", async () => {
    const result = await saveTierTable("p1", 2, { "1": 7, "2": -1 }, "field-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("must be a non-negative number");
    }
  });

  it("rejects unknown unitField (field not on this product)", async () => {
    // First select (field lookup) returns empty → not found
    selectResultQueue = [[]];
    const result = await saveTierTable("p1", 2, { "1": 7, "2": 9 }, "unknown-field");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("unitField does not exist");
    }
  });

  it("rejects unitField that is a colour field (not text or number)", async () => {
    // First select returns a colour field
    selectResultQueue = [[{ fieldType: "colour" }]];
    const result = await saveTierTable("p1", 2, { "1": 7, "2": 9 }, "colour-field");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("unitField must be a text or number field");
    }
  });

  it("accepts valid input (text field, complete tiers) and returns ok:true", async () => {
    // Queue: field lookup → text field; product lookup → product with slug
    selectResultQueue = [
      [{ fieldType: "text" }],
      [{ slug: "custom-name-keychain" }],
    ];
    const tiers: Record<string, number> = {};
    for (let i = 1; i <= 8; i++) tiers[String(i)] = i * 3;
    const result = await saveTierTable("p1", 8, tiers, "name-field");
    expect(result.ok).toBe(true);
  });
});
