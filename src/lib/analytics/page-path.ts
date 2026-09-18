// Kanoniczna ścieżka strony dla analityki — JEDNO źródło prawdy.
//
// POWÓD ISTNIENIA (audyt GA4, wrzesień 2026): ~47% wierszy eksploracji miało
// zduplikowany query string w `page_path`:
//
//   /?tab=loty?tab=loty
//   /hotele/szukaj?…?…
//
// Zduplikowana ścieżka rozbija JEDNĄ stronę na dwa różne wiersze raportu, więc
// każdy lejek „organic landing → CTA → search" liczył wejścia dwa razy albo
// gubił połowę. Poprawka musi siedzieć U ŹRÓDŁA generowania ścieżki, nie
// w raportach — stąd ten moduł.
//
// Mechanizm duplikacji: emiter `page_view` składał ścieżkę ręcznie jako
// `pathname + "?" + searchParams`. Wystarczy, że `pathname` sam nosi już query
// (a niesie: patrz `window.history.replaceState` w home-search-tabs.tsx, które
// od Next 14.1 wpływa na wynik `usePathname()`), i dostajemy dwa znaki `?`.
//
// DRUGA funkcja tego modułu to higiena danych. Do GA4 leciał komplet parametrów
// URL-a powrotu z płatności:
//
//   /hotele/rezerwacja/return?sid=…&payment_intent=pi_…&payment_intent_client_secret=pi_…_secret_…
//
// `payment_intent_client_secret` to poświadczenie Stripe’a (pozwala po stronie
// klienta operować na tym PaymentIntent), a `sid` to klucz sesji rezerwacji
// w Redisie. Nic takiego nie ma prawa opuścić serwisu w parametrze zdarzenia
// analitycznego — więc wartości takich parametrów są tu zastępowane stałą.
// Klucz ZOSTAJE (widać, że parametr był, a kardynalność raportu się nie psuje),
// ginie tylko wartość.

/**
 * Parametry, których WARTOŚCI nigdy nie trafiają do analityki.
 *
 * Dobór: poświadczenia i identyfikatory sesji (Stripe, nasz `sid`) oraz
 * typowe nośniki danych osobowych. Porównanie idzie po nazwie w lowercase.
 */
const PARAMETRY_DO_UTAJNIENIA: ReadonlySet<string> = new Set([
  // Stripe — sekret klienta pozwala operować na PaymentIntent z przeglądarki.
  "payment_intent",
  "payment_intent_client_secret",
  "setup_intent",
  "setup_intent_client_secret",
  "source",
  "client_secret",
  // Nasza sesja rezerwacji (klucz w Redisie).
  "sid",
  // Dane osobowe — nie powinny się pojawić w URL-u, ale jeśli się pojawią,
  // analityka ma być ostatnim miejscem, które je utrwali.
  "email",
  "mail",
  "phone",
  "tel",
  "firstname",
  "lastname",
  "fullname",
  "surname",
  // Poświadczenia w ogóle.
  "token",
  "access_token",
  "id_token",
  "secret",
  "apikey",
  "api_key",
  "password",
]);

/** Wartość wstawiana w miejsce utajnionej. */
export const UTAJNIONE = "redacted";

/**
 * `source` bywa też zwykłym parametrem UTM-podobnym (`?source=newsletter`),
 * a jako parametr Stripe’a występuje WYŁĄCZNIE na stronach powrotu
 * z płatności. Utajnianie go wszędzie zabrałoby użyteczny wymiar, więc
 * zawężamy to do ścieżek płatności.
 */
const PARAMETRY_TYLKO_NA_PLATNOSCI: ReadonlySet<string> = new Set(["source"]);

function czySciezkaPlatnosci(pathname: string): boolean {
  return pathname.includes("/rezerwacja") || pathname.includes("/platnosc") || pathname.includes("/potwierdzenie");
}

/**
 * Obcina `pathname` do samej ścieżki: ucina od pierwszego `?` albo `#`.
 *
 * Zwraca też odciętą część query, bo bywa jedynym nośnikiem parametrów —
 * gdy `useSearchParams()` jeszcze nie ma wartości, a `usePathname()` niesie
 * już adres z query, wyrzucenie tej części zgubiłoby dane.
 */
function rozbijSciezke(raw: string): { pathname: string; osieroconeQuery: string } {
  const bezHasha = raw.split("#")[0] ?? "";
  const indeksQuery = bezHasha.indexOf("?");
  if (indeksQuery === -1) return { pathname: bezHasha, osieroconeQuery: "" };
  return {
    pathname: bezHasha.slice(0, indeksQuery),
    osieroconeQuery: bezHasha.slice(indeksQuery + 1),
  };
}

/**
 * Normalizuje surowy query string do listy par, usuwając duplikaty.
 *
 * Każdy nadmiarowy `?` jest traktowany jak separator (czyli `&`) — to
 * dokładnie ten przypadek, który produkował `tab=loty?tab=loty`. Po rozbiciu
 * identyczne pary `klucz=wartość` są sklejane do jednej. Pary o tym samym
 * kluczu, ale RÓŻNEJ wartości zostają obie: to legalny URL, a zgadywanie,
 * która wartość jest „prawdziwa", byłoby cichym psuciem danych.
 */
