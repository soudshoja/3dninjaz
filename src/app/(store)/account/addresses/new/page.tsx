import { AddressForm } from "@/components/account/address-form";

export const dynamic = "force-dynamic";

export default function NewAddressPage() {
  return (
    <div className="rounded-2xl p-5 md:p-6 bg-white">
      <h2 className="font-[var(--font-heading)] text-xl mb-4">
        Add a new address
      </h2>
      <AddressForm mode="create" />
    </div>
  );
}
