"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { toggleWishlist } from "@/actions/wishlist";
import { BRAND } from "@/lib/brand";

type Variant = "overlay" | "pill" | "inline";

/**
 * Wishlist heart toggle. Used as overlay on ProductCard images, pill on
 * /account/wishlist cards, or inline-pill on PDP.
 *
 * Behaviour:
 *  - Unauthenticated visitor -> client redirects to /login?next=<currentPath>
 *  - Authenticated -> optimistic flip with rollback if server rejects
 *  - On ProductCard, e.preventDefault + e.stopPropagation prevent navigation
 *    to the PDP from the wrapping Link.
 *
 * THREAT MODEL:
 *  - T-06-04-unauth-write: client check is the UX shortcut; server
 *    requireUser() in toggleWishlist is the authoritative gate.
 *  - T-06-04-click-through: stopPropagation stops the surrounding Link.
 *  - T-06-04-optimistic-desync: rollback on server error; reconcile on success.
 */
export function WishlistButton({
  productId,
  initialState,
  variant = "overlay",
  className = "",
}: {
  productId: string;
  initialState: boolean;
  variant?: Variant;
  className?: string;
}) {
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [on, setOn] = useState(initialState);
  const [pending, startTransition] = useTransition();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!session?.user) {
      const next = pathname ?? "/";
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    const next = !on;
    setOn(next);
    startTransition(async () => {
      const res = await toggleWishlist({ productId });
      if (!res.ok) {
        setOn(!next); // rollback
        console.error("[WishlistButton] toggle failed", res.error);
        return;
      }
      // Reconcile with server-truth in case state diverged (rare, but cheap).
      setOn(res.state === "added");
    });
  };

  // Sizing per variant — tap targets >= 44px on cards, >= 48px on PDP/pill
  const tap =
    variant === "overlay"
      ? "min-h-[44px] min-w-[44px]"
      : "min-h-[48px] min-w-[48px]";
  const sizing =
    variant === "overlay"
      ? "h-11 w-11 rounded-full"
      : variant === "pill"
        ? "h-12 px-4 rounded-full"
        : "h-12 w-12 rounded-full";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={on}
      aria-label={on ? "Remove from wishlist" : "Add to wishlist"}
      className={`inline-flex items-center justify-center gap-2 ${sizing} ${tap} ${className} disabled:opacity-60 transition`}
      style={{
        backgroundColor: on ? `${BRAND.purple}25` : "rgba(255,255,255,0.92)",
        color: on ? BRAND.purple : BRAND.ink,
        border: `2px solid ${on ? BRAND.purple : BRAND.ink}`,
      }}
    >
      <Heart
        className="h-5 w-5"
        fill={on ? BRAND.purple : "transparent"}
        aria-hidden
      />
      {variant === "pill" ? (
        <span className="text-sm font-bold">{on ? "Saved" : "Save"}</span>
      ) : null}
    </button>
  );
}
