// Model strony /porownanie/[para] (SEO Data Integrity, PR #1.5; normy WMO, 11.2026).
//
// Porównania zestawiały liczby z profili kierunków. Dla 212 z 235 kierunków
// temperatura, czas lotu i budżet ze wzoru były szablonem regionu, więc Kreta–Rodos
// i Kreta–Majorka pokazywały po obu stronach identyczne wartości, a przy remisie
// wyników szybka odpowiedź i FAQ i tak „wybierały zwycięzcę”.
//
// Model bierze liczby wyłącznie z bramki faktów (destination-facts.ts): wiersz
// tabeli, zdanie FAQ albo sekcja pojawia się tylko wtedy, gdy obie strony mają
// wartość dozwoloną kontraktem. Temperatury to normy WMO (średnie maksima
// i minima), z widocznym źródłem. Kwot budżetu ze wzoru nie ma — stałe wzoru nie
// miały żadnego źródła. Remis = brak zwycięzcy.
//
// W profilu z szablonu `costIndex`, `accessScore` i oceny profilu (`deriveScores`)
// to przeliczone stałe kraju, regionu i list miast. „Taniej”, „łatwiejszy dolot”,
// „mocniejszy profil plażowy” i „dla kogo” wymagają więc danych kuratorowanych
// po obu stronach; bez nich strona nie wskazuje zwycięzcy.
//
// JĘZYK: nazwa kierunku stoi zawsze po dwukropku, bez orzeczenia, które musiałoby
// się z nią zgadzać. „Lepszy jest Ateny”, „w kierunku Ateny” i „Ateny ma” to błędy
// rodzaju, liczby albo przypadku, których nie da się uniknąć bez odmiany nazw
// (Ateny — l.mn., Walencja — r.ż.), a odmiany nie ma w danych.

import type { ComparisonPair } from "@/lib/mvp/comparisons";
import { formatClimateNumber } from "@/lib/mvp/climate-normals";
import { polishMonthLabels, polishMonthSlugs } from "@/lib/mvp/months";
import type { DestinationProfile } from "@/lib/mvp/types";

import {
  canClaimFromCostIndex,
  canClaimFromProfileScores,
  flightHoursForTripLength,
  formatFlightFact,
  getDestinationSeoFacts,
  type ClimateFactSource,
  type DestinationSeoFacts,
  type FlightFact,
} from "./destination-facts";

export interface ComparisonSide {
  profile: DestinationProfile;
  facts: DestinationSeoFacts;
  /** Etykieta pary („Kreta”), inaczej polska nazwa kierunku. */
  name: string;
}

export interface ComparisonRow {
  label: string;
  av: string;
  bv: string;
}

export interface ComparisonClimateSummary {
  side: ComparisonSide;
  lowestDaytimeMaxC: number;
  highestDaytimeMaxC: number;
  warmestMonths: string[];
  coldestMonths: string[];
  source: ClimateFactSource;
}

export interface ComparisonModelInput {
  pair: ComparisonPair;
  a: DestinationProfile;
  b: DestinationProfile;
  baseUrl: string;
  images: string[];
  author: Record<string, unknown>;
}

export interface ComparisonModel {
  a: ComparisonSide;
  b: ComparisonSide;
  rows: ComparisonRow[];
  scoreNote: string;
  verdicts: Array<{ title: string; body: string }>;
  faq: Array<{ question: string; answer: string }>;
  quickAnswer: string;
  climate: ComparisonClimateSummary[];
  /** Strony bez oficjalnej normy — notka zamiast liczb. */
  missingClimate: ComparisonSide[];
  audience: [string[], string[]];
  flightSentences: [string | null, string | null];
  structuredData: Record<string, unknown>;
}

export const PROFILE_SCORE_NOTE =
  "Profil plażowy, city break i zwiedzanie to nasza wewnętrzna ocena w skali 0–100, a nie pomiar.";

export const PROFILE_SCORE_NOTE_WITH_ACCESS =
  "Profil plażowy, city break, zwiedzanie i dolot to nasza wewnętrzna ocena w skali 0–100, a nie pomiar.";

const TIE = 0.05;

function winner(
  a: ComparisonSide,
  b: ComparisonSide,
  score: (profile: DestinationProfile) => number,
): ComparisonSide | null {
  const av = score(a.profile);
  const bv = score(b.profile);
  if (Math.abs(av - bv) < TIE) return null;
  return av > bv ? a : b;
}

function bothExactFlights(a: ComparisonSide, b: ComparisonSide): boolean {
  return a.facts.flight?.kind === "exact" && b.facts.flight?.kind === "exact";
}

function bothScoresKnown(a: ComparisonSide, b: ComparisonSide): boolean {
  return canClaimFromProfileScores(a.facts) && canClaimFromProfileScores(b.facts);
}

