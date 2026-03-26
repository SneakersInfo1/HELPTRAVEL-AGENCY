import "server-only";

import { resolveCityCoordinates } from "./geoapify";
import { normalizeLookup, resolveCountryCode } from "./location";
import { hotelbedsBaseUrl, hotelbedsHeaders } from "./hotelbeds-client";
import type { NormalizedActivityOffer } from "./types";

export interface HotelbedsActivitySearchInput {
  city: string;
  country: string;
  fromDate: string;
  toDate: string;
  travelers: number;
}

type AnyRecord = Record<string, unknown>;

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pickActivityCode(activity: AnyRecord): string {
  const record = activity as Record<string, unknown>;
  return pickString(record.code) ?? pickString(record.activityCode) ?? pickString(record.serviceCode) ?? "activity";
}

function pickActivityName(activity: AnyRecord): string {
  const record = activity as Record<string, unknown>;
  const content = (record.content ?? {}) as Record<string, unknown>;
  return (
    pickString(record.name) ??
    pickString(record.title) ??
    pickString(content.name) ??
    pickString(content.title) ??
    "Atrakcja"
  );
}

function pickDescription(activity: AnyRecord): string {
  const record = activity as Record<string, unknown>;
  const content = (record.content ?? {}) as Record<string, unknown>;
  return (
    pickString(record.description) ??
    pickString(record.summary) ??
    pickString(content.description) ??
    pickString(content.summary) ??
    ""
  );
}

function pickCategory(activity: AnyRecord): string {
  const record = activity as Record<string, unknown>;
  const category = (record.category ?? {}) as Record<string, unknown>;
  const content = (record.content ?? {}) as Record<string, unknown>;
  return (
    pickString(category.name) ??
    pickString(record.categoryName) ??
    pickString(record.type) ??
    pickString(((content.category ?? {}) as Record<string, unknown>).name) ??
    "Atrakcja"
  );
}

function pickCurrency(activity: AnyRecord): string {
  const record = activity as Record<string, unknown>;
  const price = (record.price ?? {}) as Record<string, unknown>;
  const modality = (((record.modalities ?? []) as Array<Record<string, unknown>>)[0] ?? {}) as Record<string, unknown>;
  const rate = (((modality.rates ?? []) as Array<Record<string, unknown>>)[0] ?? {}) as Record<string, unknown>;
  const ratePrice = (rate.price ?? {}) as Record<string, unknown>;
  const modalityPrice = (modality.price ?? {}) as Record<string, unknown>;
  return (
    pickString(record.currency) ??
    pickString(price.currency) ??
    pickString(price.currencyCode) ??
    pickString(rate.currency) ??
    pickString(ratePrice.currency) ??
    pickString(modalityPrice.currency) ??
    "EUR"
  )!;
}

function pickPrice(activity: AnyRecord): number {
  const record = activity as Record<string, unknown>;
  const price = (record.price ?? {}) as Record<string, unknown>;
  const modality = (((record.modalities ?? []) as Array<Record<string, unknown>>)[0] ?? {}) as Record<string, unknown>;
  const rate = (((modality.rates ?? []) as Array<Record<string, unknown>>)[0] ?? {}) as Record<string, unknown>;
  const ratePrice = (rate.price ?? {}) as Record<string, unknown>;
  const modalityPrice = (modality.price ?? {}) as Record<string, unknown>;
  const candidates = [
    price.totalAmount,
    price.total,
    price.amount,
    record.priceFrom,
    record.fromPrice,
    record.price_from,
    record.amount,
    record.totalAmount,
    record.total_amount,
    ratePrice.totalAmount,
    ratePrice.amount,
    ratePrice.total,
    rate.price,
    modalityPrice.totalAmount,
    modalityPrice.amount,
    modalityPrice.total,
    modality.price,
  ];

  for (const candidate of candidates) {
    const amount = toNumber(candidate);
    if (amount > 0) return amount;
  }
  return 0;
}

function pickImageUrl(activity: AnyRecord): string | undefined {
  const record = activity as Record<string, unknown>;
  const content = (record.content ?? {}) as Record<string, unknown>;
  const image =
    (((content.images ?? []) as Array<Record<string, unknown>>)[0]?.url as string | undefined) ??
    ((((record.images ?? []) as Array<Record<string, unknown>>)[0] ?? {}) as Record<string, unknown>).url as string | undefined ??
    pickString((record.image ?? {}) as Record<string, unknown> as never) ??
    (((record.media ?? []) as Array<Record<string, unknown>>)[0]?.url as string | undefined) ??
    (((record.modality ?? {}) as Record<string, unknown>).images as Array<Record<string, unknown>> | undefined)?.[0]?.url as string | undefined ??
    (((record.modalities ?? []) as Array<Record<string, unknown>>)[0]?.images as Array<Record<string, unknown>> | undefined)?.[0]?.url as string | undefined;
  return pickString(image);
}

function pickBookingUrl(activity: AnyRecord): string | undefined {
  const record = activity as Record<string, unknown>;
  const links = (record.links ?? {}) as Record<string, unknown>;
  return (
    pickString(record.url) ??
    pickString(record.website) ??
    pickString(record.web) ??
    pickString(links.book) ??
    pickString(links.web) ??
    pickString(record.bookingUrl)
  );
}

