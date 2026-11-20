import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/brand/logo";
import { Shuriken } from "@/components/brand/shuriken";
import { SiteNav } from "@/components/store/site-nav";
import { SiteFooter } from "@/components/store/site-footer";
import { CartDrawer } from "@/components/store/cart-drawer";
import { FontFaceLoader } from "@/components/store/font-face-loader";
import { FeaturedRail } from "@/components/store/featured-rail";
import {
  PartnerBanner,
  type PartnerBannerVariant,
} from "@/components/store/partner-banner";
import {
  getActiveCategoryTree,
  getActiveFeaturedProducts,
  getNewestActiveProducts,
} from "@/lib/catalog";
import { isChristmasSeason } from "@/lib/seasonal";

/**
 * /demo, /demo/1, /demo/2, /demo/3: preview of the home page with the
 * partner banner on top and the home page fixes applied. Not linked from
 * anywhere and not indexed. The live home page (/) is untouched until one
 * of these is approved.
 */

export const metadata: Metadata = {
  title: "Home page demo",
  robots: { index: false, follow: false },
};

const DEMOS: { n: string; variant: PartnerBannerVariant; label: string }[] = [
  { n: "1", variant: "black", label: "Black" },
  { n: "2", variant: "light", label: "Light" },
  { n: "3", variant: "green", label: "Green" },
];

const STEPS = [
  {
    n: "01",
    t: "Browse",
    d: "Explore our collection of unique 3D printed products.",
    c: BRAND.blue,
    icon: "/icons/ninja/nav/shop@128.png",
  },
  {
    n: "02",
    t: "Select",
    d: "Pick your favourite, choose your options, and add it to your bag.",
    c: BRAND.green,
    icon: "/icons/ninja/emoji/tip@128.png",
  },
  {
    n: "03",
    t: "Checkout",
    d: "Pay securely with PayPal. We ship across Malaysia.",
    c: BRAND.purple,
    icon: "/icons/ninja/nav/download@128.png",
  },
];

