import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You're unsubscribed",
  description: "You have been removed from the 3D Ninjaz newsletter.",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<{ invalid?: string }>;
};

/**
 * /unsubscribed — landing page after the public /api/unsubscribe redirect.
 *
 * ?invalid=1 → soft "we couldn't find that subscription" variant (token
 * missing / already unsubscribed). Otherwise the standard confirmation.
 */
export default async function UnsubscribedPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const invalid = sp.invalid === "1";

  return (
    <main
      className="min-h-[70vh] flex items-center justify-center px-6 py-16"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="max-w-md text-center">
        <Image
          src="/icons/ninja/emoji/hello@128.png"
          alt=""
          width={96}
          height={96}
          className="mx-auto h-24 w-24 object-contain mb-4"
        />
        <h1 className="font-[var(--font-heading)] text-3xl mb-3">
          {invalid ? "Hmm, couldn't find that" : "You're unsubscribed"}
        </h1>
        <p className="text-sm text-slate-600 mb-8">
          {invalid
            ? "That unsubscribe link didn't match any active subscription. You may already be off the list."
            : "We'll miss you! You won't get any more emails from us. Come back any time."}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center min-h-[48px] rounded-xl px-5 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: BRAND.blue }}
          >
            Back to 3D Ninjaz
          </Link>
          <Link
            href="/shop"
            className="inline-flex items-center justify-center min-h-[48px] rounded-xl px-5 py-2 text-sm font-semibold"
            style={{
              backgroundColor: "#ffffff",
              color: BRAND.ink,
              border: "1px solid #e4e4e7",
            }}
          >
            Keep shopping
          </Link>
        </div>
      </div>
    </main>
  );
}
