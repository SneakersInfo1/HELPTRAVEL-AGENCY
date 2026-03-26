import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchDestinationAttractions } from "@/lib/mvp/geoapify";

const placesSearchSchema = z.object({
  city: z.string().trim().min(2),
  country: z.string().trim().min(2),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = placesSearchSchema.parse(body);
    const result = await searchDestinationAttractions({
      city: input.city,
      country: input.country,
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
