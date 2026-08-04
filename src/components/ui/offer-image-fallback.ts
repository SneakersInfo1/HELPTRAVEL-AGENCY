// Dobór zastępnika zdjęcia — wydzielony z `offer-image.tsx`, żeby dało się go
// przetestować.
//
// Powód wydzielenia: `offer-image.tsx` ma dyrektywę "use client" i importuje
// `next/image`, więc `node:test` nie potrafi go załadować. Reguła doboru jest
// czystą funkcją i to ona niesie wymaganie właściciela („fallback ma być
// deterministyczny i powiązany z kierunkiem"), więc mieszka osobno.

/**
 * Sześć wariantów tła zastępnika, wszystkie z palety marki.
 *
 * To celowo NIE jest zdjęcie: nie mamy fotografii tego miejsca, więc nie
 * podstawiamy zdjęcia innego. Kafel „Góry i natura" ze zdjęciem przypadkowej
 * ulicy szkodzi wiarygodności bardziej, niż brak zdjęcia pomaga.
 */
const TLA = [
  "bg-brand-soft",
  "bg-surface-sunken",
  "bg-emerald-100",
  "bg-emerald-50",
  "bg-teal-50",
  "bg-lime-50",
] as const;

/**
 * Deterministyczny wybór tła na podstawie identyfikatora oferty.
 *
 * Ta sama oferta zawsze dostaje ten sam kafel — bez tego zastępnik zmieniałby
 * się przy każdym renderze i „mrugał" przy nawigacji. Jednocześnie sąsiednie
 * karty wychodzą różne, więc rząd zastępników nie wygląda jak awaria jednego
 * komponentu.
 */
export function wybierzTloZastepnika(kluczZastepnika: string): string {
  let suma = 0;
  for (let i = 0; i < kluczZastepnika.length; i += 1) {
    suma = (suma * 31 + kluczZastepnika.charCodeAt(i)) >>> 0;
  }
  return TLA[suma % TLA.length];
}
