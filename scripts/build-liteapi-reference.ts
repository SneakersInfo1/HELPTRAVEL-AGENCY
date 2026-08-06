// Generator słowników referencyjnych LiteAPI → `data/liteapi-reference.json`.
//
// Po co: dwa miejsca w kodzie ZGADYWAŁY dane, które dostawca podaje wprost.
//
//   1. `filters-logic.ts → inferPropertyType()` wnioskował typ obiektu
//      z NAZWY hotelu („zawiera 'hostel' → hostel"), z komentarzem
//      „LiteAPI's list endpoint doesn't return propertyType". Zwraca:
//      `/data/hotels` oddaje `hotelTypeId`, a `/data/hotelTypes` to słownik
//      52 typów.
//   2. Polskie nazwy udogodnień utrzymywaliśmy ręcznie w `facilities.ts`,
//      podczas gdy `/data/facilities` zwraca 814 pozycji z gotowymi
//      tłumaczeniami (`translation[{ lang, facility }]`).
//
// Plik wynikowy jest COMMITOWANY (jak `data/destinations.json`), żeby zimny
// start nie wołał sieci i żeby build był powtarzalny.
//
// Uruchomienie:  pnpm build:liteapi-reference

import { promises as fs } from "node:fs";
import path from "node:path";

const BASE = (process.env.LITEAPI_BASE_URL?.trim() || "https://api.liteapi.travel/v3.0").replace(/\/+$/, "");
const KEY = process.env.LITEAPI_PROD_PRIVATE_KEY?.trim() || process.env.LITEAPI_API_KEY?.trim();
const OUT = path.resolve(process.cwd(), "data", "liteapi-reference.json");

if (!KEY) {
  console.error("Brak klucza LiteAPI (LITEAPI_PROD_PRIVATE_KEY).");
  process.exit(1);
}

interface FacilityRow {
  facility_id?: number;
  facility?: string;
  translation?: { lang?: string; facility?: string }[];
}
interface NamedRow {
  id?: number;
  name?: string;
}

async function get<T>(pathname: string): Promise<T[]> {
  const res = await fetch(BASE + pathname, { headers: { "X-API-Key": KEY! } });
  if (!res.ok) throw new Error(`${pathname} → ${res.status}`);
  const json = (await res.json()) as { data?: T[] };
  return json.data ?? [];
}

/** Polska nazwa udogodnienia; fallback na angielską — nigdy pusty wpis. */
function polishFacility(row: FacilityRow): string | null {
  const pl = row.translation?.find((t) => (t.lang ?? "").toLowerCase() === "pl")?.facility?.trim();
  return pl || row.facility?.trim() || null;
}

async function main() {
  console.log("Pobieram słowniki referencyjne LiteAPI…");

  const [facilities, hotelTypes] = await Promise.all([
    get<FacilityRow>("/data/facilities"),
    get<NamedRow>("/data/hotelTypes"),
  ]);

  const facilitiesPl: Record<string, string> = {};
  let withPl = 0;
  for (const row of facilities) {
    if (typeof row.facility_id !== "number") continue;
    const label = polishFacility(row);
    if (!label) continue;
    facilitiesPl[String(row.facility_id)] = label;
    if (row.translation?.some((t) => (t.lang ?? "").toLowerCase() === "pl")) withPl++;
  }

  const types: Record<string, string> = {};
  for (const row of hotelTypes) {
    if (typeof row.id !== "number" || !row.name?.trim()) continue;
    types[String(row.id)] = row.name.trim();
  }

  // `chains` celowo POMIJAMY: 4821 pozycji, a do filtra marki wystarczy nazwa,
  // którą `/data/hotels` zwraca przy każdym hotelu (`chain`). Wożenie słownika
  // 4821 rekordów tylko po to, by odtworzyć string, który już mamy, byłoby
  // marnotrawstwem paczki.

  const out = {
    generatedAt: new Date().toISOString().slice(0, 10),
    source: "LiteAPI /data/facilities + /data/hotelTypes",
    facilitiesPl,
    hotelTypes: types,
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, `${JSON.stringify(out, null, 2)}\n`, "utf8");

  console.log(`Udogodnienia: ${Object.keys(facilitiesPl).length} (z polskim tłumaczeniem: ${withPl})`);
  console.log(`Typy obiektów: ${Object.keys(types).length}`);
  console.log(`Zapisano → ${OUT}`);
}

main().catch((err) => {
  console.error("Generator przerwany:", err instanceof Error ? err.message : err);
  process.exit(1);
});
