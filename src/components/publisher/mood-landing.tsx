import Link from "next/link";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { MoodDestinationCard } from "@/components/publisher/mood-destination-card";
import { iataForCity } from "@/lib/flights/airports";
import { pickFreshPrice, readPriceSnapshot } from "@/lib/prices/destination-price-snapshot";
import { buildAffiliateLinks } from "@/lib/mvp/affiliate-links";
import { curatedDestinations } from "@/lib/mvp/destinations";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";
import { TRAVEL_MOODS, getMoodBySlug, type MoodPick } from "@/lib/mvp/travel-moods";
import type { DestinationProfile } from "@/lib/mvp/types";

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
      return {
        pick,
        media: await resolveDestinationMedia(profileForPick(pick)),
        hotelsHref: hotelsHrefFor(pick, checkin, checkout),
        guideHref: pick.slug ? `/kierunki/${pick.slug}` : undefined,
        fromPricePerNight: pickFreshPrice(priceSnapshot, pick.searchCity, pick.country) ?? undefined,
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
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-4 py-6 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Futuristic hero */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-emerald-900/20 bg-emerald-950 px-6 py-10 text-white shadow-[0_30px_80px_rgba(6,40,24,0.35)] sm:px-10 sm:py-14">
        <div
          aria-hidden
          className={`pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-gradient-to-br ${mood.aura} blur-3xl`}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-gradient-to-tr from-emerald-500/25 to-transparent blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:38px_38px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]"
        />

        <div className="relative">
          <Breadcrumbs
            items={[
              { label: "Start", href: "/" },
              { label: "Pomysły na wyjazd", href: "/inspiracje" },
              { label: mood.label },
            ]}
          />
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100 backdrop-blur-md">
            <span aria-hidden className="text-base">{mood.icon}</span>
            {mood.eyebrow}
          </div>
          <h1 className="mt-4 max-w-4xl bg-gradient-to-r from-white via-emerald-100 to-emerald-300 bg-clip-text font-display text-4xl leading-[1.02] text-transparent sm:text-5xl lg:text-6xl">
            {mood.h1}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-emerald-50/85 sm:text-lg">{mood.lead}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            {mood.highlights.map((h) => (
              <span
                key={h}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-medium text-emerald-50/90 backdrop-blur-md"
              >
                <span aria-hidden className="text-emerald-300">✦</span>
                {h}
              </span>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/hotele/szukaj"
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-amber-400 px-5 py-3 text-sm font-bold shadow-lg transition hover:bg-amber-300"
            >
              {/* Label in a <span>: globals.css has an UNLAYERED
                  `a { color: inherit }`, which in Tailwind v4 beats the
                  text-* utilities (they sit in @layer utilities). On an <a>
                  that made the label inherit the hero's white text → an
                  invisible white-on-white button. A <span> isn't an <a>, so
                  text-emerald-950 applies normally. */}
              <span className="text-emerald-950">Otwórz wyszukiwarkę hoteli →</span>
            </Link>
            <Link
              href="/kierunki"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold backdrop-blur-md transition hover:bg-white/20"
            >
              <span className="text-white">Wszystkie kierunki</span>
            </Link>
          </div>
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
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-emerald-900/10 bg-white text-emerald-950 hover:border-emerald-300 hover:bg-emerald-50"
              }`}
            >
              <span aria-hidden>{m.icon}</span>
              {m.label}
            </Link>
          );
        })}
      </nav>

      {/* Destinations */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dopasowane kierunki</p>
            <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">
              {mood.label}: od tych kierunków zacznij
            </h2>
            <p className="mt-2 text-sm leading-7 text-emerald-900/72">{mood.gridIntro}</p>
          </div>
          <Link href="/kierunki" className="text-sm font-semibold text-emerald-900 transition hover:text-emerald-700">
            Zobacz wszystkie kierunki →
          </Link>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((item) => (
            <MoodDestinationCard
              key={item.pick.name}
              pick={item.pick}
              media={item.media}
              hotelsHref={item.hotelsHref}
              guideHref={item.guideHref}
              fromPricePerNight={item.fromPricePerNight}
              flightsHref={item.flightsHref}
            />
          ))}
        </div>
      </section>

      {/* Editorial content — human-written, SEO */}
      <section className="grid gap-5 lg:grid-cols-2">
        {mood.sections.map((s) => (
          <article
            key={s.title}
            className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="font-display text-2xl text-emerald-950">{s.title}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mt-3 text-sm leading-7 text-emerald-900/78">
                {p}
              </p>
            ))}
            {s.bullets && (
              <ul className="mt-4 space-y-2">
                {s.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-emerald-900/80">
                    <span aria-hidden className="mt-0.5 text-emerald-600">✓</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </section>

      {/* FAQ */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Najczęstsze pytania</p>
        <h2 className="mt-2 font-display text-3xl text-emerald-950">Zanim wybierzesz kierunek</h2>
        <div className="mt-5 divide-y divide-emerald-900/10">
          {mood.faq.map((f) => (
            <details key={f.question} className="group py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-emerald-950">
                {f.question}
                <span aria-hidden className="text-emerald-600 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm leading-7 text-emerald-900/78">{f.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
