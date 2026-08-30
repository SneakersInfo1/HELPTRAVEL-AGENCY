// KONTRAKT NAZW z dostawcą lotów — jedno miejsce dla progu długości imienia
// i nazwiska, dla rozpoznania błędu dostawcy i dla wskazania pola w formularzu.
//
// ── SKĄD TEN PRÓG ────────────────────────────────────────────────────────────
//
// Zmierzony na produkcyjnym kluczu sondą różnicową (2026-08-30). Prebook, w
// którym imię/nazwisko ma mniej niż 3 znaki, wraca jako HTTP 500 z ciałem:
//
//   {"error":{"code":53099,"description":
//     "Contact name is too short — must be at least 3 characters;
//      Passenger 1 name is too short — must be at least 3 characters"}}
//
// HTTP 500 jest tu MYLĄCY: to nie jest awaria dostawcy, tylko odrzucenie
// danych wejściowych. Ten sam payload zawsze dostanie tę samą odpowiedź, więc
// ponawianie żądania jest czystą stratą (a przy `retries:3` z klienta LiteAPI
// było potrojeniem ruchu na każdą nieudaną próbę użytkownika).
//
// ── CZEGO TU NIE MA I NIE BĘDZIE ─────────────────────────────────────────────
//
// Nie ma normalizatora, który „naprawia" za krótkie nazwisko. „Li", „Ng", „Ho"
// to prawdziwe, legalne nazwiska. Dopisanie spacji, zdublowanie litery czy
// jakakolwiek inna korekta oznaczałaby wysłanie do przewoźnika danych
// NIEZGODNYCH Z DOKUMENTEM podróży — a tego nie da się potem zmienić i kończy
// się odmową odprawy. Jedyne uczciwe zachowanie to powiedzieć wprost, że to
// ograniczenie techniczne po naszej stronie, i podać kontakt.

/** Minimalna długość imienia/nazwiska akceptowana przez dostawcę. */
export const PROVIDER_MIN_NAME_CHARS = 3;

export const NAME_TOO_SHORT_FIRST = "Imię musi mieć co najmniej 3 znaki.";
export const NAME_TOO_SHORT_LAST = "Nazwisko musi mieć co najmniej 3 znaki.";
export const NAME_TOO_SHORT_GENERIC = "Imię i nazwisko muszą mieć co najmniej 3 znaki.";
/**
 * Podpowiedź dla osób, których prawdziwe imię lub nazwisko jest krótsze.
 * Świadomie NIE nazywa dostawcy ani kodu błędu — to nasze ograniczenie wobec
 * klienta, nie jego problem z cudzym API.
 */
export const NAME_TOO_SHORT_HELP =
  "Jeśli Twoje prawidłowe imię lub nazwisko ma mniej niż 3 znaki, skontaktuj się z HelpTravel — zarezerwujemy ten lot dla Ciebie ręcznie.";

/**
 * Długość imienia w ZNAKACH — po obcięciu spacji i po złożeniu znaków
 * diakrytycznych (NFC). Bez `normalize` nazwisko wpisane w formie rozłożonej
 * („Zo" + łączący akcent) liczyłoby się jako 3 znaki i przeszłoby próg,
 * którego dostawca mu nie policzy. Rozkład na punkty kodowe (`[...]`) zamiast
 * `.length` — żeby jeden znak spoza BMP nie liczył się za dwa.
 */
export function nameLength(value: string): number {
  return [...value.trim().normalize("NFC")].length;
}

export function isNameLongEnough(value: string): boolean {
  return nameLength(value) >= PROVIDER_MIN_NAME_CHARS;
}

// ── Rozpoznanie odpowiedzi dostawcy ──────────────────────────────────────────

/** Kod dostawcy dla odrzuconych danych pasażera (za krótkie / testowe nazwisko). */
const PROVIDER_VALIDATION_CODE = 53099;

const TOO_SHORT_RE = /name\s+is\s+too\s+short|at\s+least\s+3\s+characters/i;

/** Sklejony opis + message z ciała błędu LiteAPI. Pusty string, gdy nie ma. */
function providerText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const e = (body as { error?: { description?: unknown; message?: unknown } }).error;
  if (!e || typeof e !== "object") return "";
  const desc = typeof e.description === "string" ? e.description : "";
  const msg = typeof e.message === "string" ? e.message : "";
  return `${desc} ${msg}`.trim();
}

function providerCode(body: unknown): number | undefined {
  if (!body || typeof body !== "object") return undefined;
  const e = (body as { error?: { code?: unknown } }).error;
  if (!e || typeof e !== "object") return undefined;
  const code = typeof e.code === "number" ? e.code : Number(e.code);
  return Number.isFinite(code) ? code : undefined;
}

