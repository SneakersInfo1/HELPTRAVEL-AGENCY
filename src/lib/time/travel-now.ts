// JEDNO źródło prawdy o „dziś" dla całego produktu podróżnego.
//
// PO CO (incydent 2026-09-06): startery czatu proponowały „Plaża do 3000 zł
// w sierpniu", a karta oferty wypisywała „10–17 sierpnia" — we wrześniu.
// Diagnoza pokazała, że czas był rozsypany po kilkunastu miejscach: część
// kodu liczyła dzień przez `new Date().toISOString().slice(0,10)` (czyli
// w UTC), część brała miesiąc z `getUTCMonth()`, a warstwa renderu w ogóle
// nie pokazywała roku. Żadne z tych miejsc nie było samo w sobie błędne —
// błędem był brak jednej definicji, względem której da się to sprawdzić.
//
// KONWENCJA: HelpTravel sprzedaje w Polsce, więc „dziś" znaczy dziś
// w Europe/Warsaw. To NIE jest kosmetyka: przez dwie godziny każdej doby
// (00:00–02:00 lokalnie latem) UTC pokazuje dzień wcześniej, więc oferta
// na jutro byłaby liczona od wczoraj, a data graniczna „nie z przeszłości"
// przepuszczałaby dzień, który w Polsce już minął.
//
// ARYTMETYKA DAT robiona jest na północy UTC (`YYYY-MM-DDT00:00:00Z`),
// a nie na czasie lokalnym — dzięki temu dodanie doby jest zawsze dodaniem
// 86 400 000 ms i zmiana czasu (ostatnia niedziela marca/października) nie
// gubi ani nie dubluje dnia. Strefa wchodzi do gry TYLKO tam, gdzie z
// timestampu wyciągamy kalendarzowy dzień — czyli w `travelToday`.

/** Strefa, w której produkt definiuje „dziś". */
export const TRAVEL_TIMEZONE = "Europe/Warsaw";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Zegar wstrzyknięty w testach (epoch ms). `undefined` = zegar systemowy. */
let testClockMs: number | undefined;

/**
 * Szew testowy. Ustawia „teraz" dla całego modułu — używaj w testach, które
 * sprawdzają zachowanie zależne od kalendarza (rollover roku, przeszłe daty).
 */
export function __setTravelClockForTests(nowMs: number): void {
  testClockMs = nowMs;
}
export function __resetTravelClockForTests(): void {
  testClockMs = undefined;
}

/** „Teraz" w epoch ms — jedyne miejsce, w którym wolno sięgnąć po Date.now(). */
export function travelNowMs(): number {
  return testClockMs ?? Date.now();
}

const DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TRAVEL_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Kalendarzowy dzień (YYYY-MM-DD) w Europe/Warsaw dla podanego momentu.
 * `en-CA` daje dokładnie format ISO, więc nie sklejamy części ręcznie.
 */
export function travelToday(nowMs: number = travelNowMs()): string {
  return DAY_FORMATTER.format(new Date(nowMs));
}

/** Czy string to poprawna, ISTNIEJĄCA data kalendarzowa w formacie YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  // Round-trip odsiewa daty, które pasują do wzorca, ale nie istnieją
  // (2026-02-30 → Date normalizuje na 2026-03-02, więc nie wróci to samo).
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function toUtcMidnight(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Data przesunięta o `days` dób (może być ujemne). Wejście musi być ISO. */
export function addDaysIso(iso: string, days: number): string {
  return new Date(toUtcMidnight(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Liczba dób między datami (dodatnia, gdy `to` jest później). */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / 86_400_000);
}

/** Miesiąc (1–12) daty ISO albo null, gdy wejście nie jest datą. */
export function monthOfIso(iso: string | null | undefined): number | null {
  if (!isIsoDate(iso)) return null;
  return Number(iso.slice(5, 7));
}

/** Rok daty ISO albo null. */
export function yearOfIso(iso: string | null | undefined): number | null {
  if (!isIsoDate(iso)) return null;
  return Number(iso.slice(0, 4));
}
