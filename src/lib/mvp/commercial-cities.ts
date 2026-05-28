// Curated list of top-10 commercial-intent cities for /hotele/w/[miasto]
// landing pages. Targets these Polish search queries (May 2026 keyword
// research):
//
//   "hotele barcelona"       ~33 000 mies./PL
//   "hotele madryt"          ~14 000
//   "hotele rzym"            ~28 000
//   "hotele paryż"           ~25 000
//   "hotele londyn"          ~19 000
//   "hotele dubaj"           ~22 000
//   "hotele stambuł"         ~16 000
//   "hotele lizbona"         ~11 000
//   "hotele ateny"           ~12 000
//   "hotele praga"           ~21 000
//
// Each entry maps a URL-safe slug (kebab-case PL nominative) to:
//   • destination id in data/destinations.json — pivot to existing assets
//     (Pexels hero image, climate, vibe tags, hotel count)
//   • cityLocative — declined form for natural Polish H1 ("Hotele w
//     Barcelonie", not "Hotele w Barcelona")
//   • cityAccusative — for "Sprawdź hotele w Barcelonie" buttons (same
//     locative form actually; kept separate for future flexibility)
//   • countryGenitive — for "Hotele w Barcelonie, Hiszpanii" sub-line
//   • aliasQueries — extra search-intent surface area embedded in body
//     copy (multi-keyword variation without doorway-page risk)
//
// Adding/removing entries: also add a folder route at
// /src/app/hotele/w/[miasto] (the page handles all slugs dynamically,
// so it's enough to keep this list in sync with generateStaticParams).

export interface CommercialCity {
  slug: string; // url segment, e.g., "barcelona"
  destinationId: string; // matches data/destinations.json id
  cityNominative: string; // "Barcelona"
  cityLocative: string; // "Barcelonie" — after "w"
  cityGenitive: string; // "Barcelony" — after "do" or "z"
  countryNominative: string;
  countryLocative: string; // after "w"
  countryGenitive: string;
  /** Extra search queries this page should rank for. Embedded into body H2/H3. */
  aliasQueries: string[];
  /** Approximate monthly Polish search volume for the head query. */
  monthlySearchVolumePL: number;
}

