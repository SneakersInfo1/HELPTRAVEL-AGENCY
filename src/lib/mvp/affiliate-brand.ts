export type AffiliateBrandId =
  | "booking"
  | "cheapoair"
  | "expedia"
  | "getrentacar"
  | "google"
  | "hotels"
  | "klook"
  | "localrent"
  | "tiqets"
  | "travelpayouts"
  | "vrbo"
  | "generic";

function extractComparableUrl(input: string): string {
  try {
    const parsed = new URL(input);
    const nestedUrl = parsed.searchParams.get("url");
    if (!nestedUrl) return input;

    if (nestedUrl.startsWith("http://") || nestedUrl.startsWith("https://")) {
      return nestedUrl;
    }

    return `https://${nestedUrl}`;
  } catch {
    return input;
  }
}

function normalizeHostname(url: string): string {
  try {
    return new URL(extractComparableUrl(url)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function identifyBrandId(source?: string): AffiliateBrandId | null {
  const hostname = normalizeHostname(source ?? "");
  const normalizedSource = source?.toLowerCase() ?? "";

  if (hostname.includes("cheapoair") || normalizedSource.includes("cheapoair")) return "cheapoair";
  if (hostname.includes("booking") || normalizedSource.includes("booking.com")) return "booking";
  if (hostname.includes("hotels.com") || normalizedSource.includes("hotels.com")) return "hotels";
  if (hostname.includes("expedia") || normalizedSource.includes("expedia")) return "expedia";
  if (hostname.includes("vrbo") || normalizedSource.includes("vrbo")) return "vrbo";
  if (hostname.includes("klook") || normalizedSource.includes("klook")) return "klook";
  if (hostname.includes("tiqets") || normalizedSource.includes("tiqets")) return "tiqets";
  if (hostname.includes("localrent") || normalizedSource.includes("localrent")) return "localrent";
  if (hostname.includes("getrentacar") || normalizedSource.includes("getrentacar")) return "getrentacar";
  if (hostname.includes("google") || normalizedSource.includes("google")) return "google";
  if (hostname.includes("travelpayouts") || normalizedSource.includes("travelpayouts")) return "travelpayouts";

  return null;
}

export function getAffiliateBrandId(source?: string, fallback: AffiliateBrandId = "generic"): AffiliateBrandId {
  return identifyBrandId(source) ?? fallback;
}

export function getAffiliateBrandLabel(source?: string, fallback = "Partner"): string {
  switch (getAffiliateBrandId(source)) {
    case "cheapoair":
      return "CheapOair";
    case "booking":
      return "Booking.com";
    case "hotels":
      return "Hotels.com";
    case "expedia":
      return "Expedia";
    case "vrbo":
      return "Vrbo";
    case "klook":
      return "Klook";
    case "tiqets":
      return "Tiqets";
    case "localrent":
      return "Localrent";
    case "getrentacar":
      return "GetRentacar";
    case "google":
      return "Partner discovery";
    case "travelpayouts":
      return "Travelpayouts";
    default:
      return fallback;
  }
}
