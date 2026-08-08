// Budowa adresu statycznego podglądu mapy (Geoapify Static Maps).
//
// Wydzielone z trasy `/api/map/static` z jednego powodu: BŁĄD, KTÓRY TU BYŁ,
// był niewidoczny w kodzie i widoczny dopiero na drucie, a bez czystej funkcji
// nie dało się go przypiąć testem.
//
// INCYDENT (2026-08-08). Podgląd mapy nad filtrami zwracał **502 na każdym
// wyszukiwaniu** — gość widział szary prostokąt z napisem „Pokaż na mapie"
// i miał pełne prawo uznać sekcję za niedokończoną. Przyczyna:
//
//   upstream.searchParams.set("marker", "…;color:%23047857;…")
//
// `URLSearchParams` koduje procent, więc `%23` (czyli `#`) wychodziło na
// drut jako `%2523`. Geoapify odpowiadał:
//
//   400 {"message":"\"marker[0][2]\" does not match any of the allowed types"}
//
// a nasza trasa mapowała to na 502. Zweryfikowane empirycznie: ten sam adres
// z surowym `#` zwraca 200 image/jpeg.
//
// Wniosek do zapamiętania: do `URLSearchParams` podaje się wartości SUROWE.
// Ręczne kodowanie procentowe jest tu zawsze błędem, bo nastąpi drugi raz.

/** Kolor marki (emerald-700) dla znacznika. SUROWY `#` — patrz nota wyżej. */
const MARKER_COLOR = "#047857";
const STYLE = "osm-bright-smooth";

export interface StaticMapInput {
  lat: number;
  lng: number;
  w: number;
  h: number;
  zoom: number;
}

/**
 * Zwraca gotowy adres Geoapify BEZ klucza — klucz dokłada trasa, żeby nie
 * przeciekł do testów, logów ani do snapshotów.
 */
export function buildStaticMapUrl({ lat, lng, w, h, zoom }: StaticMapInput): string {
  const u = new URL("https://maps.geoapify.com/v1/staticmap");
  u.searchParams.set("style", STYLE);
  u.searchParams.set("width", String(w));
  u.searchParams.set("height", String(h));
  u.searchParams.set("center", `lonlat:${lng},${lat}`);
  u.searchParams.set("zoom", String(zoom));
  u.searchParams.set("marker", `lonlat:${lng},${lat};type:material;color:${MARKER_COLOR};size:medium`);
  return u.toString();
}
