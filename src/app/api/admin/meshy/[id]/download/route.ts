import { NextResponse, type NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import { requireAdmin } from "@/lib/auth-helpers";
import { getGenerationRow } from "@/lib/meshy/pipeline";
import { resolveStoragePath } from "@/lib/meshy/storage";

// ============================================================================
// Phase 21 (21-04) — admin-scoped Meshy binary streamer.
//
// The one Route Handler of the phase: streams STL/3MF/GLB/source-photo/
// thumbnail bytes from PRIVATE storage (src/lib/meshy/storage.ts) to a
// logged-in admin. A Route Handler (not a Server Action) is required here
// because Server Actions cannot stream binary responses. This same URL also
// serves double duty as the <model-viewer> src and <img> src for the admin
// detail UI (Wave 4) — the browser sends session cookies automatically, so
// the authed route works as a plain element src for a logged-in admin.
//
// File selection is an explicit allowlist keyed off DB-backed fields only —
// the ?file= query param NEVER contributes to a filesystem path directly;
// it only picks WHICH already-resolved relative path (source of truth: the
// meshy_generations row) gets passed into resolveStoragePath's traversal
// guard.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FILES = ["stl", "3mf", "glb", "source", "thumb"] as const;
type FileKind = (typeof ALLOWED_FILES)[number];

function isFileKind(value: string): value is FileKind {
  return (ALLOWED_FILES as readonly string[]).includes(value);
}

// Brand palette (kept inline so this route has no client/style imports —
// mirrors src/app/api/admin/orders/[id]/label/route.ts convention).
const INK = "#0B1020";
const BLUE = "#0080ff";
const CREAM = "#F7FAF4";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Branded, friendly "not ready yet" page. Deliberately returned with HTTP
 * 200 so the LiteSpeed/Apache ErrorDocument rules (which intercept 5xx with
 * static pages — see DEPLOY-NOTES) do not swallow this body. The admin lands
 * here from a plain <a> click on an STL/3MF download button, so a branded
 * page reads better than a bare browser error.
 */
function notReadyPage(title: string, message: string): NextResponse {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${safeTitle}</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:${CREAM}; color:${INK};
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .card { max-width:30rem; margin:1.5rem; padding:2rem; background:#fff; border-radius:1rem;
    box-shadow:0 10px 30px rgba(11,16,32,.08); text-align:center; }
  h1 { font-size:1.4rem; margin:0 0 .75rem; }
  p { color:#475569; line-height:1.55; margin:0 0 1.25rem; }
  .hint { font-size:.8rem; color:#94a3b8; margin-top:1rem; }
</style>
</head>
<body>
  <div class="card">
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    <p class="hint">You can close this tab and return to the generation.</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin(); // FIRST await — CVE-2025-29927, middleware alone is bypassable.

    const { id } = await ctx.params;

    const rawFile = req.nextUrl.searchParams.get("file");
    if (!rawFile || !isFileKind(rawFile)) {
      return NextResponse.json({ error: "invalid file" }, { status: 400 });
    }
    const kind: FileKind = rawFile;

    const row = await getGenerationRow(id);
    if (!row) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // Map the allowlisted KEY to one of the row's own stored relative
    // paths — never construct a path from the query param itself.
    let relPath: string | null | undefined;
    switch (kind) {
      case "stl":
        relPath = row.localModelFiles.stl;
        break;
      case "3mf":
        relPath = row.localModelFiles.threeMf;
        break;
      case "glb":
        relPath = row.localModelFiles.glb;
        break;
      case "source":
        relPath = row.sourceImagePath;
        break;
      case "thumb":
        relPath = row.localThumbnailPath;
        break;
    }

    // STL/3MF are reached via an <a> click (real download button) — a
    // branded "not ready" page reads better than a raw 404. glb/source/thumb
    // are programmatic fetches (<model-viewer>/<img> src) — a plain 404
    // lets those elements fail gracefully without navigating anywhere.
    const isDownloadClick = kind === "stl" || kind === "3mf";

    if (!relPath) {
      if (isDownloadClick) {
        return notReadyPage(
          "File not ready yet",
          "This file hasn't been generated yet. Check back once the model reaches the right stage, then try downloading again.",
        );
      }
      return NextResponse.json({ error: "not available" }, { status: 404 });
    }

    let abs: string;
    try {
      abs = resolveStoragePath(relPath); // traversal guard runs on every read.
    } catch {
      return NextResponse.json({ error: "invalid path" }, { status: 400 });
    }

    let buf: Buffer;
    try {
      buf = await fs.readFile(abs);
    } catch {
      if (isDownloadClick) {
        return notReadyPage(
          "File not ready yet",
          "This file isn't available right now. Check back shortly and try downloading again.",
        );
      }
      return NextResponse.json({ error: "not available" }, { status: 404 });
    }

    const headers: Record<string, string> = {
      "Cache-Control": "private, no-store",
    };

    switch (kind) {
      case "stl":
        headers["Content-Type"] = "application/octet-stream";
        headers["Content-Disposition"] = `attachment; filename="meshy-${id}.stl"`;
        break;
      case "3mf":
        headers["Content-Type"] =
          "application/vnd.ms-package.3dmanufacturing-3dmodel+3mf";
        headers["Content-Disposition"] = `attachment; filename="meshy-${id}.3mf"`;
        break;
      case "glb":
        headers["Content-Type"] = "model/gltf-binary";
        headers["Content-Disposition"] = "inline";
        break;
      case "source":
      case "thumb": {
        const lower = relPath.toLowerCase();
        headers["Content-Type"] = lower.endsWith(".png") ? "image/png" : "image/jpeg";
        headers["Content-Disposition"] = "inline";
        break;
      }
    }

    return new NextResponse(new Uint8Array(buf), { headers });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[meshy-download] unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
