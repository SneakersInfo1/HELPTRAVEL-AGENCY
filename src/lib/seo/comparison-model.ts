// Model strony /porownanie/[para] (SEO Data Integrity, PR #1.5).
//
// Porównania zestawiały liczby z profili kierunków. Dla 212 z 235 kierunków
// temperatura, czas lotu i budżet ze wzoru to szablon regionu, więc Kreta–Rodos
// i Kreta–Majorka pokazywały po obu stronach identyczne wartości (3.1 h,
// 20/29/12°C, ~2895 PLN), a przy remisie wyników szybka odpowiedź i FAQ i tak
// „wybierały zwycięzcę" — zawsze pierwszy kierunek z pary.
//
// Model bierze liczby wyłącznie z bramki faktów (destination-facts.ts): wiersz
// tabeli, zdanie FAQ albo sekcja pojawia się tylko wtedy, gdy obie strony mają
// wartość dozwoloną kontraktem. Wyniki profilu 0–100 zostają jako oznaczona
// wewnętrzna ocena, więc tabela nigdy nie jest pusta. Remis = brak zwycięzcy.
//
// W profilu z szablonu `costIndex` i `accessScore` to przeliczone stałe regionu
// (deriveCostIndex, deriveAccessScore ← countryAccessHours w destinations.ts).
// „Taniej", „podobny pułap cenowy" i „łatwiejszy dolot" powtarzałyby szablon
// innymi słowami, dlatego werdykt o budżecie wymaga kosztów z danych
// kuratorowanych, a werdykt o dolocie — dokładnego czasu lotu po obu stronach.

import type { ComparisonPair } from "@/lib/mvp/comparisons";
import { polishMonthLabels, polishMonthSlugs } from "@/lib/mvp/months";
import type { DestinationProfile } from "@/lib/mvp/types";

import {
  canShowBudgetEstimate,
  flightHoursForTripLength,
  formatFlightFact,
  getDestinationSeoFacts,
  type DestinationSeoFacts,
  type FlightFact,
} from "./destination-facts";

export interface ComparisonSide {
  profile: DestinationProfile;
  facts: DestinationSeoFacts;
  /** Etykieta pary („Kreta"), inaczej polska nazwa kierunku. */
  name: string;
}

export interface ComparisonRow {
  label: string;
  av: string;
  bv: string;
}

export interface ComparisonWhenToGo {
  side: ComparisonSide;
  months: string[];
  summerAvg: number;
  winterAvg: number;
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
  /** Strony z temperaturą kuratorowaną. */
  whenToGo: ComparisonWhenToGo[];
  /** Strony bez zweryfikowanej temperatury — notka zamiast liczb. */
  missingClimate: ComparisonSide[];
  /** Szacunek ze wzoru, tylko gdy obie strony mają dane kuratorowane. */
  budget: { a: number; b: number } | null;
  audience: [string[], string[]];
  flightSentences: [string | null, string | null];
  structuredData: Record<string, unknown>;
}

export const PROFILE_SCORE_NOTE =
  "Profil plażowy, city break i zwiedzanie to nasza wewnętrzna ocena w skali 0–100, a nie pomiar.";

/** Nota, gdy tabela ma też wiersz dolotu (obie strony z dokładnym czasem lotu). */
export const PROFILE_SCORE_NOTE_WITH_ACCESS =
  "Profil plażowy, city break, zwiedzanie i dolot to nasza wewnętrzna ocena w skali 0–100, a nie pomiar.";

/** Różnica wyników poniżej progu to remis — nie ogłaszamy zwycięzcy. */
const TIE = 0.05;

function avgYear(temps: readonly number[]) {
  return Math.round(temps.reduce((sum, value) => sum + value, 0) / temps.length);
}

function summerAvg(temps: readonly number[]) {
  return Math.round((temps[5] + temps[6] + temps[7]) / 3);
}

function winterAvg(temps: readonly number[]) {
  return Math.round((temps[11] + temps[0] + temps[1]) / 3);
}

/** Wzór bez zmian — szacunek, nie cena. */
function budget(d: DestinationProfile) {
  const days = 4;
  const travelers = 2;
  const flightBase = 380 + d.typicalFlightHoursFromPL * 70;
  const stay = 170 * d.costIndex;
  const local = 65 * d.costIndex;
  const total = travelers * flightBase + travelers * days * stay + days * local;
  return Math.round(total);
}

// Komfortowe miesiące (18-30°C) — ta sama heurystyka co na commercial landingach.
function comfortableMonths(temps: readonly number[]): string[] {
  return temps
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t >= 18 && t <= 30)
    .map(({ i }) => polishMonthLabels[polishMonthSlugs[i]]);
}

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

