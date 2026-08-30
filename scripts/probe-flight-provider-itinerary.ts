// Sonda TRASY OD DOSTAWCY — czy `extractProviderItinerary` działa na PRAWDZIWYM
// payloadzie lotniczym, a nie tylko na wymyślonych atrapach z testów.
//
// ── CO ROBI ──────────────────────────────────────────────────────────────────
//
//   1. Skanuje PRODUKCYJNY Upstash w poszukiwaniu historycznych rezerwacji
//      lotniczych (`flight:v1:*`). WYŁĄCZNIE ODCZYT — żadnego SET, żadnego DEL.
//      Raportuje LICZBY i identyfikatory, nigdy danych osobowych.
//   2. Jeżeli znajdzie rezerwację → `GET /flights/bookings/{id}` (odczyt u
//      dostawcy) i puszcza odpowiedź przez `extractProviderItinerary`.
//   3. Niezależnie od punktu 1: robi JEDEN prebook (lock taryfy + PaymentIntent,
//      BEZ obciążenia karty) i sprawdza ekstraktor na `data[0].booking` — to
//      prawdziwy payload dostawcy i jedyny, jaki da się zdobyć bez rezerwacji.
//
// NIE WOŁA `POST /flights/bookings`. Nie płaci. Nie kasuje niczego w Redisie.
//
// Uruchomienie: pnpm probe:flight-itinerary

import { Redis } from "@upstash/redis";

import { getFlightBooking, prebookFlight, searchFlightRates } from "@/lib/flights/client";
import { normalizeRatesResponse } from "@/lib/flights/display";
import { extractProviderItinerary, mergeItineraries } from "@/lib/flights/provider-itinerary";
import { FlightSearchInputSchema } from "@/lib/flights/types";

function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Skrót identyfikatora — dość, żeby go odszukać, za mało, żeby był wyciekiem. */
function shortId(v: string): string {
  return v.length <= 14 ? v : `${v.slice(0, 8)}…${v.slice(-4)}`;
}

async function skanujRedis(): Promise<string[]> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.log("Brak zmiennych Upstash — pomijam skan.");
    return [];
  }
  const redis = new Redis({ url, token });

  const wzorce = [
    "flight:v1:completed:*",
    "flight:v1:bybooking:*",
    "flight:v1:session:*",
    "flight:v1:failed:*",
    "flight:v1:byprebook:*",
  ];
  const bookingIds: string[] = [];

  for (const wzorzec of wzorce) {
    let cursor = "0";
    const znalezione: string[] = [];
    do {
      // SCAN — nie KEYS. Odczyt, nieblokujący.
      const [next, keys] = (await redis.scan(cursor, { match: wzorzec, count: 200 })) as [string, string[]];
      znalezione.push(...keys);
      cursor = String(next);
    } while (cursor !== "0" && znalezione.length < 500);

    console.log(`  ${wzorzec.padEnd(28)} → ${znalezione.length}`);
    for (const k of znalezione) {
      const id = k.split(":").pop();
      if (!id) continue;
      if (wzorzec.startsWith("flight:v1:completed") || wzorzec.startsWith("flight:v1:bybooking")) {
        bookingIds.push(id);
      }
    }
  }
  return [...new Set(bookingIds)];
}

function raportujTrase(zrodlo: string, payload: unknown) {
  const it = extractProviderItinerary(payload);
  console.log(`  źródło                   = ${zrodlo}`);
  console.log(`  extractProviderItinerary = ${it ? "ZNALAZŁ trasę" : "null (fallback na migawkę klienta)"}`);
  if (!it) {
    // Pokaż, jak WYGLĄDA payload, żeby dało się orzec, czy to brak trasy
    // w danych, czy błąd ekstraktora.
    const top = payload && typeof payload === "object" ? Object.keys(payload as object) : [];
    console.log(`  klucze najwyższego poziomu = ${JSON.stringify(top)}`);
    return;
  }
  console.log(`  odcinków                 = ${it.legs.length}`);
  for (const l of it.legs) {
    console.log(
      `    ${l.direction.padEnd(8)} ${l.originCode}→${l.destinationCode} ${l.departureTime} → ${l.arrivalTime} ` +
        `${l.durationMinutes} min, przesiadek ${l.stops}, ${l.carrier}`,
    );
  }
  console.log(`  fareName / carryOn / checked = ${it.fareName ?? "—"} / ${it.hasCarryOnBag ?? "—"} / ${it.hasCheckedBag ?? "—"}`);
  const scalone = mergeItineraries(it, undefined);
  console.log(`  mergeItineraries.source  = ${scalone.source}`);
}

