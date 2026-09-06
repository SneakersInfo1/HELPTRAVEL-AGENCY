// Przypadki benchmarku NARZĘDZI konsjerża (V2.1 §26) — bez modelu, bez kosztu
// LLM. Mierzymy dokładnie to, co robi tura z narzędziem: wyszukanie kandydatów
// ze snapshotu + żywą ofertę (hotel + lot) z LiteAPI.
//
// PO CO OSOBNY ZESTAW: pomiar produkcyjny z 23 tur mieszał czas modelu i
// narzędzi, a jego przypadki brały się z tego, co akurat napisali użytkownicy.
// Tu zestaw jest STAŁY i pokrywa świadomie dobrane wymiary z audytu:
//   • okno GRZANE przez cron vs okno, którego nikt nie grzeje (cache hit/miss),
//   • kierunek z ciepłą trasą lotniczą vs kierunek bez prewarmingu,
//   • motyw vs konkretny kraj vs kraj + motyw naraz,
//   • różne długości pobytu (3 / 4 / 7 nocy) i różne lotniska wylotu,
//   • sam hotel, sam lot, oferta niepełna i kierunek bez żadnych danych.
//
// UWAGA: wszystko TYLKO DO ODCZYTU (wyszukiwanie). Zero prebooka, zero
// rezerwacji, zero płatności.

import { computeSnapshotDateWindows, computeWarmDateWindows } from "@/lib/hotels/warm-config";

export type BenchTool = "search_trips" | "get_trip_offer";

export interface BenchCase {
  id: string;
  tool: BenchTool;
  /** Krótki opis wymiaru, który ten przypadek bada (idzie do raportu). */
  what: string;
  /** Czy spodziewamy się CIEPŁEGO cache (okno/trasa grzana przez cron). */
  expectWarm: boolean;
  args: Record<string, unknown>;
}

/** Data +N dni od `now`, w ISO (yyyy-MM-dd), liczona w UTC. */
function isoPlusDays(now: Date, days: number): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days))
    .toISOString()
    .slice(0, 10);
}

/**
 * Zestaw przypadków dla podanego „teraz". Okna dat liczymy TYMI SAMYMI
 * funkcjami co cron (computeWarmDateWindows / computeSnapshotDateWindows) —
 * inaczej „ciepły" przypadek trafiałby obok grzanego klucza i pomiar
 * pokazywałby zimno tam, gdzie realny użytkownik ma ciepło.
 */
