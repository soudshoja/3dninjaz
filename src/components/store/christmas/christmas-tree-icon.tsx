import { BRAND } from "@/lib/brand";

/**
 * Small flat Christmas tree in the brand greens. The faint horizontal lines
 * are a nod to 3D-print layers. Decorative only.
 */
export function ChristmasTreeIcon({ className = "" }: { className?: string }) {
  const lines = "rgba(255,255,255,0.35)";
  return (
    <svg
      viewBox="0 0 120 150"
      className={className}
      role="img"
      aria-label="A Christmas tree"
    >
      <rect x="52" y="122" width="16" height="20" rx="2" fill="#8A5A2B" />

      <polygon points="60,62 106,126 14,126" fill={BRAND.greenDark} />
      <polygon points="60,34 98,94 22,94" fill={BRAND.green} />
      <polygon points="60,12 88,58 32,58" fill={BRAND.greenDark} />

      <g stroke={lines} strokeWidth="1.5" strokeLinecap="round">
        <path d="M40 110h40M32 118h56" />
        <path d="M44 82h32M36 89h48" />
        <path d="M50 48h20M44 54h32" />
      </g>

      <circle cx="44" cy="112" r="4.5" fill={BRAND.blue} />
      <circle cx="78" cy="114" r="4.5" fill="#D42426" />
      <circle cx="60" cy="98" r="4.5" fill={BRAND.purple} />
      <circle cx="50" cy="78" r="4" fill="#D42426" />
      <circle cx="71" cy="80" r="4" fill={BRAND.blue} />
      <circle cx="60" cy="52" r="3.5" fill="#F5B800" />

      <path
        d="M60 1l3.2 7.2 7.8.8-5.8 5.3 1.7 7.7L60 17.9l-6.9 4.1 1.7-7.7L49 9l7.8-.8z"
        fill="#F5B800"
      />
    </svg>
  );
}
