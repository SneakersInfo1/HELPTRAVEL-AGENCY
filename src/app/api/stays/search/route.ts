import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchHotelbedsHotelOffers } from "@/lib/mvp/hotelbeds-hotels";
import { searchDuffelStays } from "@/lib/mvp/duffel-stays";

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

function buildFallback(input: z.infer<typeof staySearchSchema>, errorMessage: string) {
  return {
    city: input.city,
    country: input.country,
    source: "fallback" as const,
    checkInDate: input.checkInDate,
    checkOutDate: new Date(new Date(input.checkInDate).getTime() + Math.max(1, input.nights) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    guests: input.guests,
    rooms: input.rooms,
    sortBy: input.sortBy,
    offers: [],
    fetchedAt: new Date().toISOString(),
    error: errorMessage,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = staySearchSchema.parse(body);

    const result = await searchDuffelStays({
      city: input.city,
      country: input.country,
      checkInDate: input.checkInDate,
      nights: input.nights,
      guests: input.guests,
      rooms: input.rooms,
      sortBy: input.sortBy,
      freeCancellationOnly: input.freeCancellationOnly,
    }).catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("not enabled for your account") && !message.includes("Brak DUFFEL_ACCESS_TOKEN")) {
        throw error;
      }

      try {
        return await searchHotelbedsHotelOffers({
          city: input.city,
          country: input.country,
          checkInDate: input.checkInDate,
          nights: input.nights,
          guests: input.guests,
          rooms: input.rooms,
          sortBy: input.sortBy,
        });
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "";
        return buildFallback(input, fallbackMessage ? "W tej chwili nie ma aktywnego feedu noclegów." : "W tej chwili nie ma aktywnego feedu noclegów.");
      }
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
