import { NextRequest, NextResponse } from "next/server";

import { trackAffiliateClick } from "@/lib/mvp/service";
import { attachSessionCookie, resolveSessionId, SESSION_COOKIE_NAME } from "@/lib/mvp/session";

interface Params {
  params: Promise<{ provider: string }>;
}

function safeTarget(rawTarget: string | null): string | null {
  if (!rawTarget) return null;
  if (!rawTarget.startsWith("https://")) return null;
  return rawTarget;
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
    const response = NextResponse.redirect(new URL("/planner", request.url));
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
