import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // If the user already has a session, don't let them sit on /login —
  // push them to the role-appropriate dashboard. Honors ?next= the same
  // way the form does.
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

  return <LoginForm />;
}
