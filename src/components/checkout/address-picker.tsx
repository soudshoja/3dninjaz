"use client";

import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";
import type { SavedAddress } from "@/actions/addresses";

/**
 * /checkout AddressPicker — radio list of saved addresses + "Use a new
 * address" option. Drops above the existing AddressForm in CheckoutIsland.
 *
 * If the user has zero saved addresses the parent doesn't render the picker
 * at all (returns null) so the existing form path is unchanged
 * (T-06-03-regression: zero regression to Phase 3 03-02 flow).
 */
export function AddressPicker({
  addresses,
  onSelect,
  onUseNew,
}: {
  addresses: SavedAddress[];
  onSelect: (a: SavedAddress) => void;
  onUseNew: () => void;
}) {
  const defaultAddr = addresses.find((a) => a.isDefault) ?? addresses[0];
  const [selectedId, setSelectedId] = useState<string | "new">(
    defaultAddr?.id ?? "new",
  );

  useEffect(() => {
    if (selectedId === "new") {
      onUseNew();
      return;
    }
    const a = addresses.find((x) => x.id === selectedId);
    if (a) onSelect(a);
    // We intentionally re-run on selectedId / addresses changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, addresses]);

  if (addresses.length === 0) return null;

  return (
    <fieldset className="mb-4">
      <legend className="font-bold mb-2">Ship to</legend>
      <div className="grid gap-2">
        {addresses.map((a) => (
          <label
            key={a.id}
            className="flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer min-h-[48px]"
            style={{
              borderColor:
                selectedId === a.id ? BRAND.green : "rgba(0,0,0,0.1)",
            }}
          >
            <input
              type="radio"
              name="address"
              value={a.id}
              checked={selectedId === a.id}
              onChange={() => setSelectedId(a.id)}
              className="mt-1 h-5 w-5 shrink-0"
            />
            <span className="flex-1 min-w-0">
              <span className="font-bold block">
                {a.fullName}
                {a.isDefault ? " · Default" : ""}
              </span>
              <span className="text-sm text-slate-600 block">
                {a.line1}
                {a.line2 ? `, ${a.line2}` : ""}, {a.city} {a.postcode},{" "}
                {a.state}
              </span>
              <span className="text-sm text-slate-600 block">{a.phone}</span>
            </span>
          </label>
        ))}
        <label
          className="flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer min-h-[48px]"
          style={{
            borderColor:
              selectedId === "new" ? BRAND.green : "rgba(0,0,0,0.1)",
          }}
        >
          <input
            type="radio"
            name="address"
            value="new"
            checked={selectedId === "new"}
            onChange={() => setSelectedId("new")}
            className="h-5 w-5 shrink-0"
          />
          <span className="font-bold">Use a new address</span>
        </label>
      </div>
    </fieldset>
  );
}
