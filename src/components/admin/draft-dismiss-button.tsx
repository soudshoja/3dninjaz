"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissCheckoutDraft } from "@/actions/checkout-drafts";

/** Dismiss an open checkout draft (followed up / junk). */
export function DraftDismissButton({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await dismissCheckoutDraft(draftId);
          router.refresh();
        })
      }
      className="rounded-full px-4 py-2 text-sm font-semibold min-h-[44px] disabled:opacity-50"
      style={{ backgroundColor: "transparent", border: "2px solid #0B102033", color: "#0B1020" }}
    >
      {pending ? "Dismissing…" : "Dismiss"}
    </button>
  );
}
