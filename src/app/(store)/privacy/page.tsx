import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { BUSINESS } from "@/lib/business-info";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How 3D Ninjaz collects, uses, and protects your personal data under Malaysia's Personal Data Protection Act 2010.",
};

// Execution-time date at build. Pin to a fixed string pre-launch when the
// policy is formally reviewed.
const LAST_UPDATED = new Date().toISOString().slice(0, 10);

/**
 * /privacy — PDPA 2010 compliant privacy notice.
 *
 * This page closes the consent loop started on /register (the PDPA
 * checkbox links here). Content is 100% hard-coded JSX — no Markdown,
 * no admin-editable copy, no user input. The ONLY dynamic values come
 * from the controlled BUSINESS constant and LAST_UPDATED (build time).
 * This deliberately eliminates stored-XSS and unintentional PII leakage
 * surfaces (threat T-04-02-01).
 *
 * D-03: 3D Ninjaz is NOT SST-registered. This policy does NOT mention
 * SST, tax registration, or "tax compliance" as a data retention reason;
 * retention is justified by standard Malaysian accounting practice.
 *
 * Required PDPA 2010 sections (11), all present as distinct <h2>:
 *   1. Who we are
 *   2. What data we collect
 *   3. Why we collect it (purpose)
 *   4. Who we share it with (third parties)
 *   5. How long we keep it (retention)
 *   6. Your rights under PDPA 2010
 *   7. How to exercise your rights / contact us
 *   8. Cookies
 *   9. Security
 *  10. Changes to this policy
 *  11. Consent record
 */
