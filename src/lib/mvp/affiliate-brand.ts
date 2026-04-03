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

export function getAffiliateBrandLabel(url?: string, fallback = "Partner"): string {
  const hostname = normalizeHostname(url ?? "");

  if (hostname.includes("cheapoair")) return "CheapOair";
  if (hostname.includes("booking")) return "Booking.com";
  if (hostname.includes("hotels.com")) return "Hotels.com";
  if (hostname.includes("expedia")) return "Expedia";
  if (hostname.includes("vrbo")) return "Vrbo";
  if (hostname.includes("klook")) return "Klook";
  if (hostname.includes("tiqets")) return "Tiqets";
  if (hostname.includes("localrent")) return "Localrent";
  if (hostname.includes("google")) return "Partner discovery";
  if (hostname.includes("travelpayouts")) return "Travelpayouts";

  return fallback;
}
