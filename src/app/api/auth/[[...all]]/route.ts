import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Force dynamic + nodejs runtime so Next.js never tries to prerender or
// statically resolve this catch-all (would otherwise 404 with basePath set).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler(auth.handler);
