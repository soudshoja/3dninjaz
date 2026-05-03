import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Hero } from "@/components/store/hero";
import { FeaturedRail } from "@/components/store/featured-rail";
import { Logo } from "@/components/brand/logo";
import { getActiveFeaturedProducts } from "@/lib/catalog";

export const metadata: Metadata = {
  // Omit title so the root layout's default ("3D Ninjaz — 3D Printed
  // Products") is used verbatim. Setting a title here would re-apply the
  // `%s | 3D Ninjaz` template and produce a doubled suffix.
  description:
    "Browse and buy unique 3D printed products. Ninja crafted in Malaysia.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ closed?: string }>;
}) {
  const featured = await getActiveFeaturedProducts(4).catch((err) => {
    console.warn("[home] getActiveFeaturedProducts failed:", err);
    return [];
  });
  const sp = searchParams ? await searchParams : {};
  const closed = sp.closed === "1";

  return (
    <>
      {closed ? (
        <div
          role="status"
          className="px-6 py-4 text-center text-sm"
          style={{ backgroundColor: `${BRAND.purple}25`, color: BRAND.ink }}
        >
          Your account has been closed. We&apos;re sorry to see you go. You
          can always sign up again with a new account.
        </div>
      ) : null}
      <Hero />
      <FeaturedRail products={featured} />

      {/* How it works */}
      <section
        id="how"
        className="py-16 md:py-24 border-t border-zinc-100"
        style={{ backgroundColor: "#FAFAFA" }}
      >
        <div className="max-w-5xl mx-auto px-6">
          <h2
            className="font-[var(--font-heading)] text-3xl md:text-5xl text-center mb-12 text-zinc-900"
          >
            3 STEPS. <span style={{ color: BRAND.green }}>NO JUTSU REQUIRED.</span>
          </h2>
          <ol className="grid md:grid-cols-3 gap-6">
            {[
              {
                n: "01",
                t: "Browse",
                d: "Scroll and checkout all our latest products",
                c: BRAND.blue,
                icon: "/icons/ninja/nav/shop@128.png",
              },
              {
                n: "02",
                t: "Select",
                d: "choose your favourite products or customise and add to cart",
                c: BRAND.green,
                icon: "/icons/ninja/emoji/tip@128.png",
              },
              {
                n: "03",
                t: "Checkout",
                d: "Pay using PayPal safe and Secure payment method available. Shipping across Malaysia",
                c: BRAND.purple,
                icon: "/icons/ninja/nav/download@128.png",
              },
            ].map((s) => (
              <li
                key={s.n}
                className="rounded-[28px] p-8 shadow-sm border border-zinc-200 border-b-[6px] bg-white"
                style={{ borderBottomColor: s.c }}
              >
                <Image
                  src={s.icon}
                  alt=""
                  width={64}
                  height={64}
                  className="h-16 w-16 object-contain mb-2"
                />
                <div
                  className="font-[var(--font-heading)] text-5xl mb-3"
                  style={{ color: s.c }}
                >
                  {s.n}
                </div>
                <h3 className="text-2xl font-bold mb-2 text-zinc-900">{s.t}</h3>
                <p className="text-zinc-600">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA strip — lightened: white bg, purple accent ring */}
      <section className="py-20 text-center bg-white border-t border-zinc-100">
        <div className="flex justify-center mb-6">
          <Logo size={72} />
        </div>
        <h2
          className="font-[var(--font-heading)] text-3xl md:text-5xl mb-6 text-zinc-900"
        >
          READY TO <span style={{ color: BRAND.purple }}>SHOP?</span>
        </h2>
        <Link
          href="/shop"
          className="inline-flex items-center rounded-full px-10 py-5 font-bold text-lg shadow-[0_4px_0_rgba(11,16,32,0.15)] hover:translate-y-[2px] hover:shadow-[0_2px_0_rgba(11,16,32,0.15)] transition min-h-[60px]"
          style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
        >
          Shop the drop
        </Link>
      </section>
    </>
  );
}
