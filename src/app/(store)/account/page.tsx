import Image from "next/image";
import { count, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { LoyaltyCard } from "@/components/account/loyalty-card";
import { ProfileForm } from "@/components/account/profile-form";

/**
 * /account profile overview (CUST-01). Shows loyalty placeholder, profile
 * form (display name + read-only email with link to /account/security),
 * and at-a-glance stats (member since, total orders).
 */
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null; // layout already redirected — defensive

  const [totals] = await db
    .select({ c: count() })
    .from(orders)
    .where(eq(orders.userId, sessionUser.id));
  const totalOrders = Number(totals?.c ?? 0);

  const firstName = (sessionUser.name ?? "").trim().split(/\s+/)[0] || "ninja";

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Image
          src="/icons/ninja/emoji/hello@128.png"
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 object-contain shrink-0"
        />
        <p className="font-[var(--font-heading)] text-2xl text-zinc-900">
          Welcome back, {firstName}.
        </p>
      </div>
      <LoyaltyCard />

      <section className="rounded-2xl p-5 md:p-6 mb-4 bg-white">
        <h2 className="font-[var(--font-heading)] text-xl mb-4">Profile</h2>
        <ProfileForm
          initialName={sessionUser.name}
          email={sessionUser.email}
        />
      </section>

      <section className="rounded-2xl p-5 md:p-6 mb-4 bg-white">
        <h2 className="font-[var(--font-heading)] text-xl mb-4">
          At a glance
        </h2>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-slate-600">Member since</dt>
            <dd className="font-bold">
              {new Date(sessionUser.createdAt).toLocaleDateString("en-MY")}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-slate-600">Total orders</dt>
            <dd className="font-bold">{totalOrders}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
