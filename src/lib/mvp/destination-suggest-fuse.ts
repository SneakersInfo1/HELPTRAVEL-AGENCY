// Sesja C2 — server-side fuzzy autocomplete backed by Fuse.js.
//
// Replaces the legacy `destination-suggestions.ts` flow that scanned the
// raw catalog every request. The new pipeline:
//   1. Load `data/destinations.index.json` once at module boot (cached
//      across requests by Next's module system).
//   2. Build a Fuse.js index over cityPl/cityEn/countryPl/IATA with the
//      weights the spec calls for.
//   3. Each /api/destinations/suggest call runs Fuse.search() and merges
//      with a popularity bias so well-known destinations don't get buried
//      by closer typo matches on obscure ones.
//
// Response time at pilot scale (161 entries): <5 ms server-side.

import "server-only";

import Fuse from "fuse.js";

import { getDestinationsIndex, type DestinationIndexEntry } from "./destinations-seed";
import {
  POPULAR_DESTINATIONS,
  type PopularGroup,
} from "./popular-destinations";

export interface SuggestionResponseItem {
  id: string;
  label: string; // cityPl
  sublabel: string; // "countryPl · regionPl" (region omitted at index scale)
  cityEn: string;
  countryPl: string;
  countryCode: string | null;
  iata: string | null;
  popularity: number;
  /** Ustawiane TYLKO w trybie „puste pole" — pozwala UI pogrupować listę. */
  group?: PopularGroup;
  /** Nazwa, której użytkownik szuka, gdy różni się od miasta („Kreta" dla Heraklionu). */
  hint?: string;
  /** Wynik Fuse: 0 = trafienie idealne, 1 = brak podobieństwa. */
  score?: number;
}

/**
 * Powyżej tego wyniku dopasowanie NIE jest podpowiedzią, tylko zgadywaniem.
 *
 * Zmierzone na realnym indeksie (2026-07-26) — rozkład jest rozdzielny:
 *   trafienie dokładne  0,000   (Barcelona)
 *   nazwa kraju         0,004   (Grecja → Ateny)
 *   literówka           0,172–0,330 (Barselona, Zakintos, Hurgada, Stambul)
 *   ── granica ──
 *   śmieć               0,456–0,848 (Monastyr → Altmünster, Tajlandia → Amsterdam)
 *
 * Fuse przepuszczał je mimo `threshold: 0.4`, bo próg działa na dopasowaniu
 * per-klucz, a zwracany `score` to złożenie ważone po wszystkich kluczach —
 * może więc przekroczyć próg. Stąd odcięcie PO fakcie. 0,40 zostawia z zapasem
 * wszystkie literówki i ucina cały pas śmieci.
 */
export const MAX_ACCEPTABLE_SCORE = 0.4;

/**
 * Poniżej tego wyniku uznajemy, że indeks lokalny ZNA odpowiedź i nie ma po co
 * dopytywać LiteAPI — użytkownik dostaje podpowiedź natychmiast, bez sieci.
 * Powyżej: trafienie jest niepewne (np. „Bangkok" → Bansko, 0,367) i warto
 * sięgnąć po globalne /data/places.
 */
export const CONFIDENT_SCORE = 0.15;

const fuse: Fuse<DestinationIndexEntry> = new Fuse(getDestinationsIndex() as DestinationIndexEntry[], {
  keys: [
    { name: "cityPl", weight: 0.5 },
    { name: "cityEn", weight: 0.3 },
    { name: "countryPl", weight: 0.15 },
    { name: "iata", weight: 0.05 },
  ],
  threshold: 0.4, // typo-tolerant
  ignoreLocation: true, // "mad" should match "Madrid" not just prefix
  minMatchCharLength: 2,
  includeScore: true,
});

// Puste pole „Dokąd" NIE sortuje już po `popularity` z seeda. To pole jest
// proxy zasięgu geograficznego, nie polskiego popytu — pierwsza dwudziestka po
// nim to cała Hiszpania, potem cała Portugalia (Kordoba i Braga wyżej niż
// Rzym), więc użytkownik po kliknięciu dostawał sześć hiszpańskich miast i ani
// jednego kierunku z Turcji, Egiptu czy Grecji. Zamiast tego jedzie lista
// redakcyjna, sprawdzana testem względem seeda. Patrz popular-destinations.ts.
const indexById = new Map(getDestinationsIndex().map((e) => [e.id, e]));

const popularResolved: SuggestionResponseItem[] = POPULAR_DESTINATIONS.flatMap((pick) => {
  const entry = indexById.get(pick.id);
  // Kierunek zniknął z seeda po regeneracji → pomijamy zamiast renderować
  // pozycję, która po kliknięciu nic nie znajdzie. Test `popular-destinations`
  // i tak wywali build wcześniej; to jest zabezpieczenie runtime'owe.
  if (!entry) return [];
  return [{ ...toResponseItem(entry), group: pick.group, hint: pick.hint }];
});

function toResponseItem(entry: DestinationIndexEntry): SuggestionResponseItem {
  return {
    id: entry.id,
    label: entry.cityPl,
    sublabel: entry.countryPl,
    cityEn: entry.cityEn,
    countryPl: entry.countryPl,
    countryCode: entry.countryCode,
    iata: entry.iata,
    popularity: entry.popularity,
  };
}

export function suggestDestinations(query: string, limit = 8): SuggestionResponseItem[] {
  const q = query.trim();
  if (!q) {
    // Puste zapytanie → redakcyjna lista kierunków popularnych W POLSCE,
    // w kolejności z popular-destinations.ts. Ten sam kształt odpowiedzi, więc
    // UI nie musi się rozgałęziać (dochodzą tylko opcjonalne group/hint).
    return popularResolved.slice(0, limit);
  }
  const hits = fuse.search(q, { limit: limit * 3 });
  // Combined ranking: low Fuse score (closer match) is good, high
  // popularity is good. We want exact prefix matches and popular cities
  // both to surface first.
  const ranked = hits
    .map((h) => {
      const score = h.score ?? 0; // 0 = perfect, 1 = no match
      // popularityWeight: 0..1 (higher = more popular)
      const popularityWeight = h.item.popularity / 100;
      // Lower combined = better. Fuse score dominates, popularity tiebreaks.
      const combined = score - popularityWeight * 0.15;
      return { item: h.item, score, combined };
    })
    // Odcięcie śmieci — patrz MAX_ACCEPTABLE_SCORE. Filtrujemy po SUROWYM
    // wyniku Fuse, nie po `combined`: `combined` zawiera premię za
    // popularność, więc popularne miasto z fatalnym dopasowaniem prześlizgnęłoby
    // się przez próg (tak właśnie „Tajlandia" wypychała Amsterdam).
    .filter((x) => x.score <= MAX_ACCEPTABLE_SCORE)
    .sort((a, b) => a.combined - b.combined)
    .slice(0, limit)
    .map((x) => ({ ...toResponseItem(x.item), score: x.score }));

  // Dedupe po nazwie + kraju. Seed ma 26 par duplikatów o różnych `id`
  // (np. `prague-czechia` i `prague-czech-republic`, `malaga-spain` dwa razy),
  // więc bez tego użytkownik widział „Malaga (Hiszpania)" dwa razy pod rząd.
  const seen = new Set<string>();
  return ranked.filter((item) => {
    const key = `${item.label.toLowerCase()}|${item.countryPl.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
