// Normy klimatyczne kierunków z oficjalnego serwisu WMO (World Weather Information Service).
//
//   pnpm seo:climate                 # pobiera i zapisuje src/lib/mvp/climate-normals.generated.json
//   pnpm seo:climate -- --dry-run    # tylko dopasowanie miast, bez pobierania norm
//
// Po co: temperatury na stronach treści były wpisane ręcznie, bez źródła i bez
// definicji (część to średnie maksima, część średnie dobowe). WWIS publikuje normy
// przekazane przez krajowe służby meteorologiczne: średnią temperaturę maksymalną
// i minimalną, liczbę dni z opadem i sumę opadu dla każdego miesiąca, z okresem normy.
//
// Warunki użycia (https://worldweather.wmo.int/en/dataguide.html): podać WWIS jako
// źródło i odtwarzać informacje wiernie. Dlatego zapisujemy wartości bez zaokrągleń,
// a strona pokazuje je z jednym miejscem po przecinku i z nazwą źródła.
//
// Dopasowanie miasta musi być jednoznaczne. Kierunek bez pewnego odpowiednika nie
// dostaje liczb — lepszy brak niż norma z innego miasta.

import { writeFileSync } from "node:fs";

import { getAllDestinationProfiles } from "../../src/lib/mvp/destinations";

const BASE = "https://worldweather.wmo.int/en";
const OUT = "src/lib/mvp/climate-normals.generated.json";
const USER_AGENT = "HelpTravelClimateNormals/1.0 (+https://helptravel.pl/o-nas; dane klimatyczne do stron kierunkow)";

/** Nazwy krajów w naszych danych → nazwy w wykazie miast WWIS. */
const COUNTRY_ALIASES: Readonly<Record<string, string[]>> = {
  UK: ["United Kingdom of Great Britain and Northern Ireland", "United Kingdom"],
  "United Kingdom": ["United Kingdom of Great Britain and Northern Ireland"],
  USA: ["United States of America"],
  "United States": ["United States of America"],
  Czechia: ["Czech Republic", "Czechia"],
  Turkey: ["Türkiye", "Turkey"],
  Russia: ["Russian Federation"],
  "South Korea": ["Republic of Korea"],
  Vietnam: ["Viet Nam"],
  Tanzania: ["United Republic of Tanzania", "Tanzania, United Republic of"],
  Moldova: ["Republic of Moldova"],
  "North Macedonia": ["North Macedonia", "The former Yugoslav Republic of Macedonia"],
  UAE: ["United Arab Emirates"],
  "Hong Kong": ["Hong Kong, China"],
  Netherlands: ["Netherlands", "Netherlands (Kingdom of the)"],
  Iran: ["Iran, Islamic Republic of"],
  Bolivia: ["Bolivia, Plurinational State of"],
  Venezuela: ["Venezuela, Bolivarian Republic of"],
  Laos: ["Lao People's Democratic Republic"],
  Syria: ["Syrian Arab Republic"],
};

/**
 * Ręczne przypisania tam, gdzie nazwa w WWIS różni się od naszej. Każde zostało
 * sprawdzone w wykazie miast; wpis `null` oznacza „świadomie bez danych”.
 */
