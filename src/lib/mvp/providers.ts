import type { TravelProviderKey } from "./commercial-assets";

const providerLabels: Record<TravelProviderKey, string> = {
  flights: "Loty",
  stays: "Noclegi",
  attractions: "Atrakcje",
  cars: "Samochody",
};

export function getProviderLabel(providerKey: TravelProviderKey): string {
  return providerLabels[providerKey];
}

export function buildRedirectHref(args: {
  providerKey: TravelProviderKey;
  targetUrl: string;
  itineraryResultId?: string;
  destinationSlug?: string;
  requestId?: string;
  city?: string;
  country?: string;
  source?: string;
  rank?: number;
  query?: string;
}): string {
  const params = new URLSearchParams();
  params.set("url", args.targetUrl);
  if (args.itineraryResultId) params.set("itineraryResultId", args.itineraryResultId);
  if (args.destinationSlug) params.set("destinationSlug", args.destinationSlug);
  if (args.requestId) params.set("requestId", args.requestId);
  if (args.city) params.set("city", args.city);
  if (args.country) params.set("country", args.country);
  if (args.source) params.set("source", args.source);
  if (typeof args.rank === "number") params.set("rank", String(args.rank));
  if (args.query) params.set("query", args.query);
  return `/api/redirect/${args.providerKey}?${params.toString()}`;
}
