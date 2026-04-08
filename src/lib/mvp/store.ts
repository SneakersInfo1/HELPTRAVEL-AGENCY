/* eslint-disable @typescript-eslint/no-explicit-any */
import { getPrisma } from "./db";
import { allDestinationProfiles } from "./destinations";
import type { DestinationProfile, DiscoveryMode, ScoreBreakdown } from "./types";

interface SessionRow {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
}

interface TripRequestRow {
  id: string;
  sessionId: string;
  mode: DiscoveryMode;
  rawQuery: string;
  normalizedPrefsJson: unknown;
  createdAt: Date;
}

interface DestinationScoreRow {
  id: string;
  tripRequestId: string;
  destinationId: string;
  totalScore: number;
  breakdownJson: ScoreBreakdown;
  reasonsJson: string[];
  rank: number;
}

interface ItineraryRow {
  id: string;
  tripRequestId: string;
  destinationId: string;
  estimatedBudgetMin: number;
  estimatedBudgetMax: number;
  aiSummary: string;
  aiPlanJson: unknown;
}

interface SavedTripRow {
  id: string;
  sessionId: string;
  itineraryResultId: string;
  snapshotJson?: unknown;
  createdAt: Date;
}

interface EventRow {
  id: string;
  sessionId: string;
  eventType: string;
  payloadJson: unknown;
  createdAt: Date;
}

interface AffiliateClickRow {
  id: string;
  sessionId: string;
  itineraryResultId?: string;
  provider: string;
  targetUrl: string;
  contextJson?: unknown;
  createdAt: Date;
}

interface MemoryStore {
  sessions: Map<string, SessionRow>;
  tripRequests: Map<string, TripRequestRow>;
  destinationScores: Map<string, DestinationScoreRow>;
  itineraryResults: Map<string, ItineraryRow>;
  extraDestinations: Map<string, DestinationProfile>;
  savedTrips: Map<string, SavedTripRow>;
  events: Map<string, EventRow>;
  affiliateClicks: Map<string, AffiliateClickRow>;
}

const globalForMvp = globalThis as unknown as { __helpTravelMemoryStore?: MemoryStore };

function getMemoryStore(): MemoryStore {
  if (!globalForMvp.__helpTravelMemoryStore) {
    globalForMvp.__helpTravelMemoryStore = {
      sessions: new Map(),
      tripRequests: new Map(),
      destinationScores: new Map(),
      itineraryResults: new Map(),
      extraDestinations: new Map(),
      savedTrips: new Map(),
      events: new Map(),
      affiliateClicks: new Map(),
    };
  }
  return globalForMvp.__helpTravelMemoryStore;
}

function toDestinationProfile(row: any): DestinationProfile {
  return {
    id: row.id,
    slug: row.slug,
    city: row.city,
    country: row.country,
    visaForPL: Boolean(row.visaForPL),
    avgTempByMonth: Array.isArray(row.avgTempByMonthJson) ? row.avgTempByMonthJson : row.avgTempByMonth ?? [],
    costIndex: Number(row.costIndex),
    beachScore: Number(row.beachScore),
    cityScore: Number(row.cityScore),
    sightseeingScore: Number(row.sightseeingScore),
    nightlifeScore: Number(row.nightlifeScore),
    natureScore: Number(row.natureScore),
    safetyScore: Number(row.safetyScore),
    accessScore: Number(row.accessScore),
    typicalFlightHoursFromPL: Number(row.typicalFlightHoursFromPL),
    affiliateLinks: (row.affiliateLinksJson ?? row.affiliateLinks) as DestinationProfile["affiliateLinks"],
  };
}

export async function seedDestinationsIfEmpty(): Promise<void> {
  const prisma = await getPrisma();
  if (!prisma) return;

  const total = await prisma.destination.count();
  if (total >= allDestinationProfiles.length) return;

  for (const destination of allDestinationProfiles) {
    await prisma.destination.upsert({
      where: { id: destination.id },
      update: {
        id: destination.id,
        slug: destination.slug,
        city: destination.city,
        country: destination.country,
        visaForPL: destination.visaForPL,
        avgTempByMonthJson: destination.avgTempByMonth,
        costIndex: destination.costIndex,
        beachScore: destination.beachScore,
        cityScore: destination.cityScore,
        sightseeingScore: destination.sightseeingScore,
        nightlifeScore: destination.nightlifeScore,
        natureScore: destination.natureScore,
        safetyScore: destination.safetyScore,
        accessScore: destination.accessScore,
        typicalFlightHoursFromPL: destination.typicalFlightHoursFromPL,
        affiliateLinksJson: destination.affiliateLinks,
      },
      create: {
        id: destination.id,
        slug: destination.slug,
        city: destination.city,
        country: destination.country,
        visaForPL: destination.visaForPL,
        avgTempByMonthJson: destination.avgTempByMonth,
        costIndex: destination.costIndex,
        beachScore: destination.beachScore,
        cityScore: destination.cityScore,
        sightseeingScore: destination.sightseeingScore,
        nightlifeScore: destination.nightlifeScore,
        natureScore: destination.natureScore,
        safetyScore: destination.safetyScore,
        accessScore: destination.accessScore,
        typicalFlightHoursFromPL: destination.typicalFlightHoursFromPL,
        affiliateLinksJson: destination.affiliateLinks,
      },
    });
  }
}

