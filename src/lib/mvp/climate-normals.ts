import climateNormalsJson from "./climate-normals.generated.json";

export type ClimateMonthlyValues<T> = readonly [
  T,
  T,
  T,
  T,
  T,
  T,
  T,
  T,
  T,
  T,
  T,
  T,
];

export interface ClimateNormal {
  slug: string;
  cityId: string;
  wwisCity: string;
  stationName: string;
  provider: string;
  periodFrom: number | null;
  periodTo: number | null;
  sourceUrl: string;
  /** Współrzędne stacji z WWIS. */
  latitude: number | null;
  longitude: number | null;
  /** Średnia miesięczna temperatura maksymalna w dzień. */
  maxTempC: ClimateMonthlyValues<number>;
  /** Średnia miesięczna temperatura minimalna w nocy. */
  minTempC: ClimateMonthlyValues<number>;
  rainDays: ClimateMonthlyValues<number | null>;
  rainfallMm: ClimateMonthlyValues<number>;
}

interface ClimateNormalsFile {
  normals: ClimateNormal[];
}

const climateNormals = (climateNormalsJson as unknown as ClimateNormalsFile).normals;
const climateNormalBySlug = new Map(climateNormals.map((normal) => [normal.slug, normal]));

/** Oficjalna norma klimatyczna WWIS dla kierunku; brak dopasowania nie ma fallbacku. */
export function getClimateNormal(slug: string): ClimateNormal | null {
  return climateNormalBySlug.get(slug) ?? null;
}

/** Polski zapis wartości z normy: zawsze jedno miejsce po przecinku. */
export function formatClimateNumber(value: number): string {
  return value.toLocaleString("pl-PL", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: false,
  });
}

/** Okres referencyjny podany przez dostawcę danych w WWIS. */
export function formatClimatePeriod(periodFrom: number | null, periodTo: number | null): string {
  return periodFrom !== null && periodTo !== null
    ? `norma ${periodFrom}–${periodTo}`
    : "okres normy niepodany przez źródło";
}

export const climateNormalCount = climateNormals.length;
