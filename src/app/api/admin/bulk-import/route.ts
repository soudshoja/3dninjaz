import type { NextRequest } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { requireAdmin } from "@/lib/auth-helpers";

// ============================================================================
// Plan 05-05 — admin bulk-import upload endpoint.
//
// Threat mitigations:
//   - T-05-05-EoP: requireAdmin() FIRST; 403 for non-admin
//   - T-05-05-injection: 5MB cap, mime + extension check
//   - T-05-05-path-traversal: random UUID file name, fixed parent dir
// ============================================================================

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "text/csv",
  "application/vnd.ms-excel",
  "application/csv",
  "text/plain", // some browsers report .csv as text/plain
]);

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "No file" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: "File too large (max 5 MB)" }), {
      status: 413,
      headers: { "content-type": "application/json" },
    });
  }
  const fileMime = file.type ?? "";
  const looksLikeCsv = file.name.toLowerCase().endsWith(".csv");
  if (!ALLOWED_MIMES.has(fileMime) && !looksLikeCsv) {
    return new Response(
      JSON.stringify({ error: "CSV files only (.csv extension required)" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const fileName = `${randomUUID()}.csv`;
  const dir = path.join(process.cwd(), "public", "uploads", "imports");
  await mkdir(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, fileName), buf);

  return new Response(JSON.stringify({ fileName }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
