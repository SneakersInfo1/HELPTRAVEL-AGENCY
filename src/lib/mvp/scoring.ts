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

function moodMatch(dest: DestinationProfile, prefs: DiscoveryPreferences): number {
  const foodProxy = clamp((dest.cityScore + dest.sightseeingScore + dest.nightlifeScore) / 3);

  switch (prefs.tripMood) {
    case "romantic":
      return clamp(dest.cityScore * 0.28 + dest.beachScore * 0.2 + foodProxy * 0.28 + dest.sightseeingScore * 0.14 + dest.safetyScore * 0.1);
    case "family":
      return clamp(dest.safetyScore * 0.32 + dest.beachScore * 0.18 + dest.natureScore * 0.22 + dest.accessScore * 0.18 + clamp(1 - dest.nightlifeScore * 0.35) * 0.1);
    case "solo":
      return clamp(dest.safetyScore * 0.34 + dest.cityScore * 0.22 + dest.sightseeingScore * 0.18 + dest.accessScore * 0.18 + foodProxy * 0.08);
    case "foodie":
      return clamp(foodProxy * 0.48 + dest.cityScore * 0.22 + dest.sightseeingScore * 0.18 + dest.safetyScore * 0.12);
    default:
      return clamp((dest.cityScore + dest.beachScore + dest.sightseeingScore) / 3);
  }
}

function logisticsFit(dest: DestinationProfile): number {
  return clamp(dest.accessScore * 0.62 + (1 - dest.typicalFlightHoursFromPL / 8) * 0.38);
}

function valueFit(budgetFit: number, travelEase: number, style: number): number {
  return clamp(budgetFit * 0.7 + travelEase * 0.15 + style * 0.15);
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
    reasons.push(`Dobrze miesci się w budżecie do ${prefs.budgetMaxPln} PLN.`);
  }
  if ((prefs.niceTags.includes("beach") || prefs.niceTags.includes("beach_and_sightseeing")) && dest.beachScore >= 0.75) {
    reasons.push("Dobrze łączy wypoczynek z plażą i spokojniejszym rytmem wyjazdu.");
  }
  if (dest.cityScore >= 0.85 || dest.sightseeingScore >= 0.85) {
    reasons.push("Ma mocny miejski i sightseeingowy rdzen, więc łatwiej podjac konkretna decyzje.");
  }
  if (breakdown.travelEase >= 0.75) {
    reasons.push("Dojazd z Polski jest relatywnie prosty jak na ten typ wyjazdu.");
  }
  if (dest.safetyScore >= 0.82) {
    reasons.push("Daje dobry poziom przewidywalnosci i komfortu na krótki albo średni pobyt.");
  }
  if (prefs.temperaturePreference !== "any" && breakdown.weatherFit >= 0.72) {
    reasons.push("Pogoda wpisuje się w oczekiwany klimat wyjazdu.");
  }
  if (prefs.niceTags.includes("value") && dest.costIndex <= 1.02) {
    reasons.push("To kierunek z dobrym stosunkiem ceny do jakości.");
  }
  if (prefs.visaPreference === "visa_free" && dest.visaForPL) {
    reasons.push("Nie doklada dodatkówych formalności wizowych do wyjazdu.");
  }
  if ((prefs.wantsShortFlight || prefs.logisticsPreference === "easy") && breakdown.logisticsFit >= 0.74) {
    reasons.push("Logistyka z Polski jest tu wyjatkowo prosta jak na ten typ wyjazdu.");
  }
  if (prefs.tripMood === "romantic" && breakdown.moodFit >= 0.72) {
    reasons.push("Łączy klimat, jedzenie i rytm miasta dobrze pasujący do romantycznego wyjazdu.");
  }
  if (prefs.tripMood === "family" && breakdown.moodFit >= 0.72) {
    reasons.push("Dobrze układa bezpieczeństwo, prosty dojazd i spokojniejszy rytm pod wyjazd rodzinny.");
  }
  if (prefs.tripMood === "solo" && breakdown.moodFit >= 0.7) {
    reasons.push("Sprawdza się przy samodzielnym wyjeździe dzięki prostocie, bezpieczeństwu i czytelnemu planowi miasta.");
  }
  if (prefs.tripMood === "foodie" && breakdown.moodFit >= 0.7) {
    reasons.push("Mocno broni się kulinarnie, więc łatwiej uzasadnic wyjazd jedzeniem i miejskim klimatem.");
  }
  if (prefs.wantsBeachSightseeingMix && dest.beachScore >= 0.7 && dest.sightseeingScore >= 0.7) {
    reasons.push("Naprawde domyka miks plaży i zwiedzania bez rozjechanego planu.");
  }

  return reasons.slice(0, 4);
}

