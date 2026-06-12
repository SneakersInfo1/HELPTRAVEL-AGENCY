// Zadanie 2 — czyste funkcje wokół słownika regionów (data/regions.ts):
// dopasowanie zapytania (bez wielkości liter i diakrytyków, aliasy,
// archipelagi) oraz przycinanie wyników /data/hotels?placeId do hoteli
// faktycznie leżących na wyspie (haversine na filterPoints).
//
// Brak "server-only": moduł jest czysty (zero I/O), więc może być użyty
// i w route handlerze podpowiedzi, i w komponencie serwerowym wyników.

import { REGIONS, type RegionRecord } from "../../../data/regions";

export type { RegionRecord, RegionPoint } from "../../../data/regions";

/** Składa diakrytyki i normalizuje spacje — "Teneryfa " === "teneryfa". */
export function foldRegionText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function getRegionById(id: string): RegionRecord | null {
  const slug = id.trim().toLowerCase();
  return REGIONS.find((r) => r.id === slug) ?? null;
}

/**
 * Dopasowanie do autocomplete. Zasady:
 *  - prefiks nazwy PL/EN lub aliasu ("major" → Majorka, "mallo" → Majorka),
 *  - od 4 znaków też dopasowanie w środku ("canar" → Kanary),
 *  - alias archipelagu podpowiada KAŻDĄ wyspę grupy ("kanary" → Teneryfa,
 *    Gran Canaria, Lanzarote, Fuerteventura).
 * Wynik posortowany po popularity malejąco.
 */
export function matchRegions(query: string, limit = 4): RegionRecord[] {
  const q = foldRegionText(query);
  if (q.length < 2) return [];
  const hits = REGIONS.filter((r) => {
    const names = [r.namePl, r.nameEn, ...r.aliases, ...(r.archipelagoAliases ?? [])];
    return names.some((n) => {
      const folded = foldRegionText(n);
      return folded.startsWith(q) || (q.length >= 4 && folded.includes(q));
    });
  });
  return hits.sort((a, b) => b.popularity - a.popularity).slice(0, limit);
}

/** Odległość po kuli ziemskiej w km. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/**
 * Zostawia hotele leżące w promieniu KTÓREGOKOLWIEK filterPoint regionu.
 * LiteAPI placeId-search potrafi dorzucić obiekty z sąsiedniej wyspy
 * (zmierzone: Gozo → St Paul's Bay na Malcie), stąd przycinanie.
 * Hotel bez współrzędnych w metadanych ZOSTAJE — nie wycinamy w ciemno.
 */
export function isInRegion(
  region: RegionRecord,
  hotel: { latitude?: number | null; longitude?: number | null; countryCode?: string | null },
): boolean {
  // Najpierw kraj: NE Korfu leży 2 km od Albanii — geometria kół nie odsieje
  // Ksamilu/Sarandy, ale countryCode (AL vs GR) tak. Brak countryCode w
  // metadanych = nie rozstrzygamy po kraju.
  if (
    hotel.countryCode &&
    hotel.countryCode.trim().toUpperCase() !== region.countryCode
  ) {
    return false;
  }
  const { latitude, longitude } = hotel;
  if (typeof latitude !== "number" || typeof longitude !== "number") return true;
  return region.filterPoints.some(
    (p) => haversineKm(p.lat, p.lng, latitude, longitude) <= p.radiusKm,
  );
}
