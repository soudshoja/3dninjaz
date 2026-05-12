import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // Already-signed-in users get sent to their dashboard.
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) {
    const role =
      "role" in session.user
        ? (session.user as { role?: string }).role
        : undefined;
    redirect(role === "admin" ? "/admin" : "/account");
  }
  redirect("/login?tab=register");
}
