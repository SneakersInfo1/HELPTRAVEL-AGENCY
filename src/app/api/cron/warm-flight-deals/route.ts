// /api/cron/warm-flight-deals — budowa snapshotu sekcji „Okazje lotnicze”.
//
// Każda cena i mediana pochodzą z realnych wyszukań LiteAPI. Trasa bez
// wystarczającej próby albo bez wyraźnej oszczędności nie dostaje wpisu — brak
// karty jest uczciwszy niż liczba zastępcza.

import { NextRequest, NextResponse } from "next/server";

import seedJson from "../../../../../data/destinations.json";
import {
  computeDealDateWindows,
  DEAL_ADULTS,
  DEAL_CONCURRENCY,
  DEAL_MAX_DURATION_MINUTES,
  DEAL_MAX_DURATION_RATIO,
  DEAL_NIGHTS,
  DEAL_ROUTES,
  DEAL_ROUTES_PER_RUN,
  DEAL_TIME_BUDGET_MS,
  type DealDateWindow,
  type DealRoute,
} from "@/lib/flights/deals-config";
import type { DisplayOffer } from "@/lib/flights/display";
import {
  DEAL_ROTATION_MS,
  isDisplayableDeal,
  median,
  mergeFlightDeals,
  qualifiesAsDeal,
  savingPercent,
  type FlightDeal,
  type FlightDealsSnapshot,
} from "@/lib/flights/flight-deals";
import { lookupAirport } from "@/lib/flights/airports";
import { flightRatesCacheKey, setCachedFlightOffers } from "@/lib/flights/rates-cache";
import { searchFlightOffers } from "@/lib/flights/search-offers";
import { FlightSearchInputSchema } from "@/lib/flights/types";
import { rotateSlice, rotationBucket } from "@/lib/home/rotation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

interface DestinationSeedEntry {
  id: string;
  city: { pl: string };
  country: { pl: string };
}

const DESTINATIONS = (seedJson as unknown as { destinations: DestinationSeedEntry[] }).destinations;
const DESTINATION_BY_ID = new Map(DESTINATIONS.map((destination) => [destination.id, destination]));

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      await worker(items[current]);
    }
  });
  await Promise.all(runners);
}

interface DealTask {
  route: DealRoute;
  window: DealDateWindow;
}

interface PricedSample {
  total: number;
  offer: DisplayOffer;
  window: DealDateWindow;
}

function routeKey(route: DealRoute): string {
  return `${route.origin}-${route.destinationIata}`;
}

/**
 * Najtańsza oferta, która nie jest podróżą absurdalnie długą.
 *
 * DWA PROGI, bo każdy sam w sobie ma ślepą plamkę (uzasadnienie liczb —
 * `deals-config.ts`):
 *   • WZGLĘDNY (`DEAL_MAX_DURATION_RATIO`) — mierzy się do najszybszej oferty
 *     tego samego wyszukania, więc kalibruje się sam dla Aten i dla Dubaju;
 *     zawodzi, gdy CAŁY wynik jest zły (zmierzone: Pafos 31.08, gdzie
 *     najszybsza podróż i tak trwała kilkanaście godzin),
 *   • BEZWZGLĘDNY (`DEAL_MAX_DURATION_MINUTES`) — łapie właśnie tamten
 *     przypadek, ale sam byłby zbyt tępy, bo 8 h to katastrofa do Aten
 *     i norma na Wyspy Kanaryjskie.
 *
 * Zwraca `null`, gdy żadna oferta nie mieści się w sufcie — i to jest
 * poprawny wynik: termin, na który da się polecieć wyłącznie kilkunastogodzinną
 * trasą, nie jest okazją i nie ma prawa współtworzyć mediany.
 */
