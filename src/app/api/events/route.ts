import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { trackEvent } from "@/lib/mvp/service";
import { attachSessionCookie, resolveSessionId, SESSION_COOKIE_NAME } from "@/lib/mvp/session";

const EventBodySchema = z.object({
  eventType: z.enum([
    "planner_started",
    "discovery_generated",
    "standard_generated",
    "affiliate_clicked",
    "trip_saved",
    "planner_restored",
    "destination_saved",
  "comparison_selected",
  "search_saved",
  "saved_plan_clicked",
  "hero_cta_clicked",
  "planner_mode_selected",
  "planner_submitted",
    "destination_card_clicked",
    "content_card_clicked",
    "contact_submit",
    "mini_planner_submitted",
  ]),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: NextRequest) {
  try {
    const body = EventBodySchema.parse(await request.json());
    const resolved = resolveSessionId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    await trackEvent(resolved.sessionId, body);
    const response = NextResponse.json({ ok: true });
    if (resolved.isNew) {
      attachSessionCookie(response, resolved.sessionId);
    }
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Event write failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
