import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-helpers";
import { AccountSidebar } from "@/components/account/account-sidebar";
import { BRAND } from "@/lib/brand";

/**
 * /account shell. Layout-level auth gate (T-06-02-auth) — every /account/*
 * child renders only after we've confirmed a session. Sidebar (desktop) +
 * horizontal chip strip (mobile) provided by AccountSidebar.
 */
export const dynamic = "force-dynamic";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login?next=/account");
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-12">
        <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl mb-6">
          My account
        </h1>
        <div className="md:grid md:grid-cols-[220px_1fr] md:gap-8">
          <aside className="md:sticky md:top-20 md:self-start mb-6 md:mb-0">
            <AccountSidebar />
          </aside>
          <section>{children}</section>
        </div>
      </div>
    </main>
  );
}