function normalizujQuery(raw: string): Array<[string, string]> {
  const oczyszczony = raw.replace(/^[?&]+/, "").replace(/\?/g, "&");
  if (!oczyszczony) return [];

  const pary: Array<[string, string]> = [];
  const widziane = new Set<string>();
  for (const [klucz, wartosc] of new URLSearchParams(oczyszczony)) {
    if (!klucz) continue;
    const odcisk = `${klucz}=${wartosc}`;
    if (widziane.has(odcisk)) continue;
    widziane.add(odcisk);
    pary.push([klucz, wartosc]);
  }
  return pary;
}

function utajnij(pary: Array<[string, string]>, pathname: string): Array<[string, string]> {
  const naPlatnosci = czySciezkaPlatnosci(pathname);
  return pary.map(([klucz, wartosc]) => {
    const nazwa = klucz.toLowerCase();
    const utajniony =
      PARAMETRY_DO_UTAJNIENIA.has(nazwa) &&
      (!PARAMETRY_TYLKO_NA_PLATNOSCI.has(nazwa) || naPlatnosci);
    return utajniony ? ([klucz, UTAJNIONE] as [string, string]) : ([klucz, wartosc] as [string, string]);
  });
}

/**
 * Składa kanoniczną ścieżkę analityczną: JEDEN pathname + JEDEN query string.
 *
 * Gwarancje (sprawdzane testami):
 *   • w wyniku jest najwyżej jeden znak `?`,
 *   • wynik zaczyna się od `/`,
 *   • wartości parametrów z listy utajnionych nie wychodzą na zewnątrz,
 *   • brak fragmentu (`#…`) — GA4 i tak go nie raportuje w page_path.
 *
 * @param rawPathname ścieżka; MOŻE błędnie zawierać query lub hash
 * @param rawSearch   query string; może być z wiodącym `?`, puste lub null
 */
export function analyticsPagePath(rawPathname: string | null | undefined, rawSearch?: string | null): string {
  const { pathname: surowaSciezka, osieroconeQuery } = rozbijSciezke(String(rawPathname ?? ""));

  let pathname = surowaSciezka;
  if (!pathname) pathname = "/";
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;

  // `rawSearch` jest źródłem pierwszego wyboru; query wyłuskane z `pathname`
  // służy jako awaryjne, gdy tamtego nie ma.
  const zSearch = normalizujQuery(String(rawSearch ?? ""));
  const pary = zSearch.length > 0 ? zSearch : normalizujQuery(osieroconeQuery);
  const bezpieczne = utajnij(pary, pathname);

  if (bezpieczne.length === 0) return pathname;

  const query = bezpieczne
    .map(([klucz, wartosc]) => (wartosc === "" ? encodeURIComponent(klucz) : `${encodeURIComponent(klucz)}=${encodeURIComponent(wartosc)}`))
    .join("&");

  return `${pathname}?${query}`;
}

/**
 * Kanoniczna ścieżka BIEŻĄCEJ strony, czytana z `window.location`.
 *
 * `window.location.pathname` jest normalizowany przez przeglądarkę i nigdy nie
 * zawiera `?`, więc to najpewniejsze dostępne źródło — pewniejsze niż
 * `usePathname()`. Na serwerze zwraca `""` (wywołania analityczne i tak
 * no-opują poza przeglądarką).
 */
export function currentAnalyticsPagePath(): string {
  if (typeof window === "undefined") return "";
  try {
    return analyticsPagePath(window.location.pathname, window.location.search);
  } catch {
    return "";
  }
}

// ─── Strona wejścia (landing) — PAMIĘĆ ULOTNA, bez zapisu na urządzeniu ────
//
// Problem z audytu: baner zgody bywa akceptowany z opóźnieniem, a `page_view`
// leci dopiero po zgodzie. Jeśli użytkownik w tym czasie przeklika się dalej,
// GA4 uzna za stronę wejścia tę DRUGĄ stronę — i cały raport „organic landing"
// pokazuje nie to, co trzeba.
//
// Świadomie NIE używamy localStorage ani sessionStorage: zapis na urządzeniu
// użytkownika przed zgodą to dokładnie to, czego zabrania ePrivacy (art. 173
// Prawa komunikacji elektronicznej). Zmienna modułowa żyje tylko w pamięci
// karty, nie przetrwa przeładowania i nie jest „przechowywaniem informacji
// w urządzeniu końcowym" — więc nie wymaga zgody, a ratuje ten przypadek,
// który w praktyce jest najczęstszy: zgoda udzielona w tej samej wizycie.
let sciezkaWejscia: string | null = null;

/** Zapamiętuje PIERWSZĄ ścieżkę w tej wizycie. Kolejne wywołania nie nadpisują. */
export function rememberLandingPath(path: string): void {
  if (sciezkaWejscia !== null) return;
  if (!path) return;
  sciezkaWejscia = path;
}

/** Ścieżka wejścia zapamiętana w tej karcie albo `null`, jeśli nieznana. */
export function getLandingPath(): string | null {
  return sciezkaWejscia;
}

/** Tylko dla testów — czyści pamięć strony wejścia. */
export function resetLandingPathForTests(): void {
  sciezkaWejscia = null;
}
