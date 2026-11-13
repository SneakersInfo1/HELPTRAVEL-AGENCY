// Klasyfikacja adresów i zapytań GSC na segmenty decyzyjne.
//
// Czyste funkcje — te same reguły służą raportowi bazowemu, backlogowi
// szans, selektorowi silnika treści i raportowi tygodniowemu.

import { polishMonthSlugs } from "@/lib/mvp/months";

export type UrlSegment =
  | "home"
  | "comparison"
  | "comparison_hub"
  | "month"
  | "guide"
  | "guide_hub"
  | "mood_hub"
  | "season"
  | "article"
  | "article_hub"
  | "city_hotels"
  | "hotel_detail"
  | "info"
  | "legacy"
  | "other";

const INFO_PATHS = new Set([
  "/o-nas", "/cennik", "/jak-pracujemy", "/faq", "/kontakt", "/redakcja", "/standard-redakcyjny", "/oferta",
  "/regulamin", "/polityka-prywatnosci", "/mapa-serwisu", "/dla-partnerow",
]);

const MONTHS = new Set<string>(polishMonthSlugs);

export interface ClassifiedUrl {
  segment: UrlSegment;
  /** Ścieżka bez hosta, zdekodowana. */
  path: string;
  hasQuery: boolean;
  /** Slug kierunku dla guide i month, slug pary dla comparison. */
  slug: string | null;
  month: string | null;
  /** Wariant adresu, który nie powinien mieć własnych wyświetleń. */
  anomaly: "lang_param" | "en_prefix" | "non_ascii_path" | "planner" | "query_string" | null;
}

export function classifyUrl(rawUrl: string): ClassifiedUrl {
  let url: URL;
  try {
    url = new URL(rawUrl, "https://helptravel.pl");
  } catch {
    return { segment: "other", path: rawUrl, hasQuery: false, slug: null, month: null, anomaly: null };
  }
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = url.pathname;
  }
  if (path.length > 1) path = path.replace(/\/$/, "");
  const hasQuery = url.search.length > 1;

  let anomaly: ClassifiedUrl["anomaly"] = null;
  if (url.searchParams.has("lang")) anomaly = "lang_param";
  else if (path === "/en" || path.startsWith("/en/")) anomaly = "en_prefix";
  else if (path === "/planner" || path.startsWith("/planner/")) anomaly = "planner";
  else if (/[^\x00-\x7F]/.test(path)) anomaly = "non_ascii_path";
  else if (hasQuery) anomaly = "query_string";

  const base = { path, hasQuery, anomaly };
  const parts = path.split("/").filter(Boolean);

  if (anomaly === "en_prefix" || anomaly === "planner" || anomaly === "non_ascii_path") {
    return { ...base, segment: "legacy", slug: null, month: null };
  }
  if (parts.length === 0) return { ...base, segment: "home", slug: null, month: null };

  const [first, second, third] = parts;
  if (first === "porownanie") {
    return second
      ? { ...base, segment: "comparison", slug: second, month: null }
      : { ...base, segment: "comparison_hub", slug: null, month: null };
  }
  if (first === "kierunki") {
    if (!second) return { ...base, segment: "guide_hub", slug: null, month: null };
    if (third && MONTHS.has(third)) return { ...base, segment: "month", slug: second, month: third };
    if (!third) return { ...base, segment: "guide", slug: second, month: null };
    return { ...base, segment: "other", slug: second, month: null };
  }
  if (first === "wyjazdy") return { ...base, segment: "mood_hub", slug: second ?? null, month: null };
  if (first === "najlepsze-kierunki") return { ...base, segment: "season", slug: second ?? null, month: null };
  if (first === "inspiracje") {
    return second
      ? { ...base, segment: "article", slug: second, month: null }
      : { ...base, segment: "article_hub", slug: null, month: null };
  }
  if (first === "hotele") {
    if (second === "w" && third) return { ...base, segment: "city_hotels", slug: third, month: null };
    if (second && /^lp[0-9a-f]+$/i.test(second)) return { ...base, segment: "hotel_detail", slug: second, month: null };
    return { ...base, segment: "other", slug: null, month: null };
  }
  if (INFO_PATHS.has(path)) return { ...base, segment: "info", slug: null, month: null };
  if (
    ["city-breaki", "cieple-kierunki", "bez-wizy", "tanie-podroze", "weekendowe-wyjazdy", "przewodniki"].includes(first) &&
    !second
  ) {
    return { ...base, segment: "article_hub", slug: first, month: null };
  }
  return { ...base, segment: "other", slug: null, month: null };
}

// ── Marka ────────────────────────────────────────────────────────────────
//
// Dolne ograniczenie: łapiemy warianty i literówki nazwy. Zapytania
// anonimizowane przez GSC nie trafiają do eksportu, więc realny udział marki
// jest wyższy niż wynik tej funkcji — raporty muszą to mówić wprost.

const BRAND_PATTERNS: RegExp[] = [
  /help\s*[-.]?\s*trav/i, // helptravel, help travel, help-travel, helptrav
  /hel+p?\s*trave?l/i, // heltravel, helptravl
  /travel\s*help/i, // travelhelp, travel help
  /helptavel|helptrvel|helptarvel|helptravle/i,
];

export function isBrandQuery(query: string): boolean {
  const normalized = query.normalize("NFKC").toLowerCase();
  return BRAND_PATTERNS.some((pattern) => pattern.test(normalized));
}

// ── Intencja zapytania ───────────────────────────────────────────────────

export type QueryIntent =
  | "brand"
  | "weather_month"
  | "comparison"
  | "city_break"
  | "hotels"
  | "budget"
  | "destination_generic"
  | "entry_requirements"
  | "other";

const MONTH_WORDS =
  /(stycz|lut|marz|marc|kwie|maj|czerw|lip|sierp|wrze|paźdz|pazdz|listopad|grud)/i;
const WEATHER_WORDS = /(pogod|temperatur|ile stopni|klimat|ciepło|cieplo|woda|morz)/i;
const COMPARISON = /(\sczy\s|\svs\.?\s|\sa\s|\salbo\s|\skontra\s|\slub\s)/i;
const HIGH_RISK = /(wiza|wizy|paszport|dowód|dowod|msz|bezpiecz|szczepi|covid|wjazd|ubezpiecz)/i;

export function classifyQuery(query: string): QueryIntent {
  const q = ` ${query.normalize("NFKC").toLowerCase().trim()} `;
  if (isBrandQuery(q)) return "brand";
  if (HIGH_RISK.test(q)) return "entry_requirements";
  if (/city\s*break|citybreak/.test(q)) return "city_break";
  if (COMPARISON.test(q) && !WEATHER_WORDS.test(q)) return "comparison";
  if (WEATHER_WORDS.test(q) || MONTH_WORDS.test(q)) return "weather_month";
  if (/hotel|nocleg|apartament/.test(q)) return "hotels";
  if (/tani|budżet|budzet|do \d+ ?zł|do \d+ ?zl|cena|ceny|ile kosztuje/.test(q)) return "budget";
  if (q.trim().split(/\s+/).length <= 2) return "destination_generic";
  return "other";
}

/** Zapytania, których nie wolno obsługiwać treścią publikowaną automatycznie. */
export function isHighRiskIntent(intent: QueryIntent): boolean {
  return intent === "entry_requirements";
}
