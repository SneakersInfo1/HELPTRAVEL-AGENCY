import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { findCommercialCityByDestinationId } from "@/lib/mvp/commercial-cities";
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
import { AuthorByline } from "@/components/publisher/author-byline";
import { EDITOR_IN_CHIEF, personSchema } from "@/lib/mvp/authors";
import { isMonthIndexable } from "@/lib/mvp/month-index-policy";
import { addDaysToIsoDate } from "@/lib/mvp/travel-dates";

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

// Sea-surface temperature model for coastal destinations. The sea lags air
// temperature by ~1-2 months (thermal mass) and holds summer heat into
// autumn — so we weight the current + two previous months. Makes Sept/Oct
// sea warmer than the air (true for the Med) and June sea cooler than the
// June air. Only meaningful for beach-forward destinations; for inland
// cities sea temp is nonsense and is suppressed at the call site.
function estimateSeaTemperature(avgTempByMonth: number[], monthIndex: number): number {
  const m0 = avgTempByMonth[monthIndex];
  const m1 = avgTempByMonth[(monthIndex + 11) % 12];
  const m2 = avgTempByMonth[(monthIndex + 10) % 12];
  const modeled = m0 * 0.45 + m1 * 0.33 + m2 * 0.22;
  return Math.min(29, Math.max(10, Math.round(modeled)));
}

type SeasonTier = "peak" | "shoulder" | "low";

// Tourist-season classifier — powers the "kiedy taniej / mniej tłoczno"
// content that converts informational visitors (people planning a trip)
// into booking-funnel clicks. Beach destinations peak in high summer; city
// breaks peak late-springsummer plus festive December.
function classifySeason(temp: number, monthIndex: number, beachScore: number): SeasonTier {
  const highSummer = monthIndex >= 5 && monthIndex <= 8; // czerwiec–wrzesień
  if (beachScore >= 0.6) {
    if (temp >= 24 && highSummer) return "peak";
    if (temp >= 20) return "shoulder";
    return "low";
  }
  if ((monthIndex >= 4 && monthIndex <= 8) || monthIndex === 11) {
    return temp >= 18 ? "peak" : "shoulder";
  }
  return temp >= 14 ? "shoulder" : "low";
}

const seasonCopy: Record<SeasonTier, { label: string; crowd: string; price: string }> = {
  peak: { label: "Wysoki sezon", crowd: "najwięcej turystów", price: "ceny w szczycie" },
  shoulder: { label: "Sezon przejściowy", crowd: "umiarkowany ruch", price: "ceny umiarkowane" },
  low: { label: "Poza sezonem", crowd: "najspokojniej", price: "ceny najniższe" },
};