export function buildBenchCases(now: Date = new Date()): BenchCase[] {
  const warm = computeWarmDateWindows(now);
  const cheap = computeSnapshotDateWindows(now);
  const week = warm.find((w) => w.label === "tydzien-1")!;
  const weekend = warm.find((w) => w.label === "weekend-1")!;
  const cheapWeek = cheap.find((w) => w.label === "tani-tydzien")!;
  // Okno, którego NIE grzeje żaden cron: nieparzysta liczba dni w przód i
  // 5 nocy (cron zna tylko 2, 4 i 7 nocy).
  const coldCheckin = isoPlusDays(now, 33);
  const coldCheckout = isoPlusDays(now, 38);

  const cases: BenchCase[] = [];

  // ── search_trips: motyw (ścieżka „nie wiem dokąd") ────────────────────────
  for (const theme of ["plaza", "city-break", "kultura", "gory", "budzet", "slonce-zima"]) {
    cases.push({
      id: `search.theme.${theme}`,
      tool: "search_trips",
      what: `motyw ${theme}, budżet 3000/os., pełna auto-oferta`,
      expectWarm: true,
      args: { theme, budgetPln: 3000, budgetKind: "per_person", adults: 2, wantsFlight: true, wantsHotel: true },
    });
  }
  cases.push({
    id: "search.theme.no-budget",
    tool: "search_trips",
    what: "motyw bez budżetu (klient niekonkretny) — od najtańszego",
    expectWarm: true,
    args: { theme: "plaza", adults: 2, wantsFlight: true, wantsHotel: true },
  });
  cases.push({
    id: "search.theme.nights-3",
    tool: "search_trips",
    what: "motyw + 3 noce (weekend) — przeliczenie pakietu ze składowych",
    expectWarm: true,
    args: { theme: "city-break", budgetPln: 2500, budgetKind: "per_person", adults: 2, nights: 3, wantsFlight: true, wantsHotel: true },
  });
  cases.push({
    id: "search.theme.family",
    tool: "search_trips",
    what: "rodzina 2+2, budżet łączny 12000 — próg dzielony przez 4 osoby",
    expectWarm: false,
    args: { theme: "plaza", budgetPln: 12_000, budgetKind: "total_two", adults: 2, children: 2, wantsFlight: true, wantsHotel: true },
  });
  cases.push({
    id: "search.theme.tight-budget",
    tool: "search_trips",
    what: "budżet 800/os. — brak wyników jest POPRAWNYM wynikiem",
    expectWarm: true,
    args: { theme: "plaza", budgetPln: 800, budgetKind: "per_person", adults: 2, wantsFlight: true, wantsHotel: true },
  });

  // ── search_trips: konkretny kraj ──────────────────────────────────────────
  for (const country of ["Grecja", "Hiszpania", "Włochy", "Turcja", "Portugalia", "Cypr"]) {
    cases.push({
      id: `search.country.${country}`,
      tool: "search_trips",
      what: `kraj ${country} (ścieżka slice-przed-rankingiem)`,
      expectWarm: true,
      args: { country, budgetPln: 3000, budgetKind: "per_person", adults: 2, wantsFlight: true, wantsHotel: true },
    });
  }
  cases.push({
    id: "search.country.no-data",
    tool: "search_trips",
    what: "kraj bez grzanych kierunków (Norwegia) — kandydaci bez cen",
    expectWarm: false,
    args: { country: "Norwegia", budgetPln: 4000, budgetKind: "per_person", adults: 2, wantsFlight: true, wantsHotel: true },
  });
  cases.push({
    id: "search.country.unknown",
    tool: "search_trips",
    what: "kraj spoza seedu — czysta odmowa, zero I/O",
    expectWarm: false,
    args: { country: "Atlantyda", budgetPln: 4000, budgetKind: "per_person", adults: 2, wantsFlight: true, wantsHotel: true },
  });

  // ── search_trips: kraj + motyw naraz (§12 — country nie może wyprzeć theme) ─
  cases.push({
    id: "search.country+theme.greece-beach",
    tool: "search_trips",
    what: "Grecja + plaża — oba sygnały muszą przeżyć",
    expectWarm: true,
    args: { country: "Grecja", theme: "plaza", budgetPln: 3000, budgetKind: "per_person", adults: 2, wantsFlight: true, wantsHotel: true },
  });
  cases.push({
    id: "search.country+theme.spain-city",
    tool: "search_trips",
    what: "Hiszpania + city break — oba sygnały muszą przeżyć",
    expectWarm: true,
    args: { country: "Hiszpania", theme: "city-break", budgetPln: 3500, budgetKind: "per_person", adults: 2, wantsFlight: true, wantsHotel: true },
  });

  // ── get_trip_offer: okno GRZANE (oczekiwany cache hit) ────────────────────
  const warmDests: Array<{ city: string; country: string }> = [
    { city: "Barcelona", country: "Spain" },
    { city: "Malaga", country: "Spain" },
    { city: "Antalya", country: "Turkey" },
    { city: "Heraklion", country: "Greece" },
    { city: "Lisbon", country: "Portugal" },
    { city: "Rhodes", country: "Greece" },
  ];
  for (const d of warmDests) {
    cases.push({
      id: `offer.warm.${d.city}`,
      tool: "get_trip_offer",
      what: `${d.city}, okno tydzien-1 grzane przez cron, 2 dorosłych`,
      expectWarm: true,
      args: {
        cityEn: d.city, countryEn: d.country, origin: "WAW", adults: 2,
        checkin: week.checkin, checkout: week.checkout,
      },
    });
  }
  cases.push({
    id: "offer.warm.weekend",
    tool: "get_trip_offer",
    what: "Barcelona, okno weekend-1 (2 noce) grzane przez cron",
    expectWarm: true,
    args: { cityEn: "Barcelona", countryEn: "Spain", origin: "WAW", adults: 2, checkin: weekend.checkin, checkout: weekend.checkout },
  });
  cases.push({
    id: "offer.warm.cheap-window",
    tool: "get_trip_offer",
    what: "Ateny, tanie okno snapshotu (grzane tylko dla hoteli, lot zimny)",
    expectWarm: true,
    args: { cityEn: "Athens", countryEn: "Greece", origin: "WAW", adults: 2, checkin: cheapWeek.checkin, checkout: cheapWeek.checkout },
  });

  // ── get_trip_offer: ZIMNE (okno/trasa/occupancy poza prewarmingiem) ───────
  cases.push({
    id: "offer.cold.window",
    tool: "get_trip_offer",
    what: "Barcelona, okno +33 dni / 5 nocy — nikt tego nie grzeje",
    expectWarm: false,
    args: { cityEn: "Barcelona", countryEn: "Spain", origin: "WAW", adults: 2, checkin: coldCheckin, checkout: coldCheckout },
  });
  cases.push({
    id: "offer.cold.occupancy",
    tool: "get_trip_offer",
    what: "Barcelona, okno grzane ale 2+2 (inne occupancy = inny klucz cache)",
    expectWarm: false,
    args: { cityEn: "Barcelona", countryEn: "Spain", origin: "WAW", adults: 2, children: 2, checkin: week.checkin, checkout: week.checkout },
  });
  cases.push({
    id: "offer.cold.origin",
    tool: "get_trip_offer",
    what: "Wylot z Gdańska — trasa spoza prewarmingu lotów",
    expectWarm: false,
    args: { cityEn: "Malaga", countryEn: "Spain", origin: "GDN", adults: 2, checkin: week.checkin, checkout: week.checkout },
  });
  cases.push({
    id: "offer.cold.destination",
    tool: "get_trip_offer",
    what: "Sofia — kierunek spoza listy grzanych tras lotniczych",
    expectWarm: false,
    args: { cityEn: "Sofia", countryEn: "Bulgaria", origin: "WAW", adults: 2, checkin: week.checkin, checkout: week.checkout },
  });
  cases.push({
    id: "offer.cold.no-dates",
    tool: "get_trip_offer",
    what: "Bez dat — termin dobiera snapshot (dodatkowy odczyt Redis)",
    expectWarm: false,
    args: { cityEn: "Chania", countryEn: "Greece", origin: "WAW", adults: 2 },
  });
  cases.push({
    id: "offer.cold.month-only",
    tool: "get_trip_offer",
    what: "Sam miesiąc od użytkownika — daty liczone mechanicznie",
    expectWarm: false,
    args: { cityEn: "Larnaca", countryEn: "Cyprus", origin: "WAW", adults: 2, month: ((now.getUTCMonth() + 2) % 12) + 1, nights: 7 },
  });

  // ── get_trip_offer: kształty częściowe i brak danych (§16/§17) ────────────
  cases.push({
    id: "offer.hotel-only",
    tool: "get_trip_offer",
    what: "Sam hotel (wantsFlight=false) — zero wywołań lotów",
    expectWarm: true,
    args: { cityEn: "Barcelona", countryEn: "Spain", origin: "WAW", adults: 2, checkin: week.checkin, checkout: week.checkout, wantsFlight: false },
  });
  cases.push({
    id: "offer.flight-only",
    tool: "get_trip_offer",
    what: "Sam lot (wantsHotel=false) — zero wywołań hoteli",
    expectWarm: true,
    args: { cityEn: "Barcelona", countryEn: "Spain", origin: "WAW", adults: 2, checkin: week.checkin, checkout: week.checkout, wantsHotel: false },
  });
  cases.push({
    id: "offer.partial.no-airport",
    tool: "get_trip_offer",
    what: "Kierunek bez lotniska w seedzie → lot null, oczekiwany stan PARTIAL",
    expectWarm: false,
    args: { cityEn: "Sliema", countryEn: "Malta", origin: "WAW", adults: 2, checkin: week.checkin, checkout: week.checkout },
  });
  cases.push({
    id: "offer.unavailable.nonsense-city",
    tool: "get_trip_offer",
    what: "Miasto, którego nie ma → hotel i lot null, oczekiwany stan UNAVAILABLE",
    expectWarm: false,
    args: { cityEn: "Zzzyxvillecity", countryEn: "Poland", origin: "WAW", adults: 2, checkin: week.checkin, checkout: week.checkout },
  });
  cases.push({
    id: "offer.island-alias",
    tool: "get_trip_offer",
    what: "Wyspa od modelu (Majorka) → kanoniczne miasto seedu",
    expectWarm: false,
    args: { cityEn: "Majorka", countryEn: "Hiszpania", origin: "WAW", adults: 2, checkin: week.checkin, checkout: week.checkout },
  });

  return cases;
}
