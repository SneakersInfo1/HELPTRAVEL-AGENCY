// Empiryczna sonda ROZJAZDU DOSTĘPNOŚCI między listą wyników a stroną hotelu.
//
// Po co: zgłoszenie właściciela (2026-08-08) — „część ofert widnieje na liście
// jako dostępna, a po wejściu w hotel nie ma żadnego pokoju". Lista i strona
// hotelu pytają LiteAPI o stawki INNYM zapytaniem:
//
//   lista  → POST /hotels/rates  { maxRatesPerHotel: 1 }          (+ cache Redis 60 min)
//   hotel  → POST /hotels/rates  { roomMapping: true }            (bez cache Redis)
//
// Ta sonda sprawdza, czy różnica w parametrach SAMA W SOBIE zmienia zbiór
// hoteli z dostępnością — czyli czy przyczyna jest w kodzie, czy wyłącznie
// w czasie (stale cache).
//
// Uruchomienie:
//   pnpm probe:availability-drift
//   pnpm probe:availability-drift Rhodes GR 2026-09-15 2026-09-17 2 1
//
// READ-ONLY: tylko GET /data/hotels i POST /hotels/rates. Nie tworzy rezerwacji.

// `export {}` robi z pliku MODUŁ. Bez tego TypeScript traktuje skrypty w
// `scripts/` jako jeden wspólny zakres globalny i `API_BASE` z sąsiedniego
// `probe-hotel-contract.ts` koliduje z tutejszym (`tsc --noEmit` sypie
// „Cannot redeclare block-scoped variable"). Uruchomienie przez tsx działało
// mimo to, więc błąd byłby widoczny dopiero przy sprawdzaniu typów.
export {};

const API_BASE = (process.env.LITEAPI_BASE_URL?.trim() || "https://api.liteapi.travel/v3.0").replace(/\/+$/, "");
const KEY = process.env.LITEAPI_PROD_PRIVATE_KEY?.trim() || process.env.LITEAPI_API_KEY?.trim();

if (!KEY) {
  console.error("Brak klucza LiteAPI (LITEAPI_PROD_PRIVATE_KEY). Uruchom przez `pnpm probe:availability-drift`.");
  process.exit(1);
}

const CITY = process.argv[2] ?? "Rhodes";
const COUNTRY = process.argv[3] ?? "GR";
const CHECKIN = process.argv[4] ?? isoInDays(38);
const CHECKOUT = process.argv[5] ?? isoInDays(40);
const ADULTS = Number(process.argv[6] ?? 2);
const ROOMS = Number(process.argv[7] ?? 1);

function isoInDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function section(title: string) {
  console.log(`\n${"═".repeat(78)}\n${title}\n${"═".repeat(78)}`);
}

