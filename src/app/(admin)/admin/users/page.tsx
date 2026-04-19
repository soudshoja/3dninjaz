import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { listAdminUsers } from "@/actions/admin-users";
import { BRAND } from "@/lib/brand";
import { UserRowActions } from "./user-row-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Users",
  robots: { index: false, follow: false },
};

/**
 * /admin/users — list every non-admin user with name, email, registration
 * date, order count, ban status, and a row-actions menu. Mirrors the
 * orders-list pattern: filter card with horizontal-scroll table on mobile.
 *
 * requireAdmin() is called at the top even though (admin)/layout.tsx also
 * redirects unauthenticated users — belt-and-braces, CVE-2025-29927.
 */
export default async function AdminUsersPage() {
  await requireAdmin();
  const rows = await listAdminUsers();

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4">
          <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
            Users
          </h1>
          <p className="mt-1 text-slate-600">
            {rows.length} {rows.length === 1 ? "user" : "users"}
          </p>
        </header>

        {rows.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ backgroundColor: "#ffffff" }}
          >
            <p className="text-lg font-bold mb-2">No customer accounts yet.</p>
            <p className="text-sm text-slate-600">
              Customers will appear here after they register.
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#ffffff" }}
          >
            {/* Horizontal scroll inside the card (D-04 mobile rule). */}
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead>
                  <tr
                    className="text-left"
                    style={{ backgroundColor: `${BRAND.ink}0d` }}
                  >
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Registered</th>
                    <th className="p-3">Orders</th>
                    <th className="p-3">Status</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} className="border-t border-black/10">
                      <td className="p-3">
                        <p className="font-semibold truncate max-w-[200px]">
                          {u.name || "—"}
                        </p>
                      </td>
                      <td className="p-3">
                        <p className="text-sm truncate max-w-[240px]">
                          {u.email}
                        </p>
                      </td>
                      <td className="p-3 text-sm whitespace-nowrap">
                        {new Date(u.createdAt).toLocaleDateString("en-MY")}
                      </td>
                      <td className="p-3 text-sm">{u.orderCount}</td>
                      <td className="p-3">
                        {u.banned ? (
                          <span
                            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
                            style={{ backgroundColor: "#dc2626" }}
                          >
                            Suspended
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold text-white"
                            style={{ backgroundColor: BRAND.green }}
                          >
                            Active
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <UserRowActions
                          user={{
                            id: u.id,
                            name: u.name,
                            email: u.email,
                            banned: u.banned,
                            banReason: u.banReason,
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
