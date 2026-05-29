import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { getDestinationGuideBySlug } from "@/lib/mvp/publisher-content";
import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import {
  getMonthIndex,
  isPolishMonthSlug,
  polishMonthLabels,
  polishMonthInflected,
  polishMonthSlugs,
  type PolishMonthSlug,
} from "@/lib/mvp/months";
import { getSiteUrl } from "@/lib/mvp/site";
import { AviasalesCta } from "@/components/affiliate/aviasales-cta";
import { addDaysToIsoDate, defaultTravelStartDate } from "@/lib/mvp/travel-dates";

export const revalidate = 86400;

interface PageProps {
  params: Promise<{ slug: string; miesiac: string }>;
}

export async function generateStaticParams() {
  const destinations = getAllDestinationProfiles();
  return destinations.flatMap((destination) =>
    polishMonthSlugs.map((miesiac) => ({ slug: destination.slug, miesiac })),
  );
}

function estimateBudgetForMonth(costIndex: number, flightHours: number, monthIndex: number) {
  const days = 4;
  const travelers = 2;
  const peakMonths = [5, 6, 7];
  const seasonalMultiplier = peakMonths.includes(monthIndex) ? 1.18 : monthIndex === 11 || monthIndex === 0 ? 1.06 : 0.96;
  const flightBasePerPerson = (380 + flightHours * 70) * seasonalMultiplier;
  const stayPerDayPerPerson = 170 * costIndex * (peakMonths.includes(monthIndex) ? 1.12 : 1);
  const localPerDay = 65 * costIndex;
  const total = travelers * flightBasePerPerson + travelers * days * stayPerDayPerPerson + days * localPerDay;
  return { min: Math.round(total * 0.9), max: Math.round(total * 1.18) };
}

function describeWeather(temp: number) {
  if (temp >= 27) return "bardzo ciepło, często upały w środku dnia";
  if (temp >= 22) return "ciepło, komfortowo na zwiedzanie i plażę";
  if (temp >= 17) return "łagodnie, idealnie na chodzenie i tarasy";
  if (temp >= 12) return "chłodno, ale przyjemnie na spacer i kawiarnie";
  if (temp >= 6) return "zimno, warto mieć cieplejszą warstwę";
  return "zimno, często wymaga kurtki zimowej";
}

function suitabilityVerdict(temp: number, beachScore: number) {
  if (temp >= 22 && beachScore >= 0.7) return "Tak — to jeden z lepszych terminów na ten kierunek.";
  if (temp >= 18) return "Tak — komfortowy termin na city break i sensowne zwiedzanie.";
  if (temp >= 12) return "Warto, jeśli akceptujesz chłodniejszą pogodę i nie liczysz na plażę.";
  return "Możliwe, ale to nie najmocniejszy termin — lepiej traktować jako city break poza sezonem.";
}

// SEO title format (tested 2026-05-28): match informational intent ("pogoda")
// + add a numeric commercial hook ("hotele od X zł"). Year token "2026"
// signals freshness — Google preferences fresh content for travel queries.
// Length budget ~60 chars before " | HelpTravel" tail.
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, miesiac } = await params;
  if (!isPolishMonthSlug(miesiac)) return { title: "Kierunek" };
  const guide = getDestinationGuideBySlug(slug);
  if (!guide) return { title: "Kierunek" };

  const monthIndex = getMonthIndex(miesiac);
  const temp = guide.destination.avgTempByMonth[monthIndex];
  const monthInfl = polishMonthInflected[miesiac];
  const monthLabel = polishMonthLabels[miesiac];
  const budget = estimateBudgetForMonth(
    guide.destination.costIndex,
    guide.destination.typicalFlightHoursFromPL,
    monthIndex,
  );
  // "od X zł" hook — we don't have live LiteAPI prices at static-build
  // time, so we use the modeled budget as a lower bound. The budget is per
  // 2 osoby / 4 dni, so an "od /noc" estimate ≈ budget.min / 4 / 2 hotels
  // → rough but trustworthy. Future: swap to live cached LiteAPI median.
  const hotelFromPln = Math.round(budget.min / 4 / 2);
  const year = new Date().getFullYear();

  const title = `${guide.destination.city} w ${monthInfl} ${year}: pogoda ${temp}°C, hotele od ${hotelFromPln} zł`;
  const description = `Jaka jest pogoda w ${guide.destination.city} w ${monthInfl}? Średnia temperatura ${temp}°C, orientacyjny budżet 2 osób na 4 dni ${budget.min}-${budget.max} zł. Sprawdź konkretne hotele i loty w PLN — bez ukrytych opłat.`;

  return {
    title,
    description,
    alternates: { canonical: `/kierunki/${slug}/${miesiac}` },
    openGraph: {
      title: `${guide.destination.city} w ${monthInfl} ${year} — pogoda i hotele od ${hotelFromPln} zł`,
      description,
      url: `${getSiteUrl()}/kierunki/${slug}/${miesiac}`,
      type: "article",
      locale: "pl_PL",
    },
    other: {
      // Helps Google identify travel-related freshness signals.
      "article:section": `Kierunki - ${monthLabel}`,
      "article:tag": `${guide.destination.city}, ${guide.destination.country}, pogoda, hotele`,
    },
  };
}

