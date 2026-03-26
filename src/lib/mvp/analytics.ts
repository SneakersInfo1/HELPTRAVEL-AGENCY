import { curatedDestinations } from "./destinations";
import { getAnalyticsBaseData } from "./store";

function topEntries(values: string[], topN = 5): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const value of values) {
    const key = value.trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

export async function getAnalyticsSummary(): Promise<{
  plannerRuns: number;
  generatedResults: number;
  affiliateClicks: number;
  topQueries: Array<{ key: string; count: number }>;
  topDestinations: Array<{ key: string; count: number }>;
  topEventTypes: Array<{ key: string; count: number }>;
}> {
  const base = await getAnalyticsBaseData();

  const plannerRuns = base.events.filter((event) => event.eventType === "planner_started").length;
  const generatedResults = base.events.filter(
    (event) => event.eventType === "discovery_generated" || event.eventType === "standard_generated",
  ).length;
  const affiliateClicks = base.clicks.length;

  const topQueries = topEntries(base.tripRequests.map((request) => request.rawQuery), 6);

  const destinationMap = new Map<string, string>();
  for (const destination of curatedDestinations) {
    destinationMap.set(destination.id, `${destination.city}, ${destination.country}`);
  }
  const topDestinations = topEntries(
    base.topScores.map((score) => destinationMap.get(score.destinationId) ?? score.destinationId),
    6,
  );
  const topEventTypes = topEntries(base.events.map((event) => event.eventType), 8);

  return {
    plannerRuns,
    generatedResults,
    affiliateClicks,
    topQueries,
    topDestinations,
    topEventTypes,
  };
}

