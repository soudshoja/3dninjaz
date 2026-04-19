import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/brand/logo";
import { Shuriken } from "@/components/brand/shuriken";
import { Wave } from "@/components/brand/wave";

/**
 * Homepage hero — ink background, shuriken decorations, giant logo,
 * headline + two CTAs, closing with a cream wave that flows into the
 * next cream section.
 */
export function Hero() {
  return (
    <section
      className="relative overflow-hidden pt-14 md:pt-20 pb-0"
      style={{ backgroundColor: BRAND.ink }}
    >
      <Shuriken
        className="absolute top-10 left-8 w-10 h-10 opacity-80 animate-spin-slow"
        fill={BRAND.blue}
      />
      <Shuriken
        className="absolute top-24 right-16 w-14 h-14 opacity-70 animate-spin-slow"
        fill={BRAND.green}
      />
      <Shuriken
        className="absolute bottom-40 left-24 w-8 h-8 opacity-90 animate-spin-slow"
        fill={BRAND.purple}
      />
      <Shuriken
        className="absolute bottom-48 right-10 w-12 h-12 opacity-60 animate-spin-slow"
        fill={BRAND.blue}
      />

      <div className="max-w-6xl mx-auto px-6 text-center">
        <p
          className="inline-block rounded-full px-4 py-1 text-xs md:text-sm font-bold tracking-[0.2em] mb-8"
          style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
        >
          MADE IN MALAYSIA · 3D PRINTED
        </p>
        <div className="flex justify-center mb-6">
          <Logo size={320} priority />
        </div>
        <h1
          className="font-[var(--font-heading)] tracking-tight text-4xl sm:text-5xl md:text-6xl leading-tight"
          style={{ color: BRAND.cream }}
        >
          Stealthy 3D prints.
          <br />
          <span style={{ color: BRAND.green }}>Shipped across Malaysia.</span>
        </h1>
        <p className="mt-6 max-w-xl mx-auto text-base md:text-lg font-medium text-white/70">
          Pick your piece. Choose your size. Three ninjas. One print job.
        </p>
        <div className="mt-10 mb-16 flex flex-wrap gap-4 justify-center">
          <Link
            href="/shop"
            className="rounded-full px-8 py-4 font-bold text-lg shadow-[0_6px_0_rgba(0,0,0,0.35)] hover:translate-y-[2px] hover:shadow-[0_4px_0_rgba(0,0,0,0.35)] transition min-h-[60px] inline-flex items-center"
            style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          >
            Shop the drop
          </Link>
          <a
            href="#how"
            className="rounded-full px-8 py-4 font-bold text-lg border-2 hover:bg-white/10 transition min-h-[60px] inline-flex items-center"
            style={{ borderColor: BRAND.blue, color: BRAND.blue }}
          >
            How it works
          </a>
        </div>
      </div>
      <div className="-mt-2">
        <Wave color={BRAND.cream} />
      </div>
    </section>
  );
}
