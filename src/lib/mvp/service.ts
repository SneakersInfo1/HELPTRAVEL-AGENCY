/* eslint-disable @typescript-eslint/no-explicit-any */
import { createId } from "./db";
import { buildFallbackDestinationProfile, findCuratedDestination, parseDestinationHint } from "./destination-fallback";
import { parseDiscoveryInput } from "./parser";
import { scoreDestinations } from "./scoring";
import type {
  DiscoveryOption,
  DiscoveryRequestInput,
  DiscoveryResponse,
  EventPayload,
  SavedTripView,
  StandardRequestInput,
} from "./types";
import { generateSummaryAndPlan, refinePreferencesWithAI } from "./ai";
import {
  createAffiliateClickRecord,
  createDestinationScoreRecord,
  createEventRecord,
  createItineraryResultRecord,
  createTripRequestRecord,
  ensureSession,
  getDestinations,
  getItineraryById,
  listSavedTripsBySession,
  saveTripRecord,
} from "./store";
import { resolveDestinationMedia } from "./pexels-media";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function trackEvent(sessionId: string, payload: EventPayload): Promise<void> {
  await ensureSession(sessionId);
  await createEventRecord({
    id: createId("evt"),
    sessionId,
    eventType: payload.eventType,
    payloadJson: payload.payload,
    createdAt: new Date(),
  });
}

function toOptionView(args: {
  itineraryResultId: string;
  destination: any;
  rank: number;
  score: number;
  estimatedBudgetMin: number;
  estimatedBudgetMax: number;
  breakdown: any;
  reasons: string[];
  tradeoffs: string[];
  aiSummary: string;
  aiPlan: Array<{ day: number; title: string; description: string; estimatedDailyCost: number }>;
}): DiscoveryOption {
  return {
    itineraryResultId: args.itineraryResultId,
    destination: args.destination,
    rank: args.rank,
    score: args.score,
    estimatedBudgetMin: args.estimatedBudgetMin,
    estimatedBudgetMax: args.estimatedBudgetMax,
    breakdown: args.breakdown,
    reasons: args.reasons,
    tradeoffs: args.tradeoffs,
    aiSummary: args.aiSummary,
    aiPlan: args.aiPlan,
  };
}

async function runVirtualStandard(input: StandardRequestInput, sessionId: string): Promise<DiscoveryResponse> {
  await ensureSession(sessionId);
  await trackEvent(sessionId, {
    eventType: "planner_started",
    payload: { mode: "standard", source: "virtual_destination" },
  });

  const query = [
    `lot z ${input.originCity}`,
    `do ${input.destinationHint}`,
    `budzet do ${input.budgetMaxPln} zl`,
    `${input.durationDays} dni`,
    input.style ? `styl ${input.style}` : "",
  ]
    .join(", ")
    .trim();

  const basicPrefs = parseDiscoveryInput({
    query,
    originCity: input.originCity,
    travelers: input.travelers,
    budgetMaxPln: input.budgetMaxPln,
    durationMinDays: input.durationDays,
    durationMaxDays: input.durationDays,
    departureMonth: input.departureMonth,
  });
  const parsedPrefs = await refinePreferencesWithAI(query, basicPrefs);

  const parsedHint = parseDestinationHint(input.destinationHint);
  const baseDestination = buildFallbackDestinationProfile(parsedHint);
  const destination = {
    ...baseDestination,
    media: await resolveDestinationMedia(baseDestination),
  };

  const requestId = createId("req");
  await createTripRequestRecord({
    id: requestId,
    sessionId,
    mode: "standard",
    rawQuery: query,
    normalizedPrefsJson: parsedPrefs,
  });

  const estimatedBudgetMin = clamp(Math.round(input.budgetMaxPln * 0.58), 700, input.budgetMaxPln);
  const estimatedBudgetMax = input.budgetMaxPln;
  const reasons = [
    `Kierunek zostal wybrany bezposrednio przez Ciebie: ${destination.city}.`,
    "Mozesz od razu przejsc do lotow, noclegow i pozostalych uslug wyjazdowych.",
    "System utrzymuje ten kierunek jako glowny punkt dalszego planowania.",
  ];
  const tradeoffs = [
    "Pelny ranking redakcyjny dla tego miasta moze byc jeszcze bardziej ograniczony niz dla glownych hubow serwisu.",
  ];
  const breakdown = {
    budgetFit: 0.78,
    weatherFit: 0.74,
    travelEase: 0.72,
    styleMatch: 0.84,
    attractionPotential: 0.76,
    safetyQuality: 0.72,
    valueFit: 0.79,
    logisticsFit: 0.73,
    moodFit: 0.81,
    penalties: 0.06,
  };

  const generated = await generateSummaryAndPlan({
    rawQuery: query,
    preferences: parsedPrefs,
    destination,
    reasons,
    tradeoffs,
    estimatedBudgetMin,
    estimatedBudgetMax,
  });

  const virtualOption = toOptionView({
    itineraryResultId: `virtual_${createId("itn")}`,
    destination,
    rank: 1,
    score: 84,
    estimatedBudgetMin,
    estimatedBudgetMax,
    breakdown,
    reasons,
    tradeoffs,
    aiSummary: generated.summary,
    aiPlan: generated.plan,
  });

  await trackEvent(sessionId, {
    eventType: "standard_generated",
    payload: {
      requestId,
      destinationHint: input.destinationHint,
      options: 1,
      source: "virtual_destination",
    },
  });

  return {
    requestId,
    mode: "standard",
    rawQuery: query,
    interpreted: parsedPrefs,
    options: [virtualOption],
  };
}

