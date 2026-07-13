import { getTenantContext } from "@/lib/tenant/context";
import { getTenantAuth } from "@/lib/tenant/auth-cache";

// Force dynamic + nodejs runtime so Next.js never tries to prerender or
// statically resolve this catch-all (would otherwise 404 with basePath set).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Phase 24 (24-02) — resolves tenant from Host (getTenantContext) and
// dispatches THAT tenant's Better Auth handler. In single mode
// getTenantContext() always resolves the synthesized single tenant
// (Host ignored) and getTenantAuth() short-circuits to the singleton
// `auth` compat shim, so this is behavior-identical to the previous
// direct-handler-dispatch setup — only GET/POST are exported, matching
// today's destructuring exactly.
async function handler(req: Request): Promise<Response> {
  const { tenant, db } = await getTenantContext();
  return getTenantAuth(tenant, db).handler(req);
}

export { handler as GET, handler as POST };
