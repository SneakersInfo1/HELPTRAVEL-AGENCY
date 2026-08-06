// Empiryczna sonda kontraktu LiteAPI dla przebudowy sekcji hotelowej.
//
// Po co: schematy Zod w `src/lib/liteapi/types.ts` są NIE-strict, więc każde
// pole, którego nie zadeklarujemy, Zod po cichu wyrzuca. Nie da się z samego
// kodu odczytać, czy dostawca zwraca np. zdjęcia POKOI albo cenę referencyjną
// do przeceny — trzeba zapytać API i zobaczyć surową odpowiedź.
//
// Uruchomienie:
//   pnpm probe:hotel-contract                 # domyślnie Málaga
//   pnpm probe:hotel-contract lp6556ead9      # konkretny hotel
//
// Skrypt jest READ-ONLY (tylko GET /data/* i POST /hotels/rates — rates nie
// tworzy rezerwacji ani nie blokuje inwentarza). Nie wywołuje prebook/book.

const API_BASE = (process.env.LITEAPI_BASE_URL?.trim() || "https://api.liteapi.travel/v3.0").replace(/\/+$/, "");
const KEY = process.env.LITEAPI_PROD_PRIVATE_KEY?.trim() || process.env.LITEAPI_API_KEY?.trim();

if (!KEY) {
  console.error("Brak klucza LiteAPI (LITEAPI_PROD_PRIVATE_KEY). Uruchom przez `pnpm probe:hotel-contract`.");
  process.exit(1);
}

/** Kształt wartości — bez wypisywania samych danych (te bywają ogromne). */
function shape(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[] (pusta)";
    if (depth >= 3) return `[${value.length}×…]`;
    return `[${value.length}× ${shape(value[0], depth + 1)}]`;
  }
  if (typeof value === "object") {
    if (depth >= 3) return "{…}";
    const keys = Object.keys(value as object);
    if (keys.length === 0) return "{} (pusty)";
    return `{ ${keys.slice(0, 40).join(", ")}${keys.length > 40 ? ", …" : ""} }`;
  }
  if (typeof value === "string") return value.length > 60 ? `"${value.slice(0, 57)}…"` : `"${value}"`;
  return String(value);
}

function section(title: string) {
  console.log(`\n${"═".repeat(78)}\n${title}\n${"═".repeat(78)}`);
}