export default function PrivacyPage() {
  return (
    <article
      className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16"
      style={{ color: BRAND.ink }}
    >
      <header>
        <h1 className="font-heading text-4xl sm:text-5xl">Privacy Policy</h1>
        <p className="mt-2 text-sm" style={{ color: "#475569" }}>
          Last updated: {LAST_UPDATED}
        </p>
        <p className="mt-4 text-base leading-relaxed">
          {BUSINESS.legalName} (&ldquo;3D Ninjaz&rdquo;, &ldquo;we&rdquo;,
          &ldquo;us&rdquo;) collects and uses personal data to run our
          online store. This notice explains what we collect, why, how long
          we keep it, and your rights under Malaysia&rsquo;s Personal Data
          Protection Act 2010 (PDPA).
        </p>
      </header>

      <section className="mt-10 space-y-10">
        <div>
          <h2 className="font-heading text-2xl">1. Who we are</h2>
          <p className="mt-2 text-base leading-relaxed">
            3D Ninjaz is operated by {BUSINESS.legalName}, based in{" "}
            {BUSINESS.city}, {BUSINESS.country}. We run a small e-commerce
            store selling 3D-printed goods, printed to order on our own
            printers.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">2. What data we collect</h2>
          <p className="mt-2 text-base leading-relaxed">
            We collect only the data we need to run the store. There are four
            groups:
          </p>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="font-semibold">Account data</dt>
              <dd className="mt-1 text-base leading-relaxed">
                Your name, email address, a password (stored as a one-way
                salted hash &mdash; we never see or store the plaintext), and
                the timestamp at which you agreed to this policy during
                registration.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Order data</dt>
              <dd className="mt-1 text-base leading-relaxed">
                Shipping address, phone number (for delivery), items
                purchased, sizes, quantities, and the total amount paid.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Payment data</dt>
              <dd className="mt-1 text-base leading-relaxed">
                Payments are handled entirely by PayPal. We store the PayPal
                transaction reference so we can match your order to the
                payment &mdash; we do <strong>not</strong> store your card
                number, CVC, or PayPal sign-in details.
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Technical data</dt>
              <dd className="mt-1 text-base leading-relaxed">
                Your IP address, browser and device details, and essential
                session cookies used to keep you signed in and to hold your
                bag between pages.
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h2 className="font-heading text-2xl">
            3. Why we collect it (purpose)
          </h2>
          <p className="mt-2 text-base leading-relaxed">
            We use your data to:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-base leading-relaxed">
            <li>Fulfil and deliver your orders.</li>
            <li>Provide customer support for your orders.</li>
            <li>
              Keep accurate accounting and transaction records as expected of
              a Malaysian business.
            </li>
            <li>Detect and prevent fraud or abuse of the store.</li>
            <li>Keep the site secure and operational.</li>
          </ul>
          <p className="mt-3 text-base leading-relaxed">
            We do <strong>not</strong> sell your data to third parties. We do{" "}
            <strong>not</strong> use your data to build advertising profiles.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">
            4. Who we share it with (third parties)
          </h2>
          <p className="mt-2 text-base leading-relaxed">
            We share only the minimum necessary data with a small set of
            trusted providers:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-6 text-base leading-relaxed">
            <li>
              <strong>PayPal</strong> &mdash; payment processing. Governed by
              PayPal&rsquo;s own privacy policy at paypal.com.
            </li>
            <li>
              <strong>Our email provider</strong> &mdash; transactional order
              emails (confirmations, shipping notices). We use our cPanel
              SMTP mail server; emails are sent from {BUSINESS.contactEmail}.
            </li>
            <li>
              <strong>Our hosting provider</strong> &mdash; the site and
              database are hosted on our cPanel account for 3dninjaz.com.
            </li>
            <li>
              <strong>Couriers</strong> &mdash; when we ship your order we
              share your name, phone number, and shipping address with the
              courier.
            </li>
            <li>
              <strong>Analytics</strong> &mdash; we do <strong>not</strong>{" "}
              currently run any third-party analytics, advertising pixels, or
              marketing trackers. If we add any in future, we will update
              this notice before they go live.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-2xl">
            5. How long we keep it (retention)
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-6 text-base leading-relaxed">
            <li>
              <strong>Order and invoice records:</strong>{" "}
              {BUSINESS.retention.orders}.
            </li>
            <li>
              <strong>Account data:</strong> {BUSINESS.retention.account}.
            </li>
            <li>
              <strong>Marketing communications:</strong>{" "}
              {BUSINESS.retention.marketing}. (We do not run marketing lists
              in v1; this clause is future-proofing.)
            </li>
          </ul>
          <p className="mt-3 text-base leading-relaxed">
            Beyond these periods we delete or irreversibly anonymise the
            data.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">
            6. Your rights under PDPA 2010
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-6 text-base leading-relaxed">
            <li>
              <strong>Right of access:</strong> request a copy of the
              personal data we hold about you.
            </li>
            <li>
              <strong>Right of correction:</strong> ask us to correct
              inaccurate or incomplete data.
            </li>
            <li>
              <strong>Right to withdraw consent:</strong> withdraw the
              consent you gave at registration. Withdrawing consent may limit
              our ability to provide some services (for example, we can no
              longer process new orders without an account).
            </li>
            <li>
              <strong>Right to request deletion:</strong> ask us to delete
              your account. We may still need to retain order records for
              the accounting period noted above; we will delete what we can
              and anonymise the rest.
            </li>
            <li>
              <strong>Right to data portability:</strong> request your data
              in a machine-readable format.
            </li>
            <li>
              <strong>Right to complain:</strong> if you&rsquo;re unhappy
              with our response, you can escalate to the Department of
              Personal Data Protection, Malaysia.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-heading text-2xl">
            7. How to exercise your rights / contact us
          </h2>
          <p className="mt-2 text-base leading-relaxed">
            Email our data-protection contact at{" "}
            <Link
              href={`mailto:${BUSINESS.dpoEmail}`}
              className="text-[#123456] underline underline-offset-2 hover:opacity-80"
            >
              {BUSINESS.dpoEmail}
            </Link>{" "}
            with your request. Please include enough information for us to
            verify your identity (for example, the email address on your
            account) so we only release data to the right person.
          </p>
          <p className="mt-3 text-base leading-relaxed">
            We respond to data-access requests within <strong>21 business
            days</strong>, as required by PDPA 2010.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">8. Cookies</h2>
          <p className="mt-2 text-base leading-relaxed">
            We use essential cookies only. Specifically:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-base leading-relaxed">
            <li>
              A signed session token that keeps you signed in after you log
              in.
            </li>
            <li>
              A small amount of local storage on your device to remember the
              items in your bag between pages.
            </li>
          </ul>
          <p className="mt-3 text-base leading-relaxed">
            We do <strong>not</strong> set advertising, tracking, or
            cross-site cookies. If we add any analytics cookies in future,
            we will update this notice and, where required, ask for your
            consent before setting them.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">9. Security</h2>
          <ul className="mt-2 list-disc space-y-2 pl-6 text-base leading-relaxed">
            <li>
              Passwords are stored as one-way salted hashes; nobody at 3D
              Ninjaz can read your password.
            </li>
            <li>
              The whole site runs over HTTPS; data in transit is encrypted.
            </li>
            <li>
              Access to the admin area and the customer database is limited
              to authorised staff.
            </li>
            <li>
              Payment card details never touch our servers; PayPal handles
              that data under its own PCI-DSS controls.
            </li>
          </ul>
          <p className="mt-3 text-base leading-relaxed">
            No system is ever 100% secure. If we become aware of a breach
            that affects your personal data, we will notify you by email as
            soon as reasonably possible.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">
            10. Changes to this policy
          </h2>
          <p className="mt-2 text-base leading-relaxed">
            We may update this notice from time to time. The &ldquo;Last
            updated&rdquo; date at the top of the page shows when it last
            changed. If we make a material change that affects how we use
            your data, we will email registered customers to let them know
            before the change takes effect.
          </p>
        </div>

        <div>
          <h2 className="font-heading text-2xl">11. Consent record</h2>
          <p className="mt-2 text-base leading-relaxed">
            When you create an account you tick a PDPA consent checkbox and
            submit the registration form. At that moment we store a
            timestamp of your consent against your account, which serves as
            our record that you agreed to this notice on that date. You can
            withdraw your consent at any time by emailing{" "}
            <Link
              href={`mailto:${BUSINESS.dpoEmail}`}
              className="text-[#123456] underline underline-offset-2 hover:opacity-80"
            >
              {BUSINESS.dpoEmail}
            </Link>
            ; note that withdrawing consent may prevent us from processing
            new orders for you.
          </p>
        </div>
      </section>
    </article>
  );
}
