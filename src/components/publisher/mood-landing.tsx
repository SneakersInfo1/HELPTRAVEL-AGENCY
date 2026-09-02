import Link from "next/link";
import { Check, Plus } from "lucide-react";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { MoodDestinationCard } from "@/components/publisher/mood-destination-card";
import { iataForCity } from "@/lib/flights/airports";
import { getDestinationByCityCountry } from "@/lib/mvp/destinations-seed";
import { pickFreshFlightPrice, pickFreshPrice, readPriceSnapshot } from "@/lib/prices/destination-price-snapshot";
import { buildAffiliateLinks } from "@/lib/mvp/affiliate-links";
import { curatedDestinations } from "@/lib/mvp/destinations";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";
import { TRAVEL_MOODS, getMoodBySlug, type MoodPick } from "@/lib/mvp/travel-moods";
import type { DestinationProfile } from "@/lib/mvp/types";
import { SHELL_DISCOVERY } from "@/lib/ui/layout";

// Default search window for the "Zobacz hotele i loty" CTA so the link lands on
// real results (the search page needs valid dates) instead of the date prompt.
// ISR (revalidate 1d) keeps these ~a month out and fresh.
function plusDaysIso(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// A real catalogue profile when the pick has a guide (gives recipe-based
// imagery); otherwise a minimal synthesised profile so media resolution still
// works for any real city (Pexels by name, with a safe generic fallback).
function profileForPick(pick: MoodPick): DestinationProfile {
  if (pick.slug) {
    const real = curatedDestinations.find((d) => d.slug === pick.slug);
    if (real) return real;
  }
  const slug = `mood-${`${pick.searchCity}-${pick.country}`.toLowerCase().replace(/\s+/g, "-")}`;
  return {
    id: slug,
    slug,
    city: pick.searchCity,
    country: pick.country,
    visaForPL: true,
    avgTempByMonth: [],
    costIndex: 1,
    beachScore: 0.5,
    cityScore: 0.5,
    sightseeingScore: 0.5,
    nightlifeScore: 0.5,
    natureScore: 0.5,
    safetyScore: 0.5,
    accessScore: 0.5,
    typicalFlightHoursFromPL: 0,
    affiliateLinks: buildAffiliateLinks(pick.searchCity, pick.country),
  };
}

function hotelsHrefFor(pick: MoodPick, checkin: string, checkout: string): string {
  const p = new URLSearchParams({
    destination: pick.searchCity,
    country: pick.country,
    checkin,
    checkout,
    origin: "Warszawa",
    adults: "2",
    rooms: "1",
  });
  return `/hotele/szukaj?${p.toString()}`;
}

export async function MoodLanding({ slug }: { slug: string }) {
  const mood = getMoodBySlug(slug);
  if (!mood) return null;

  const checkin = plusDaysIso(30);
  const checkout = plusDaysIso(34);

  // Prawdziwe ceny ze snapshotu (podzbiór picks — tylko grzane kierunki;
  // reszta kart bez linii ceny). Odczyt RAZ na render ISR.
  const priceSnapshot = await readPriceSnapshot();

  const cards = await Promise.all(
    mood.picks.map(async (pick) => {
      const iata = iataForCity(pick.searchCity);
      // Klucz ceny przez rekord SEEDU (cron pisze klucze z seed city.en) —
      // inaczej „Palma de Mallorca" (pick) nie trafi w „Palma" (seed/cron).
      const seedDest = getDestinationByCityCountry(pick.searchCity, pick.country);
      return {
        pick,
        media: await resolveDestinationMedia(profileForPick(pick)),
        hotelsHref: hotelsHrefFor(pick, checkin, checkout),
        guideHref: pick.slug ? `/kierunki/${pick.slug}` : undefined,
        fromPricePerNight:
          pickFreshPrice(
            priceSnapshot,
            seedDest?.city.en ?? pick.searchCity,
            seedDest?.country.en ?? pick.country,
          ) ?? undefined,
        flightFromPln:
          pickFreshFlightPrice(
            priceSnapshot,
            seedDest?.city.en ?? pick.searchCity,
            seedDest?.country.en ?? pick.country,
          ) ?? undefined,
        // CTA lotów tylko dla miast z lotniskiem w słowniku (WAW → kierunek,
        // te same daty co CTA hotelowe — spójna wycieczka jednym klikiem).
        flightsHref: iata
          ? `/loty/wyniki?origin=WAW&destination=${iata}&depart=${checkin}&return=${checkout}&adults=2&destLabel=${encodeURIComponent(pick.name)}`
          : undefined,
      };
    }),
  );

  const siteUrl = getSiteUrl();
  const moodUrl = `${siteUrl}/wyjazdy/${mood.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: mood.h1,
        description: mood.metaDescription,
        url: moodUrl,
        inLanguage: "pl-PL",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name: "Pomysły na wyjazd", item: `${siteUrl}/inspiracje` },
          { "@type": "ListItem", position: 3, name: mood.label, item: moodUrl },
        ],
      },
      {
        "@type": "ItemList",
        name: `${mood.label} — kierunki`,
        itemListElement: cards.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: item.guideHref ? `${siteUrl}${item.guideHref}` : `${siteUrl}${item.hotelsHref}`,
          name: `${item.pick.name}, ${item.pick.countryPl}`,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: mood.faq.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      },
    ],
  };

  return (
    <main className={`flex w-full flex-1 flex-col gap-10 py-6 ${SHELL_DISCOVERY}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* PRZEBUDOWANE 2026-08-01. Poprzedni „futuristic hero" był zbiorem
          wszystkiego, czego zabrania system projektowy naraz: gradient na <h1>
          (`bg-clip-text`), dwie rozmyte aury, siatka z maską radialną,
          `backdrop-blur` w czterech miejscach, dingbat ✦ i emoji w odznace.
          Żaden z tych elementów niczego nie komunikował — a rozmycia i maski to
          najdroższy sposób malowania piksela, płacony na telefonie przy każdym
          przewinięciu. Zostaje ciemny pas marki i solidna biel na nagłówku. */}
      <section className="rounded-[2rem] bg-brand-strong px-6 py-10 text-white [--focus-ring:#fff] sm:px-10 sm:py-14">
        <Breadcrumbs
          items={[
            { label: "Start", href: "/" },
            { label: "Pomysły na wyjazd", href: "/inspiracje" },
            { label: mood.label },
          ]}
        />
        <h1 className="mt-6 max-w-4xl text-balance font-display text-hero font-semibold text-white">{mood.h1}</h1>
        <p className="mt-5 max-w-[65ch] text-pretty text-base leading-8 text-white/90 sm:text-lg">{mood.lead}</p>

        <ul className="mt-7 flex flex-wrap gap-2">
          {mood.highlights.map((h) => (
            <li key={h} className="rounded-full border border-white/30 px-3.5 py-1.5 text-sm text-white/90">
              {h}
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            {/* Etykieta w <span>: `globals.css` ma NIEWARSTWOWE `a{color:inherit}`,
                które w Tailwindzie v4 bije utility `text-*` (te siedzą
                w @layer utilities). Na samym <a> etykieta dziedziczyłaby biel
                hero — biały napis na białym przycisku. */}
            <span className="text-sm font-bold text-brand-strong">Otwórz wyszukiwarkę hoteli</span>
          </Link>
          <Link
            href="/kierunki"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/35 px-6 py-3 transition duration-150 ease-out hover:bg-white/10 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-semibold text-white">Wszystkie kierunki</span>
          </Link>
        </div>
      </section>

      {/* Mood switcher — internal links for discovery + SEO */}
      <nav aria-label="Inne pomysły na wyjazd" className="flex flex-wrap gap-2">
        {TRAVEL_MOODS.map((m) => {
          const active = m.slug === mood.slug;
          return (
            <Link
              key={m.slug}
              href={`/wyjazdy/${m.slug}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 transition duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                active ? "border-brand bg-brand" : "border-line bg-surface-raised hover:bg-brand-soft"
              }`}
            >
              {/* Emoji z `m.icon` usunięte: renderuje je font systemowy, więc ten
                  sam znak wygląda inaczej na Androidzie, iOS i Windowsie. */}
              <span className={`text-sm font-semibold ${active ? "text-white" : "text-ink"}`}>{m.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Destinations */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl text-ink sm:text-3xl">{mood.label}: od tych kierunków zacznij</h2>
            <p className="mt-3 text-base leading-7 text-ink-muted">{mood.gridIntro}</p>
          </div>
          <Link href="/kierunki" className="underline underline-offset-4">
            <span className="text-sm font-semibold text-brand">Zobacz wszystkie kierunki</span>
          </Link>
        </div>

        <div className="ht-karty mt-6 [--ht-kol-lg:3] [--ht-kol-xl:4]">
          {cards.map((item) => (
            <MoodDestinationCard
              key={item.pick.name}
              pick={item.pick}
              media={item.media}
              hotelsHref={item.hotelsHref}
              guideHref={item.guideHref}
              fromPricePerNight={item.fromPricePerNight}
              flightFromPln={item.flightFromPln}
              flightsHref={item.flightsHref}
            />
          ))}
        </div>
      </section>

      {/* Editorial content — human-written, SEO */}
      {/* Treść redakcyjna czyta się jak tekst, nie jak kafelki: karty zamieniały
          dwa akapity w dwa pudełka z cieniem, a to jest sekcja do przeczytania. */}
      <section className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
        {mood.sections.map((s) => (
          <article key={s.title} className="border-t border-line pt-6">
            <h2 className="font-display text-2xl text-ink">{s.title}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mt-4 max-w-[65ch] text-base leading-8 text-ink">
                {p}
              </p>
            ))}
            {s.bullets && (
              <ul className="mt-5 space-y-3">
                {s.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check aria-hidden className="mt-1.5 size-4 shrink-0 text-brand" />
                    <span className="text-base leading-7 text-ink">{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>

      {/* FAQ */}
      <section>
        <h2 className="font-display text-2xl text-ink sm:text-3xl">Zanim wybierzesz kierunek</h2>
        <div className="mt-6 divide-y divide-line border-y border-line">
          {mood.faq.map((f) => (
            <details key={f.question} className="group py-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-ink marker:content-none">
                {f.question}
                <Plus
                  aria-hidden
                  className="size-4 shrink-0 text-brand transition duration-200 ease-out group-open:rotate-45 motion-reduce:transition-none"
                />
              </summary>
              <p className="mt-3 max-w-[65ch] text-base leading-7 text-ink-muted">{f.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
