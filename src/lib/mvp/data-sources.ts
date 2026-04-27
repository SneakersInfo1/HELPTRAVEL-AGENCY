export type DataDomain = "flights" | "stays" | "activities" | "transfers" | "research";

export type SourceRole = "primary" | "secondary" | "fallback";
export type PartnerNetwork = "CJ" | "Travelpayouts" | "CJ / Travelpayouts" | "Fallback";

export interface DataSourceOption {
  provider: string;
  role: SourceRole;
  purpose: string;
  notes: string;
}

export const DATA_SOURCE_STRATEGY: Record<DataDomain, DataSourceOption[]> = {
  flights: [
    {
      provider: "Travelpayouts (Aviasales Flight Data)",
      role: "primary",
      purpose: "cached flight prices + affiliate redirect",
      notes: "Meta-search via Travelpayouts API. Click leads to Aviasales for live booking with affiliate marker.",
    },
  ],
  stays: [
    {
      provider: "Travelpayouts (Hotellook)",
      role: "primary",
      purpose: "hotel meta-search with prices",
      notes: "Hotellook cache.json gives hotel cards with prices in PLN. Click leads to partner via marker.",
    },
    {
      provider: "Stay22",
      role: "secondary",
      purpose: "smart Booking redirect / map widget",
      notes: "Used as secondary CTA under hotel cards (Booking, Airbnb, Vrbo deep links).",
    },
    {
      provider: "CJ",
      role: "secondary",
      purpose: "affiliate hotel redirects (Hotels.com, Expedia, Vrbo)",
      notes: "Compare-price buttons under hotel cards.",
    },
  ],
  activities: [
    {
      provider: "Travelpayouts",
      role: "primary",
      purpose: "activities and add-ons",
      notes: "Use for attractions, tours and add-ons where partner coverage is available.",
    },
    {
      provider: "SerpApi or Apify",
      role: "fallback",
      purpose: "discovery and enrichment",
      notes: "Use to sharpen the recommendation layer, not to replace partner inventory.",
    },
  ],
  transfers: [
    {
      provider: "Partner APIs",
      role: "primary",
      purpose: "transfer inventory",
      notes: "Use when a direct supplier feed is available and stable.",
    },
    {
      provider: "Travelpayouts",
      role: "secondary",
      purpose: "affiliate fallback",
      notes: "Use when we need a simpler redirect-based option.",
    },
    {
      provider: "Manual routing",
      role: "fallback",
      purpose: "safe fallback",
      notes: "Use if no live transfer source is available for the destination.",
    },
  ],
  research: [
    {
      provider: "SerpApi",
      role: "primary",
      purpose: "structured search data",
      notes: "Use for Google Search, Google Hotels and Google Flights enrichment signals.",
    },
    {
      provider: "Apify",
      role: "secondary",
      purpose: "scraping-based enrichment",
      notes: "Use only when a quick research actor is enough and the result is not a source of truth.",
    },
  ],
};

export const DATA_SOURCE_ORDER: DataDomain[] = ["flights", "stays", "activities", "transfers", "research"];

export interface CurrentPartnerRouting {
  network: PartnerNetwork;
  partners: string[];
  fallback: string;
}

export const CURRENT_PARTNER_ROUTING: Record<"flights" | "stays" | "activities" | "transfers" | "extras", CurrentPartnerRouting> = {
  stays: {
    network: "CJ",
    partners: ["Hotels.com", "Expedia", "Vrbo", "Hotels.com Poland", "CheapTickets", "Orbitz", "LOT Global"],
    fallback: "Booking search or generic stay redirect",
  },
  flights: {
    network: "CJ / Travelpayouts",
    partners: ["Aviasales", "Kiwi.com", "LOT Global"],
    fallback: "Google Flights / Google search style redirect",
  },
  activities: {
    network: "Travelpayouts",
    partners: ["Tiqets", "Klook", "WeGoTrip"],
    fallback: "Manual activity routing or search enrichment",
  },
  transfers: {
    network: "Travelpayouts",
    partners: ["Kiwitaxi", "Localrent", "GetRentacar"],
    fallback: "Manual transfer routing",
  },
  extras: {
    network: "Travelpayouts",
    partners: ["Yesim"],
    fallback: "Manual extra routing",
  },
};

export function getDataSourceSummary(domain: DataDomain): string {
  const entries = DATA_SOURCE_STRATEGY[domain];
  const primary = entries.find((entry) => entry.role === "primary") ?? entries[0];
  const fallback = entries.find((entry) => entry.role === "fallback") ?? entries[entries.length - 1];

  return `${domain}: primary=${primary.provider}; fallback=${fallback.provider}`;
}
