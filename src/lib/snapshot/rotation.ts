// Plan przebiegu crona: co grzejemy TERAZ i w jakiej kolejności (§28, §29, §52).
//
// ARYTMETYKA, która wymusza rotację. Tier A to 53 kierunki, macierz okien ma
// 8 pozycji — to już 424 zadania przy jednym lotnisku wylotu. Każde zadanie to
// zapytanie o lot (~6 s zimno) i o stawki hotelowe (~3,3 s), więc pełny obieg
// w JEDNYM przebiegu jest niemożliwy: cron ma 300 s, a `warm-rates` pokazał,
// jak wygląda życie przy 280 s (czyli 93% limitu) — żadnego zapasu na gorszy
// dzień u dostawcy.
//
// Rozwiązanie jest nudne i dlatego dobre: sortujemy WSZYSTKIE zadania wg
// priorytetu produktowego, a potem bierzemy co N-te. Round-robin po liście
// posortowanej daje dwie rzeczy naraz — każdy przebieg dostaje proporcjonalny
// kawałek KAŻDEGO pasma priorytetu (więc tier A jest odświeżany w każdym
// przebiegu, tylko w innych oknach), a pełny obieg zamyka się po
// `segmentCount` przebiegach.
//
// Numer segmentu liczymy z ZEGARA, nie z zapisanego kursora. §52 pozwala na
// prosty deterministyczny wybór, jeśli wystarcza — a wystarcza: nie ma stanu
// do zgubienia, nie ma czego naprawiać po awarii, a przebieg pominięty przez
// dostawcę po prostu wróci w kolejnym obiegu.

import type { SnapshotWindow } from "./windows";
import type { TieredDestination } from "./tiers";

export interface WarmTask {
  dest: TieredDestination;
  window: SnapshotWindow;
  origin: string;
  /** Niższa liczba = ważniejsze. Wyłącznie do sortowania. */
  priority: number;
}

export interface RunPlanOptions {
  segment: number;
  segmentCount: number;
  /** Ile zadań maksymalnie bierze ten przebieg (twarda pochodna budżetu czasu). */
  taskBudget: number;
  /** Ile okien dostaje tier B (mniej niż A — długi ogon nie potrzebuje pełnej macierzy). */
  tierBWindows?: number;
}

/**
 * Priorytet zadania (§29). Kolejność członów jest kolejnością ważności:
 *
 *   1. TIER kierunku      — hot przed długim ogonem,
 *   2. TIER lotniska      — WAW przed resztą,
 *   3. BLISKOŚĆ miesiąca  — najbliższe terminy sprzedają się najczęściej,
 *   4. DŁUGOŚĆ pobytu     — 7 nocy przed 4 (dominują w zapytaniach wakacyjnych),
 *   5. POPULARNOŚĆ        — rozstrzyga remisy, stabilnie.
 *
 * Liczba jest sumą ważoną, ale wagi są rozdzielone rzędami wielkości, więc
 * zachowuje się jak porządek leksykograficzny — a da się ją posortować jednym
 * porównaniem i wypisać w logu.
 */
function priorityOf(dest: TieredDestination, window: SnapshotWindow, origin: string, originTierA: readonly string[], monthRank: number): number {
  const tierRank = dest.tier === "A" ? 0 : dest.tier === "B" ? 1 : 2;
  const originRank = originTierA.includes(origin) ? 0 : 1;
  const nightsRank = window.nights === 7 ? 0 : 1;
  return (
    tierRank * 1_000_000 +
    originRank * 100_000 +
    monthRank * 10_000 +
    nightsRank * 1_000 +
    (100 - Math.min(100, dest.popularity))
  );
}

/**
 * Pełna lista zadań w kolejności priorytetu. Wydzielona z `planRun`, bo
 * probe i raport pokrycia potrzebują tej samej listy bez wybierania segmentu.
 */