function cheapestSaneOffer(offers: DisplayOffer[]): { offer: DisplayOffer; total: number } | null {
  const priced = offers.filter(
    (o): o is DisplayOffer & { total: number } =>
      typeof o.total === "number" && Number.isFinite(o.total) && o.total > 0,
  );
  if (priced.length === 0) return null;
  const fastest = Math.min(...priced.map((o) => o.maxDurationMinutes));
  const limit = Math.min(fastest * DEAL_MAX_DURATION_RATIO, DEAL_MAX_DURATION_MINUTES);
  let cheapest: { offer: DisplayOffer; total: number } | null = null;
  for (const offer of priced) {
    if (offer.maxDurationMinutes > limit) continue;
    if (!cheapest || offer.total < cheapest.total) cheapest = { offer, total: offer.total };
  }
  return cheapest;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/warm-flight-deals] CRON_SECRET nie ustawiony — odmawiam (ustaw zmienną w Vercel).");
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const routes = rotateSlice(
    DEAL_ROUTES,
    DEAL_ROUTES_PER_RUN,
    rotationBucket(Date.now(), DEAL_ROTATION_MS),
  );
  const windows = computeDealDateWindows();
  const tasks: DealTask[] = routes.flatMap((route) => windows.map((window) => ({ route, window })));
  const samplesByRoute = new Map<string, PricedSample[]>(routes.map((route) => [routeKey(route), []]));

  let priced = 0;
  let skipped = 0;
  let failed = 0;

  await runPool(tasks, DEAL_CONCURRENCY, async ({ route, window }) => {
    const label = `${routeKey(route)}/${window.label}`;
    try {
      if (Date.now() - startedAt > DEAL_TIME_BUDGET_MS) {
        skipped++;
        return;
      }
      const input = FlightSearchInputSchema.parse({
        legs: [
          {
            origin: route.origin,
            destination: route.destinationIata,
            date: window.checkin,
            direction: "OUTBOUND",
          },
          {
            origin: route.destinationIata,
            destination: route.origin,
            date: window.checkout,
            direction: "INBOUND",
          },
        ],
        adults: DEAL_ADULTS,
      });
      const offers = await searchFlightOffers(input);
      // To dokładnie ten sam cache i klucz co wyszukiwanie użytkownika, więc
      // koszt pomiaru mediany jednocześnie ogrzewa właściwy wynik.
      await setCachedFlightOffers(flightRatesCacheKey(input), offers, "warm");
      const cheapest = cheapestSaneOffer(offers);
      if (!cheapest) return;
      samplesByRoute.get(routeKey(route))?.push({ ...cheapest, window });
      priced++;
    } catch (error) {
      failed++;
      console.warn(
        `[cron/warm-flight-deals] '${label}' nieudany:`,
        error instanceof Error ? error.message : error,
      );
    }
  });

  const collected: FlightDealsSnapshot = {};
  // Trasy, które ten przebieg SPRAWDZIŁ i które okazją nie są. Lecą do
  // `mergeFlightDeals` jako jawne usunięcie — bez tego stary, korzystniejszy
  // wpis wisiałby na stronie aż do wygaśnięcia świeżości, mimo że przewoźnik
  // zdążył podnieść cenę (patrz komentarz przy `mergeFlightDeals`).
  const checkedWithoutDeal: string[] = [];
  for (const route of routes) {
    const key = routeKey(route);
    try {
      const samples = samplesByRoute.get(key) ?? [];
      const typicalPln = median(samples.map((sample) => sample.total));
      if (typicalPln === null || samples.length === 0) {
        // Zero próbek to najczęściej awaria wyszukiwania, a nie wiedza o cenie.
        // Kasowanie wpisu na tej podstawie gasiłoby sekcję przy każdym
        // przejściowym błędzie LiteAPI — o takim wpisie decyduje świeżość.
        continue;
      }
      const cheapest = samples.reduce((best, sample) => (sample.total < best.total ? sample : best));
      const pricePln = Math.round(cheapest.total);
      if (!qualifiesAsDeal(pricePln, typicalPln, samples.length)) {
        checkedWithoutDeal.push(key);
        continue;
      }

      const destination = DESTINATION_BY_ID.get(route.destinationId);
      if (!destination) throw new Error(`brak destinationId '${route.destinationId}' w seedzie`);
      const outbound = cheapest.offer.legs[0];
      if (!outbound) throw new Error("najtańsza oferta nie ma odcinka OUTBOUND");

      const candidate: FlightDeal = {
        routeKey: key,
        originIata: route.origin,
        originCityLabel: lookupAirport(route.origin)?.city ?? route.origin,
        destinationIata: route.destinationIata,
        destinationId: route.destinationId,
        cityLabel: destination.city.pl,
        countryLabel: destination.country.pl,
        depart: cheapest.window.checkin,
        returnDate: cheapest.window.checkout,
        nights: DEAL_NIGHTS,
        pricePln,
        typicalPln,
        savingPercent: savingPercent(pricePln, typicalPln),
        sampleCount: samples.length,
        airlineName: outbound.carriers[0] ?? outbound.carrierCode,
        airlineCode: outbound.carrierCode,
        airlineLogo: outbound.carrierLogo,
        // MAKSIMUM z obu odcinków, nie sam wylot. Karta pisze „bezpośredni",
        // a przy odczycie z samego OUTBOUND lot z bezpośrednią „tam" i jedną
        // przesiadką „z powrotem" dostałby tę etykietę — czyli obietnicę,
        // której druga połowa podróży nie spełnia. Maksimum jest po stronie
        // ostrożnej: „1 przesiadka" przy locie tam bezpośrednim to niedomówienie
        // na naszą niekorzyść, odwrotnie byłoby wprowadzaniem w błąd.
        stops: Math.max(...cheapest.offer.legs.map((leg) => leg.stops)),
        // Czas pozostaje z odcinka TAM (karta podpisuje go „w jedną stronę") —
        // suma obu odcinków nie znaczy nic dla nikogo, kto wybiera lot.
        durationMinutes: outbound.durationMinutes,
        computedAt: Date.now(),
      };
      if (!isDisplayableDeal(candidate)) throw new Error("najtańsza oferta nie ma kompletu danych karty");
      collected[key] = candidate;
    } catch (error) {
      failed++;
      console.warn(
        `[cron/warm-flight-deals] trasa '${key}' pominięta:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  await mergeFlightDeals(collected, checkedWithoutDeal);
  const summary = {
    ok: true,
    routes: routes.length,
    tasks: tasks.length,
    priced,
    deals: Object.keys(collected).length,
    // Ile tras sprawdzono i odrzucono. To NIE jest błąd, tylko normalny stan
    // rynku — ale bez tej liczby w logu nie da się odróżnić „dziś nie ma
    // przecen" od „coś przestało liczyć medianę".
    withoutDeal: checkedWithoutDeal.length,
    skipped,
    failed,
    durationMs: Date.now() - startedAt,
  };
  console.log("[cron/warm-flight-deals]", JSON.stringify(summary));
  return NextResponse.json(summary);
}
