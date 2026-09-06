// Kandydaci konsjerża ze snapshotu V2.2 (`csnap:v1`) — CZYSTY, zero I/O.
//
// RÓŻNICA WOBEC `trip-search.ts`. Tamten moduł czyta `dstprice:v1`, gdzie na
// kierunek przypada JEDEN pakiet — więc termin jest z góry ustalony i pytanie
// „a w listopadzie na 7 nocy?" nie ma jak zadziałać. Tutaj wejściem jest
// zbiór rekordów (kierunek × wylot × okno), więc po raz pierwszy da się
// ODPOWIEDZIEĆ NA TERMIN, o który pyta użytkownik — albo uczciwie powiedzieć,
// że mamy tylko sąsiedni (matchType: NEAREST).
//
// Trzy reguły, których ten moduł nie łamie:
//   1. Rekord z przeszłym terminem nie istnieje. Filtr stoi PRZED ceną (§11).
//   2. Cena nigdy nie jest zgadywana — brak `perPersonPln` to brak kandydata.
//   3. NEAREST jest oznaczony, nie przemilczany: model dostaje flagę i ma ją
//      wypowiedzieć, zamiast podawać cenę innego terminu jako odpowiedź.

import { travelToday } from "@/lib/time/travel-now";
import { isUsableRecord } from "@/lib/snapshot/coverage";
import type { SnapshotRecord } from "@/lib/snapshot/types";
import { budgetPerPerson, type TripSearchCity } from "./trip-search";
import { classifyTravelDate } from "./travel-dates";
import type { BudgetKind, TripCandidate } from "./types";

export interface SnapshotRankOptions {
  /** Miesiąc, o który pyta użytkownik (1–12). */
  month?: number;
  /** Liczba nocy, o którą pyta użytkownik. */
  nights?: number;
  /** Lotnisko wylotu użytkownika — preferencja, nie filtr twardy. */
  origin?: string;
  themeSlug?: string;
  themePickKeys?: ReadonlySet<string>;
}

/** Klucz kierunku wspólny dla puli miast i rekordów snapshotu. */
function keyOf(cityEn: string, countryEn: string): string {
  return `${cityEn}|${countryEn}`.toLowerCase();
}

/**
 * Wybór NAJLEPSZEGO rekordu dla jednego kierunku.
 *
 * Porządek jest leksykograficzny i celowo prosty:
 *   1. zgodność miesiąca (jeśli podany),
 *   2. zgodność liczby nocy (jeśli podana),
 *   3. zgodność lotniska wylotu (jeśli podane),
 *   4. cena rosnąco.
 *
 * Dzięki temu „Grecja, listopad, 7 nocy" dostaje listopadowe okno siedmionocne,
 * a nie po prostu najtańszy rekord z całego roku — co było dokładnie tym, co
 * robił poprzedni snapshot, bo innego wyboru nie miał.
 */
export function pickBestRecord(
  records: readonly SnapshotRecord[],
  opts: SnapshotRankOptions,
): { record: SnapshotRecord; matchType: "EXACT" | "NEAREST" } | null {
  if (records.length === 0) return null;
  const scored = records
    .map((record) => {
      const monthOk = opts.month === undefined || record.month === opts.month;
      const nightsOk = opts.nights === undefined || record.nights === opts.nights;
      const originOk = opts.origin === undefined || record.origin === opts.origin;
      return { record, monthOk, nightsOk, originOk };
    })
    .sort((a, b) => {
      if (a.monthOk !== b.monthOk) return a.monthOk ? -1 : 1;
      if (a.nightsOk !== b.nightsOk) return a.nightsOk ? -1 : 1;
      if (a.originOk !== b.originOk) return a.originOk ? -1 : 1;
      const pa = a.record.perPersonPln ?? Number.MAX_SAFE_INTEGER;
      const pb = b.record.perPersonPln ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      // Remisy rozstrzyga data — stabilnie i przewidywalnie.
      return a.record.checkin.localeCompare(b.record.checkin);
    });
  const best = scored[0];
  // EXACT znaczy: dostaliśmy to, o co pytano. Wylot jest preferencją, więc
  // jego niezgodność NIE degraduje dopasowania do NEAREST — ale niezgodność
  // miesiąca albo długości pobytu owszem, bo to jest odpowiedź na inne pytanie.
  const exact = best.monthOk && best.nightsOk;
  return { record: best.record, matchType: exact ? "EXACT" : "NEAREST" };
}

/**
 * Kandydaci z rekordów snapshotu, w kolejności: motyw → dopasowanie terminu →
 * cena → popularność. NIE przycina listy — o `slice` decyduje wołający.
 */
export function rankSnapshotCandidates(
  cities: readonly TripSearchCity[],
  records: readonly SnapshotRecord[],
  budget: { budgetPln: number; budgetKind: BudgetKind },
  nowMs: number,
  opts: SnapshotRankOptions = {},
): TripCandidate[] {
  const todayIso = travelToday(nowMs);
  const threshold = budgetPerPerson(budget.budgetPln, budget.budgetKind);

  // FILTR TWARDY: tylko rekordy przyszłe, z niewygasłą ceną i policzonym
  // pakietem. Wszystko inne nie ma czego szukać w liście sprzedażowej.
  const byCity = new Map<string, SnapshotRecord[]>();
  for (const r of records) {
    if (!isUsableRecord(r, todayIso, nowMs)) continue;
    const key = keyOf(r.cityEn, r.countryEn);
    const list = byCity.get(key);
    if (list) list.push(r);
    else byCity.set(key, [r]);
  }

  const out: TripCandidate[] = [];
  const affinityOf = new Map<TripCandidate, number>();
  for (const city of cities) {
    const forCity = byCity.get(keyOf(city.cityEn, city.countryEn));
    if (!forCity) continue;
    const best = pickBestRecord(forCity, opts);
    if (!best) continue;
    const perPersonPln = best.record.perPersonPln;
    if (perPersonPln === null || perPersonPln > threshold) continue;

    const affinity = opts.themeSlug
      ? opts.themePickKeys?.has(keyOf(city.cityEn, city.countryEn))
        ? 2
        : 0
      : 0;
    const candidate: TripCandidate = {
      cityEn: city.cityEn,
      countryEn: city.countryEn,
      cityPl: city.cityPl,
      perPersonPln,
      nights: best.record.nights,
      checkin: best.record.checkin,
      checkout: best.record.checkout,
      hotelFromPlnPerNight: best.record.hotelPlnPerNight,
      flightFromPln: best.record.flightPln,
      themeMatch: opts.themeSlug ? affinity > 0 : null,
      nightsMatch: opts.nights === undefined ? null : best.record.nights === opts.nights,
      popularity: city.popularity ?? null,
      travelDateState: classifyTravelDate(best.record.checkin, todayIso),
      matchType: best.matchType,
    };
    affinityOf.set(candidate, affinity);
    out.push(candidate);
  }

  out.sort((a, b) => {
    const affA = affinityOf.get(a) ?? 0;
    const affB = affinityOf.get(b) ?? 0;
    if (affA !== affB) return affB - affA;
    // Dopasowanie terminu przed ceną: tańszy kierunek w INNYM miesiącu nie
    // jest lepszą odpowiedzią na pytanie o listopad.
    const exactA = a.matchType === "EXACT" ? 0 : 1;
    const exactB = b.matchType === "EXACT" ? 0 : 1;
    if (exactA !== exactB) return exactA - exactB;
    if (a.perPersonPln !== b.perPersonPln) return a.perPersonPln - b.perPersonPln;
    return (b.popularity ?? 0) - (a.popularity ?? 0);
  });
  return out;
}
