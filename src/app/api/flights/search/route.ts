import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchTravelpayoutsFlights } from "@/lib/mvp/travelpayouts-flights";
import { enforceRateLimit } from "@/lib/rate-limit";

const flightSearchSchema = z.object({
  origin: z.string().trim().min(2),
  destination: z.string().trim().min(2),
  destinationIata: z.string().trim().length(3).optional(),
  departureDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  passengers: z.coerce.number().int().min(1).max(8).default(2),
  cabinClass: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
  sortBy: z.enum(["cheap", "balance", "direct"]).default("balance"),
});

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "flights-search");
  if (limited) return limited;

  try {
    const body = await request.json();
    const input = flightSearchSchema.parse(body);

    const result = await searchTravelpayoutsFlights({
      origin: input.origin,
      destination: input.destination,
      destinationIata: input.destinationIata,
      departureDate: input.departureDate,
      returnDate: input.returnDate,
      passengers: input.passengers,
      cabinClass: input.cabinClass,
      sortBy: input.sortBy,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Nie udalo sie pobrac danych lotów." }, { status: 400 });
  }
}
