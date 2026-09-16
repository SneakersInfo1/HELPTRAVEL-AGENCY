// Commercial landing pages for /hotele/w/[miasto].
//
// Targets high-volume Polish search queries like "hotele barcelona",
// "wakacje madryt", "tanie hotele rzym". Each city slug is curated in
// `lib/mvp/commercial-cities.ts` — currently top 10 cities by monthly
// search volume in PL. The page composes:
//
//   • Hero with H1 in proper Polish locative ("Hotele w Barcelonie")
//   • Hotels carousel — top 6 from LiteAPI's /data/hotels metadata
//     (cached 24h via Next Data Cache, ~10ms warm)
//   • Why-us block (trust signals: PLN pricing, free cancellation, etc.)
//   • Best-time-to-visit panel from our destinations.ts climate data
//   • FAQ schema (5 questions) — boosts SERP rich snippets
//   • Internal linking cluster: links to /kierunki/[slug], the season
//     best-of pages, and other commercial city pages
//
// Why static `/hotele/w/[miasto]` and not `/hotele/[city]`: the existing
// `/hotele/[hotelId]` dynamic segment owns the second slot — Next.js
// resolves static-first, so putting the city under `/hotele/w/` (Polish
// preposition "w") naturally separates URL hierarchy AND matches the
// search-query phrasing ("hotele w X").

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";

import { AuthorByline } from "@/components/publisher/author-byline";
import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { TrackView } from "@/components/analytics/track-view";
import { commercialCities, findCommercialCityBySlug, type CommercialCity } from "@/lib/mvp/commercial-cities";
import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import { fetchHotelsList } from "@/lib/liteapi/search";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { inMonthPhrase, polishMonthLabels, polishMonthSlugs } from "@/lib/mvp/months";
import { getSiteUrl } from "@/lib/mvp/site";
import { EDITOR_IN_CHIEF, personSchema } from "@/lib/mvp/authors";
import { addDaysToIsoDate, defaultTravelStartDate } from "@/lib/mvp/travel-dates";
import { buildCityHotelsFaq, buildCityHotelsStructuredData } from "@/lib/seo/city-hotels-schema";
import { exactFlightHours, formatFlightFact, getDestinationSeoFacts } from "@/lib/seo/destination-facts";
import { cityHotelsPageText } from "@/lib/seo/page-titles";
import { SHELL_DISCOVERY } from "@/lib/ui/layout";

export const revalidate = 86400; // 24h ISR

interface PageProps {
  params: Promise<{ miasto: string }>;
}