export const commercialCities: CommercialCity[] = [
  {
    slug: "barcelona",
    destinationId: "barcelona-spain",
    cityNominative: "Barcelona",
    cityLocative: "Barcelonie",
    cityGenitive: "Barcelony",
    countryNominative: "Hiszpania",
    countryLocative: "Hiszpanii",
    countryGenitive: "Hiszpanii",
    aliasQueries: [
      "tanie hotele Barcelona",
      "noclegi Barcelona",
      "hotele Barcelona centrum",
      "wakacje Barcelona 2026",
      "tanie loty Barcelona",
    ],
    monthlySearchVolumePL: 33000,
  },
  {
    slug: "madryt",
    destinationId: "madrid-spain",
    cityNominative: "Madryt",
    cityLocative: "Madrycie",
    cityGenitive: "Madrytu",
    countryNominative: "Hiszpania",
    countryLocative: "Hiszpanii",
    countryGenitive: "Hiszpanii",
    aliasQueries: [
      "hotele Madryt centrum",
      "noclegi w Madrycie",
      "tanie hotele Madryt",
      "wakacje Madryt 2026",
    ],
    monthlySearchVolumePL: 14000,
  },
  {
    slug: "rzym",
    destinationId: "rome-italy",
    cityNominative: "Rzym",
    cityLocative: "Rzymie",
    cityGenitive: "Rzymu",
    countryNominative: "Włochy",
    countryLocative: "we Włoszech",
    countryGenitive: "Włoch",
    aliasQueries: [
      "hotele Rzym centrum",
      "noclegi Rzym",
      "tanie hotele Rzym",
      "wakacje Rzym 2026",
      "tanie loty Rzym",
    ],
    monthlySearchVolumePL: 28000,
  },
  {
    slug: "paryz",
    destinationId: "paris-france",
    cityNominative: "Paryż",
    cityLocative: "Paryżu",
    cityGenitive: "Paryża",
    countryNominative: "Francja",
    countryLocative: "Francji",
    countryGenitive: "Francji",
    aliasQueries: [
      "hotele Paryż centrum",
      "noclegi w Paryżu",
      "tanie hotele Paryż",
      "wakacje Paryż 2026",
    ],
    monthlySearchVolumePL: 25000,
  },
  {
    slug: "londyn",
    destinationId: "london-united-kingdom",
    cityNominative: "Londyn",
    cityLocative: "Londynie",
    cityGenitive: "Londynu",
    countryNominative: "Wielka Brytania",
    countryLocative: "Wielkiej Brytanii",
    countryGenitive: "Wielkiej Brytanii",
    aliasQueries: [
      "hotele Londyn centrum",
      "noclegi Londyn",
      "tanie hotele Londyn",
      "wakacje Londyn 2026",
    ],
    monthlySearchVolumePL: 19000,
  },
  {
    slug: "dubaj",
    destinationId: "dubai-united-arab-emirates",
    cityNominative: "Dubaj",
    cityLocative: "Dubaju",
    cityGenitive: "Dubaju",
    countryNominative: "Zjednoczone Emiraty Arabskie",
    countryLocative: "Zjednoczonych Emiratach Arabskich",
    countryGenitive: "Zjednoczonych Emiratów Arabskich",
    aliasQueries: [
      "hotele Dubaj all inclusive",
      "wakacje Dubaj 2026",
      "tanie loty Dubaj",
      "noclegi Dubaj",
    ],
    monthlySearchVolumePL: 22000,
  },
  {
    slug: "stambul",
    destinationId: "istanbul-turkey",
    cityNominative: "Stambuł",
    cityLocative: "Stambule",
    cityGenitive: "Stambułu",
    countryNominative: "Turcja",
    countryLocative: "Turcji",
    countryGenitive: "Turcji",
    aliasQueries: [
      "hotele Stambuł centrum",
      "noclegi Stambuł",
      "tanie hotele Stambuł",
      "wakacje Stambuł 2026",
    ],
    monthlySearchVolumePL: 16000,
  },
  {
    slug: "lizbona",
    destinationId: "lisbon-portugal",
    cityNominative: "Lizbona",
    cityLocative: "Lizbonie",
    cityGenitive: "Lizbony",
    countryNominative: "Portugalia",
    countryLocative: "Portugalii",
    countryGenitive: "Portugalii",
    aliasQueries: [
      "hotele Lizbona centrum",
      "noclegi Lizbona",
      "tanie hotele Lizbona",
      "wakacje Lizbona 2026",
    ],
    monthlySearchVolumePL: 11000,
  },
  {
    slug: "ateny",
    destinationId: "athens-greece",
    cityNominative: "Ateny",
    cityLocative: "Atenach",
    cityGenitive: "Aten",
    countryNominative: "Grecja",
    countryLocative: "Grecji",
    countryGenitive: "Grecji",
    aliasQueries: [
      "hotele Ateny centrum",
      "noclegi Ateny",
      "tanie hotele Ateny",
      "wakacje Ateny 2026",
    ],
    monthlySearchVolumePL: 12000,
  },
  {
    slug: "praga",
    destinationId: "prague-czechia",
    cityNominative: "Praga",
    cityLocative: "Pradze",
    cityGenitive: "Pragi",
    countryNominative: "Czechy",
    countryLocative: "Czechach",
    countryGenitive: "Czech",
    aliasQueries: [
      "hotele Praga centrum",
      "noclegi Praga",
      "tanie hotele Praga",
      "wakacje Praga 2026",
    ],
    monthlySearchVolumePL: 21000,
  },
];

export function findCommercialCityBySlug(slug: string): CommercialCity | undefined {
  return commercialCities.find((c) => c.slug === slug);
}

export function commercialCitySlugs(): string[] {
  return commercialCities.map((c) => c.slug);
}
