"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Mail, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  generatePaymentLink,
  revokePaymentLink,
  type PaymentLinkRow,
} from "@/actions/admin-manual-orders";

/**
 * Phase 7 (07-03) — payment link admin card.
 *
 * Renders the active link (if any) with Copy + Email + Revoke buttons, plus a
 * Generate button. Q-07-02 default = manual copy (no auto-email in v1; admin
 * sends via WhatsApp/SMS/email themselves). The mailto: link is a convenience.
 *
 * All buttons >= 48px.
 */
export function PaymentLinkCard({
  orderId,
  existingLinks,
  customerEmail,
  itemName,
  totalAmount,
}: {
  orderId: string;
  existingLinks: PaymentLinkRow[];
  customerEmail: string | null;
  itemName: string | null;
  totalAmount: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = Date.now();
  const active = existingLinks.find(
    (l) => !l.usedAt && l.expiresAt.getTime() > now,
  );
  const past = existingLinks.filter(
    (l) => l.usedAt || l.expiresAt.getTime() <= now,
  );

  function onGenerate() {
    setError(null);
    startTransition(async () => {
      const r = await generatePaymentLink({ orderId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function onRevoke(linkId: string) {
    if (!confirm("Revoke this payment link? Customers using it will see a 410 page.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await revokePaymentLink(linkId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  async function onCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard. Please copy manually.");
    }
  }

  function mailtoHref(url: string): string {
    const subject = encodeURIComponent(
      `Your 3D Ninjaz payment link for ${itemName ?? "your order"}`,
    );
    const body = encodeURIComponent(
      `Hi,\n\nThanks for your order with 3D Ninjaz. Please complete your payment of RM ${totalAmount} via the secure PayPal link below:\n\n${url}\n\nThe link expires in 30 days.\n\n— 3D Ninjaz`,
    );
    return `mailto:${customerEmail ?? ""}?subject=${subject}&body=${body}`;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {active ? (
        <div className="rounded-xl border border-[var(--color-brand-border)] bg-white p-3 md:p-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Active link</p>
            <code className="block break-words rounded-md bg-slate-50 p-2 text-xs md:text-sm font-mono">
              {active.url}
            </code>
            <p className="mt-2 text-xs text-slate-500">
              Expires {active.expiresAt.toLocaleString("en-MY")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => onCopy(active.url)}
              className="min-h-[48px]"
              disabled={pending}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copy URL
                </>
              )}
            </Button>
            <a
              href={mailtoHref(active.url)}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-md border border-[var(--color-brand-border)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-brand-surface)]"
            >
              <Mail className="h-4 w-4" /> Email customer
            </a>
            <Button
              type="button"
              variant="outline"
              onClick={() => onRevoke(active.id)}
              className="min-h-[48px]"
              disabled={pending}
            >
              <X className="h-4 w-4" /> Revoke
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--color-brand-border)] bg-white p-4">
          <p className="text-sm text-slate-600 mb-3">
            No active payment link. Generate one to send the customer for
            payment via PayPal.
          </p>
          <Button
            type="button"
            onClick={onGenerate}
            className="min-h-[48px]"
            disabled={pending}
          >
            <Plus className="h-4 w-4" /> Generate payment link
          </Button>
        </div>
      )}

      {active ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onGenerate}
          className="text-xs"
          disabled={pending}
        >
          + Generate new link (revokes current)
        </Button>
      ) : null}

      {past.length > 0 ? (
        <details className="rounded-xl border border-[var(--color-brand-border)] bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Previous links ({past.length})
          </summary>
          <ul className="mt-2 space-y-2 text-xs">
            {past.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-2 rounded-md bg-slate-50 p-2"
              >
                <span className="font-mono break-words">{l.token.slice(0, 12)}...</span>
                <span className="text-slate-500">
                  {l.usedAt
                    ? `paid ${l.usedAt.toLocaleDateString("en-MY")}`
                    : `expired ${l.expiresAt.toLocaleDateString("en-MY")}`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
