import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },

  // ── Static-asset caching (production only) ────────────────────────────────
  // Next.js hashes /_next/static/* filenames in production builds — immutable
  // is safe there. In dev, Turbopack re-uses filenames across HMR updates so
  // immutable caching breaks hot reload (browser won't re-fetch changed chunks).
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: isProd
              ? "public, max-age=31536000, immutable"
              : "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        // Fonts and images in /public
        source: "/:path(.*\\.(?:woff2?|ttf|otf|eot|ico|png|jpg|jpeg|webp|svg))",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "unstop.com" },
      { protocol: "https", hostname: "media.licdn.com" },
      { protocol: "https", hostname: "adplist.org" },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
