import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { sendText } from "@/lib/whatsapp/client";
import { classifyFailure } from "@/lib/whatsapp/outbox-types";

afterEach(() => vi.unstubAllGlobals());

describe("sendText timeout mapping", () => {
  it("maps AbortSignal.timeout's TimeoutError to error 'timeout' (unconfirmed)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError")),
    );
    const r = await sendText({ number: "60123450550", text: "x" });
    expect(r).toMatchObject({ ok: false, httpStatus: null, error: "timeout" });
    expect(classifyFailure(r.httpStatus, r.error)).toBe("unconfirmed");
  });

  it("leaves other network errors as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")));
    const r = await sendText({ number: "60123450550", text: "x" });
    expect(classifyFailure(r.httpStatus, r.error)).toBe("retryable");
  });
});
