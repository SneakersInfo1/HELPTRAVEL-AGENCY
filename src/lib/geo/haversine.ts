// FAZA 7 — odległość po wielkim okręgu (km) + walidacja współrzędnych.
// LiteAPI daje współrzędne hotelu, ale NIE liczy odległości — liczymy sami.

export interface LatLng {
  lat: number;
  lng: number;
}

/** Walidacja: realny punkt na Ziemi, nie 0/0 (typowy „brak danych"), nie NaN. */
export function isValidCoord(c: LatLng | null | undefined): c is LatLng {
  if (!c) return false;
  const { lat, lng } = c;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

/** Odległość po wielkim okręgu w kilometrach (formuła haversine). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371; // promień Ziemi [km]
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