export async function ensureSession(sessionId: string): Promise<void> {
  const prisma = await getPrisma();
  if (prisma) {
    await prisma.anonymousSession.upsert({
      where: { id: sessionId },
      update: { lastSeenAt: new Date() },
      create: { id: sessionId },
    });
    return;
  }

  const store = getMemoryStore();
  const now = new Date();
  const row = store.sessions.get(sessionId);
  if (row) {
    row.lastSeenAt = now;
  } else {
    store.sessions.set(sessionId, {
      id: sessionId,
      createdAt: now,
      lastSeenAt: now,
    });
  }
}

export async function getDestinations(): Promise<DestinationProfile[]> {
  const prisma = await getPrisma();
  if (prisma) {
    await seedDestinationsIfEmpty();
    const rows = await prisma.destination.findMany({});
    return rows.map(toDestinationProfile);
  }

  const store = getMemoryStore();
  return [...allDestinationProfiles, ...store.extraDestinations.values()];
}

export async function ensureDestinationProfile(destination: DestinationProfile): Promise<void> {
  const prisma = await getPrisma();
  if (prisma) {
    await prisma.destination.upsert({
      where: { id: destination.id },
      update: {
        slug: destination.slug,
        city: destination.city,
        country: destination.country,
        visaForPL: destination.visaForPL,
        avgTempByMonthJson: destination.avgTempByMonth,
        costIndex: destination.costIndex,
        beachScore: destination.beachScore,
        cityScore: destination.cityScore,
        sightseeingScore: destination.sightseeingScore,
        nightlifeScore: destination.nightlifeScore,
        natureScore: destination.natureScore,
        safetyScore: destination.safetyScore,
        accessScore: destination.accessScore,
        typicalFlightHoursFromPL: destination.typicalFlightHoursFromPL,
        affiliateLinksJson: destination.affiliateLinks,
      },
      create: {
        id: destination.id,
        slug: destination.slug,
        city: destination.city,
        country: destination.country,
        visaForPL: destination.visaForPL,
        avgTempByMonthJson: destination.avgTempByMonth,
        costIndex: destination.costIndex,
        beachScore: destination.beachScore,
        cityScore: destination.cityScore,
        sightseeingScore: destination.sightseeingScore,
        nightlifeScore: destination.nightlifeScore,
        natureScore: destination.natureScore,
        safetyScore: destination.safetyScore,
        accessScore: destination.accessScore,
        typicalFlightHoursFromPL: destination.typicalFlightHoursFromPL,
        affiliateLinksJson: destination.affiliateLinks,
      },
    });
    return;
  }

  const store = getMemoryStore();
  store.extraDestinations.set(destination.id, destination);
}

export async function createTripRequestRecord(args: {
  id: string;
  sessionId: string;
  mode: DiscoveryMode;
  rawQuery: string;
  normalizedPrefsJson: unknown;
}): Promise<void> {
  const prisma = await getPrisma();
  if (prisma) {
    await prisma.tripRequest.create({
      data: {
        id: args.id,
        sessionId: args.sessionId,
        mode: args.mode,
        rawQuery: args.rawQuery,
        normalizedPrefsJson: args.normalizedPrefsJson,
      },
    });
    return;
  }

  const store = getMemoryStore();
  store.tripRequests.set(args.id, {
    id: args.id,
    sessionId: args.sessionId,
    mode: args.mode,
    rawQuery: args.rawQuery,
    normalizedPrefsJson: args.normalizedPrefsJson,
    createdAt: new Date(),
  });
}

export async function createDestinationScoreRecord(args: DestinationScoreRow): Promise<void> {
  const prisma = await getPrisma();
  if (prisma) {
    await prisma.destinationScore.create({
      data: {
        id: args.id,
        tripRequestId: args.tripRequestId,
        destinationId: args.destinationId,
        totalScore: args.totalScore,
        breakdownJson: args.breakdownJson,
        reasonsJson: args.reasonsJson,
        rank: args.rank,
      },
    });
    return;
  }

  const store = getMemoryStore();
  store.destinationScores.set(args.id, args);
}

