// Produkcyjne wiązanie ToolDeps dla egzekutorów AI Concierge (Task 2.2).
//
// TEN plik importuje moduły server-only (destinations-seed) i klienty LiteAPI —
// dlatego jest ODDZIELONY od tools.ts i NIE WOLNO go importować w testach
// node:test (`import "server-only"` nie rozwiązuje się poza Next — zweryfikowane
// w Task 1.2). Jedyny konsument: API route czatu (Task 3.3), która robi
// createToolExecutors(buildProductionToolDeps()).
//
// UCZCIWOŚĆ: każda kwota pochodzi z realnej odpowiedzi LiteAPI (te same helpery
// co cron warm-rates i strony wyników). Brak lotniska w danych / brak taryf /
// waluta inna niż PLN → null, nigdy zgadywanie. Użycie LiteAPI wyłącznie
// READ-ONLY (listy hoteli + rates) — zero prebook/book.

import { type DisplayOffer } from "@/lib/flights/display";
import { iataForCity } from "@/lib/flights/airports";
import { readActiveSnapshot } from "@/lib/snapshot/store";
import {
  flightRatesCacheKey,
  getCachedFlightOffers,
  setCachedFlightOffers,
} from "@/lib/flights/rates-cache";
import { searchFlightOffers } from "@/lib/flights/search-offers";
import { searchWithDeadline } from "./flight-retry";
import { FlightSearchInputSchema } from "@/lib/flights/types";
import { resolveSlimRates } from "@/lib/hotels/resolve-slim-rates";
import type { RateCacheContext, SlimRate } from "@/lib/hotels/rate-cache";
import { fetchHotelsForDestination, getHotelDetail } from "@/lib/liteapi";
import { getDestinationByCityCountry, listAllDestinations } from "@/lib/mvp/destinations-seed";
import { readPriceSnapshot } from "@/lib/prices/destination-price-snapshot";
import type { CheapestFlight, CheapestFlightQuery, CheapestHotel, CheapestHotelQuery, ToolDeps } from "./tools";
import type { TripSearchCity } from "./trip-search";

// Głębokość listy hoteli: 50 = jeden chunk resolveSlimRates (limit LiteAPI na
// call) i pierwsza strona wyników, którą widzi user po handoffie. Cron grzeje
// te same klucze cache (keyFor w rate-cache), więc trafienia są tanie.
const OFFER_HOTELS_LIMIT = 50;

// ── Budżet czasu na wyszukanie lotu W CZACIE ────────────────────────────────
// Lejek lotów woła z domyślnymi 30 s × 3 próby — tam użytkownik patrzy na
// stronę, na której nie ma nic innego. W czacie CAŁA tura ma 50 s (razem
// z rundami modelu), więc jedno takie wyszukiwanie mogło samo przekroczyć
// maxDuration route'a; użytkownik dostawał wtedy gołe 504 zamiast odpowiedzi.
//
// HISTORIA TYCH LICZB — obie skrajności były zmierzone i obie były złe:
//   • 30 s × 3 próby (przed V2.1): teoretyczne 90 s na JEDNO wywołanie;
//   • 20 s × 1 próba (V2.1): ucięło ogon, ale na produkcji 6 z 72 wywołań
//     padło DOKŁADNIE na limicie i zamieniło ofertę VALID w PARTIAL —
//     mimo że kolejne żądanie tej samej trasy wracało w 1216–1845 ms.
//
// Stąd model z globalnym terminem (patrz ./flight-retry): pierwsza próba ma
// 15 s — powyżej realnych poprawnych odpowiedzi, których na Preview mierzono
// do 14,4 s (p95) — a jeśli padnie PRZEJŚCIOWO, druga dostaje wyłącznie
// resztę z 23 s. Suma nigdy nie przekracza budżetu, a zablokowany pojedynczy
// strzał ma szansę na odbicie.
const FLIGHT_FIRST_ATTEMPT_MS = 15_000;
const FLIGHT_GLOBAL_BUDGET_MS = 23_000;
/** Poniżej tylu ms druga próba i tak nie zdąży — lepiej oddać ofertę częściową. */
const FLIGHT_MIN_ATTEMPT_MS = 2_500;

/**
 * Najtańszy hotel dla kierunku i dat — DOKŁADNIE ta sama ścieżka co strona
 * wyników i cron warm-rates: fetchHotelsForDestination (metadane + fallbacki
 * miasto→coords→placeId) + resolveSlimRates (najtańsza taryfa per hotel,
 * maxRatesPerHotel:1, wspólny cache Redis). Bez forceRefresh — korzystamy
 * z ciepłego cache'a crona zamiast palić limit LiteAPI.
 */
