import Link from "next/link";
import { listMyAddresses } from "@/actions/addresses";
import { AddressCard } from "@/components/account/address-card";
import { BRAND } from "@/lib/brand";

/**
 * /account/addresses — list of saved shipping addresses (CUST-03).
 * Empty state offers a 60px CTA pointing to /account/addresses/new.
 */
export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  const rows = await listMyAddresses();

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="font-[var(--font-heading)] text-xl">
          Saved addresses
        </h2>
        <Link
          href="/account/addresses/new"
          className="inline-flex items-center justify-center min-h-[60px] px-5 rounded-lg font-bold"
          style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}
        >
          + Add an address
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl p-8 text-center bg-white">
          <p className="text-slate-600 mb-4">
            You haven&apos;t saved any shipping addresses yet.
          </p>
          <Link
            href="/account/addresses/new"
            className="inline-flex items-center justify-center min-h-[60px] px-6 rounded-lg font-bold"
            style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          >
            Add your first address
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <AddressCard key={r.id} address={r} />
          ))}
        </div>
      )}
    </div>
  );
}
