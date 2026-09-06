// Silnik doboru kierunków z motywu + budżetu — CZYSTY (zero I/O).
//
// Uczciwość: kierunek bez świeżego pakietu snapshotu (dstprice:v1, pkg*)
// jest po prostu pomijany — nigdy nie zgadujemy/nie doszacowujemy ceny.
// Snapshot i moods wchodzą jako argumenty; ten moduł nic sam nie czyta
// (żadnego readPriceSnapshot/Redis/fetch).
//
// ── KONTRAKT FILTROWANIA (V2.1 §12) ─────────────────────────────────────────
// Audyt V2 wykazał, że `country` WYPIERAŁO `theme`: „ciepło, plaża, Grecja"
// stawało się wyłącznie „Grecja", a lista wracała w kolejności popularności
// seedu — więc na plażę dostawało się Ateny. Odtąd rozróżniamy jawnie:
//
//   FILTRY TWARDE (kandydat wypada z listy)
//     • TERMIN Z PRZESZŁOŚCI (V2.2 §11)      → patrz niżej
//     • brak świeżego pakietu w snapshocie  → nie mamy ceny, nie zgadujemy
//     • cena/os. ponad próg budżetu         → użytkownik podał granicę
//     • kraj, jeśli użytkownik go wskazał   → stosowany PRZED tym modułem
//
//   PREFERENCJE MIĘKKIE (zmieniają KOLEJNOŚĆ, nie skład listy)
//     • zgodność z motywem (tagi kierunku z seedu)
//     • zgodność liczby nocy z prośbą użytkownika
//     • cena rosnąco
//     • popularność kierunku — rozstrzyga remisy
//
// Porządek jest LEKSYKOGRAFICZNY, nie ważoną sumą punktów: da się go wyjaśnić
// jednym zdaniem („najpierw pasujące do motywu, w każdej grupie od
// najtańszego"), a test opisuje regułę, nie dobrane współczynniki.

import {
  computePackagePerPerson,
  pickFreshFlightPrice,
  pickFreshPackage,
  pickFreshPrice,
  type DestinationPriceSnapshot,
} from "@/lib/prices/destination-price-snapshot";
import { getMoodBySlug, TRAVEL_MOODS } from "@/lib/mvp/travel-moods";
import { travelToday } from "@/lib/time/travel-now";
import { classifyTravelDate, isBookableStart } from "./travel-dates";
import type { BudgetKind, TripCandidate } from "./types";

export interface TripSearchCity {
  cityEn: string;
  countryEn: string;
  cityPl: string;
  /** Tagi charakteru kierunku z seedu (`vibeTagsEn`) — sygnał motywu. */
  vibeTagsEn?: readonly string[];
  /** Popularność kierunku w seedzie (0–100) — wyłącznie rozstrzyganie remisów. */
  popularity?: number;
}

/** Minimalny kształt rekordu seedu (strukturalnie zgodny z DestinationRecord). */
export interface SeedDestinationLike {
  city: { en: string; pl: string };
  country: { en: string };
  vibeTagsEn?: readonly string[];
  popularity?: number;
}

/**
 * Lookup rekordu seedu po nazwie miasta/kraju — w produkcji podaj
 * `getDestinationByCityCountry` z `@/lib/mvp/destinations-seed`. Wstrzykiwany
 * jako argument, bo tamten moduł jest server-only (`import "server-only"` nie
 * rozwiązuje się poza Next), a silnik ma zostać czysty i testowalny.
 */
export type SeedDestinationLookup = (city: string, country?: string) => SeedDestinationLike | undefined;

/**
 * Motyw (`slug` z TRAVEL_MOODS) → tag charakteru kierunku (`vibeTagsEn`
 * z data/destinations.json). Dwa słowniki powstały niezależnie, więc mostek
 * między nimi musi być jawny — a `travel-moods.test`/`trip-search.test`
 * pilnują, że każdy motyw ma mapowanie i że każdy tag realnie istnieje
 * w seedzie (inaczej literówka po cichu wyłączyłaby preferencję).
 *
 * `slonce-zima` celowo wskazuje na `beach`: „słońce zimą" to w tym katalogu
 * kierunki nadmorskie, a osobnego taga na to seed nie ma.
 */
export const THEME_VIBE_TAG: Record<string, string> = {
  plaza: "beach",
  "city-break": "city break",
  gory: "nature",
  kultura: "culture",
  budzet: "budget",
  "slonce-zima": "beach",
};

