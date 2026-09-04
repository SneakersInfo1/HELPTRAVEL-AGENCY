// Silnik doboru kierunków z motywu + budżetu — CZYSTY (zero I/O).
//
// Uczciwość: kierunek bez świeżego pakietu snapshotu (dstprice:v1, pkg*)
// jest po prostu pomijany — nigdy nie zgadujemy/nie doszacowujemy ceny.
// Snapshot i moods wchodzą jako argumenty; ten moduł nic sam nie czyta
// (żadnego readPriceSnapshot/Redis/fetch).

import {
  computePackagePerPerson,
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

function nightsOf(checkin: string, checkout: string): number {
  const a = Date.parse(`${checkin}T00:00:00Z`);
  const b = Date.parse(`${checkout}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * @param opts.nights Liczba nocy, o którą prosi użytkownik. Bez niej ranking
 * porównuje pakiety o RÓŻNEJ długości — a snapshot je miesza: pomiar na
 * produkcji (2026-09-04) pokazał 31 kierunków wycenionych na 4 noce i 15 na
 * 7 nocy w jednej liście, więc sześć „najtańszych" pozycji to były po prostu
 * te najkrótsze. Mając nights przeliczamy pakiet ze SKŁADOWYCH snapshotu
 * (lot RT + noce × hotel/2 — ta sama formuła co cron), dzięki czemu i ranking,
 * i próg budżetu dotyczą pobytu, o który pyta klient.
 */
export function rankTripCandidates(
  cities: readonly TripSearchCity[],
  snapshot: DestinationPriceSnapshot,
  budget: { budgetPln: number; budgetKind: BudgetKind },
  now: number = Date.now(),
  opts?: { nights?: number },
): TripCandidate[] {
  const threshold = budgetPerPerson(budget.budgetPln, budget.budgetKind);
  const wantNights = opts?.nights !== undefined && opts.nights > 0 ? opts.nights : null;
  const candidates: TripCandidate[] = [];

  for (const city of cities) {
    const pkg = pickFreshPackage(snapshot, city.cityEn, city.countryEn, now);
    if (!pkg) continue; // brak świeżego pakietu → nie zgadujemy, pomijamy kierunek

    const hotelPerNight = pickFreshPrice(snapshot, city.cityEn, city.countryEn, now);
    const flight = pickFreshFlightPrice(snapshot, city.cityEn, city.countryEn, now);

    let perPersonPln = pkg.perPersonPln;
    let nights = nightsOf(pkg.checkin, pkg.checkout);
    let checkin = pkg.checkin;
    let checkout = pkg.checkout;

    if (wantNights !== null && hotelPerNight !== null && flight !== null) {
      // Okno przesuwamy o żądaną długość od tej samej daty wyjazdu — cena
      // pochodzi ze składowych, nie ze zgadywania.
      const shifted = new Date(Date.parse(`${pkg.checkin}T00:00:00Z`) + wantNights * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const recomputed = computePackagePerPerson(flight, hotelPerNight, pkg.checkin, shifted);
      if (recomputed !== null) {
        perPersonPln = recomputed;
        nights = wantNights;
        checkin = pkg.checkin;
        checkout = shifted;
      }
    }

    if (perPersonPln > threshold) continue;

    candidates.push({
      cityEn: city.cityEn,
      countryEn: city.countryEn,
      cityPl: city.cityPl,
      perPersonPln,
      nights,
      checkin,
      checkout,
      hotelFromPlnPerNight: hotelPerNight,
      flightFromPln: flight,
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