async function call(path: string, init: { method: "GET" | "POST"; query?: Record<string, string>; body?: unknown }) {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: init.method,
    headers: { "X-API-Key": KEY!, "Content-Type": "application/json", accept: "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

async function main() {
  const explicitHotelId = process.argv[2];

  // ── 1. Znajdź hotel do sondowania ────────────────────────────────────────
  let hotelId = explicitHotelId;
  if (!hotelId) {
    section("1. GET /data/hotels — pula hoteli (Málaga, ES)");
    const list = await call("/data/hotels", {
      method: "GET",
      query: { countryCode: "ES", cityName: "Malaga", limit: "5" },
    });
    console.log("Klucze top-level:", shape(list));
    const data = list.data as Record<string, unknown>[] | undefined;
    if (!data?.length) throw new Error("Pusta lista hoteli — zmień miasto.");
    console.log("\nPOLA POJEDYNCZEGO HOTELU NA LIŚCIE (surowe, bez Zod):");
    for (const [k, v] of Object.entries(data[0])) console.log(`  ${k.padEnd(28)} = ${shape(v)}`);
    hotelId = String(data[0].id);
  }
  console.log(`\n→ Sondowany hotel: ${hotelId}`);

  // ── 2. Szczegóły hotelu ──────────────────────────────────────────────────
  section(`2. GET /data/hotel?hotelId=${hotelId}&language=pl — SUROWE pola`);
  const detailRes = await call("/data/hotel", { method: "GET", query: { hotelId: hotelId!, language: "pl" } });
  const detail = (detailRes.data ?? detailRes) as Record<string, unknown>;
  console.log("WSZYSTKIE pola zwrócone przez dostawcę:");
  for (const [k, v] of Object.entries(detail)) console.log(`  ${k.padEnd(28)} = ${shape(v)}`);

  // Najważniejsze pytanie audytu: czy są POKOJE ze zdjęciami?
  section("2a. Czy /data/hotel zwraca POKOJE (nazwy, zdjęcia, łóżka)?");
  const rooms = detail.rooms as Record<string, unknown>[] | null | undefined;
  if (!Array.isArray(rooms) || rooms.length === 0) {
    console.log(`  ❌ BRAK pokoi — pole \`rooms\` = ${shape(rooms)}`);
  } else {
    console.log(`  ✅ ${rooms.length} pokoi. Pola pierwszego pokoju:`);
    for (const [k, v] of Object.entries(rooms[0])) console.log(`     ${k.padEnd(25)} = ${shape(v)}`);
    const withPhotos = rooms.filter((r) => Array.isArray(r.photos) && (r.photos as unknown[]).length > 0);
    console.log(`\n  Pokoje ze zdjęciami: ${withPhotos.length}/${rooms.length}`);
    if (withPhotos.length) {
      console.log("  Kształt pojedynczego zdjęcia pokoju:", shape((withPhotos[0].photos as unknown[])[0]));
    }
  }

  section("2b. Recenzje, oceny, sentyment");
  for (const key of ["reviewCount", "rating", "starRating", "stars", "sentiment_analysis", "sentimentAnalysis", "reviews"]) {
    if (key in detail) console.log(`  ${key.padEnd(28)} = ${shape(detail[key])}`);
  }

  // ── 3. Dedykowany endpoint recenzji ──────────────────────────────────────
  section(`3. GET /data/reviews?hotelId=${hotelId} — pojedyncze opinie`);
  try {
    const rev = await call("/data/reviews", {
      method: "GET",
      query: { hotelId: hotelId!, limit: "3", timeout: "5", getSentiment: "true" },
    });
    console.log("Klucze top-level:", shape(rev));
    const rdata = rev.data as Record<string, unknown>[] | undefined;
    if (rdata?.length) {
      console.log("\nPOLA POJEDYNCZEJ OPINII:");
      for (const [k, v] of Object.entries(rdata[0])) console.log(`  ${k.padEnd(28)} = ${shape(v)}`);
    } else {
      console.log("  Brak opinii w odpowiedzi:", shape(rev));
    }
    if (rev.sentimentAnalysis || rev.sentiment_analysis) {
      console.log("\nSENTYMENT (kategorie ocen):", shape(rev.sentimentAnalysis ?? rev.sentiment_analysis));
    }
  } catch (err) {
    console.log("  ❌", (err as Error).message);
  }

  // ── 4. Stawki — cena, podatki, cena referencyjna ─────────────────────────
  const checkin = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
  const checkout = new Date(Date.now() + 24 * 864e5).toISOString().slice(0, 10);
  section(`4. POST /hotels/rates (${checkin} → ${checkout}, 2 dorosłych, 3 noce)`);
  const rates = await call("/hotels/rates", {
    method: "POST",
    body: {
      hotelIds: [hotelId],
      checkin,
      checkout,
      occupancies: [{ adults: 2 }],
      currency: "PLN",
      guestNationality: "PL",
      timeout: 15,
    },
  });
  const rdata = (rates.data as Record<string, unknown>[] | undefined) ?? [];
  if (!rdata.length) {
    console.log("  Brak stawek (wyprzedane lub zbyt bliski termin). Odpowiedź:", shape(rates));
  } else {
    const hotel = rdata[0];
    console.log("Pola hotelu w odpowiedzi rates:", shape(hotel));
    const roomTypes = (hotel.roomTypes as Record<string, unknown>[] | undefined) ?? [];
    console.log(`\nroomTypes: ${roomTypes.length}`);
    if (roomTypes.length) {
      console.log("\nPOLA roomType (surowe):");
      for (const [k, v] of Object.entries(roomTypes[0])) console.log(`  ${k.padEnd(28)} = ${shape(v)}`);

      const rate = ((roomTypes[0].rates as Record<string, unknown>[]) ?? [])[0];
      if (rate) {
        console.log("\nPOLA rate (surowe) — to jest kontrakt taryfy:");
        for (const [k, v] of Object.entries(rate)) console.log(`  ${k.padEnd(28)} = ${shape(v)}`);

        section("4a. CENA — czy istnieje wiarygodna cena referencyjna do przeceny?");
        const retail = rate.retailRate as Record<string, unknown> | undefined;
        if (!retail) {
          console.log("  ❌ brak retailRate");
        } else {
          for (const [k, v] of Object.entries(retail)) {
            console.log(`  retailRate.${k.padEnd(24)} = ${JSON.stringify(v)}`);
          }
          const has = (k: string) => (k in retail ? "✅ JEST" : "❌ BRAK");
          console.log(`\n  total ................. ${has("total")}`);
          console.log(`  suggestedSellingPrice . ${has("suggestedSellingPrice")}  ← potencjalna cena referencyjna`);
          console.log(`  initialPrice .......... ${has("initialPrice")}`);
          console.log(`  taxesAndFees .......... ${has("taxesAndFees")}   ← rozbicie podatków i opłat`);
        }

        section("4b. ANULACJA i WYŻYWIENIE");
        console.log("  boardType    =", shape(rate.boardType));
        console.log("  boardName    =", shape(rate.boardName));
        console.log("  refundableTag=", shape(rate.refundableTag));
        console.log("  cancellationPolicies =", JSON.stringify(rate.cancellationPolicies)?.slice(0, 600));
      }

      section("4c. Czy taryfy dają się POWIĄZAĆ z pokojami z /data/hotel?");
      const roomIdsFromRates = new Set(
        roomTypes.flatMap((rt) => {
          const keys = Object.keys(rt).filter((k) => /room.*id/i.test(k));
          return keys.map((k) => `${k}=${String(rt[k])}`);
        }),
      );
      console.log("  Pola *roomId* w roomTypes:", roomIdsFromRates.size ? [...roomIdsFromRates].slice(0, 8) : "❌ ŻADNE");
      if (Array.isArray(rooms) && rooms.length) {
        console.log("  Pola id w /data/hotel rooms[0]:", Object.keys(rooms[0]).filter((k) => /id/i.test(k)));
      }
    }
  }

  section("KONIEC SONDY");
}

main().catch((err) => {
  console.error("\n❌ Sonda przerwana:", err instanceof Error ? err.message : err);
  process.exit(1);
});