/** Tag charakteru dla motywu albo null (nieznany slug). */
export function vibeTagForTheme(themeSlug: string | undefined): string | null {
  if (!themeSlug) return null;
  return THEME_VIBE_TAG[themeSlug] ?? null;
}

/** Klucz kierunku do porównań w obrębie tego modułu. */
export function cityKey(city: { cityEn: string; countryEn: string }): string {
  return `${city.cityEn}|${city.countryEn}`.toLowerCase();
}

/**
 * SIŁA dopasowania kierunku do motywu — trzy poziomy, w kolejności zaufania
 * do danych, które za nimi stoją:
 *
 *   2 — kierunek jest RĘCZNIE WYBRANYM pickiem tego motywu (TRAVEL_MOODS).
 *       Najmocniejszy sygnał: ktoś świadomie zdecydował, że to jest wyjazd
 *       „na plażę" albo „w góry".
 *   1 — kierunek ma tag charakteru odpowiadający motywowi (`vibeTagsEn`).
 *   0 — nic z powyższych.
 *
 * DLACZEGO NIE SAM TAG (pomiar na 45 wygrzanych kierunkach, 2026-09-06):
 * tagi z seedu są SŁABYM dyskryminatorem — `city break` ma 87% kierunków,
 * `beach` 73%, `culture` 73%. W obrębie kraju bywają bezużyteczne: WSZYSTKIE
 * osiem wygrzanych kierunków w Grecji i wszystkie jedenaście w Hiszpanii mają
 * tag `beach`. Mocne są tylko `nature` (16%) i `budget` (20%). Dlatego picki
 * motywu stoją WYŻEJ niż tagi — i dlatego nie budujemy z tego ważonej sumy
 * punktów, która udawałaby precyzję, której w danych nie ma.
 */
export function themeAffinity(
  city: TripSearchCity,
  vibeTag: string | null,
  themePickKeys?: ReadonlySet<string>,
): 0 | 1 | 2 {
  if (themePickKeys?.has(cityKey(city))) return 2;
  if (vibeTag && (city.vibeTagsEn ?? []).some((tag) => tag.toLowerCase() === vibeTag)) return 1;
  return 0;
}

/** Czy kierunek pasuje do motywu w ogóle (affinity > 0). */
export function matchesTheme(
  city: TripSearchCity,
  vibeTag: string | null,
  themePickKeys?: ReadonlySet<string>,
): boolean {
  return themeAffinity(city, vibeTag, themePickKeys) > 0;
}

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

export interface RankOptions {
  /**
   * Liczba nocy, o którą prosi użytkownik. Bez niej ranking porównuje pakiety
   * o RÓŻNEJ długości — a snapshot je miesza: pomiar na produkcji (2026-09-04)
   * pokazał 31 kierunków wycenionych na 4 noce i 15 na 7 nocy w jednej liście,
   * więc sześć „najtańszych" pozycji to były po prostu te najkrótsze. Mając
   * nights przeliczamy pakiet ze SKŁADOWYCH snapshotu (lot RT + noce ×
   * hotel/2 — ta sama formuła co cron), dzięki czemu i ranking, i próg budżetu
   * dotyczą pobytu, o który pyta klient.
   */
  nights?: number;
  /** Slug motywu — PREFERENCJA porządkująca, nigdy filtr twardy (§12). */
  themeSlug?: string;
  /**
   * Klucze kierunków ręcznie wybranych dla tego motywu (patrz themeAffinity).
   * Liczy je wołający, bo wymagają lookupu seedu, a ten moduł jest czysty.
   */
  themePickKeys?: ReadonlySet<string>;
}

/**
 * Kandydaci w kolejności: dopasowanie do motywu → dopasowanie liczby nocy →
 * cena rosnąco → popularność malejąco. NIE przycina listy — o `slice` decyduje
 * wołający, DOPIERO po tym rankingu (§13).
 */
