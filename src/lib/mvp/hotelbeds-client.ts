import "server-only";

import { createHash } from "node:crypto";

export function createHotelbedsSignature(apiKey: string, apiSecret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return createHash("sha256").update(`${apiKey}${apiSecret}${timestamp}`).digest("hex");
}

export function hotelbedsHeaders(apiKey: string, apiSecret: string): HeadersInit {
  return {
    "Api-key": apiKey,
    "X-Signature": createHotelbedsSignature(apiKey, apiSecret),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export function hotelbedsBaseUrl(product: "hotel" | "activities" | "transfer"): string {
  const defaults = {
    hotel: "https://api.hotelbeds.com",
    activities: "https://api.hotelbeds.com",
    transfer: "https://api.hotelbeds.com",
  } as const;

  if (product === "hotel") {
    return process.env.HOTELBEDS_HOTEL_API_URL?.trim() || defaults.hotel;
  }

  if (product === "activities") {
    return process.env.HOTELBEDS_ACTIVITIES_API_URL?.trim() || defaults.activities;
  }

  return process.env.HOTELBEDS_TRANSFER_API_URL?.trim() || defaults.transfer;
}