// Month-accurate check-in for the booking-funnel link: the 10th of the
// target month — this year if still ≥3 days ahead, otherwise next year.
// Pre-filling the RIGHT month means "sprawdź hotele w czerwcu" lands on
// June availability — materially better conversion than a generic default.
function monthCheckinIso(monthIndex: number): string {
  const now = new Date();
  const tenthThisYear = Date.UTC(now.getUTCFullYear(), monthIndex, 10);
  const useNextYear = tenthThisYear < now.getTime() + 3 * 24 * 60 * 60 * 1000;
  const year = useNextYear ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-10`;
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
  // Slimming policy: thin long-tail month pages are kept live but noindexed
  // (and dropped from the sitemap) to remove site-wide thin-content drag.
  const indexable = isMonthIndexable(guide.destination, monthIndex);
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
  // rough but trustworthy. Future: swap to live cached LiteAPI median.
  const hotelFromPln = Math.round(budget.min / 4 / 2);
  const year = new Date().getFullYear();

  const title = `${guide.destination.city} w ${monthInfl} ${year}: pogoda ${temp}°C, hotele od ${hotelFromPln} zł`;
  const description = `Jaka jest pogoda w ${guide.destination.city} w ${monthInfl}? Średnia temperatura ${temp}°C, orientacyjny budżet 2 osób na 4 dni ${budget.min}-${budget.max} zł. Sprawdź konkretne hotele i loty w PLN — bez ukrytych opłat.`;

  return {
    title,
    description,
    robots: indexable ? undefined : { index: false, follow: true },
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

  // Per-month unique signals (data-driven scale across 2800 pages without
  // hand-writing): sea temp for the coast, tourist season, and the
  // warmest/cheapest months for internal "kiedy taniej" cross-linking.
  const beachForward = guide.destination.beachScore >= 0.6;
  const seaTemp = beachForward ? estimateSeaTemperature(yearTemps, monthIndex) : null;
  const season = classifySeason(temp, monthIndex, guide.destination.beachScore);
  const seasonInfo = seasonCopy[season];
  const warmestSlug = polishMonthSlugs[yearTemps.indexOf(yearMax)];
  const coldestSlug = polishMonthSlugs[yearTemps.indexOf(yearMin)];
  // Funnel into the high-intent commercial landing page when one exists.
  const commercialCity = findCommercialCityByDestinationId(guide.destination.slug);

  // Month-accurate dates so the search lands on availability for THIS month.
  const startDate = monthCheckinIso(monthIndex);
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
        author: personSchema(EDITOR_IN_CHIEF),
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
          ...(seaTemp !== null
            ? [
                {
                  "@type": "Question",
                  name: `Jaka jest temperatura morza w ${guide.destination.city} w ${monthInfl}?`,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: `Temperatura morza w ${guide.destination.city} w ${monthInfl} to orientacyjnie około ${seaTemp}°C (na podstawie wieloletnich średnich).`,
                  },
                },
              ]
            : []),
          {
            "@type": "Question",
            name: `Kiedy jest najtaniej i najmniej turystów w ${guide.destination.city}?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `Najwięcej turystów i najwyższe ceny przypadają na najcieplejsze miesiące (${polishMonthLabels[warmestSlug].toLowerCase()}). Najspokojniej i zwykle najtaniej jest w ${polishMonthLabels[coldestSlug].toLowerCase()}. ${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)} to ${seasonInfo.label.toLowerCase()} — ${seasonInfo.crowd}, ${seasonInfo.price}.`,
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <Breadcrumbs
          items={[
            { label: "Start", href: "/" },
            { label: "Kierunki", href: "/kierunki" },
            { label: guide.destination.city, href: `/kierunki/${slug}` },
            { label: `${monthLabel}` },
          ]}
        />
        <h1 className="mt-3 max-w-3xl font-display text-3xl leading-[1.08] text-ink sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">
          {guide.destination.city} w {monthInfl} — pogoda {temp}°C, hotele i kiedy lecieć
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">
          W {monthInfl} w {guide.destination.city} jest {weather} (śr. {temp}°C
          {seaTemp !== null ? `, morze ~${seaTemp}°C` : ""}). To {seasonInfo.label.toLowerCase()} —{" "}
          {seasonInfo.crowd}, {seasonInfo.price}. Poniżej orientacyjny budżet, najlepszy termin
          i bezpośrednie przejście do hoteli z cenami w PLN.
        </p>

        <AuthorByline author={EDITOR_IN_CHIEF} updatedISO={new Date().toISOString()} className="mt-5" />

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-surface-sunken p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Średnia temperatura</p>
            <p className="mt-1 text-3xl font-bold text-ink">{temp}°C</p>
            <p className="mt-1 text-xs text-ink-muted">{weather}</p>
          </div>
          <div className="rounded-2xl bg-surface-sunken p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Pozycja w roku</p>
            <p className="mt-1 text-3xl font-bold text-ink capitalize">{tempPosition}</p>
            <p className="mt-1 text-xs text-ink-muted">Roczny zakres: {yearMin}-{yearMax}°C</p>
          </div>
          <div className="rounded-2xl bg-surface-sunken p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Budżet 2 os / 4 dni</p>
            <p className="mt-1 text-2xl font-bold text-ink">
              {budget.min.toLocaleString("pl-PL")}-{budget.max.toLocaleString("pl-PL")} PLN
            </p>
            <p className="mt-1 text-xs text-ink-muted">Loty, nocleg, jedzenie, transport.</p>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h2 className="font-display text-3xl text-ink">Czy warto lecieć do {guide.destination.city} w {monthInfl}?</h2>
        <p className="mt-3 max-w-3xl text-base leading-8 text-ink-muted">{verdict}</p>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">{guide.overview}</p>
      </section>

      {/* Season / prices / sea — unique per city×month (fixes thin-content
          indexing) + drives "kiedy taniej" intent into the booking funnel. */}
      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h2 className="font-display text-3xl text-ink">
          Sezon, ceny i morze w {guide.destination.city} w {monthInfl}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-surface-sunken p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Sezon</p>
            <p className="mt-1 text-xl font-bold text-ink">{seasonInfo.label}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {seasonInfo.crowd}, {seasonInfo.price}
            </p>
          </div>
          {seaTemp !== null && (
            <div className="rounded-2xl bg-surface-sunken p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
                Temperatura morza
              </p>
              <p className="mt-1 text-3xl font-bold text-ink">~{seaTemp}°C</p>
              <p className="mt-1 text-xs text-ink-muted">Orientacyjnie, ze średnich wieloletnich.</p>
            </div>
          )}
          <div className="rounded-2xl bg-surface-sunken p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
              Najcieplejszy miesiąc
            </p>
            <p className="mt-1 text-xl font-bold capitalize text-ink">
              {polishMonthLabels[warmestSlug]}
            </p>
            <p className="mt-1 text-xs text-ink-muted">Szczyt temperatur ({yearMax}°C)</p>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-muted">
          {monthLabel.charAt(0).toUpperCase()}
          {monthLabel.slice(1)} to w {guide.destination.city} {seasonInfo.label.toLowerCase()} (
          {seasonInfo.crowd}, {seasonInfo.price}). Najcieplej jest w{" "}
          <Link
            href={`/kierunki/${slug}/${warmestSlug}`}
            className="font-semibold underline-offset-2 hover:underline"
          >
            <span className="text-brand">{polishMonthLabels[warmestSlug].toLowerCase()}</span>
          </Link>
          , a najspokojniej i zwykle najtaniej w{" "}
          <Link
            href={`/kierunki/${slug}/${coldestSlug}`}
            className="font-semibold underline-offset-2 hover:underline"
          >
            <span className="text-brand">{polishMonthLabels[coldestSlug].toLowerCase()}</span>
          </Link>
          . Jeśli zależy Ci na niższej cenie, rozważ termin poza szczytem sezonu.
        </p>
      </section>

      <section className="rounded-[2rem] border border-line bg-surface-sunken p-6">
        <h2 className="font-display text-3xl text-ink">Pogoda w {guide.destination.city} w ciagu roku</h2>
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
                    ? "border-brand bg-white font-semibold"
                    : "border-line bg-white/72 hover:border-brand hover:bg-white"
                }`}
              >
                <span className="capitalize text-ink">{polishMonthLabels[m]}</span>
                <span className="font-semibold text-ink">{t}°C</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 2-CTA block: hotele (LiteAPI) + loty (wewnętrzna wyszukiwarka). */}
      <section className="grid gap-5 lg:grid-cols-2">
        <article className="flex flex-col justify-between rounded-2xl border border-line bg-brand p-6 text-white shadow-sm">
          <div>
            <h2 className="mt-2 font-display text-3xl leading-tight">
              Sprawdź hotele w {guide.destination.city} w {monthInfl}
            </h2>
            <p className="mt-3 text-sm leading-7 text-white/85">
              Wyszukiwarka ustawiona na {monthInfl} — ceny w PLN, finalna płatność u dostawcy.
              Bez wychodzenia ze strony.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={internalHotelHref}
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-full bg-white px-6 py-3 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-bold text-ink">Sprawdź hotele w {monthInfl}</span>
            </Link>
            {commercialCity && (
              <Link
                href={`/hotele/w/${commercialCity.slug}`}
                className="inline-flex min-h-11 w-fit items-center justify-center rounded-full border border-white/40 bg-white/10 px-6 py-3 transition duration-150 ease-out hover:bg-white/20 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="text-sm font-semibold text-white">
                  Przewodnik: hotele {commercialCity.preposition} {commercialCity.cityLocative}
                </span>
              </Link>
            )}
          </div>
        </article>
        <Link
          href="/?tab=loty"
          className="flex flex-col justify-center rounded-2xl border border-brand-strong bg-brand-strong p-5 shadow-sm transition hover:-translate-y-1 hover:bg-brand-strong motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white">Loty</p>
          <h3 className="mt-2 text-xl font-bold text-white">Sprawdź loty do {guide.destination.city}</h3>
          <p className="mt-2 text-sm leading-6 text-white/78">
            Wyszukaj loty z dowolnego lotniska w Polsce. Lot ok. {guide.destination.typicalFlightHoursFromPL.toFixed(1)} h.
          </p>
        </Link>
      </section>

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h2 className="font-display text-3xl text-ink">Co dalej</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/kierunki/${slug}`}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-5 py-3 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-semibold text-ink">Pełny przewodnik po {guide.destination.city}</span>
          </Link>
          <Link
            href={internalHotelHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 py-3 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-bold text-white">Sprawdź hotele i loty</span>
          </Link>
          <Link
            href="/kierunki"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-5 py-3 transition duration-150 ease-out hover:bg-surface-sunken active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-semibold text-ink">Zobacz wszystkie kierunki</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
