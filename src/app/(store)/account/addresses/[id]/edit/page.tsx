import { notFound } from "next/navigation";
import { getMyAddress } from "@/actions/addresses";
import { AddressForm } from "@/components/account/address-form";
import type { MalaysianState } from "@/lib/validators";

/**
 * /account/addresses/[id]/edit — ownership-gated edit page.
 * notFound() for both missing AND not-yours ids — identical HTTP response
 * blocks enumeration (T-06-03-IDOR mirror of T-03-21).
 */
export const dynamic = "force-dynamic";

export default async function EditAddressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getMyAddress(id);
  if (!row) notFound();

  return (
    <div className="rounded-2xl p-5 md:p-6 bg-white">
      <h2 className="font-[var(--font-heading)] text-xl mb-4">Edit address</h2>
      <AddressForm
        mode="edit"
        initial={{
          id: row.id,
          fullName: row.fullName,
          phone: row.phone,
          line1: row.line1,
          line2: row.line2 ?? "",
          city: row.city,
          state: row.state as MalaysianState,
          postcode: row.postcode,
          country: "Malaysia",
          isDefault: row.isDefault,
        }}
      />
    </div>
  );
}
