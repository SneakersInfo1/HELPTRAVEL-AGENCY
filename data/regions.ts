// Zadanie 2 — słownik wysp/regionów wyszukiwalnych w "Dokąd".
//
// Strategia A z briefu (natywne miejsca LiteAPI): każdy region ma placeId
// z GET /data/places, ZWERYFIKOWANY EMPIRYCZNIE 2026-06-12 (każdy placeId
// odpytany przez /data/hotels — liczba hoteli w komentarzu przy wpisie).
// Wyszukiwanie hoteli idzie przez GET /data/hotels?placeId=… (1 call,
// limit 1000 — ten sam cap co miasta).
//
// `filterPoints` to siatka haversine (wartości z briefu, zweryfikowane na
// próbkach): /data/hotels?placeId zwraca też obiekty z SĄSIEDNICH wysp
// (zmierzono: placeId Gozo zwraca St Paul's Bay na Malcie), więc wyniki
// przycinamy do hoteli leżących w promieniu KTÓREGOKOLWIEK punktu. Hotele
// bez współrzędnych w metadanych zostają (nie wycinamy w ciemno).
//
// Rozszerzanie: dopisz wpis tutaj — autocomplete, strona wyników i loty
// (airports/lat/lng) podłączają się same. Regiony kontynentalne (Toskania,
// Algarve) celowo poza zakresem do czasu walidacji wysp.

export interface RegionPoint {
  lat: number;
  lng: number;
  radiusKm: number;
}

export interface RegionRecord {
  /** Slug — wartość parametru URL `region` na /hotele/szukaj. */
  id: string;
  namePl: string;
  nameEn: string;
  /** Małe litery; dopasowanie i tak składa diakrytyki (fold). */
  aliases: string[];
  /** Wpisanie nazwy archipelagu podpowiada tę wyspę ("kanary" → Teneryfa…). */
  archipelagoAliases?: string[];
  countryPl: string;
  countryEn: string;
  countryCode: string;
  /** LiteAPI /data/places — zweryfikowany identyfikator wyspy/regionu. */
  placeId: string;
  filterPoints: RegionPoint[];
  /** Centroid dla panelu lotów (Aviasales) i fallbacków. */
  lat: number;
  lng: number;
  /** Lotniska wyspy (IATA) — pierwsze jest głównym dla panelu lotów. */
  airports: string[];
  /** Waga w podpowiedziach (wyżej = częściej szukane). */
  popularity: number;
}

const BALEARY = ["baleary", "wyspy balearskie", "balearic islands", "islas baleares"];
const KANARY = ["kanary", "wyspy kanaryjskie", "canary islands", "islas canarias"];