export function rankTripCandidates(
  cities: readonly TripSearchCity[],
  snapshot: DestinationPriceSnapshot,
  budget: { budgetPln: number; budgetKind: BudgetKind },
  now: number = Date.now(),
  opts?: RankOptions,
): TripCandidate[] {
  const threshold = budgetPerPerson(budget.budgetPln, budget.budgetKind);
  // Dzień odniesienia dla WSZYSTKICH porównań czasowych w tym rankingu —
  // jeden, wzięty z „teraz" wołającego, w strefie produktu (Europe/Warsaw).
  const todayIso = travelToday(now);
  const wantNights = opts?.nights !== undefined && opts.nights > 0 ? opts.nights : null;
  const vibeTag = vibeTagForTheme(opts?.themeSlug);
  const themeGiven = Boolean(opts?.themeSlug);
  const candidates: TripCandidate[] = [];
  // Siła dopasowania trzymana OBOK kandydata — nie jest częścią jego kontraktu,
  // a wołający dostaje wyłącznie `themeMatch`.
  const affinityOf = new Map<TripCandidate, number>();

  for (const city of cities) {
    // FILTR TWARDY 0 (V2.2 §11): TERMIN Z PRZESZŁOŚCI.
    //
    // Do V2.1 jedynym sitem świeżości był wiek CENY (pkgComputedAt ≤ 48 h).
    // Data WYJAZDU nie była sprawdzana w rankingu nigdzie — pakiet z sierpniowym
    // oknem i minutę temu policzoną ceną przechodził jako „świeży", a że był
    // z definicji najtańszy (przeszłe terminy są tanie), lądował na szczycie
    // listy. Że problem nie był widoczny na produkcji, wynikało wyłącznie
    // z tego, że cron akurat grzeje okna 40–60 dni naprzód — nic tego nie
    // pilnowało. Sprawdzenie stoi PRZED ceną, bo rzecz nie do kupienia nie ma
    // czego szukać w rankingu sprzedażowym, choćby była najtańsza.
    const pkg = pickFreshPackage(snapshot, city.cityEn, city.countryEn, now);
    if (!pkg) continue;
    if (!isBookableStart(pkg.checkin, todayIso)) continue;

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

    // FILTR TWARDY 2: ponad budżet użytkownika.
    if (perPersonPln > threshold) continue;

    const affinity = themeGiven ? themeAffinity(city, vibeTag, opts?.themePickKeys) : 0;
    const candidate: TripCandidate = {
      cityEn: city.cityEn,
      countryEn: city.countryEn,
      cityPl: city.cityPl,
      perPersonPln,
      nights,
      checkin,
      checkout,
      hotelFromPlnPerNight: hotelPerNight,
      flightFromPln: flight,
      themeMatch: themeGiven ? affinity > 0 : null,
      nightsMatch: wantNights === null ? null : nights === wantNights,
      popularity: city.popularity ?? null,
      travelDateState: classifyTravelDate(checkin, todayIso),
    };
    affinityOf.set(candidate, affinity);
    candidates.push(candidate);
  }

  candidates.sort((a, b) => {
    // 1. Siła dopasowania do motywu (pick > tag > nic). Bez motywu wszystkie
    //    mają 0, więc porównanie jest neutralne.
    const affinityA = affinityOf.get(a) ?? 0;
    const affinityB = affinityOf.get(b) ?? 0;
    if (affinityA !== affinityB) return affinityB - affinityA;
    // 2. Liczba nocy zgodna z prośbą.
    const nightsDelta = Number(b.nightsMatch !== false) - Number(a.nightsMatch !== false);
    if (nightsDelta !== 0) return nightsDelta;
    // 3. Cena — główny sygnał konwersji.
    if (a.perPersonPln !== b.perPersonPln) return a.perPersonPln - b.perPersonPln;
    // 4. Popularność rozstrzyga remisy (stabilnie, bez losowości).
    return (b.popularity ?? 0) - (a.popularity ?? 0);
  });
  return candidates;
}

/**
 * Klucze kierunków ręcznie wybranych dla motywu — do przekazania rankingowi,
 * gdy pula kandydatów NIE pochodzi z tego motywu (ścieżka „konkretny kraj").
 */
export function themePickKeysFor(
  themeSlug: string | undefined,
  resolveDest: SeedDestinationLookup,
): ReadonlySet<string> | undefined {
  if (!themeSlug) return undefined;
  const cities = resolveThemeCities(themeSlug, resolveDest);
  if (cities.length === 0) return undefined;
  return new Set(cities.map(cityKey));
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
    out.push({
      cityEn,
      countryEn,
      cityPl,
      vibeTagsEn: dest?.vibeTagsEn,
      popularity: dest?.popularity,
    });
  }
  return out;
}

/** Wszystkie slugi motywów — do testu pokrycia mapy THEME_VIBE_TAG. */
export function allThemeSlugs(): string[] {
  return TRAVEL_MOODS.map((m) => m.slug);
}
