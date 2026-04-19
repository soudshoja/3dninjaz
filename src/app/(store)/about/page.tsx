import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { BUSINESS } from "@/lib/business-info";
import { Shuriken } from "@/components/brand/shuriken";
import { Wave } from "@/components/brand/wave";

export const metadata: Metadata = {
  title: "About",
  description:
    "3D Ninjaz is a playful 3D-printed-goods studio based in Kuala Lumpur, Malaysia. Learn who we are and what we print.",
};

/**
 * /about — three-section brand story page.
 *   1. Hero — who the ninjaz are (playful, stealthy, MY tone).
 *   2. What we print — S/M/L sizing, made-to-order philosophy.
 *   3. Made in Malaysia — KL operation, local delivery.
 * Inherits nav + footer from src/app/(store)/layout.tsx.
 */
export default function AboutPage() {
  return (
    <article className="w-full">
      {/* HERO */}
      <section
        aria-labelledby="about-hero"
        className="relative overflow-hidden px-4 pt-12 pb-16 sm:pt-16 sm:pb-20"
        style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
      >
        <Shuriken
          className="pointer-events-none absolute -top-4 right-6 h-20 w-20 opacity-40 animate-[spin_14s_linear_infinite]"
          fill={BRAND.purple}
        />
        <Shuriken
          className="pointer-events-none absolute bottom-6 -left-3 h-14 w-14 opacity-30 animate-[spin_18s_linear_infinite_reverse]"
          fill={BRAND.green}
        />

        <div className="relative mx-auto max-w-2xl">
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em]"
            style={{ backgroundColor: BRAND.ink, color: BRAND.cream }}
          >
            Made in Malaysia
          </span>
          <h1
            id="about-hero"
            className="mt-5 font-heading text-4xl leading-tight sm:text-5xl"
          >
            Who are the <span style={{ color: BRAND.blue }}>3D</span>{" "}
            <span style={{ color: BRAND.green }}>Ninjaz</span>?
          </h1>
          <p className="mt-5 text-base leading-relaxed sm:text-lg">
            We&rsquo;re a small crew of print-obsessed ninjaz holed up in
            Kuala Lumpur, slinging playful desk toys, stealthy accessories,
            and the odd bit of nonsense you didn&rsquo;t know you needed.
            Every piece is designed in-house, printed to order, and quality
            checked before it slips into your mailbox.
          </p>
          <p className="mt-4 text-base leading-relaxed sm:text-lg">
            Stealthy. Colorful. Kid-friendly. That&rsquo;s the whole brief.
          </p>
        </div>
      </section>

      <Wave color={BRAND.purple} />

      {/* WHAT WE PRINT */}
      <section
        aria-labelledby="about-what"
        className="px-4 py-14 sm:py-20"
        style={{ backgroundColor: BRAND.purple, color: BRAND.cream }}
      >
        <div className="mx-auto max-w-2xl">
          <h2
            id="about-what"
            className="font-heading text-3xl sm:text-4xl"
          >
            What we print.
          </h2>
          <p className="mt-4 text-base leading-relaxed sm:text-lg">
            Kid-friendly desk toys, stealth-mode accessories, and bits you
            didn&rsquo;t know you needed &mdash; printed to order on our KL
            printers using food-safe PLA. No mystery materials, no dodgy
            dyes, no sweatshop middlemen.
          </p>

          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            <li
              className="rounded-2xl p-5"
              style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
            >
              <p className="font-heading text-lg">Small</p>
              <p className="mt-1 text-sm opacity-80">
                Pocket-sized. Stocking-stuffer energy.
              </p>
            </li>
            <li
              className="rounded-2xl p-5"
              style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
            >
              <p className="font-heading text-lg">Medium</p>
              <p className="mt-1 text-sm opacity-80">
                Desk-friendly. Most popular pick.
              </p>
            </li>
            <li
              className="rounded-2xl p-5"
              style={{ backgroundColor: BRAND.blue, color: BRAND.cream }}
            >
              <p className="font-heading text-lg">Large</p>
              <p className="mt-1 text-sm opacity-90">
                Statement piece. Command the shelf.
              </p>
            </li>
          </ul>

          <p className="mt-8 text-sm leading-relaxed opacity-90">
            Because every order is printed when you buy it, expect a short
            lead time before your parcel ships &mdash; typical turnaround
            appears on each product page. Good things take a little heat
            and a little patience.
          </p>
        </div>
      </section>

      <Wave color={BRAND.purple} flip />

      {/* MADE IN MALAYSIA */}
      <section
        aria-labelledby="about-my"
        className="px-4 py-14 sm:py-20"
        style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
      >
        <div className="mx-auto max-w-2xl text-center">
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em]"
            style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          >
            Made in Malaysia
          </span>
          <h2
            id="about-my"
            className="mt-5 font-heading text-3xl sm:text-4xl"
          >
            Printed in{" "}
            <span style={{ color: BRAND.blue }}>{BUSINESS.city}</span>.
            Shipped across {BUSINESS.country}.
          </h2>
          <p className="mt-5 text-base leading-relaxed sm:text-lg">
            Every 3D Ninjaz piece leaves our KL workshop. That means shorter
            delivery times for Malaysian customers, zero customs drama, and
            a real human in your time zone if anything goes sideways.
          </p>
          <div className="mt-10">
            <Link
              href="/shop"
              className="inline-flex h-12 min-h-12 items-center justify-center rounded-full bg-[#0B1020] px-8 font-heading text-sm uppercase tracking-wide text-[#F7FAF4] shadow-[0_4px_0_rgba(0,0,0,0.25)] transition hover:translate-y-0.5 hover:shadow-[0_2px_0_rgba(0,0,0,0.25)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7FAF4]"
            >
              Shop the drops
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}
