import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTenantContext } from "@/lib/tenant/context";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // Already-signed-in users get sent to their dashboard.
  const { auth } = await getTenantContext();
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
