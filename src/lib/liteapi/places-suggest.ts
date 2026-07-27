// Globalne podpowiedzi kierunków przez LiteAPI /data/places (Google Places
// pod spodem).
//
// PO CO TO ISTNIEJE
// Autouzupełnianie „Dokąd" jechało wyłącznie na statycznym seedzie
// `data/destinations.index.json`. Zmierzone 2026-07-26:
//   • seed ma 796 kierunków w 37 krajach — samą Europę + basen Morza
//     Śródziemnego. Zero Tajlandii, Wietnamu, Meksyku, Malediwów, USA…
//   • dla samej Hiszpanii LiteAPI zna 8999 miast, seed 32.
// Użytkownik nie miał więc dostępu do większości oferty dostawcy — dokładnie
// tak, jak zgłosił właściciel („wpisze się tajlandia i nic nie wyskakuje").
//
// Fuzzy po seedzie nie tylko NIE znajdowało tych kierunków, ale podawało
// zamiast nich śmieci z pełnym przekonaniem: „Tajlandia" → Amsterdam,
// Rotterdam, Haga; „Bangkok" → Bansko; „Monastyr" → Altmünster.
//
// DLACZEGO /data/places, A NIE WIĘKSZY PLIK
// Sonda na żywo (2026-07-26) — jeden endpoint załatwia cztery wymagania naraz:
//   • pokrycie globalne: Tajlandia, Phuket, Wietnam, Malediwy, Meksyk — są;
//   • język polski: zapytanie po polsku wraca z polską nazwą („Tajlandia",
//     „Warna", „Monastyr") — co przy okazji omija błędne nazwy z Wikidaty
//     zapisane w seedzie („Vahrn" zamiast Warny, „Bitola" zamiast Monastyru);
//   • literówki: „Barcelna"→Barcelona, „Zakintos"→Zakynthos,
//     „Hurgada"→Hurghada, „Stambul"→Istanbul;
//   • uczciwa pustka: „qwertyuiop" → 0 wyników, zero zgadywania.
// Czas 150–520 ms, a odpowiedzi cache'uje Next Data Cache na 24 h.
// Regeneracja seeda dawałaby ułamek tego i kosztuje 45–90 min (patrz nagłówek
// scripts/build-destinations-seed.ts), a skrypt NADPISUJE plik wyjściowy.

import { z } from "zod";

import { liteApiRequest } from "./client";

const PlacesResponseSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            placeId: z.string(),
            displayName: z.string().optional(),
            formattedAddress: z.string().optional(),
            types: z.array(z.string()).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export interface PlaceSuggestion {
  placeId: string;
  /** Nazwa do pokazania — w języku zapytania (dla polskich zapytań: polska). */
  name: string;
  /** „Thailand" dla Bangkoku; pusty string dla samego kraju. */
  countryLabel: string;
  kind: "country" | "region" | "city";
}

/** Typy Google Places, które są realnym KIERUNKIEM podróży. */
const CITY_TYPES = new Set(["locality", "postal_town", "sublocality"]);
const REGION_TYPES = new Set([
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "natural_feature",
  "island",
  "archipelago",
]);
/**
 * Typy dyskwalifikujące. Bez tego filtra lista wygląda jak wyniki Map, a nie
 * wyszukiwarka wyjazdów: zapytanie „Bangkok" zwracało „The Bangkok Lounge"
 * (bar w Charleston) i „Bangkok Nail Spa LLC", a „Wietnam" — kościół baptystów.
 * Lotniska też odpadają: użytkownik wybiera MIASTO, kod IATA dokłada formularz.
 */
const REJECT_TYPES = [
  "establishment",
  "point_of_interest",
  "airport",
  "lodging",
  "hotel",
  "restaurant",
  "store",
  "route",
  "street_address",
  "premise",
];

/**
 * Czysta klasyfikacja miejsca — bez I/O, więc testowalna.
 * `null` = to nie jest kierunek podróży i nie ma prawa trafić na listę.
 */
export function classifyPlace(place: {
  placeId: string;
  displayName?: string;
  formattedAddress?: string;
  types?: string[];
}): PlaceSuggestion | null {
  const name = place.displayName?.trim();
  if (!name) return null;
  const types = place.types ?? [];

  // Odrzucamy PO typach negatywnych, ale dopiero gdy miejsce nie jest przy
  // okazji miejscowością — Google potrafi otagować miasto jednocześnie jako
  // `locality` i `establishment`.
  const isCity = types.some((t) => CITY_TYPES.has(t));
  const isRegion = types.some((t) => REGION_TYPES.has(t));
  const isCountry = types.includes("country");
  if (!isCity && !isRegion && !isCountry) return null;
  if (!isCity && !isCountry && types.some((t) => REJECT_TYPES.some((r) => t.includes(r)))) return null;
  if (types.some((t) => t.includes("airport"))) return null;

  return {
    placeId: place.placeId,
    name,
    countryLabel: place.formattedAddress?.trim() ?? "",
    kind: isCountry ? "country" : isCity ? "city" : "region",
  };
}

/** Kolejność: miasta, potem regiony/wyspy, na końcu całe kraje. */
const KIND_ORDER: Record<PlaceSuggestion["kind"], number> = { city: 0, region: 1, country: 2 };

/** Czysta część potoku: klasyfikacja + dedupe + sortowanie. Testowalna. */
export function toPlaceSuggestions(
  raw: ReadonlyArray<{ placeId: string; displayName?: string; formattedAddress?: string; types?: string[] }>,
  limit: number,
): PlaceSuggestion[] {
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const item of raw) {
    const s = classifyPlace(item);
    if (!s) continue;
    // Google zwraca ten sam kierunek kilka razy z różnymi typami
    // (np. Phuket jako `locality` i jako `administrative_area_level_1`).
    const key = `${s.name.toLowerCase()}|${s.countryLabel.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).slice(0, limit);
}

/**
 * Globalne podpowiedzi. NIGDY nie rzuca — autouzupełnianie działa dalej na
 * seedzie, gdy LiteAPI jest niedostępne (ta sama zasada „degrade, nie wywalaj",
 * co przy Redisie).
 */
export async function suggestPlaces(query: string, limit = 6): Promise<PlaceSuggestion[]> {
  const textQuery = query.trim();
  if (textQuery.length < 3) return [];
  try {
    const res = await liteApiRequest({
      path: "/data/places",
      method: "GET",
      keyMode: "public",
      schema: PlacesResponseSchema,
      query: { textQuery },
      // 24 h: zbiór miejsc na świecie nie zmienia się w skali doby, a każde
      // powtórzone zapytanie („Tajlandia" wpisuje wielu) schodzi wtedy do zera
      // kosztu i ~0 ms.
      nextCache: { revalidate: 86_400, tags: ["liteapi", "liteapi-places"] },
    });
    return toPlaceSuggestions(res.data ?? [], limit);
  } catch {
    return [];
  }
}
