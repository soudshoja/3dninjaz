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
    ];
  },
};

export default nextConfig;