/** Ocena dolotu ma pokrycie tylko przy dokładnym czasie lotu po obu stronach. */
function bothExactFlights(a: ComparisonSide, b: ComparisonSide): boolean {
  return a.facts.flight?.kind === "exact" && b.facts.flight?.kind === "exact";
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

// Dla kogo dany kierunek — czytane z profilu (score 0-1), bez fabrykacji.
function audienceTags(side: ComparisonSide): string[] {
  const d = side.profile;
  const tags: string[] = [];
  if (d.beachScore >= 0.7) tags.push("plaży i wypoczynku nad morzem");
  if (d.cityScore >= 0.7) tags.push("klasycznego city breaku");
  if (d.sightseeingScore >= 0.7) tags.push("zwiedzania i zabytków");
  if (d.nightlifeScore >= 0.72) tags.push("nocnego życia");
  if (d.natureScore >= 0.78) tags.push("natury i krajobrazów");
  if (d.costIndex <= 1.0 && canShowBudgetEstimate(side.facts)) tags.push("napiętego budżetu");
  const hours = flightHoursForTripLength(side.facts);
  if (hours !== null && hours <= 3.3) tags.push("krótkiego wypadu (bliski lot)");
  if (tags.length === 0) tags.push("uniwersalnego wyjazdu na 3-5 dni");
  return tags.slice(0, 4);
}

function buildVerdicts(
  a: ComparisonSide,
  b: ComparisonSide,
  budgets: { a: number; b: number } | null,
): Array<{ title: string; body: string }> {
  const verdicts: Array<{ title: string; body: string }> = [];

  if (budgets) {
    const cheaper = winner(a, b, (d) => -d.costIndex);
    verdicts.push(
      cheaper
        ? {
            title: "Budżet",
            body: `${cheaper.name} wypada zwykle taniej — przy podobnym planie łatwiej obronić tańszy kierunek.`,
          }
        : {
            title: "Budżet",
            body: `${a.name} i ${b.name} grają w podobnym pułapie cenowym, więc budżet rzadko jest decydujący.`,
          },
    );
  }

  const beach = winner(a, b, (d) => d.beachScore);
  if (beach) {
    verdicts.push({
      title: "Plaża i klimat morski",
      body: `${beach.name} ma mocniejszy profil plażowy — to lepszy wybór pod reset nad morzem.`,
    });
  }

  const city = winner(a, b, (d) => d.cityScore);
  if (city) {
    verdicts.push({
      title: "City break i tło miejskie",
      body: `${city.name} jest mocniejszy jako klasyczny city break z gęstszym zwiedzaniem i klimatem ulicznym.`,
    });
  }

  const access = bothExactFlights(a, b) ? winner(a, b, (d) => d.accessScore) : null;
  if (access) {
    verdicts.push({
      title: "Dolot z Polski",
      body: `${access.name} ma łatwiejszą i bardziej regularną logistykę z Polski — sensowny wybór pod krótki wyjazd.`,
    });
  }

  return verdicts;
}

function cheaperName(a: ComparisonSide, b: ComparisonSide, budgets: { a: number; b: number }): string | null {
  if (budgets.a === budgets.b) return null;
  return budgets.a < budgets.b ? a.name : b.name;
}

function warmerInSummer(a: ComparisonSide, b: ComparisonSide) {
  if (!a.facts.temperature || !b.facts.temperature) return null;
  const sumA = summerAvg(a.facts.temperature.byMonth);
  const sumB = summerAvg(b.facts.temperature.byMonth);
  return { sumA, sumB, warmer: sumA === sumB ? null : sumA > sumB ? a.name : b.name };
}

function buildFaq(
  a: ComparisonSide,
  b: ComparisonSide,
  budgets: { a: number; b: number } | null,
): Array<{ question: string; answer: string }> {
  const exactFlights = bothExactFlights(a, b);
  const easier = winner(a, b, (d) => d.accessScore);
  const beach = winner(a, b, (d) => d.beachScore);
  const city = winner(a, b, (d) => d.cityScore + d.sightseeingScore);
  const summer = warmerInSummer(a, b);
  const logistics = exactFlights
    ? easier
      ? `Na prosty pierwszy wyjazd zwykle wygodniej wypada ${easier.name} (łatwiejszy dolot i logistyka z Polski). `
      : "Pod względem dolotu i logistyki z Polski oba kierunki wypadają podobnie. "
    : "";

  const faq = [
    {
      question: `${a.name} czy ${b.name} — co wybrać na pierwszy raz?`,
      answer: `${logistics}${beach ? `Jeśli zależy Ci głównie na plaży, lepszy będzie ${beach.name}` : "Pod plażę oba są porównywalne"}; ${
        city ? `jeśli na zwiedzaniu i miejskim klimacie — ${city.name}.` : "pod zwiedzanie żaden nie ma wyraźnej przewagi."
      }`,
    },
    {
      // Bez danych o klimacie pytanie nie obiecuje odpowiedzi o temperaturze.
      question: summer ? `Gdzie cieplej i lepsza plaża — ${a.name} czy ${b.name}?` : `Gdzie lepsza plaża — ${a.name} czy ${b.name}?`,
      answer:
        (beach ? `Pod kątem plaży mocniej wypada ${beach.name}.` : "Pod kątem plaży oba kierunki wypadają podobnie.") +
        (summer
          ? summer.warmer
            ? ` Latem (czerwiec-sierpień) cieplej bywa w kierunku ${summer.warmer} (${Math.max(summer.sumA, summer.sumB)}°C wobec ${Math.min(summer.sumA, summer.sumB)}°C).`
            : ` Latem oba kierunki mają podobne temperatury (ok. ${summer.sumA}°C).`
          : ""),
    },
    {
      question: `Co lepsze na zwiedzanie i city break — ${a.name} czy ${b.name}?`,
      answer: city
        ? `${city.name} ma mocniejszy profil miejski i więcej do zwiedzania, więc lepiej sprawdzi się przy planie pełnym atrakcji i spacerów po mieście.`
        : "Oba kierunki mają podobny profil miejski — o wyborze zdecydują raczej konkretne atrakcje i termin.",
    },
  ];

  if (budgets) {
    const cheaper = cheaperName(a, b, budgets);
    faq.push({
      question: `Który wyjazd jest tańszy — ${a.name} czy ${b.name}?`,
      answer: `Według orientacyjnego szacunku (lot, nocleg, jedzenie i transport dla 2 osób na 4 dni) ${
        cheaper ? `taniej zwykle wypada ${cheaper}` : "oba kierunki są w podobnym pułapie"
      }. Aktualne ceny dla swoich dat sprawdzisz w wyszukiwarce.`,
    });
  }

  if (a.facts.temperature && b.facts.temperature) {
    const monthsA = comfortableMonths(a.facts.temperature.byMonth);
    const monthsB = comfortableMonths(b.facts.temperature.byMonth);
    faq.push({
      question: "Kiedy najlepiej jechać?",
      answer: `${a.name}: najprzyjemniej ${monthsA.slice(0, 6).join(", ") || "przez cały sezon"}. ${b.name}: ${monthsB.slice(0, 6).join(", ") || "przez cały sezon"}. To miesiące z temperaturą ok. 18-30°C.`,
    });
  }

  return faq;
}

// Zwięzła, bezpośrednia odpowiedź na zapytanie „X czy Y" — pod featured snippet.
function buildQuickAnswer(a: ComparisonSide, b: ComparisonSide, budgets: { a: number; b: number } | null): string {
  const beach = winner(a, b, (d) => d.beachScore);
  const city = winner(a, b, (d) => d.cityScore + d.sightseeingScore);
  const easier = winner(a, b, (d) => d.accessScore);
  const summer = warmerInSummer(a, b);

  const beachPart = beach
    ? `Na plażę i wypoczynek nad morzem lepszy jest ${beach.name}`
    : "Pod plażę i wypoczynek nad morzem oba kierunki wypadają podobnie";
  const cityPart = city ? `a na zwiedzanie i miejski klimat — ${city.name}` : "a pod zwiedzanie żaden nie ma wyraźnej przewagi";
  const accessPart = bothExactFlights(a, b)
    ? easier
      ? `najprostszy dolot z Polski ma ${easier.name}`
      : "dolot z Polski jest porównywalny"
    : null;

  let answer = `${a.name} czy ${b.name}? ${beachPart}, ${cityPart}.`;
  if (budgets) {
    const cheaper = cheaperName(a, b, budgets);
    const budgetPart = cheaper ? `Taniej zwykle wychodzi ${cheaper}` : "Budżetowo oba kierunki są podobne";
    answer += accessPart ? ` ${budgetPart}, a ${accessPart}.` : ` ${budgetPart}.`;
  } else if (accessPart) {
    answer += ` ${accessPart.charAt(0).toUpperCase()}${accessPart.slice(1)}.`;
  }
  if (summer?.warmer) answer += ` Latem cieplej bywa w kierunku ${summer.warmer}.`;
  return answer;
}

/** Które sekcje z liczbami strona porównania może pokazać (tytuł i opis obiecują tylko je). */
export function comparisonCoverage(a: DestinationProfile, b: DestinationProfile): { climate: boolean; budget: boolean } {
  const factsA = getDestinationSeoFacts(a);
  const factsB = getDestinationSeoFacts(b);
  return {
    climate: Boolean(factsA.temperature && factsB.temperature),
    budget: canShowBudgetEstimate(factsA) && canShowBudgetEstimate(factsB),
  };
}

export function buildComparisonModel(input: ComparisonModelInput): ComparisonModel {
  const { pair, baseUrl } = input;
  const factsA = getDestinationSeoFacts(input.a);
  const factsB = getDestinationSeoFacts(input.b);
  const a: ComparisonSide = { profile: input.a, facts: factsA, name: pair.labelA ?? factsA.name };
  const b: ComparisonSide = { profile: input.b, facts: factsB, name: pair.labelB ?? factsB.name };
  const exactFlights = bothExactFlights(a, b);

  const budgets =
    canShowBudgetEstimate(factsA) && canShowBudgetEstimate(factsB) ? { a: budget(input.a), b: budget(input.b) } : null;

  const rows: ComparisonRow[] = [];
  if (factsA.flight && factsB.flight) {
    rows.push({ label: "Lot z Polski (h)", av: flightCell(factsA.flight), bv: flightCell(factsB.flight) });
  }
  if (factsA.temperature && factsB.temperature) {
    const ta = factsA.temperature.byMonth;
    const tb = factsB.temperature.byMonth;
    rows.push(
      { label: "Średnia roczna temperatura", av: `${avgYear(ta)}°C`, bv: `${avgYear(tb)}°C` },
      { label: "Lato (cze-sie)", av: `${summerAvg(ta)}°C`, bv: `${summerAvg(tb)}°C` },
      { label: "Zima (gru-lut)", av: `${winterAvg(ta)}°C`, bv: `${winterAvg(tb)}°C` },
    );
  }
  if (budgets) {
    rows.push({
      label: "Budżet 2 os. / 4 dni",
      av: `~${budgets.a.toLocaleString("pl-PL")} PLN`,
      bv: `~${budgets.b.toLocaleString("pl-PL")} PLN`,
    });
  }
  rows.push(
    { label: "Profil plażowy", av: `${Math.round(input.a.beachScore * 100)}/100`, bv: `${Math.round(input.b.beachScore * 100)}/100` },
    { label: "City break", av: `${Math.round(input.a.cityScore * 100)}/100`, bv: `${Math.round(input.b.cityScore * 100)}/100` },
    {
      label: "Zwiedzanie",
      av: `${Math.round(input.a.sightseeingScore * 100)}/100`,
      bv: `${Math.round(input.b.sightseeingScore * 100)}/100`,
    },
  );
  if (exactFlights) {
    rows.push({
      label: "Dolot/dostępność",
      av: `${Math.round(input.a.accessScore * 100)}/100`,
      bv: `${Math.round(input.b.accessScore * 100)}/100`,
    });
  }

  const whenToGo: ComparisonWhenToGo[] = [];
  const missingClimate: ComparisonSide[] = [];
  for (const side of [a, b]) {
    const temps = side.facts.temperature?.byMonth;
    if (temps) {
      whenToGo.push({ side, months: comfortableMonths(temps), summerAvg: summerAvg(temps), winterAvg: winterAvg(temps) });
    } else {
      missingClimate.push(side);
    }
  }

  const faq = buildFaq(a, b, budgets);
  const pageUrl = `${baseUrl}/porownanie/${pair.slug}`;

  return {
    a,
    b,
    rows,
    scoreNote: exactFlights ? PROFILE_SCORE_NOTE_WITH_ACCESS : PROFILE_SCORE_NOTE,
    verdicts: buildVerdicts(a, b, budgets),
    faq,
    quickAnswer: buildQuickAnswer(a, b, budgets),
    whenToGo,
    missingClimate,
    budget: budgets,
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
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
            { "@type": "ListItem", position: 2, name: "Kierunki", item: `${baseUrl}/kierunki` },
            { "@type": "ListItem", position: 3, name: `${a.name} vs ${b.name}`, item: pageUrl },
          ],
        },
        {
          "@type": "FAQPage",
          mainEntity: faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        },
      ],
    },
  };
}
