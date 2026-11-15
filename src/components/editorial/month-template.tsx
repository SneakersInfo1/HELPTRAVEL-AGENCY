// Szablon strony „kierunek w miesiącu" (/kierunki/[slug]/[miesiac]).
//
// Ten sam język co porównanie: jedna szpalta, odpowiedź pod nagłówkiem, linie
// zamiast kart. Wszystkie liczby pochodzą z modelu (lib/seo/month-page-model.ts),
// czyli z bramki faktów — strona bez normy WMO nie pokazuje pogody
// wcale i mówi o tym wprost, zamiast wypełniać miejsce szablonem regionu.

import { serializeJsonLd } from "@/lib/seo/jsonld-serialize";
import Link from "next/link";
import { Check, X } from "lucide-react";

import { SeoCtaLink } from "@/components/analytics/seo-cta-link";
import { ClimateSourceLine } from "@/components/editorial/climate-source-line";
import { AuthorByline } from "@/components/publisher/author-byline";
import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { EDITOR_IN_CHIEF } from "@/lib/mvp/authors";
import { formatClimateNumber } from "@/lib/mvp/climate-normals";
import { inMonthPhrase, polishMonthLabels, polishMonthSlugs, type PolishMonthSlug } from "@/lib/mvp/months";
import type { MonthPageModel } from "@/lib/seo/month-page-model";

import { LinkPills } from "./comparison-blocks";

export interface MonthTemplateProps {
  model: MonthPageModel;
  /** Opis kierunku z przewodnika. */
  overview: string;
  hotelHref: string;
  /** Strona „hotele w mieście", jeśli istnieje dla tego kierunku. */
  cityHotels: { href: string; label: string } | null;
  comparisonLinks: Array<{ href: string; label: string }>;
}

