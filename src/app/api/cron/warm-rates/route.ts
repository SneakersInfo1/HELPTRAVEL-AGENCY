// /api/cron/warm-rates — pre-warming cache cen (Vercel Cron, plan Pro).
//
// PROBLEM: /hotels/rates ma twardą podłogę ~3,3 s na zimny call (zmierzone na
// prod). Tej podłogi nie da się obejść kodem — jedyne wyjście to ciepły cache.
// TEN cron co 30 min proaktywnie odświeża Redis dla top kierunków × typowych
// terminów, więc realny użytkownik szukający np. „Barcelona, najbliższy weekend"
// dostaje ceny z cache w <300 ms zamiast czekać ~4 s. Do tego co ~3 h obiega
// tanie okna wszystkich kierunków dla snapshotu „od X zł/noc".
//
// Przebieg (blokada, plan, stawki, snapshot, stan, alert) żyje w
// src/lib/hotels/warm-rates-cron.ts; tu tylko autoryzacja i lista kierunków
// z seedu (moduł seedu ma `import "server-only"`).
//
// Bezpieczeństwo: wymaga nagłówka `Authorization: Bearer ${CRON_SECRET}`. Vercel
// dołącza go automatycznie do wywołań crona, gdy zmienna CRON_SECRET jest
// ustawiona w projekcie. Bez sekretu endpoint odrzuca (żeby nikt z zewnątrz nie
// palił limitu LiteAPI).

import { NextRequest, NextResponse } from "next/server";

import {
  PACKAGE_DESTINATION_IDS,
  WARM_DESTINATION_COUNT,
  WARM_EXTRA_DESTINATION_IDS,
} from "@/lib/hotels/warm-config";
import { runWarmRatesCron, type WarmSeed } from "@/lib/hotels/warm-rates-cron";
import {
  getDestinationByCityCountry,
  getDestinationById,
  getTopDestinations,
  type DestinationRecord,
} from "@/lib/mvp/destinations-seed";
import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Żaden fetch tej trasy nie czyta ani nie zapisuje Next Data Cache. Druga
// linia obrony obok `skipDataCache`: zapytanie dopisane tu w przyszłości bez
// tej opcji nie wróci do trybu „stara odpowiedź teraz, dostawca w tle bez
// limitu czasu", który był przyczyną timeoutu z 2026-11-06.
export const fetchCache = "force-no-store";
// Vercel Pro: limit funkcji 300 s. Przebieg sam kończy się wcześniej:
// WARM_TIME_BUDGET_MS (200 s) bez nowych zadań, WARM_HARD_STOP_MS (215 s)
// przerwanie trwających. Zostaje ~85 s na zapis wyników i zwolnienie blokady.
export const maxDuration = 300;

/** Kierunki crona: top-N + kafelki (core), nastroje i pakiety (tylko snapshot). */
function collectDestinations(): WarmSeed[] {
  // Union: top-N popularności + jawne extras (kafelki homepage). Dedup po id.
  const byId = new Map(getTopDestinations(WARM_DESTINATION_COUNT).map((d) => [d.id, d] as const));
  for (const id of WARM_EXTRA_DESTINATION_IDS) {
    if (!byId.has(id)) {
      const d = getDestinationById(id);
      if (d) byId.set(d.id, d);
      else console.warn(`[cron/warm-rates] extra kierunek '${id}' nie istnieje w seedzie`);
    }
  }
  // Kierunki z picks nastrojów (/wyjazdy) i sekcji pakietów — grupa
  // SNAPSHOT-ONLY: tylko tanie okna, w rotacji. Dedup względem core po id.
  const snapshotOnly: DestinationRecord[] = [];
  const seenMood = new Set<string>();
  for (const m of TRAVEL_MOODS) {
    for (const p of m.picks) {
      const key = `${p.searchCity}|${p.country}`.toLowerCase();
      if (seenMood.has(key)) continue;
      seenMood.add(key);
      const d = getDestinationByCityCountry(p.searchCity, p.country);
      if (!d) {
        console.warn(`[cron/warm-rates] mood pick '${p.searchCity}, ${p.country}' poza seedem — karta bez ceny`);
        continue;
      }
      if (!byId.has(d.id) && !snapshotOnly.some((x) => x.id === d.id)) snapshotOnly.push(d);
    }
  }
  for (const id of PACKAGE_DESTINATION_IDS) {
    if (byId.has(id) || snapshotOnly.some((x) => x.id === id)) continue;
    const d = getDestinationById(id);
    if (d) snapshotOnly.push(d);
    else console.warn(`[cron/warm-rates] kierunek pakietu '${id}' nie istnieje w seedzie`);
  }
  return [
    ...[...byId.values()].map((record) => ({ record, group: "core" as const })),
    ...snapshotOnly.map((record) => ({ record, group: "snapshot" as const })),
  ];
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/warm-rates] CRON_SECRET nie ustawiony — odmawiam (ustaw zmienną w Vercel).");
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runWarmRatesCron(collectDestinations()));
}