const CITY_OVERRIDES: Readonly<Record<string, string | null>> = {
  "agadir-morocco": "Agadir Inezganne",
  "seville-spain": "Sevilla",
  "alicante-spain": "Alicante/Alacant",
  "palma-spain": "Palma de Mallorca",
  "las-palmas-spain": "Las Palmas de Gran Canaria",
  "ibiza-town-spain": "Eivissa",
  "san-sebastian-spain": "Donostia/San Sebastian",
  "lisbon-portugal": "Lisboa",
  "rome-italy": "Rome (ROMA)",
  "naples-italy": "Naples (NAPOLI)",
  "milan-italy": "Milan (MILANO)",
  "venice-italy": "Venice (VENEZIA)",
  "florence-italy": "Florence (FIRENZE)",
  "turin-italy": "Torino",
  "genoa-italy": "Genova",
  "heraklion-greece": "Herakleion",
  "corfu-greece": "Kerkyra",
  "marrakesh-morocco": "Marrakech",
  "fez-morocco": "Fes",
  "tangier-morocco": "Tanger",
  "rabat-morocco": "Rabat-Sale",
  "tunis-tunisia": "Tunis-Carthage",
  "cologne-germany": "Koeln",
  "nuremberg-germany": "Nuernberg",
  "bruges-belgium": "Brugge",
  "mexico-city-mexico": "Ciudad de Mexico",
  "koh-samui-thailand": "Ko Samui",
  "new-york-united-states-of-america": "New York City, New York",
  "los-angeles-united-states-of-america": "Los Angeles, California",
  "san-francisco-united-states-of-america": "San Francisco, California",
  "miami-united-states-of-america": "Miami, Florida",
  "las-vegas-united-states-of-america": "Las Vegas, Nevada",
  "chicago-united-states-of-america": "Chicago, Illinois",
  "boston-united-states-of-america": "Boston, Massachusetts",
  "washington-united-states-of-america": "Washington DC",
  "orlando-united-states-of-america": "Orlando, Florida",
  "seattle-united-states-of-america": "Seattle, Washington",
  "toronto-canada": "Toronto, Ontario",
  "vancouver-canada": "Vancouver, British Columbia",
  "montreal-canada": "Montreal, Quebec",
  // Stacje lotniskowe w obrębie tego samego miasta lub aglomeracji; nazwę stacji pokazujemy przy danych.
  "chania-greece": "Souda (Chania)",
  "larnaca-cyprus": "Larnaka Airport",
  "paphos-cyprus": "Paphos Airport",
  "valletta-malta": "Luqa, Malta",
  "amsterdam-netherlands": "Amsterdam (Schiphol)",
  "helsinki-finland": "Helsinki-Vantaa",
  "muscat-oman": "Muscat (Seeb)",
};

interface CityRow {
  country: string;
  city: string;
  cityId: string;
}

interface WwisMonth {
  month: number;
  maxTemp: string | null;
  minTemp: string | null;
  raindays: string | null;
  rainfall: string | null;
}

export interface ClimateNormal {
  slug: string;
  cityId: string;
  wwisCity: string;
  stationName: string | null;
  provider: string;
  periodFrom: number | null;
  periodTo: number | null;
  sourceUrl: string;
  /** Współrzędne stacji z WWIS; szerokość służy do obliczenia długości dnia. */
  latitude: number | null;
  longitude: number | null;
  /** Styczeń–grudzień. `null` = służba nie podała wartości. */
  maxTempC: number[];
  minTempC: number[];
  rainDays: Array<number | null>;
  rainfallMm: Array<number | null>;
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

async function get(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json,text/plain" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response.text();
}

function parseCityList(text: string): CityRow[] {
  return text
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(";").map((cell) => cell.replace(/^"|"$/g, "")))
    .filter((cells) => cells.length >= 3 && cells[2])
    .map(([country, city, cityId]) => ({ country, city, cityId }));
}

function matchCity(profile: { slug: string; city: string; country: string }, rows: readonly CityRow[]): CityRow | { reason: string } {
  const countries = new Set([profile.country, ...(COUNTRY_ALIASES[profile.country] ?? [])].map(fold));
  const inCountry = rows.filter((row) => countries.has(fold(row.country)));
  if (inCountry.length === 0) return { reason: `brak kraju „${profile.country}” w wykazie` };
  if (profile.slug in CITY_OVERRIDES) {
    const wanted = CITY_OVERRIDES[profile.slug];
    if (wanted === null) return { reason: "świadomie pominięte" };
    const hit = inCountry.filter((row) => fold(row.city) === fold(wanted));
    return hit.length === 1 ? hit[0] : { reason: `przypisanie ręczne „${wanted}” nie wskazuje jednego miasta` };
  }
  const exact = inCountry.filter((row) => fold(row.city) === fold(profile.city));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return { reason: "kilka miast o tej nazwie" };
  return { reason: "brak miasta o tej nazwie" };
}

const number = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function coordinate(value: string | undefined, limit: number): number | null {
  const parsed = number(value);
  return parsed !== null && Math.abs(parsed) <= limit ? parsed : null;
}

