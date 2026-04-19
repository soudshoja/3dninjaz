import { BRAND } from "@/lib/brand";

/**
 * Decorative shuriken SVG. Pure presentational — safe in server components
 * and usable with CSS animations via `className="animate-spin-slow"`.
 */
export function Shuriken({
  className = "",
  fill = BRAND.blue,
}: {
  className?: string;
  fill?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={fill} aria-hidden>
      <path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5z" />
    </svg>
  );
}
