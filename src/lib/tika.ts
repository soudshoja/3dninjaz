import "server-only";

// ============================================================================
// Apache Tika client — text/OCR extraction for invoice import.
//
// Tika runs at TIKA_URL (default: the n8n-box instance, apache/tika:latest-full
// with tesseract OCR). It extracts text from PDFs, Office docs, AND photos of
// receipts (OCR). HTTP-only, so no ESM/CJS bundling concern.
//
// The /tika endpoint accepts the raw file body via PUT and returns plain text
// with `Accept: text/plain`. We send octet-stream + let Tika sniff the type.
// ============================================================================

const TIKA_URL = process.env.TIKA_URL ?? "http://37.60.226.116:9998/tika";

export async function tikaExtract(
  fileBody: Buffer,
  timeoutMs = 45000,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(TIKA_URL, {
      method: "PUT",
      headers: {
        Accept: "text/plain",
        "Content-Type": "application/octet-stream",
      },
      // Buffer is a Uint8Array subclass — a valid BodyInit.
      body: new Uint8Array(fileBody),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Tika returned HTTP ${res.status}`);
    }
    // Guard against a 200 that carries an HTML/error body instead of text.
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !ct.includes("text/plain") && !ct.includes("text/")) {
      throw new Error(`Tika returned unexpected content-type: ${ct}`);
    }
    return (await res.text()).trim();
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    if (name === "AbortError") {
      throw new Error(`Tika did not respond within ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