export async function createItineraryResultRecord(args: ItineraryRow): Promise<void> {
  const prisma = await getPrisma();
  if (prisma) {
    await prisma.itineraryResult.create({
      data: {
        id: args.id,
        tripRequestId: args.tripRequestId,
        destinationId: args.destinationId,
        estimatedBudgetMin: args.estimatedBudgetMin,
        estimatedBudgetMax: args.estimatedBudgetMax,
        aiSummary: args.aiSummary,
        aiPlanJson: args.aiPlanJson,
      },
    });
    return;
  }

  const store = getMemoryStore();
  store.itineraryResults.set(args.id, args);
}

export async function saveTripRecord(args: {
  id: string;
  sessionId: string;
  itineraryResultId: string;
  snapshotJson?: unknown;
}): Promise<SavedTripRow> {
  const prisma = await getPrisma();
  if (prisma) {
    try {
      const existing = await prisma.savedTrip.findFirst({
        where: {
          sessionId: args.sessionId,
          itineraryResultId: args.itineraryResultId,
        },
      });

      if (existing) {
        if (typeof args.snapshotJson !== "undefined") {
          await prisma.savedTrip.update({
            where: { id: existing.id },
            data: {
              snapshotJson: args.snapshotJson,
            },
          });
          return {
            ...(existing as SavedTripRow),
            snapshotJson: args.snapshotJson,
          };
        }
        return existing as SavedTripRow;
      }

      return (await prisma.savedTrip.create({
        data: {
          id: args.id,
          sessionId: args.sessionId,
          itineraryResultId: args.itineraryResultId,
          snapshotJson: args.snapshotJson,
        },
      })) as SavedTripRow;
    } catch (error) {
      console.warn("SavedTrip persistence fell back to memory store.", error);
    }
  }

  const store = getMemoryStore();
  const duplicate = [...store.savedTrips.values()].find(
    (entry) => entry.sessionId === args.sessionId && entry.itineraryResultId === args.itineraryResultId,
  );
  if (duplicate) {
    if (typeof args.snapshotJson !== "undefined") {
      duplicate.snapshotJson = args.snapshotJson;
    }
    return duplicate;
  }

  const row: SavedTripRow = {
    id: args.id,
    sessionId: args.sessionId,
    itineraryResultId: args.itineraryResultId,
    snapshotJson: args.snapshotJson,
    createdAt: new Date(),
  };
  store.savedTrips.set(row.id, row);
  return row;
}

export async function createEventRecord(args: EventRow): Promise<void> {
  const prisma = await getPrisma();
  if (prisma) {
    await prisma.event.create({
      data: {
        id: args.id,
        sessionId: args.sessionId,
        eventType: args.eventType,
        payloadJson: args.payloadJson,
      },
    });
    return;
  }

  const store = getMemoryStore();
  store.events.set(args.id, args);
}

export async function createAffiliateClickRecord(args: AffiliateClickRow): Promise<void> {
  const prisma = await getPrisma();
  if (prisma) {
    await prisma.affiliateClick.create({
      data: {
        id: args.id,
        sessionId: args.sessionId,
        itineraryResultId: args.itineraryResultId ?? null,
        provider: args.provider,
        targetUrl: args.targetUrl,
        contextJson: args.contextJson ?? {},
      },
    });
    return;
  }

  const store = getMemoryStore();
  store.affiliateClicks.set(args.id, args);
}

export async function getItineraryById(
  itineraryResultId: string,
): Promise<
  | {
      itinerary: ItineraryRow;
      tripRequest: TripRequestRow;
      destination: DestinationProfile;
      score?: DestinationScoreRow;
      savedTrip?: SavedTripRow;
    }
  | null
