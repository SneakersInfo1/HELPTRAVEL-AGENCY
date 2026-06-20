// FAZA 7 — punkty odniesienia miast (centrum + opcjonalnie plaża).
//
// `center` to te same współrzędne, których używamy do wyszukiwania
// (data/destinations.json) — skopiowane tu jako jawna, przeglądalna tabela
// (prompt: „nie wymyślaj, użyj tych samych"). `coastal/beach` to ręczna nakładka
// dla miast NADMORSKICH: `beach` = reprezentatywny, centralny odcinek
// plaży/nabrzeża. Miasta spoza tabeli → brak odniesienia → odległości się NIE
// pokazują (NIGDY zero ani zgadywanie). Gdy nie mam pewności, czy miasto jest
// „plażowe", ustawiam coastal:false (bezpieczniej nie obiecywać plaży).

import type { LatLng } from "./haversine";

export interface CityReference {
  city: string; // angielska nazwa jak z LiteAPI
  countryCode: string; // ISO-2 (do rozróżnienia kolizji nazw)
  center: LatLng;
  coastal: boolean;
  beach?: LatLng;
}

const CITY_REFERENCES: CityReference[] = [
  // ── Hiszpania ──────────────────────────────────────────────────────────
  { city: "Barcelona", countryCode: "ES", center: { lat: 41.3851, lng: 2.1734 }, coastal: true, beach: { lat: 41.3785, lng: 2.1925 } }, // Barceloneta
  { city: "Madrid", countryCode: "ES", center: { lat: 40.4168, lng: -3.7038 }, coastal: false },
  { city: "Malaga", countryCode: "ES", center: { lat: 36.7213, lng: -4.4214 }, coastal: true, beach: { lat: 36.7197, lng: -4.411 } }, // La Malagueta
  { city: "Valencia", countryCode: "ES", center: { lat: 39.4699, lng: -0.3763 }, coastal: true, beach: { lat: 39.471, lng: -0.327 } }, // Malvarrosa
  { city: "Alicante", countryCode: "ES", center: { lat: 38.3452, lng: -0.481 }, coastal: true, beach: { lat: 38.3478, lng: -0.479 } }, // Postiguet
  { city: "Seville", countryCode: "ES", center: { lat: 37.3891, lng: -5.9845 }, coastal: false },
  { city: "Granada", countryCode: "ES", center: { lat: 37.1773, lng: -3.5986 }, coastal: false },
  { city: "Palma", countryCode: "ES", center: { lat: 39.5696, lng: 2.6502 }, coastal: true, beach: { lat: 39.5575, lng: 2.645 } },
  { city: "Las Palmas", countryCode: "ES", center: { lat: 28.1235, lng: -15.4363 }, coastal: true, beach: { lat: 28.143, lng: -15.429 } }, // Las Canteras
  { city: "Santa Cruz de Tenerife", countryCode: "ES", center: { lat: 28.4636, lng: -16.2518 }, coastal: true, beach: { lat: 28.5095, lng: -16.1855 } }, // Las Teresitas
  // ── Portugalia ─────────────────────────────────────────────────────────
  { city: "Lisbon", countryCode: "PT", center: { lat: 38.7223, lng: -9.1393 }, coastal: false }, // plaże ~15 km (Cascais)
  { city: "Porto", countryCode: "PT", center: { lat: 41.1579, lng: -8.6291 }, coastal: true, beach: { lat: 41.1505, lng: -8.67 } }, // Foz
  { city: "Funchal", countryCode: "PT", center: { lat: 32.6669, lng: -16.9241 }, coastal: true, beach: { lat: 32.637, lng: -16.945 } }, // Praia Formosa
  { city: "Faro", countryCode: "PT", center: { lat: 37.0194, lng: -7.9322 }, coastal: true, beach: { lat: 37.009, lng: -7.988 } },
  // ── Włochy ─────────────────────────────────────────────────────────────
  { city: "Rome", countryCode: "IT", center: { lat: 41.9028, lng: 12.4964 }, coastal: false },
  { city: "Milan", countryCode: "IT", center: { lat: 45.4642, lng: 9.19 }, coastal: false },
  { city: "Naples", countryCode: "IT", center: { lat: 40.8518, lng: 14.2681 }, coastal: true, beach: { lat: 40.833, lng: 14.247 } }, // Lungomare
  { city: "Venice", countryCode: "IT", center: { lat: 45.4408, lng: 12.3155 }, coastal: false }, // laguna, nie plaża miejska
  { city: "Florence", countryCode: "IT", center: { lat: 43.7696, lng: 11.2558 }, coastal: false },
  { city: "Bari", countryCode: "IT", center: { lat: 41.1257, lng: 16.8694 }, coastal: true, beach: { lat: 41.114, lng: 16.892 } }, // Pane e Pomodoro
  { city: "Catania", countryCode: "IT", center: { lat: 37.5079, lng: 15.083 }, coastal: true, beach: { lat: 37.466, lng: 15.076 } },
  { city: "Cagliari", countryCode: "IT", center: { lat: 39.2238, lng: 9.1217 }, coastal: true, beach: { lat: 39.201, lng: 9.166 } }, // Poetto
  // ── Grecja / Cypr ──────────────────────────────────────────────────────
  { city: "Athens", countryCode: "GR", center: { lat: 37.9838, lng: 23.7275 }, coastal: false }, // Riwiera 10 km+
  { city: "Thessaloniki", countryCode: "GR", center: { lat: 40.6401, lng: 22.9444 }, coastal: false },
  { city: "Heraklion", countryCode: "GR", center: { lat: 35.3387, lng: 25.1442 }, coastal: true, beach: { lat: 35.338, lng: 25.09 } }, // Ammoudara
  { city: "Chania", countryCode: "GR", center: { lat: 35.5138, lng: 24.018 }, coastal: true, beach: { lat: 35.518, lng: 24.02 } }, // Nea Chora
  { city: "Rhodes", countryCode: "GR", center: { lat: 36.4349, lng: 28.2176 }, coastal: true, beach: { lat: 36.445, lng: 28.228 } }, // Elli
  { city: "Corfu", countryCode: "GR", center: { lat: 39.6243, lng: 19.9217 }, coastal: true, beach: { lat: 39.628, lng: 19.93 } },
  { city: "Larnaca", countryCode: "CY", center: { lat: 34.9182, lng: 33.632 }, coastal: true, beach: { lat: 34.911, lng: 33.643 } }, // Finikoudes
  { city: "Paphos", countryCode: "CY", center: { lat: 34.772, lng: 32.4297 }, coastal: true, beach: { lat: 34.754, lng: 32.408 } },
  { city: "Limassol", countryCode: "CY", center: { lat: 34.7071, lng: 33.0226 }, coastal: true, beach: { lat: 34.679, lng: 33.044 } },
  // ── Turcja ─────────────────────────────────────────────────────────────
  { city: "Istanbul", countryCode: "TR", center: { lat: 41.0082, lng: 28.9784 }, coastal: false }, // Bosfor, nie plaża
  { city: "Antalya", countryCode: "TR", center: { lat: 36.8969, lng: 30.7133 }, coastal: true, beach: { lat: 36.878, lng: 30.648 } }, // Konyaalti
  { city: "Bodrum", countryCode: "TR", center: { lat: 37.0344, lng: 27.4305 }, coastal: true, beach: { lat: 37.032, lng: 27.425 } },
  // ── Francja ────────────────────────────────────────────────────────────
  { city: "Paris", countryCode: "FR", center: { lat: 48.8566, lng: 2.3522 }, coastal: false },
  { city: "Nice", countryCode: "FR", center: { lat: 43.7102, lng: 7.262 }, coastal: true, beach: { lat: 43.695, lng: 7.266 } }, // Promenade des Anglais
  { city: "Marseille", countryCode: "FR", center: { lat: 43.2965, lng: 5.3698 }, coastal: true, beach: { lat: 43.259, lng: 5.379 } }, // Prado
  // ── Polska (śródlądowe) ────────────────────────────────────────────────
  { city: "Warsaw", countryCode: "PL", center: { lat: 52.2297, lng: 21.0122 }, coastal: false },
  { city: "Krakow", countryCode: "PL", center: { lat: 50.0647, lng: 19.945 }, coastal: false },
  { city: "Gdansk", countryCode: "PL", center: { lat: 54.352, lng: 18.6466 }, coastal: false }, // starówka ~5 km+ od plaży
  { city: "Wroclaw", countryCode: "PL", center: { lat: 51.1079, lng: 17.0385 }, coastal: false },
  { city: "Poznan", countryCode: "PL", center: { lat: 52.4064, lng: 16.9252 }, coastal: false },
  // ── Reszta Europy (śródlądowe city-breaki) ─────────────────────────────
  { city: "Prague", countryCode: "CZ", center: { lat: 50.0755, lng: 14.4378 }, coastal: false },
  { city: "Vienna", countryCode: "AT", center: { lat: 48.2082, lng: 16.3738 }, coastal: false },
  { city: "Budapest", countryCode: "HU", center: { lat: 47.4979, lng: 19.0402 }, coastal: false },
  { city: "Amsterdam", countryCode: "NL", center: { lat: 52.3676, lng: 4.9041 }, coastal: false },
  { city: "Berlin", countryCode: "DE", center: { lat: 52.52, lng: 13.405 }, coastal: false },
  { city: "London", countryCode: "GB", center: { lat: 51.5074, lng: -0.1278 }, coastal: false },
  { city: "Dublin", countryCode: "IE", center: { lat: 53.3498, lng: -6.2603 }, coastal: false },
  // ── Bliski Wschód / Afryka Płn. ────────────────────────────────────────
  { city: "Dubai", countryCode: "AE", center: { lat: 25.2048, lng: 55.2708 }, coastal: false }, // rozległe, niejednoznaczne centrum
  { city: "Hurghada", countryCode: "EG", center: { lat: 27.2579, lng: 33.8116 }, coastal: true, beach: { lat: 27.228, lng: 33.835 } },
  { city: "Marrakesh", countryCode: "MA", center: { lat: 31.6295, lng: -7.9811 }, coastal: false },
];

function normCity(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, ""); // zdejmij akcenty (Málaga → malaga)
}

// Indeks po znormalizowanej nazwie miasta; przy kolizji nazw rozróżniamy krajem.
const BY_CITY = new Map<string, CityReference[]>();
for (const ref of CITY_REFERENCES) {
  const key = normCity(ref.city);
  const arr = BY_CITY.get(key) ?? [];
  arr.push(ref);
  BY_CITY.set(key, arr);
}

/** Znajdź punkt odniesienia dla miasta (opcjonalnie doprecyzowany krajem). */
export function getCityReference(
  city: string | null | undefined,
  countryCode?: string | null,
): CityReference | null {
  if (!city) return null;
  const matches = BY_CITY.get(normCity(city));
  if (!matches || matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  // kolizja nazw → dopasuj po kraju, inaczej nie zgaduj
  const cc = countryCode?.trim().toUpperCase();
  return matches.find((m) => m.countryCode === cc) ?? null;
}
