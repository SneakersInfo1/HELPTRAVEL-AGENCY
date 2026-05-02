// LiteAPI places — destination autocomplete.
// Phase 1 stub: defers to existing Geoapify-based suggestions until the
// LiteAPI `/data/places` endpoint and rate limits are confirmed against
// sandbox. Public surface kept stable so callers don't change in Phase 2.

import type { DestinationSuggestion } from "@/lib/mvp/types";

export interface PlacesAutocompleteInput {
  q: string;
  language?: string; // "pl"
  limit?: number;
}

export async function autocompletePlaces(input: PlacesAutocompleteInput): Promise<DestinationSuggestion[]> {
  void input;
  // TODO Phase 2: call `/data/places` once endpoint behavior + result shape
  // are confirmed against the sandbox. Until then, the existing
  // /api/destinations/suggest route (Geoapify + curated catalog) covers the
  // autocomplete surface, so this stub returns []. Consumers fall through to
  // the Geoapify pipeline.
  return [];
}
