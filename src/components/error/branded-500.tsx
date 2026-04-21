import Image from "next/image";
import { BRAND } from "@/lib/brand";

/**
 * Phase 7 (07-09) — branded 500 page body.
 * Art refreshed to use /icons/ninja/errors/500.png (ninja looking confused
 * next to a gear + question-mark thought bubble).
 *
 * Props are STRICTLY { requestId, reset? } — `error` object is NEVER
 * passed in (T-07-09-error-page-leak / D-07-12). Stack/message logged
 * server-side only.
 */
export function BrandedFiveHundred({
  requestId,
  reset,
}: {
  requestId: string;
  reset?: () => void;
}) {
  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="max-w-lg w-full text-center">
        <Image
          src="/icons/ninja/errors/500.png"
          alt="3D Ninjaz ninja confused next to a gear — something broke"
          width={256}
          height={256}
          sizes="256px"
          priority
          className="mx-auto mb-6 h-[256px] w-[256px] object-contain"
        />
        <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl mb-3">
          Something went wrong
        </h1>
        <p className="text-slate-700 mb-2">
          The ninja stumbled. Please try again, or contact support and quote
          the reference below.
        </p>
        <p className="font-mono text-sm text-slate-600 mb-6">
          Reference: <span className="font-bold">{requestId}</span>
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {reset ? (
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-[48px] items-center rounded-md px-5 py-3 text-white font-semibold"
              style={{ backgroundColor: BRAND.blue }}
            >
              Try again
            </button>
          ) : null}
          <a
            href="/"
            className="inline-flex min-h-[48px] items-center rounded-md px-5 py-3 font-semibold border-2"
            style={{ borderColor: BRAND.ink, color: BRAND.ink }}
          >
            Back to homepage
          </a>
        </div>
      </div>
    </main>
  );
}