async function findCheapestHotelLive(q: CheapestHotelQuery): Promise<CheapestHotel | null> {
  const dest = getDestinationByCityCountry(q.cityEn, q.countryEn);
  const list = await fetchHotelsForDestination({
    // Wzorzec z crona: kanoniczne nazwy + coords z seedu, gdy rekord istnieje;
    // inaczej surowe nazwy z argumentów (fetchHotelsForDestination ma fallbacki).
    city: dest?.city.en ?? q.cityEn,
    country: dest ? (dest.country.code ?? dest.country.pl) : q.countryEn,
    lat: dest?.lat,
    lng: dest?.lng,
    limit: OFFER_HOTELS_LIMIT,
  });
  const hotels = list.data ?? [];
  if (hotels.length === 0) return null;

  const ids = hotels.map((h) => h.id).slice(0, OFFER_HOTELS_LIMIT);
  // Occupancy jak wszędzie downstream (decyzja produktowa mini-plannera):
  // dzieci liczone jak dorośli — `adults` niesie sumę gości, children:[] (wiek
  // nieznany). Identyczny kształt ctx co cron → identyczny klucz cache.
  const ctx: RateCacheContext = {
    checkin: q.checkin,
    checkout: q.checkout,
    adults: q.adults + q.children,
    children: [],
    rooms: 1,
    currency: "PLN",
  };
  const { rates } = await resolveSlimRates(ids, ctx);

  let best: { hotelId: string; rate: SlimRate } | null = null;
  for (const hotelId of ids) {
    const rate = rates[hotelId];
    // PLN-only i sensowny total — kwota spoza tych ram nie ma prawa wyjść z deps.
    if (!rate || rate.currency !== "PLN" || !Number.isFinite(rate.totalAmount) || rate.totalAmount <= 0) continue;
    if (!best || rate.totalAmount < best.rate.totalAmount) best = { hotelId, rate };
  }
  if (!best) return null;
  const found = best; // stała kopia — narrowing nie przeżywa domknięcia na `let`

  const meta = hotels.find((h) => h.id === found.hotelId);
  if (!meta) return null;
  const hotelName = meta.name.trim();
  if (!hotelName) return null;
  const clean = (value: string | undefined): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  };
  return {
    hotelId: found.hotelId,
    name: hotelName,
    totalPln: found.rate.totalAmount,
    mainPhotoUrl: meta.main_photo ?? meta.thumbnail ?? null,
    rating:
      typeof meta.rating === "number" &&
      Number.isFinite(meta.rating) &&
      meta.rating > 0 &&
      meta.rating <= 10
        ? meta.rating
        : null,
    stars:
      typeof meta.stars === "number" &&
      Number.isFinite(meta.stars) &&
      meta.stars > 0 &&
      meta.stars <= 5
        ? meta.stars
        : null,
    reviewCount:
      typeof meta.reviewCount === "number" &&
      Number.isInteger(meta.reviewCount) &&
      meta.reviewCount > 0
        ? meta.reviewCount
        : null,
    address: clean(meta.address),
    roomName: clean(found.rate.roomName),
    boardName: clean(found.rate.boardName),
    refundableTag: clean(found.rate.refundableTag),
    cancellationDeadline: clean(found.rate.cancellationDeadline),
    freeCancellationDeadline: clean(found.rate.freeCancellationDeadline),
  };
}

/**
 * Zdjęcia są dodatkiem do już wybranej oferty. Wersja EN robi pojedynczy call
 * `getHotelDetail` (galeria nie zależy od języka); timeout pozostaje w czystym
 * egzekutorze, więc ten adapter nie zna budżetu tury i łatwo go zamockować.
 */
async function fetchHotelPhotoUrlsLive(hotelId: string): Promise<string[]> {
  const detail = await getHotelDetail(hotelId, { language: "en" });
  return (detail.hotelImages ?? []).map((image) => image.urlHd ?? image.url);
}

/**
 * Najtańszy lot RT — ta sama ścieżka co cron warm-rates: mapowanie
 * miasto→IATA przez seed (airports[0], bywa kod metra jak ROM — LiteAPI
 * rozwija natywnie) z fallbackiem do słownika lotnisk (iataForCity), potem
 * searchFlightOffers (search → normalizacja → sort po cenie → cap) przez
 * WSPÓLNY cache `flrt:v2` i minimum po total. Miasto BEZ mapowania IATA →
 * null (uczciwie: żadnego zgadywania lotniska).
 */
