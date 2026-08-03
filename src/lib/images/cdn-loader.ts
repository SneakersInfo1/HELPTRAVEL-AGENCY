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

// Domyślna jakość kompresji dla zdjęć przepuszczanych przez proxy.
//
// 82 zamiast next-owego 75 (2026-08-02, zgłoszenie właściciela „zdjęcia są
// bardzo słabej jakości"). Sprawdzone przy tej okazji: pipeline NIE jest
// wąskim gardłem rozdzielczości — oryginał hotelu z Cupida ma 3000×2250,
// a wsrv oddaje dokładnie żądaną szerokość (w=768 → 768×576). Miękkość brała
// się więc z samej kompresji, a nie z rozmiaru. 82 to próg, powyżej którego
// WebP przestaje gubić detal w gradientach (niebo, woda) — a takie kadry
// dominują w zdjęciach hoteli i kierunków.
const DEFAULT_QUALITY = 82;

export default function cdnLoader({ src, width, quality }: ImageLoaderProps): string {
  const q = Math.min(100, Math.max(1, quality ?? DEFAULT_QUALITY));

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
    // KRYTYCZNE dla ostrości hero: część źródłowych URL-i Pexels niesie wbudowane
    // `h=650`. Z `w` + `h` naraz Pexels oddaje malutki rendition (zmierzone na
    // żywo: prośba o w=1920 zwracała 770×433 → ~5× upscaling w hero). Usuwamy
    // `h`, żeby SAMO `w` sterowało rozdzielczością; aspekt i tak tnie object-cover.
    url.searchParams.delete("h");
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

  // ── Geoapify (mapy, URL z kluczem API) — passthrough ──────────────────
  if (
    host === "api.geoapify.com" ||
    host === "maps.geoapify.com" ||
    host.endsWith(".geoapify.com")
  ) {
    return src;
  }

  // ── LiteAPI / Cupid Travel → proxy wsrv.nl ─────────────────────────────
  // Cupid NIE wspiera renditionów (zmierzone 2026-06-13: /hotels/640x480/…
  // → 404, a realne URL-e z LiteAPI nie mają rozmiaru w ścieżce), więc
  // passthrough wysyłał ORYGINAŁY (~400 KB JPEG) na telefony — główny
  // hamulec LCP na kartach hoteli (Clarity: LCP 2.4 s, jeden pomiar 20.9 s).
  // wsrv.nl (darmowe, cache na Cloudflare) zbija to do ~20-60 KB WebP:
  // zmierzone 402 525 B → 19 428 B przy w=384. `we` = bez powiększania
  // mniejszych oryginałów; CSP: wsrv.nl dodane w next.config.ts.
  if (
    host === "static.cupid.travel" ||
    host.endsWith(".cupid.travel") ||
    host.endsWith(".liteapi.travel")
  ) {
    const proxied = new URL("https://wsrv.nl/");
    proxied.searchParams.set("url", src);
    proxied.searchParams.set("w", String(width));
    proxied.searchParams.set("q", String(q));
    proxied.searchParams.set("output", "webp");
    proxied.searchParams.set("we", "");
    // Awaria po stronie proxy (np. upstream 404/timeout) → redirect na
    // oryginalny URL zamiast zepsutego obrazka.
    proxied.searchParams.set("default", src);
    return proxied.toString();
  }

  // ── Default: passthrough ───────────────────────────────────────────────
  // Any other hostname whitelisted in next.config.ts images.remotePatterns
  // gets shipped to the browser as-is. Browser fetches directly from origin.
  return src;
}
