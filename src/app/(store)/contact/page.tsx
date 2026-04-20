import type { Metadata } from "next";
import Image from "next/image";
import { BRAND } from "@/lib/brand";
import { BUSINESS } from "@/lib/business-info";
import { WhatsAppCta } from "@/components/store/whatsapp-cta";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Chat with 3D Ninjaz on WhatsApp or email us. Kuala Lumpur, Malaysia.",
};

/**
 * /contact — business info + primary WhatsApp CTA + email fallback.
 * No contact form in v1 (scope) — WhatsApp covers the conversational side.
 */
export default function ContactPage() {
  return (
    <section
      aria-labelledby="contact-title"
      className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16"
      style={{ color: BRAND.ink }}
    >
      <header className="text-center">
        <Image
          src="/icons/ninja/emoji/contact.png"
          alt=""
          width={140}
          height={140}
          priority
          className="mx-auto mb-3 h-[140px] w-[140px] object-contain"
        />
        <span
          className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.2em]"
          style={{ backgroundColor: BRAND.green, color: BRAND.ink }}
        >
          Contact
        </span>
        <h1
          id="contact-title"
          className="mt-4 font-heading text-4xl sm:text-5xl text-zinc-900"
        >
          Get in touch.
        </h1>
        <p className="mt-3 text-base sm:text-lg text-zinc-600">
          We reply fastest on WhatsApp.
        </p>
      </header>

      {/* Primary CTA */}
      <div className="mt-10 flex justify-center">
        <WhatsAppCta
          variant="primary"
          message={`Hi 3D Ninjaz, I have a question.`}
        >
          Chat with us on WhatsApp
        </WhatsAppCta>
      </div>

      {/* Other channels */}
      <dl className="mt-12 grid gap-4 sm:grid-cols-2">
        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: "#FAFAFA", border: "1px solid #E4E4E7" }}
        >
          <dt className="font-heading text-sm uppercase tracking-wider opacity-70">
            Email
          </dt>
          <dd className="mt-2">
            <a
              href={`mailto:${BUSINESS.contactEmail}`}
              className="inline-flex min-h-12 items-center font-semibold text-[#2563EB] underline underline-offset-2 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7FAF4] rounded-sm"
            >
              {BUSINESS.contactEmail}
            </a>
          </dd>
        </div>

        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: "#FAFAFA", border: "1px solid #E4E4E7" }}
        >
          <dt className="font-heading text-sm uppercase tracking-wider opacity-70">
            Business hours
          </dt>
          <dd className="mt-2 text-sm leading-relaxed">{BUSINESS.hours}</dd>
        </div>

        <div
          className="rounded-2xl p-5 sm:col-span-2"
          style={{ backgroundColor: "#FAFAFA", border: "1px solid #E4E4E7" }}
        >
          <dt className="font-heading text-sm uppercase tracking-wider opacity-70">
            Location
          </dt>
          <dd className="mt-2 text-sm leading-relaxed">
            {BUSINESS.city}, {BUSINESS.country}
            <span className="block opacity-70">
              Full address available on request for delivery or returns.
            </span>
          </dd>
        </div>
      </dl>

      <div
        className="mt-10 rounded-2xl p-5 flex items-start gap-4"
        style={{ backgroundColor: "#FEF3C7", color: BRAND.ink }}
      >
        <Image
          src="/icons/ninja/emoji/tip@128.png"
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 object-contain shrink-0"
        />
        <p className="text-sm leading-relaxed">
          <strong>Tip:</strong> For questions about an existing order, please
          have your order number ready &mdash; it&rsquo;s on your confirmation
          email.
        </p>
      </div>
    </section>
  );
}
