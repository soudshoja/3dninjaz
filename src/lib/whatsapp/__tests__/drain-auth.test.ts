import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isDrainAuthenticated } from "@/lib/whatsapp/drain-auth";

const URL_BASE = "http://127.0.0.1:3000/api/internal/whatsapp/drain";

describe("isDrainAuthenticated", () => {
  const saved = process.env.WHATSAPP_OUTBOX_DRAIN_SECRET;
  beforeEach(() => {
    process.env.WHATSAPP_OUTBOX_DRAIN_SECRET = "s3cret-value";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.WHATSAPP_OUTBOX_DRAIN_SECRET;
    else process.env.WHATSAPP_OUTBOX_DRAIN_SECRET = saved;
  });

  it("accepts the secret in the x-drain-secret header", () => {
    const req = new Request(URL_BASE, {
      method: "POST",
      headers: { "x-drain-secret": "s3cret-value" },
    });
    expect(isDrainAuthenticated(req)).toBe(true);
  });

  it("REJECTS the secret when supplied in the query string", () => {
    const req = new Request(`${URL_BASE}?secret=s3cret-value`, { method: "POST" });
    expect(isDrainAuthenticated(req)).toBe(false);
  });

  it("rejects a wrong or different-length header secret", () => {
    for (const v of ["nope", "s3cret-valuX", "s3cret-value-longer", ""]) {
      const req = new Request(URL_BASE, { method: "POST", headers: { "x-drain-secret": v } });
      expect(isDrainAuthenticated(req)).toBe(false);
    }
  });

  it("fails closed when the env secret is unset or empty", () => {
    for (const v of [undefined, ""]) {
      if (v === undefined) delete process.env.WHATSAPP_OUTBOX_DRAIN_SECRET;
      else process.env.WHATSAPP_OUTBOX_DRAIN_SECRET = v;
      const req = new Request(URL_BASE, { method: "POST", headers: { "x-drain-secret": "" } });
      expect(isDrainAuthenticated(req)).toBe(false);
    }
  });
});
