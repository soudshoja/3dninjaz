import type { CSSProperties } from "react";
import { Raleway } from "next/font/google";

/**
 * Thin black news-ticker strip above the site nav: a fixed "WORKED WITH"
 * label, then the logos of the companies we have worked with scrolling past.
 *
 * The label is set in Raleway, the closest free match to The Ordinary's
 * wordmark (their exact typeface is not published).
 *
 * The logo files in /public/partners are white-on-transparent PNGs used as
 * CSS masks, painted in the bar's text colour. Pure CSS (reuses
 * .animate-marquee from globals.css): no client JS. With reduced motion the
 * track is static and shows both logos.
 */

const labelFont = Raleway({
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
});

const PARTNERS = [
  { name: "The Ordinary", src: "/partners/the-ordinary.png", w: 62, h: 22 },
  {
    name: "Jo Malone London",
    src: "/partners/jo-malone-london.png",
    w: 86,
    h: 18,
  },
] as const;

/** Pairs per half of the track. 12 pairs is wider than any screen, so the
 *  -50% loop never shows a gap. */
const REPEATS = 12;

function LogoMark({ src, w, h }: { src: string; w: number; h: number }) {
  const style: CSSProperties = {
    width: w,
    height: h,
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

function Half() {
  return (
    <div className="flex shrink-0 items-center">
      {Array.from({ length: REPEATS }).flatMap((_, i) =>
        PARTNERS.map((p) => (
          <span key={`${i}-${p.name}`} className="pl-6 md:pl-9">
            <LogoMark src={p.src} w={p.w} h={p.h} />
          </span>
        )),
      )}
    </div>
  );
}

export function PartnerBanner() {
  return (
    <div
      className="flex h-10 items-center overflow-hidden"
      style={{ backgroundColor: "#000000", color: "#FFFFFF" }}
    >
      <p className="sr-only">
        We have worked with {PARTNERS.map((p) => p.name).join(" and ")}.
      </p>
      <span
        aria-hidden
        className={`${labelFont.className} relative z-10 flex h-full shrink-0 items-center px-4 text-[13px] tracking-[0.08em] md:pl-8 md:text-sm`}
        style={{
          backgroundColor: "#000000",
          borderRight: "1px solid rgba(255,255,255,0.28)",
        }}
      >
        WORKED WITH
      </span>
      <div aria-hidden className="min-w-0 flex-1 overflow-hidden">
        <div
          className="flex w-max animate-marquee"
          style={{ animationDuration: "80s" }}
        >
          <Half />
          <Half />
        </div>
      </div>
    </div>
  );
}
