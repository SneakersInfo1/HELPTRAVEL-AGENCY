import type { DestinationMedia } from "./visuals";

export type DiscoveryMode = "discovery" | "standard";
export type TemperaturePreference = "any" | "warm" | "hot";
export type VisaPreference = "any" | "visa_free";
export type LogisticsPreference = "any" | "easy";
export type TripMood = "any" | "romantic" | "family" | "solo" | "foodie";
export type CabinClass = "economy" | "premium_economy" | "business" | "first";
export type FlightSortMode = "cheap" | "balance" | "direct";
export type StaySortMode = "cheap" | "quality" | "value";

export interface DiscoveryPreferences {
  budgetMaxPln: number;
  durationMinDays: number;
  durationMaxDays: number;
  travelers: number;
  originCountry: string;
  originCity?: string;
  destinationFocus?: string;
  departureMonth?: number;
  temperaturePreference: TemperaturePreference;
  visaPreference: VisaPreference;
  logisticsPreference: LogisticsPreference;
  tripMood: TripMood;
  wantsShortFlight: boolean;
  wantsWeatherReliability: boolean;
  wantsBeachSightseeingMix: boolean;
  maxTransfers: number;
  mustTags: string[];
  niceTags: string[];
  styleWeights: {
    beach: number;
    city: number;
    sightseeing: number;
    nightlife: number;
    nature: number;
    food: number;
  };
  confidence: number;
}

export interface AffiliateLinks {
  flights: string;
  stays: string;
  attractions: string;
  cars: string;
}

export interface DestinationProfile {
  id: string;
  slug: string;
  city: string;
  country: string;
  region?: string;
  aliases?: string[];
  airportCode?: string;
  visaForPL: boolean;
  avgTempByMonth: number[];
  costIndex: number;
  beachScore: number;
  cityScore: number;
  sightseeingScore: number;
  nightlifeScore: number;
  natureScore: number;
  safetyScore: number;
  accessScore: number;
  typicalFlightHoursFromPL: number;
  affiliateLinks: AffiliateLinks;
  media?: DestinationMedia;
}

export interface ScoreBreakdown {
  budgetFit: number;
  weatherFit: number;
  travelEase: number;
  styleMatch: number;
  attractionPotential: number;
  safetyQuality: number;
  valueFit: number;
  logisticsFit: number;
  moodFit: number;
  penalties: number;
}

export interface DiscoveryOption {
  itineraryResultId: string;
  destination: DestinationProfile;
  rank: number;
  score: number;
  estimatedBudgetMin: number;
  estimatedBudgetMax: number;
  breakdown: ScoreBreakdown;
  reasons: string[];
  tradeoffs: string[];
  aiSummary: string;
  aiPlan: Array<{
    day: number;
    title: string;
    description: string;
    estimatedDailyCost: number;
  }>;
}

export interface DiscoveryResponse {
  requestId: string;
  mode: DiscoveryMode;
  rawQuery: string;
  interpreted: DiscoveryPreferences;
  options: DiscoveryOption[];
}

export interface DiscoveryRequestInput {
  query: string;
  originCity?: string;
  departureMonth?: number;
  travelers?: number;
  budgetMaxPln?: number;
  durationMinDays?: number;
  durationMaxDays?: number;
}

export interface StandardRequestInput {
  originCity: string;
  destinationHint: string;
  travelers: number;
  budgetMaxPln: number;
  durationDays: number;
  departureMonth?: number;
  style?: string;
}

export interface SavedTripSnapshot {
  mode: DiscoveryMode;
  query: string;
  destinationHint: string;
  originCity: string;
  budget: number;
  travelers: number;
  rooms: number;
  durationMin: number;
  durationMax: number;
  travelStartDate: string;
  travelEndDate?: string;
  travelNights: number;
  selectedDestinationSlug?: string;
  selectedDestinationLabel?: string;
}

export interface SavedTripView {
  savedTripId: string;
  requestId: string;
  itineraryResultId: string;
  mode: DiscoveryMode;
  destinationSlug: string;
  city: string;
  country: string;
  score: number;
  estimatedBudgetMin: number;
  estimatedBudgetMax: number;
  summary: string;
  plan: DiscoveryOption["aiPlan"];
  reasons: string[];
  tradeoffs: string[];
  affiliateLinks: AffiliateLinks;
  createdAt: string;
  snapshot?: SavedTripSnapshot;
}

