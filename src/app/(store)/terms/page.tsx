import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { BUSINESS } from "@/lib/business-info";
import { WhatsAppCta } from "@/components/store/whatsapp-cta";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "3D Ninjaz terms of service covering orders, payment, delivery, and returns.",
};

// Execution-time date. Set at build time; changes with each rebuild.
// For a formal effective-date we can pin this to a fixed string pre-launch.
const LAST_UPDATED = new Date().toISOString().slice(0, 10);

/**
 * /terms — plain-English terms of service.
 *
 * D-03: 3D Ninjaz is NOT SST-registered. This page MUST NOT state a
 * tax-status claim ("prices inclusive of SST" or similar). Prices are
 * simply "displayed in MYR (Malaysian Ringgit)".
 */
export default function TermsPage() {
  return (
    <article
      className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16"
      style={{ color: BRAND.ink }}
    >
      <header>
        <h1 className="font-heading text-4xl sm:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm" style={{ color: "#475569" }}>
          Last updated: {LAST_UPDATED}
        </p>
        <p className="mt-4 text-base leading-relaxed">
          These terms apply when you browse, order from, or otherwise use
          this website. By placing an order you agree to these terms. If
          you disagree with any part, please don&rsquo;t place an order.
        </p>
      </header>

      <section className="mt-10 space-y-8">
        <div>
          <h2 className="font-heading text-2xl">1. Who we are</h2>
          <p className="mt-2 text-base leading-relaxed">
            This site is operated by {BUSINESS.legalName}, based in{" "}
            {BUSINESS.city}, {BUSINESS.country}. In these terms, &ldquo;we&rdquo;,
            &ldquo;us&rdquo; and &ldquo;our&rdquo; refer to {BUSINESS.legalName}.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">
            2. Accounts
          </h2>
          <p className="mt-2 text-base leading-relaxed">
            You need a customer account to place an order. You&rsquo;re
            responsible for keeping your sign-in details private and for
            activity on your account. Let us know immediately if you suspect
            your account has been used without permission.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">
            3. Ordering and payment
          </h2>
          <p className="mt-2 text-base leading-relaxed">
            Products are available in three sizes: Small, Medium, and Large.
            Prices are displayed in MYR (Malaysian Ringgit). Payment is
            processed by PayPal; we never see or store your card details.
            Your order is confirmed only after PayPal returns a successful
            payment capture; if payment fails, the order is cancelled
            automatically.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">4. Delivery</h2>
          <p className="mt-2 text-base leading-relaxed">
            Every piece is printed to order on our {BUSINESS.city} printers,
            so expect a short lead time before your parcel ships. Typical
            production and shipping timeframes appear on each product page
            and in your order confirmation email. We ship within Malaysia.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">
            5. Cancellations and returns
          </h2>
          <ul className="mt-2 space-y-2 text-base leading-relaxed">
            <li>
              <strong>Before production:</strong> contact us as soon as
              possible and we&rsquo;ll do our best to cancel or amend the
              order free of charge.
            </li>
            <li>
              <strong>After production starts:</strong> because each item
              is made to order, cancellations are at our discretion.
            </li>
            <li>
              <strong>Defective or incorrect items:</strong> notify us within
              14 days of delivery with photos and your order number. We will
              replace or refund the affected item and cover return shipping.
            </li>
            <li>
              <strong>Change of mind:</strong> return shipping is at your
              cost; items must be unused and in their original condition.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-2xl">6. Prices</h2>
          <p className="mt-2 text-base leading-relaxed">
            All prices are displayed in MYR on the product page. Shipping
            is calculated at checkout. We may update prices at any time, but
            the price shown at the moment you place an order is the price
            you pay for that order.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">
            7. Intellectual property and acceptable use
          </h2>
          <p className="mt-2 text-base leading-relaxed">
            Our product designs, photos, logos, and website content are
            owned by {BUSINESS.legalName}. You may not copy, resell, or
            reproduce our designs &mdash; whether digitally or physically
            &mdash; without our written permission. Purchasing a product
            gives you the physical item, not the design rights.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">8. Liability</h2>
          <p className="mt-2 text-base leading-relaxed">
            Our products are supplied &ldquo;as is&rdquo;. We take care to
            describe items accurately and print them to a good standard, but
            we&rsquo;re not liable for indirect or consequential losses
            arising from use of our products or this site, to the maximum
            extent permitted by Malaysian law. Nothing in these terms limits
            rights you have as a consumer under Malaysian law.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">9. Governing law</h2>
          <p className="mt-2 text-base leading-relaxed">
            These terms are governed by the laws of Malaysia. Any dispute
            will be handled by the courts of Malaysia.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">
            10. Changes to these terms
          </h2>
          <p className="mt-2 text-base leading-relaxed">
            We may update these terms from time to time. The &ldquo;Last
            updated&rdquo; date at the top shows when they last changed.
            Orders placed before an update are governed by the terms in
            force at the time of order.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">11. Contact</h2>
          <p className="mt-2 text-base leading-relaxed">
            Questions about these terms?{" "}
            <Link
              href={`mailto:${BUSINESS.contactEmail}`}
              className="text-[#123456] underline underline-offset-2 hover:opacity-80"
            >
              {BUSINESS.contactEmail}
            </Link>{" "}
            or{" "}
            <WhatsAppCta variant="inline">message us on WhatsApp</WhatsAppCta>
            .
          </p>
        </div>
      </section>
    </article>
  );
}