function bothCostsKnown(a: ComparisonSide, b: ComparisonSide): boolean {
  return canClaimFromCostIndex(a.facts) && canClaimFromCostIndex(b.facts);
}

function flightCell(fact: FlightFact): string {
  const hours = `~${fact.hours.toFixed(1)} h`;
  return fact.kind === "exact" ? hours : `${hours} (szacunek)`;
}

function flightSentence(facts: DestinationSeoFacts): string | null {
  const fact = facts.flight;
  if (!fact) return null;
  return fact.kind === "exact" ? `Lot ok. ${fact.hours.toFixed(1)} h.` : `Lot ${formatFlightFact(fact)}.`;
}

function audienceTags(side: ComparisonSide): string[] {
  if (!canClaimFromProfileScores(side.facts)) return [];
  const destination = side.profile;
  const tags: string[] = [];
  if (destination.beachScore >= 0.7) tags.push("plaży i wypoczynku nad morzem");
  if (destination.cityScore >= 0.7) tags.push("klasycznego city breaku");
  if (destination.sightseeingScore >= 0.7) tags.push("zwiedzania i zabytków");
  if (destination.nightlifeScore >= 0.72) tags.push("nocnego życia");
  if (destination.natureScore >= 0.78) tags.push("natury i krajobrazów");
  if (destination.costIndex <= 1 && canClaimFromCostIndex(side.facts)) tags.push("napiętego budżetu");
  const hours = flightHoursForTripLength(side.facts);
  if (hours !== null && hours <= 3.3) tags.push("krótkiego wypadu (bliski lot)");
  if (tags.length === 0) tags.push("uniwersalnego wyjazdu na 3-5 dni");
  return tags.slice(0, 4);
}

function buildVerdicts(a: ComparisonSide, b: ComparisonSide): Array<{ title: string; body: string }> {
  const verdicts: Array<{ title: string; body: string }> = [];

  if (bothCostsKnown(a, b)) {
    const cheaper = winner(a, b, (destination) => -destination.costIndex);
    verdicts.push(
      cheaper
        ? { title: "Budżet", body: `Taniej zwykle: ${cheaper.name}. To porównanie względne; aktualne ceny hoteli sprawdzisz dla swoich dat w wyszukiwarce.` }
        : { title: "Budżet", body: `${a.name} i ${b.name} mają podobny redakcyjny indeks kosztów. Aktualne ceny hoteli sprawdzisz w wyszukiwarce.` },
    );
  }

  if (bothScoresKnown(a, b)) {
    const beach = winner(a, b, (destination) => destination.beachScore);
    if (beach) verdicts.push({ title: "Plaża i klimat morski", body: `Mocniejszy profil plażowy: ${beach.name}. Lepszy wybór pod reset nad morzem.` });

    const city = winner(a, b, (destination) => destination.cityScore);
    if (city) verdicts.push({ title: "City break i tło miejskie", body: `Mocniejszy profil city breaku: ${city.name}. Gęstsze zwiedzanie i klimat uliczny.` });
  }

  const access = bothExactFlights(a, b) ? winner(a, b, (destination) => destination.accessScore) : null;
  if (access) {
    verdicts.push({ title: "Dolot z Polski", body: `Łatwiejsza i bardziej regularna logistyka z Polski: ${access.name}. Sensowny wybór pod krótki wyjazd.` });
  }
  return verdicts;
}

function cheaperName(a: ComparisonSide, b: ComparisonSide): string | null {
  if (Math.abs(a.profile.costIndex - b.profile.costIndex) < TIE) return null;
  return a.profile.costIndex < b.profile.costIndex ? a.name : b.name;
}

function julyComparison(a: ComparisonSide, b: ComparisonSide) {
  if (!a.facts.temperature || !b.facts.temperature) return null;
  const aValue = a.facts.temperature.byMonth[6];
  const bValue = b.facts.temperature.byMonth[6];
  return { aValue, bValue, higher: aValue === bValue ? null : aValue > bValue ? a.name : b.name };
}

