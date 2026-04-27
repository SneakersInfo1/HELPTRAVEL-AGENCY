import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const transferSearchSchema = z.object({
  city: z.string().trim().min(2),
  country: z.string().trim().min(2),
  outboundDateTime: z.string().trim().min(10),
  adults: z.coerce.number().int().min(1).max(8).default(2),
  children: z.coerce.number().int().min(0).max(8).default(0),
  infants: z.coerce.number().int().min(0).max(8).default(0),
});

// Po wycofaniu Hotelbeds Transfers transfery rezerwujemy przez deeplinki
// do Kiwitaxi / GetRentacar (Travelpayouts). UI dostaje empty + affiliate CTA.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = transferSearchSchema.parse(body);

    return NextResponse.json(
      {
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
        error: "Transfer rezerwujesz bezposrednio u partnera (Kiwitaxi, GetRentacar).",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Nie udało się pobrać danych." }, { status: 400 });
  }
}
