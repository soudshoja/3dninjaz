import { BRAND } from "@/lib/brand";

/**
 * Reusable Sold Out overlay for product cards. Absolute-positioned over the
 * product image; the parent must have `position: relative`. The card itself
 * remains clickable so the customer can see the PDP and (in future) join a
 * "notify me when restocked" waitlist.
 */
export function SoldOutBadge({ className = "" }: { className?: string }) {
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center bg-black/55 ${className}`}
      aria-label="Sold out"
    >
      <span
        className="rounded-full px-5 py-2 text-base md:text-lg font-bold uppercase tracking-wider shadow-lg"
        style={{ backgroundColor: "#ffffff", color: BRAND.ink }}
      >
        Sold out
      </span>
    </div>
  );
}
