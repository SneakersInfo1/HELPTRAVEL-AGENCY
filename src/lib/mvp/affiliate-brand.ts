function normalizeHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function getAffiliateBrandLabel(url?: string, fallback = "Partner"): string {
  const hostname = normalizeHostname(url ?? "");

  if (hostname.includes("cheapoair")) return "CheapOair";
  if (hostname.includes("booking")) return "Booking.com";
  if (hostname.includes("klook")) return "Klook";
  if (hostname.includes("tiqets")) return "Tiqets";
  if (hostname.includes("localrent")) return "Localrent";
  if (hostname.includes("google")) return "Partner discovery";
  if (hostname.includes("travelpayouts")) return "Travelpayouts";

  return fallback;
}
