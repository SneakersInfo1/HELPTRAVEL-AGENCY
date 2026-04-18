import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchDuffelFlights } from "@/lib/mvp/duffel";
import type { CabinClass, FlightSearchResponse, FlightSortMode } from "@/lib/mvp/types";
import { enforceRateLimit } from "@/lib/rate-limit";

const flightSearchSchema = z.object({
  origin: z.string().trim().min(2),
  destination: z.string().trim().min(2),
  departureDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  passengers: z.coerce.number().int().min(1).max(8).default(2),
  cabinClass: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
  sortBy: z.enum(["cheap", "balance", "direct"]).default("balance"),
});

function buildFallback(
  input: {
    origin: string;
    destination: string;
    departureDate: string;
    passengers: number;
    cabinClass: CabinClass;
    sortBy: FlightSortMode;
  },
  errorMessage?: string,
): FlightSearchResponse {
  return {
    origin: input.origin,
    destination: input.destination,
    departureDate: input.departureDate,
    passengers: input.passengers,
    cabinClass: input.cabinClass,
    sortBy: input.sortBy,
    offers: [],
    fetchedAt: new Date().toISOString(),
    source: "partner_fallback",
    error:
      errorMessage ||
      "Na stronie pokazujemy teraz partner-first flight flow. Klik otwiera gotowe wyniki z ustawiona trasa i data.",
  };
}

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "flights-search");
  if (limited) return limited;

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
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      const friendlyMessage =
        message.includes("DUFFEL_ACCESS_TOKEN") || message.includes("kod lotniska")
          ? "Na stronie pokazujemy teraz partner-first flight flow. Klik nadal otwiera gotowe wyniki z zachowanym kierunkiem i data."
          : message;

      return buildFallback(input, friendlyMessage);
    });

    const payload: FlightSearchResponse =
      "source" in result
        ? result
        : {
            ...result,
            source: "duffel",
          };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Nie udalo sie pobrac danych lotow." }, { status: 400 });
  }
}
