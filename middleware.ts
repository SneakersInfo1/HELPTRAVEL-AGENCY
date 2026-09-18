import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { stripPaymentSecrets } from "@/lib/analytics/payment-url";
import { stripLangParam } from "@/lib/seo/lang-param";
import { legacyRedirectTarget } from "@/lib/seo/legacy-redirects";

function stripEnPrefix(pathname: string) {
  if (pathname === "/en") {
    return "/";
  }

  if (pathname.startsWith("/en/")) {
    return pathname.slice(3) || "/";
  }

  return pathname;
}

// Sesja C: /planner is a dead route (replaced by /hotele/szukaj which now
// composes hotels from real LiteAPI data; loty mają osobny tor /loty/*).
// Old /planner URLs are bookmarkable — issue 308 with query params preserved.
function isPlannerPath(pathname: string): boolean {
  return (
    pathname === "/planner" ||
    pathname.startsWith("/planner/") ||
    pathname === "/en/planner" ||
    pathname.startsWith("/en/planner/")
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Admin auth — HTTP Basic Auth via Edge middleware.
//
// Why Basic Auth: zero UI to build, browser shows native login prompt, fully
// stateless, works through Vercel cache without cookies. The trade-off is that
// once the user enters credentials, the browser will send them with EVERY
// request to /admin/* until the tab is closed — that's the correct default
// for an internal-only ops panel and matches how everyone runs a /admin/*
// behind a quick gate.
//
// Constant-time compare is implemented manually because Edge runtime doesn't
// expose `crypto.timingSafeEqual`. ADMIN_SECRET should be a long random
// string; anything ≥32 random characters makes the comparison trivially safe.
//
// Fail-closed: if ADMIN_SECRET is not configured we return 503 — never let
// /admin/* be reachable due to a missing env.
// ────────────────────────────────────────────────────────────────────────────

const ADMIN_BASIC_USER = "admin";

function safeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function requireAdminAuth(request: NextRequest): NextResponse | null {
  const expected = process.env.ADMIN_SECRET?.trim();
  if (!expected) {
    return new NextResponse(
      "Admin panel is not configured (ADMIN_SECRET missing).",
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const auth = request.headers.get("authorization");
  if (!auth || !auth.startsWith("Basic ")) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="HelpTravel Admin", charset="UTF-8"',
        "Cache-Control": "no-store",
      },
    });
  }

  const encoded = auth.slice("Basic ".length).trim();
  // btoa requires Latin-1; ADMIN_SECRET must be ASCII (enforced operationally).
  let expectedEncoded: string;
  try {
    expectedEncoded = btoa(`${ADMIN_BASIC_USER}:${expected}`);
  } catch {
    return new NextResponse(
      "Admin secret contains non-ASCII characters; rotate it.",
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!safeStringEqual(encoded, expectedEncoded)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="HelpTravel Admin", charset="UTF-8"',
        "Cache-Control": "no-store",
      },
    });
  }

  return null;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // ── Poświadczenia płatności wycinane U ŹRÓDŁA ──────────────────────────
  //
  // Stripe wraca na nasz adres, doklejając `payment_intent_client_secret` —
  // poświadczenie pozwalające operować na tym PaymentIntent z przeglądarki.
  //
  // Czyszczenie adresu po stronie klienta NIE WYSTARCZA i to jest zmierzone:
  // przy renderze serwerowym Next wkleja `searchParams` do payloadu RSC, więc
  // sekret zostawał w ŹRÓDLE STRONY (3 wystąpienia w HTML) nawet po
  // wyczyszczeniu paska adresu. Przekierowanie tutaj sprawia, że komponent
  // serwerowy NIGDY go nie widzi — nie ma go więc ani w adresie, ani w HTML,
  // ani w nagłówku `Referer`, ani w żadnym narzędziu analitycznym.
  //
  // 307, nie 301: to jest jednorazowy adres powrotu z płatności, a nie
  // kanoniczny adres strony — trwałe przekierowanie zostałoby zapamiętane
  // przez przeglądarkę. `no-store` z tego samego powodu.
  //
  // Bez ryzyka pętli: `stripPaymentSecrets` zwraca `null`, gdy nie ma czego
  // usunąć, więc po przekierowaniu warunek już nie zachodzi. Parametry, które
  // czyta finalizacja rezerwacji (`sid`, `payment_intent`, `redirect_status`),
  // zostają nietknięte.
  const bezSekretu = stripPaymentSecrets(request.nextUrl.href);
  if (bezSekretu) {
    const res = NextResponse.redirect(bezSekretu, 307);
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  // Serwis nie ma wersji językowych, więc `?lang=` to tylko duplikat adresu
  // (w Google wisiał `/?lang=en`). 301 na ten sam adres bez parametru.
  const withoutLang = stripLangParam(request.nextUrl.href);
  if (withoutLang) {
    return NextResponse.redirect(withoutLang, 301);
  }

  // Historyczne adresy z odpowiednikiem 1:1 — lista w lib/seo/legacy-redirects.ts.
  const legacyTarget = legacyRedirectTarget(pathname);
  if (legacyTarget) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = legacyTarget;
    return NextResponse.redirect(nextUrl, 301);
  }

  if (isPlannerPath(pathname)) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = "/hotele/szukaj";
    nextUrl.search = search;
    return NextResponse.redirect(nextUrl, 308);
  }

  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = stripEnPrefix(pathname);
    nextUrl.search = search;
    const res = NextResponse.redirect(nextUrl, 308);
    // Defense-in-depth: if any crawler or indexer captures the /en/* URL
    // BEFORE following the 308, the X-Robots-Tag instructs them to drop
    // it from their index regardless. GSC was still showing /en/* URLs
    // with impressions (helsinki-finland: 46 wyśw., paris-france: 37,
    // rotterdam-netherlands: 35) two months after the redirect shipped,
    // meaning Google's cache still ranks the old URL. This header
    // accelerates deindexing.
    res.headers.set("X-Robots-Tag", "noindex, follow");
    // Mark as cacheable redirect so Vercel/edge CDNs don't keep re-hitting
    // our origin — the redirect itself never needs revalidation.
    res.headers.set("Cache-Control", "public, max-age=86400, immutable");
    return res;
  }

  // Gate every /admin/* route AND /api/admin/* (admin pages + admin APIs).
  // Fail-closed. The same Basic Auth credentials apply to both surfaces —
  // admin uses curl with `-u admin:SECRET` to hit any /api/admin/* route.
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/admin/")
  ) {
    const denied = requireAdminAuth(request);
    if (denied) return denied;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/en",
    "/en/:path*",
    "/planner",
    "/planner/:path*",
    "/admin",
    "/admin/:path*",
    "/api/admin/:path*",
    // Historyczne adresy. `(.*)` zamiast dosłownego „/tanie-podróże", bo ścieżka
    // może dojść zakodowana (%C3%B3…) albo nie. Decyzję podejmuje
    // legacyRedirectTarget(), więc /tanie-podroze przechodzi dalej bez zmian.
    "/porownanie/malaga-vs-valencia",
    "/tanie-podr(.*)",
    // Każdy adres z parametrem `lang`, poza API i zasobami Next.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      has: [{ type: "query", key: "lang" }],
    },
    // Każdy adres niosący poświadczenie płatności — patrz blok w `middleware`.
    // API świadomie wyłączone: trasy `/api/*` mogą takich parametrów
    // potrzebować, a i tak nie renderują HTML-a ani nie ładują analityki.
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      has: [{ type: "query", key: "payment_intent_client_secret" }],
    },
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      has: [{ type: "query", key: "setup_intent_client_secret" }],
    },
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      has: [{ type: "query", key: "client_secret" }],
    },
  ],
};
