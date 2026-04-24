import Link from "next/link";
import {
  BUSINESS,
  isWhatsAppPlaceholder,
  whatsappLink,
} from "@/lib/business-info";

/**
 * Reusable WhatsApp CTA link. Server-safe — renders a plain anchor, no
 * client state. Opens wa.me in a new tab with `rel="noopener noreferrer"`
 * (mitigates threat T-04-02-08, reverse tabnabbing + referrer leakage).
 *
 * Variants:
 *   - primary: chunky brand-green pill, 48px tap height (D2-03 mobile rule).
 *   - ghost:   outlined pill, same 48px tap target, for secondary placements.
 *   - inline:  text link for use inside paragraphs (Terms / Privacy).
 *
 * While the WhatsApp number is the placeholder (D-01 pending), the CTA
 * still renders so layout is verifiable, but a "(pending)" badge is appended
 * so QA, Lighthouse, and the user can see at a glance that the link is
 * not yet the real destination.
 */
export type WhatsAppCtaVariant = "primary" | "ghost" | "inline";

type Props = {
  message?: string;
  variant?: WhatsAppCtaVariant;
  className?: string;
  children?: React.ReactNode;
};

function WhatsAppIcon({ className = "h-5 w-5" }: { className?: string }) {
  // Single-path WhatsApp glyph (phone inside speech bubble). Uses currentColor
  // so parent text color drives it — works against light or dark backgrounds.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.02 0C5.4 0 .03 5.37.03 11.98c0 2.11.55 4.17 1.6 5.98L0 24l6.2-1.63a11.94 11.94 0 0 0 5.82 1.48h.01c6.62 0 12-5.37 12-11.98 0-3.2-1.25-6.21-3.51-8.39ZM12.03 21.8h-.01a9.83 9.83 0 0 1-5.02-1.37l-.36-.21-3.68.97.98-3.59-.23-.37a9.82 9.82 0 0 1-1.51-5.25c0-5.43 4.43-9.86 9.87-9.86 2.64 0 5.12 1.03 6.98 2.9a9.79 9.79 0 0 1 2.89 6.98c0 5.43-4.43 9.8-9.91 9.8Zm5.4-7.36c-.3-.15-1.75-.87-2.02-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47a8.94 8.94 0 0 1-1.65-2.05c-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.58-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.07 2.89 1.22 3.09.15.2 2.11 3.22 5.11 4.51.72.31 1.27.49 1.71.63.72.23 1.37.2 1.89.12.58-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35Z" />
    </svg>
  );
}

function variantClasses(variant: WhatsAppCtaVariant): string {
  switch (variant) {
    case "primary":
      // Chunky green pill, 48px tap height. Mirrors demo-v2 CTA pattern.
      return [
        "inline-flex items-center justify-center gap-2",
        "h-12 min-h-12 px-6 rounded-full",
        "bg-[#39E600] text-[#0B1020]",
        "font-heading text-sm sm:text-base tracking-wide uppercase",
        "shadow-[0_4px_0_rgba(0,0,0,0.25)]",
        "hover:translate-y-0.5 hover:shadow-[0_2px_0_rgba(0,0,0,0.25)]",
        "active:translate-y-1 active:shadow-none",
        "transition will-change-transform",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1020] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7FAF4]",
      ].join(" ");
    case "ghost":
      return [
        "inline-flex items-center justify-center gap-2",
        "h-12 min-h-12 px-5 rounded-full",
        "bg-transparent text-[#0B1020] border-2 border-[#0B1020]",
        "font-heading text-sm tracking-wide uppercase",
        "hover:bg-[#0B1020] hover:text-[#F7FAF4]",
        "transition",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1020] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7FAF4]",
      ].join(" ");
    case "inline":
      return [
        "inline text-[#1E8BFF] underline underline-offset-2",
        "hover:opacity-80",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E8BFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7FAF4] rounded-sm",
      ].join(" ");
  }
}

export function WhatsAppCta({
  message,
  variant = "primary",
  className = "",
  children,
}: Props) {
  const href = whatsappLink(message);
  const isPending = isWhatsAppPlaceholder();
  const label = children ?? "Chat on WhatsApp";
  const aria = `Chat with 3D Ninjaz on WhatsApp at ${BUSINESS.whatsappNumberDisplay}`;
  const classes = `${variantClasses(variant)} ${className}`.trim();

  if (variant === "inline") {
    return (
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={aria}
        className={classes}
      >
        {label}
        {isPending && (
          <span className="ml-1 text-xs text-[#475569]"> (pending)</span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={aria}
      className={classes}
    >
      <WhatsAppIcon />
      <span>{label}</span>
      {isPending && (
        <span
          aria-label="number pending"
          className="ml-1 rounded-full bg-[#F7FAF4] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#475569]"
        >
          Pending
        </span>
      )}
    </Link>
  );
}