/**
 * Czy to walidacja DETERMINISTYCZNA — czyli odrzucenie, które przy tym samym
 * payloadzie powtórzy się zawsze? Tylko wtedy wolno zabrać żądaniu retry.
 *
 * CELOWO WĄSKIE: kod 53099 (udowodniony pomiarem) plus obronnie sam opis
 * „name is too short", gdyby dostawca przenumerował kody. Zwykła awaria 5xx,
 * timeout czy 52099 („failed to verify") NIE przechodzą przez tę bramkę i
 * zachowują dotychczasową politykę ponawiania.
 */
export function isDeterministicProviderValidation(body: unknown): boolean {
  if (providerCode(body) === PROVIDER_VALIDATION_CODE) return true;
  return TOO_SHORT_RE.test(providerText(body));
}

/**
 * Czy dostawca odrzucił dane KONKRETNIE z powodu długości nazwy?
 *
 * Węższe od `isDeterministicProviderValidation`, bo 53099 wraca też przy
 * nazwiskach wyglądających na testowe („cannot contain numbers"). Pokazanie
 * wtedy komunikatu o trzech znakach byłoby po prostu nieprawdą.
 */
export function isProviderNameTooShort(body: unknown): boolean {
  return TOO_SHORT_RE.test(providerText(body));
}

// ── Wskazanie pola ───────────────────────────────────────────────────────────

export type IssuePath = Array<string | number>;
export interface FieldIssue {
  path: IssuePath;
  message: string;
}

function nameIssuesFor(prefix: IssuePath): FieldIssue[] {
  return [
    { path: [...prefix, "firstName"], message: NAME_TOO_SHORT_FIRST },
    { path: [...prefix, "lastName"], message: NAME_TOO_SHORT_LAST },
  ];
}

/**
 * Zamienia opis od dostawcy na listę pól do podświetlenia.
 *
 * Opis mówi, KOGO dotyczy problem („Contact", „Passenger 1"), ale nie mówi,
 * czy chodzi o imię czy o nazwisko — więc wskazujemy oba pola tej osoby.
 * Gdy nie da się rozpoznać celu, zwracamy pustą listę: lepiej pokazać
 * komunikat ogólny niż obwinić przypadkowe pole.
 */
export function nameTooShortIssues(description: string): FieldIssue[] {
  if (!description) return [];
  let contact = false;
  const passengers = new Set<number>();

  for (const clause of description.split(";")) {
    if (!TOO_SHORT_RE.test(clause)) continue;
    const pax = /passenger\s+(\d+)/i.exec(clause);
    if (pax) {
      const n = Number(pax[1]);
      if (Number.isInteger(n) && n >= 1) passengers.add(n - 1);
      continue;
    }
    if (/contact/i.test(clause)) contact = true;
  }

  const issues: FieldIssue[] = [];
  if (contact) issues.push(...nameIssuesFor(["contact"]));
  for (const i of [...passengers].sort((a, b) => a - b)) issues.push(...nameIssuesFor(["passengers", i]));
  return issues;
}

/**
 * Ścieżka issue → identyfikator pola w formularzu `/loty/pasazerowie`.
 * `null`, gdy błąd nie dotyczy żadnego widocznego pola (np. `offerId`) —
 * wołający pokazuje wtedy komunikat zbiorczy zamiast przewijać w próżnię.
 */
export function formFieldKey(path: IssuePath): string | null {
  if (path[0] === "passengers" && typeof path[1] === "number" && typeof path[2] === "string") {
    return `p${path[1]}.${path[2]}`;
  }
  if (path[0] === "contact" && typeof path[1] === "string") return `c.${path[1]}`;
  return null;
}

// ── Sanityzacja opisu do logu ────────────────────────────────────────────────

const MAX_DESCRIPTION_CHARS = 300;

/**
 * Opis błędu dostawcy przygotowany DO ZAPISU.
 *
 * `redactPii` z klienta LiteAPI czyści ciało po KLUCZACH pola (email, phone,
 * card) — a opis to jeden string, w którym dane siedzą w środku zdania. Ta
 * funkcja robi drugą, komplementarną rzecz: usuwa wartości cytowane (tam
 * dostawcy echują to, co wysłaliśmy), sekrety płatnicze, klucze API i adresy
 * e-mail, a na końcu przycina długość.
 */
export function sanitizeProviderDescription(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    // Wartości w cudzysłowie — tu trafia echo imienia/nazwiska/numeru dokumentu.
    .replace(/"[^"]*"/g, '"[USUNIETE]"')
    .replace(/'[^']*'/g, "'[USUNIETE]'")
    // Stripe client secret (`pi_<id>_secret_<...>`) i wszystko, co go przypomina.
    .replace(/[A-Za-z0-9]*_secret_[A-Za-z0-9_-]+/g, "[USUNIETE]")
    // Klucze LiteAPI.
    .replace(/\b(?:prod|sand)_[A-Za-z0-9]{8,}/g, "[USUNIETE]")
    // Adresy e-mail.
    .replace(/[^\s"'<>()]+@[^\s"'<>()]+/g, "[USUNIETE]")
    .slice(0, MAX_DESCRIPTION_CHARS);
}