function buildTradeoffs(dest: DestinationProfile, breakdown: ScoreBreakdown, prefs: DiscoveryPreferences): string[] {
  const tradeoffs: string[] = [];

  if (dest.typicalFlightHoursFromPL > 4.5) {
    tradeoffs.push("Dluzszy lot obniza wygodę przy krótszym wyjezdzie.");
  }
  if (dest.costIndex > 1.45) {
    tradeoffs.push("Na miejscu może być wyraznie drozej niż w najmocniejszych alternatywach.");
  }
  if ((prefs.niceTags.includes("beach") || prefs.niceTags.includes("beach_and_sightseeing")) && dest.beachScore < 0.4) {
    tradeoffs.push("To bardziej kierunek miejski niż plażowy.");
  }
  if (breakdown.weatherFit < 0.5) {
    tradeoffs.push("Pogoda w tym okresie może być mniej stabilna niż sugeruje brief.");
  }
  if (prefs.niceTags.includes("family") && dest.natureScore < 0.45 && dest.beachScore < 0.45) {
    tradeoffs.push("Mniej oczywisty wybór, jeśli priorytetem jest spokojniejszy rodzinny rytm.");
  }
  if (prefs.maxTransfers === 0 && breakdown.travelEase < 0.66) {
    tradeoffs.push("Przy wymaganiu prostszego lotu może być trudniej o naprawde wygodna trase.");
  }
  if ((prefs.wantsShortFlight || prefs.logisticsPreference === "easy") && dest.typicalFlightHoursFromPL > 4.2) {
    tradeoffs.push("To nie jest najmocniejszy wybór, jeśli priorytetem ma być bardzo lekki dolot.");
  }
  if (prefs.tripMood === "family" && dest.nightlifeScore > 0.7) {
    tradeoffs.push("Bardziej żywe dzielnice mogą dawać mniej spokojny rodzinny rytm.");
  }
  if (prefs.tripMood === "romantic" && dest.cityScore < 0.55 && dest.beachScore < 0.55) {
    tradeoffs.push("Mniej oczywisty wybór, jeśli zależy Ci na bardziej nastrojowym albo widokowym klimacie.");
  }
  if (prefs.wantsWeatherReliability && breakdown.weatherFit < 0.62) {
    tradeoffs.push("Przy nacisku na pewniejsza pogodę inne kierunki beda bardziej przewidywalne.");
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

    // Don't hard-drop destinations on budget overshoot. With 5 travellers or
    // 6+ nights at the default budget=2500 PLN, the previous *1.45 cut would
    // remove EVERY destination → empty options → generic "ranking" error in
    // the planner. Booking-style: show the results, let the budgetFit penalty
    // demote over-budget options. Users keep control via the budget filter.

    const weather = weatherFit(destination, prefs);
    const travelEase = clamp(
      destination.accessScore * 0.75 + (1 - destination.typicalFlightHoursFromPL / 8) * 0.25,
    );
    const style = styleMatch(destination, prefs);
    const logistics = logisticsFit(destination);
    const mood = moodMatch(destination, prefs);
    const value = valueFit(budgetFit, travelEase, style);
    const attractions = clamp((destination.cityScore + destination.sightseeingScore + destination.natureScore) / 3);
    const safety = destination.safetyScore;
    const focusMatch = Boolean(prefs.destinationFocus && destination.slug === prefs.destinationFocus);
    const focusBonus = focusMatch ? 0.24 : 0;

    let penalties = 0;
    if (prefs.maxTransfers === 0 && destination.typicalFlightHoursFromPL > 4.2) penalties += 0.08;
    if (prefs.durationMaxDays <= 4 && destination.typicalFlightHoursFromPL > 5) penalties += 0.12;
    if ((prefs.wantsShortFlight || prefs.logisticsPreference === "easy") && destination.typicalFlightHoursFromPL > 4.5) penalties += 0.08;
    if (prefs.wantsWeatherReliability && weather < 0.62) penalties += 0.06;
    penalties = clamp(penalties, 0, 0.25);

    let total =
      budgetFit * 0.24 +
      weather * 0.14 +
      travelEase * 0.16 +
      style * 0.18 +
      attractions * 0.08 +
      safety * 0.06 +
      value * 0.07 +
      logistics * 0.04 +
      mood * 0.03 -
      penalties +
      focusBonus;

    if (prefs.tripMood !== "any") {
      total += (mood - 0.5) * 0.14;
    }
    if (prefs.wantsShortFlight || prefs.logisticsPreference === "easy") {
      total += (logistics - 0.5) * 0.12;
    }
    if (prefs.wantsWeatherReliability) {
      total += (weather - 0.5) * 0.08;
    }
    if (prefs.wantsBeachSightseeingMix && destination.beachScore >= 0.68 && destination.sightseeingScore >= 0.7) {
      total += 0.06;
    }

    const breakdown: ScoreBreakdown = {
      budgetFit: round(budgetFit),
      weatherFit: round(weather),
      travelEase: round(travelEase),
      styleMatch: round(style),
      attractionPotential: round(attractions),
      safetyQuality: round(safety),
      valueFit: round(value),
      logisticsFit: round(logistics),
      moodFit: round(mood),
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
