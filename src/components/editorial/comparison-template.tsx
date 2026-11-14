// Szablon strony porównania kierunków w trzech wariantach układu.
//
// Wszystkie warianty dostają ten sam model widoku i te same bloki — różnią się
// kompozycją. Produkcja używa jednego (DEFAULT_COMPARISON_VARIANT); pozostałe
// są dostępne tylko na trasie laboratoryjnej /lab/porownanie, żeby dało się je
// porównać na zrzutach. Uzasadnienie wyboru: docs/seo/DESIGN_QUALITY_STANDARD.md.

import Link from "next/link";

import { SeoCtaLink } from "@/components/analytics/seo-cta-link";
import { AuthorByline } from "@/components/publisher/author-byline";
import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { EDITOR_IN_CHIEF } from "@/lib/mvp/authors";
import type { CityHotelStats } from "@/lib/mvp/live-hotel-stats";
import type { ComparisonModel } from "@/lib/seo/comparison-model";
import type { ComparisonView } from "@/lib/seo/comparison-view";

import {
  DualHotelCta,
  EditorialSections,
  FactTable,
  LinkPills,
  SourcesNote,
  SplitPhotos,
  TapeTable,
  VerdictColumns,
  formatReviewDate,
  type FactRow,
  type SideInfo,
} from "./comparison-blocks";

export type ComparisonVariant = "werdykt" | "pojedynek" | "karta";

export const DEFAULT_COMPARISON_VARIANT: ComparisonVariant = "werdykt";

export interface ComparisonTemplateProps {
  view: ComparisonView;
  model: ComparisonModel;
  sides: [SideInfo, SideInfo];
  liveStats: { a: CityHotelStats | null; b: CityHotelStats | null; dateLabel: string | null } | null;
  articleLinks: Array<{ href: string; label: string }>;
  variant?: ComparisonVariant;
}

const H2 = "font-display text-2xl font-semibold text-ink sm:text-3xl";

function numericRows(model: ComparisonModel): FactRow[] {
  return model.rows.map((row) => ({ label: row.label, a: row.av, b: row.bv }));
}

function ReviewLine({ view }: { view: ComparisonView }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <AuthorByline author={EDITOR_IN_CHIEF} />
      {view.verifiedAt ? (
        <p className="text-xs leading-5 text-ink-muted">
          Źródła sprawdzone <time dateTime={view.verifiedAt}>{formatReviewDate(view.verifiedAt)}</time>
        </p>
      ) : null}
    </div>
  );
}

function FlightsLine({ sides, content }: { sides: [SideInfo, SideInfo]; content: ComparisonView["content"] }) {
  return (
    <p className="text-sm leading-6 text-ink-muted">
      Szukasz lotu?{" "}
      <SeoCtaLink href="/?tab=loty" typTresci="comparison" ctaType="flight_search" destinationSlug={sides[0].slug} content={content} className="font-semibold underline decoration-line underline-offset-4 transition hover:decoration-brand">
        <span className="text-brand">Otwórz wyszukiwarkę lotów</span>
      </SeoCtaLink>{" "}
      i wybierz lotnisko wylotu oraz termin.
    </p>
  );
}

