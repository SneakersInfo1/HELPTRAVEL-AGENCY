import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { saveTrip } from "@/lib/mvp/service";
import { attachSessionCookie, resolveSessionId, SESSION_COOKIE_NAME } from "@/lib/mvp/session";

const SaveBodySchema = z.object({
  itineraryResultId: z.string().min(8).max(120),
});

export async function POST(request: NextRequest) {
  try {
    const payload = SaveBodySchema.parse(await request.json());
    const resolved = resolveSessionId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    const saved = await saveTrip(resolved.sessionId, payload.itineraryResultId);
    const response = NextResponse.json(saved);
    if (resolved.isNew) {
      attachSessionCookie(response, resolved.sessionId);
    }
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

