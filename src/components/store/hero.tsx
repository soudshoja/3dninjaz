import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/brand/logo";
import { Shuriken } from "@/components/brand/shuriken";

/**
 * Homepage hero — lightened (2026-04-20). White background with dark text,
 * vivid shuriken + CTA pops for energy. Keeps the ninja typography but drops
 * the heavy dark canvas that was dominating the page.
 *
 * 2026-04-20: waving-ninja mascot removed from the hero per user feedback —
 * first impression should be clean logo + tagline.
 */
export function Hero() {
  return (
    <section
      className="relative overflow-hidden pt-14 md:pt-20 pb-16 md:pb-20"
      style={{ backgroundColor: "#FFFFFF" }}
    >
      <Shuriken
        className="absolute top-10 left-8 w-10 h-10 opacity-50 animate-spin-slow"
        fill={BRAND.blue}
      />
      <Shuriken
        className="absolute top-24 right-16 w-14 h-14 opacity-40 animate-spin-slow"
        fill={BRAND.green}
      />
      <Shuriken
        className="absolute bottom-24 left-24 w-8 h-8 opacity-60 animate-spin-slow"
        fill={BRAND.purple}
      />
      <Shuriken
        className="absolute bottom-32 right-10 w-12 h-12 opacity-40 animate-spin-slow"
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
          className="font-[var(--font-heading)] tracking-tight text-4xl sm:text-5xl md:text-6xl leading-tight text-zinc-900"
        >
          Stealthy 3D prints.
          <br />
          <span style={{ color: BRAND.green }}>Shipped across Malaysia.</span>
        </h1>
        <p className="mt-6 max-w-xl mx-auto text-base md:text-lg font-medium text-zinc-600">
          Pick your piece. Choose your size. Three ninjas. One print job.
        </p>
        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <Link
            href="/shop"
            className="rounded-full px-8 py-4 font-bold text-lg shadow-[0_4px_0_rgba(11,16,32,0.15)] hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(11,16,32,0.15)] transition min-h-[60px] inline-flex items-center"
            style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          >
            Shop the drop
          </Link>
          <a
            href="#how"
            className="rounded-full px-8 py-4 font-bold text-lg border-2 hover:bg-zinc-50 transition min-h-[60px] inline-flex items-center"
            style={{ borderColor: BRAND.blue, color: BRAND.blue }}
          >
            How it works
          </a>
        </div>
      </div>
    </section>
  );
}
