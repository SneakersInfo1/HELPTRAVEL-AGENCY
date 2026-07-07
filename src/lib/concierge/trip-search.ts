// Silnik doboru kierunków z motywu + budżetu — CZYSTY (zero I/O).
//
// Uczciwość: kierunek bez świeżego pakietu snapshotu (dstprice:v1, pkg*)
// jest po prostu pomijany — nigdy nie zgadujemy/nie doszacowujemy ceny.
// Snapshot i moods wchodzą jako argumenty; ten moduł nic sam nie czyta
// (żadnego readPriceSnapshot/Redis/fetch).

import {
  pickFreshFlightPrice,
  pickFreshPackage,
  pickFreshPrice,
  type DestinationPriceSnapshot,
} from "@/lib/prices/destination-price-snapshot";
import { getMoodBySlug } from "@/lib/mvp/travel-moods";
import type { BudgetKind, TripCandidate } from "./types";

export interface TripSearchCity {
  cityEn: string;
  countryEn: string;
  cityPl: string;
}

/** Minimalny kształt rekordu seedu (strukturalnie zgodny z DestinationRecord). */
export interface SeedDestinationLike {
  city: { en: string; pl: string };
  country: { en: string };
}

/**
 * Lookup rekordu seedu po nazwie miasta/kraju — w produkcji podaj
 * `getDestinationByCityCountry` z `@/lib/mvp/destinations-seed`. Wstrzykiwany
 * jako argument, bo tamten moduł jest server-only (`import "server-only"` nie
 * rozwiązuje się poza Next), a silnik ma zostać czysty i testowalny.
 */
export type SeedDestinationLookup = (city: string, country?: string) => SeedDestinationLike | undefined;

/** Próg budżetu na osobę: „za dwoje" dzieli kwotę na 2 (floor). */
export function budgetPerPerson(budgetPln: number, kind: BudgetKind): number {
  return kind === "total_two" ? Math.floor(budgetPln / 2) : budgetPln;
}

export function rankTripCandidates(
  cities: readonly TripSearchCity[],
  snapshot: DestinationPriceSnapshot,
  budget: { budgetPln: number; budgetKind: BudgetKind },
  now: number = Date.now(),
): TripCandidate[] {
  const threshold = budgetPerPerson(budget.budgetPln, budget.budgetKind);
  const candidates: TripCandidate[] = [];

  for (const city of cities) {
    const pkg = pickFreshPackage(snapshot, city.cityEn, city.countryEn, now);
    if (!pkg) continue; // brak świeżego pakietu → nie zgadujemy, pomijamy kierunek

    if (pkg.perPersonPln > threshold) continue;

    candidates.push({
      cityEn: city.cityEn,
      countryEn: city.countryEn,
      cityPl: city.cityPl,
      perPersonPln: pkg.perPersonPln,
      checkin: pkg.checkin,
      checkout: pkg.checkout,
      hotelFromPlnPerNight: pickFreshPrice(snapshot, city.cityEn, city.countryEn, now),
      flightFromPln: pickFreshFlightPrice(snapshot, city.cityEn, city.countryEn, now),
    });
  }

  candidates.sort((a, b) => a.perPersonPln - b.perPersonPln);
  return candidates;
}

/**
 * Kierunki wchodzące w skład motywu (TRAVEL_MOODS), odduplikowane.
 * [] dla nieznanego sluga.
 *
 * KLUCZE CEN: cron warm-rates pisze snapshot pod destinationPriceKey(
 * seed.city.en, seed.country.en), a pick motywu (searchCity/country) bywa
 * nazwany inaczej (np. pick „Palma de Mallorca" vs seed „Palma"). Dlatego
 * każdy pick rozwiązujemy przez rekord SEEDU (wzorzec z mood-landing.tsx)
 * i cityEn/countryEn bierzemy z seedu — inaczej kierunek nigdy nie trafi
 * w klucz snapshotu i byłby po cichu pomijany. Brak rekordu seedu →
 * zostają pola picka (i tak odpadnie na braku ceny, nie zgadujemy).
 */
export function resolveThemeCities(themeSlug: string, resolveDest: SeedDestinationLookup): TripSearchCity[] {
  const mood = getMoodBySlug(themeSlug);
  if (!mood) return [];

  const seen = new Set<string>();
  const out: TripSearchCity[] = [];
  for (const pick of mood.picks) {
    const dest = resolveDest(pick.searchCity, pick.country);
    const cityEn = dest?.city.en ?? pick.searchCity;
    const countryEn = dest?.country.en ?? pick.country;
    const cityPl = dest?.city.pl ?? pick.name;
    // Dedup PO rozwiązaniu przez seed — dwa picki tego samego rekordu
    // (różne nazwy) muszą zwinąć się do jednego kierunku.
    const key = `${cityEn}|${countryEn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ cityEn, countryEn, cityPl });
  }
  return out;
}