async function call(path: string, init: { method: "GET" | "POST"; query?: Record<string, string>; body?: unknown }) {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  const started = Date.now();
  const res = await fetch(url, {
    method: init.method,
    headers: { "X-API-Key": KEY!, "Content-Type": "application/json", accept: "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const ms = Date.now() - started;
  if (!res.ok) throw new Error(`${init.method} ${path} → ${res.status} (${ms} ms): ${text.slice(0, 300)}`);
  return { json: JSON.parse(text) as Record<string, unknown>, ms, bytes: text.length };
}

interface RateHotel {
  hotelId: string;
  roomTypes?: Array<{ rates?: Array<{ retailRate?: { total?: Array<{ amount?: number }> } }> }>;
}

/** Zbiór hotelId, dla których wariant zwrócił CHOĆ JEDNĄ taryfę + najniższa cena. */
function availability(data: RateHotel[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const h of data) {
    const amounts: number[] = [];
    for (const rt of h.roomTypes ?? []) {
      for (const r of rt.rates ?? []) {
        const a = r.retailRate?.total?.[0]?.amount;
        if (typeof a === "number") amounts.push(a);
      }
    }
    if ((h.roomTypes ?? []).length === 0) continue;
    out.set(h.hotelId, amounts.length ? Math.min(...amounts) : null);
  }
  return out;
}

async function rates(hotelIds: string[], extra: Record<string, unknown>, label: string) {
  const body = {
    hotelIds,
    occupancies: Array.from({ length: ROOMS }, () => ({ adults: ADULTS, children: [] as number[] })),
    checkin: CHECKIN,
    checkout: CHECKOUT,
    currency: "PLN",
    guestNationality: "PL",
    limit: hotelIds.length,
    ...extra,
  };
  const { json, ms, bytes } = await call("/hotels/rates", { method: "POST", body });
  const data = (json.data ?? []) as RateHotel[];
  const avail = availability(data);
  console.log(
    `  ${label.padEnd(28)} → ${String(avail.size).padStart(3)}/${hotelIds.length} z dostępnością · ${ms} ms · ${(bytes / 1024).toFixed(0)} kB`,
  );
  return avail;
}

async function main() {
  section(`Rozjazd dostępności — ${CITY} (${COUNTRY}) · ${CHECKIN} → ${CHECKOUT} · ${ADULTS} os. / ${ROOMS} pok.`);

  const { json: list } = await call("/data/hotels", {
    method: "GET",
    query: { countryCode: COUNTRY, cityName: CITY, limit: "50" },
  });
  const hotels = (list.data ?? []) as Array<{ id: string; name: string }>;
  if (hotels.length === 0) {
    console.error("Zero hoteli w puli — zmień miasto/kraj.");
    process.exit(1);
  }
  const ids = hotels.map((h) => h.id);
  const nameById = new Map(hotels.map((h) => [h.id, h.name] as const));
  console.log(`Pula metadanych: ${ids.length} hoteli\n`);

  // ── Trzy warianty zapytania ────────────────────────────────────────────
  const lista = await rates(ids, { maxRatesPerHotel: 1 }, "A: lista (maxRates=1)");
  const goly = await rates(ids, {}, "B: bez dodatków");
  const hotel = await rates(ids, { roomMapping: true }, "C: hotel (roomMapping)");
  // Powtórka wariantu A — ile z rozjazdu to zwykła zmienność dostawcy w czasie.
  const listaPowtorka = await rates(ids, { maxRatesPerHotel: 1 }, "A': lista (powtórka)");

  section("Hotele DOSTĘPNE na liście, a BEZ POKOI na stronie hotelu (A \\ C)");
  const dryf = [...lista.keys()].filter((id) => !hotel.has(id));
  if (dryf.length === 0) {
    console.log("  (żadnego — parametry zapytania nie zmieniają zbioru dostępnych)");
  } else {
    for (const id of dryf) console.log(`  ✗ ${id.padEnd(14)} ${nameById.get(id) ?? ""}`);
  }
  console.log(`\n  RAZEM: ${dryf.length}/${lista.size} (${((dryf.length / Math.max(1, lista.size)) * 100).toFixed(1)}%)`);

  section("Kontrola: A \\ A' — sama zmienność dostawcy między dwoma identycznymi callami");
  const szum = [...lista.keys()].filter((id) => !listaPowtorka.has(id));
  console.log(`  ${szum.length}/${lista.size} hoteli zniknęło między identycznymi zapytaniami`);
  if (szum.length) for (const id of szum.slice(0, 10)) console.log(`    ~ ${id} ${nameById.get(id) ?? ""}`);

  section("Kontrola: A \\ B — czy `maxRatesPerHotel:1` sam w sobie coś zmienia");
  const bezDodatkow = [...lista.keys()].filter((id) => !goly.has(id));
  console.log(`  ${bezDodatkow.length}/${lista.size} hoteli jest w A, a nie ma w B`);

  section("Kontrola: B \\ C — czy `roomMapping:true` wycina hotele");
  const przezMapping = [...goly.keys()].filter((id) => !hotel.has(id));
  console.log(`  ${przezMapping.length}/${goly.size} hoteli jest w B, a nie ma w C`);
  if (przezMapping.length) for (const id of przezMapping.slice(0, 10)) console.log(`    ✗ ${id} ${nameById.get(id) ?? ""}`);

  section("Wniosek");
  if (przezMapping.length > 0) {
    console.log("  roomMapping:true ZMIENIA zbiór dostępnych hoteli → przyczyna w kodzie strony hotelu.");
  } else if (dryf.length > szum.length) {
    console.log("  Rozjazd większy niż szum dostawcy → parametry zapytania mają udział.");
  } else if (dryf.length > 0) {
    console.log("  Rozjazd ≈ szum dostawcy → przyczyną jest CZAS (stale cache + zmienna dostępność), nie parametry.");
  } else {
    console.log("  Brak rozjazdu w tym przebiegu.");
  }
}

main().catch((e) => {
  console.error("\nSonda przerwana:", e instanceof Error ? e.message : e);
  process.exit(1);
});