async function findCheapestFlightLive(q: CheapestFlightQuery): Promise<CheapestFlight | null> {
  const dest = getDestinationByCityCountry(q.cityEn, q.countryEn);
  const iata = dest?.airports?.[0] ?? iataForCity(dest?.city.en ?? q.cityEn);
  if (!iata) return null;

  const input = FlightSearchInputSchema.parse({
    legs: [
      { origin: q.originIata, destination: iata, date: q.depart, direction: "OUTBOUND" },
      { origin: iata, destination: q.originIata, date: q.returnDate, direction: "INBOUND" },
    ],
    adults: q.adults,
    children: q.children,
  });

  // CACHE OFERT LOTÓW (`flrt:v2`) — ten sam klucz i ten sam helper, którymi
  // chodzi lejek lotów i cron prewarmingu. Konsjerż wołał wcześniej
  // `searchFlightRates` WPROST, więc jako jedyny w serwisie nie korzystał
  // z cache'a: każde zapytanie o ofertę było zimnym strzałem do LiteAPI,
  // nawet gdy cron przed chwilą wygrzał dokładnie tę trasę i te daty,
  // a powtórka w tej samej rozmowie („a coś tańszego?") płaciła drugi raz.
  const cacheKey = flightRatesCacheKey(input);
  let offers = await getCachedFlightOffers(cacheKey);
  if (offers === null) {
    // `retries: 1` = JEDEN strzał na próbę; ponawianiem steruje searchWithDeadline,
    // bo tylko ono zna globalny termin. Wewnętrzny retry klienta byłby ślepy
    // na budżet tury i to on dawał teoretyczne 90 s.
    const budgetMs = Math.min(q.budgetMs ?? FLIGHT_GLOBAL_BUDGET_MS, FLIGHT_GLOBAL_BUDGET_MS);
    const result = await searchWithDeadline(
      ({ timeoutMs }) => searchFlightOffers(input, { timeoutMs, retries: 1 }),
      {
        deadlineAt: Date.now() + budgetMs,
        firstAttemptMs: FLIGHT_FIRST_ATTEMPT_MS,
        minAttemptMs: FLIGHT_MIN_ATTEMPT_MS,
      },
    );
    if (result.attempts > 1 || result.value === null) {
      // Widoczne w logu tury obok `liteapi.flight` — bez tego nie da się
      // odpowiedzieć, ile ofert uratowała druga próba.
      console.warn(
        `[concierge] lot: proby=${result.attempts} wynik=${result.outcome}` +
          (result.value === null ? " → oferta bez lotu" : " → uratowane ponowieniem"),
      );
    }
    // Brak wyniku = brak lotu. NIE zapisujemy tego do cache: pusta lista
    // znaczy „trasa martwa", a tu chodzi o chwilową awarię.
    if (result.value === null) return null;
    offers = result.value;
    await setCachedFlightOffers(cacheKey, offers);
  }

  let best: DisplayOffer | null = null;
  for (const offer of offers) {
    // total = suma za WSZYSTKICH pasażerów z zapytania (semantyka DisplayOffer,
    // patrz flight-results.tsx). PLN-only (search i tak wymusza currency:PLN).
    if (typeof offer.total !== "number" || !Number.isFinite(offer.total) || offer.total <= 0) continue;
    if (offer.currency !== "PLN") continue;
    if (!best || offer.total < (best.total as number)) best = offer;
  }
  if (!best) return null;

  const outbound = best.legs.find((l) => l.direction === "OUTBOUND");
  const inbound = best.legs.find((l) => l.direction === "INBOUND");
  const carrierName = outbound?.carriers.find(
    (carrier) => carrier.trim().length > 0 && carrier !== "Przewoźnik",
  ) ?? null;
  return {
    totalPln: best.total as number,
    carrierName,
    outboundDepartureTime: outbound?.departureTime ?? "",
    inboundDepartureTime: inbound?.departureTime ?? null,
    stops: Math.max(...best.legs.map((l) => l.stops)),
    outboundDurationMinutes:
      outbound && outbound.durationMinutes > 0 ? outbound.durationMinutes : null,
    inboundDurationMinutes:
      inbound && inbound.durationMinutes > 0 ? inbound.durationMinutes : null,
    hasCarryOnBag: best.hasCarryOnBag ? true : null,
    hasCheckedBag: best.hasCheckedBag ? true : null,
    destinationIata: iata,
  };
}

/**
 * Kierunki seedu w danym kraju — nazwa po polsku, angielsku albo kodem
 * (case-insensitive). Seed jest uporządkowany popularnością, więc pierwsze
 * wpisy to główne kierunki kraju (np. Grecja: Ateny, Chania, Heraklion…).
 */
function listDestinationsInCountryLive(country: string): TripSearchCity[] {
  const target = country.trim().toLowerCase();
  if (!target) return [];
  return listAllDestinations()
    .filter(
      (d) =>
        d.country.en.toLowerCase() === target ||
        d.country.pl.toLowerCase() === target ||
        d.country.code?.toLowerCase() === target,
    )
    .map((d) => ({
      cityEn: d.city.en,
      countryEn: d.country.en,
      cityPl: d.city.pl,
      // Tagi i popularność są POTRZEBNE rankingowi (motyw + rozstrzyganie
      // remisów). Bez nich ścieżka „konkretny kraj" nie miałaby czym
      // odróżnić kierunku górskiego od miejskiego.
      vibeTagsEn: d.vibeTagsEn,
      popularity: d.popularity,
    }));
}

/** Jedno wywołanie w API route: createToolExecutors(buildProductionToolDeps()). */
export function buildProductionToolDeps(): ToolDeps {
  return {
    readSnapshot: readPriceSnapshot,
    readConciergeSnapshot: readActiveSnapshot,
    resolveDest: getDestinationByCityCountry,
    listDestinationsInCountry: listDestinationsInCountryLive,
    findCheapestHotel: findCheapestHotelLive,
    findCheapestFlight: findCheapestFlightLive,
    fetchHotelPhotoUrls: fetchHotelPhotoUrlsLive,
  };
}
