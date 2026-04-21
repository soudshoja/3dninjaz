import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/brand";

/**
 * Reusable branded error surface for any HTTP status code we have ninja art
 * for. Used by routed pages (e.g. /unauthorized, /forbidden) and by the
 * root error boundary's fallback. Kept lean — the existing `BrandedNotFound`
 * and `BrandedFiveHundred` components stay as they are (they have
 * specialized props like `requestId` + `reset`) and instead get updated in
 * place to use the matching ninja image via this component's conventions.
 */

type ErrorCode = 400 | 401 | 403 | 404 | 500 | 502 | 503 | 504;

const TITLES: Record<ErrorCode, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  500: "Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

const BLURBS: Record<ErrorCode, string> = {
  400: "That request didn't look right. Try again?",
  401: "You need to sign in before viewing this page.",
  403: "You don't have permission to view this page.",
  404: "We couldn't find what you were looking for.",
  500: "Something went wrong on our end. Please try again.",
  502: "The upstream gave us an invalid response. Try again soon.",
  503: "The shop is briefly unavailable. Please try again in a moment.",
  504: "The server took too long to respond. Please try again.",
};

const ALT: Record<ErrorCode, string> = {
  400: "3D Ninjaz ninja with a question mark, confused by a bad request",
  401: "3D Ninjaz ninja holding a padlock — unauthorized",
  403: "3D Ninjaz ninja with a prohibition sign — access forbidden",
  404: "3D Ninjaz ninja with a magnifying glass — page not found",
  500: "3D Ninjaz ninja with a gear — something broke",
  502: "3D Ninjaz ninja shrugging — bad gateway",
  503: "3D Ninjaz ninja with a clock — service unavailable",
  504: "3D Ninjaz ninja with an hourglass — gateway timeout",
};

export function NinjaError({
  code,
  title,
  blurb,
  primaryHref = "/",
  primaryLabel = "Back to homepage",
  secondaryHref,
  secondaryLabel,
}: {
  code: ErrorCode;
  title?: string;
  blurb?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  const effectiveTitle = title ?? `${code} ${TITLES[code]}`;
  const effectiveBlurb = blurb ?? BLURBS[code];
  const src = `/icons/ninja/errors/${code}.png`;

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
    >
      <div className="max-w-lg w-full text-center">
        <Image
          src={src}
          alt={ALT[code]}
          width={256}
          height={256}
          sizes="256px"
          priority
          className="mx-auto mb-6 h-[256px] w-[256px] object-contain"
        />
        <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl mb-3">
          {effectiveTitle}
        </h1>
        <p className="text-slate-700 mb-6">{effectiveBlurb}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href={primaryHref}
            className="inline-flex min-h-[48px] items-center rounded-md px-5 py-3 text-white font-semibold"
            style={{ backgroundColor: BRAND.blue }}
          >
            {primaryLabel}
          </Link>
          {secondaryHref && secondaryLabel ? (
            <Link
              href={secondaryHref}
              className="inline-flex min-h-[48px] items-center rounded-md px-5 py-3 font-semibold border-2"
              style={{ borderColor: BRAND.ink, color: BRAND.ink }}
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
