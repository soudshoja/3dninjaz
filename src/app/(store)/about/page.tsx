import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Shuriken } from "@/components/brand/shuriken";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Meet Idrees, Ishaq, and Alaina — three siblings in Malaysia turning 3D printing into fun toys for kids.",
  // OG image left to the root layout default (logo / branded card) — the
  // trio portrait was removed from the page on 2026-04-20 per user feedback.
};

/**
 * /about — the kids' story. Authentic, warm, written in the first person
 * ("we are three siblings"). Layout follows the lightened storefront theme:
 * mostly white, subtle blue/green/purple accents, wide whitespace.
 *
 * 2026-04-20: trio portrait (`/about/siblings-hero.*`, horizontal group
 * image with baked-in name labels) removed from the hero per user feedback
 * — the page now opens with a clean title hero and small decorative
 * shuriken. Sibling profile cards below keep the ninja nav icons.
 */
export default function AboutPage() {
  return (
    <article className="w-full bg-white">
      {/* HERO */}
      <section
        aria-labelledby="about-hero"
        className="relative overflow-hidden px-6 pt-16 pb-12 sm:pt-20 sm:pb-16"
      >
        <Shuriken
          className="pointer-events-none absolute top-10 left-6 h-16 w-16 opacity-30 animate-spin-slow"
          fill={BRAND.blue}
        />
        <Shuriken
          className="pointer-events-none absolute top-28 right-8 h-20 w-20 opacity-25 animate-spin-slow"
          fill={BRAND.purple}
        />

        <div className="relative mx-auto max-w-3xl text-center">
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em]"
            style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          >
            The Ninjaz family
          </span>
          <h1
            id="about-hero"
            className="mt-5 font-heading text-5xl sm:text-6xl md:text-7xl leading-tight text-zinc-900"
          >
            About{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.green}, ${BRAND.purple})`,
              }}
            >
              Us
            </span>
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-lg sm:text-xl leading-relaxed text-zinc-700">
            We are three siblings Idrees (11), Ishaq (10), and Alaina (3) based
            in Malaysia, who love creating fun things for kids just like us.
          </p>
        </div>

      </section>

      {/* STORY — intro + the day-in-the-life copy, with a little ninja icon */}
      <section
        aria-labelledby="about-story"
        className="px-6 py-14 sm:py-20 border-t border-zinc-100"
        style={{ backgroundColor: "#FAFAFA" }}
      >
        <div className="mx-auto max-w-5xl grid gap-10 md:grid-cols-[1fr_180px] md:items-start">
          <div>
            <h2
              id="about-story"
              className="font-heading text-3xl sm:text-4xl text-zinc-900"
            >
              Our <span style={{ color: BRAND.green }}>story</span>.
            </h2>
            <div className="mt-6 space-y-5 text-base sm:text-lg leading-relaxed text-zinc-700">
              <p>
                What started as curiosity quickly turned into something bigger.
                With the help of our mum and dad, we began designing, creating,
                and selling 3D printed products that kids can enjoy, play with,
                and even customise.
              </p>
              <p>
                By day, we go to school… but by night, we turn into 3D printing
                ninjas <span aria-label="ninja">🥷</span> and bring our ideas to
                life! From fun toys to awesome custom designs, we&rsquo;re
                always thinking of new things to make and share
              </p>
              <p>
                Every morning before school, we rush to check what we printed
                overnight (it&rsquo;s our favourite part).
              </p>
              <p>
                After school, we help prepare and send out orders, making sure
                everything is packed with care (with lots of help from our
                mum).
              </p>
              <p>
                Alaina might still be small, but she loves watching her
                brothers create and is already part of the team in her own way.
              </p>
            </div>
          </div>
          <div className="hidden md:flex flex-col items-center gap-6 pt-6">
            <Image
              src="/icons/ninja/emoji/hello.png"
              alt=""
              width={140}
              height={140}
              className="h-[140px] w-[140px] object-contain"
            />
            <Image
              src="/icons/ninja/emoji/thank-you.png"
              alt=""
              width={120}
              height={120}
              className="h-[120px] w-[120px] object-contain"
            />
          </div>
        </div>
      </section>

      {/* SIBLING CARDS */}
      <section
        aria-labelledby="about-siblings"
        className="px-6 py-14 sm:py-20 bg-white border-t border-zinc-100"
      >
        <div className="mx-auto max-w-5xl">
          <h2
            id="about-siblings"
            className="text-center font-heading text-3xl sm:text-4xl text-zinc-900"
          >
            Meet the <span style={{ color: BRAND.purple }}>trio</span>.
          </h2>
          <p className="mt-3 text-center text-zinc-600">
            Three ninjas. Three colors. One little studio.
          </p>

          <ul className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              {
                name: "Idrees",
                age: "11",
                role: "The big brother & lead designer. Blue-banded ninja.",
                color: BRAND.blue,
                icon: "/icons/ninja/nav/portfolio.png",
              },
              {
                name: "Ishaq",
                age: "10",
                role: "The maker & packer. Green-banded ninja.",
                color: BRAND.green,
                icon: "/icons/ninja/emoji/success.png",
              },
              {
                name: "Alaina",
                age: "3",
                role: "The tiny ninja cheerleader. Purple-banded ninja with a big heart.",
                color: BRAND.purple,
                icon: "/icons/ninja/emoji/thank-you.png",
              },
            ].map((s) => (
              <li
                key={s.name}
                className="group relative rounded-3xl bg-white border border-zinc-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition overflow-hidden"
              >
                <span
                  aria-hidden
                  className="block h-2 w-full"
                  style={{ backgroundColor: s.color }}
                />
                <div className="p-6 sm:p-7 text-center">
                  <div
                    className="mx-auto flex h-28 w-28 items-center justify-center rounded-full mb-4"
                    style={{ backgroundColor: `${s.color}18` }}
                  >
                    <Image
                      src={s.icon}
                      alt=""
                      width={96}
                      height={96}
                      className="h-24 w-24 object-contain"
                    />
                  </div>
                  <h3 className="font-heading text-2xl text-zinc-900">
                    {s.name}
                    <span
                      className="ml-2 text-base font-bold"
                      style={{ color: s.color }}
                    >
                      {s.age}
                    </span>
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                    {s.role}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CLOSING CTA */}
      <section
        aria-labelledby="about-cta"
        className="px-6 py-16 sm:py-20 border-t border-zinc-100"
        style={{ backgroundColor: "#FAFAFA" }}
      >
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="about-cta"
            className="font-heading text-3xl sm:text-4xl text-zinc-900"
          >
            Made by{" "}
            <span style={{ color: BRAND.blue }}>kids</span>, for{" "}
            <span style={{ color: BRAND.green }}>kids</span>.
          </h2>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-zinc-700">
            We started this little business because we wanted to do something
            fun! What&rsquo;s better than making things by kids, for kids.
          </p>
          <div className="mt-8">
            <Link
              href="/shop"
              className="inline-flex h-14 items-center justify-center rounded-full px-10 font-bold text-lg shadow-[0_4px_0_rgba(11,16,32,0.15)] hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(11,16,32,0.15)] transition"
              style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
            >
              See what we made
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}
