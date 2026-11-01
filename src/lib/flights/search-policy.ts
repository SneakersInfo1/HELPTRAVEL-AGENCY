// Polityka wyszukiwań lotów u dostawcy (LiteAPI `/flights/rates`).
//
// INCYDENT 2026-10: LiteAPI zablokowało loty na koncie (`40301`) po ~10 000
// wyszukiwań dziennie bez rezerwacji. Generowały je CRONY — warm-flights
// (40 zapytań/przebieg), warm-flight-deals (48), warm-rates (loty do cen
// kierunków) i snapshot konsjerża (do 110) — po 48 przebiegów na dobę każdy.
// Po przywróceniu dostępu (listopad 2026) konto ma NIEZNANY limit wyszukiwań,
// a te same crony od razu dostawały `HTTP 429`.
//
// Zasada: wyszukiwanie lotów uruchamia przede wszystkim użytkownik (lejek
// lotów, czat). Automatyczne wyszukiwania w tle są DOMYŚLNIE WYŁĄCZONE i
// włącza je wyłącznie świadoma decyzja (`FLIGHTS_BACKGROUND_SEARCH=on`).
// Crony przy wyłączonym przełączniku korzystają tylko z cache wypełnianego
// przez wyszukiwania użytkowników.

/** Kto zleca wyszukiwanie — decyduje o tym, czy wolno w ogóle pytać dostawcę. */
export type FlightSearchSource = "user" | "chat" | "background";

/** Automatyczne wyszukiwania lotów (crony) — domyślnie WYŁĄCZONE. */
export function isBackgroundFlightSearchEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FLIGHTS_BACKGROUND_SEARCH?.trim().toLowerCase() === "on";
}
