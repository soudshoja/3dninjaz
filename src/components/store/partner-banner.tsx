import type { CSSProperties } from "react";
import { BRAND } from "@/lib/brand";
import { Shuriken } from "@/components/brand/shuriken";

/**
 * Thin news-style strip above the site nav that loops the logos of the
 * companies we work with. Three templates:
 *
 *   black  — black bar, white logos, fixed "Working with" label, logos
 *            scroll past like a news ticker.
 *   light  — cream bar, ink logos, centred; one logo at a time flips in.
 *   green  — brand green bar, ink logos, full-width ticker with shuriken
 *            separators.
 *
 * The logo files in /public/partners are white-on-transparent PNGs used as
 * CSS masks, so each template paints them in its own text colour from one
 * asset. Pure CSS (see .animate-marquee / .partner-flip in globals.css): no
 * client JS. With reduced motion every template shows both logos, static.
 */

export type PartnerBannerVariant = "black" | "light" | "green";

const PARTNERS = [
  { name: "The Ordinary", src: "/partners/the-ordinary.png", w: 62, h: 22 },
  {
    name: "Jo Malone London",
    src: "/partners/jo-malone-london.png",
    w: 86,
    h: 18,
  },
] as const;

const LABEL = "Working with";

/** Pairs per half of a ticker track. 12 pairs is wider than any screen, so
 *  the -50% loop never shows a gap. */
const REPEATS = 12;

function LogoMark({
  src,
  w,
  h,
  scale = 1,
}: {
  src: string;
  w: number;
  h: number;
  scale?: number;
}) {
  const style: CSSProperties = {
    width: Math.round(w * scale),
    height: Math.round(h * scale),
    backgroundColor: "currentColor",
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };
  return <span className="block shrink-0" style={style} />;
}

function SrText() {
  return (
    <p className="sr-only">
      We work with {PARTNERS.map((p) => p.name).join(" and ")}.
    </p>
  );
}

function Ticker({
  separator,
  seconds,
}: {
  separator?: React.ReactNode;
  seconds: number;
}) {
  const half = (
    <div className="flex shrink-0 items-center">
      {Array.from({ length: REPEATS }).flatMap((_, i) =>
        PARTNERS.map((p) => (
          <span
            key={`${i}-${p.name}`}
            className="flex items-center gap-6 pl-6 md:gap-9 md:pl-9"
          >
            <LogoMark src={p.src} w={p.w} h={p.h} />
            {separator}
          </span>
        )),
      )}
    </div>
  );
  return (
    <div aria-hidden className="min-w-0 flex-1 overflow-hidden">
      <div
        className="flex w-max animate-marquee"
        style={{ animationDuration: `${seconds}s` }}
      >
        {half}
        {half}
      </div>
    </div>
  );
}

export function PartnerBanner({
  variant = "black",
}: {
  variant?: PartnerBannerVariant;
}) {
  if (variant === "light") {
    return (
      <div
        className="flex h-10 items-center justify-center gap-3 overflow-hidden border-b px-4"
        style={{
          backgroundColor: BRAND.cream,
          color: BRAND.ink,
          borderColor: "rgba(11,16,32,0.14)",
        }}
      >
        <SrText />
        <span aria-hidden className="text-xs font-bold md:text-[13px]">
          {LABEL}
        </span>
        <span aria-hidden className="partner-flip">
          {PARTNERS.map((p) => (
            <span key={p.name} className="partner-flip-item">
              <LogoMark src={p.src} w={p.w} h={p.h} scale={1.1} />
            </span>
          ))}
        </span>
      </div>
    );
  }

  if (variant === "green") {
    return (
      <div
        className="flex h-10 items-center overflow-hidden"
        style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
      >
        <SrText />
        <Ticker
          seconds={90}
          separator={
            <>
              <Shuriken className="h-3 w-3 shrink-0" fill={BRAND.ink} />
              <span className="whitespace-nowrap text-xs font-bold md:text-[13px]">
                {LABEL}
              </span>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-10 items-center overflow-hidden"
      style={{ backgroundColor: "#000000", color: "#FFFFFF" }}
    >
      <SrText />
      <span
        aria-hidden
        className="relative z-10 flex h-full shrink-0 items-center px-4 text-xs font-bold md:pl-8 md:text-[13px]"
        style={{
          backgroundColor: "#000000",
          borderRight: "1px solid rgba(255,255,255,0.28)",
        }}
      >
        {LABEL}
      </span>
      <Ticker seconds={80} />
    </div>
  );
}
