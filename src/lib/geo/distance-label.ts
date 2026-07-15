// FAZA 7 — etykiety odległości (centrum / plaża) z twardymi guardrailami.
//
// Twarda zasada: lepiej NIC nie pokazać niż liczbę, która odstrasza lub jest
// zmyślona. Każda odległość liczona z realnych współrzędnych (haversine) i musi
// przejść progi z `GEO_DISPLAY`, inaczej jest ukrywana.

import { getCityReference } from "./city-reference";
import { haversineKm, isValidCoord, type LatLng } from "./haversine";

// Wszystkie progi w jednym miejscu (łatwo tunować).
export const GEO_DISPLAY = {
  /** Dalej niż tyle km od centrum → NIE pokazuj odległości od centrum. */
  MAX_CENTER_KM: 12,
  /** Plażę pokazuj tylko dla miast nadmorskich i ≤ tylu km. */
  MAX_BEACH_KM: 5,
};

type Anchor = "center" | "beach";

/** PL formatowanie: <300 m → „w samym centrum"/„przy plaży"; 300–<950 m →
 *  „X m od …" (zaokrąglone do 50 m); ≥0,95 km → „X,X km od …" (przecinek). */
function formatDistance(km: number, anchor: Anchor): string {
  const noun = anchor === "center" ? "centrum" : "plaży";
  if (km < 0.3) return anchor === "center" ? "w samym centrum" : "przy plaży";
  if (km < 0.95) {
    const meters = Math.round((km * 1000) / 50) * 50;
    return `${meters} m od ${noun}`;
  }
  const oneDecimal = (Math.round(km * 10) / 10).toFixed(1).replace(".", ",");
  return `${oneDecimal} km od ${noun}`;
}

export interface HotelDistanceLabels {
  center?: string;
  beach?: string;
}

export interface HotelDistanceKm {
  centerKm?: number;
  beachKm?: number;
}

/**
 * Liczbowe odległości (km) — te same guardraile co etykiety (progi
 * GEO_DISPLAY, walidacja współrzędnych). Do FILTRÓW („do 1 km od centrum"),
 * gdzie potrzebna jest liczba, nie string. Zaokrąglenie do 0,01 km.
 */
export function hotelDistanceKm(
  hotel: { lat?: number | null; lng?: number | null },
  city: string | null | undefined,
  countryCode?: string | null,
): HotelDistanceKm {
  const ref = getCityReference(city, countryCode);
  if (!ref) return {};
  const hotelCoord: LatLng | null =
    hotel.lat != null && hotel.lng != null ? { lat: hotel.lat, lng: hotel.lng } : null;
  if (!isValidCoord(hotelCoord)) return {};

  const out: HotelDistanceKm = {};
  if (isValidCoord(ref.center)) {
    const km = haversineKm(hotelCoord, ref.center);
    if (km > 0 && Number.isFinite(km) && km <= GEO_DISPLAY.MAX_CENTER_KM) {
      out.centerKm = Math.round(km * 100) / 100;
    }
  }
  if (ref.coastal && isValidCoord(ref.beach)) {
    const km = haversineKm(hotelCoord, ref.beach);
    if (km > 0 && Number.isFinite(km) && km <= GEO_DISPLAY.MAX_BEACH_KM) {
      out.beachKm = Math.round(km * 100) / 100;
    }
  }
  return out;
}

/**
 * Policz etykiety odległości dla hotelu. Zwraca tylko to, co przeszło progi —
 * pusty obiekt, gdy: brak punktu odniesienia miasta, niepoprawne współrzędne
 * hotelu, odległość ≤ 0 / NaN, albo przekroczone progi.
 */
export function hotelDistanceLabels(
  hotel: { lat?: number | null; lng?: number | null },
  city: string | null | undefined,
  countryCode?: string | null,
): HotelDistanceLabels {
  const ref = getCityReference(city, countryCode);
  if (!ref) return {};

  const hotelCoord: LatLng | null =
    hotel.lat != null && hotel.lng != null ? { lat: hotel.lat, lng: hotel.lng } : null;
  if (!isValidCoord(hotelCoord)) return {};

  const out: HotelDistanceLabels = {};

  if (isValidCoord(ref.center)) {
    const km = haversineKm(hotelCoord, ref.center);
    if (km > 0 && Number.isFinite(km) && km <= GEO_DISPLAY.MAX_CENTER_KM) {
      out.center = formatDistance(km, "center");
    }
  }

  if (ref.coastal && isValidCoord(ref.beach)) {
    const km = haversineKm(hotelCoord, ref.beach);
    if (km > 0 && Number.isFinite(km) && km <= GEO_DISPLAY.MAX_BEACH_KM) {
      out.beach = formatDistance(km, "beach");
    }
  }

  return out;
}