const H2 = "font-display text-2xl font-semibold text-ink sm:text-3xl";
const ROW = "grid gap-1 py-3.5 sm:grid-cols-[13rem_1fr] sm:gap-6";

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function MonthTemplate({ model, overview, hotelHref, cityHotels, comparisonLinks }: MonthTemplateProps) {
  const { facts, weather, context, month, slug } = model;
  const inMonth = inMonthPhrase(month);
  const monthLabel = polishMonthLabels[month];
  const index = polishMonthSlugs.indexOf(month);
  const previous = polishMonthSlugs[(index + 11) % 12];
  const next = polishMonthSlugs[(index + 1) % 12];
  const monthHref = (value: PolishMonthSlug) => `/kierunki/${slug}/${value}`;

  const answer = weather
    ? model.text.lead
    : `Dla tego kierunku nie mamy jeszcze zweryfikowanych danych klimatycznych, więc nie podajemy temperatur. Możesz od razu sprawdzić hotele i loty na ${polishMonthLabels[month]}.`;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(model.structuredData) }} />
      <main className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col gap-10 px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-5">
          <Breadcrumbs
            items={[
              { label: "Start", href: "/" },
              { label: "Kierunki", href: "/kierunki" },
              { label: facts.name, href: `/kierunki/${slug}` },
              { label: capitalize(monthLabel) },
            ]}
          />
          <h1 className="text-balance font-display text-hero font-semibold text-ink">{model.text.h1}</h1>
          <p className="text-pretty border-t border-ink/80 pt-4 text-lg leading-8 text-ink">{answer}</p>
          {weather ? <ClimateSourceLine source={weather.source} /> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SeoCtaLink
              href={hotelHref}
              typTresci="month_page"
              ctaType="hero_search"
              destinationSlug={slug}
              month={month}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-6 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-bold text-white">Sprawdź hotele {inMonth}</span>
            </SeoCtaLink>
            <SeoCtaLink
              href="/?tab=loty"
              typTresci="month_page"
              ctaType="flight_search"
              destinationSlug={slug}
              month={month}
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-line bg-surface-raised px-6 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-semibold text-ink">Szukaj lotów</span>
            </SeoCtaLink>
          </div>
          <p className="text-xs leading-5 text-ink-muted">
            Wyszukiwarka hoteli otworzy się z tym kierunkiem i przykładowym terminem {inMonth}. Ceny i dostępność zobaczysz dopiero tam.
          </p>
          <AuthorByline author={EDITOR_IN_CHIEF} />
        </header>

        {model.fit ? (
          <section aria-labelledby="dla-kogo">
            <h2 id="dla-kogo" className={H2}>
              Na co ten termin, a kiedy odpuścić
            </h2>
            <div className="mt-5 grid gap-8 sm:grid-cols-2">
              <div>
                <h3 className="font-display text-xl font-semibold text-ink">Dobry termin na</h3>
                <ul className="mt-3 space-y-3 text-base leading-7">
                  {model.fit.goodFor.map((item) => (
                    <li key={item} className="flex gap-2.5 text-ink">
                      <Check aria-hidden className="mt-1 h-4 w-4 shrink-0 text-brand" strokeWidth={2.5} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {model.fit.skipIf.length > 0 ? (
                <div>
                  <h3 className="font-display text-xl font-semibold text-ink">Odpuść, jeśli</h3>
                  <ul className="mt-3 space-y-3 text-base leading-7">
                    {model.fit.skipIf.map((item) => (
                      <li key={item} className="flex gap-2.5 text-ink">
                        <X aria-hidden className="mt-1 h-4 w-4 shrink-0 text-ink-muted" strokeWidth={2.5} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <p className="mt-5 max-w-[65ch] text-xs leading-6 text-ink-muted">{model.fit.basis}</p>
          </section>
        ) : null}

        {weather || model.flightText ? (
          <section aria-labelledby="w-liczbach">
            <h2 id="w-liczbach" className={H2}>
              {facts.name} {inMonth} w liczbach
            </h2>
            <dl className="mt-4 divide-y divide-line border-y border-line">
              {weather ? (
                <>
                  <div className={ROW}>
                    <dt className="text-sm font-semibold text-ink-muted">Średnia maksymalna w dzień</dt>
                    <dd className="text-base leading-7 text-ink">
                      <span className="font-semibold tabular-nums">{formatClimateNumber(weather.maxTempC)}°C</span>
                      <span className="block text-sm text-ink-muted">Norma wieloletnia, nie prognoza.</span>
                    </dd>
                  </div>
                  <div className={ROW}>
                    <dt className="text-sm font-semibold text-ink-muted">Średnia minimalna w nocy</dt>
                    <dd className="text-base leading-7 text-ink">
                      <span className="font-semibold tabular-nums">{formatClimateNumber(weather.minTempC)}°C</span>
                    </dd>
                  </div>
                  {weather.rainDays !== null ? (
                    <div className={ROW}>
                      <dt className="text-sm font-semibold text-ink-muted">Dni z opadem</dt>
                      <dd className="text-base leading-7 text-ink">
                        <span className="font-semibold tabular-nums">{formatClimateNumber(weather.rainDays)} dnia</span>
                      </dd>
                    </div>
                  ) : null}
                  <div className={ROW}>
                    <dt className="text-sm font-semibold text-ink-muted">Suma opadu</dt>
                    <dd className="text-base leading-7 text-ink">
                      <span className="font-semibold tabular-nums">{formatClimateNumber(weather.rainfallMm)} mm</span>
                    </dd>
                  </div>
                  <div className={ROW}>
                    <dt className="text-sm font-semibold text-ink-muted">Miejsce miesiąca w roku</dt>
                    <dd className="text-base leading-7 text-ink">
                      <span className="font-semibold">
                        {weather.rankInYear === 1
                          ? "Najcieplejszy miesiąc roku"
                          : weather.rankInYear === 12
                            ? "Najchłodniejszy miesiąc roku"
                            : `${weather.rankInYear}. najcieplejszy miesiąc z 12`}
                        {weather.rankShared ? " (ex aequo)" : ""}
                      </span>
                      <span className="block text-sm text-ink-muted">
                        Według średnich maksimów; roczny zakres {formatClimateNumber(weather.yearMinMaxTempC)}–{formatClimateNumber(weather.yearMaxMaxTempC)}°C.
                      </span>
                    </dd>
                  </div>
                  {context?.dayLength ? (
                    <div className={ROW}>
                      <dt className="text-sm font-semibold text-ink-muted">Długość dnia</dt>
                      <dd className="text-base leading-7 text-ink">
                        <span className="font-semibold tabular-nums">{context.dayLength}</span>
                        <span className="block text-sm text-ink-muted">Od wschodu do zachodu słońca w połowie miesiąca; obliczone z szerokości geograficznej stacji.</span>
                      </dd>
                    </div>
                  ) : null}
                  {context?.home ? (
                    <div className={ROW}>
                      <dt className="text-sm font-semibold text-ink-muted">Na tle Warszawy</dt>
                      <dd className="text-base leading-7 text-ink">
                        <span className="font-semibold tabular-nums">
                          {context.home.maxDiffC > 0 ? "+" : context.home.maxDiffC < 0 ? "−" : ""}
                          {formatClimateNumber(Math.abs(context.home.maxDiffC))}°C w dzień
                        </span>
                        <span className="block text-sm text-ink-muted">
                          Warszawa {inMonth}: {formatClimateNumber(context.home.homeMaxC)}°C.
                          {context.home.rainDaysDiff !== null && Math.abs(context.home.rainDaysDiff) >= 1
                            ? ` Dni z opadem: o ${formatClimateNumber(Math.abs(context.home.rainDaysDiff))} ${context.home.rainDaysDiff < 0 ? "mniej" : "więcej"}.`
                            : ""}
                        </span>
                      </dd>
                    </div>
                  ) : null}
                  {context ? (
                    <div className={ROW}>
                      <dt className="text-sm font-semibold text-ink-muted">Na tle innych kierunków</dt>
                      <dd className="text-base leading-7 text-ink">
                        {context.standing.warmerCount === 0
                          ? `Najcieplejszy ${inMonth} spośród ${context.standing.total} kierunków, dla których mamy normy.`
                          : `${capitalize(inMonth)} cieplej jest w ${context.standing.warmerCount} z ${context.standing.total} kierunków, dla których mamy normy.`}
                      </dd>
                    </div>
                  ) : null}
                  <div className={ROW}>
                    <dt className="text-sm font-semibold text-ink-muted">Najcieplej i najchłodniej</dt>
                    <dd className="text-base leading-7 text-ink">
                      Najcieplej: {weather.warmestMonths.map((value) => polishMonthLabels[value]).join(", ")} ({formatClimateNumber(weather.yearMaxMaxTempC)}°C). Najchłodniej:{" "}
                      {weather.coldestMonths.map((value) => polishMonthLabels[value]).join(", ")} ({formatClimateNumber(weather.yearMinMaxTempC)}°C).
                    </dd>
                  </div>
                </>
              ) : null}
              {model.flightText ? (
                <div className={ROW}>
                  <dt className="text-sm font-semibold text-ink-muted">Lot z Polski</dt>
                  <dd className="text-base leading-7 text-ink">{capitalize(model.flightText)}</dd>
                </div>
              ) : null}
            </dl>
            {weather ? <ClimateSourceLine source={weather.source} className="mt-3 text-xs leading-6 text-ink-muted" /> : null}
            <p className="mt-3 text-sm leading-6 text-ink-muted">Aktualne ceny hoteli dla wybranego terminu pokazuje wyszukiwarka powyżej.</p>
          </section>
        ) : null}

        {context && context.warmer.length > 0 ? (
          <section aria-labelledby="gdzie-cieplej">
            <h2 id="gdzie-cieplej" className={H2}>
              Gdzie {inMonth} jest cieplej
            </h2>
            <p className="mt-3 max-w-[65ch] text-base leading-7 text-ink-muted">
              Kierunki z najbliższą wyższą średnią temperaturą maksymalną w tym samym miesiącu. W nawiasie: o ile cieplej niż tutaj.
            </p>
            <div className="mt-4">
              <LinkPills
                links={context.warmer.map((item) => ({
                  href: `/kierunki/${item.slug}/${month}`,
                  label: `${item.name}: ${formatClimateNumber(item.maxTempC)}°C (+${formatClimateNumber(item.diffC)}°C)`,
                }))}
              />
            </div>
          </section>
        ) : null}

        <section aria-labelledby="miesiace">
          <h2 id="miesiace" className={H2}>
            {weather ? `${facts.name}: średnie maksymalne w ciągu roku` : `${facts.name} miesiąc po miesiącu`}
          </h2>
          {weather ? <p className="mt-3 text-sm leading-6 text-ink-muted">Średnie maksymalne temperatury w dzień, norma wieloletnia w °C. Wybierz miesiąc, żeby zobaczyć szczegóły.</p> : null}
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {polishMonthSlugs.map((value, monthIndex) => {
              const current = value === month;
              return (
                <li key={value}>
                  <Link
                    href={monthHref(value)}
                    aria-current={current ? "page" : undefined}
                    className={`flex min-h-11 items-center justify-between rounded-xl border px-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                      current ? "border-brand bg-brand-soft" : "border-line bg-surface-raised hover:bg-brand-soft"
                    }`}
                  >
                    <span className="text-sm capitalize text-ink">{polishMonthLabels[value]}</span>
                    {weather ? <span className="text-sm font-semibold tabular-nums text-ink">{formatClimateNumber(weather.yearMaxTemps[monthIndex])}°C</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          {weather ? <ClimateSourceLine source={weather.source} className="mt-3 text-xs leading-6 text-ink-muted" /> : null}
        </section>

        <section aria-labelledby="o-kierunku">
          <h2 id="o-kierunku" className={H2}>
            {facts.name} — o kierunku
          </h2>
          <p className="mt-4 max-w-[65ch] text-base leading-7 text-ink">{overview}</p>
          <p className="mt-3">
            <Link href={`/kierunki/${slug}`} className="text-sm font-semibold underline decoration-line underline-offset-4 transition hover:decoration-brand">
              <span className="text-brand">Pełny przewodnik: {facts.name}</span>
            </Link>
          </p>
        </section>

        {model.faq.length > 0 ? (
          <section aria-labelledby="faq">
            <h2 id="faq" className={H2}>
              Najczęstsze pytania
            </h2>
            <div className="mt-4 divide-y divide-line border-y border-line">
              {model.faq.map((item) => (
                <details key={item.question} className="py-1">
                  <summary className="flex min-h-11 cursor-pointer items-center text-base font-semibold text-ink">{item.question}</summary>
                  <p className="max-w-[65ch] pb-4 text-base leading-7 text-ink-muted">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        <section aria-labelledby="sprawdz-hotele" className="rounded-2xl bg-brand-strong p-5 [--focus-ring:#fff] sm:p-8">
          <h2 id="sprawdz-hotele" className="font-display text-2xl font-semibold text-white sm:text-3xl">
            Hotele: {facts.name} {inMonth}
          </h2>
          <p className="mt-2 max-w-[60ch] text-sm leading-6 text-white/85">
            Wyszukiwarka otworzy się z tym kierunkiem i przykładowym terminem w tym miesiącu. Ceny w złotówkach zobaczysz po zmianie dat na swoje.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <SeoCtaLink
              href={hotelHref}
              typTresci="month_page"
              ctaType="final_cta"
              destinationSlug={slug}
              month={month}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-bold text-brand-strong">Sprawdź hotele {inMonth}</span>
            </SeoCtaLink>
            {cityHotels ? (
              <Link
                href={cityHotels.href}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/40 px-6 transition duration-150 ease-out hover:bg-white/10 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="text-sm font-semibold text-white">{cityHotels.label}</span>
              </Link>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="czytaj-dalej" className="border-t border-line pt-6">
          <h2 id="czytaj-dalej" className={H2}>
            Czytaj dalej
          </h2>
          <div className="mt-4 space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">Sąsiednie miesiące</p>
              <LinkPills
                links={[
                  { href: monthHref(previous), label: `${facts.name} ${inMonthPhrase(previous)}` },
                  { href: monthHref(next), label: `${facts.name} ${inMonthPhrase(next)}` },
                  { href: `/kierunki/${slug}`, label: `${facts.name} — przewodnik` },
                ]}
              />
            </div>
            {comparisonLinks.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">Porównania z tym kierunkiem</p>
                <LinkPills links={comparisonLinks} />
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </>
  );
}