export const REGIONS: RegionRecord[] = [
  {
    id: "majorka",
    namePl: "Majorka",
    nameEn: "Mallorca",
    aliases: ["mallorca", "majorca"],
    archipelagoAliases: BALEARY,
    countryPl: "Hiszpania",
    countryEn: "Spain",
    countryCode: "ES",
    placeId: "ChIJKcEGZna4lxIRwOzSAv-b67c", // 1000 hoteli (cap)
    filterPoints: [{ lat: 39.61, lng: 2.95, radiusKm: 55 }],
    lat: 39.61,
    lng: 2.95,
    airports: ["PMI"],
    popularity: 95,
  },
  {
    id: "teneryfa",
    namePl: "Teneryfa",
    nameEn: "Tenerife",
    aliases: ["tenerife", "teneriffa"],
    archipelagoAliases: KANARY,
    countryPl: "Hiszpania",
    countryEn: "Spain",
    countryCode: "ES",
    placeId: "ChIJ7YKG_u8pQAwRPK9LyPFLGrA", // 524 hotele
    // 55 (nie 45 z briefu): półwysep Anaga (Almáciga) leży 53 km od centroidu,
    // a najbliższa sąsiednia wyspa (La Gomera) zaczyna się ~63 km — zmierzone.
    filterPoints: [{ lat: 28.29, lng: -16.62, radiusKm: 55 }],
    lat: 28.29,
    lng: -16.62,
    airports: ["TFS", "TFN"],
    popularity: 93,
  },
  {
    id: "kreta",
    namePl: "Kreta",
    nameEn: "Crete",
    aliases: ["crete", "kriti"],
    countryPl: "Grecja",
    countryEn: "Greece",
    countryCode: "GR",
    placeId: "ChIJgwLPpFpVmhQRWbv8MHoVrGk", // 1000 hoteli (cap)
    filterPoints: [
      { lat: 35.51, lng: 24.02, radiusKm: 60 }, // Chania
      { lat: 35.34, lng: 25.13, radiusKm: 60 }, // Heraklion
      { lat: 35.19, lng: 25.72, radiusKm: 60 }, // Agios Nikolaos
    ],
    lat: 35.34,
    lng: 25.13,
    airports: ["HER", "CHQ"],
    popularity: 92,
  },
  {
    id: "malta",
    namePl: "Malta",
    nameEn: "Malta",
    aliases: ["malta wyspa", "island of malta"],
    countryPl: "Malta",
    countryEn: "Malta",
    countryCode: "MT",
    placeId: "ChIJ9VhIAzlQDhMRS7bzXD_Pihw", // 540 hoteli
    filterPoints: [{ lat: 35.9, lng: 14.45, radiusKm: 18 }],
    lat: 35.9,
    lng: 14.45,
    airports: ["MLA"],
    popularity: 90,
  },
  {
    id: "rodos",
    namePl: "Rodos",
    nameEn: "Rhodes",
    aliases: ["rhodes", "rhodos", "rodes"],
    countryPl: "Grecja",
    countryEn: "Greece",
    countryCode: "GR",
    placeId: "ChIJrU-bLvkKlRQRVNRb-BTQ7ic", // 366 hoteli (typ island)
    filterPoints: [{ lat: 36.16, lng: 27.98, radiusKm: 40 }],
    lat: 36.16,
    lng: 27.98,
    airports: ["RHO"],
    popularity: 88,
  },
  {
    id: "cypr",
    namePl: "Cypr",
    nameEn: "Cyprus",
    aliases: ["cyprus"],
    countryPl: "Cypr",
    countryEn: "Cyprus",
    countryCode: "CY",
    placeId: "ChIJIxUAlrBk5xQRbTqDgkQXz4I", // 785 hoteli
    filterPoints: [
      { lat: 34.77, lng: 32.42, radiusKm: 40 }, // Pafos
      { lat: 34.68, lng: 33.04, radiusKm: 40 }, // Limassol
      { lat: 34.99, lng: 33.99, radiusKm: 40 }, // Ajia Napa
      { lat: 34.92, lng: 33.62, radiusKm: 30 }, // Larnaka (Pervolia/Mazotos wypadały z siatki briefu)
      { lat: 35.17, lng: 33.36, radiusKm: 25 }, // Nikozja (stolica ma hotele — nie wycinamy)
    ],
    lat: 34.68,
    lng: 33.04,
    airports: ["LCA", "PFO"],
    popularity: 86,
  },
  {
    id: "gran-canaria",
    namePl: "Gran Canaria",
    nameEn: "Gran Canaria",
    aliases: [],
    archipelagoAliases: KANARY,
    countryPl: "Hiszpania",
    countryEn: "Spain",
    countryCode: "ES",
    placeId: "ChIJwQe_BFWFQAwRFtuspcgWyS4", // 501 hoteli
    filterPoints: [{ lat: 27.96, lng: -15.6, radiusKm: 30 }],
    lat: 27.96,
    lng: -15.6,
    airports: ["LPA"],
    popularity: 84,
  },
  {
    id: "santoryn",
    namePl: "Santoryn",
    nameEn: "Santorini",
    aliases: ["santorini", "thira", "thera"],
    countryPl: "Grecja",
    countryEn: "Greece",
    countryCode: "GR",
    placeId: "ChIJ95_9rYbOmRQR_IrWQPdhp7I", // 695 hoteli
    filterPoints: [{ lat: 36.4, lng: 25.43, radiusKm: 12 }],
    lat: 36.4,
    lng: 25.43,
    airports: ["JTR"],
    popularity: 82,
  },
  {
    id: "sycylia",
    namePl: "Sycylia",
    nameEn: "Sicily",
    aliases: ["sicily", "sicilia"],
    countryPl: "Włochy",
    countryEn: "Italy",
    countryCode: "IT",
    placeId: "ChIJs1lT0GhiEBMRUH22ZykECwE", // 1000 hoteli (cap, region adm.)
    filterPoints: [
      { lat: 38.12, lng: 13.36, radiusKm: 70 }, // Palermo
      { lat: 37.5, lng: 15.09, radiusKm: 70 }, // Katania
      { lat: 37.31, lng: 13.58, radiusKm: 70 }, // Agrigento
    ],
    lat: 37.5,
    lng: 15.09,
    airports: ["CTA", "PMO"],
    popularity: 80,
  },
  {
    id: "ibiza",
    namePl: "Ibiza",
    nameEn: "Ibiza",
    aliases: ["eivissa"],
    archipelagoAliases: BALEARY,
    countryPl: "Hiszpania",
    countryEn: "Spain",
    countryCode: "ES",
    placeId: "ChIJQzkJhWNHmRIR1iaEzSVHBgk", // 346 hoteli
    filterPoints: [{ lat: 38.98, lng: 1.43, radiusKm: 25 }],
    lat: 38.98,
    lng: 1.43,
    airports: ["IBZ"],
    popularity: 78,
  },
  {
    id: "zakynthos",
    namePl: "Zakynthos",
    nameEn: "Zakynthos",
    aliases: ["zakintos", "zante"],
    countryPl: "Grecja",
    countryEn: "Greece",
    countryCode: "GR",
    placeId: "ChIJv1p73MpAZxMR0SpM4Nt0oCc", // 138 hoteli (typ island)
    filterPoints: [{ lat: 37.78, lng: 20.8, radiusKm: 20 }],
    lat: 37.78,
    lng: 20.8,
    airports: ["ZTH"],
    popularity: 76,
  },
  {
    id: "korfu",
    namePl: "Korfu",
    nameEn: "Corfu",
    aliases: ["corfu", "kerkyra", "kerkira"],
    countryPl: "Grecja",
    countryEn: "Greece",
    countryCode: "GR",
    placeId: "ChIJfwotqt1eWxMR0CErp-YUlAE", // 686 hoteli (typ island)
    // Korfu jest długie (N-S) i leży 30 km od albańskiej Sarandy, którą
    // placeId-search dorzuca — trzy ciasne punkty zamiast jednego koła
    // (jedno koło 40 km łapało Sarandę, koło 30 km ucinało Kavos na południu).
    filterPoints: [
      { lat: 39.74, lng: 19.71, radiusKm: 18 }, // północ (Sidari/Roda)
      { lat: 39.78, lng: 19.93, radiusKm: 10 }, // płn.-wsch. (Kassiopi/Kalami) — Albanię odsiewa countryCode
      { lat: 39.58, lng: 19.87, radiusKm: 15 }, // centrum (Kerkyra)
      { lat: 39.43, lng: 20.05, radiusKm: 12 }, // południe (Kavos)
    ],
    lat: 39.62,
    lng: 19.85,
    airports: ["CFU"],
    popularity: 75,
  },
  {
    id: "sardynia",
    namePl: "Sardynia",
    nameEn: "Sardinia",
    aliases: ["sardinia", "sardegna"],
    countryPl: "Włochy",
    countryEn: "Italy",
    countryCode: "IT",
    placeId: "ChIJkTWNRI3E3RIRMWar5LZ0ljM", // 1000 hoteli (cap)
    filterPoints: [
      { lat: 39.22, lng: 9.12, radiusKm: 75 }, // Cagliari (75: dosięga Carloforte ~71 km; ląd stały >180 km — bezpieczne)
      { lat: 40.92, lng: 9.5, radiusKm: 65 }, // Olbia
      { lat: 40.56, lng: 8.32, radiusKm: 65 }, // Alghero
      { lat: 40.0, lng: 9.4, radiusKm: 65 }, // wschodnie wybrzeże (Arbatax) — domyka lukę Cagliari–Olbia
      { lat: 39.9, lng: 8.59, radiusKm: 50 }, // Oristano (zachód — wypadał z siatki briefu)
    ],
    lat: 39.22,
    lng: 9.12,
    airports: ["CAG", "OLB", "AHO"],
    popularity: 74,
  },
  {
    id: "lanzarote",
    namePl: "Lanzarote",
    nameEn: "Lanzarote",
    aliases: [],
    archipelagoAliases: KANARY,
    countryPl: "Hiszpania",
    countryEn: "Spain",
    countryCode: "ES",
    placeId: "ChIJizmiHM0jRgwRGBV7xYrWoKI", // 306 hoteli
    // Dwa punkty zamiast koła 40 km: cieśnina do Fuerteventury ma ~12 km,
    // więc duże koło łapało Corralejo; małe ucinało Playa Blanca na południu.
    filterPoints: [
      { lat: 29.05, lng: -13.6, radiusKm: 22 }, // Arrecife/Costa Teguise/Puerto del Carmen
      { lat: 28.88, lng: -13.8, radiusKm: 12 }, // Playa Blanca/Yaiza
    ],
    lat: 29.05,
    lng: -13.62,
    airports: ["ACE"],
    popularity: 72,
  },
  {
    id: "fuerteventura",
    namePl: "Fuerteventura",
    nameEn: "Fuerteventura",
    aliases: [],
    archipelagoAliases: KANARY,
    countryPl: "Hiszpania",
    countryEn: "Spain",
    countryCode: "ES",
    placeId: "ChIJgQ_Cr3OkRwwRI3-1tRMcxyo", // 192 hotele
    filterPoints: [{ lat: 28.35, lng: -14.03, radiusKm: 55 }],
    lat: 28.35,
    lng: -14.03,
    airports: ["FUE"],
    popularity: 70,
  },
  {
    id: "madera",
    namePl: "Madera",
    nameEn: "Madeira",
    aliases: ["madeira"],
    countryPl: "Portugalia",
    countryEn: "Portugal",
    countryCode: "PT",
    placeId: "ChIJ7y75-KDpXwwRb166dGfldww", // 343 hotele (region adm.)
    filterPoints: [{ lat: 32.74, lng: -16.97, radiusKm: 30 }],
    lat: 32.74,
    lng: -16.97,
    airports: ["FNC"],
    popularity: 68,
  },
  {
    id: "kos",
    namePl: "Kos",
    nameEn: "Kos",
    aliases: [],
    countryPl: "Grecja",
    countryEn: "Greece",
    countryCode: "GR",
    placeId: "ChIJNYvAtmf-vRQR3dybRvjEnJ4", // 141 hoteli
    filterPoints: [{ lat: 36.85, lng: 27.2, radiusKm: 25 }],
    lat: 36.85,
    lng: 27.2,
    airports: ["KGS"],
    popularity: 66,
  },
  {
    id: "mykonos",
    namePl: "Mykonos",
    nameEn: "Mykonos",
    aliases: ["mikonos"],
    countryPl: "Grecja",
    countryEn: "Greece",
    countryCode: "GR",
    placeId: "ChIJkZs88LS4ohQRobR5Hkdk0Xg", // 352 hotele
    filterPoints: [{ lat: 37.44, lng: 25.35, radiusKm: 12 }],
    lat: 37.44,
    lng: 25.35,
    airports: ["JMK"],
    popularity: 64,
  },
  {
    id: "minorka",
    namePl: "Minorka",
    nameEn: "Menorca",
    aliases: ["menorca"],
    archipelagoAliases: BALEARY,
    countryPl: "Hiszpania",
    countryEn: "Spain",
    countryCode: "ES",
    placeId: "ChIJ6SC4LJ0fvhIRyXeOF4TEmlI", // 207 hoteli
    filterPoints: [{ lat: 39.95, lng: 4.05, radiusKm: 30 }],
    lat: 39.95,
    lng: 4.05,
    airports: ["MAH"],
    popularity: 62,
  },
  {
    id: "gozo",
    namePl: "Gozo",
    nameEn: "Gozo",
    aliases: ["ghawdex"],
    countryPl: "Malta",
    countryEn: "Malta",
    countryCode: "MT",
    placeId: "ChIJuaXq7ua0DxMRriC34Q8vpL8", // 170 hoteli (z przeciekiem na Maltę — tnie filterPoints)
    filterPoints: [{ lat: 36.046, lng: 14.25, radiusKm: 9 }],
    lat: 36.046,
    lng: 14.25,
    airports: ["MLA"],
    popularity: 50,
  },
];