function toNormal(slug: string, row: CityRow, raw: string): ClimateNormal | { reason: string } {
  const data = JSON.parse(raw) as {
    city?: {
      cityName?: string;
      cityLatitude?: string;
      cityLongitude?: string;
      stationName?: string;
      member?: { orgName?: string; memName?: string };
      climate?: { datab?: number | string; datae?: number | string; climateMonth?: WwisMonth[] };
    };
  };
  const city = data.city;
  const months = [...(city?.climate?.climateMonth ?? [])].sort((a, b) => a.month - b.month);
  if (months.length !== 12 || months.some((month, index) => month.month !== index + 1)) return { reason: "brak kompletu 12 miesięcy" };
  const maxTempC = months.map((month) => number(month.maxTemp));
  const minTempC = months.map((month) => number(month.minTemp));
  if (maxTempC.some((value) => value === null) || minTempC.some((value) => value === null)) return { reason: "brak temperatur dla części miesięcy" };
  // Wartości nieprawdopodobne oznaczają błąd w danych źródła; takiej normy nie bierzemy.
  if (maxTempC.some((value, index) => value! < -60 || value! > 60 || value! < minTempC[index]!)) return { reason: "temperatury poza zakresem albo maksimum niższe od minimum" };
  const provider = city?.member?.orgName?.trim() || city?.member?.memName?.trim();
  if (!provider) return { reason: "brak nazwy służby meteorologicznej" };
  const year = (value: number | string | undefined) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 1800 ? parsed : null;
  };
  return {
    slug,
    cityId: row.cityId,
    wwisCity: city?.cityName?.trim() || row.city,
    stationName: city?.stationName?.trim() || null,
    provider,
    periodFrom: year(city?.climate?.datab),
    periodTo: year(city?.climate?.datae),
    sourceUrl: `${BASE}/city.html?cityId=${row.cityId}`,
    latitude: coordinate(city?.cityLatitude, 90),
    longitude: coordinate(city?.cityLongitude, 180),
    maxTempC: maxTempC as number[],
    minTempC: minTempC as number[],
    rainDays: months.map((month) => number(month.raindays)),
    rainfallMm: months.map((month) => number(month.rainfall)),
  };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const rows = parseCityList(await get(`${BASE}/json/full_city_list.txt`));
  const profiles = getAllDestinationProfiles();
  const normals: ClimateNormal[] = [];
  const skipped: Array<{ slug: string; reason: string }> = [];

  for (const profile of profiles) {
    const match = matchCity(profile, rows);
    if ("reason" in match) {
      skipped.push({ slug: profile.slug, reason: match.reason });
      continue;
    }
    if (dryRun) {
      console.log(`✔ ${profile.slug} → ${match.city} (${match.country}, ${match.cityId})`);
      continue;
    }
    try {
      const normal = toNormal(profile.slug, match, await get(`${BASE}/json/${match.cityId}_en.json`));
      if ("reason" in normal) skipped.push({ slug: profile.slug, reason: normal.reason });
      else normals.push(normal);
    } catch (error) {
      skipped.push({ slug: profile.slug, reason: error instanceof Error ? error.message : String(error) });
    }
    // Jedno żądanie naraz z przerwą — to serwis publiczny, nie API dla robotów.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  console.log(`\nkierunków: ${profiles.length} | z normą: ${dryRun ? profiles.length - skipped.length : normals.length} | bez: ${skipped.length}`);
  const reasons = new Map<string, string[]>();
  for (const item of skipped) reasons.set(item.reason, [...(reasons.get(item.reason) ?? []), item.slug]);
  for (const [reason, slugs] of reasons) console.log(`  ${reason}: ${slugs.length} — ${slugs.join(", ")}`);
  if (dryRun) return;

  normals.sort((a, b) => a.slug.localeCompare(b.slug));
  const payload = {
    source: "WMO World Weather Information Service",
    sourceUrl: "https://worldweather.wmo.int",
    terms: "https://worldweather.wmo.int/en/dataguide.html",
    retrievedAt: new Date().toISOString().slice(0, 10),
    normals,
  };
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`zapisano ${OUT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
