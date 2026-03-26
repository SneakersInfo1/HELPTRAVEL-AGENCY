import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchDuffelFlights } from "@/lib/mvp/duffel";

const flightSearchSchema = z.object({
  origin: z.string().trim().min(2),
  destination: z.string().trim().min(2),
  departureDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  passengers: z.coerce.number().int().min(1).max(8).default(1),
  cabinClass: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
  sortBy: z.enum(["cheap", "balance", "direct"]).default("cheap"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = flightSearchSchema.parse(body);
    const result = await searchDuffelFlights({
      origin: input.origin,
      destination: input.destination,
      departureDate: input.departureDate,
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
    return NextResponse.json({ error: 'Nie udało się pobrać danych.' }, { status: 400 });
  }
}