export function buildTaskList(
  destinations: readonly TieredDestination[],
  windows: readonly SnapshotWindow[],
  origins: { tierA: readonly string[]; tierB: readonly string[] },
  opts?: { tierBWindows?: number },
): WarmTask[] {
  const tierBWindows = opts?.tierBWindows ?? 2;
  // Ranga miesiąca = pozycja w posortowanej liście miesięcy macierzy, więc
  // „najbliższy" jest liczony z DANYCH, a nie z bieżącej daty po raz drugi.
  //
  // Sortujemy LICZBOWO (`rok*12 + miesiąc`), nie po stringu. Klucz tekstowy
  // „2026-9" vs „2026-10" ustawia się alfabetycznie, więc październik
  // wychodził przed wrzesień — cron zaczynałby obieg od dalszego miesiąca.
  const monthOrder = [...new Set(windows.map((w) => w.year * 12 + w.month))].sort((a, b) => a - b);
  const rankOfMonth = new Map(monthOrder.map((k, i) => [k, i] as const));

  const tasks: WarmTask[] = [];
  for (const dest of destinations) {
    if (dest.tier === "C" || !dest.iata) continue;
    // Tier B dostaje tylko najbliższe okna — długi ogon nie potrzebuje pełnej
    // macierzy, a każde dodatkowe okno mnoży koszt przez liczbę kierunków.
    const windowsForDest = dest.tier === "A" ? windows : windows.slice(0, tierBWindows);
    // Lotniska: tier A kierunków dostaje wszystkie lotniska tieru A wylotów;
    // tier B tylko pierwsze (WAW). Poza tym rotujemy lotniska tieru B po
    // kierunkach tieru A, żeby KRK/GDN/WRO w ogóle kiedyś dostały pokrycie.
    const originsForDest =
      dest.tier === "A"
        ? [...origins.tierA, origins.tierB[hashIndex(dest.id, origins.tierB.length)]].filter(
            (o): o is string => typeof o === "string",
          )
        : [...origins.tierA];
    for (const window of windowsForDest) {
      for (const origin of originsForDest) {
        tasks.push({
          dest,
          window,
          origin,
          priority: priorityOf(dest, window, origin, origins.tierA, rankOfMonth.get(window.year * 12 + window.month) ?? 9),
        });
      }
    }
  }
  return tasks.sort((a, b) =>
    a.priority !== b.priority
      ? a.priority - b.priority
      : `${a.dest.id}|${a.origin}|${a.window.label}`.localeCompare(`${b.dest.id}|${b.origin}|${b.window.label}`),
  );
}

/** Stabilny indeks z id — rotacja lotnisk bez losowości i bez stanu. */
function hashIndex(key: string, modulo: number): number {
  if (modulo <= 0) return 0;
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 2_147_483_647;
  return h % modulo;
}

/** Zadania na TEN przebieg — co `segmentCount`-te z listy priorytetowej. */
export function planRun(
  destinations: readonly TieredDestination[],
  windows: readonly SnapshotWindow[],
  origins: { tierA: readonly string[]; tierB: readonly string[] },
  opts: RunPlanOptions,
): WarmTask[] {
  const all = buildTaskList(destinations, windows, origins, { tierBWindows: opts.tierBWindows });
  const count = Math.max(1, opts.segmentCount);
  const segment = ((opts.segment % count) + count) % count;
  return all.filter((_, i) => i % count === segment).slice(0, Math.max(0, opts.taskBudget));
}

/**
 * Numer segmentu z zegara — bez kursora w Redisie (§52). Dzielimy oś czasu na
 * sloty równe odstępowi crona i bierzemy resztę z dzielenia przez liczbę
 * segmentów, więc kolejne przebiegi idą 0,1,2,…,N-1,0,…
 */
export function segmentForNow(nowMs: number, intervalMs: number, segmentCount: number): number {
  if (segmentCount <= 0 || intervalMs <= 0) return 0;
  return Math.floor(nowMs / intervalMs) % segmentCount;
}
