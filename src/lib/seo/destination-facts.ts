// Bramka faktów SEO o kierunku (SEO Data Integrity, PR #1.5).
//
// Title, H1, meta, OG, FAQ, JSON-LD i widoczne bloki faktów stron kierunków
// biorą liczby o kierunku wyłącznie stąd. Bramka przepuszcza wartość według jej
// pochodzenia (lib/mvp/data-provenance.ts), a nie według tego, czy liczba
// „wygląda wiarygodnie":
//  • temperatura — tylko verified/curated; tablica regionu nigdy;
//  • czas lotu — verified/curated jako fakt; szacunek z odległości od
//    najbliższego lotniska w Polsce (seed data/destinations.json) wyłącznie jako
//    oznaczony szacunek do treści (nie do title, meta, OG ani JSON-LD); stała
//    regionu nigdy; kierunek w Polsce nie ma „lotu z Polski";
//  • budżet ze wzoru — tylko z danych kuratorowanych i tylko jako szacunek;
//  • wiza — bez kategorycznego claimu, dopóki nie ma zweryfikowanego źródła.
//
// Seed czytamy wprost z JSON-a: lib/mvp/destinations-seed.ts ma
// `import "server-only"`, który wywala node:test.

import seedJson from "../../../data/destinations.json";

import {
  derivedProvenance,
  isFactGrade,
  provenanceOf,
  type DataProvenance,
  type FactGradeProvenance,
} from "@/lib/mvp/data-provenance";
import { getStoryBySlug } from "@/lib/mvp/destination-content";
import { localizeCity, localizeCountry } from "@/lib/mvp/i18n-geo";
import type { DestinationProfile } from "@/lib/mvp/types";

export interface TemperatureFact {
  byMonth: readonly number[];
  provenance: FactGradeProvenance;
}

export interface ExactFlightFact {
  kind: "exact";
  hours: number;
  provenance: FactGradeProvenance;
}

/** Szacunek lotu bez przesiadek z najbliższego lotniska w Polsce, liczony z odległości. */
export interface EstimatedFlightFact {
  kind: "estimate";
  hours: number;
  provenance: "derived";
  hubIata: string;
  /** „z Wrocławia" — hub w dopełniaczu. */
  fromHub: string;
  distanceKm: number;
}

export type FlightFact = ExactFlightFact | EstimatedFlightFact;

export interface DestinationSeoFacts {
  slug: string;
  /** Polska nazwa: redakcyjna („Kreta"), potem egzonim („Rzym"), potem nazwa z katalogu. */
  name: string;
  countryName: string;
  /** Kierunek w Polsce — bez „lotu z Polski". */
  isDomestic: boolean;
  temperature: TemperatureFact | null;
  flight: FlightFact | null;
  /** Pochodzenie budżetów ze wzoru (costIndex × czas lotu) dla tego kierunku. */
  budgetEstimate: DataProvenance;
  entryRequirementsNote: string;
}

export const ENTRY_REQUIREMENTS_NOTE = "Sprawdź aktualne wymagania wjazdowe";

const HOME_COUNTRY = "Poland";

/** Huby z PL_HUBS w scripts/build-destinations-seed.ts, w dopełniaczu. */
const PL_HUB_FROM: Readonly<Record<string, string>> = {
  WAW: "z Warszawy",
  KRK: "z Krakowa",
  GDN: "z Gdańska",
  WRO: "z Wrocławia",
  KTW: "z Katowic",
  POZ: "z Poznania",
};

interface SeedHub {
  iata: string;
  km: number;
  minutes: number;
}

interface SeedRecord {
  id: string;
  nearestPLHubs?: SeedHub[];
}

/**
 * Najbliższy hub w Polsce per id seeda (id seeda = slug katalogu). Seed ma
 * zdublowane id — wtedy wpis przechodzi tylko przy zgodnym hubie i czasie.
 */
const nearestHubBySlug: ReadonlyMap<string, SeedHub> = (() => {
  const grouped = new Map<string, Array<SeedHub | undefined>>();
  for (const record of (seedJson as unknown as { destinations: SeedRecord[] }).destinations) {
    grouped.set(record.id, [...(grouped.get(record.id) ?? []), record.nearestPLHubs?.[0]]);
  }
  const result = new Map<string, SeedHub>();
  for (const [id, hubs] of grouped) {
    const [first] = hubs;
    if (!first || !Object.hasOwn(PL_HUB_FROM, first.iata)) continue;
    if (!(first.minutes > 0) || !(first.km > 0)) continue;
    if (hubs.some((hub) => hub?.iata !== first.iata || hub?.minutes !== first.minutes)) continue;
    result.set(id, first);
  }
  return result;
})();

export function destinationDisplayName(profile: Pick<DestinationProfile, "slug" | "city">): string {
  return getStoryBySlug(profile.slug)?.name ?? localizeCity(profile.city);
}

function resolveFlight(profile: DestinationProfile): FlightFact | null {
  const provenance = provenanceOf(profile, "flightDuration");
  const hours = profile.typicalFlightHoursFromPL;
  if (isFactGrade(provenance) && Number.isFinite(hours) && hours > 0) {
    return { kind: "exact", hours, provenance };
  }
  const hub = nearestHubBySlug.get(profile.slug);
  if (!hub) return null;
  return {
    kind: "estimate",
    hours: Math.round(hub.minutes / 6) / 10,
    provenance: "derived",
    hubIata: hub.iata,
    fromHub: PL_HUB_FROM[hub.iata],
    distanceKm: hub.km,
  };
}

export function getDestinationSeoFacts(profile: DestinationProfile): DestinationSeoFacts {
  const isDomestic = profile.country === HOME_COUNTRY;
  const temperatureProvenance = provenanceOf(profile, "temperature");
  const temperature =
    isFactGrade(temperatureProvenance) && profile.avgTempByMonth.length === 12
      ? { byMonth: profile.avgTempByMonth, provenance: temperatureProvenance }
      : null;

  return {
    slug: profile.slug,
    name: destinationDisplayName(profile),
    countryName: localizeCountry(profile.country),
    isDomestic,
    temperature,
    flight: isDomestic ? null : resolveFlight(profile),
    budgetEstimate: derivedProvenance(provenanceOf(profile, "price")),
    entryRequirementsNote: ENTRY_REQUIREMENTS_NOTE,
  };
}

export function monthTemperature(facts: DestinationSeoFacts, monthIndex: number): number | null {
  const value = facts.temperature?.byMonth[monthIndex];
  return typeof value === "number" ? value : null;
}

/** Czas lotu, który wolno podać jako fakt (title, meta, FAQ, JSON-LD). */
export function exactFlightHours(facts: DestinationSeoFacts): number | null {
  return facts.flight?.kind === "exact" ? facts.flight.hours : null;
}

/** Godziny do rekomendacji długości wyjazdu: fakt albo oznaczony szacunek. */
export function flightHoursForTripLength(facts: DestinationSeoFacts): number | null {
  return facts.flight?.hours ?? null;
}

/** Tekst do widocznej treści. Szacunek zawsze niesie etykietę i hub. */
export function formatFlightFact(fact: FlightFact): string {
  const hours = `${fact.hours.toFixed(1)} h`;
  return fact.kind === "exact" ? `ok. ${hours}` : `szacunkowo ok. ${hours} ${fact.fromHub} (liczone z odległości)`;
}

/** Budżet ze wzoru wolno pokazać wyłącznie jako oznaczony szacunek z danych kuratorowanych. */
export function canShowBudgetEstimate(facts: DestinationSeoFacts): boolean {
  return facts.budgetEstimate === "derived";
}
