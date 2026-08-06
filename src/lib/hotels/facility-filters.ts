// Grupy `facilityId` dla filtrów udogodnień na liście wyników.
//
// Dlaczego GRUPY, a nie pojedyncze ID: u dostawcy jedno pojęcie ma po kilka
// identyfikatorów („Basen wewnętrzny", „Basen na zewnątrz", „Basen na dachu",
// „Basen sezonowy"), a gość klikający „Basen" chce po prostu basen.
// Filtr: alternatywa WEWNĄTRZ grupy, koniunkcja MIĘDZY grupami.
//
// ID są WYSELEKCJONOWANE RĘCZNIE ze słownika `/data/facilities` (814 pozycji)
// i sprawdzone jeden po drugim — automatyczne dopasowanie po nazwie wciągało
// szum, który wypaczyłby filtr:
//   • „Zabawki do basenu" (169) to NIE basen,
//   • „Koszyk dla zwierząt" (217) to NIE „zwierzęta dozwolone",
//   • „Szatnie fitness/spa" (257) to NIE siłownia,
//   • „Liczba restauracji -" (596) to metadana, nie udogodnienie,
//   • „Korzystanie z pobliskiego centrum fitness" (537) to obiekt POZA hotelem.
//
// Nazwy pozycji sprawdzisz przez `data/liteapi-reference.json` → `facilitiesPl`.
// Regeneracja słownika: `pnpm build:liteapi-reference`.

export interface FacilityFilter {
  key: string;
  label: string;
  /** Alternatywa — wystarczy JEDNO z tych ID. */
  ids: number[];
}

export const FACILITY_FILTERS: FacilityFilter[] = [
  { key: "wifi", label: "Wi-Fi", ids: [47, 107, 164, 512, 558, 584] },
  { key: "parking", label: "Parking", ids: [2, 46, 52, 161] },
  { key: "pool", label: "Basen", ids: [103, 104, 120, 122, 192] },
  { key: "gym", label: "Centrum fitness", ids: [11, 255, 492] },
  { key: "spa", label: "Spa i sauna", ids: [10, 54, 236, 241, 244] },
  { key: "restaurant", label: "Restauracja", ids: [3, 115, 116] },
  { key: "ac", label: "Klimatyzacja", ids: [109] },
  { key: "breakfast", label: "Śniadanie", ids: [24, 43, 519, 529, 729] },
  { key: "family", label: "Pokoje rodzinne", ids: [28] },
  { key: "pets", label: "Zwierzęta dozwolone", ids: [4] },
  { key: "accessible", label: "Dostępne dla osób z niepełnosprawnością", ids: [25, 185, 588, 589] },
  { key: "beach", label: "Przy plaży", ids: [114, 302, 547] },
];

const BY_KEY = new Map(FACILITY_FILTERS.map((f) => [f.key, f]));

/** Klucze filtrów → grupy ID do `applyFiltersAndSort`. Nieznane klucze pomijamy. */
export function facilityGroupsFor(keys: string[]): number[][] {
  return keys.map((k) => BY_KEY.get(k)?.ids).filter((ids): ids is number[] => Array.isArray(ids));
}

/**
 * Które filtry mają sens dla BIEŻĄCEJ puli wyników.
 *
 * Brief §9: „Nie pokazuj filtrów, których backend lub bieżące wyniki nie są
 * w stanie obsłużyć". Filtr „Basen", który po kliknięciu daje zero wyników,
 * jest gorszy niż jego brak — więc pokazujemy tylko te, które coś znajdą,
 * i od razu z liczbą trafień.
 */
export function availableFacilityFilters(
  offers: { facilityIds?: number[] }[],
): { filter: FacilityFilter; count: number }[] {
  const present = new Set<number>();
  for (const o of offers) for (const id of o.facilityIds ?? []) present.add(id);

  return FACILITY_FILTERS.map((filter) => {
    if (!filter.ids.some((id) => present.has(id))) return null;
    const count = offers.filter((o) => {
      const has = o.facilityIds;
      return Array.isArray(has) && filter.ids.some((id) => has.includes(id));
    }).length;
    return count > 0 ? { filter, count } : null;
  }).filter((x): x is { filter: FacilityFilter; count: number } => x !== null);
}

/**
 * Wartości pola `chain`, które NIE są marką.
 *
 * Dostawca wpisuje tu też etykiety oznaczające brak przynależności —
 * zmierzone na żywo (Barcelona: „Not Available" 122 obiekty, „Independent" 7).
 * Filtr „Independent" byłby bez sensu: to nie jest sieć, tylko jej brak.
 */
const NON_BRANDS = new Set(["not available", "independent", "n/a", "none", "other"]);

/**
 * Sieci hotelowe obecne w puli, posortowane po liczbie obiektów.
 */
export function availableChains(
  offers: { chain?: string }[],
  max = 12,
): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const o of offers) {
    const name = o.chain?.trim();
    if (!name || NON_BRANDS.has(name.toLowerCase())) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    // Marka z jednym obiektem nie jest filtrem, tylko tym samym hotelem
    // pokazanym dwa razy — odsiewamy.
    .filter((c) => c.count > 1)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pl"))
    .slice(0, max);
}
