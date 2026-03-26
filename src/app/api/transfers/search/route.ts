import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchHotelbedsTransfers } from "@/lib/mvp/hotelbeds-transfers";

const transferSearchSchema = z.object({
  city: z.string().trim().min(2),
  country: z.string().trim().min(2),
  outboundDateTime: z.string().trim().min(10),
  adults: z.coerce.number().int().min(1).max(8).default(2),
  children: z.coerce.number().int().min(0).max(8).default(0),
  infants: z.coerce.number().int().min(0).max(8).default(0),
});

function buildFallback(input: z.infer<typeof transferSearchSchema>, errorMessage?: string) {
  return {
    city: input.city,
    country: input.country,
    source: "fallback" as const,
    airportCode: undefined,
    center: undefined,
    outboundDateTime: input.outboundDateTime,
    adults: input.adults,
    children: input.children,
    infants: input.infants,
    offers: [],
    fetchedAt: new Date().toISOString(),
    error: errorMessage ?? "Brak aktywnego feedu transferow.",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = transferSearchSchema.parse(body);
    const result = await searchHotelbedsTransfers({
      city: input.city,
      country: input.country,
      outboundDateTime: input.outboundDateTime,
      adults: input.adults,
      children: input.children,
      infants: input.infants,
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      return buildFallback(input, message);
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
