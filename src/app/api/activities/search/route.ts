import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { searchHotelbedsActivities } from "@/lib/mvp/hotelbeds-activities";

const activitySearchSchema = z.object({
  city: z.string().trim().min(2),
  country: z.string().trim().min(2),
  fromDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  travelers: z.coerce.number().int().min(1).max(8).default(2),
});

function buildFallback(input: z.infer<typeof activitySearchSchema>, errorMessage?: string) {
  return {
    city: input.city,
    country: input.country,
    source: "fallback" as const,
    destinationCode: undefined,
    fromDate: input.fromDate,
    toDate: input.toDate,
    travelers: input.travelers,
    offers: [],
    fetchedAt: new Date().toISOString(),
    error: errorMessage || "Aktualnie nie udało się pobrać ofert atrakcji dla tego kierunku.",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = activitySearchSchema.parse(body);

    const result = await searchHotelbedsActivities({
      city: input.city,
      country: input.country,
      fromDate: input.fromDate,
      toDate: input.toDate,
      travelers: input.travelers,
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
