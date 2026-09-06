// Wyciąganie ROKU z tekstu użytkownika — MECHANICZNIE, nie przez model.
//
// PO CO. Model dostaje w schemacie `get_trip_offer` pole `year` z jawną
// instrukcją, żeby je wypełnić, gdy użytkownik wymienił rok. Pomiar na Preview
// (2026-09-06, haiku-4.5) pokazał, że tego NIE ROBI: na „chcemy lecieć 10–17
// sierpnia 2026" narzędzie dostało `month: 8` i nic więcej, więc system
// rozwiązał sierpień na najbliższy przyszły (2027) i tłumaczył użytkownikowi,
// że jego termin jest „za daleko" — o terminie, który właśnie MINĄŁ.
//
// To jest dokładnie ten wzorzec, który w tym projekcie już raz kosztował:
// taniemu modelowi nie ufamy w rzeczach, które da się policzyć. Rok jest
// czterema cyframi w tekście — wyciągamy go sami i traktujemy jako podpowiedź
// uzupełniającą to, czego model nie podał.
//
// Świadomie NIE budujemy tu parsera dat. Interesuje nas JEDNA rzecz: czy
// użytkownik wskazał konkretny rok, bo tylko to pozwala odróżnić „sierpień"
// (= najbliższy przyszły) od „sierpień 2026" (= termin, który minął).

/** Zakres lat, które w kontekście podróży w ogóle mają sens. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/**
 * Rok wymieniony wprost w tekście albo `undefined`.
 *
 * Bierzemy OSTATNI napotkany rok: w zdaniu „w zeszłym roku byliśmy w 2025,
 * teraz myślimy o sierpniu 2026" to ten drugi jest prośbą, a pierwszy
 * wspomnieniem. Heurystyka, ale w jedną stronę bezpieczna — najgorsze, co
 * może się stać, to że nie rozpoznamy terminu jako przeszłego i zachowamy się
 * jak dotąd.
 *
 * DWA odsiewy, oba wymuszone realnymi zdaniami z tego produktu:
 *   • liczba przyklejona do innych cyfr albo z częścią dziesiętną („12026",
 *     „2026,50") nie jest rokiem,
 *   • liczba, po której stoi WALUTA, jest BUDŻETEM, nie rokiem. To nie jest
 *     hipotetyczne: budżety w tym produkcie są czterocyfrowe i regularnie
 *     wpadają w zakres lat („do 2000 zł na osobę", „mamy 2050 zł").
 */
export function extractExplicitYear(text: unknown): number | undefined {
  if (typeof text !== "string" || text.length === 0) return undefined;
  // Grupa 2 łapie ewentualną walutę tuż za liczbą — jeśli jest, to był budżet.
  const re = /(?<![\d,.])(20\d{2})(?![\d,.])\s*(zł|zl|PLN|złotych|zlotych|euro|EUR|€)?/gi;
  let best: number | undefined;
  for (const m of text.matchAll(re)) {
    if (m[2]) continue;
    const year = Number(m[1]);
    if (year >= MIN_YEAR && year <= MAX_YEAR) best = year;
  }
  return best;
}

export interface UserDateHints {
  /** Rok wskazany wprost przez użytkownika (jeśli w ogóle). */
  year?: number;
}

/** Podpowiedzi z OSTATNIEJ wiadomości użytkownika — tej, na którą odpowiadamy. */
export function extractUserDateHints(lastUserText: unknown): UserDateHints {
  const year = extractExplicitYear(lastUserText);
  return year === undefined ? {} : { year };
}
