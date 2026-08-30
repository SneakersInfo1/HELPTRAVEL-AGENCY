// Zrzut KSZTAŁTU odpowiedzi `GET /flights/bookings/{id}` — bez danych osobowych.
//
// Odpowiada na pytanie z raportu: „kształt live response GET
// /flights/bookings/{id} nie został zweryfikowany na prawdziwym payloadzie".
// Bierze JEDYNĄ realną rezerwację lotniczą, jaka istnieje w produkcyjnym
// Redisie, odczytuje ją u dostawcy i zapisuje SAM SZKIELET (nazwy pól + typy)
// do `docs/liteapi-flights-sample-booking.json`.
//
// WYŁĄCZNIE ODCZYT: GET u dostawcy, SCAN w Redisie. Zero zapisów gdziekolwiek.
//
// Uruchomienie: pnpm probe:flight-booking-shape

import { writeFileSync } from "node:fs";

import { Redis } from "@upstash/redis";

import { getFlightBooking } from "@/lib/flights/client";
import { extractProviderItinerary } from "@/lib/flights/provider-itinerary";

const WYJSCIE = "docs/liteapi-flights-sample-booking.json";

/**
 * Zamienia wartości na opis typu. Nazwy pól zostają (o nie chodzi), wartości
 * znikają — w rekordzie rezerwacji siedzą nazwiska, e-maile i numery biletów.
 */
function szkielet(node: unknown, depth = 0): unknown {
  if (depth > 8) return "<głębiej niż 8 poziomów>";
  if (node === null) return "null";
  if (Array.isArray(node)) {
    if (node.length === 0) return ["<pusta tablica>"];
    return [szkielet(node[0], depth + 1), `<… łącznie ${node.length}>`];
  }
  if (typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = szkielet(v, depth + 1);
    }
    return out;
  }
  if (typeof node === "string") {
    // Kształt daty/godziny jest istotny dla ekstraktora — pokazujemy wzorzec,
    // nie treść. IATA też: trzyliterowy kod nie jest daną osobową.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(node)) return "<ISO datetime>";
    if (/^\d{4}-\d{2}-\d{2}$/.test(node)) return "<ISO date>";
    if (/^[A-Z]{3}$/.test(node)) return `<IATA: ${node}>`;
    return `<string, ${node.length} zn.>`;
  }
  if (typeof node === "number") return "<number>";
  if (typeof node === "boolean") return "<boolean>";
  return `<${typeof node}>`;
}

async function znajdzBookingId(): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token });
  let cursor = "0";
  do {
    const [next, keys] = (await redis.scan(cursor, { match: "flight:v1:bybooking:*", count: 200 })) as [string, string[]];
    const first = keys[0];
    if (first) return first.split(":").pop() ?? null;
    cursor = String(next);
  } while (cursor !== "0");
  return null;
}

async function main() {
  const bookingId = await znajdzBookingId();
  if (!bookingId) {
    console.log("Brak realnej rezerwacji lotniczej w Redisie — nie ma czego zrzucić.");
    return;
  }
  console.log(`Odczytuję rezerwację ${bookingId.slice(0, 8)}… u dostawcy (GET, read-only)…`);
  const res = await getFlightBooking(bookingId);

  const it = extractProviderItinerary(res);
  const artefakt = {
    note:
      "KSZTAŁT odpowiedzi GET /flights/bookings/{id} zmierzony na PRAWDZIWEJ rezerwacji lotniczej " +
      "(produkcja, 2026-08-30). Wartości celowo zastąpione opisem typu — rekord zawiera dane osobowe " +
      "pasażera. Służy do weryfikacji `extractProviderItinerary` i schematów.",
    httpStatus: 200,
    ekstraktorZnalazlTrase: it !== null,
    odcinkow: it?.legs.length ?? 0,
    structure: szkielet(res),
  };
  writeFileSync(WYJSCIE, `${JSON.stringify(artefakt, null, 2)}\n`, "utf8");
  console.log(`Zapisano ${WYJSCIE}`);
  console.log(`ekstraktor znalazł trasę = ${it !== null}, odcinków = ${it?.legs.length ?? 0}`);
}

void main();
