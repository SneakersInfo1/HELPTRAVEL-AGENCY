import { destinationCatalog, getDestinationCatalogCount } from "./destination-catalog";

interface CjDestinationSeed {
  city: string;
  country: string;
  destinationLabel: string;
}

interface CjStayLinks {
  hotels: string;
  expedia: string;
  vrbo: string;
}

interface CjStayBuildOptions {
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  rooms?: number;
}

const DEFAULT_CHECK_IN_OFFSET_DAYS = 30;
const DEFAULT_NIGHTS = 4;
const DEFAULT_ADULTS = 2;
const DEFAULT_ROOMS = 1;

const CJ_DESTINATIONS: CjDestinationSeed[] = destinationCatalog.map((item) => ({
  city: item.city,
  country: item.country,
  destinationLabel: item.label,
}));

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildKey(city: string, country: string): string {
  return `${normalize(city)}|${normalize(country)}`;
}

const CJ_DESTINATION_MAP = new Map(CJ_DESTINATIONS.map((item) => [buildKey(item.city, item.country), item]));

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDefaultStayWindow(): { checkIn: string; checkOut: string } {
  const checkInDate = new Date();
  checkInDate.setDate(checkInDate.getDate() + DEFAULT_CHECK_IN_OFFSET_DAYS);

  const checkOutDate = new Date(checkInDate);
  checkOutDate.setDate(checkOutDate.getDate() + DEFAULT_NIGHTS);

  return {
    checkIn: formatDate(checkInDate),
    checkOut: formatDate(checkOutDate),
  };
}

function resolveStayWindow(options?: CjStayBuildOptions): {
  checkIn: string;
  checkOut: string;
  adults: number;
  rooms: number;
} {
  const defaults = buildDefaultStayWindow();
  return {
    checkIn: options?.checkIn ?? defaults.checkIn,
    checkOut: options?.checkOut ?? defaults.checkOut,
    adults: options?.adults ?? DEFAULT_ADULTS,
    rooms: options?.rooms ?? DEFAULT_ROOMS,
  };
}

function wrapCjUrl(template: string | undefined, destinationUrl: string): string {
  if (!template) return destinationUrl;

  const resolved = template
    .replaceAll("{url}", destinationUrl)
    .replaceAll("{urlEncoded}", encodeURIComponent(destinationUrl));

  return resolved.startsWith("https://") ? resolved : destinationUrl;
}

function buildHotelsDestinationUrl(seed: CjDestinationSeed, options?: CjStayBuildOptions): string {
  const { checkIn, checkOut, adults, rooms } = resolveStayWindow(options);
  const params = new URLSearchParams({
    destination: seed.destinationLabel,
    d1: checkIn,
    startDate: checkIn,
    d2: checkOut,
    endDate: checkOut,
    adults: String(adults),
    rooms: String(rooms),
    sort: "RECOMMENDED",
    useRewards: "false",
  });

  return `https://www.hotels.com/Hotel-Search?${params.toString()}`;
}

function buildExpediaDestinationUrl(seed: CjDestinationSeed, options?: CjStayBuildOptions): string {
  const { checkIn, checkOut, adults, rooms } = resolveStayWindow(options);
  const params = new URLSearchParams({
    destination: seed.destinationLabel,
    d1: checkIn,
    startDate: checkIn,
    d2: checkOut,
    endDate: checkOut,
    adults: String(adults),
    rooms: String(rooms),
    sort: "RECOMMENDED",
    useRewards: "false",
  });

  return `https://www.expedia.com/Hotel-Search?${params.toString()}`;
}

function buildVrboDestinationUrl(seed: CjDestinationSeed, options?: CjStayBuildOptions): string {
  const { checkIn, checkOut, adults } = resolveStayWindow(options);
  const params = new URLSearchParams({
    destination: seed.destinationLabel,
    d1: checkIn,
    startDate: checkIn,
    d2: checkOut,
    endDate: checkOut,
    adults: String(adults),
  });

  return `https://www.vrbo.com/search?${params.toString()}`;
}

export function getCjDestinationSeed(city: string, country: string): CjDestinationSeed | null {
  return CJ_DESTINATION_MAP.get(buildKey(city, country)) ?? null;
}

export function buildCjStayLinks(city: string, country: string, options?: CjStayBuildOptions): CjStayLinks | null {
  const seed = getCjDestinationSeed(city, country);
  if (!seed) return null;

  const hotelsDestinationUrl = buildHotelsDestinationUrl(seed, options);
  const expediaDestinationUrl = buildExpediaDestinationUrl(seed, options);
  const vrboDestinationUrl = buildVrboDestinationUrl(seed, options);

  return {
    hotels: wrapCjUrl(process.env.CJ_HOTELS_COM_TEMPLATE?.trim(), hotelsDestinationUrl),
    expedia: wrapCjUrl(process.env.CJ_EXPEDIA_TEMPLATE?.trim(), expediaDestinationUrl),
    vrbo: wrapCjUrl(process.env.CJ_VRBO_TEMPLATE?.trim(), vrboDestinationUrl),
  };
}

export function getCjSupportedDestinationCount(): number {
  return getDestinationCatalogCount();
}
