"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Star, Pencil, Trash2 } from "lucide-react";
import { deleteAddress, setDefaultAddress, type SavedAddress } from "@/actions/addresses";
import { BRAND } from "@/lib/brand";

/**
 * Single address card on /account/addresses. Shows full name + Default badge,
 * formatted address, phone, and a 3-button action row (Edit, Set default, Delete).
 *
 * Delete uses the native confirm() dialog (matches existing admin patterns
 * in src/app/(admin)/admin/products/product-row-actions.tsx).
 */
export function AddressCard({ address }: { address: SavedAddress }) {
  const [pendingDefault, startDefault] = useTransition();
  const [pendingDelete, startDelete] = useTransition();

  const onSetDefault = () => {
    startDefault(async () => {
      await setDefaultAddress(address.id);
    });
  };

  const onDelete = () => {
    if (!window.confirm("Delete this address?")) return;
    startDelete(async () => {
      await deleteAddress(address.id);
    });
  };

  return (
    <article
      className="rounded-2xl p-5 bg-white"
      style={{ borderLeft: `6px solid ${address.isDefault ? BRAND.purple : "transparent"}` }}
    >
      <header className="flex items-start gap-3 flex-wrap mb-2">
        <p className="font-bold flex-1 min-w-0 truncate">{address.fullName}</p>
        {address.isDefault ? (
          <span
            className="text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wider"
            style={{
              backgroundColor: `${BRAND.purple}30`,
              color: BRAND.purple,
            }}
          >
            Default
          </span>
        ) : null}
      </header>
      <p className="text-sm text-slate-700">
        {address.line1}
        {address.line2 ? `, ${address.line2}` : ""}
      </p>
      <p className="text-sm text-slate-700">
        {address.city} {address.postcode}, {address.state},{" "}
        {address.country}
      </p>
      <p className="text-sm text-slate-600 mt-1">{address.phone}</p>

      <div className="mt-4 flex gap-2 flex-wrap">
        <Link
          href={`/account/addresses/${address.id}/edit`}
          className="inline-flex items-center gap-2 min-h-[48px] px-4 rounded-lg font-bold text-sm border-2"
          style={{ borderColor: BRAND.ink, color: BRAND.ink }}
        >
          <Pencil className="h-4 w-4" aria-hidden />
          Edit
        </Link>
        {address.isDefault ? null : (
          <button
            type="button"
            onClick={onSetDefault}
            disabled={pendingDefault}
            className="inline-flex items-center gap-2 min-h-[48px] px-4 rounded-lg font-bold text-sm border-2 disabled:opacity-40"
            style={{ borderColor: BRAND.purple, color: BRAND.purple }}
          >
            <Star className="h-4 w-4" aria-hidden />
            {pendingDefault ? "Setting…" : "Set as default"}
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={pendingDelete}
          className="inline-flex items-center gap-2 min-h-[48px] px-4 rounded-lg font-bold text-sm border-2 disabled:opacity-40 ml-auto"
          style={{ borderColor: "#DC2626", color: "#DC2626" }}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {pendingDelete ? "Deleting…" : "Delete"}
        </button>
      </div>
    </article>
  );
}
