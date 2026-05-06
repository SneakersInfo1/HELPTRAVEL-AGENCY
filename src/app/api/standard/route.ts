import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { runStandard } from "@/lib/mvp/service";
import { attachSessionCookie, resolveSessionId, SESSION_COOKIE_NAME } from "@/lib/mvp/session";
import { MAX_TRIP_DAYS, MIN_TRIP_DAYS } from "@/lib/mvp/trip-limits";

// Booking-tier permissive bounds. Length-of-stay uses MIN/MAX_TRIP_DAYS as
// single source of truth (currently 2–31 days). travelers/rooms not capped
// below what users actually request — 1–9 travelers, 1–4 rooms is
// industry-standard. budget cap raised so families on long stays don't hit
// a wall.
const StandardBodySchema = z.object({
  originCity: z.string().min(2).max(100),
  destinationHint: z.string().min(2).max(120),
  travelers: z.number().min(1).max(9).default(2),
  rooms: z.number().min(1).max(4).optional(),
  budgetMaxPln: z.number().min(600).max(50000),
  durationDays: z.number().min(MIN_TRIP_DAYS).max(MAX_TRIP_DAYS),
  departureMonth: z.number().min(1).max(12).optional(),
  style: z.string().max(120).optional(),
});

export async function POST(request: NextRequest) {
  let payload;
  try {
    payload = StandardBodySchema.parse(await request.json());
  } catch (err) {
    // Surface WHICH field failed and the human-readable expected range so
    // the planner UI can render a precise error instead of a generic one.
    if (err instanceof z.ZodError) {
      const first = err.issues[0];
      const path = first?.path.join(".") || "request";
      return NextResponse.json(
        {
          error: "validation_failed",
          field: path,
          message: `Pole "${path}" jest nieprawidłowe: ${first?.message ?? "wartość poza zakresem"}.`,
          issues: err.issues,
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "invalid_body", message: "Nie udało się odczytać żądania." },
      { status: 400 },
    );
  }

  try {
    const resolved = resolveSessionId(request.cookies.get(SESSION_COOKIE_NAME)?.value);
    const data = await runStandard(payload, resolved.sessionId);

    const response = NextResponse.json(data);
    if (resolved.isNew) {
      attachSessionCookie(response, resolved.sessionId);
    }
    return response;
  } catch (error) {
    // Pipeline (LiteAPI / scoring / persistence) error — surface specific
    // cause to UI instead of swallowing as a generic 400.
    const message = error instanceof Error ? error.message : "Standard search failed";
    console.error("[/api/standard] runStandard failed", error);
    return NextResponse.json(
      { error: "pipeline_failed", message },
      { status: 502 },
    );
  }
}
