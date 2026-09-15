import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuthorByline } from "@/components/publisher/author-byline";
import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { EDITOR_IN_CHIEF, personSchema } from "@/lib/mvp/authors";
import { comparisonPairs, getComparisonPairBySlug, isTopComparison } from "@/lib/mvp/comparisons";
import { getCityHotelStats } from "@/lib/mvp/live-hotel-stats";
import { getArticlesForDestination, getDestinationGuideBySlug } from "@/lib/mvp/publisher-content";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";
import { buildComparisonModel, comparisonCoverage } from "@/lib/seo/comparison-model";
import { destinationDisplayName } from "@/lib/seo/destination-facts";
import { comparisonPageText } from "@/lib/seo/page-titles";
import type { EditorialArticle } from "@/lib/mvp/publisher-content";

export const revalidate = 86400;

interface PageProps {
  params: Promise<{ para: string }>;
}

// Tabela, FAQ, szybka odpowiedź i sekcje z liczbami: lib/seo/comparison-model.ts.
// Liczby o kierunkach wyłącznie z bramki faktów — bez temperatur, czasu lotu
// i budżetu z szablonu regionu (do 2026-09 Kreta–Rodos miała po obu stronach
// identyczne 3.1 h, 20/29/12°C i ~2895 PLN).

export async function generateStaticParams() {
  return comparisonPairs.map((pair) => ({ para: pair.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { para } = await params;
  const pair = getComparisonPairBySlug(para);
  if (!pair) return { title: "Porównanie kierunków" };
  const ga = getDestinationGuideBySlug(pair.a);
  const gb = getDestinationGuideBySlug(pair.b);
  if (!ga || !gb) return { title: "Porównanie kierunków" };

  const nameA = pair.labelA ?? destinationDisplayName(ga.destination);
  const nameB = pair.labelB ?? destinationDisplayName(gb.destination);
  // Tytuł i opis: lib/seo/page-titles.ts — bez roku liczonego z zegara i bez
  // obietnicy pogody albo budżetu, których strona nie pokaże.
  const coverage = comparisonCoverage(ga.destination, gb.destination);
  const text = comparisonPageText({ pair, nameA, nameB, hasClimate: coverage.climate, hasBudget: coverage.budget });

  return {
    title: text.title,
    description: text.description,
    alternates: { canonical: `/porownanie/${pair.slug}` },
    openGraph: {
      title: `${nameA} vs ${nameB} — porównanie HelpTravel`,
      description: `Konkretne porównanie ${nameA} i ${nameB} pod realną decyzję wyjazdową.`,
      url: `${getSiteUrl()}/porownanie/${pair.slug}`,
      type: "article",
    },
  };
}

export default async function ComparisonPage({ params }: PageProps) {
  const { para } = await params;
  const pair = getComparisonPairBySlug(para);
  if (!pair) notFound();
  const ga = getDestinationGuideBySlug(pair.a);
  const gb = getDestinationGuideBySlug(pair.b);
  if (!ga || !gb) notFound();

  const baseUrl = getSiteUrl();

  // Audit action C — flagship comparisons get REAL, current data from our
  // LiteAPI inventory (genuine information gain). Best-effort + fully graceful:
  // a LiteAPI hiccup degrades to the modelled content, never breaks the page.
  const isTop = isTopComparison(pair.slug);
  const [statsA, statsB] = isTop
    ? await Promise.all([
        getCityHotelStats(ga.destination.city, ga.destination.country),
        getCityHotelStats(gb.destination.city, gb.destination.country),
      ])
    : [null, null];
  const liveAsOf = statsA?.asOfISO ?? statsB?.asOfISO ?? null;
  const liveDateLabel = liveAsOf
    ? new Date(liveAsOf).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })
    : null;

  // Hero "vs" + image dla schema — realne foto Pexels obu kierunków (cache + ISR).
  // Obrazy są widoczne na stronie (zgodnie z wytycznymi Google dla pola image).
  const [mediaA, mediaB] = await Promise.all([resolveDestinationMedia(ga.destination), resolveDestinationMedia(gb.destination)]);
  const images = [mediaA.heroImage, mediaB.heroImage].filter((u): u is string => Boolean(u));

  const model = buildComparisonModel({
    pair,
    a: ga.destination,
    b: gb.destination,
    baseUrl,
    images,
    author: personSchema(EDITOR_IN_CHIEF),
  });
  const nameA = model.a.name;
  const nameB = model.b.name;

  // Powiązane artykuły dla obu kierunków (dedup, do 3) — wewnętrzne linki.
  const relatedArticles: EditorialArticle[] = [];
  const seenArticle = new Set<string>();
  for (const slug of [pair.a, pair.b]) {
    for (const article of getArticlesForDestination(slug)) {
      if (seenArticle.has(article.slug)) continue;
      seenArticle.add(article.slug);
      relatedArticles.push(article);
    }
  }
  const articleLinks = relatedArticles.slice(0, 3);

  const destPanels = [
    { side: model.a, guide: ga, audience: model.audience[0], flightSentence: model.flightSentences[0] },
    { side: model.b, guide: gb, audience: model.audience[1], flightSentence: model.flightSentences[1] },
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(model.structuredData) }} />

      <section className="overflow-hidden rounded-[2rem] border border-line bg-surface-raised shadow-sm">
        {/* Split "vs" hero — realne foto obu kierunków (widoczne + w schema image). */}
        <div className="relative grid grid-cols-2">
          {[
            { media: mediaA, name: nameA, align: "left-4" },
            { media: mediaB, name: nameB, align: "right-4" },
          ].map(({ media, name, align }) => (
            <div key={align} className="relative h-32 sm:h-44 md:h-52">
              {media.heroImage ? (
                <Image src={media.heroImage} alt={name} fill priority sizes="50vw" className="object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-emerald-900" />
              )}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0.05)_0%,rgba(5,18,11,0.62)_100%)]" />
              <span
                className={`absolute bottom-3 ${align} font-display text-xl text-white drop-shadow-sm sm:text-2xl`}
              >
                {name}
              </span>
            </div>
          ))}
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30 bg-surface-raised px-3.5 py-1 text-xs font-bold uppercase tracking-[0.1em] text-ink shadow-lg">
            vs
          </span>
        </div>
        <div className="p-6 sm:p-8">
          <Breadcrumbs
            items={[
              { label: "Start", href: "/" },
              { label: "Kierunki", href: "/kierunki" },
              { label: `${nameA} vs ${nameB}` },
            ]}
          />
          <h1 className="mt-3 max-w-3xl font-display text-3xl leading-[1.08] text-ink sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">
            {nameA} czy {nameB}? Porównanie pod realną decyzję wyjazdową.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">{pair.intent}.</p>
          {/* Bez „Zaktualizowano {data renderu}" — strona nie ma źródła prawdy dat zmian. */}
          <AuthorByline author={EDITOR_IN_CHIEF} className="mt-5" />
        </div>
      </section>

      {/* SZYBKA ODPOWIEDŹ — bezpośredni werdykt pod featured snippet + wysoki CTR */}
      <section className="rounded-[2rem] border border-brand/50 bg-surface-sunken p-6 shadow-sm">
        <p className="mt-2 max-w-3xl text-base leading-8 text-ink sm:text-lg">{model.quickAnswer}</p>
      </section>

      {/* NA ŻYWO Z NASZEJ BAZY — realne, aktualne dane (audit action C, top porównania).
          Informacja, której nie ma żadna statyczna strona konkurencji. 100% prawdziwe:
          gdy LiteAPI nie odpowie, sekcja po prostu się nie pokazuje. */}
      {isTop && (statsA || statsB) && (
        <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="mt-2 font-display text-2xl text-ink sm:text-3xl">
              Realne hotele w naszej bazie: {nameA} vs {nameB}
            </h2>
            {liveDateLabel && <span className="text-xs text-ink-muted">Dane z {liveDateLabel}</span>}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              { stats: statsA, name: nameA },
              { stats: statsB, name: nameB },
            ].map(({ stats, name }) => (
              <article key={name} className="rounded-2xl border border-line bg-surface-sunken p-5">
                <h3 className="font-display text-xl text-ink">{name}</h3>
                {stats ? (
                  <>
                    <dl className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-brand">Hotele w bazie</dt>
                        <dd className="mt-1 text-2xl font-bold text-ink">
                          {stats.propertyCount.toLocaleString("pl-PL")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.14em] text-brand">Średnia ocena gości</dt>
                        <dd className="mt-1 text-2xl font-bold text-ink">
                          {stats.avgGuestRating ? `${stats.avgGuestRating}/10` : "—"}
                          {stats.avgGuestRating && stats.ratedCount > 0 ? (
                            <span className="ml-1 text-xs font-normal text-ink-muted">z {stats.ratedCount}</span>
                          ) : null}
                        </dd>
                      </div>
                    </dl>
                    {stats.topHotels.length > 0 && (
                      <p className="mt-3 text-xs leading-6 text-ink-muted">
                        <span className="font-semibold text-ink">Wysoko oceniane:</span>{" "}
                        {stats.topHotels.slice(0, 3).map((h) => h.name).join(", ")}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-ink-muted">
                    Dane na żywo chwilowo niedostępne — sprawdź aktualne oferty w wyszukiwarce poniżej.
                  </p>
                )}
              </article>
            ))}
          </div>
          <p className="mt-3 text-xs leading-6 text-ink-muted">
            Liczba obiektów i oceny gości pochodzą na żywo z naszej bazy (LiteAPI) i mogą się zmieniać. Aktualne ceny
            dla Twoich dat sprawdzisz w wyszukiwarce poniżej.
          </p>
        </section>
      )}

      {/* TABELA RÓŻNIC */}
      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm overflow-x-auto">
        <h2 className="mb-4 font-display text-2xl text-ink">{nameA} vs {nameB} — tabela różnic</h2>
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="py-2 pr-4 font-semibold">Parametr</th>
              <th className="py-2 px-3 font-semibold text-ink">{nameA}</th>
              <th className="py-2 px-3 font-semibold text-ink">{nameB}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {model.rows.map((row) => (
              <tr key={row.label}>
                <td className="py-2 pr-4 text-ink-muted">{row.label}</td>
                <td className="py-2 px-3 font-semibold text-ink">{row.av}</td>
                <td className="py-2 px-3 font-semibold text-ink">{row.bv}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs leading-6 text-ink-muted">{model.scoreNote}</p>
      </section>

      {/* W CZYM WYGRYWA KTÓRY KIERUNEK */}
      <section>
        <h2 className="mb-4 font-display text-2xl text-ink sm:text-3xl">W czym wygrywa który kierunek</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {model.verdicts.map((v) => (
            <article key={v.title} className="rounded-2xl border border-line bg-surface-sunken p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">{v.title}</p>
              <p className="mt-2 text-sm leading-7 text-ink-muted">{v.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* DLA KOGO */}
      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h2 className="mt-2 font-display text-2xl text-ink sm:text-3xl">Dla kogo lepszy będzie każdy kierunek?</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {destPanels.map(({ side, audience }) => (
            <article key={side.profile.slug} className="rounded-2xl border border-line bg-surface-sunken p-5">
              <h3 className="font-display text-xl text-ink">{side.name}</h3>
              <p className="mt-1 text-sm text-ink-muted">Najlepszy wybór dla miłośników:</p>
              <ul className="mt-3 space-y-2">
                {audience.map((tag) => (
                  <li key={tag} className="flex gap-2 text-sm leading-6 text-ink-muted">{tag}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* KIEDY JECHAĆ — tylko przy temperaturach kuratorowanych; bez nich sekcja
          nie udaje wiedzy o klimacie. */}
      {model.whenToGo.length > 0 && (
        <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="mt-2 font-display text-2xl text-ink sm:text-3xl">Kiedy najlepiej jechać?</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {destPanels.map(({ side }) => {
              const entry = model.whenToGo.find((item) => item.side === side);
              return (
                <article key={side.profile.slug} className="rounded-2xl border border-line bg-surface-sunken p-5">
                  <h3 className="font-display text-xl text-ink">{side.name}</h3>
                  {entry ? (
                    <>
                      <p className="mt-2 text-sm leading-6 text-ink-muted">
                        Komfortowe miesiące (18-30°C). Lato ~{entry.summerAvg}°C, zima ~{entry.winterAvg}°C.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.months.length > 0 ? (
                          entry.months.map((m) => (
                            <span key={m} className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-ink">
                              {m}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-ink-muted">Cały rok bywa chłodniejszy — sprawdź szczegóły w przewodniku.</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-ink-muted">
                      Temperatur dla tego kierunku jeszcze nie podajemy — nie mamy zweryfikowanych danych klimatycznych.
                      Termin sprawdzisz w przewodniku i w wyszukiwarce.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* BUDŻET — szacunek ze wzoru tylko przy danych kuratorowanych po obu stronach */}
      {model.budget && (
        <section className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-sm">
          <h2 className="mt-2 font-display text-2xl text-ink sm:text-3xl">Ile kosztuje wyjazd?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">
            Orientacyjny budżet dla 2 osób na 4 dni (lot z Polski, nocleg, jedzenie, transport lokalny):
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              { side: model.a, amount: model.budget.a },
              { side: model.b, amount: model.budget.b },
            ].map(({ side, amount }) => (
              <div key={side.profile.slug} className="rounded-2xl bg-surface-raised px-5 py-4">
                <p className="text-sm font-semibold text-ink-muted">{side.name}</p>
                <p className="mt-1 font-display text-3xl text-ink">~{amount.toLocaleString("pl-PL")} zł</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-6 text-ink-muted">
            To szacunek orientacyjny — realne ceny zależą od terminu i standardu. Sprawdź aktualne stawki w wyszukiwarce poniżej.
          </p>
        </section>
      )}

      {/* PRZEWODNIKI + HOTELE */}
      <section className="grid gap-5 lg:grid-cols-2">
        {destPanels.map(({ side, guide }) => (
          <article
            key={side.profile.slug}
            className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm"
          >
            <h2 className="font-display text-2xl text-ink">{side.name}</h2>
            <p className="mt-2 text-sm leading-7 text-ink-muted">{guide.overview}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/kierunki/${side.profile.slug}`}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-4 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="text-xs font-bold text-white">Pełny przewodnik</span>
              </Link>
              <Link
                href={`/hotele/szukaj?${new URLSearchParams({
                  destination: side.profile.city,
                  country: side.profile.country,
                }).toString()}`}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-4 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="text-xs font-semibold text-ink">Sprawdź hotele i loty</span>
              </Link>
            </div>
          </article>
        ))}
      </section>

      {/* 2 CTA per kierunek — wewnętrzne hotele + wewnętrzne loty */}
      <section className="grid gap-5 lg:grid-cols-2">
        {destPanels.map(({ side, flightSentence }) => {
          const hotelHref = `/hotele/szukaj?${new URLSearchParams({
            destination: side.profile.city,
            country: side.profile.country,
          }).toString()}`;
          return (
            <div key={side.profile.slug} className="flex flex-col gap-4">
              <article className="rounded-2xl border border-line bg-brand p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white">Hotele</p>
                <h3 className="mt-1 font-display text-2xl">Konkretne ceny — {side.name}</h3>
                <p className="mt-2 text-sm leading-7 text-white/85">
                  Sprawdź ceny noclegów w PLN dla swoich dat. Bez wychodzenia ze strony.
                </p>
                <Link
                  href={hotelHref}
                  className="mt-4 inline-flex min-h-11 w-fit items-center justify-center rounded-full bg-white px-5 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                  {/* span: bg is white inside an emerald-700 (text-white) card,
                      so without it the global a{color:inherit} makes the label
                      white-on-white. */}
                  <span className="text-sm font-bold text-ink">Zobacz hotele: {side.name}</span>
                </Link>
              </article>
              <Link
                href="/?tab=loty"
                className="flex flex-col justify-center rounded-2xl border border-brand-strong bg-brand-strong p-5 shadow-sm transition hover:-translate-y-1 hover:bg-brand-strong motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white">Loty</p>
                <h3 className="mt-2 text-xl font-bold text-white">Sprawdź loty: {side.name}</h3>
                <p className="mt-2 text-sm leading-6 text-white/78">
                  Wyszukaj loty z dowolnego lotniska w Polsce.{flightSentence ? ` ${flightSentence}` : ""}
                </p>
              </Link>
            </div>
          );
        })}
      </section>

      {/* FAQ — widoczny accordion + zgodny ze schema FAQPage */}
      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h2 className="font-display text-2xl text-ink sm:text-3xl">Najczęściej zadawane pytania</h2>
        <div className="mt-5 space-y-3">
          {model.faq.map((item) => (
            <details key={item.question} className="rounded-2xl bg-surface-sunken px-5 py-4 transition hover:bg-surface-sunken">
              <summary className="cursor-pointer text-base font-bold text-ink">{item.question}</summary>
              <p className="mt-3 text-sm leading-7 text-ink-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* POWIĄZANE ARTYKUŁY */}
      {articleLinks.length > 0 ? (
        <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="font-display text-2xl text-ink">Powiązane poradniki</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {articleLinks.map((article) => (
              <Link
                key={article.slug}
                href={`/inspiracje/${article.slug}`}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-4 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <span className="text-xs font-semibold text-ink">{article.title}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* INNE PORÓWNANIA */}
      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl text-ink">Inne porównania</h2>
          <Link href="/porownanie" className="group text-sm font-semibold">
            <span className="text-brand transition group-hover:text-ink">Wszystkie porównania</span>
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {comparisonPairs
            .filter((p) => p.slug !== pair.slug)
            .slice(0, 12)
            .map((p) => {
              const ag = getDestinationGuideBySlug(p.a);
              const bg = getDestinationGuideBySlug(p.b);
              if (!ag || !bg) return null;
              const labelA = p.labelA ?? destinationDisplayName(ag.destination);
              const labelB = p.labelB ?? destinationDisplayName(bg.destination);
              return (
                <Link
                  key={p.slug}
                  href={`/porownanie/${p.slug}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-3 py-1.5 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                  <span className="text-xs font-semibold text-ink">{labelA} vs {labelB}</span>
                </Link>
              );
            })}
        </div>
      </section>
    </main>
  );
}
