import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { saveTrip } from "@/lib/mvp/service";
import { attachSessionCookie, resolveSessionId, SESSION_COOKIE_NAME } from "@/lib/mvp/session";

const SaveBodySchema = z.object({
  itineraryResultId: z.string().min(8).max(120),
  snapshot: z
    .object({
      mode: z.enum(["discovery", "standard"]),
      query: z.string().max(600),
      destinationHint: z.string().max(160),
      originCity: z.string().max(120),
      budget: z.number().min(600).max(20000),
      travelers: z.number().min(1).max(8),
      rooms: z.number().min(1).max(8),
      durationMin: z.number().min(2).max(14),
      durationMax: z.number().min(2).max(14),
      travelStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      travelNights: z.number().min(1).max(21),
      selectedDestinationSlug: z.string().max(160).optional(),
      selectedDestinationLabel: z.string().max(160).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = SaveBodySchema.parse(await request.json());
    const resolved = resolveSessionId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    const saved = await saveTrip(resolved.sessionId, payload.itineraryResultId, payload.snapshot);
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