export interface EventPayload {
  eventType:
    | "planner_started"
    | "discovery_generated"
    | "standard_generated"
    | "affiliate_clicked"
    | "trip_saved"
    | "planner_restored"
    | "saved_plan_clicked"
    | "destination_saved"
    | "comparison_selected"
    | "search_saved"
    | "hero_cta_clicked"
    | "planner_mode_selected"
    | "planner_submitted"
    | "destination_card_clicked"
    | "content_card_clicked"
    | "contact_submit";
  payload: Record<string, unknown>;
}

export interface NormalizedFlightOffer {
  offerId: string;
  airline: string;
  total_amount: number;
  currency: string;
  number_of_stops: number;
  departure_time: string;
  arrival_time: string;
  total_duration: string;
  total_duration_minutes: number;
  origin: string;
  destination: string;
  cabinClass: CabinClass;
  bookingUrl?: string;
}

export interface NormalizedStayOffer {
  searchResultId: string;
  accommodationId: string;
  name: string;
  rating?: number | null;
  reviewScore?: number | null;
  total_amount: number;
  currency: string;
  public_amount?: number | null;
  public_currency?: string | null;
  address: string;
  city: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  imageUrl?: string;
  description?: string;
  rooms?: number;
  bookingUrl?: string;
}

export interface NormalizedActivityOffer {
  activityCode: string;
  name: string;
  category: string;
  priceFrom: number;
  currency: string;
  duration?: string;
  durationMinutes?: number;
  imageUrl?: string;
  description?: string;
  bookingUrl?: string;
}

export interface NormalizedTransferOffer {
  transferId: string;
  name: string;
  vehicle: string;
  direction: string;
  price: number;
  currency: string;
  duration?: string;
  durationMinutes?: number;
  imageUrl?: string;
  description?: string;
  bookingUrl?: string;
}

export interface FlightSearchResponse {
  origin: string;
  destination: string;
  departureDate: string;
  passengers: number;
  cabinClass: CabinClass;
  sortBy: FlightSortMode;
  offers: NormalizedFlightOffer[];
  fetchedAt: string;
  source?: "duffel" | "partner_fallback";
  error?: string;
}

export interface StaySearchResponse {
  city: string;
  country: string;
  source: "duffel" | "hotelbeds" | "fallback";
  checkInDate: string;
  checkOutDate: string;
  guests: number;
  rooms: number;
  sortBy: StaySortMode;
  offers: NormalizedStayOffer[];
  fetchedAt: string;
  error?: string;
}

export interface ActivitySearchResponse {
  city: string;
  country: string;
  source: "hotelbeds" | "fallback";
  destinationCode?: string;
  fromDate: string;
  toDate: string;
  travelers: number;
  offers: NormalizedActivityOffer[];
  fetchedAt: string;
  error?: string;
}

export interface TransferSearchResponse {
  city: string;
  country: string;
  source: "hotelbeds" | "fallback";
  airportCode?: string;
  center?: {
    lat: number;
    lon: number;
  };
  outboundDateTime: string;
  adults: number;
  children: number;
  infants: number;
  offers: NormalizedTransferOffer[];
  fetchedAt: string;
  error?: string;
}

export interface GeoapifyPlaceItem {
  id: string;
  name: string;
  category: string;
  description: string;
  address: string;
  lat: number;
  lon: number;
  distanceMeters?: number;
  url?: string;
  iconLabel: string;
}

export interface GeoapifyPlaceGroup {
  key: "top" | "museums" | "viewpoints" | "beaches" | "parks" | "food";
  label: string;
  items: GeoapifyPlaceItem[];
}

export interface DestinationAttractionsResponse {
  city: string;
  country: string;
  source: "geoapify" | "fallback";
  center?: {
    lat: number;
    lon: number;
  };
  groups: GeoapifyPlaceGroup[];
  fetchedAt: string;
}

export interface DestinationSuggestion {
  id: string;
  city: string;
  country: string;
  region?: string;
  label: string;
  queryValue: string;
  source: "curated" | "catalog" | "geoapify";
  destinationSlug?: string;
  airportCode?: string;
}

export interface TravelPackageOffer {
  packageId: string;
  title: string;
  flight: NormalizedFlightOffer;
  stay: NormalizedStayOffer;
  totalAmount?: number;
  currency?: string;
  combined: boolean;
  description: string;
}