async function main() {
  console.log("=== 1. HISTORYCZNE REZERWACJE LOTNICZE W PRODUKCYJNYM REDISIE (odczyt) ===");
  let bookingIds: string[] = [];
  try {
    bookingIds = await skanujRedis();
  } catch (e) {
    console.log(`  BŁĄD skanu: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(`  identyfikatory rezerwacji = ${bookingIds.length ? bookingIds.map(shortId).join(", ") : "BRAK"}`);

  console.log("\n=== 2. GET /flights/bookings/{id} NA REALNEJ REZERWACJI ===");
  if (!bookingIds.length) {
    console.log("  Brak historycznych rezerwacji lotniczych — nie ma czego odczytać.");
    console.log("  (To spodziewane: loty nigdy nie były na produkcji.)");
  } else {
    for (const id of bookingIds.slice(0, 3)) {
      try {
        const res = await getFlightBooking(id);
        console.log(`\n  bookingId=${shortId(id)} → HTTP 200`);
        raportujTrase("GET /flights/bookings/{id}", res);
      } catch (e) {
        const err = e as { message?: string; status?: number; body?: unknown };
        console.log(`\n  bookingId=${shortId(id)} → BŁĄD ${err.message ?? String(e)} status=${err.status ?? "—"}`);
      }
    }
  }

  console.log("\n=== 3. EKSTRAKTOR NA PRAWDZIWYM `booking` Z PREBOOKA ===");
  console.log("  (prebook tworzy lock taryfy i PaymentIntent — NIE obciąża karty)");
  try {
    const input = FlightSearchInputSchema.parse({
      legs: [
        { origin: "WAW", destination: "BCN", date: inDays(30), direction: "OUTBOUND" },
        { origin: "BCN", destination: "WAW", date: inDays(37), direction: "INBOUND" },
      ],
      adults: 1,
    });
    const offers = normalizeRatesResponse(await searchFlightRates(input));
    const cheapest = [...offers].sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity))[0];
    if (!cheapest) {
      console.log("  Brak ofert — pomijam.");
      return;
    }
    const pre = await prebookFlight({
      offerId: cheapest.offerId,
      contact: {
        firstName: "Jan",
        lastName: "Kowalczyk",
        email: "rezerwacje@helptravel.pl",
        phoneNumber: "500100200",
        phoneCountryCode: "48",
      },
      passengers: [
        {
          title: "MR",
          firstName: "Jan",
          lastName: "Kowalczyk",
          birthday: "1990-01-01",
          gender: "M",
          nationality: "PL",
          type: "ADT",
          documentType: "passport",
          documentNumber: "AB200001",
          documentExpiry: inDays(365 * 5),
          documentIssueCountry: "PL",
        },
      ],
    });
    console.log(`  prebook OK, klucze booking = ${pre.booking && typeof pre.booking === "object" ? JSON.stringify(Object.keys(pre.booking as object)) : "(brak obiektu booking)"}`);
    raportujTrase("prebook → data[0].booking", pre.booking);
    console.log(`\n  Kontrola: ten sam ekstraktor na CAŁEJ odpowiedzi prebooka`);
    raportujTrase("prebook → cała odpowiedź", { data: [pre] });
  } catch (e) {
    const err = e as { message?: string; body?: unknown };
    console.log(`  BŁĄD: ${err.message ?? String(e)}`);
    console.log(`  szczegóły: ${JSON.stringify(err.body ?? null).slice(0, 400)}`);
  }
}

void main();
