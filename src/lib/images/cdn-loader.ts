// Custom Next.js image loader — bypasses Vercel's /_next/image entirely.
//
// Why: every unique (src, width, format) combination served by /_next/image
// counts against Vercel's free-tier "Image Optimization - Transformations"
// (5,000/mo) and "Cache Writes" (100,000/mo). With 50 hotels per search × 3
// responsive widths × 2 formats (AVIF + WebP) ≈ 300 transformations per
// search, the project burned through the cache-writes quota in a few days.
//
// What this loader does:
//   • Local files (/branding/*, etc.) — passthrough. Next still serves them
//     from /public/ statically (CDN-cached, no per-request transformation).
//   • Pexels (images.pexels.com) — uses Pexels' own width parameter, which
//     returns a responsively-resized JPEG/PNG from their CDN.
//   • Unsplash (images.unsplash.com) — uses Unsplash's `?w=&q=&auto=format,
//     compress` API, which returns a responsively-resized AVIF/WebP.
//   • LiteAPI / Cupid Travel (*.liteapi.travel, *.cupid.travel) — passthrough.
//     Their URLs already include the rendition size (e.g. `/800x600/`) and
//     the CDN ships AVIF/WebP via content negotiation.
//   • Anything else — passthrough.
//
// Net effect: every <Image> in the app ships a CDN-served URL directly to
// the browser. No /_next/image calls. No Vercel transformations consumed.
// No cache writes consumed. Quality unchanged (the source CDNs serve the
// same compressed renditions Vercel was previously re-fetching to optimise).
//
// IMPORTANT: this file is referenced by next.config.ts as `images.loaderFile`.
// It MUST default-export the loader function and MUST NOT have side effects.
// Next.js loads this once at build time and bundles it into the client.

import type { ImageLoaderProps } from "next/image";

export default function cdnLoader({ src, width, quality }: ImageLoaderProps): string {
  const q = Math.min(100, Math.max(1, quality ?? 75));

  // Local files served from /public/ — no transformation, just shipped as-is.
  // Hits the Vercel static-asset CDN, which caches them aggressively for free.
  if (src.startsWith("/")) {
    return src;
  }

  // data: / blob: — already inline.
  if (src.startsWith("data:") || src.startsWith("blob:")) {
    return src;
  }

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    // Unparseable — let the browser handle it. (Should never happen with
    // valid next/image input, but defensive.)
    return src;
  }

  const host = url.hostname.toLowerCase();

  // ── Pexels ─────────────────────────────────────────────────────────────
  // Their CDN supports ?auto=compress&cs=tinysrgb&w=NNN&dpr=N. We pin dpr=1
  // because Next's `sizes` already requests retina widths from this loader
  // (so we'd be double-applying density otherwise).
  if (host === "images.pexels.com" || host === "videos.pexels.com") {
    url.searchParams.set("auto", "compress");
    url.searchParams.set("cs", "tinysrgb");
    url.searchParams.set("w", String(width));
    url.searchParams.set("dpr", "1");
    return url.toString();
  }

  // ── Unsplash ───────────────────────────────────────────────────────────
  // ?w=NNN&q=NN&auto=format,compress&fit=crop returns an AVIF/WebP at the
  // requested width with auto-format negotiation against the browser.
  if (host === "images.unsplash.com") {
    url.searchParams.set("w", String(width));
    url.searchParams.set("q", String(q));
    url.searchParams.set("auto", "format,compress");
    url.searchParams.set("fit", "crop");
    return url.toString();
  }

  // ── LiteAPI / Cupid Travel ─────────────────────────────────────────────
  // Their URLs already include a fixed rendition (e.g. `/800x600/`) in the
  // path. Passthrough — the CDN negotiates AVIF/WebP via Accept headers and
  // we get the bytes directly from their edge.
  if (
    host === "static.cupid.travel" ||
    host.endsWith(".cupid.travel") ||
    host.endsWith(".liteapi.travel") ||
    host === "api.geoapify.com" ||
    host === "maps.geoapify.com" ||
    host.endsWith(".geoapify.com")
  ) {
    return src;
  }

  // ── Default: passthrough ───────────────────────────────────────────────
  // Any other hostname whitelisted in next.config.ts images.remotePatterns
  // gets shipped to the browser as-is. Browser fetches directly from origin.
  return src;
}
