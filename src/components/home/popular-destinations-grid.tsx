// Sesja C2 — 24-tile "Popularne kierunki" grid on the homepage.
//
// Renders top-N destinations from `data/destinations.index.json` (sorted
// by popularity at build time) plus a CTA pointing to the full search.
//
// Stays honest: no fake ratings / scarcity timers / "X osób ogląda".
// Just city + country + IATA badge + flight-time hint. Booking happens
// after the user picks dates in the planner.
//
// Mobile-first: 2 columns on phone, 3 on tablet, 6 on desktop.

import { LocalizedLink } from "@/components/site/localized-link";
import { getDestinationsCount, getTopDestinations } from "@/lib/mvp/destinations-seed";
import { localizeCountry } from "@/lib/mvp/i18n-geo";
import { DEFAULT_ORIGIN_CITY } from "@/lib/mvp/origin-cities";
import type { SiteLocale } from "@/lib/mvp/locale";

interface PopularDestinationsGridProps {
  locale: SiteLocale;
  count?: number;
}

const copy = {
  pl: {
    eyebrow: "Popularne kierunki",
    title: "Gotowy wybór — kliknij i zobacz hotele + loty",
    seeAllPrefix: "Lub szukaj wśród",
    seeAllSuffix: "kierunków",
    seeAllCta: "Zobacz wszystkie",
    flightHint: "Lot",
  },
  en: {
    eyebrow: "Popular destinations",
    title: "Skip the search — click and see hotels + flights",
    seeAllPrefix: "Or search across",
    seeAllSuffix: "destinations",
    seeAllCta: "See all",
    flightHint: "Flight",
  },
} as const;

function destinationHref(d: { city: { en: string }; country: { en: string } }): string {
  // Same shape the existing destination-tile + mini-planner emit — keeps
  // the unified results page (/hotele/szukaj) working unchanged.
  const params = new URLSearchParams({
    destination: d.city.en,
    country: d.country.en,
    origin: DEFAULT_ORIGIN_CITY,
    adults: "2",
    rooms: "1",
  });
  return `/hotele/szukaj?${params.toString()}`;
}

export function PopularDestinationsGrid({ locale, count = 24 }: PopularDestinationsGridProps) {
  const t = copy[locale];
  const totalCount = getDestinationsCount();
  const top = getTopDestinations(count);

  if (top.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 xl:px-8">
      <div className="rounded-[2rem] border border-emerald-900/10 bg-white p-5 shadow-[0_18px_60px_rgba(16,84,48,0.08)] sm:p-7">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
              {t.eyebrow}
            </p>
            <h2 className="mt-1 font-display text-2xl text-emerald-950 sm:text-3xl">
              {t.title}
            </h2>
          </div>
          <p className="text-xs text-emerald-900/60">
            {t.seeAllPrefix}{" "}
            <span className="font-semibold text-emerald-950 tabular-nums">{totalCount}</span>{" "}
            {t.seeAllSuffix}
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
          {top.map((d) => {
            const nearestPL = d.nearestPLHubs[0];
            const flightMinutes = nearestPL?.minutes ?? null;
            const flightHoursLabel =
              flightMinutes !== null
                ? `~${(flightMinutes / 60).toFixed(1)} h z PL`
                : null;
            return (
              <li key={d.id}>
                <LocalizedLink
                  href={destinationHref(d)}
                  locale={locale}
                  className="group relative flex h-full flex-col gap-1 rounded-2xl border border-emerald-900/10 bg-gradient-to-br from-emerald-50 to-white p-3 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_8px_22px_rgba(16,84,48,0.10)] sm:p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      {localizeCountry(d.country.en)}
                    </p>
                    {d.airports[0] ? (
                      <span className="rounded-full bg-emerald-900/8 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-800">
                        {d.airports[0]}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="font-display text-base leading-tight text-emerald-950 sm:text-lg">
                    {d.city.pl}
                  </h3>
                  <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                    {flightHoursLabel ? (
                      <span className="text-[10px] text-emerald-900/60">{flightHoursLabel}</span>
                    ) : <span />}
                    <span aria-hidden className="text-emerald-700 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100">
                      →
                    </span>
                  </div>
                </LocalizedLink>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex justify-center">
          <LocalizedLink
            href="/#hero"
            locale={locale}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-700/40 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-800 transition hover:border-emerald-700 hover:bg-emerald-50"
          >
            {t.seeAllCta}
            <span aria-hidden>↗</span>
          </LocalizedLink>
        </div>
      </div>
    </section>
  );
}
