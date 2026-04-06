import type { DestinationProfile, DiscoveryPreferences, ScoreBreakdown } from "./types";

export interface ScoredDestination {
  destination: DestinationProfile;
  score: number;
  breakdown: ScoreBreakdown;
  estimatedBudgetMin: number;
  estimatedBudgetMax: number;
  reasons: string[];
  tradeoffs: string[];
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function tempTarget(pref: DiscoveryPreferences["temperaturePreference"]): number {
  if (pref === "hot") return 29;
  if (pref === "warm") return 24;
  return 21;
}

function monthIndex(month?: number): number {
  if (!month) return new Date().getUTCMonth();
  return clamp(month - 1, 0, 11);
}

function budgetForDestination(dest: DestinationProfile, prefs: DiscoveryPreferences): {
  min: number;
  max: number;
} {
  const days = Math.max(2, Math.round((prefs.durationMinDays + prefs.durationMaxDays) / 2));

  const flightBasePerPerson = 380 + dest.typicalFlightHoursFromPL * 70;
  const stayAndFoodPerDayPerPerson = 170 * dest.costIndex;
  const localTransportAndTickets = 65 * dest.costIndex;

  const total =
    prefs.travelers * flightBasePerPerson +
    prefs.travelers * days * stayAndFoodPerDayPerPerson +
    days * localTransportAndTickets;

  const min = Math.round(total * 0.9);
  const max = Math.round(total * 1.18);
  return { min, max };
}

function weatherFit(dest: DestinationProfile, prefs: DiscoveryPreferences): number {
  const idx = monthIndex(prefs.departureMonth);
  const destinationTemp = dest.avgTempByMonth[idx] ?? 20;
  const target = tempTarget(prefs.temperaturePreference);
  const diff = Math.abs(destinationTemp - target);
  return clamp(1 - diff / 16);
}

function styleMatch(dest: DestinationProfile, prefs: DiscoveryPreferences): number {
  const weights = prefs.styleWeights;
  const totalWeight =
    weights.beach + weights.city + weights.sightseeing + weights.nightlife + weights.nature + weights.food;

  const foodProxy = clamp((dest.cityScore + dest.sightseeingScore + dest.nightlifeScore) / 3);

  const weighted =
    weights.beach * dest.beachScore +
    weights.city * dest.cityScore +
    weights.sightseeing * dest.sightseeingScore +
    weights.nightlife * dest.nightlifeScore +
    weights.nature * dest.natureScore +
    weights.food * foodProxy;

  return clamp(weighted / Math.max(0.01, totalWeight));
}

function buildReasons(
  dest: DestinationProfile,
  breakdown: ScoreBreakdown,
  prefs: DiscoveryPreferences,
  focused: boolean,
): string[] {
  const reasons: string[] = [];

  if (focused) {
    reasons.push("To dokladnie kierunek wskazany w briefie.");
  }
  if (breakdown.budgetFit >= 0.75) {
    reasons.push(`Dobrze miesci sie w budzecie do ${prefs.budgetMaxPln} PLN.`);
  }
  if ((prefs.niceTags.includes("beach") || prefs.niceTags.includes("beach_and_sightseeing")) && dest.beachScore >= 0.75) {
    reasons.push("Dobrze laczy wypoczynek z plaza i spokojniejszym rytmem wyjazdu.");
  }
  if (dest.cityScore >= 0.85 || dest.sightseeingScore >= 0.85) {
    reasons.push("Ma mocny miejski i sightseeingowy rdzen, wiec latwiej podjac konkretna decyzje.");
  }
  if (breakdown.travelEase >= 0.75) {
    reasons.push("Dojazd z Polski jest relatywnie prosty jak na ten typ wyjazdu.");
  }
  if (dest.safetyScore >= 0.82) {
    reasons.push("Daje dobry poziom przewidywalnosci i komfortu na krotki albo sredni pobyt.");
  }
  if (prefs.temperaturePreference !== "any" && breakdown.weatherFit >= 0.72) {
    reasons.push("Pogoda wpisuje sie w oczekiwany klimat wyjazdu.");
  }
  if (prefs.niceTags.includes("value") && dest.costIndex <= 1.02) {
    reasons.push("To kierunek z dobrym stosunkiem ceny do jakosci.");
  }
  if (prefs.visaPreference === "visa_free" && dest.visaForPL) {
    reasons.push("Nie doklada dodatkowych formalnosci wizowych do wyjazdu.");
  }

  return reasons.slice(0, 4);
}

function buildTradeoffs(dest: DestinationProfile, breakdown: ScoreBreakdown, prefs: DiscoveryPreferences): string[] {
  const tradeoffs: string[] = [];

  if (dest.typicalFlightHoursFromPL > 4.5) {
    tradeoffs.push("Dluzszy lot obniza wygode przy krotszym wyjezdzie.");
  }
  if (dest.costIndex > 1.45) {
    tradeoffs.push("Na miejscu moze byc wyraznie drozej niz w najmocniejszych alternatywach.");
  }
  if ((prefs.niceTags.includes("beach") || prefs.niceTags.includes("beach_and_sightseeing")) && dest.beachScore < 0.4) {
    tradeoffs.push("To bardziej kierunek miejski niz plazowy.");
  }
  if (breakdown.weatherFit < 0.5) {
    tradeoffs.push("Pogoda w tym okresie moze byc mniej stabilna niz sugeruje brief.");
  }
  if (prefs.niceTags.includes("family") && dest.natureScore < 0.45 && dest.beachScore < 0.45) {
    tradeoffs.push("Mniej oczywisty wybor, jesli priorytetem jest spokojniejszy rodzinny rytm.");
  }
  if (prefs.maxTransfers === 0 && breakdown.travelEase < 0.66) {
    tradeoffs.push("Przy wymaganiu prostszego lotu moze byc trudniej o naprawde wygodna trase.");
  }

  return tradeoffs.slice(0, 3);
}

export function scoreDestinations(
  destinations: DestinationProfile[],
  prefs: DiscoveryPreferences,
  topN = 5,
): ScoredDestination[] {
  const scored: ScoredDestination[] = [];

  for (const destination of destinations) {
    if (prefs.visaPreference === "visa_free" && !destination.visaForPL) {
      continue;
    }

    const budget = budgetForDestination(destination, prefs);
    const budgetFit = clamp(1 - Math.max(0, budget.min - prefs.budgetMaxPln) / Math.max(700, prefs.budgetMaxPln));

    if (budget.min > prefs.budgetMaxPln * 1.45) {
      continue;
    }

    const weather = weatherFit(destination, prefs);
    const travelEase = clamp(
      destination.accessScore * 0.75 + (1 - destination.typicalFlightHoursFromPL / 8) * 0.25,
    );
    const style = styleMatch(destination, prefs);
    const attractions = clamp((destination.cityScore + destination.sightseeingScore + destination.natureScore) / 3);
    const safety = destination.safetyScore;
    const focusMatch = Boolean(prefs.destinationFocus && destination.slug === prefs.destinationFocus);
    const focusBonus = focusMatch ? 0.24 : 0;

    let penalties = 0;
    if (prefs.maxTransfers === 0 && destination.typicalFlightHoursFromPL > 4.2) penalties += 0.08;
    if (prefs.durationMaxDays <= 4 && destination.typicalFlightHoursFromPL > 5) penalties += 0.12;
    penalties = clamp(penalties, 0, 0.25);

    const total =
      budgetFit * 0.3 +
      weather * 0.16 +
      travelEase * 0.18 +
      style * 0.2 +
      attractions * 0.1 +
      safety * 0.06 -
      penalties +
      focusBonus;

    const breakdown: ScoreBreakdown = {
      budgetFit: round(budgetFit),
      weatherFit: round(weather),
      travelEase: round(travelEase),
      styleMatch: round(style),
      attractionPotential: round(attractions),
      safetyQuality: round(safety),
      penalties: round(penalties),
    };

    scored.push({
      destination,
      score: round(clamp(total) * 100),
      breakdown,
      estimatedBudgetMin: budget.min,
      estimatedBudgetMax: budget.max,
      reasons: buildReasons(destination, breakdown, prefs, focusMatch),
      tradeoffs: buildTradeoffs(destination, breakdown, prefs),
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topN);
}
