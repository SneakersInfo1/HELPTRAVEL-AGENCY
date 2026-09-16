import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuthorByline } from "@/components/publisher/author-byline";
import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { EDITOR_IN_CHIEF, personSchema } from "@/lib/mvp/authors";
import { findCommercialCityByDestinationId } from "@/lib/mvp/commercial-cities";
import { getAllDestinationProfiles } from "@/lib/mvp/destinations";
import {
  inMonthPhrase,
  isPolishMonthSlug,
  polishMonthLabels,
  polishMonthInflected,
  polishMonthSlugs,
  type PolishMonthSlug,
} from "@/lib/mvp/months";
import { getDestinationGuideBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";
import { addDaysToIsoDate } from "@/lib/mvp/travel-dates";
import { buildMonthPageModel } from "@/lib/seo/month-page-model";

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

// Data zameldowania w wybranym miesiącu: dziesiąty dzień bieżącego roku,
// jeśli zostały co najmniej trzy dni, w przeciwnym razie następnego roku.
function monthCheckinIso(monthIndex: number): string {
  const now = new Date();
  const tenthThisYear = Date.UTC(now.getUTCFullYear(), monthIndex, 10);
  const useNextYear = tenthThisYear < now.getTime() + 3 * 24 * 60 * 60 * 1000;
  const year = useNextYear ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-10`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, miesiac } = await params;
  if (!isPolishMonthSlug(miesiac)) return { title: "Kierunek" };
  const guide = getDestinationGuideBySlug(slug);
  if (!guide) return { title: "Kierunek" };

  const baseUrl = getSiteUrl();
  const model = buildMonthPageModel({
    profile: guide.destination,
    overview: guide.overview,
    month: miesiac,
    baseUrl,
    author: personSchema(EDITOR_IN_CHIEF),
  });

  return {
    title: model.text.title,
    description: model.text.description,
    robots: model.indexable ? undefined : { index: false, follow: true },
    alternates: { canonical: `/kierunki/${slug}/${miesiac}` },
    openGraph: {
      title: model.text.ogTitle,
      description: model.text.description,
      url: `${baseUrl}/kierunki/${slug}/${miesiac}`,
      type: "article",
      locale: "pl_PL",
    },
    other: {
      "article:section": `Kierunki - ${polishMonthLabels[miesiac]}`,
      "article:tag": `${model.facts.name}, ${model.facts.countryName}, hotele${model.weather ? ", pogoda" : ""}`,
    },
  };
}

export default async function MonthlyDestinationPage({ params }: PageProps) {
  const { slug, miesiac } = await params;
  if (!isPolishMonthSlug(miesiac)) notFound();
  const guide = getDestinationGuideBySlug(slug);
  if (!guide) notFound();

  const monthSlug = miesiac as PolishMonthSlug;
  const monthLabel = polishMonthLabels[monthSlug];
  const inMonth = inMonthPhrase(monthSlug);
  const monthInfl = polishMonthInflected[monthSlug];
  const baseUrl = getSiteUrl();
  const model = buildMonthPageModel({
    profile: guide.destination,
    overview: guide.overview,
    month: monthSlug,
    baseUrl,
    author: personSchema(EDITOR_IN_CHIEF),
  });
  const { facts, weather, budgetEstimate } = model;
  // Przewodniki generyczne mają już polskie nazwy (publisher-content), nadpisania są pisane po polsku.
  const overview = guide.overview;
  const commercialCity = findCommercialCityByDestinationId(model.slug);

  // Klucze LiteAPI pozostają po angielsku: wyszukiwarka oczekuje nazw z profilu.
  const startDate = monthCheckinIso(model.monthIndex);
  const checkout = addDaysToIsoDate(startDate, 4);
  const internalHotelHref = `/hotele/szukaj?${new URLSearchParams({
    destination: guide.destination.city,
    country: guide.destination.country,
    checkin: startDate,
    checkout,
    adults: "2",
    rooms: "1",
  }).toString()}`;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(model.structuredData) }} />

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <Breadcrumbs
          items={[
            { label: "Start", href: "/" },
            { label: "Kierunki", href: "/kierunki" },
            { label: facts.name, href: `/kierunki/${slug}` },
            { label: monthLabel },
          ]}
        />
        <h1 className="mt-3 max-w-3xl font-display text-3xl leading-[1.08] text-ink sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">
          {model.text.h1}
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">{model.text.lead}</p>

        <AuthorByline author={EDITOR_IN_CHIEF} className="mt-5" />

        {(weather || budgetEstimate) && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {weather && (
              <>
                <div className="rounded-2xl bg-surface-sunken p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
                    Średnia temperatura
                  </p>
                  <p className="mt-1 text-3xl font-bold text-ink">{weather.tempC}°C</p>
                  <p className="mt-1 text-xs text-ink-muted">{weather.description}</p>
                </div>
                <div className="rounded-2xl bg-surface-sunken p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Pozycja w roku</p>
                  <p className="mt-1 text-3xl font-bold capitalize text-ink">{weather.positionInYear}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Roczny zakres: {weather.yearMin}-{weather.yearMax}°C
                  </p>
                </div>
              </>
            )}
            {budgetEstimate && (
              <div className="rounded-2xl bg-surface-sunken p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
                  Orientacyjny budżet 2 os. / 4 dni
                </p>
                <p className="mt-1 text-2xl font-bold text-ink">
                  {budgetEstimate.min.toLocaleString("pl-PL")}-{budgetEstimate.max.toLocaleString("pl-PL")} PLN
                </p>
                <p className="mt-1 text-xs text-ink-muted">Szacunek: loty, nocleg, jedzenie, transport.</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        {weather ? (
          <>
            <h2 className="font-display text-3xl text-ink">
              {facts.name} {inMonth} — czy warto lecieć?
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-8 text-ink-muted">{weather.verdict}</p>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">{overview}</p>
          </>
        ) : (
          <>
            <h2 className="font-display text-3xl text-ink">{facts.name} — o kierunku</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">{overview}</p>
          </>
        )}
      </section>

      {weather && (
        <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="font-display text-3xl text-ink">
            {weather.seaTempEstimate !== null
              ? `${facts.name} ${inMonth}: morze i najcieplejszy miesiąc`
              : `${facts.name}: najcieplejszy miesiąc`}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {weather.seaTempEstimate !== null && (
              <div className="rounded-2xl bg-surface-sunken p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Temperatura morza</p>
                <p className="mt-1 text-3xl font-bold text-ink">~{weather.seaTempEstimate}°C</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Szacunek liczony z temperatur powietrza, nie pomiar.
                </p>
              </div>
            )}
            <div className="rounded-2xl bg-surface-sunken p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">
                Najcieplejszy miesiąc
              </p>
              <p className="mt-1 text-xl font-bold capitalize text-ink">
                {polishMonthLabels[weather.warmestMonth]}
              </p>
              <p className="mt-1 text-xs text-ink-muted">Szczyt temperatur ({weather.yearMax}°C)</p>
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-muted">
            {facts.name}: najcieplej jest{" "}
            <Link
              href={`/kierunki/${slug}/${weather.warmestMonth}`}
              className="font-semibold underline-offset-2 hover:underline"
            >
              <span className="text-brand">{inMonthPhrase(weather.warmestMonth)}</span>
            </Link>
            , a najchłodniej{" "}
            <Link
              href={`/kierunki/${slug}/${weather.coldestMonth}`}
              className="font-semibold underline-offset-2 hover:underline"
            >
              <span className="text-brand">{inMonthPhrase(weather.coldestMonth)}</span>
            </Link>
            .
          </p>
        </section>
      )}

      {weather ? (
        <section className="rounded-[2rem] border border-line bg-surface-sunken p-6">
          <h2 className="font-display text-3xl text-ink">{facts.name}: pogoda w ciągu roku</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {polishMonthSlugs.map((month, index) => {
              const isCurrent = month === monthSlug;
              return (
                <Link
                  key={month}
                  href={`/kierunki/${slug}/${month}`}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                    isCurrent
                      ? "border-brand bg-white font-semibold"
                      : "border-line bg-white/72 hover:border-brand hover:bg-white"
                  }`}
                >
                  <span className="capitalize text-ink">{polishMonthLabels[month]}</span>
                  <span className="font-semibold text-ink">{weather.yearTemps[index]}°C</span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="rounded-[2rem] border border-line bg-surface-sunken p-6">
          <h2 className="font-display text-3xl text-ink">{facts.name} miesiąc po miesiącu</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {polishMonthSlugs.map((month) => {
              const isCurrent = month === monthSlug;
              return (
                <Link
                  key={month}
                  href={`/kierunki/${slug}/${month}`}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    isCurrent
                      ? "border-brand bg-white font-semibold"
                      : "border-line bg-white/72 hover:border-brand hover:bg-white"
                  }`}
                >
                  <span className="capitalize text-ink">{polishMonthLabels[month]}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="flex flex-col justify-between rounded-2xl border border-line bg-brand p-6 text-white shadow-sm">
          <div>
            <h2 className="mt-2 font-display text-3xl leading-tight">
              Sprawdź hotele: {facts.name} {inMonth}
            </h2>
            <p className="mt-3 text-sm leading-7 text-white/85">
              Wyszukiwarka ustawiona na {monthInfl} — ceny w PLN, finalna płatność u dostawcy. Bez
              wychodzenia ze strony.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={internalHotelHref}
              className="inline-flex min-h-11 w-fit items-center justify-center rounded-full bg-white px-6 py-3 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-bold text-ink">Sprawdź hotele {inMonth}</span>
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
          <h3 className="mt-2 text-xl font-bold text-white">Sprawdź loty: {facts.name}</h3>
          <p className="mt-2 text-sm leading-6 text-white/78">
            Wyszukaj loty z dowolnego lotniska w Polsce.
            {model.flightText ? ` Lot ${model.flightText}.` : ""}
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
            <span className="text-sm font-semibold text-ink">Pełny przewodnik: {facts.name}</span>
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
