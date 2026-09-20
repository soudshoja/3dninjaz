import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const run = vi.hoisted(() => vi.fn());
vi.mock("@/lib/delivery-sync", () => ({ runDeliverySync: run }));

import { POST } from "./route";
import { NextRequest } from "next/server";

const SECRET = "s3cret-value-for-tests";
const mk = (headers: Record<string, string> = {}, qs = "") =>
  new NextRequest(`http://127.0.0.1:3000/api/internal/delivery-sync${qs}`, {
    method: "POST",
    headers,
  });

describe("POST /api/internal/delivery-sync auth", () => {
  const saved = process.env.DELIVERY_SYNC_SECRET;
  beforeEach(() => {
    run.mockReset();
    run.mockResolvedValue({ checked: 2, delivered: 1, errors: 0 });
    process.env.DELIVERY_SYNC_SECRET = SECRET;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.DELIVERY_SYNC_SECRET;
    else process.env.DELIVERY_SYNC_SECRET = saved;
    vi.restoreAllMocks();
  });

  it("accepts the correct header and returns the summary", async () => {
    const res = await POST(mk({ "x-delivery-sync-secret": SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 2, delivered: 1, errors: 0 });
  });

  it("rejects a missing header", async () => {
    expect((await POST(mk())).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret (same and different length)", async () => {
    expect((await POST(mk({ "x-delivery-sync-secret": "x".repeat(SECRET.length) }))).status).toBe(401);
    expect((await POST(mk({ "x-delivery-sync-secret": "short" }))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects the secret passed in the query string", async () => {
    const res = await POST(mk({}, `?secret=${SECRET}&x-delivery-sync-secret=${SECRET}`));
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("fails closed when the env secret is unset or empty", async () => {
    delete process.env.DELIVERY_SYNC_SECRET;
    expect((await POST(mk({ "x-delivery-sync-secret": "" }))).status).toBe(503);
    expect((await POST(mk({ "x-delivery-sync-secret": "anything" }))).status).toBe(503);
    process.env.DELIVERY_SYNC_SECRET = "";
    expect((await POST(mk({ "x-delivery-sync-secret": "" }))).status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not leak the secret in error output", async () => {
    run.mockRejectedValue(new Error("db down"));
    const res = await POST(mk({ "x-delivery-sync-secret": SECRET }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(SECRET);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(SECRET);
  });
});
