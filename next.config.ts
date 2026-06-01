import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.vercel-scripts.com https://js.stripe.com https://payment-wrapper.liteapi.travel https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://images.unsplash.com https://images.pexels.com https://videos.pexels.com https://static.cupid.travel https://*.cupid.travel https://*.liteapi.travel https://*.geoapify.com https://maps.geoapify.com https://www.google-analytics.com https://www.googletagmanager.com",
  "media-src 'self' https://videos.pexels.com",
  "connect-src 'self' https://*.upstash.io https://api.travelpayouts.com https://api.liteapi.travel https://api.sandbox.liteapi.travel https://book.liteapi.travel https://payment-wrapper.liteapi.travel https://api.stripe.com https://api.geoapify.com https://api.anthropic.com https://vitals.vercel-insights.com https://vercel.live https://www.google-analytics.com https://*.analytics.google.com https://*.google-analytics.com https://www.googletagmanager.com",
  // `vercel.live` covers the Vercel preview toolbar feedback iframe — without
  // it the browser logs `Framing 'https://vercel.live/' violates CSP` on every
  // preview deployment view. Vercel does not inject the toolbar on production
  // builds, so this directive is effectively a no-op there.
  "frame-src 'self' https://payment-wrapper.liteapi.travel https://js.stripe.com https://hooks.stripe.com https://vercel.live",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const permissionsPolicy = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  // B5: Stripe Payment Element (cross-origin iframe) needs the `payment`
  // permission — `payment=()` made the browser block it. Allowlist self +
  // the LiteAPI/Stripe iframe origins only; every other directive unchanged.
  'payment=(self "https://payment-wrapper.liteapi.travel" "https://js.stripe.com" "https://hooks.stripe.com")',
  "usb=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
  "interest-cohort=()",
].join(", ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Permissions-Policy", value: permissionsPolicy },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  async redirects() {
    return [
      {
        source: "/en",
        destination: "/",
        permanent: true,
      },
      {
        source: "/en/:path*",
        destination: "/:path*",
        permanent: true,
      },
      // The bare /hotele landing duplicated the homepage hero; we funnel
      // everyone to the (nicer) homepage instead. EXACT match only — the
      // sub-routes /hotele/szukaj, /hotele/[hotelId], /hotele/rezerwacja and
      // /hotele/w/[miasto] are NOT affected (they have their own path segment).
      {
        source: "/hotele",
        destination: "/",
        permanent: true,
      },
    ];
  },
  images: {
    // Custom loader bypasses Vercel's /_next/image entirely. Every <Image> in
    // the app now ships a CDN URL straight to the browser — zero Vercel image
    // transformations, zero cache writes. Local files (/public/*) and CDN
    // images (Pexels, Unsplash, LiteAPI/Cupid) are handled by the loader at
    // src/lib/images/cdn-loader.ts. See the file's header for the per-host
    // strategy and the rationale (free-tier quota exhaustion 2026-05-25).
    loader: "custom",
    loaderFile: "./src/lib/images/cdn-loader.ts",
    // Next 16 wymaga jawnej listy dozwolonych wartosci `quality`. Hero
    // backdrop uzywa 70 (perf), reszta domyslnie 75.
    qualities: [70, 75],
    // Logo serwisu jest SVG (helptravel-logo.svg / helptravel-mark.svg) -
    // wymagane, by next/image mogl je serwowac. CSP blokuje skrypty wewnatrz SVG.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
      },
      {
        protocol: "https",
        hostname: "videos.pexels.com",
      },
      {
        protocol: "https",
        hostname: "static.cupid.travel",
      },
      {
        protocol: "https",
        hostname: "**.cupid.travel",
      },
      {
        protocol: "https",
        hostname: "**.liteapi.travel",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/hotele/szukaj",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=300, stale-while-revalidate=900" },
          ...securityHeaders,
        ],
      },
      {
        source: "/sitemap.xml",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/robots.txt",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withBundleAnalyzer(nextConfig);