> {
  const prisma = await getPrisma();
  if (prisma) {
    try {
      const itinerary = await prisma.itineraryResult.findUnique({
        where: { id: itineraryResultId },
        include: {
          tripRequest: true,
          destination: true,
          savedTrips: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      if (!itinerary) return null;

      const score = await prisma.destinationScore.findFirst({
        where: {
          tripRequestId: itinerary.tripRequestId,
          destinationId: itinerary.destinationId,
        },
      });

      return {
        itinerary: itinerary as ItineraryRow,
        tripRequest: itinerary.tripRequest as TripRequestRow,
        destination: toDestinationProfile(itinerary.destination),
        score: (score as DestinationScoreRow | null) ?? undefined,
        savedTrip: (itinerary.savedTrips?.[0] as SavedTripRow | undefined) ?? undefined,
      };
    } catch (error) {
      console.warn("SavedTrip relation lookup fell back to itinerary-only query.", error);
      const itinerary = await prisma.itineraryResult.findUnique({
        where: { id: itineraryResultId },
        include: {
          tripRequest: true,
          destination: true,
        },
      });

      if (!itinerary) return null;

      const score = await prisma.destinationScore.findFirst({
        where: {
          tripRequestId: itinerary.tripRequestId,
          destinationId: itinerary.destinationId,
        },
      });

      return {
        itinerary: itinerary as ItineraryRow,
        tripRequest: itinerary.tripRequest as TripRequestRow,
        destination: toDestinationProfile(itinerary.destination),
        score: (score as DestinationScoreRow | null) ?? undefined,
        savedTrip: undefined,
      };
    }
  }

  const store = getMemoryStore();
  const itinerary = store.itineraryResults.get(itineraryResultId);
  if (!itinerary) return null;
  const tripRequest = store.tripRequests.get(itinerary.tripRequestId);
  if (!tripRequest) return null;
  const destination = allDestinationProfiles.find((item) => item.id === itinerary.destinationId) ?? store.extraDestinations.get(itinerary.destinationId);
  if (!destination) return null;
  const score = [...store.destinationScores.values()].find(
    (item) => item.tripRequestId === itinerary.tripRequestId && item.destinationId === itinerary.destinationId,
  );
  const savedTrip = [...store.savedTrips.values()]
    .filter((item) => item.itineraryResultId === itineraryResultId)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

  return {
    itinerary,
    tripRequest,
    destination,
    score,
    savedTrip,
  };
}

export async function listSavedTripsBySession(sessionId: string): Promise<
  Array<{
    savedTrip: SavedTripRow;
    itinerary: ItineraryRow;
    tripRequest: TripRequestRow;
    destination: DestinationProfile;
    score?: DestinationScoreRow;
  }>
> {
  const prisma = await getPrisma();
  if (prisma) {
    try {
      const rows = await prisma.savedTrip.findMany({
        where: { sessionId },
        orderBy: { createdAt: "desc" },
        include: {
          itineraryResult: {
            include: {
              tripRequest: true,
              destination: true,
            },
          },
        },
      });

      const output: Array<{
        savedTrip: SavedTripRow;
        itinerary: ItineraryRow;
        tripRequest: TripRequestRow;
        destination: DestinationProfile;
        score?: DestinationScoreRow;
      }> = [];

      for (const row of rows) {
        const score = await prisma.destinationScore.findFirst({
          where: {
            tripRequestId: row.itineraryResult.tripRequestId,
            destinationId: row.itineraryResult.destinationId,
          },
        });

        output.push({
          savedTrip: row as SavedTripRow,
          itinerary: row.itineraryResult as ItineraryRow,
          tripRequest: row.itineraryResult.tripRequest as TripRequestRow,
          destination: toDestinationProfile(row.itineraryResult.destination),
          score: (score as DestinationScoreRow | null) ?? undefined,
        });
      }
      return output;
    } catch (error) {
      console.warn("SavedTrip history fell back to memory store.", error);
    }
  }

  const store = getMemoryStore();
  const rows = [...store.savedTrips.values()]
    .filter((item) => item.sessionId === sessionId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return rows
    .map((savedTrip) => {
      const itinerary = store.itineraryResults.get(savedTrip.itineraryResultId);
      if (!itinerary) return null;
      const tripRequest = store.tripRequests.get(itinerary.tripRequestId);
      if (!tripRequest) return null;
      const destination = allDestinationProfiles.find((item) => item.id === itinerary.destinationId) ?? store.extraDestinations.get(itinerary.destinationId);
      if (!destination) return null;
      const score = [...store.destinationScores.values()].find(
        (item) => item.tripRequestId === itinerary.tripRequestId && item.destinationId === itinerary.destinationId,
      );
      return {
        savedTrip,
        itinerary,
        tripRequest,
        destination,
        score,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function getAnalyticsBaseData(): Promise<{
  events: EventRow[];
  tripRequests: TripRequestRow[];
  topScores: Array<DestinationScoreRow & { destinationId: string }>;
  clicks: AffiliateClickRow[];
}> {
  const prisma = await getPrisma();
  if (prisma) {
    const [events, tripRequests, topScores, clicks] = await Promise.all([
      prisma.event.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.tripRequest.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.destinationScore.findMany({ where: { rank: 1 }, orderBy: { totalScore: "desc" }, take: 500 }),
      prisma.affiliateClick.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    ]);

    return {
      events: events as EventRow[],
      tripRequests: tripRequests as TripRequestRow[],
      topScores: topScores as Array<DestinationScoreRow & { destinationId: string }>,
      clicks: clicks as AffiliateClickRow[],
    };
  }

  const store = getMemoryStore();
  return {
    events: [...store.events.values()],
    tripRequests: [...store.tripRequests.values()],
    topScores: [...store.destinationScores.values()].filter((item) => item.rank === 1),
    clicks: [...store.affiliateClicks.values()],
  };
}