export async function runDiscovery(input: DiscoveryRequestInput, sessionId: string): Promise<DiscoveryResponse> {
  await ensureSession(sessionId);
  await trackEvent(sessionId, {
    eventType: "planner_started",
    payload: { mode: "discovery" },
  });

  const basicPrefs = parseDiscoveryInput(input);
  const parsedPrefs = await refinePreferencesWithAI(input.query, basicPrefs);
  const destinations = await getDestinations();
  const scored = scoreDestinations(destinations, parsedPrefs, 5);

  const requestId = createId("req");
  await createTripRequestRecord({
    id: requestId,
    sessionId,
    mode: "discovery",
    rawQuery: input.query,
    normalizedPrefsJson: parsedPrefs,
  });

  const enrichedRows = await Promise.all(
    scored.map(async (row) => ({
      ...row,
      destination: {
        ...row.destination,
        media: await resolveDestinationMedia(row.destination),
      },
    })),
  );

  const options: DiscoveryOption[] = [];
  for (let index = 0; index < enrichedRows.length; index += 1) {
    const row = enrichedRows[index];
    const itineraryResultId = createId("itn");
    const generated = await generateSummaryAndPlan({
      rawQuery: input.query,
      preferences: parsedPrefs,
      destination: row.destination,
      reasons: row.reasons,
      tradeoffs: row.tradeoffs,
      estimatedBudgetMin: row.estimatedBudgetMin,
      estimatedBudgetMax: row.estimatedBudgetMax,
    });

    await createDestinationScoreRecord({
      id: createId("scr"),
      tripRequestId: requestId,
      destinationId: row.destination.id,
      totalScore: row.score,
      breakdownJson: row.breakdown,
      reasonsJson: row.reasons,
      rank: index + 1,
    });

    await createItineraryResultRecord({
      id: itineraryResultId,
      tripRequestId: requestId,
      destinationId: row.destination.id,
      estimatedBudgetMin: row.estimatedBudgetMin,
      estimatedBudgetMax: row.estimatedBudgetMax,
      aiSummary: generated.summary,
      aiPlanJson: generated.plan,
    });

    options.push(
      toOptionView({
        itineraryResultId,
        destination: row.destination,
        rank: index + 1,
        score: row.score,
        estimatedBudgetMin: row.estimatedBudgetMin,
        estimatedBudgetMax: row.estimatedBudgetMax,
        breakdown: row.breakdown,
        reasons: row.reasons,
        tradeoffs: row.tradeoffs,
        aiSummary: generated.summary,
        aiPlan: generated.plan,
      }),
    );
  }

  await trackEvent(sessionId, {
    eventType: "discovery_generated",
    payload: {
      requestId,
      options: options.length,
      budgetMaxPln: parsedPrefs.budgetMaxPln,
      duration: [parsedPrefs.durationMinDays, parsedPrefs.durationMaxDays],
    },
  });

  return {
    requestId,
    mode: "discovery",
    rawQuery: input.query,
    interpreted: parsedPrefs,
    options,
  };
}

