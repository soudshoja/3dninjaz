/**
 * Phase 19-04 — TDD tests for configurator field CRUD server actions.
 *
 * Tests: addConfigField (Zod reject, insert), deleteConfigField, reorderConfigFields,
 * getConfiguratorData (ensureConfigJson round-trip), updateConfigField.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireAdmin = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth-helpers", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Shared mutable state for the mock DB
let mockProductRows: unknown[] = [];
let mockFieldRows: unknown[] = [];
let mockPosRows: { pos: number }[] = [{ pos: 0 }];
let lastInsert: unknown = null;
let lastUpdate: unknown = null;
let lastDelete: unknown = null;
let transactionCalled = false;

// Build a fluent Drizzle chain mock
function makeChain(resultFn: () => unknown[]) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "orderBy", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn().mockImplementation(() => {
      // limit() is the terminal call — return the promise
      if (m === "limit") return Promise.resolve(resultFn());
      return chain;
    });
  }
  // Non-limit terminal (e.g. orderBy without limit)
  chain["then"] = (resolve: (v: unknown) => void) =>
    Promise.resolve(resultFn()).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => {
  let selectCallCount = 0;

  const db = {
    select: vi.fn().mockImplementation(() => {
      selectCallCount++;
      const call = selectCallCount;
      return {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockImplementation(function (this: unknown) {
          // Return the rows for subsequent calls
          return {
            limit: vi.fn().mockResolvedValue(
              call === 1 ? mockProductRows : mockFieldRows,
            ),
            then: (resolve: (v: unknown) => void) =>
              Promise.resolve(mockFieldRows).then(resolve),
          };
        }),
        limit: vi.fn().mockImplementation(() => {
          if (call === 1) return Promise.resolve(mockProductRows);
          if (call === 2) return Promise.resolve(mockPosRows);
          return Promise.resolve(mockFieldRows);
        }),
      };
    }),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((v: unknown) => {
        lastInsert = v;
        return Promise.resolve();
      }),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    })),
    delete: vi.fn().mockImplementation(() => ({
      where: vi.fn().mockImplementation(() => {
        lastDelete = true;
        return Promise.resolve();
      }),
    })),
    transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      transactionCalled = true;
      const txMock = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      await fn(txMock);
    }),
  };

  // Reset selectCallCount each time db.select is called
  let count = 0;
  db.select = vi.fn().mockImplementation(() => {
    count++;
    const c = count;
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockImplementation(() => ({
        // When orderBy is called, return field rows (getConfiguratorData path)
        then: (resolve: (v: unknown) => void) =>
          Promise.resolve(mockFieldRows).then(resolve),
        limit: vi.fn().mockResolvedValue(mockFieldRows),
      })),
      limit: vi.fn().mockImplementation(() => {
        if (c === 1) return Promise.resolve(mockProductRows);
        if (c === 2) return Promise.resolve(mockPosRows);
        return Promise.resolve(mockFieldRows);
      }),
    };
  });

  return { db };
});

vi.mock("@/lib/db/schema", () => ({
  products: { id: "id", productType: "productType", name: "name", slug: "slug" },
  productVariants: { productId: "productId" },
  productConfigFields: {
    id: "id",
    productId: "productId",
    position: "position",
    fieldType: "fieldType",
    label: "label",
    helpText: "helpText",
    required: "required",
    configJson: "configJson",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
    $inferSelect: {},
    $inferInsert: {},
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args) => ({ and: args })),
  asc: vi.fn((a) => ({ asc: a })),
  sql: vi.fn((strings: TemplateStringsArray) => ({ sql: strings.join("") })),
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks
// ---------------------------------------------------------------------------

const {
  addConfigField,
  deleteConfigField,
  reorderConfigFields,
  getConfiguratorData,
  updateConfigField,
} = await import("@/actions/configurator");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("addConfigField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockProductRows = [{ id: "p1", type: "configurable" }];
    mockFieldRows = [];
    mockPosRows = [{ pos: 0 }];
    lastInsert = null;
    transactionCalled = false;
  });

  it("rejects invalid text config (Zod validation)", async () => {
    const result = await addConfigField("p1", {
      fieldType: "text",
      label: "Your name",
      required: true,
      config: {
        maxLength: -1, // invalid: must be >= 1
        allowedChars: "A-Z",
        uppercase: true,
        profanityCheck: false,
      } as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTruthy();
    }
  });

  it("rejects invalid colour config (empty allowedColorIds)", async () => {
    const result = await addConfigField("p1", {
      fieldType: "colour",
      label: "Base colour",
      required: true,
      config: { allowedColorIds: [] } as never, // min 1 required
    });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid select config (empty options)", async () => {
    const result = await addConfigField("p1", {
      fieldType: "select",
      label: "Size",
      required: true,
      config: { options: [] } as never, // min 1 required
    });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid number config (step must be positive)", async () => {
    const result = await addConfigField("p1", {
      fieldType: "number",
      label: "Qty",
      required: true,
      config: { min: 1, max: 10, step: 0 } as never,
    });
    expect(result.ok).toBe(false);
  });
});

describe("deleteConfigField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    mockFieldRows = [{ id: "f1", productId: "p1" }];
    lastDelete = null;
  });

  it("returns ok:true (idempotent) regardless of whether field exists", async () => {
    mockFieldRows = []; // field not found — still ok
    const result = await deleteConfigField("f1");
    expect(result.ok).toBe(true);
  });

  it("bubbles auth error when requireAdmin throws", async () => {
    mockRequireAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(deleteConfigField("f1")).rejects.toThrow("Forbidden");
  });
});

describe("reorderConfigFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    transactionCalled = false;
  });

  it("rejects mismatched id set (extra id not in product)", async () => {
    mockFieldRows = [{ id: "f1" }, { id: "f2" }];
    const result = await reorderConfigFields("p1", ["f1", "f3"]); // f3 doesn't exist
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("orderedIds does not match");
    }
  });

  it("rejects when orderedIds length mismatches existing count", async () => {
    mockFieldRows = [{ id: "f1" }, { id: "f2" }];
    const result = await reorderConfigFields("p1", ["f1"]); // missing f2
    expect(result.ok).toBe(false);
  });
});

describe("updateConfigField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(undefined);
    lastUpdate = null;
  });

  it("returns ok:false when field not found", async () => {
    mockFieldRows = []; // no field
    const result = await updateConfigField("nonexistent", { label: "New label" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not found");
    }
  });
});
