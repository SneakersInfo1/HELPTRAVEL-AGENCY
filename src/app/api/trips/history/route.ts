import { NextRequest, NextResponse } from "next/server";

import { listSavedTrips } from "@/lib/mvp/service";
import { attachSessionCookie, resolveSessionId, SESSION_COOKIE_NAME } from "@/lib/mvp/session";

export async function GET(request: NextRequest) {
  const resolved = resolveSessionId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const trips = await listSavedTrips(resolved.sessionId);
  const response = NextResponse.json({ items: trips });
  if (resolved.isNew) {
    attachSessionCookie(response, resolved.sessionId);
  }
  return response;
}

