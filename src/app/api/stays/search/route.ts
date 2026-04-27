import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchHotellookStays } from "@/lib/mvp/hotellook";
import { enforceRateLimit } from "@/lib/rate-limit";

const staySearchSchema = z.object({
  city: z.string().trim().min(2),
  country: z.string().trim().min(2),
  checkInDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  nights: z.coerce.number().int().min(1).max(30).default(4),
  guests: z.coerce.number().int().min(1).max(8).default(2),
  rooms: z.coerce.number().int().min(1).max(8).default(1),
  sortBy: z.enum(["cheap", "quality", "value"]).default("cheap"),
  freeCancellationOnly: z.coerce.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "stays-search");
  if (limited) return limited;

  try {
    const body = await request.json();
    const input = staySearchSchema.parse(body);

    const result = await searchHotellookStays({
      city: input.city,
      country: input.country,
      checkInDate: input.checkInDate,
      nights: input.nights,
      guests: input.guests,
      rooms: input.rooms,
      sortBy: input.sortBy,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Nie udało się pobrać danych." }, { status: 400 });
  }
}