export async function generateStaticParams() {
  return commercialCities.map((c) => ({ miasto: c.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { miasto } = await params;
  const city = findCommercialCityBySlug(miasto);
  if (!city) return { title: "Hotele" };

  // Tytuł, opis, OG i Twitter: lib/seo/page-titles.ts. Do 2026-09 tytuł miał
  // rok z zegara i „od X zł/noc" z buildBudgetEstimate — kwotę ze wzoru, a nie
  // z oferty.
  const text = cityHotelsPageText({ city });
  // "w Barcelonie" / "na Teneryfie" — preposition lives on the city record.
  const inLoc = `${city.preposition} ${city.cityLocative}`;

  return {
    title: text.title,
    description: text.description,
    keywords: [
      `hotele ${city.cityNominative}`,
      `hotele ${inLoc}`,
      `noclegi ${city.cityNominative}`,
      `wakacje ${city.cityNominative}`,
      `tanie hotele ${city.cityNominative}`,
      ...city.aliasQueries,
    ].join(", "),
    alternates: { canonical: `/hotele/w/${city.slug}` },
    openGraph: {
      title: text.ogTitle,
      description: text.description,
      url: `${getSiteUrl()}/hotele/w/${city.slug}`,
      type: "website",
      locale: "pl_PL",
    },
    twitter: {
      card: "summary_large_image",
      title: text.twitterTitle,
      description: text.twitterDescription,
    },
  };
}

// Server-side LiteAPI fetch with hard failure fallback. The page MUST
// render even if LiteAPI is down — we lose the featured-hotels carousel
// but keep the SEO content + CTA.
//
// IMPORTANT: LiteAPI expects English city/country names for /data/hotels.
// `commercialCities` has Polish nominative ("Madryt", "Stambuł"); we pivot
// to the curated profile (or catalog fallback) to grab the English name.
async function getFeaturedHotels(city: CommercialCity) {
  const profile = getAllDestinationProfiles().find((d) => d.slug === city.destinationId);
  const englishCity = profile?.city ?? city.cityNominative;
  const englishCountry = profile?.country ?? city.countryNominative;
  try {
    const list = await fetchHotelsList({
      city: englishCity,
      country: englishCountry,
      limit: 8,
    });
    return list.data ?? [];
  } catch {
    return [];
  }
}

export default async function CityHotelsLandingPage({ params }: PageProps) {
  const { miasto } = await params;
  const city = findCommercialCityBySlug(miasto);
  if (!city) notFound();

  const profile = getAllDestinationProfiles().find((d) => d.slug === city.destinationId);
  // Liczby o kierunku wyłącznie z bramki faktów (SEO Data Integrity, PR #1.5):
  // temperatura tylko kuratorowana, czas lotu kuratorowany albo oznaczony szacunek.
  // Do 2026-09 stał tu też „od X zł/noc" liczony wzorem (buildBudgetEstimate) i
  // pokazywany w hero obok „ceny w PLN" jak aktualna cena — usunięty bez zamiennika.
  const facts = profile ? getDestinationSeoFacts(profile) : null;
  const text = cityHotelsPageText({ city });
  const inLoc = `${city.preposition} ${city.cityLocative}`;
  // Direction phrase: mainland "do {dopełniacz}" (do Barcelony) vs island
  // "na {biernik}" (na Kretę). Keeps every "wyjazd/lot do X" grammatical.
  const dirPrep = city.preposition === "na" ? "na" : "do";
  const dirForm = city.preposition === "na" ? city.cityAccusative ?? city.cityNominative : city.cityGenitive;
  const media = profile
    ? await resolveDestinationMedia({
        ...profile,
        city: profile.city,
        country: profile.country,
      })
    : null;
  const featuredHotels = await getFeaturedHotels(city);
  const baseUrl = getSiteUrl();

  // Default trip dates for pre-filled search CTA.
  // /hotele/szukaj uses English city/country to hit LiteAPI directly,
  // so we pass the profile's English names where available.
  const searchCity = profile?.city ?? city.cityNominative;
  const searchCountry = profile?.country ?? city.countryNominative;
  const startDate = defaultTravelStartDate();
  const checkoutDate = addDaysToIsoDate(startDate, 4);
  const searchHref = `/hotele/szukaj?${new URLSearchParams({
    destination: searchCity,
    country: searchCountry,
    checkin: startDate,
    checkout: checkoutDate,
    adults: "2",
    rooms: "1",
  }).toString()}`;

  // Komfortowe miesiące (18-30°C) — tylko z temperatur kuratorowanych.
  const bestMonths = facts?.temperature
    ? facts.temperature.byMonth
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => t >= 18 && t <= 30)
        .map(({ i }) => polishMonthLabels[polishMonthSlugs[i]])
    : [];
  const flightText = facts?.flight ? formatFlightFact(facts.flight) : null;

  // Cross-link cluster — other commercial cities + 2 month pages for THIS
  // city (current month + 1 ahead). Internal linking distributes equity
  // across the cluster and helps Google understand the topical authority.
  // Cross-link cluster — same-country cities first (stronger topical
  // relevance + matches user intent: "po Hiszpanii" travellers), then the
  // rest. Up to 8 so the cluster scales with the city list.
  const otherCities = [...commercialCities]
    .filter((c) => c.slug !== city.slug)
    .sort((a, b) => {
      const aSame = a.countryNominative === city.countryNominative ? 0 : 1;
      const bSame = b.countryNominative === city.countryNominative ? 0 : 1;
      return aSame - bSame;
    })
    .slice(0, 8);
  const currentMonthIdx = new Date().getMonth();
  const nextMonthIdx = (currentMonthIdx + 1) % 12;
  const monthLinks = profile
    ? [
        {
          label: `${city.cityNominative} ${inMonthPhrase(polishMonthSlugs[currentMonthIdx])}`,
          href: `/kierunki/${profile.slug}/${polishMonthSlugs[currentMonthIdx]}`,
        },
        {
          label: `${city.cityNominative} ${inMonthPhrase(polishMonthSlugs[nextMonthIdx])}`,
          href: `/kierunki/${profile.slug}/${polishMonthSlugs[nextMonthIdx]}`,
        },
      ]
    : [];

  // Dane strukturalne i FAQ: lib/seo/city-hotels-schema.ts — Article, okruszki,
  // FAQ i lista hoteli. Bez Offer i bez kwot z buildBudgetEstimate.
  const faqInput = {
    city,
    flightHours: facts ? exactFlightHours(facts) : null,
    bestMonths,
  };
  const faq = buildCityHotelsFaq(faqInput);
  const structuredData = buildCityHotelsStructuredData({
    ...faqInput,
    baseUrl,
    featuredHotels,
    heroImage: media?.heroImage,
    author: personSchema(EDITOR_IN_CHIEF),
  });

  return (
    <main className={`flex w-full flex-1 flex-col gap-8 py-6 ${SHELL_DISCOVERY}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <TrackView
        event="landing_view"
        params={{ city_slug: city.slug, monthly_volume: city.monthlySearchVolumePL }}
      />

      {/* HERO */}
      <section className="overflow-hidden rounded-[2rem] border border-line bg-surface-raised shadow-sm">
        {/* min-h + flex/justify-end (not a fixed height with absolute
            content): on mobile the H1 + intro + CTAs are taller than 24rem,
            so a fixed height with overflow-hidden CLIPPED the H1. Now the
            hero grows to fit and the image (fill) covers the grown box. */}
        <div className="relative flex min-h-[22rem] flex-col justify-end sm:min-h-[24rem]">
          {media?.heroImage ? (
            <Image
              src={media.heroImage}
              alt={`Hotele ${inLoc}, ${city.countryNominative}`}
              fill
              priority
              className="object-cover"
              sizes="100vw"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-700 to-emerald-950" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0.12)_0%,rgba(5,18,11,0.78)_100%)]" />
          <div className="relative z-10 p-6 text-white sm:p-8">
            <Breadcrumbs
              locale="pl"
              items={[
                { label: "Start", href: "/" },
                { label: "Kierunki", href: "/kierunki" },
                { label: `Hotele ${inLoc}` },
              ]}
            />
            <h1 className="mt-3 max-w-4xl font-display text-3xl leading-[1.08] sm:text-5xl sm:leading-[0.95] md:text-6xl">
              {text.heading}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-white/86">
              {city.intro}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={searchHref}
                className="inline-flex min-h-11 h-12 items-center justify-center rounded-full bg-white px-6 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="text-sm font-bold text-ink">Sprawdź dostępne hotele</span>
              </Link>
              <Link
                href={profile ? `/kierunki/${profile.slug}` : "/kierunki"}
                className="inline-flex min-h-11 h-12 items-center justify-center rounded-full border border-white/30 bg-white/10 px-6 transition duration-150 ease-out hover:bg-white/20 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="text-sm font-semibold text-white">Przewodnik po {city.cityLocative}</span>
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/90">
              {facts?.flight && (
                <span className="rounded-full bg-white/12 px-3 py-1">
                  {facts.flight.kind === "exact"
                    ? `lot ok. ${facts.flight.hours.toFixed(1)} h`
                    : `lot ~${facts.flight.hours.toFixed(1)} h (szacunek)`}
                </span>
              )}
              <span className="rounded-full bg-white/12 px-3 py-1">ceny w PLN</span>
              <span className="rounded-full bg-white/12 px-3 py-1">bezpłatna anulacja</span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-raised px-5 py-3 shadow-sm">
        <AuthorByline author={EDITOR_IN_CHIEF} />
        <span className="text-xs text-ink-muted">Ceny i dostępność sprawdzisz na żywo w wyszukiwarce</span>
      </div>

      {/* WHY US */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "Ceny w PLN bez ukrytych opłat",
            body: "Pokazujemy finalną cenę, jaką zapłacisz — bez przeliczników karty i niespodzianek przy kasie.",
          },
          {
            title: "Bezpłatna anulacja",
            body: "Większość ofert ma okres bezpłatnej anulacji (zwykle 24-48 h przed przyjazdem).",
          },
          {
            title: "Polskie wsparcie",
            body: "Pomoc po polsku przed i po rezerwacji — emailem i telefonicznie w dni robocze.",
          },
          {
            title: "Sprawdzone hotele",
            body: "Oferty od globalnego dostawcy LiteAPI z prawdziwymi opiniami gości — aktualne ceny sprawdzisz w wyszukiwarce.",
          },
        ].map((item) => (
          <article
            key={item.title}
            className="rounded-2xl border border-line bg-surface-raised p-5 shadow-sm"
          >
            <h3 className="mt-2 text-sm font-bold text-ink">{item.title}</h3>
            <p className="mt-2 text-xs leading-6 text-ink-muted">{item.body}</p>
          </article>
        ))}
      </section>

      {/* FEATURED HOTELS */}
      {featuredHotels.length > 0 && (
        <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="mt-2 font-display text-2xl text-ink sm:text-3xl">
                Polecane hotele {inLoc}
              </h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                Wybrane z {profile?.city ? "naszej bazy" : "katalogu"} — sprawdź szczegóły i ceny na żywo.
              </p>
            </div>
            <Link
              href={searchHref}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 py-3 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-bold text-white">Wszystkie hotele</span>
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredHotels.slice(0, 6).map((hotel) => (
              <Link
                key={hotel.id}
                href={`/hotele/${encodeURIComponent(hotel.id)}?${new URLSearchParams({
                  destination: searchCity,
                  country: searchCountry,
                  checkin: startDate,
                  checkout: checkoutDate,
                  adults: "2",
                  rooms: "1",
                }).toString()}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised transition hover:border-brand hover:shadow-md"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-neutral-100">
                  {hotel.main_photo || hotel.thumbnail ? (
                    <Image
                      src={hotel.main_photo ?? hotel.thumbnail ?? ""}
                      alt={hotel.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-neutral-300">
                      <span className="text-sm">Brak zdjęcia</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <h3 className="line-clamp-2 text-base font-semibold text-ink">{hotel.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    {hotel.stars && hotel.stars > 0 && (
                      <span className="text-amber-500">{"★".repeat(Math.round(hotel.stars))}</span>
                    )}
                    <span>{hotel.city}</span>
                  </div>
                  {hotel.rating && hotel.rating > 0 && (
                    <div className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md bg-surface-sunken px-2 py-1 text-xs font-semibold text-ink">
                      <span className="rounded bg-brand px-1.5 py-0.5 text-xs font-bold text-white">
                        {hotel.rating.toFixed(1)}
                      </span>
                      <span>Ocena gości</span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* BEST TIME + LOCAL TIPS */}
      {profile && (
        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
            <h2 className="mt-2 font-display text-3xl text-ink">
              {bestMonths.length > 0 ? `Najlepszy termin na wyjazd ${dirPrep} ${dirForm}` : `Planowanie wyjazdu ${dirPrep} ${dirForm}`}
            </h2>
            {/* Bez temperatur kuratorowanych nie ma listy miesięcy — do 2026-09 stał
                tu wtedy napis „Cały rok", czyli twierdzenie bez danych. */}
            {bestMonths.length > 0 && (
              <>
                <p className="mt-3 text-sm leading-7 text-ink-muted">
                  Najbardziej komfortowe miesiące (temperatury 18-30°C):
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {bestMonths.slice(0, 8).map((m) => (
                    <span
                      key={m}
                      className="rounded-full bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-ink"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </>
            )}
            <p className="mt-4 text-sm leading-7 text-ink-muted">
              {flightText && (
                <>
                  Lot z Polski: <strong className="text-ink">{flightText}</strong>.{" "}
                </>
              )}
              Idealna długość wyjazdu zależy od dystansu — sprawdź planowanie w przewodniku.
            </p>
            <Link
              href={`/kierunki/${profile.slug}`}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-brand bg-white px-5 transition duration-150 ease-out hover:bg-surface-sunken active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-semibold text-brand">Pełny przewodnik po {city.cityLocative}</span>
            </Link>
          </article>

          <article className="rounded-[2rem] border border-line bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
            <h2 className="mt-2 font-display text-3xl text-ink">
              {city.cityNominative} miesiąc po miesiącu
            </h2>
            <p className="mt-3 text-sm leading-7 text-ink-muted">
              {facts?.temperature
                ? "Pogoda, budżet i porady na konkretny miesiąc — wybierz termin wyjazdu."
                : "Hotele i porady na konkretny miesiąc — wybierz termin wyjazdu."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {polishMonthSlugs.slice(0, 12).map((m) => (
                <Link
                  key={m}
                  href={`/kierunki/${profile.slug}/${m}`}
                  className="group rounded-xl border border-line bg-white px-3 py-2 text-center text-xs font-semibold transition hover:border-brand"
                >
                  <span className="text-ink transition group-hover:text-brand">{polishMonthLabels[m]}</span>
                </Link>
              ))}
            </div>
          </article>
        </section>
      )}

      {/* GDZIE SIĘ ZATRZYMAĆ — unique per-city editorial (anti-doorway) +
          high-intent "hotele {miasto} centrum / gdzie się zatrzymać" copy */}
      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h2 className="mt-2 font-display text-2xl text-ink sm:text-3xl">
          Najlepsze okolice {inLoc}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-muted">
          Każda dzielnica ma swój charakter i cenę. Oto gdzie najczęściej szukają noclegu
          podróżni — od centrum po spokojniejsze okolice.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {city.neighborhoods.map((area) => (
            <article
              key={area.name}
              className="flex gap-3 rounded-2xl border border-line bg-surface-sunken p-4"
            >
              <div>
                <h3 className="text-sm font-bold text-ink">{area.name}</h3>
                <p className="mt-1 text-xs leading-6 text-ink-muted">{area.blurb}</p>
              </div>
            </article>
          ))}
        </div>
        <Link
          href={searchHref}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-6 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <span className="text-sm font-bold text-white">Zobacz hotele {inLoc}</span>
        </Link>
      </section>

      {/* FAQ */}
      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h2 className="font-display text-3xl text-ink">Najczęściej zadawane pytania</h2>
        <div className="mt-5 space-y-4">
          {faq.map((item) => (
            <details
              key={item.question}
              className="rounded-2xl bg-surface-sunken px-5 py-4 transition hover:bg-surface-sunken"
            >
              <summary className="cursor-pointer text-base font-bold text-ink">
                {item.question}
              </summary>
              <p className="mt-3 text-sm leading-7 text-ink-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CROSS-LINKING */}
      <section className="rounded-[2rem] border border-line bg-gradient-to-br from-emerald-50/60 to-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="mt-2 font-display text-3xl text-ink">
            Hotele w innych popularnych miastach
          </h2>
          <Link
            href="/kierunki"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-5 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-semibold text-ink">Wszystkie kierunki</span>
          </Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {otherCities.map((c) => (
            <Link
              key={c.slug}
              href={`/hotele/w/${c.slug}`}
              className="group inline-flex min-h-11 items-center justify-center rounded-2xl border border-line bg-surface-raised px-4 py-3 transition duration-150 ease-out hover:border-brand hover:shadow-md active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <div>
                <p className="text-sm font-bold text-ink group-hover:text-brand">
                  Hotele {c.preposition} {c.cityLocative}
                </p>
                <p className="text-xs text-ink-muted">{c.countryNominative}</p>
              </div>
            </Link>
          ))}
        </div>
        {monthLinks.length > 0 && (
          <div className="mt-5 border-t border-line pt-5">
            <div className="mt-3 flex flex-wrap gap-2">
              {monthLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-4 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-white">{link.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* FINAL CTA */}
      <section className="rounded-[2rem] border border-line bg-brand-strong p-8 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <h2 className="mt-2 font-display text-3xl">
              Sprawdź dostępne hotele {inLoc} na wybrany termin
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-white/80">
              Konkretne ceny w PLN, prawdziwa dostępność. Rezerwacja w 2 minuty.
            </p>
          </div>
          <Link
            href={searchHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-7 py-3 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-base font-bold text-ink">Sprawdź hotele</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
