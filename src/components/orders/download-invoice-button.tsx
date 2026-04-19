import Link from "next/link";
import { FileText } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * Phase 6 06-06 — link to /orders/[id]/invoice.pdf. Opens in a new tab so
 * the user can keep the order detail page open. `target=_blank` requires
 * `rel="noopener noreferrer"` to neutralise window.opener tampering.
 */
export function DownloadInvoiceButton({ orderId }: { orderId: string }) {
  return (
    <Link
      href={`/orders/${orderId}/invoice.pdf`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-2 min-h-[60px] px-5 rounded-lg font-bold"
      style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}
    >
      <FileText className="h-5 w-5" aria-hidden />
      Download invoice (PDF)
    </Link>
  );
}
