import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { runDiscovery } from "@/lib/mvp/service";
import { attachSessionCookie, resolveSessionId, SESSION_COOKIE_NAME } from "@/lib/mvp/session";

const DiscoveryBodySchema = z.object({
  query: z.string().min(4).max(600),
  originCity: z.string().min(2).max(100).optional(),
  departureMonth: z.number().min(1).max(12).optional(),
  travelers: z.number().min(1).max(8).optional(),
  budgetMaxPln: z.number().min(600).max(20000).optional(),
  durationMinDays: z.number().min(2).max(14).optional(),
  durationMaxDays: z.number().min(2).max(14).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = DiscoveryBodySchema.parse(await request.json());
    const resolved = resolveSessionId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    const data = await runDiscovery(payload, resolved.sessionId);

    const response = NextResponse.json(data);
    if (resolved.isNew) {
      attachSessionCookie(response, resolved.sessionId);
    }
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

