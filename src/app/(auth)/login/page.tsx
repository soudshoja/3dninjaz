import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant/context";
import { UnifiedAuthForm, type AuthMode } from "@/components/auth/unified-auth-form";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your 3D Ninjaz account",
  // Auth surface — keep out of the search index to reduce phishing surface.
  robots: { index: false, follow: false },
};

// Re-read session on every request — we can't cache an auth gate.
export const dynamic = "force-dynamic";

function isSafeNext(next: string | undefined): next is string {
  if (!next) return false;
  return next.startsWith("/") && !next.startsWith("//");
}

function toAuthMode(tab: string | undefined): AuthMode {
  if (tab === "register") return "register";
  if (tab === "forgot") return "forgot";
  return "login";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; tab?: string }>;
}) {
  // If the user already has a session, don't let them sit on /login —
  // push them to the role-appropriate dashboard. Honors ?next= the same
  // way the form does.
  const { auth } = await getTenantContext();
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) {
    const params = await searchParams;
    const role =
      "role" in session.user
        ? (session.user as { role?: string }).role
        : undefined;
    const next = isSafeNext(params.next) ? params.next : null;
    if (role === "admin") {
      redirect(next ?? "/admin");
    }
    if (next && !next.startsWith("/admin")) {
      redirect(next);
    }
    redirect("/account");
  }

  const params = await searchParams;
  const defaultMode = toAuthMode(params.tab);

  return <UnifiedAuthForm defaultMode={defaultMode} />;
}
