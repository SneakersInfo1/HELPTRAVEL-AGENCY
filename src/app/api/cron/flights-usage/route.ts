// GET /api/cron/flights-usage — stan wyszukiwań lotów u dostawcy (monitoring).
//
// Liczniki doby UTC z gubernatora (search-governor.ts): wyszukiwania
// użytkowników i tła vs budżet, wyniki (ok / 429 / odmowa / błąd), aktywna
// pauza po odmowie dostawcy i stan przełącznika wyszukiwań w tle. Tylko odczyt;
// autoryzacja jak crony (`Authorization: Bearer $CRON_SECRET`). NIE jest
// wpisany w harmonogram Vercela — wołany ręcznie albo z zewnętrznego monitora.

import { NextRequest, NextResponse } from "next/server";

import { governorSnapshot } from "@/lib/flights/search-governor";
import { isBackgroundFlightSearchEnabled } from "@/lib/flights/search-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const snapshot = await governorSnapshot();
  return NextResponse.json(
    { ...snapshot, backgroundSearch: isBackgroundFlightSearchEnabled() ? "on" : "off" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
