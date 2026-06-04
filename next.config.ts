import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath,
  assetPrefix: basePath || undefined,
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // Phase 7 (07-08) — long-cache headers for processed image variants.
  // Variants live under /uploads/products/<bucket>/<id>/{400,800,1600}w.{webp,avif,jpg}
  // and the <id> directory is content-addressed (UUID), so the URL never
  // collides between uploads. Safe to mark immutable.
  async headers() {
    return [
      {
        source:
          "/uploads/:path*\\.(webp|avif|jpg|jpeg|png|gif)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Page documents must always be revalidated so returning visitors pick up
      // a new deploy without a manual hard-refresh. `no-cache` = "ask the server
      // first" (not "never store"), so the browser re-checks the HTML each visit;
      // the HTML then references the latest content-hashed /_next/static assets.
      //
      // The negative lookahead EXCLUDES anything that must stay cached or set its
      // own headers: hashed build assets (_next/), uploaded media (uploads/),
      // API + route handlers (api/), and any path containing a file extension
      // (e.g. .pdf invoices, favicon.ico, sitemap.xml). What's left = clean page
      // routes (no extension) = the HTML documents we want fresh.
      {
        source: "/((?!_next/|uploads/|api/|.*\\.).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
