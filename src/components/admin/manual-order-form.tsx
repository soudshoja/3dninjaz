"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ImageUploader } from "@/components/admin/image-uploader";
import { Button } from "@/components/ui/button";
import { MALAYSIAN_STATES } from "@/lib/validators";
import { createManualOrder } from "@/actions/admin-manual-orders";

/**
 * Phase 7 (07-03) — Manual order form.
 *
 * Tap targets >= 48px (inputs) / >= 60px (primary button) per D-04
 * mobile-first decision. Reuses ImageUploader for the custom-image bucket.
 */
export function ManualOrderForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    itemName: "",
    itemDescription: "",
    amount: "",
    recipientName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "Selangor" as (typeof MALAYSIAN_STATES)[number],
    postcode: "",
  });

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const amountNum = parseFloat(form.amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        setError("Amount must be greater than RM 0.00.");
        return;
      }
      const result = await createManualOrder({
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        itemName: form.itemName,
        itemDescription: form.itemDescription,
        amount: amountNum,
        images,
        shipping: {
          recipientName: form.recipientName || form.customerName,
          phone: form.phone || form.customerPhone,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          city: form.city,
          state: form.state,
          postcode: form.postcode,
          country: "Malaysia",
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/orders/${result.orderId}`);
    });
  }

  const inputClass =
    "w-full min-h-[48px] rounded-md border border-[var(--color-brand-border)] bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]";

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error ? (
        <div
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section
        className="rounded-2xl bg-white p-4 md:p-6 space-y-3"
        aria-label="Customer details"
      >
        <h2 className="font-[var(--font-heading)] text-xl">Customer</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">
              Customer name *
            </label>
            <input
              className={inputClass}
              required
              value={form.customerName}
              onChange={(e) => set("customerName", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Phone (MY) *
            </label>
            <input
              className={inputClass}
              required
              value={form.customerPhone}
              onChange={(e) => set("customerPhone", e.target.value)}
              placeholder="60123456789"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Email (optional)
            </label>
            <input
              type="email"
              className={inputClass}
              value={form.customerEmail}
              onChange={(e) => set("customerEmail", e.target.value)}
              placeholder="customer@example.com"
            />
            <p className="mt-1 text-xs text-slate-500">
              Required to send order confirmation and link via email. Without
              an email, you copy the payment link manually (WhatsApp/SMS).
            </p>
          </div>
        </div>
      </section>

      <section
        className="rounded-2xl bg-white p-4 md:p-6 space-y-3"
        aria-label="Item"
      >
        <h2 className="font-[var(--font-heading)] text-xl">Item</h2>
        <div>
          <label className="block text-sm font-medium mb-1">Item name *</label>
          <input
            className={inputClass}
            required
            value={form.itemName}
            onChange={(e) => set("itemName", e.target.value)}
            placeholder="e.g. Custom anime keychain"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Description (optional)
          </label>
          <textarea
            className={inputClass + " min-h-[120px]"}
            rows={4}
            maxLength={2000}
            value={form.itemDescription}
            onChange={(e) => set("itemDescription", e.target.value)}
            placeholder="Size, colour, finish, special instructions..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Reference images (max 6)
          </label>
          <ImageUploader
            images={images}
            onImagesChange={setImages}
            productId="custom-orders"
            maxImages={6}
          />
        </div>
      </section>

      <section
        className="rounded-2xl bg-white p-4 md:p-6 space-y-3"
        aria-label="Amount"
      >
        <h2 className="font-[var(--font-heading)] text-xl">Amount</h2>
        <div className="md:max-w-xs">
          <label className="block text-sm font-medium mb-1">Total (MYR) *</label>
          <input
            className={inputClass + " font-mono"}
            inputMode="decimal"
            required
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
            placeholder="e.g. 120.00"
          />
        </div>
      </section>

      <section
        className="rounded-2xl bg-white p-4 md:p-6 space-y-3"
        aria-label="Shipping address"
      >
        <h2 className="font-[var(--font-heading)] text-xl">Shipping address</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">
              Recipient name
            </label>
            <input
              className={inputClass}
              value={form.recipientName}
              onChange={(e) => set("recipientName", e.target.value)}
              placeholder="Defaults to customer name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Recipient phone
            </label>
            <input
              className={inputClass}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="Defaults to customer phone"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Address line 1 *
            </label>
            <input
              className={inputClass}
              required
              value={form.addressLine1}
              onChange={(e) => set("addressLine1", e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">
              Address line 2
            </label>
            <input
              className={inputClass}
              value={form.addressLine2}
              onChange={(e) => set("addressLine2", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">City *</label>
            <input
              className={inputClass}
              required
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">State *</label>
            <select
              className={inputClass}
              required
              value={form.state}
              onChange={(e) =>
                set(
                  "state",
                  e.target.value as (typeof MALAYSIAN_STATES)[number],
                )
              }
            >
              {MALAYSIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Postcode (5 digits) *
            </label>
            <input
              className={inputClass + " font-mono"}
              required
              maxLength={5}
              pattern="\d{5}"
              value={form.postcode}
              onChange={(e) => set("postcode", e.target.value)}
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          type="submit"
          className="min-h-[60px] px-8 text-base"
          disabled={pending}
        >
          {pending ? "Saving..." : "Create order"}
        </Button>
      </div>
    </form>
  );
}