function buildFaq(a: ComparisonSide, b: ComparisonSide): Array<{ question: string; answer: string }> {
  const scoresKnown = bothScoresKnown(a, b);
  const exactFlights = bothExactFlights(a, b);
  const easier = winner(a, b, (destination) => destination.accessScore);
  const beach = scoresKnown ? winner(a, b, (destination) => destination.beachScore) : null;
  const city = scoresKnown ? winner(a, b, (destination) => destination.cityScore + destination.sightseeingScore) : null;
  const july = julyComparison(a, b);
  const logistics = exactFlights
    ? easier
      ? `Łatwiejszy dolot i logistyka z Polski na pierwszy wyjazd: ${easier.name}. `
      : "Pod względem dolotu i logistyki z Polski oba kierunki wypadają podobnie. "
    : "";
  const faq: Array<{ question: string; answer: string }> = [];

  if (scoresKnown) {
    faq.push(
      {
        question: `${a.name} czy ${b.name} — co wybrać na pierwszy raz?`,
        answer: `${logistics}${beach ? `Jeśli zależy Ci głównie na plaży: ${beach.name}` : "Pod plażę oba kierunki wypadają podobnie"}; ${
          city ? `jeśli na zwiedzaniu i miejskim klimacie: ${city.name}.` : "pod zwiedzanie żaden nie ma wyraźnej przewagi."
        }`,
      },
      {
        question: `Co lepsze na zwiedzanie i city break — ${a.name} czy ${b.name}?`,
        answer: city
          ? `Przy planie pełnym atrakcji i spacerów po mieście: ${city.name} (mocniejszy profil miejski i więcej do zwiedzania w ocenie redakcji).`
          : "Oba kierunki mają podobny profil miejski — o wyborze zdecydują raczej konkretne atrakcje i termin.",
      },
    );
  }

  if (july) {
    faq.push({
      question: `Gdzie jest wyższa średnia maksymalna w lipcu — ${a.name} czy ${b.name}?`,
      answer: july.higher
        ? `Wyższą średnią maksymalną temperaturę w dzień ma w lipcu: ${july.higher} (${formatClimateNumber(Math.max(july.aValue, july.bValue))}°C wobec ${formatClimateNumber(Math.min(july.aValue, july.bValue))}°C). Źródło: WMO World Weather Information Service.`
        : `Oba kierunki mają w lipcu taką samą średnią maksymalną temperaturę w dzień: ${formatClimateNumber(july.aValue)}°C. Źródło: WMO World Weather Information Service.`,
    });
  }

  if (bothCostsKnown(a, b)) {
    const cheaper = cheaperName(a, b);
    faq.push({
      question: `Który kierunek zwykle wypada taniej — ${a.name} czy ${b.name}?`,
      answer: cheaper
        ? `Według redakcyjnego indeksu kosztów zwykle taniej: ${cheaper}. Aktualne ceny hoteli dla swoich dat sprawdzisz w wyszukiwarce.`
        : "Redakcyjny indeks kosztów jest podobny dla obu kierunków. Aktualne ceny hoteli dla swoich dat sprawdzisz w wyszukiwarce.",
    });
  }
  return faq;
}

function buildQuickAnswer(a: ComparisonSide, b: ComparisonSide): string {
  const july = julyComparison(a, b);

  if (!bothScoresKnown(a, b)) {
    const parts = [`${a.name} czy ${b.name}? Dla tej pary nie mamy pełnych ocen redakcyjnych obu kierunków, więc nie wskazujemy lepszego.`];
    if (july) {
      parts.push(
        july.higher
          ? `W lipcu wyższa średnia maksymalna w dzień: ${july.higher}.`
          : "W lipcu średnia maksymalna w dzień jest taka sama w obu kierunkach.",
      );
    }
    parts.push("Poniżej porównanie tego, co mamy sprawdzone.");
    return parts.join(" ");
  }

  const beach = winner(a, b, (destination) => destination.beachScore);
  const city = winner(a, b, (destination) => destination.cityScore + destination.sightseeingScore);
  const easier = winner(a, b, (destination) => destination.accessScore);
  const beachPart = beach ? `Na plażę i wypoczynek nad morzem: ${beach.name}` : "Pod plażę i wypoczynek nad morzem oba kierunki wypadają podobnie";
  const cityPart = city ? `na zwiedzanie i miejski klimat: ${city.name}` : "pod zwiedzanie żaden nie ma wyraźnej przewagi";
  const accessPart = bothExactFlights(a, b)
    ? easier
      ? `Najprostszy dolot z Polski: ${easier.name}.`
      : "Dolot z Polski jest porównywalny."
    : null;

  let answer = `${a.name} czy ${b.name}? ${beachPart}; ${cityPart}.`;
  if (bothCostsKnown(a, b)) {
    const cheaper = cheaperName(a, b);
    answer += cheaper ? ` Taniej zwykle: ${cheaper}.` : " Kosztowo oba kierunki są podobne.";
  }
  if (accessPart) answer += ` ${accessPart}`;
  if (july?.higher) answer += ` W lipcu wyższa średnia maksymalna w dzień: ${july.higher}.`;
  return answer;
}

function monthNamesAtValue(values: readonly number[], expected: number): string[] {
  return polishMonthSlugs
    .filter((_, index) => values[index] === expected)
    .map((month) => polishMonthLabels[month]);
}

export function comparisonCoverage(a: DestinationProfile, b: DestinationProfile): { climate: boolean } {
  const factsA = getDestinationSeoFacts(a);
  const factsB = getDestinationSeoFacts(b);
  return { climate: Boolean(factsA.temperature && factsB.temperature) };
}

