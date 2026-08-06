// Wspólne formattery sekcji hotelowej — polska odmiana i etykiety cenowe.
//
// Powód: te same funkcje (`nightsLabel`, `nightsForTotal`, `polishBoard`) były
// skopiowane osobno w `result-card.tsx` i `card-price.tsx`, w dodatku
// z RÓŻNYMI tekstami dla tej samej rzeczy. Brief §17 wprost tego zabrania:
// jedne formattery, nie ręczne sklejanie stringów po komponentach.

import { formatPLN, fromMinor } from "@/lib/money";

import type { TaxNotice } from "./types";

// ── Odmiana przez liczbę ────────────────────────────────────────────────────
// Polski ma trzy formy: 1 / 2-4 / 5+, z wyjątkiem nastolatek (12, 13, 14…),
// które biorą formę mnogą. Naiwne `n < 5` myli się na 12–14 i na 22–24.

function plForm(n: number): 0 | 1 | 2 {
  const abs = Math.abs(n);
  if (abs === 1) return 0;
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 1;
  return 2;
}

function pluralize(n: number, one: string, few: string, many: string): string {
  return [one, few, many][plForm(n)];
}

/** „1 noc" / „3 noce" / „5 nocy" / „22 noce" / „13 nocy" */
export function nightsLabel(n: number): string {
  return `${n} ${nightsWord(n)}`;
}

/** Samo słowo, gdy liczba stoi gdzie indziej („za 3 noce"). */
export function nightsWord(n: number): string {
  return pluralize(n, "noc", "noce", "nocy");
}

/** „1 gość" / „2 gości" — w polskim „gość" ma dopełniacz mnogi dla 2+. */
export function guestsLabel(n: number): string {
  return `${n} ${pluralize(n, "gość", "gości", "gości")}`;
}

/** „1 pokój" / „2 pokoje" / „5 pokoi" */
export function roomsLabel(n: number): string {
  return `${n} ${pluralize(n, "pokój", "pokoje", "pokoi")}`;
}

/** „1 opinia" / „2 opinie" / „5 opinii" */
export function reviewsLabel(n: number): string {
  return `${n.toLocaleString("pl-PL")} ${pluralize(n, "opinia", "opinie", "opinii")}`;
}

/** „1 opcja" / „2 opcje" / „5 opcji" */
export function optionsLabel(n: number): string {
  return `${n} ${pluralize(n, "opcja", "opcje", "opcji")}`;
}

// ── Godziny ─────────────────────────────────────────────────────────────────

/**
 * Godzina zameldowania/wymeldowania w formacie 24-godzinnym.
 *
 * Dostawca zwraca zapis 12-godzinny („03:00 PM", „12:00 AM"), który na polskiej
 * stronie czyta się źle — a „12:00 AM" bywa wręcz mylące (to północ, nie
 * południe). Konwertujemy na 24 h; wejścia, którego nie rozumiemy, NIE psujemy
 * — zwracamy je bez zmian, zamiast zgadywać.
 */
export function formatHotelTime(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(s);
  if (!m) return s; // np. „15:00" albo format, którego nie znamy — bez zmian

  let hour = Number(m[1]);
  const minutes = m[2];
  const isPm = m[3].toUpperCase() === "PM";
  if (hour === 12) hour = 0; // 12 AM = 00, 12 PM = 12 (po dodaniu 12 niżej)
  if (isPm) hour += 12;

  return `${String(hour).padStart(2, "0")}:${minutes}`;
}

// ── Podatki ─────────────────────────────────────────────────────────────────

/**
 * Zdanie o podatkach — albo `null`, gdy NIE WOLNO nic twierdzić.
 *
 * To jest sedno Etapu 3. Poprzednio komponenty pisały bezwarunkowo
 * „wł. podatków i opłat", co było nieprawdą dla ~52% taryf (209/400 pozycji
 * ma `included: false`). Teraz zdanie wynika ze stanu `TaxNotice`, a stan
 * `unknown` daje `null` — brak wzmianki zamiast fałszywego zapewnienia.
 */
export function taxNoticeText(notice: TaxNotice): string | null {
  switch (notice.kind) {
    case "all-included":
      return "w tym podatki i opłaty";
    case "extra-at-property":
      return notice.amountMinor !== null && notice.currency
        ? `+ ${formatPLN(fromMinor(notice.amountMinor), notice.currency)} podatków i opłat płatnych na miejscu`
        : "dodatkowe podatki i opłaty płatne na miejscu";
    case "unknown":
      // Dostawca nie podał rozbicia → milczymy. Cisza jest uczciwa,
      // zapewnienie bez pokrycia nie jest.
      return null;
  }
}

/**
 * Wariant skrócony do ciasnych miejsc (karta wyniku, sticky pasek).
 * Ta sama zasada: `null` znaczy „nie mamy prawa nic napisać".
 */
export function taxNoticeShort(notice: TaxNotice): string | null {
  switch (notice.kind) {
    case "all-included":
      return "z podatkami";
    case "extra-at-property":
      return notice.amountMinor !== null && notice.currency
        ? `+ ${formatPLN(fromMinor(notice.amountMinor), notice.currency)} na miejscu`
        : "opłaty na miejscu";
    case "unknown":
      return null;
  }
}

/**
 * Buduje `TaxNotice` z dwóch pól przenoszonych w SlimRate (lista wyników).
 *
 * Lista nie dostaje pełnego rozbicia — wożenie go przez Redis dla każdego
 * z ~2000 hoteli byłoby marnotrawstwem. Wystarczy odpowiedź na pytanie
 * „czy coś dopłacę i ile", a `undefined` uczciwie znaczy „nie wiemy".
 */
export function taxNoticeFromSlim(
  taxesIncluded: boolean | undefined,
  taxExtraAmount: number | undefined,
  currency: string,
): TaxNotice {
  if (taxesIncluded === undefined) return { kind: "unknown" };
  if (taxesIncluded) return { kind: "all-included" };
  return {
    kind: "extra-at-property",
    amountMinor: typeof taxExtraAmount === "number" ? BigInt(Math.round(taxExtraAmount * 100)) : null,
    currency: typeof taxExtraAmount === "number" ? currency : null,
  };
}
