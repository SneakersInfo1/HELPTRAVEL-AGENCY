// /api/cron/warm-rates — pre-warming cache cen (Vercel Cron, plan Pro).
//
// PROBLEM: /hotels/rates ma twardą podłogę ~3,3 s na zimny call (zmierzone na
// prod). Tej podłogi nie da się obejść kodem — jedyne wyjście to ciepły cache.
// TEN cron co 30 min proaktywnie odświeża Redis dla top kierunków × typowych
// terminów, więc realny użytkownik szukający np. „Barcelona, najbliższy weekend"
// dostaje ceny z cache w <300 ms zamiast czekać ~4 s.
//
// Grzejemy DOKŁADNIE tym samym helperem (resolveSlimRates) co lista wyników →
// identyczny klucz cache. `forceRefresh: true` → zawsze świeże stawki + reset TTL.
//
// Bezpieczeństwo: wymaga nagłówka `Authorization: Bearer ${CRON_SECRET}`. Vercel
// dołącza go automatycznie do wywołań crona, gdy zmienna CRON_SECRET jest
// ustawiona w projekcie. Bez sekretu endpoint odrzuca (żeby nikt z zewnątrz nie
// palił limitu LiteAPI).

import { NextRequest, NextResponse } from "next/server";
import { zajmijBlokade } from "@/lib/cron/lock";

import { fetchHotelsForDestination } from "@/lib/liteapi";
import { searchFlightRates } from "@/lib/flights/client";
import { normalizeRatesResponse } from "@/lib/flights/display";
import { FlightSearchInputSchema } from "@/lib/flights/types";
import { iataForCity } from "@/lib/flights/airports";
import {
  getDestinationByCityCountry,
  getDestinationById,
  getTopDestinations,
  type DestinationRecord,
} from "@/lib/mvp/destinations-seed";
import { TRAVEL_MOODS } from "@/lib/mvp/travel-moods";
import { resolveSlimRates } from "@/lib/hotels/resolve-slim-rates";
import type { RateCacheContext } from "@/lib/hotels/rate-cache";
import {
  computePackagePerPerson,
  destinationPriceKey,
  mergePriceSnapshot,
  minPerNightFromRates,
  minTotalFromOffers,
  type DestinationPriceSnapshot,
} from "@/lib/prices/destination-price-snapshot";
import { refreshTrustpilotSnapshot } from "@/lib/trust/trustpilot-snapshot";
import {
  computeSnapshotDateWindows,
  computeWarmDateWindows,
  SNAPSHOT_HOTELS_PER_DEST,
  WARM_CONCURRENCY,
  WARM_DESTINATION_COUNT,
  PACKAGE_DESTINATION_IDS,
  WARM_EXTRA_DESTINATION_IDS,
  WARM_HOTELS_PER_DEST,
  WARM_TIME_BUDGET_MS,
} from "@/lib/hotels/warm-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Vercel Pro: pozwala na funkcje do 300 s. Cron grzeje sekwencyjnie z
// współbieżnością, ale dajemy zapas; twardy budżet czasu pilnuje WARM_TIME_BUDGET_MS.
export const maxDuration = 300;

