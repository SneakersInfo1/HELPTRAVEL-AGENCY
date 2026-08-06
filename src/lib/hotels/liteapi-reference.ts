// Słowniki referencyjne LiteAPI (facilityId → nazwa PL, hotelTypeId → typ).
//
// Dane pochodzą z `/data/facilities` i `/data/hotelTypes`, są COMMITOWANE
// w `data/liteapi-reference.json` (jak seed kierunków), więc zimny start nie
// woła sieci. Regeneracja: `pnpm build:liteapi-reference`.
//
// Dlaczego to ma znaczenie: **814 z 814 udogodnień ma polskie tłumaczenie
// od dostawcy**. Do tej pory utrzymywaliśmy własny słownik w `facilities.ts`,
// który z natury pokrywał tylko część zbioru — reszta zostawała po angielsku.
//
// UWAGA na rozmiar: plik waży ~37 kB. Importuj go WYŁĄCZNIE po stronie
// serwera (komponenty RSC, route handlery). Wciągnięcie go do komponentu
// klienckiego dołożyłoby te 37 kB do paczki przeglądarki bez potrzeby —
// dlatego `normalizeAmenities` przyjmuje resolver jako argument, zamiast
// importować ten moduł u siebie.

import reference from "../../../data/liteapi-reference.json";

const FACILITIES: Record<string, string> = reference.facilitiesPl;
const HOTEL_TYPES: Record<string, string> = reference.hotelTypes;

/** Data wygenerowania słowników — do diagnostyki „czy dane są świeże". */
export const REFERENCE_GENERATED_AT: string = reference.generatedAt;

/**
 * Polska nazwa udogodnienia po `facilityId`.
 * `null`, gdy ID nieznane — wtedy wołający zostaje przy tekście od dostawcy.
 */
export function facilityLabelPl(facilityId: number | null | undefined): string | null {
  if (typeof facilityId !== "number") return null;
  return FACILITIES[String(facilityId)] ?? null;
}

/** Polskie nazwy typów obiektów. Słownik dostawcy jest angielski. */
const TYPE_PL: Record<string, string> = {
  Hotels: "Hotel",
  Apartments: "Apartament",
  Hostels: "Hostel",
  Motels: "Motel",
  Resorts: "Resort",
  Villas: "Willa",
  "Guest houses": "Pensjonat",
  "Bed and breakfasts": "Pensjonat ze śniadaniem",
  Aparthotels: "Aparthotel",
  Campings: "Kemping",
  Chalets: "Domek",
  Lodges: "Lodge",
  "Holiday homes": "Dom wakacyjny",
  Ryokans: "Ryokan",
  Riads: "Riad",
};

/**
 * Typ obiektu po `hotelTypeId` — po polsku, gdy znamy tłumaczenie.
 *
 * To zastępuje ZGADYWANIE z nazwy hotelu (`inferPropertyType` w
 * `filters-logic.ts` sprawdzał, czy nazwa „zawiera 'hostel'"). Dostawca podaje
 * `hotelTypeId` przy każdym hotelu na liście — nie było potrzeby zgadywać.
 *
 * `null` dla id `0` („Not Available") i dla nieznanych — brak danych ma
 * zostać brakiem, a nie domyślnym „Hotel".
 */
export function hotelTypeLabelPl(hotelTypeId: number | null | undefined): string | null {
  if (typeof hotelTypeId !== "number" || hotelTypeId === 0) return null;
  const en = HOTEL_TYPES[String(hotelTypeId)];
  if (!en || en === "Not Available") return null;
  return TYPE_PL[en] ?? en;
}
