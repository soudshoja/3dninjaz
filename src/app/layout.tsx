import type { Metadata, Viewport } from "next";
import { Russo_One, Chakra_Petch } from "next/font/google";
import "./globals.css";
import { SITE } from "@/lib/site-metadata";
import { JsonLd } from "@/components/seo/json-ld";

const russoOne = Russo_One({
  weight: "400",
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

const chakraPetch = Chakra_Petch({
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [...SITE.keywords],
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    url: SITE.url,
    locale: SITE.locale,
    images: [
      {
        url: SITE.ogImage,
        width: 1200,
        height: 630,
        alt: `${SITE.name} logo`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: [SITE.ogImage],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: SITE.themeColor,
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${russoOne.variable} ${chakraPetch.variable} font-body antialiased`}
      >
        {children}
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Organization",
            name: SITE.name,
            url: SITE.url,
            logo: `${SITE.url}/logo.png`,
            description: SITE.description,
            areaServed: "MY",
            contactPoint: {
              "@type": "ContactPoint",
              email: SITE.socials.email,
              contactType: "customer support",
              availableLanguage: ["English"],
            },
            // sameAs socials pending per DECISIONS.md D-05 — filter empty
            // strings so we don't emit invalid schema.org entries. Exclude the
            // contact email (it's a mailto, not a social profile URL).
            sameAs: [SITE.socials.instagram, SITE.socials.tiktok].filter(
              (v) => typeof v === "string" && v.length > 0,
            ),
          }}
        />
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: SITE.name,
            url: SITE.url,
            description: SITE.description,
            inLanguage: "en-MY",
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: `${SITE.url}/shop?q={search_term_string}`,
              },
              "query-input": "required name=search_term_string",
            },
          }}
        />
      </body>
    </html>
  );
}
