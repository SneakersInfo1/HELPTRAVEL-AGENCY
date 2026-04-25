import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { runStandard } from "@/lib/mvp/service";
import { attachSessionCookie, resolveSessionId, SESSION_COOKIE_NAME } from "@/lib/mvp/session";
import { MAX_TRIP_DAYS, MIN_TRIP_DAYS } from "@/lib/mvp/trip-limits";

const StandardBodySchema = z.object({
  originCity: z.string().min(2).max(100),
  destinationHint: z.string().min(2).max(120),
  travelers: z.number().min(1).max(8).default(2),
  budgetMaxPln: z.number().min(600).max(20000),
  durationDays: z.number().min(MIN_TRIP_DAYS).max(MAX_TRIP_DAYS),
  departureMonth: z.number().min(1).max(12).optional(),
  style: z.string().max(120).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = StandardBodySchema.parse(await request.json());
    const resolved = resolveSessionId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    const data = await runStandard(payload, resolved.sessionId);

    const response = NextResponse.json(data);
    if (resolved.isNew) {
      attachSessionCookie(response, resolved.sessionId);
    }
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Standard search failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
