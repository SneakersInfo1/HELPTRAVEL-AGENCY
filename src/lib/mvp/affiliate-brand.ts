export type AffiliateBrandId =
  | "booking"
  | "aviasales"
  | "cheapoair"
  | "expedia"
  | "getrentacar"
  | "google"
  | "hotels"
  | "klook"
  | "kiwi"
  | "kiwitaxi"
  | "localrent"
  | "lot"
  | "yesim"
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

  if (hostname.includes("aviasales") || normalizedSource.includes("aviasales")) return "aviasales";
  if (hostname.includes("cheapoair") || normalizedSource.includes("cheapoair")) return "cheapoair";
  if (hostname.includes("booking") || normalizedSource.includes("booking.com")) return "booking";
  if (hostname.includes("hotels.com") || normalizedSource.includes("hotels.com")) return "hotels";
  if (hostname.includes("expedia") || normalizedSource.includes("expedia")) return "expedia";
  if (hostname.includes("vrbo") || normalizedSource.includes("vrbo")) return "vrbo";
  if (hostname.includes("klook") || normalizedSource.includes("klook")) return "klook";
  if (hostname.includes("tiqets") || normalizedSource.includes("tiqets")) return "tiqets";
  if (hostname.includes("kiwitaxi") || normalizedSource.includes("kiwitaxi")) return "kiwitaxi";
  if (hostname.includes("kiwi.com") || normalizedSource.includes("kiwi.com")) return "kiwi";
  if (hostname.includes("localrent") || normalizedSource.includes("localrent")) return "localrent";
  if (hostname.includes("getrentacar") || normalizedSource.includes("getrentacar")) return "getrentacar";
  if (hostname.includes("lot.com") || normalizedSource.includes("lot global") || normalizedSource.includes("lot.com")) return "lot";
  if (hostname.includes("yesim") || normalizedSource.includes("yesim")) return "yesim";
  if (hostname.includes("google") || normalizedSource.includes("google")) return "google";
  if (hostname.includes("travelpayouts") || normalizedSource.includes("travelpayouts")) return "travelpayouts";

  return null;
}

export function getAffiliateBrandId(source?: string, fallback: AffiliateBrandId = "generic"): AffiliateBrandId {
  return identifyBrandId(source) ?? fallback;
}

export function getAffiliateBrandLabel(source?: string, fallback = "Partner"): string {
  switch (getAffiliateBrandId(source)) {
    case "aviasales":
      return "Aviasales";
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
    case "kiwi":
      return "Kiwi.com";
    case "kiwitaxi":
      return "Kiwitaxi";
    case "tiqets":
      return "Tiqets";
    case "localrent":
      return "Localrent";
    case "lot":
      return "LOT Global";
    case "yesim":
      return "Yesim";
    case "getrentacar":
      return "GetRentacar";
    case "google":
      return "Google Travel";
    case "travelpayouts":
      return "Travelpayouts";
    default:
      return fallback;
  }
}