function pickDuration(activity: AnyRecord): string | undefined {
  const record = activity as Record<string, unknown>;
  const modality = (((record.modalities ?? []) as Array<Record<string, unknown>>)[0] ?? {}) as Record<string, unknown>;
  const duration = (modality.duration ?? {}) as Record<string, unknown>;
  const content = (record.content ?? {}) as Record<string, unknown>;
  return (
    pickString(record.duration) ??
    pickString(record.durationText) ??
    pickString(duration.text) ??
    pickString(duration.value) ??
    pickString(modality.duration) ??
    pickString(content.duration)
  );
}

function rankActivities(items: NormalizedActivityOffer[]): NormalizedActivityOffer[] {
  return [...items].sort((a, b) => a.priceFrom - b.priceFrom || (a.durationMinutes ?? 9999) - (b.durationMinutes ?? 9999));
}

export async function searchHotelbedsActivities(input: HotelbedsActivitySearchInput): Promise<{
  city: string;
  country: string;
  source: "hotelbeds";
  destinationCode?: string;
  fromDate: string;
  toDate: string;
  travelers: number;
  offers: NormalizedActivityOffer[];
  fetchedAt: string;
}> {
  const apiKey = process.env.HOTELBEDS_ACTIVITIES_API_KEY?.trim();
  const apiSecret = process.env.HOTELBEDS_ACTIVITIES_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    throw new Error("Brak HOTELBEDS_ACTIVITIES_API_KEY lub HOTELBEDS_ACTIVITIES_API_SECRET.");
  }

  const center = await resolveCityCoordinates(input.city, input.country);
  if (!center) {
    throw new Error("Nie udalo sie ustalic lokalizacji miasta dla aktywnosci.");
  }

  const countryCode = resolveCountryCode(input.country);
  const destinationCode = countryCode
    ? await resolveDestinationCode(apiKey, apiSecret, countryCode, input.city)
    : undefined;

  const body = destinationCode
    ? {
        language: "en",
        pagination: { itemsPerPage: 50, page: 1 },
        filters: [
          {
            searchFilterItems: [
              { type: "destination", value: destinationCode },
              { type: "text", value: normalizeLookup(input.city).split(" ")[0] ?? input.city },
            ],
          },
        ],
        from: input.fromDate,
        to: input.toDate,
        order: "DEFAULT",
      }
    : {
        language: "en",
        pagination: { itemsPerPage: 50, page: 1 },
        filters: [
          {
            searchFilterItems: [{ type: "gps", latitude: center.lat, longitude: center.lon }],
          },
        ],
        from: input.fromDate,
        to: input.toDate,
        order: "DEFAULT",
      };

  const response = await fetch(`${hotelbedsBaseUrl("activities")}/activity-api/3.0/activities`, {
    method: "POST",
    headers: hotelbedsHeaders(apiKey, apiSecret),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Hotelbeds activities error (${response.status}). ${text.slice(0, 220)}`);
  }

  const payload = (await response.json()) as {
    activities?: AnyRecord[];
    data?: AnyRecord[];
  };

  const rows = payload.activities ?? payload.data ?? [];
  const offers = rankActivities(
    rows
      .map((activity: AnyRecord): NormalizedActivityOffer | null => {
        const price = pickPrice(activity);
        if (!price) return null;
        return {
          activityCode: pickActivityCode(activity),
          name: pickActivityName(activity),
          category: pickCategory(activity),
          priceFrom: price,
          currency: pickCurrency(activity),
          duration: pickDuration(activity),
          imageUrl: pickImageUrl(activity),
          description: pickDescription(activity),
          bookingUrl: pickBookingUrl(activity),
        };
      })
      .filter((item): item is NormalizedActivityOffer => Boolean(item)),
  ).slice(0, 50);

  return {
    city: input.city,
    country: input.country,
    source: "hotelbeds",
    destinationCode,
    fromDate: input.fromDate,
    toDate: input.toDate,
    travelers: input.travelers,
    offers,
    fetchedAt: new Date().toISOString(),
  };
}

async function resolveDestinationCode(apiKey: string, apiSecret: string, countryCode: string, city: string): Promise<string | undefined> {
  const response = await fetch(`${hotelbedsBaseUrl("activities")}/activity-content-api/3.0/destinations/en/${countryCode}`, {
    headers: hotelbedsHeaders(apiKey, apiSecret),
  });

  if (!response.ok) return undefined;

  const payload = (await response.json()) as {
    country?: {
      destinations?: Array<{ code?: string; name?: string }>;
    };
    destinations?: Array<{ code?: string; name?: string }>;
  };

  const destinations = payload.country?.destinations ?? payload.destinations ?? [];
  const normalizedCity = normalizeLookup(city);
  const match = destinations.find((item) => normalizeLookup(item.name ?? "").includes(normalizedCity) || normalizedCity.includes(normalizeLookup(item.name ?? "")));
  return match?.code ?? destinations[0]?.code;
}