export default async function MonthlyDestinationPage({ params }: PageProps) {
  const { slug, miesiac } = await params;
  if (!isPolishMonthSlug(miesiac)) notFound();
  const guide = getDestinationGuideBySlug(slug);
  if (!guide) notFound();

  const monthSlug = miesiac as PolishMonthSlug;
  const monthIndex = getMonthIndex(monthSlug);
  const monthLabel = polishMonthLabels[monthSlug];
  const monthInfl = polishMonthInflected[monthSlug];
  const temp = guide.destination.avgTempByMonth[monthIndex];
  const yearTemps = guide.destination.avgTempByMonth;
  const yearMin = Math.min(...yearTemps);
  const yearMax = Math.max(...yearTemps);
  const tempPosition = temp >= yearMax - 2 ? "wysokie" : temp <= yearMin + 2 ? "niskie" : "średnie";
  const budget = estimateBudgetForMonth(
    guide.destination.costIndex,
    guide.destination.typicalFlightHoursFromPL,
    monthIndex,
  );
  const verdict = suitabilityVerdict(temp, guide.destination.beachScore);
  const weather = describeWeather(temp);
  const baseUrl = getSiteUrl();
  const affiliateCampaign = `month-${slug}-${monthSlug}`;
  const startDate = defaultTravelStartDate();
  const checkout = addDaysToIsoDate(startDate, 4);
  const internalHotelHref = `/hotele/szukaj?${new URLSearchParams({
    destination: guide.destination.city,
    country: guide.destination.country,
    checkin: startDate,
    checkout,
    adults: "2",
    rooms: "1",
  }).toString()}`;

  // Hotel "from" price for snippets — derived from our budget model
  // (per 2 osoby / 4 dni). Conservative lower bound so we don't over-promise.
  const hotelFromPln = Math.round(budget.min / (4 * 2));
  const year = new Date().getFullYear();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: `${guide.destination.city} w ${monthInfl} ${year} — pogoda, hotele i kiedy lecieć`,
        description: `Pogoda w ${guide.destination.city} w ${monthInfl} (śr. ${temp}°C), orientacyjny budżet 2 osób na 4 dni: ${budget.min}-${budget.max} zł. Bezpośrednie przejście do hoteli i lotów w PLN.`,
        url: `${baseUrl}/kierunki/${slug}/${monthSlug}`,
        inLanguage: "pl-PL",
        datePublished: "2026-01-01T00:00:00.000Z",
        dateModified: new Date().toISOString(),
        author: { "@type": "Organization", "@id": `${baseUrl}/#organization`, name: "HelpTravel" },
        publisher: { "@id": `${baseUrl}/#organization` },
        about: { "@type": "TouristDestination", name: `${guide.destination.city}, ${guide.destination.country}` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: "Kierunki", item: `${baseUrl}/kierunki` },
          { "@type": "ListItem", position: 3, name: guide.destination.city, item: `${baseUrl}/kierunki/${slug}` },
          { "@type": "ListItem", position: 4, name: `${guide.destination.city} w ${monthInfl}`, item: `${baseUrl}/kierunki/${slug}/${monthSlug}` },
        ],
      },
      // Offer schema — lets Google show "od X zł" pricing badge in SERP
      // (rich snippet eligibility). priceRange covers the conservative
      // budget model min/max for 2 osoby / 4 dni. Pricing is informational
      // (no SKU/Product) — Google accepts loose Offer for TouristDestination.
      {
        "@type": "Offer",
        url: `${baseUrl}/kierunki/${slug}/${monthSlug}`,
        priceCurrency: "PLN",
        price: hotelFromPln,
        priceValidUntil: `${year + 1}-12-31`,
        availability: "https://schema.org/InStock",
        itemOffered: {
          "@type": "LodgingReservation",
          name: `Hotel w ${guide.destination.city} (${monthInfl} ${year})`,
        },
        seller: { "@id": `${baseUrl}/#organization` },
      },
      // FAQ schema — boosts SERP CTR via rich-result expandable answers.
      // 4 questions answer the most common informational queries we already
      // rank for ("X pogoda Y", "X w Y").
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: `Jaka pogoda jest w ${guide.destination.city} w ${monthInfl}?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `W ${guide.destination.city} w ${monthInfl} średnia temperatura wynosi ${temp}°C — ${weather}. ${verdict}`,
            },
          },
          {
            "@type": "Question",
            name: `Ile kosztuje wyjazd do ${guide.destination.city} w ${monthInfl}?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `Orientacyjny budżet dla 2 osób na 4 dni w ${guide.destination.city} w ${monthInfl} to ${budget.min}-${budget.max} zł. Obejmuje loty z Polski, nocleg, jedzenie i transport lokalny. Hotele od ok. ${hotelFromPln} zł za noc.`,
            },
          },
          {
            "@type": "Question",
            name: `Czy warto lecieć do ${guide.destination.city} w ${monthInfl}?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: verdict,
            },
          },
          {
            "@type": "Question",
            name: `Jak długo trwa lot z Polski do ${guide.destination.city}?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `Lot z Polski do ${guide.destination.city} zajmuje około ${guide.destination.typicalFlightHoursFromPL.toFixed(1)} h.`,
            },
          },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <Script id={`monthly-${slug}-${monthSlug}-jsonld`} type="application/ld+json">
        {JSON.stringify(structuredData)}
      </Script>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_20px_60px_rgba(16,84,48,0.06)]">
        <Breadcrumbs
          items={[
            { label: "Start", href: "/" },
            { label: "Kierunki", href: "/kierunki" },
            { label: guide.destination.city, href: `/kierunki/${slug}` },
            { label: `${monthLabel}` },
          ]}
        />
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
          Wyjazd w {monthInfl}
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[0.95] text-emerald-950">
          {guide.destination.city} w {monthInfl} — pogoda {temp}°C, hotele i kiedy lecieć
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Konkretne dane: średnia temperatura, orientacyjny budżet 2 osób na 4 dni, kiedy warto lecieć
          i bezpośrednie przejście do hoteli z cenami w PLN.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Średnia temperatura</p>
            <p className="mt-1 text-3xl font-bold text-emerald-950">{temp}°C</p>
            <p className="mt-1 text-xs text-emerald-900/70">{weather}</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Pozycja w roku</p>
            <p className="mt-1 text-3xl font-bold text-emerald-950 capitalize">{tempPosition}</p>
            <p className="mt-1 text-xs text-emerald-900/70">Roczny zakres: {yearMin}-{yearMax}°C</p>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Budżet 2 os / 4 dni</p>
            <p className="mt-1 text-2xl font-bold text-emerald-950">
              {budget.min.toLocaleString("pl-PL")}-{budget.max.toLocaleString("pl-PL")} PLN
            </p>
            <p className="mt-1 text-xs text-emerald-900/70">Loty, nocleg, jedzenie, transport.</p>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="font-display text-3xl text-emerald-950">Czy warto lecieć do {guide.destination.city} w {monthInfl}?</h2>
        <p className="mt-3 max-w-3xl text-base leading-8 text-emerald-900/80">{verdict}</p>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-900/72">{guide.overview}</p>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-emerald-50/72 p-6">
        <h2 className="font-display text-3xl text-emerald-950">Pogoda w {guide.destination.city} w ciagu roku</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {polishMonthSlugs.map((m, idx) => {
            const t = yearTemps[idx];
            const isCurrent = m === monthSlug;
            return (
              <Link
                key={m}
                href={`/kierunki/${slug}/${m}`}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                  isCurrent
                    ? "border-emerald-700 bg-white font-semibold text-emerald-950"
                    : "border-emerald-900/10 bg-white/72 text-emerald-900 hover:border-emerald-500/40 hover:bg-white"
                }`}
              >
                <span className="capitalize">{polishMonthLabels[m]}</span>
                <span className="font-semibold">{t}°C</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 2-CTA block per master spec section 2: hotele (internal LiteAPI) + loty (Aviasales). */}
      <section className="grid gap-5 lg:grid-cols-2">
        <article className="flex flex-col justify-between rounded-[1.8rem] border border-emerald-900/10 bg-emerald-700 p-6 text-white shadow-[0_18px_42px_rgba(7,31,18,0.18)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Hotele</p>
            <h2 className="mt-2 font-display text-3xl leading-tight">
              Sprawdź hotele w {guide.destination.city} na ten termin
            </h2>
            <p className="mt-3 text-sm leading-7 text-emerald-50/85">
              Ceny w PLN, finalna płatność u dostawcy. Bez wychodzenia ze strony.
            </p>
          </div>
          <Link
            href={internalHotelHref}
            className="mt-5 inline-flex w-fit items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-bold text-emerald-900 transition hover:bg-emerald-100"
          >
            Sprawdź hotele
          </Link>
        </article>
        <AviasalesCta
          city={guide.destination.city}
          country={guide.destination.country}
          campaign={affiliateCampaign}
          flightHours={guide.destination.typicalFlightHoursFromPL}
        />
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="font-display text-3xl text-emerald-950">Co dalej</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/kierunki/${slug}`}
            className="rounded-full border border-emerald-900/10 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
          >
            Pełny przewodnik po {guide.destination.city}
          </Link>
          <Link
            href={internalHotelHref}
            className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            Sprawdź hotele i loty
          </Link>
          <Link
            href="/kierunki"
            className="rounded-full border border-emerald-900/10 bg-white px-5 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50"
          >
            Zobacz wszystkie kierunki
          </Link>
        </div>
      </section>
    </main>
  );
}
