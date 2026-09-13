import { inMonthPhrase, polishMonthLabels, type PolishMonthSlug } from "@/lib/mvp/months";

// JSON-LD strony /kierunki/[slug]/[miesiac].
//
// Bez `Offer`: do 2026-09 stał tu Offer z ceną z modelu budżetu (estimateBudget)
// i `priceValidUntil` na koniec przyszłego roku — na 1747 stronach. To nie była
// oferta: brak terminu, brak dostępności, kwota policzona ze wzoru. Bez kwot
// także w opisie i FAQ — dane strukturalne mówią o cenie maszynie, która
// pokazuje ją użytkownikowi przed kliknięciem.

export interface MonthPageSchemaInput {
  baseUrl: string;
  destinationSlug: string;
  month: PolishMonthSlug;
  city: string;
  country: string;
  tempC: number;
  weather: string;
  verdict: string;
  seaTempC: number | null;
  warmestMonth: PolishMonthSlug;
  coldestMonth: PolishMonthSlug;
  season: { label: string; crowd: string; price: string };
  flightHours: number;
  author: Record<string, unknown>;
  nowIso: string;
}

function question(name: string, text: string) {
  return { "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } };
}

export function buildMonthPageStructuredData(input: MonthPageSchemaInput) {
  const { baseUrl, destinationSlug, month, city, country, tempC, weather, verdict, seaTempC, season, flightHours } = input;
  const inMonth = inMonthPhrase(month);
  const pageUrl = `${baseUrl}/kierunki/${destinationSlug}/${month}`;
  const monthLabel = polishMonthLabels[month];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: `${city} ${inMonth} — pogoda, hotele i kiedy lecieć`,
        description: `Pogoda w ${city} ${inMonth} (śr. ${tempC}°C), sezon i najlepszy termin. Bezpośrednie przejście do hoteli i lotów w PLN.`,
        url: pageUrl,
        inLanguage: "pl-PL",
        datePublished: "2026-01-01T00:00:00.000Z",
        dateModified: input.nowIso,
        author: input.author,
        publisher: { "@id": `${baseUrl}/#organization` },
        about: { "@type": "TouristDestination", name: `${city}, ${country}` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: "Kierunki", item: `${baseUrl}/kierunki` },
          { "@type": "ListItem", position: 3, name: city, item: `${baseUrl}/kierunki/${destinationSlug}` },
          { "@type": "ListItem", position: 4, name: `${city} ${inMonth}`, item: pageUrl },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          question(`Jaka pogoda jest w ${city} ${inMonth}?`, `W ${city} ${inMonth} średnia temperatura wynosi ${tempC}°C — ${weather}. ${verdict}`),
          question(`Czy warto lecieć do ${city} ${inMonth}?`, verdict),
          ...(seaTempC !== null
            ? [
                question(
                  `Jaka jest temperatura morza w ${city} ${inMonth}?`,
                  `Temperatura morza w ${city} ${inMonth} to orientacyjnie około ${seaTempC}°C (na podstawie wieloletnich średnich).`,
                ),
              ]
            : []),
          question(
            `Kiedy jest najtaniej i najmniej turystów w ${city}?`,
            `Najwięcej turystów i najwyższe ceny przypadają na najcieplejsze miesiące (${polishMonthLabels[input.warmestMonth]}). Najspokojniej i zwykle najtaniej jest ${inMonthPhrase(input.coldestMonth)}. ${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)} to ${season.label.toLowerCase()} — ${season.crowd}, ${season.price}.`,
          ),
          question(`Jak długo trwa lot z Polski do ${city}?`, `Lot z Polski do ${city} zajmuje około ${flightHours.toFixed(1)} h.`),
        ],
      },
    ],
  };
}