// Prosty pool współbieżności — odpala `worker` dla każdego elementu, max N naraz.
async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
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

  // Blokada rozproszona — patrz src/lib/cron/lock.ts. Nakladajace sie
  // przebiegi dublowaly koszt LiteAPI i gubily aktualizacje przy
  // wzorcu odczyt-scal-zapis. Zajete = 200 "skipped_locked", bo to
  // sytuacja normalna; 5xx wywolaloby ponawianie i pogorszylo sprawe.
  const blokada = await zajmijBlokade("warm-rates", 360);
  if (!blokada.zdobyta) {
    console.info("[cron/warm-rates] poprzedni przebieg wciaz trwa — pomijam");
    return NextResponse.json({ ok: true, status: "skipped_locked" });
  }

  const startedAt = Date.now();
  const windows = computeWarmDateWindows();
  // Union: top-N popularności + jawne extras (kafelki homepage). Dedup po id.
  const byId = new Map(getTopDestinations(WARM_DESTINATION_COUNT).map((d) => [d.id, d] as const));
  for (const id of WARM_EXTRA_DESTINATION_IDS) {
    if (!byId.has(id)) {
      const d = getDestinationById(id);
      if (d) byId.set(d.id, d);
      else console.warn(`[cron/warm-rates] extra kierunek '${id}' nie istnieje w seedzie`);
    }
  }
  const dests = [...byId.values()];

  // Kierunki z picks nastrojów (/wyjazdy) — grupa SNAPSHOT-ONLY: grzejemy je
  // wyłącznie w tanich oknach (2 zamiast 5), żeby karty dostały ceny bez
  // rozsadzenia budżetu czasu. Dedup względem core po id seedu.
  const snapshotOnlyDests: DestinationRecord[] = [];
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
      if (!byId.has(d.id) && !snapshotOnlyDests.some((x) => x.id === d.id)) snapshotOnlyDests.push(d);
    }
  }
  // Kierunki sekcji pakietów (rozłączne z kafelkami) — też snapshot-only:
  // tanie okna + loty wystarczą do pól pkg*; nie płacimy za bliskie okna.
  for (const id of PACKAGE_DESTINATION_IDS) {
    if (byId.has(id) || snapshotOnlyDests.some((x) => x.id === id)) continue;
    const d = getDestinationById(id);
    if (d) snapshotOnlyDests.push(d);
    else console.warn(`[cron/warm-rates] kierunek pakietu '${id}' nie istnieje w seedzie`);
  }

  // 1) Metadane (hotelId) na kierunek — raz. Przy okazji grzeje Next Data Cache
  // dla /data/hotels tego miasta. Błąd pojedynczego kierunku nie wywala crona.
  const destHotels: Array<{ id: string; label: string; priceKey: string; iata: string | null; hotelIds: string[]; group: "core" | "snapshot" }> = [];
  const allDests: Array<{ d: DestinationRecord; group: "core" | "snapshot" }> = [
    ...dests.map((d) => ({ d, group: "core" as const })),
    ...snapshotOnlyDests.map((d) => ({ d, group: "snapshot" as const })),
  ];
  for (const { d, group } of allDests) {
    try {
      // Metadane do głębokości snapshotu (150); bliskie okna i tak biorą
      // tylko pierwszą 50-tkę (to, co widzi user na 1. stronie wyników).
      const list = await fetchHotelsForDestination({
        city: d.city.en,
        country: d.country.code ?? d.country.pl,
        lat: d.lat,
        lng: d.lng,
        limit: SNAPSHOT_HOTELS_PER_DEST,
      });
      const ids = (list.data ?? []).map((h) => h.id).slice(0, SNAPSHOT_HOTELS_PER_DEST);
      if (ids.length) {
        destHotels.push({
          id: d.id,
          label: d.city.en,
          priceKey: destinationPriceKey(d.city.en, d.country.en),
          // IATA do ceny lotu: seed (airports[0], bywa kod metra jak ROM —
          // LiteAPI rozwija natywnie) z fallbackiem do słownika lotnisk.
          iata: d.airports?.[0] ?? iataForCity(d.city.en),
          hotelIds: ids,
          group,
        });
      }
    } catch (err) {
      console.warn(`[cron/warm-rates] metadane '${d.city.en}' nieudane:`, err instanceof Error ? err.message : err);
    }
  }

  // 2) Zadania = (kierunek × okno dat). Occupancy: 2 dorosłych, 1 pokój, PLN —
  // najczęstszy wariant (cache jest kluczowany po occupancy).
  // Core: 3 bliskie okna (cache dla realnych searchy; pierwsza 50-tka hoteli)
  // + 2 tanie okna. Snapshot-only (mood picks): tylko 2 tanie okna.
  // Tanie okna skanują GŁĘBIEJ (150 hoteli = 3 chunki po 50): lista jest
  // sortowana popularnością, a najtańsze bywają za pierwszą 50-tką
  // (sonda: Rzym 513 zł/noc w 0-50 vs 262 zł w 100-150).
  const cheapWindows = computeSnapshotDateWindows();
  // windowLabel tylko dla tanich okien — z nich liczymy pakiety (hotel i lot
  // z TEGO SAMEGO okna; patrz computePackagePerPerson).
  const tasks: Array<{ label: string; priceKey: string; hotelIds: string[]; ctx: RateCacheContext; windowLabel?: string }> = [];
  for (const dh of destHotels) {
    const nearIds = dh.hotelIds.slice(0, WARM_HOTELS_PER_DEST);
    if (dh.group === "core") {
      for (const w of windows) {
        tasks.push({
          label: `${dh.label}/${w.label}`,
          priceKey: dh.priceKey,
          hotelIds: nearIds,
          ctx: { checkin: w.checkin, checkout: w.checkout, adults: 2, children: [], rooms: 1, currency: "PLN" },
        });
      }
    }
    for (const w of cheapWindows) {
      // Głęboki skan (150 = 3 chunki) tylko w PIERWSZYM tanim oknie — dwa
      // głębokie okna rozsadzały budżet czasu (zmierzone 260 s przy limicie
      // funkcji 300 s). Drugie okno płytko (top-50) — i tak łapie różnicę
      // weekday vs weekend, a minimum bierzemy ze wszystkich zadań.
      const depth = w.label === "tani-tydzien" ? dh.hotelIds.length : Math.min(dh.hotelIds.length, WARM_HOTELS_PER_DEST);
      for (let i = 0; i < depth; i += 50) {
        tasks.push({
          label: `${dh.label}/${w.label}/${i}-${i + 50}`,
          priceKey: dh.priceKey,
          hotelIds: dh.hotelIds.slice(i, i + 50),
          ctx: { checkin: w.checkin, checkout: w.checkout, adults: 2, children: [], rooms: 1, currency: "PLN" },
          windowLabel: w.label,
        });
      }
    }
  }

  // 3) Grzanie z współbieżnością + budżetem czasu. Odporne: błąd jednego zadania
  // nie zatrzymuje reszty.
  let calls = 0;
  let warmedHotels = 0;
  let skipped = 0;
  const bestPrice = new Map<string, DestinationPriceSnapshot[string]>();
  // Minima per (kierunek × tanie okno) — składniki pakietu. Klucz: `${priceKey}|${windowLabel}`.
  const hotelByWindow = new Map<string, number>();
  const flightByWindow = new Map<string, number>();
  await runPool(tasks, WARM_CONCURRENCY, async (t) => {
    if (Date.now() - startedAt > WARM_TIME_BUDGET_MS) {
      skipped++;
      return;
    }
    try {
      const res = await resolveSlimRates(t.hotelIds, t.ctx, { forceRefresh: true });
      calls++;
      warmedHotels += Object.values(res.rates).filter((r) => r !== null).length;
      // Snapshot cen: minimum za-noc z tego zadania (kierunek × okno) vs
      // dotychczasowe minimum kierunku z innych okien.
      const pn = minPerNightFromRates(res.rates, t.ctx.checkin, t.ctx.checkout);
      if (pn !== null) {
        if (t.windowLabel) {
          const wk = `${t.priceKey}|${t.windowLabel}`;
          const prevW = hotelByWindow.get(wk);
          if (prevW === undefined || pn < prevW) hotelByWindow.set(wk, pn);
        }
        const prev = bestPrice.get(t.priceKey);
        if (!prev || pn < prev.hotelFromPlnPerNight) {
          bestPrice.set(t.priceKey, {
            hotelFromPlnPerNight: pn,
            checkin: t.ctx.checkin,
            checkout: t.ctx.checkout,
            computedAt: Date.now(),
          });
        }
      }
    } catch (err) {
      console.warn(`[cron/warm-rates] grzanie '${t.label}' nieudane:`, err instanceof Error ? err.message : err);
    }
  });

  // ── Loty (Faza 6): najtańszy lot w obie strony WAW→kierunek. Szukamy w OBU
  // tanich oknach (sobota-daleko 7 nocy ORAZ poniedziałek-środek tygodnia
  // 4 noce — wyloty poniedziałkowe bywają wyraźnie tańsze; właściciel
  // 2026-07-02: „niższe ceny lotów") i bierzemy minimum. Dopinamy TYLKO do
  // kierunków z wpisem cenowym hotelu (typ wymaga hotelFromPlnPerNight).
  // Concurrency 4 (nie WARM_CONCURRENCY): /flights/rates jest cięższy (~5-8 s).
  let flightCalls = 0;
  let flightPrices = 0;
  const flightTasks: Array<{ label: string; priceKey: string; iata: string; w: (typeof cheapWindows)[number] }> = [];
  for (const dh of destHotels) {
    if (!dh.iata || !bestPrice.has(dh.priceKey)) continue;
    for (const w of cheapWindows) {
      flightTasks.push({ label: `${dh.label}/${w.label}`, priceKey: dh.priceKey, iata: dh.iata, w });
    }
  }
  await runPool(flightTasks, 6, async (t) => {
    if (Date.now() - startedAt > WARM_TIME_BUDGET_MS) return;
    try {
      const input = FlightSearchInputSchema.parse({
        legs: [
          { origin: "WAW", destination: t.iata, date: t.w.checkin, direction: "OUTBOUND" },
          { origin: t.iata, destination: "WAW", date: t.w.checkout, direction: "INBOUND" },
        ],
        adults: 1,
      });
      const res = await searchFlightRates(input);
      flightCalls++;
      const minTotal = minTotalFromOffers(normalizeRatesResponse(res));
      if (minTotal !== null) {
        const wk = `${t.priceKey}|${t.w.label}`;
        const prevW = flightByWindow.get(wk);
        if (prevW === undefined || minTotal < prevW) flightByWindow.set(wk, minTotal);
        const entry = bestPrice.get(t.priceKey)!;
        if (typeof entry.flightFromPln !== "number" || minTotal < entry.flightFromPln) {
          bestPrice.set(t.priceKey, {
            ...entry,
            flightFromPln: minTotal,
            flightDepart: t.w.checkin,
            flightReturn: t.w.checkout,
            flightComputedAt: Date.now(),
          });
        }
        flightPrices++;
      }
    } catch (err) {
      console.warn(`[cron/warm-rates] lot '${t.label}' nieudany:`, err instanceof Error ? err.message : err);
    }
  });

  // Pakiety „Cały wyjazd od X zł/os.": dla każdego kierunku minimum po tanich
  // oknach z pkg = lot(okno) + noce×hotel(okno)/2 — OBA składniki z tego
  // samego okna (uczciwe, rezerwowalne daty). Brak któregokolwiek → bez pkg.
  let pkgCount = 0;
  for (const [priceKey, entry] of bestPrice) {
    let best: { pkg: number; checkin: string; checkout: string } | null = null;
    for (const w of cheapWindows) {
      const wk = `${priceKey}|${w.label}`;
      const hotel = hotelByWindow.get(wk);
      const flight = flightByWindow.get(wk);
      if (hotel === undefined || flight === undefined) continue;
      const pkg = computePackagePerPerson(flight, hotel, w.checkin, w.checkout);
      if (pkg !== null && (best === null || pkg < best.pkg)) {
        best = { pkg, checkin: w.checkin, checkout: w.checkout };
      }
    }
    if (best) {
      bestPrice.set(priceKey, {
        ...entry,
        pkgPerPersonPln: best.pkg,
        pkgCheckin: best.checkin,
        pkgCheckout: best.checkout,
        pkgComputedAt: Date.now(),
      });
      pkgCount++;
    }
  }

  // Snapshot „Hotel od X zł/noc" dla homepage i /wyjazdy. Błąd zapisu NIE
  // psuje crona (merge jest best-effort, ale pas bezpieczeństwa zostaje).
  let snapshotEntries = 0;
  if (bestPrice.size > 0) {
    try {
      await mergePriceSnapshot(Object.fromEntries(bestPrice));
      snapshotEntries = bestPrice.size;
    } catch (err) {
      console.warn("[cron/warm-rates] snapshot cen nieudany:", err instanceof Error ? err.message : err);
    }
  }

  // Ocena Trustpilot do pasów zaufania — realny fetch max 1×/24 h (throttle
  // w module), porażka nie psuje crona ani nie kasuje starej wartości.
  let trustpilot = "failed";
  try {
    trustpilot = await refreshTrustpilotSnapshot();
  } catch (err) {
    console.warn("[cron/warm-rates] trustpilot refresh:", err instanceof Error ? err.message : err);
  }

  const durationMs = Date.now() - startedAt;
  const summary = {
    ok: true,
    destinations: destHotels.length,
    coreDests: destHotels.filter((d) => d.group === "core").length,
    snapshotOnlyDests: destHotels.filter((d) => d.group === "snapshot").length,
    windows: windows.length + cheapWindows.length,
    tasks: tasks.length,
    rateCalls: calls,
    warmedHotels,
    skipped,
    flightCalls,
    flightPrices,
    snapshotEntries,
    pkgCount,
    trustpilot,
    durationMs,
  };
  console.log("[cron/warm-rates]", JSON.stringify(summary));
  await blokada.zwolnij();
  return NextResponse.json(summary);
}