export function buildComparisonModel(input: ComparisonModelInput): ComparisonModel {
  const { pair, baseUrl } = input;
  const factsA = getDestinationSeoFacts(input.a);
  const factsB = getDestinationSeoFacts(input.b);
  const a: ComparisonSide = { profile: input.a, facts: factsA, name: pair.labelA ?? factsA.name };
  const b: ComparisonSide = { profile: input.b, facts: factsB, name: pair.labelB ?? factsB.name };
  const exactFlights = bothExactFlights(a, b);

  const rows: ComparisonRow[] = [];
  if (factsA.flight && factsB.flight) {
    rows.push({ label: "Lot z Polski (h)", av: flightCell(factsA.flight), bv: flightCell(factsB.flight) });
  }
  if (factsA.temperature && factsB.temperature) {
    rows.push(
      {
        label: "Średnia maks. w dzień — styczeń",
        av: `${formatClimateNumber(factsA.temperature.byMonth[0])}°C`,
        bv: `${formatClimateNumber(factsB.temperature.byMonth[0])}°C`,
      },
      {
        label: "Średnia min. w nocy — styczeń",
        av: `${formatClimateNumber(factsA.temperature.minByMonth[0])}°C`,
        bv: `${formatClimateNumber(factsB.temperature.minByMonth[0])}°C`,
      },
      {
        label: "Średnia maks. w dzień — lipiec",
        av: `${formatClimateNumber(factsA.temperature.byMonth[6])}°C`,
        bv: `${formatClimateNumber(factsB.temperature.byMonth[6])}°C`,
      },
      {
        label: "Średnia min. w nocy — lipiec",
        av: `${formatClimateNumber(factsA.temperature.minByMonth[6])}°C`,
        bv: `${formatClimateNumber(factsB.temperature.minByMonth[6])}°C`,
      },
    );
  }
  rows.push(
    { label: "Profil plażowy", av: `${Math.round(input.a.beachScore * 100)}/100`, bv: `${Math.round(input.b.beachScore * 100)}/100` },
    { label: "City break", av: `${Math.round(input.a.cityScore * 100)}/100`, bv: `${Math.round(input.b.cityScore * 100)}/100` },
    { label: "Zwiedzanie", av: `${Math.round(input.a.sightseeingScore * 100)}/100`, bv: `${Math.round(input.b.sightseeingScore * 100)}/100` },
  );
  if (exactFlights) {
    rows.push({ label: "Dolot/dostępność", av: `${Math.round(input.a.accessScore * 100)}/100`, bv: `${Math.round(input.b.accessScore * 100)}/100` });
  }

  const climate: ComparisonClimateSummary[] = [];
  const missingClimate: ComparisonSide[] = [];
  for (const side of [a, b]) {
    const temperature = side.facts.temperature;
    if (!temperature) {
      missingClimate.push(side);
      continue;
    }
    const lowestDaytimeMaxC = Math.min(...temperature.byMonth);
    const highestDaytimeMaxC = Math.max(...temperature.byMonth);
    climate.push({
      side,
      lowestDaytimeMaxC,
      highestDaytimeMaxC,
      warmestMonths: monthNamesAtValue(temperature.byMonth, highestDaytimeMaxC),
      coldestMonths: monthNamesAtValue(temperature.byMonth, lowestDaytimeMaxC),
      source: temperature.source,
    });
  }

  const faq = buildFaq(a, b);
  const pageUrl = `${baseUrl}/porownanie/${pair.slug}`;
  const citations = [...new Set(climate.map((entry) => entry.source.url))];

  return {
    a,
    b,
    rows,
    scoreNote: exactFlights ? PROFILE_SCORE_NOTE_WITH_ACCESS : PROFILE_SCORE_NOTE,
    verdicts: buildVerdicts(a, b),
    faq,
    quickAnswer: buildQuickAnswer(a, b),
    climate,
    missingClimate,
    audience: [audienceTags(a), audienceTags(b)],
    flightSentences: [flightSentence(factsA), flightSentence(factsB)],
    structuredData: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article",
          headline: `${a.name} czy ${b.name}? Porównanie pod krótki wyjazd`,
          description: pair.intent,
          url: pageUrl,
          mainEntityOfPage: pageUrl,
          image: input.images,
          inLanguage: "pl-PL",
          author: input.author,
          publisher: { "@id": `${baseUrl}/#organization` },
          ...(citations.length > 0 ? { citation: citations } : {}),
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
            { "@type": "ListItem", position: 2, name: "Kierunki", item: `${baseUrl}/kierunki` },
            { "@type": "ListItem", position: 3, name: `${a.name} vs ${b.name}`, item: pageUrl },
          ],
        },
        ...(faq.length > 0
          ? [{ "@type": "FAQPage", mainEntity: faq.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) }]
          : []),
      ],
    },
  };
}
