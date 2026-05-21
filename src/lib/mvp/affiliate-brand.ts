// Phase 1 brand identification — only Aviasales (flights) and "internal"
// (LiteAPI hotels — surfaced as HelpTravel itself) remain.

export type AffiliateBrandId = "aviasales" | "helptravel" | "generic";

function normalizeHostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function identifyBrandId(source?: string): AffiliateBrandId | null {
  if (!source) return null;
  const hostname = normalizeHostname(source);
  const lower = source.toLowerCase();
  if (hostname.includes("aviasales") || lower.includes("aviasales")) return "aviasales";
  if (lower.startsWith("/hotele") || lower.includes("helptravel")) return "helptravel";
  return null;
}

export function getAffiliateBrandId(source?: string, fallback: AffiliateBrandId = "generic"): AffiliateBrandId {
  return identifyBrandId(source) ?? fallback;
}

export function getAffiliateBrandLabel(source?: string, fallback = "Partner"): string {
  switch (getAffiliateBrandId(source)) {
    case "aviasales":
      return "Aviasales";
    case "helptravel":
      return "HelpTravel";
    default:
      return fallback;
  }
}