export default async function HomeDemoPage({
  params,
}: {
  params: Promise<{ n?: string[] }>;
}) {
  const { n } = await params;
  if (n && n.length > 1) notFound();
  const demo = DEMOS.find((d) => d.n === (n?.[0] ?? "1"));
  if (!demo) notFound();

  const [categoryTree, featured] = await Promise.all([
    getActiveCategoryTree().catch(() => []),
    getActiveFeaturedProducts(4).catch(() => []),
  ]);
  // Nothing flagged featured? Show the newest products instead, so the home
  // page never renders without a single product on it.
  const usingNewest = featured.length === 0;
  const products = usingNewest
    ? await getNewestActiveProducts(8).catch(() => [])
    : featured;

  return (
    <div
      style={{ backgroundColor: "#FFFFFF", color: BRAND.ink }}
      className="min-h-screen flex flex-col"
    >
      <FontFaceLoader />
      <PartnerBanner variant={demo.variant} />
      <SiteNav categoryTree={categoryTree} showChristmas={isChristmasSeason()} />
      <main className="flex-1 overflow-x-clip">
        {/* Hero: tighter on phones, both buttons on one row, no stars
            sitting on top of the buttons. */}
        <section className="relative overflow-hidden bg-white pt-8 pb-12 md:pt-14 md:pb-16">
          <Shuriken
            className="absolute top-6 left-4 h-7 w-7 opacity-50 animate-spin-slow md:top-10 md:left-8 md:h-10 md:w-10"
            fill={BRAND.blue}
          />
          <Shuriken
            className="absolute top-20 right-4 h-9 w-9 opacity-40 animate-spin-slow md:top-24 md:right-16 md:h-14 md:w-14"
            fill={BRAND.green}
          />
          <Shuriken
            className="absolute bottom-24 left-24 hidden h-8 w-8 opacity-60 animate-spin-slow md:block"
            fill={BRAND.purple}
          />
          <Shuriken
            className="absolute bottom-32 right-10 hidden h-12 w-12 opacity-40 animate-spin-slow md:block"
            fill={BRAND.blue}
          />
          <div className="mx-auto max-w-6xl px-6 text-center">
            <p
              className="mb-5 inline-block rounded-full px-4 py-1 text-xs font-bold md:mb-8 md:text-sm"
              style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
            >
              Kids by day, 3D printing Ninjas by Night
            </p>
            <div className="mb-4 flex justify-center md:mb-6">
              <Logo
                size={320}
                priority
                className="h-auto w-[168px] rounded-xl sm:w-[240px] md:w-[280px]"
              />
            </div>
            <h1 className="font-[var(--font-heading)] text-[2rem] leading-tight tracking-tight text-zinc-900 sm:text-5xl md:text-6xl">
              Cool Designs Made by Kids For Kids.
              <br />
              <span style={{ color: BRAND.greenDark }}>
                Shipped across Malaysia.
              </span>
            </h1>
            <div className="mt-7 flex justify-center gap-3 md:mt-10 md:gap-4">
              <Link
                href="/shop"
                className="inline-flex min-h-[52px] items-center rounded-full px-6 text-base font-bold shadow-[0_4px_0_rgba(11,16,32,0.15)] transition hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(11,16,32,0.15)] active:translate-y-[3px] md:min-h-[60px] md:px-8 md:text-lg"
                style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
              >
                Shop the drop
              </Link>
              <a
                href="#how"
                className="inline-flex min-h-[52px] items-center rounded-full border-2 px-6 text-base font-bold transition hover:bg-zinc-50 active:translate-y-[1px] md:min-h-[60px] md:px-8 md:text-lg"
                style={{ borderColor: BRAND.blue, color: BRAND.blue }}
              >
                How it works
              </a>
            </div>
          </div>
        </section>

        {/* Products: always present now. */}
        {usingNewest ? (
          <FeaturedRail
            products={products}
            title="NEW DROPS"
            subtitle="Fresh off the printer. Made to order in Kuala Lumpur."
          />
        ) : (
          <FeaturedRail products={products} />
        )}
        {products.length ? (
          <div
            className="-mt-6 pb-14 text-center md:-mt-10 md:pb-20"
            style={{ backgroundColor: "#FAFAFA" }}
          >
            <Link
              href="/shop"
              className="inline-flex min-h-[48px] items-center rounded-full border-2 px-7 font-bold transition hover:bg-white active:translate-y-[1px]"
              style={{ borderColor: BRAND.ink, color: BRAND.ink }}
            >
              See all products
            </Link>
          </div>
        ) : null}

        {/* How it works: compact rows on phones, cards from md up. */}
        <section
          id="how"
          className="border-t border-zinc-100 bg-white py-12 md:py-24"
        >
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="mb-8 text-center font-[var(--font-heading)] text-3xl text-zinc-900 md:mb-12 md:text-5xl">
              3 STEPS.{" "}
              <span style={{ color: BRAND.greenDark }}>
                NO NINJA SKILLS NEEDED.
              </span>
            </h2>
            <ol className="grid gap-3 md:grid-cols-3 md:gap-6">
              {STEPS.map((s) => (
                <li
                  key={s.n}
                  className="flex items-center gap-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm md:block md:rounded-[28px] md:border-b-[6px] md:p-8"
                  style={{ borderBottomColor: s.c }}
                >
                  <Image
                    src={s.icon}
                    alt=""
                    width={64}
                    height={64}
                    className="h-14 w-14 shrink-0 object-contain md:mb-2 md:h-16 md:w-16"
                  />
                  <div className="min-w-0">
                    <div
                      className="mb-3 hidden font-[var(--font-heading)] text-5xl md:block"
                      style={{ color: s.c }}
                    >
                      {s.n}
                    </div>
                    <h3 className="text-lg font-bold text-zinc-900 md:mb-2 md:text-2xl">
                      <span className="mr-2 md:hidden" style={{ color: s.c }}>
                        {s.n}
                      </span>
                      {s.t}
                    </h3>
                    <p className="text-sm text-zinc-600 md:text-base">{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          className="border-t border-zinc-100 py-14 text-center md:py-20"
          style={{ backgroundColor: "#FAFAFA" }}
        >
          <div className="mb-5 flex justify-center">
            <Logo size={72} />
          </div>
          <h2 className="mb-6 font-[var(--font-heading)] text-3xl text-zinc-900 md:text-5xl">
            READY TO <span style={{ color: BRAND.purple }}>SHOP?</span>
          </h2>
          <Link
            href="/shop"
            className="inline-flex min-h-[60px] items-center rounded-full px-10 py-5 text-lg font-bold shadow-[0_4px_0_rgba(11,16,32,0.15)] transition hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(11,16,32,0.15)] active:translate-y-[3px]"
            style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
          >
            Shop the drop
          </Link>
        </section>
      </main>
      <SiteFooter />
      <CartDrawer />

      {/* Demo-only switcher. Not part of the design. */}
      <nav
        aria-label="Demo templates"
        className="fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-zinc-300 bg-white p-1 shadow-lg"
      >
        {DEMOS.map((d) => {
          const on = d.n === demo.n;
          return (
            <Link
              key={d.n}
              href={`/demo/${d.n}`}
              aria-current={on ? "page" : undefined}
              className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full px-4 text-sm font-bold"
              style={
                on
                  ? { backgroundColor: BRAND.ink, color: "#FFFFFF" }
                  : { color: BRAND.ink }
              }
            >
              {d.n}. {d.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
