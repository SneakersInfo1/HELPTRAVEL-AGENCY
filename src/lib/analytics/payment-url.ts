// Czyszczenie adresu powrotu z płatności z poświadczeń dostawcy.
//
// Moduł jest CZYSTY (bez Reacta i bez `window`) po to, żeby dało się go
// przetestować jednostkowo — komponent `StripPaymentSecrets` jest tylko
// opakowaniem, które podaje mu bieżący adres.
//
// KONTRAKT, KTÓREGO PILNUJĄ TESTY:
//   • usuwamy wyłącznie parametry, których NIE CZYTA żaden kod w repo,
//   • nigdy nie ruszamy parametrów, od których zależy finalizacja rezerwacji.
//
// Ta druga reguła nie jest ostrożnościowa, tylko wynika z pomiaru: strona
// powrotu hotelu bez `sid` renderuje ekran „Brak identyfikatora sesji", więc
// wycięcie `sid` zamieniłoby odświeżenie po udanej płatności w komunikat
// o błędzie. Sekret Stripe'a jest inny — nie czyta go nic, więc jego usunięcie
// jest niewidoczne dla produktu.

/**
 * Poświadczenia doklejane przez dostawcę płatności do adresu powrotu.
 *
 * Warunek wejścia na tę listę jest podwójny: parametr musi być
 * poświadczeniem ORAZ nie może go czytać żaden kod w repo. Sprawdzone
 * przeszukaniem `src/` — poza komentarzami nie ma do nich odwołań.
 */
export const SEKRETY_W_ADRESIE = [
  "payment_intent_client_secret",
  "setup_intent_client_secret",
  "client_secret",
] as const;

/**
 * Parametry, których finalizacja rezerwacji POTRZEBUJE.
 *
 * Lista istnieje po to, żeby test mógł sprawdzić, że nie przecięła się
 * z listą wyżej — a nie po to, żeby cokolwiek filtrować.
 *
 *   • `sid`             — sesja rezerwacji w Redisie, zarazem Idempotency-Key
 *                         i identyfikator podawany klientowi do kontaktu
 *   • `payment_intent`  — wiązanie płatności, przekazywane do finalizacji
 *   • `redirect_status` — werdykt Stripe'a o wyniku płatności
 */
export const PARAMETRY_WYMAGANE_PRZEZ_FLOW = ["sid", "payment_intent", "redirect_status"] as const;

/**
 * Zwraca adres bez poświadczeń albo `null`, gdy nie było czego usuwać.
 *
 * `null` zamiast „ten sam adres" jest celowe: komponent wywołujący ma dzięki
 * temu jednoznaczny sygnał, czy w ogóle dotykać historii przeglądarki. Pisanie
 * do `history` bez potrzeby to niepotrzebne ryzyko na ścieżce płatniczej.
 *
 * @param href pełny adres (`window.location.href`) albo sama ścieżka z query
 */
export function stripPaymentSecrets(href: string): string | null {
  let url: URL;
  try {
    // Baza pozwala podać zarówno pełny adres, jak i samą ścieżkę.
    url = new URL(href, "https://helptravel.local");
  } catch {
    return null;
  }

  let zmieniono = false;
  for (const klucz of SEKRETY_W_ADRESIE) {
    if (url.searchParams.has(klucz)) {
      url.searchParams.delete(klucz);
      zmieniono = true;
    }
  }
  if (!zmieniono) return null;

  const wzgledny = `${url.pathname}${url.search}${url.hash}`;
  // Adres bezwzględny zostaje bezwzględny — inaczej zmienilibyśmy jego rodzaj.
  return /^https?:\/\//i.test(href) ? `${url.origin}${wzgledny}` : wzgledny;
}
