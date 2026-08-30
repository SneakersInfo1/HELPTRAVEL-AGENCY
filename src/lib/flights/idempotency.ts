// Klucz idempotencji prebooka lotu.
//
// Wydzielone ze strony `/loty/pasazerowie`, bo to kontrola BEZPIECZEŃSTWA, a
// nie detal formularza — i jako kod wewnątrz komponentu klienckiego nie dało
// się jej przetestować.
//
// ── DLACZEGO TO MUSI BYĆ NIEPRZEWIDYWALNE ────────────────────────────────────
//
// Klucz identyfikuje wpis w cache'u prebooka, a ten cache zwraca `secretKey`
// (Stripe client secret). Poprzedni fallback brzmiał `String(Date.now())` —
// znacznik czasu w milisekundach, czyli wartość, którą da się zgadnąć.
// Wystarczyło trafić w cudzy klucz, żeby dostać cudze poświadczenie płatności.
// Serwer domknął tę dziurę od swojej strony (wpis wydaje tylko żądaniu o tym
// samym odcisku: oferta + e-mail + kwota + waluta), ale klucz i tak nie ma
// prawa być zgadywalny — dwie warstwy, nie jedna.

/**
 * Nowy klucz idempotencji. Pusty string, gdy przeglądarka nie ma ŻADNEGO
 * źródła losowości.
 *
 * Pusty jest tu świadomym wyborem: front pomija wtedy nagłówek, więc dwa
 * kliknięcia zrobią dwa locki taryfy u dostawcy. To kosztuje jeden porzucony
 * lock (wygasa sam, bez obciążenia). Klucz zgadywalny kosztowałby cudzy
 * `secretKey` — czyli nieporównanie więcej.
 */
export function newIdempotencyKey(): string {
  // `crypto` jest typowane jako zawsze pełne `Crypto`, a w praktyce
  // `randomUUID` istnieje tylko w kontekście zabezpieczonym (HTTPS/localhost) —
  // stąd odczyt przez `unknown`, a nie przez zawężanie typu.
  const c = (typeof crypto !== "undefined" ? crypto : undefined) as
    | { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array }
    | undefined;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  if (typeof c?.getRandomValues === "function") {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  return "";
}
