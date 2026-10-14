import type { NextConfig } from "next";

// Server-only: where the Next.js server forwards /api/* (never exposed to the browser).
// Rewrites are resolved at build time for production builds, so set it before `next build`.
const apiOrigin = (process.env.API_INTERNAL_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  // Customer links carry their token in the URL fragment; never leak URLs to other sites.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), microphone=(self)" },
  ...(isProd
    ? [
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            // Next.js injects inline bootstrap scripts; a nonce-based CSP is listed in docs/SECURITY.md as a gap.
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "media-src 'self' blob:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'",
          ].join("; "),
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // Uploads (up to 25 MB audio) are streamed through the /api rewrite.
    proxyTimeout: 120_000,
    // Studio, print and review screens deliberately render in the browser from the authorized API
    // (see components/browser-only.tsx), so only segments that export `instant` are validated.
    instantInsights: { validationLevel: "manual-warning" },
  },
  async rewrites() {
    return {
      beforeFiles: [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
