import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import { seasonInflected, seasonMonthIndexes, type Season } from "@/lib/mvp/months";
import type { DestinationProfile } from "@/lib/mvp/types";

import {
  getDestinationSeoFacts,
  type DestinationSeoFacts,
  type TemperatureFact,
} from "./destination-facts";

export const SEASON_DAYTIME_MAX_MIN_C = 22;
export const SEASON_DAYTIME_MAX_MAX_C = 28;

export type SeasonListEntry = {
  destination: DestinationProfile;
  facts: DestinationSeoFacts & { temperature: TemperatureFact };
  averageDaytimeMaxC: number;
};

export function averageSeasonalDaytimeMax(temperatures: readonly number[], months: readonly number[]): number {
  return months.reduce((sum, monthIndex) => sum + temperatures[monthIndex], 0) / months.length;
}

export function buildSeasonList(season: Season): SeasonListEntry[] {
  const months = seasonMonthIndexes[season];
  return getAllDestinationProfiles()
    .map((destination) => ({ destination, facts: getDestinationSeoFacts(destination) }))
    .filter(
      (entry): entry is { destination: DestinationProfile; facts: DestinationSeoFacts & { temperature: TemperatureFact } } =>
        entry.facts.temperature !== null && !entry.facts.isDomestic,
    )
    .map((entry) => ({
      ...entry,
      averageDaytimeMaxC: averageSeasonalDaytimeMax(entry.facts.temperature.byMonth, months),
    }))
    .filter(
      (entry) =>
        entry.averageDaytimeMaxC >= SEASON_DAYTIME_MAX_MIN_C &&
        entry.averageDaytimeMaxC <= SEASON_DAYTIME_MAX_MAX_C,
    )
    .sort(
      (a, b) =>
        a.facts.name.localeCompare(b.facts.name, "pl") ||
        a.destination.slug.localeCompare(b.destination.slug),
    );
}

export function seasonListDescription(season: Season): string {
  return `Alfabetyczna lista kierunków na ${seasonInflected[season]} ze średnią miesięcznych maksimów w dzień 22–28°C. Normy WMO pochodzą z różnych okresów.`;
}

export function seasonListIntro(season: Season): string {
  return `Lista obejmuje kierunki, w których średnia z miesięcznych średnich maksimów w dzień na ${seasonInflected[season]} mieści się w przedziale 22–28°C. Kolejność jest alfabetyczna, ponieważ normy WMO pochodzą z różnych okresów referencyjnych.`;
}
