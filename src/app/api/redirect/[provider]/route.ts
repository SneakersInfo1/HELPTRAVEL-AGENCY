import { NextRequest, NextResponse } from "next/server";

import { trackAffiliateClick } from "@/lib/mvp/service";
import { attachSessionCookie, resolveSessionId, SESSION_COOKIE_NAME } from "@/lib/mvp/session";

interface Params {
  params: Promise<{ provider: string }>;
}

// ────────────────────────────────────────────────────────────────────────────
// Affiliate redirect target whitelist.
//
// THIS IS A SECURITY BOUNDARY. Without a whitelist, /api/redirect/foo?url=...
// becomes an open-redirect — and because the URL renders in social-card
// previews as "helptravel.pl/api/redirect/...", it is a high-quality phishing
// surface. Always restrict to known affiliate / partner destinations.
//
// Match rule: hostname (case-insensitive) must be IN the set, OR end with a
// dot followed by a permitted suffix (so `www.booking.com`, `secure.booking.com`,
// `m.booking.com` all match). Protocol must be `https:`.
//
// Adding a new partner: add the exact hostname (or root domain as a suffix
// entry, e.g. ".booking.com") and ship.
// ────────────────────────────────────────────────────────────────────────────

const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  // Booking & OTA partners
  "booking.com",
  "hotels.com",
  "expedia.com",
  "expedia.pl",
  "vrbo.com",
  "airbnb.com",
  "airbnb.pl",
  "agoda.com",
  // Flights
  "aviasales.com",
  "aviasales.pl",
  "hotellook.com",
  "search.hotellook.com",
  // Travelpayouts affiliate redirector
  "tp.media",
  "www.travelpayouts.com",
  "travelpayouts.com",
  // CJ affiliate redirector
  "www.anrdoezrs.net",
  "www.dpbolvw.net",
  "www.jdoqocy.com",
  "www.kqzyfj.com",
  "www.tkqlhce.com",
  "click.linksynergy.com",
  // Stay22 (maps + booking)
  "stay22.com",
  "www.stay22.com",
  "embed.stay22.com",
]);

// Suffixes (domain endings) — match any subdomain under these roots.
const ALLOWED_HOST_SUFFIXES: ReadonlyArray<string> = [
  ".booking.com",
  ".hotels.com",
  ".expedia.com",
  ".expedia.pl",
  ".vrbo.com",
  ".airbnb.com",
  ".agoda.com",
  ".aviasales.com",
  ".hotellook.com",
  ".travelpayouts.com",
  ".tp.media",
  ".anrdoezrs.net",
  ".dpbolvw.net",
  ".jdoqocy.com",
  ".kqzyfj.com",
  ".tkqlhce.com",
  ".linksynergy.com",
  ".stay22.com",
];

function isHostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  if (ALLOWED_HOSTS.has(h)) return true;
  return ALLOWED_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

function safeTarget(rawTarget: string | null): string | null {
  if (!rawTarget) return null;

  let url: URL;
  try {
    url = new URL(rawTarget);
  } catch {
    return null;
  }

  // 1) HTTPS only — never follow http:// or anything exotic.
  if (url.protocol !== "https:") return null;

  // 2) Whitelist — host must match the set above.
  if (!isHostAllowed(url.hostname)) return null;

  // 3) No credentials embedded in URL (https://user:pass@host/...)
  if (url.username || url.password) return null;

  return url.toString();
}

export async function GET(request: NextRequest, { params }: Params) {
  const resolvedParams = await params;
  const resolvedSession = resolveSessionId(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  const targetUrl = safeTarget(request.nextUrl.searchParams.get("url"));
  const itineraryResultId = request.nextUrl.searchParams.get("itineraryResultId") ?? undefined;
  const destinationSlug = request.nextUrl.searchParams.get("destinationSlug") ?? undefined;
  const requestId = request.nextUrl.searchParams.get("requestId") ?? undefined;
  const city = request.nextUrl.searchParams.get("city") ?? undefined;
  const country = request.nextUrl.searchParams.get("country") ?? undefined;
  const source = request.nextUrl.searchParams.get("source") ?? undefined;
  const rank = request.nextUrl.searchParams.get("rank") ?? undefined;
  const query = request.nextUrl.searchParams.get("query") ?? undefined;

  if (!targetUrl) {
    // Either no target was given, the URL was malformed, the protocol wasn't
    // https, or the host is not on the affiliate whitelist. We log and safely
    // redirect back to the homepage instead of leaking the rejection cause.
    const rawTarget = request.nextUrl.searchParams.get("url");
    if (rawTarget) {
      console.warn(
        `[redirect] rejected target — provider=${resolvedParams.provider} rawTarget=${rawTarget.slice(0, 200)}`,
      );
    }
    const response = NextResponse.redirect(new URL("/", request.url));
    if (resolvedSession.isNew) {
      attachSessionCookie(response, resolvedSession.sessionId);
    }
    return response;
  }

  await trackAffiliateClick({
    sessionId: resolvedSession.sessionId,
    provider: resolvedParams.provider,
    targetUrl,
    itineraryResultId,
    context: {
      destinationSlug,
      requestId,
      city,
      country,
      source,
      rank: rank ? Number(rank) : undefined,
      query,
    },
  });

  const response = NextResponse.redirect(targetUrl, { status: 307 });
  if (resolvedSession.isNew) {
    attachSessionCookie(response, resolvedSession.sessionId);
  }
  return response;
}
