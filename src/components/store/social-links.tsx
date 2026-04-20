import Image from "next/image";

/**
 * Storefront social icon row. Accepts a config object whose keys map to the
 * `store_settings.*_url` columns. Each non-empty, non-`#` URL renders as a
 * branded ninja mascot icon linking to the external platform.
 *
 * If NO URLs are set the component returns `null` so the caller does not
 * render an empty wrapper. This matches the "blank = hide" pattern on the
 * admin settings form (Phase 11).
 *
 * The icon files live in /public/icons/ninja/social/*.png and were sliced
 * from the sheet by scripts/slice-social-icons.mjs.
 */

export type SocialConfig = {
  twitter?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  like?: string | null;
};

// Stable ordering — this is the visual left-to-right order in the icon row.
// Renderer filters based on presence, so missing platforms leave no gap.
const ENTRIES = [
  { k: "twitter" as const, name: "Twitter / X" },
  { k: "whatsapp" as const, name: "WhatsApp" },
  { k: "instagram" as const, name: "Instagram" },
  { k: "facebook" as const, name: "Facebook" },
  { k: "tiktok" as const, name: "TikTok" },
  { k: "like" as const, name: "Review us" },
];

function isUsable(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed === "#") return false;
  return true;
}

export function SocialLinks({
  config,
  size = 48,
  className,
  itemClassName,
}: {
  config: SocialConfig;
  size?: number;
  className?: string;
  itemClassName?: string;
}) {
  const visible = ENTRIES.filter((e) => isUsable(config[e.k]));
  if (visible.length === 0) return null;

  return (
    <ul
      className={
        className ??
        "flex flex-wrap items-center gap-2"
      }
      aria-label="Social links"
    >
      {visible.map((e) => (
        <li key={e.k}>
          <a
            href={config[e.k]!}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={e.name}
            title={e.name}
            className={
              itemClassName ??
              "inline-flex items-center justify-center rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            }
            style={{ width: size, height: size }}
          >
            <Image
              src={`/icons/ninja/social/${e.k}.png`}
              alt=""
              width={size}
              height={size}
              className="h-full w-full object-contain"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