export async function runStandard(input: StandardRequestInput, sessionId: string): Promise<DiscoveryResponse> {
  const parsedHint = parseDestinationHint(input.destinationHint);
  const curatedMatch = findCuratedDestination(parsedHint);
  if (!curatedMatch) {
    return runVirtualStandard(input, sessionId);
  }

  const query = [
    `lot z ${input.originCity}`,
    `do ${input.destinationHint}`,
    `budzet do ${input.budgetMaxPln} zl`,
    `${input.durationDays} dni`,
    input.style ? `styl ${input.style}` : "",
  ]
    .join(", ")
    .trim();

  const discovery = await runDiscovery(
    {
      query,
      originCity: input.originCity,
      travelers: input.travelers,
      budgetMaxPln: input.budgetMaxPln,
      durationMinDays: input.durationDays,
      durationMaxDays: input.durationDays,
      departureMonth: input.departureMonth,
    },
    sessionId,
  );

  const filtered = discovery.options.filter((option) => {
    const hint = parsedHint.city.toLowerCase();
    const countryHint = parsedHint.country?.toLowerCase();
    return (
      option.destination.city.toLowerCase().includes(hint) ||
      Boolean(countryHint && option.destination.country.toLowerCase().includes(countryHint)) ||
      hint.length < 3
    );
  });

  const options = (filtered.length > 0 ? filtered : discovery.options)
    .slice(0, 5)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  await trackEvent(sessionId, {
    eventType: "standard_generated",
    payload: {
      requestId: discovery.requestId,
      destinationHint: input.destinationHint,
      options: options.length,
    },
  });

  return {
    ...discovery,
    mode: "standard",
    options,
  };
}

export async function saveTrip(sessionId: string, itineraryResultId: string): Promise<{ savedTripId: string }> {
  await ensureSession(sessionId);

  const saved = await saveTripRecord({
    id: createId("save"),
    sessionId,
    itineraryResultId,
  });

  await trackEvent(sessionId, {
    eventType: "trip_saved",
    payload: { itineraryResultId, savedTripId: saved.id },
  });

  return { savedTripId: saved.id };
}

function toSavedTripView(record: {
  savedTrip: any;
  itinerary: any;
  tripRequest: any;
  destination: any;
  score?: any;
}): SavedTripView {
  return {
    savedTripId: record.savedTrip.id,
    requestId: record.tripRequest.id,
    itineraryResultId: record.itinerary.id,
    mode: record.tripRequest.mode,
    destinationSlug: record.destination.slug,
    city: record.destination.city,
    country: record.destination.country,
    score: Number(record.score?.totalScore ?? 0),
    estimatedBudgetMin: Number(record.itinerary.estimatedBudgetMin),
    estimatedBudgetMax: Number(record.itinerary.estimatedBudgetMax),
    summary: record.itinerary.aiSummary,
    plan: (record.itinerary.aiPlanJson ?? []) as SavedTripView["plan"],
    reasons: (record.score?.reasonsJson ?? []) as string[],
    tradeoffs: [],
    affiliateLinks: record.destination.affiliateLinks,
    createdAt: new Date(record.savedTrip.createdAt).toISOString(),
  };
}

export async function getTrip(itineraryResultId: string): Promise<SavedTripView | null> {
  const row = await getItineraryById(itineraryResultId);
  if (!row) return null;

  return {
    savedTripId: "",
    requestId: row.tripRequest.id,
    itineraryResultId: row.itinerary.id,
    mode: row.tripRequest.mode,
    destinationSlug: row.destination.slug,
    city: row.destination.city,
    country: row.destination.country,
    score: Number(row.score?.totalScore ?? 0),
    estimatedBudgetMin: Number(row.itinerary.estimatedBudgetMin),
    estimatedBudgetMax: Number(row.itinerary.estimatedBudgetMax),
    summary: row.itinerary.aiSummary,
    plan: (row.itinerary.aiPlanJson ?? []) as SavedTripView["plan"],
    reasons: ((row.score?.reasonsJson as string[] | undefined) ?? []).slice(0, 4),
    tradeoffs: [],
    affiliateLinks: row.destination.affiliateLinks,
    createdAt: "",
  };
}

export async function listSavedTrips(sessionId: string): Promise<SavedTripView[]> {
  const rows = await listSavedTripsBySession(sessionId);
  return rows.map(toSavedTripView);
}

export async function trackAffiliateClick(args: {
  sessionId: string;
  provider: string;
  targetUrl: string;
  itineraryResultId?: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  await ensureSession(args.sessionId);
  await createAffiliateClickRecord({
    id: createId("clk"),
    sessionId: args.sessionId,
    itineraryResultId: args.itineraryResultId,
    provider: args.provider,
    targetUrl: args.targetUrl,
    contextJson: args.context ?? {},
    createdAt: new Date(),
  });
  await trackEvent(args.sessionId, {
    eventType: "affiliate_clicked",
    payload: {
      provider: args.provider,
      itineraryResultId: args.itineraryResultId,
      context: args.context ?? {},
    },
  });
}

export function sanitizeBudgetInput(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return clamp(Math.round(value), 600, 20000);
}
