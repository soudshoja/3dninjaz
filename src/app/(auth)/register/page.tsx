import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create a 3D Ninjaz account",
  // Auth surface — keep out of the search index to reduce phishing surface.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // Already-signed-in users get sent to their dashboard — the register form
  // is only reachable in anonymous state.
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) {
    const role =
      "role" in session.user
        ? (session.user as { role?: string }).role
        : undefined;
    redirect(role === "admin" ? "/admin" : "/account");
  }
  return <RegisterForm />;
}