function WhenToGo({ model }: { model: ComparisonModel }) {
  if (model.whenToGo.length === 0) return null;
  return (
    <section aria-labelledby="kiedy-jechac">
      <h2 id="kiedy-jechac" className={H2}>
        Kiedy jechać
      </h2>
      <p className="mt-3 max-w-[65ch] text-sm leading-6 text-ink-muted">
        Miesiące ze średnią temperaturą 18–30°C według danych redakcyjnych HelpTravel. To średnie wieloletnie, nie prognoza pogody.
      </p>
      <dl className="mt-4 divide-y divide-line border-y border-line">
        {model.whenToGo.map((entry) => (
          <div key={entry.side.profile.slug} className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
            <dt className="font-display text-lg font-semibold text-ink">{entry.side.name}</dt>
            <dd className="text-base leading-7 text-ink">
              {entry.months.length > 0 ? entry.months.join(", ") : "przez cały rok bywa chłodniej"}
              <span className="block text-sm text-ink-muted">
                Lato ok. {entry.summerAvg}°C, zima ok. {entry.winterAvg}°C
              </span>
            </dd>
          </div>
        ))}
        {model.missingClimate.map((side) => (
          <div key={side.profile.slug} className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
            <dt className="font-display text-lg font-semibold text-ink">{side.name}</dt>
            <dd className="text-sm leading-6 text-ink-muted">Nie podajemy temperatur — nie mamy dla tego kierunku zweryfikowanych danych klimatycznych.</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Budget({ model }: { model: ComparisonModel }) {
  if (!model.budget) return null;
  const items = [
    { name: model.a.name, amount: model.budget.a },
    { name: model.b.name, amount: model.budget.b },
  ];
  return (
    <section aria-labelledby="budzet">
      <h2 id="budzet" className={H2}>
        Orientacyjny budżet
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
        {items.map((item) => (
          <div key={item.name} className="bg-surface-raised p-4 sm:p-5">
            <dt className="text-sm font-semibold text-ink-muted">{item.name}</dt>
            <dd className="mt-1 font-display text-3xl font-semibold tabular-nums text-ink">ok. {item.amount.toLocaleString("pl-PL", { useGrouping: "always" })} zł</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 max-w-[65ch] text-xs leading-6 text-ink-muted">
        Szacunek ze wzoru HelpTravel dla 2 osób na 4 dni: lot z Polski, nocleg, jedzenie i transport lokalny. To nie jest cena oferty — aktualne stawki dla swoich dat zobaczysz w wyszukiwarce.
      </p>
    </section>
  );
}

function LiveStats({ liveStats, sides }: { liveStats: ComparisonTemplateProps["liveStats"]; sides: [SideInfo, SideInfo] }) {
  if (!liveStats || (!liveStats.a && !liveStats.b)) return null;
  const rows: FactRow[] = [
    {
      label: "Hotele w bazie HelpTravel",
      a: liveStats.a ? liveStats.a.propertyCount.toLocaleString("pl-PL") : "brak danych",
      b: liveStats.b ? liveStats.b.propertyCount.toLocaleString("pl-PL") : "brak danych",
    },
    {
      label: "Średnia ocena gości",
      a: liveStats.a?.avgGuestRating ? `${liveStats.a.avgGuestRating}/10` : "brak danych",
      b: liveStats.b?.avgGuestRating ? `${liveStats.b.avgGuestRating}/10` : "brak danych",
    },
  ];
  return (
    <section aria-labelledby="hotele-w-bazie">
      <h2 id="hotele-w-bazie" className={H2}>
        Hotele w naszej bazie
      </h2>
      <div className="mt-4">
        <FactTable
          caption="Hotele w bazie HelpTravel"
          nameA={sides[0].name}
          nameB={sides[1].name}
          rows={rows}
          note={`Dane własne HelpTravel${liveStats.dateLabel ? ` z ${liveStats.dateLabel}` : ""}; liczba obiektów i oceny zmieniają się. Ceny i dostępność sprawdzisz w wyszukiwarce dla swoich dat.`}
        />
      </div>
    </section>
  );
}

function Faq({ model }: { model: ComparisonModel }) {
  if (model.faq.length === 0) return null;
  return (
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
  );
}

function ReadNext({ view, sides, articleLinks }: Pick<ComparisonTemplateProps, "view" | "sides" | "articleLinks">) {
  return (
    <section aria-labelledby="czytaj-dalej" className="border-t border-line pt-6">
      <h2 id="czytaj-dalej" className={H2}>
        Czytaj dalej
      </h2>
      <div className="mt-4 space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">Przewodniki i poradniki</p>
          <LinkPills links={[...sides.map((side) => ({ href: side.guideHref, label: `${side.name} — przewodnik` })), ...articleLinks]} />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">Podobne porównania</p>
          <LinkPills links={view.relatedComparisons} />
          <p className="mt-3">
            <Link href="/porownanie" className="text-sm font-semibold underline decoration-line underline-offset-4 transition hover:decoration-brand">
              <span className="text-brand">Wszystkie porównania kierunków</span>
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

function FinalCta({ sides, content }: { sides: [SideInfo, SideInfo]; content: ComparisonView["content"] }) {
  return (
    <section aria-labelledby="sprawdz-hotele" className="rounded-2xl bg-brand-strong p-5 [--focus-ring:#fff] sm:p-8">
      <h2 id="sprawdz-hotele" className="font-display text-2xl font-semibold text-white sm:text-3xl">
        Sprawdź hotele dla swoich dat
      </h2>
      <p className="mt-2 max-w-[60ch] text-sm leading-6 text-white/85">
        Wyszukiwarka otworzy się z wybranym kierunkiem. Ceny w złotówkach i dostępność zobaczysz po wpisaniu terminu.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {sides.map((side) => (
          <SeoCtaLink
            key={side.slug}
            href={side.hotelHref}
            typTresci="comparison"
            ctaType="final_cta"
            destinationSlug={side.slug}
            content={content}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-5 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-bold text-brand-strong">Hotele: {side.name}</span>
          </SeoCtaLink>
        ))}
      </div>
    </section>
  );
}

/** Wspólna dolna część: liczby, pogoda, budżet, dane własne, FAQ, CTA, źródła, linki. */
function LowerSections({ view, model, sides, liveStats, articleLinks, tape }: ComparisonTemplateProps & { tape: boolean }) {
  const Table = tape ? TapeTable : FactTable;
  return (
    <>
      <section aria-labelledby="w-liczbach">
        <h2 id="w-liczbach" className={H2}>
          {view.nameA} i {view.nameB} w liczbach
        </h2>
        <div className="mt-4">
          <Table caption={`${view.nameA} i ${view.nameB} w liczbach`} nameA={view.nameA} nameB={view.nameB} rows={numericRows(model)} note={model.scoreNote} />
        </div>
      </section>
      <WhenToGo model={model} />
      <Budget model={model} />
      <LiveStats liveStats={liveStats} sides={sides} />
      <Faq model={model} />
      <FinalCta sides={sides} content={view.content} />
      <SourcesNote sources={view.sources} verifiedAt={view.verifiedAt} aiDisclosure={view.aiDisclosure} />
      <ReadNext view={view} sides={sides} articleLinks={articleLinks} />
    </>
  );
}

function Verdict({ view, compact = false }: { view: ComparisonView; compact?: boolean }) {
  if (!view.verdict) return null;
  return (
    <section aria-labelledby="werdykt">
      <h2 id="werdykt" className={H2}>
        {view.verdict.heading}
      </h2>
      <div className="mt-5">
        <VerdictColumns options={view.verdict.options} compact={compact} />
      </div>
      <p className="mt-5 max-w-[65ch] text-xs leading-6 text-ink-muted">{view.verdict.basis}</p>
    </section>
  );
}

// ── Wariant A „Werdykt": kolumna redakcyjna ───────────────────────────────
// Odpowiedź przed zdjęciem, jedna szpalta do czytania, sekcje dzielone liniami.
function VariantWerdykt(props: ComparisonTemplateProps) {
  const { view, sides } = props;
  return (
    <main className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col gap-10 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-5">
        <Breadcrumbs items={view.breadcrumbs} />
        <div>
          <h1 className="text-balance font-display text-hero font-semibold text-ink">{view.h1}</h1>
          {view.standfirst ? <p className="mt-2 text-base leading-7 text-ink-muted">{view.standfirst}</p> : null}
        </div>
        <p className="text-pretty border-t border-ink/80 pt-4 text-lg leading-8 text-ink">{view.answer}</p>
        <DualHotelCta sides={sides} placement="hero_search" content={view.content} />
        <SplitPhotos sides={sides} />
        <ReviewLine view={view} />
      </header>
      <Verdict view={view} />
      <EditorialSections sections={view.editorial} nameA={view.nameA} nameB={view.nameB} />
      <FlightsLine sides={sides} content={view.content} />
      <LowerSections {...props} tape={false} />
    </main>
  );
}

// ── Wariant B „Pojedynek": dwa tory od góry do dołu ───────────────────────
// Duże zdjęcia jako plakat, werdykt w dwóch kolumnach także na telefonie,
// liczby na „taśmie" z etykietą pośrodku.
function VariantPojedynek(props: ComparisonTemplateProps) {
  const { view, sides } = props;
  return (
    <main className="mx-auto flex w-full max-w-[52rem] flex-1 flex-col gap-10 px-4 py-6 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-5">
        <Breadcrumbs items={view.breadcrumbs} />
        <h1 className="text-balance text-center font-display text-hero font-semibold text-ink">{view.h1}</h1>
        <SplitPhotos sides={sides} tall />
        <DualHotelCta sides={sides} placement="hero_search" content={view.content} />
        <p className="text-pretty text-center text-lg leading-8 text-ink">{view.answer}</p>
        <ReviewLine view={view} />
      </header>
      <Verdict view={view} compact />
      <EditorialSections sections={view.editorial} nameA={view.nameA} nameB={view.nameB} />
      <FlightsLine sides={sides} content={view.content} />
      <LowerSections {...props} tape />
    </main>
  );
}

// ── Wariant C „Karta decyzji": panel produktu ─────────────────────────────
// Ciemny panel z odpowiedzią i CTA, dalej treść w ramkach jak w narzędziu.
function VariantKarta(props: ComparisonTemplateProps) {
  const { view, sides } = props;
  return (
    <main className="mx-auto flex w-full max-w-[60rem] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <header className="rounded-2xl bg-brand-strong p-5 text-white [--focus-ring:#fff] sm:p-8">
        <Breadcrumbs items={view.breadcrumbs} />
        <h1 className="mt-4 text-balance font-display text-hero font-semibold text-white">{view.h1}</h1>
        <p className="mt-4 max-w-[62ch] text-pretty text-base leading-7 text-white/90 sm:text-lg sm:leading-8">{view.answer}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {sides.map((side) => (
            <SeoCtaLink
              key={side.slug}
              href={side.hotelHref}
              typTresci="comparison"
              ctaType="hero_search"
              destinationSlug={side.slug}
              content={view.content}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-4 text-center transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-bold leading-tight text-brand-strong">Hotele: {side.name}</span>
            </SeoCtaLink>
          ))}
        </div>
      </header>
      <SplitPhotos sides={sides} />
      <div className="rounded-2xl border border-line bg-surface-raised p-5 sm:p-8">
        <ReviewLine view={view} />
        <div className="mt-6 flex flex-col gap-10">
          <Verdict view={view} />
          <EditorialSections sections={view.editorial} nameA={view.nameA} nameB={view.nameB} />
          <FlightsLine sides={sides} content={view.content} />
        </div>
      </div>
      <div className="flex flex-col gap-10 rounded-2xl border border-line bg-surface-raised p-5 sm:p-8">
        <LowerSections {...props} tape={false} />
      </div>
    </main>
  );
}

export function ComparisonTemplate(props: ComparisonTemplateProps) {
  const variant = props.variant ?? DEFAULT_COMPARISON_VARIANT;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(props.view.structuredData) }} />
      {variant === "pojedynek" ? <VariantPojedynek {...props} /> : variant === "karta" ? <VariantKarta {...props} /> : <VariantWerdykt {...props} />}
    </>
  );
}
