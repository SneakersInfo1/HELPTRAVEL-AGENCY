// Kwoty w lejku lotów — JEDNO miejsce, które decyduje, jak wygląda liczba.
//
// CZYSTE (zero I/O), więc testowalne bez sieci i bez `server-only`.
//
// ── DLACZEGO TO POWSTAŁO ──────────────────────────────────────────────────
//
// Audyt 2026-08-29 zmierzył na żywej ofercie WAW→BCN:
//
//   /flights/verify zwrócił   1918.34 PLN
//   UI pokazywało              „1918 zł"        (fmtMoneyPln, 0 miejsc po przecinku)
//   mail pokazywał             „1918.34 PLN"    (toFixed(2), kropka, kod waluty)
//   karta obciążana jest       1918.34 PLN
//
// Trzy różne zapisy jednej transakcji i jeden z nich — ten, który użytkownik
// widzi tuż nad przyciskiem „Zapłać" — jest NIŻSZY niż to, co realnie schodzi
// z karty. Przy `maximumFractionDigits: 0` różnica sięga 50 gr w obie strony.
//
// Systemowe `formatPricePln`/`formatPLN` zostają bez zmian i są DALEJ właściwe
// tam, gdzie liczba jest ORIENTACYJNA („od 959 zł/os.", progi filtrów) — tam
// grosze to szum. Ale kwota, którą użytkownik ZATWIERDZA, musi być pokazana
// co do grosza. To rozróżnienie jest tu jedyną nową ideą.

/** Separator tysięcy i spacja przed „zł" to U+00A0 (Intl pl-PL) — nie zwykła spacja. */

/**
 * Kwota ORIENTACYJNA — pełne złote.
 *
 * Do list, nagłówków („Najtańszy lot od…"), progów filtrów. Wszędzie tam, gdzie
 * liczba służy do porównywania, a nie do zatwierdzania.
 */
export function formatFlightPrice(amount: number | null, currency = "PLN"): string {
  if (amount === null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    useGrouping: "always",
  }).format(amount);
}

/**
 * Kwota TRANSAKCYJNA — dokładnie ta, którą obciążymy kartę.
 *
 * Grosze pokazujemy TYLKO wtedy, gdy istnieją: `1918,34 zł`, ale `2780 zł`
 * (a nie `2780,00 zł`). Powód jest praktyczny, nie estetyczny — ceny lotów
 * z GDS bywają okrągłe i dopisywanie „,00" do każdej kwoty robi z czytelnej
 * liczby paragon, a przy tym sugeruje precyzję tam, gdzie jej nie ma.
 *
 * Używaj na: wyborze taryfy, „Razem" w checkoutcie, „Do zapłaty", „Zapłacono",
 * w mailu i w modalu zmiany ceny.
 */
export function formatFlightPriceExact(amount: number | null, currency = "PLN"): string {
  if (amount === null || !Number.isFinite(amount)) return "—";
  // Zaokrąglenie do grosza PRZED sprawdzeniem reszty: 1918.3400000000001
  // (typowy artefakt IEEE-754 po dzieleniu) ma mieć 2 miejsca, nie 13.
  const grosze = Math.round(amount * 100);
  const hasFraction = grosze % 100 !== 0;
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
    useGrouping: "always",
  }).format(grosze / 100);
}

/**
 * Średnia cena na podróżnego.
 *
 * NAZWA JEST CELOWA. Poprzednia wersja liczyła to samo działanie, ale
 * podpisywała je „959 zł/os.", czyli obietnicą, że tyle zapłaci każda osoba.
 * To nieprawda w dwóch przypadkach naraz: taryfa dziecięca bywa tańsza, a
 * niemowlę na kolanach kosztuje ułamek biletu dorosłego. Suma podzielona przez
 * liczbę podróżnych jest ŚREDNIĄ i tylko tak wolno ją podpisać.
 *
 * `null`, gdy nie ma z czego liczyć — nigdy 0, żeby UI nie pokazał „0 zł".
 */
export function averagePerTraveller(total: number | null, travellers: number): number | null {
  if (total === null || !Number.isFinite(total) || travellers <= 0) return null;
  return total / travellers;
}

/**
 * Próg istotnej różnicy cen: 1 grosz.
 *
 * Poniżej progu różnica pochodzi z arytmetyki zmiennoprzecinkowej (dostawca
 * oddaje floaty), a nie ze zmiany oferty. Ten sam próg obowiązuje w verify
 * i w bramce prebooka — inaczej jedno miejsce uznałoby zmianę, a drugie nie.
 */
export const PRICE_EPSILON = 0.005;

/** `true`, gdy kwoty różnią się o więcej niż grosz. `null` po którejkolwiek stronie = brak porównania. */
export function priceChanged(a: number | null | undefined, b: number | null | undefined): boolean {
  if (typeof a !== "number" || typeof b !== "number") return false;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) > PRICE_EPSILON;
}

/** Różnica `nowa − stara` zaokrąglona do grosza. Dodatnia = drożej. */
export function priceDelta(oldTotal: number, newTotal: number): number {
  return Math.round((newTotal - oldTotal) * 100) / 100;
}

/**
 * Etykieta kierunku zmiany ceny do modalu. Rozróżnienie ma znaczenie:
 * „cena spadła" nie może być podana tym samym tonem co „cena wzrosła".
 */
export function priceChangeDirection(oldTotal: number, newTotal: number): "up" | "down" | "same" {
  const d = priceDelta(oldTotal, newTotal);
  if (d > 0) return "up";
  if (d < 0) return "down";
  return "same";
}
