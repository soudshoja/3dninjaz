import Link from "next/link";
import { BRAND } from "@/lib/brand";

export default function OrderSuccessPage({
  searchParams,
}: {
  searchParams: { n?: string };
}) {
  const orderNumber = searchParams.n ?? "";

  return (
    <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="text-center max-w-md px-6 py-12">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl mb-3">
          Order placed!
        </h1>
        {orderNumber && (
          <p className="text-lg font-semibold mb-2">
            Order {orderNumber}
          </p>
        )}
        <p className="text-slate-600 mb-8">
          Thank you for your purchase. We&apos;ll be in touch to confirm and arrange delivery.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full px-8 py-3 font-bold text-white"
          style={{ backgroundColor: BRAND.ink }}
        >
          Continue shopping
        </Link>
      </div>
    </main>
  );
}
