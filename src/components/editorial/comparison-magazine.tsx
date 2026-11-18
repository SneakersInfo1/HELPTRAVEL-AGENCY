// Wariant „Magazyn” szablonu porównania (domyślny od 18.11.2026).
//
// Cel: strona na desktopie wygląda pełno, a nie jak wąska szpalta bloga — szerokość
// kontenera serwisu (max-w-page) zamiast 46rem, śródtytuły w lewej kolumnie, zdjęcia obu
// kierunków w treści, jedna tabela faktów zamiast dwóch i zdublowanej sekcji klimatu.
// Na telefonie kolejność zostaje: H1, odpowiedź, CTA nad zgięciem, potem zdjęcia.
//
// Element charakterystyczny pozostaje ten sam: werdykt „{miasto} — wybierz, jeśli”,
// tu jako dwa panele ze zdjęciem. Liczby wyłącznie z bramki faktów (comparison-model),
// zdjęcia wyłącznie prawdziwe, z istniejącej integracji (Pexels), z podpisem źródła.

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Check, X } from "lucide-react";

import { SeoCtaLink } from "@/components/analytics/seo-cta-link";
import { ClimateSourceLine } from "@/components/editorial/climate-source-line";
import { AuthorByline } from "@/components/publisher/author-byline";
import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { EDITOR_IN_CHIEF } from "@/lib/mvp/authors";
import type { CityHotelStats } from "@/lib/mvp/live-hotel-stats";
import type { ComparisonModel, ComparisonRow } from "@/lib/seo/comparison-model";
import type { ComparisonView, ComparisonVerdictOption } from "@/lib/seo/comparison-view";

import { DualHotelCta, FactTable, LinkPills, SourcesNote, formatReviewDate, photoCreditFor, type FactRow, type SideInfo } from "./comparison-blocks";

const CONTAINER = "mx-auto w-full max-w-page px-4 sm:px-6 lg:px-8";
const H2 = "text-balance font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl";
const SCORE = /^(\d{1,3})\/100$/;
/** Wiersze modelu, które idą do „różnic w skrócie” (reszta trafia do tabeli faktów). */
const KEY_ROW_LABELS = new Set(["Lot z Polski (h)", "Średnia maks. w dzień — lipiec", "Średnia maks. w dzień — styczeń"]);

export interface ComparisonMagazineProps {
  view: ComparisonView;
  model: ComparisonModel;
  sides: [SideInfo, SideInfo];
  liveStats: { a: CityHotelStats | null; b: CityHotelStats | null; dateLabel: string | null } | null;
  articleLinks: Array<{ href: string; label: string }>;
}

type EditorialSection = ComparisonView["editorial"][number];

function isScoreRow(row: ComparisonRow): boolean {
  return SCORE.test(row.av) && SCORE.test(row.bv);
}

function isKeyRow(row: ComparisonRow): boolean {
  return KEY_ROW_LABELS.has(row.label) || isScoreRow(row);
}

/** Najcieplejsze i najchłodniejsze miesiące z norm WMO — dawna osobna sekcja „Normy klimatyczne”. */
function climateMonthRows(model: ComparisonModel, nameA: string): FactRow[] {
  if (model.climate.length === 0) return [];
  const forSide = (first: boolean) => model.climate.find((entry) => (entry.side.name === nameA) === first) ?? null;
  const a = forSide(true);
  const b = forSide(false);
  return [
    { label: "Najcieplej (średnia maks.)", a: a ? a.warmestMonths.join(", ") : "brak danych", b: b ? b.warmestMonths.join(", ") : "brak danych" },
    { label: "Najchłodniej (średnia maks.)", a: a ? a.coldestMonths.join(", ") : "brak danych", b: b ? b.coldestMonths.join(", ") : "brak danych" },
  ];
}

function Band({ id, tone = "plain", children, className = "" }: { id: string; tone?: "plain" | "sunken"; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`${tone === "sunken" ? "bg-surface-sunken" : ""} ${className}`}>
      <div className={`${CONTAINER} py-8 sm:py-12`}>{children}</div>
    </section>
  );
}

/** Śródtytuł w lewej kolumnie, treść w prawej — szerokość strony bez zbyt długich wierszy. */
function Rail({ id, heading, children }: { id: string; heading: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14">
      <h2 id={id} className={H2}>
        {heading}
      </h2>
      <div className="min-w-0">{children}</div>
    </div>
  );
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

function HeroPhotos({ sides }: { sides: [SideInfo, SideInfo] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      {sides.map((side, index) => (
        <figure key={side.slug} className="relative h-56 overflow-hidden rounded-lg bg-surface-sunken sm:h-80 lg:h-[30rem]">
          {side.image ? (
            <Image
              src={side.image}
              alt={`${side.name} — zdjęcie kierunku`}
              fill
              priority={index === 0}
              loading={index === 0 ? undefined : "eager"}
              // Kadr pionowy z poziomego zdjęcia (object-cover): szerokość pliku = wysokość × 1,5.
              sizes="(min-width: 1024px) 720px, (min-width: 640px) 62vw, 86vw"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-brand-strong" />
          )}
          {/* Przyciemnienie dołu tylko pod podpisem — czytelność nazwy na zdjęciu. */}
          <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,.66)_0%,rgba(0,0,0,.16)_42%,transparent_68%)]" />
          <figcaption className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
            <span className="font-display text-2xl font-semibold text-white sm:text-3xl lg:text-4xl">{side.name}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Hero({ view, sides }: { view: ComparisonView; sides: [SideInfo, SideInfo] }) {
  return (
    <header className={`${CONTAINER} pt-6 sm:pt-8`}>
      <Breadcrumbs items={view.breadcrumbs} />
      <div className="mt-5 grid gap-8 lg:mt-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-14">
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-balance font-display text-hero font-semibold text-ink">{view.h1}</h1>
            {view.standfirst ? <p className="mt-3 text-base leading-7 text-ink-muted">{view.standfirst}</p> : null}
          </div>
          <p className="text-pretty border-t border-ink/80 pt-4 text-lg leading-8 text-ink">{view.answer}</p>
          <DualHotelCta sides={sides} placement="hero_search" content={view.content} />
          <ReviewLine view={view} />
        </div>
        <HeroPhotos sides={sides} />
      </div>
    </header>
  );
}

/** Krótsze etykiety w zestawieniu (pełne nazwy wierszy zostają w modelu i w tabeli faktów). */
const KEY_ROW_DISPLAY: Record<string, string> = {
  "Lot z Polski (h)": "Lot z Polski",
  "Średnia maks. w dzień — lipiec": "Lipiec, średnia maks.",
  "Średnia maks. w dzień — styczeń": "Styczeń, średnia maks.",
};

function SideValue({ name, value, score, strong }: { name: string; value: string; score: number | null; strong: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm text-ink-muted">{name}</span>
        <span className="text-base font-semibold tabular-nums text-ink">{value}</span>
      </div>
      {score !== null ? (
        <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-line">
          <span className={`block h-full rounded-full ${strong ? "bg-brand" : "bg-ink-muted"}`} style={{ width: `${Math.max(4, Math.min(100, score))}%` }} />
        </span>
      ) : null}
    </div>
  );
}

/** „Najważniejsze różnice w skrócie”: oba kierunki obok siebie, przy ocenach 0–100 pasek. */
function KeyDifferences({ rows, nameA, nameB }: { rows: ComparisonRow[]; nameA: string; nameB: string }) {
  return (
    <dl className="grid gap-x-10 gap-y-4 md:grid-cols-2 md:gap-y-5 lg:grid-cols-3">
      {rows.map((row) => {
        const a = row.av.match(SCORE);
        const b = row.bv.match(SCORE);
        const scoreA = a && b ? Number(a[1]) : null;
        const scoreB = a && b ? Number(b[1]) : null;
        return (
          <div key={row.label} className="border-t border-line pt-2.5 md:pt-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">{KEY_ROW_DISPLAY[row.label] ?? row.label}</dt>
            <dd className="mt-2 grid grid-cols-2 gap-x-5">
              <SideValue name={nameA} value={row.av} score={scoreA} strong={scoreA !== null && scoreB !== null && scoreA >= scoreB} />
              <SideValue name={nameB} value={row.bv} score={scoreB} strong={scoreA !== null && scoreB !== null && scoreB >= scoreA} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function VerdictPanels({ options, sides }: { options: ComparisonVerdictOption[]; sides: [SideInfo, SideInfo] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:gap-8">
      {options.map((option, index) => {
        const side = sides.find((candidate) => candidate.name === option.label) ?? sides[index] ?? null;
        const photo = side?.gallery?.[0] ?? null;
        return (
          <article key={option.label} className="overflow-hidden rounded-lg border border-line bg-surface-raised">
            {photo ? (
              <div className="relative hidden aspect-[5/2] bg-surface-sunken md:block">
                <Image src={photo} alt={`${option.label} — zdjęcie z galerii kierunku`} fill sizes="(min-width: 768px) 560px, 1px" className="object-cover" />
              </div>
            ) : null}
            <div className="p-5 sm:p-7">
              {/* Nazwa zostaje w mianowniku: „Wybierz Barcelona" byłoby błędem (biernik:
                  „Barcelonę"), a odmiany nazw nie mamy w danych. */}
              <h3 className="font-display text-2xl font-semibold text-ink lg:text-3xl">{option.label} — wybierz, jeśli</h3>
              <ul className="mt-4 space-y-2.5 text-base leading-7">
                {option.chooseIf.map((item) => (
                  <li key={item} className="flex gap-2.5 text-ink">
                    <Check aria-hidden className="mt-1.5 h-4 w-4 shrink-0 text-brand" strokeWidth={2.5} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {option.skipIf.length > 0 ? (
                <ul className="mt-4 space-y-3 border-t border-line pt-4 text-base leading-7">
                  {option.skipIf.map((item) => (
                    <li key={item} className="flex gap-2.5 text-ink-muted">
                      <X aria-hidden className="mt-1.5 h-4 w-4 shrink-0 text-ink-muted" strokeWidth={2.5} />
                      <span>
                        <span className="font-semibold text-ink">Odpuść, jeśli</span> {item}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Bez dokumentu treści: opisy obu kierunków z przewodników, ze zdjęciem każdego. */
function Overviews({ sides }: { sides: [SideInfo, SideInfo] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:gap-8">
      {sides.map((side) => {
        const photo = side.gallery?.[0] ?? null;
        return (
          <article key={side.slug} className="overflow-hidden rounded-lg border border-line bg-surface-raised">
            {photo ? (
              <div className="relative aspect-[5/2] bg-surface-sunken">
                <Image src={photo} alt={`${side.name} — zdjęcie z galerii kierunku`} fill sizes="(min-width: 768px) 560px, 92vw" className="object-cover" />
              </div>
            ) : null}
            <div className="p-5 sm:p-7">
              <h3 className="font-display text-2xl font-semibold text-ink">{side.name}</h3>
              <p className="mt-2 text-base leading-7 text-ink">{side.overview}</p>
              <p className="mt-3">
                <Link href={side.guideHref} className="text-sm font-semibold underline decoration-line underline-offset-4 transition hover:decoration-brand">
                  <span className="text-brand">Przewodnik: {side.name}</span>
                </Link>
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Zdjęcia obu kierunków w treści — po dwa na kierunek, z podpisem źródła. */
function PhotoBand({ sides, offset, credit }: { sides: [SideInfo, SideInfo]; offset: number; credit: string | null }) {
  const groups = sides.map((side) => ({ side, photos: (side.gallery ?? []).slice(offset, offset + 2) }));
  if (groups.some((group) => group.photos.length === 0)) return null;
  return (
    <Band id="w-zdjeciach" tone="sunken">
      <h2 id="w-zdjeciach" className={H2}>
        {sides[0].name} i {sides[1].name} w zdjęciach
      </h2>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {groups.map(({ side, photos }) => (
          <figure key={side.slug}>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {photos.map((url, index) => (
                <div key={url} className={`relative aspect-[4/3] overflow-hidden rounded-md bg-surface ${photos.length === 1 ? "col-span-2" : ""}`}>
                  <Image
                    src={url}
                    alt={`${side.name} — zdjęcie ${index + 1} z galerii`}
                    fill
                    sizes={photos.length === 1 ? "(min-width: 768px) 620px, 92vw" : "(min-width: 768px) 320px, 52vw"}
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
            <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="font-display text-xl font-semibold text-ink">{side.name}</span>
              <Link href={side.guideHref} className="inline-flex min-h-11 items-center text-sm font-semibold underline decoration-line underline-offset-4 transition hover:decoration-brand">
                <span className="text-brand">Przewodnik: {side.name}</span>
              </Link>
            </figcaption>
          </figure>
        ))}
      </div>
      {credit ? <p className="mt-6 text-xs leading-5 text-ink-muted">Zdjęcia: {credit}</p> : null}
    </Band>
  );
}

function EditorialBody({ section }: { section: EditorialSection }) {
  if (section.kind === "prose") {
    return (
      <div className="max-w-[65ch] space-y-4">
        {section.paragraphs.map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 24)}`} className="text-base leading-7 text-ink sm:text-lg sm:leading-8">
            {paragraph}
          </p>
        ))}
      </div>
    );
  }
  if (section.kind === "list") {
    return (
      <div className="max-w-[65ch]">
        {section.intro ? <p className="text-base leading-7 text-ink-muted">{section.intro}</p> : null}
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {section.items.map((item, index) => (
            <li key={`${index}-${item.slice(0, 24)}`} className="flex gap-3 py-2.5 text-base leading-7 text-ink">
              <span aria-hidden className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (section.kind === "faq") {
    return (
      <div className="divide-y divide-line border-y border-line">
        {section.items.map((item) => (
          <details key={item.question} className="py-1">
            <summary className="flex min-h-11 cursor-pointer items-center text-base font-semibold text-ink">{item.question}</summary>
            <p className="max-w-[65ch] pb-4 text-base leading-7 text-ink-muted">{item.answer}</p>
          </details>
        ))}
      </div>
    );
  }
  return null;
}

function EditorialFlow({ sections }: { sections: EditorialSection[] }) {
  if (sections.length === 0) return null;
  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-8 sm:gap-12 sm:py-12`}>
      {sections.map((section, index) => (
        <section key={section.id} aria-labelledby={`sekcja-${section.id}`} className={index > 0 ? "border-t border-line pt-8 sm:pt-12" : ""}>
          <Rail id={`sekcja-${section.id}`} heading={section.heading}>
            <EditorialBody section={section} />
          </Rail>
        </section>
      ))}
    </div>
  );
}

/** Linki do podobnych porównań: jedna lista — na telefonie dwie kolumny linków, od sm pigułki. */
function CompactLinks({ links }: { links: Array<{ href: string; label: string }> }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 sm:flex sm:flex-wrap sm:gap-2">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="flex min-h-11 items-center text-sm font-semibold underline decoration-line underline-offset-4 transition hover:decoration-brand sm:inline-flex sm:rounded-full sm:border sm:border-line sm:bg-surface-raised sm:px-4 sm:no-underline sm:hover:bg-brand-soft"
          >
            <span className="text-ink">{link.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MagazineCta({ sides, content }: { sides: [SideInfo, SideInfo]; content: ComparisonView["content"] }) {
  return (
    <section aria-labelledby="sprawdz-hotele" className={`${CONTAINER} py-8 sm:py-12`}>
      <div className="rounded-lg bg-brand-strong p-6 [--focus-ring:#fff] sm:p-10 lg:grid lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-center lg:gap-12">
        <div>
          <h2 id="sprawdz-hotele" className="text-balance font-display text-3xl font-semibold text-white sm:text-4xl">
            Sprawdź hotele dla swoich dat
          </h2>
          <p className="mt-3 max-w-[52ch] text-base leading-7 text-white/85">Ceny w złotówkach i dostępność zobaczysz po wpisaniu terminu.</p>
        </div>
        <div className="mt-6 lg:mt-0">
          <div className="grid gap-3 sm:grid-cols-2">
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
          {/* Loty dla każdego kierunku z wpisanym celem (lib/flights/prefill-link.ts) — link pomocniczy, nie trzeci przycisk. */}
          <p className="mt-4 text-sm leading-6 text-white/85">
            Loty z wpisanym celem:{" "}
            {sides.map((side, index) => (
              <span key={side.slug}>
                {index > 0 ? " · " : null}
                <SeoCtaLink
                  href={side.flightHref}
                  typTresci="comparison"
                  ctaType="flight_search"
                  destinationSlug={side.slug}
                  content={content}
                  className="font-semibold text-white underline decoration-white/50 underline-offset-4 transition hover:decoration-white"
                >
                  {side.name}
                </SeoCtaLink>
              </span>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}

function LiveStatsTable({ liveStats, sides }: { liveStats: ComparisonMagazineProps["liveStats"]; sides: [SideInfo, SideInfo] }) {
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
    <Band id="hotele-w-bazie">
      <Rail id="hotele-w-bazie" heading="Hotele w naszej bazie">
        <FactTable
          caption="Hotele w bazie HelpTravel"
          nameA={sides[0].name}
          nameB={sides[1].name}
          rows={rows}
          note={`Dane własne HelpTravel${liveStats.dateLabel ? ` z ${liveStats.dateLabel}` : ""}; liczba obiektów i oceny zmieniają się.`}
        />
      </Rail>
    </Band>
  );
}

export function ComparisonMagazine({ view, model, sides, liveStats, articleLinks }: ComparisonMagazineProps) {
  const keyRows = model.rows.filter(isKeyRow);
  const docTables = view.editorial.filter((section): section is Extract<EditorialSection, { kind: "table" }> => section.kind === "table");
  const flow = view.editorial.filter((section) => section.kind !== "table");
  const factRows: FactRow[] = [
    ...docTables.flatMap((section) => section.rows.map((row) => ({ label: row.label, a: row.cells[0] ?? "—", b: row.cells[1] ?? "—" }))),
    // „Okres normy WMO” pomijamy, gdy te same okresy podaje notka pod tabelą (różne okresy norm).
    ...model.rows
      .filter((row) => !isKeyRow(row) && !(row.label === "Okres normy WMO" && model.climatePeriodNote))
      .map((row) => ({ label: row.label, a: row.av, b: row.bv })),
    ...climateMonthRows(model, view.nameA),
  ];
  const credit = photoCreditFor(sides);
  // Panele werdyktu (albo opisy kierunków) biorą pierwsze zdjęcie galerii, blok zdjęć — kolejne.
  const photoOffset = 1;
  const [firstSection, ...restSections] = flow;

  return (
    <main className="flex w-full flex-1 flex-col">
      <Hero view={view} sides={sides} />

      {keyRows.length > 0 ? (
        <Band id="roznice" tone="sunken" className="mt-8 sm:mt-12">
          <h2 id="roznice" className={H2}>
            Najważniejsze różnice w skrócie
          </h2>
          <div className="mt-8">
            <KeyDifferences rows={keyRows} nameA={view.nameA} nameB={view.nameB} />
          </div>
          {model.scoreNote ? <p className="mt-8 max-w-[80ch] text-xs leading-6 text-ink-muted">{model.scoreNote}</p> : null}
        </Band>
      ) : null}

      {view.verdict ? (
        <Band id="werdykt">
          <h2 id="werdykt" className={H2}>
            {view.verdict.heading}
          </h2>
          <div className="mt-8">
            <VerdictPanels options={view.verdict.options} sides={sides} />
          </div>
          <p className="mt-6 max-w-[80ch] text-xs leading-6 text-ink-muted">{view.verdict.basis}</p>
        </Band>
      ) : (
        <Band id="oba-kierunki">
          <h2 id="oba-kierunki" className={H2}>
            Oba kierunki w skrócie
          </h2>
          <div className="mt-8">
            <Overviews sides={sides} />
          </div>
        </Band>
      )}

      {firstSection ? <EditorialFlow sections={[firstSection]} /> : null}
      <PhotoBand sides={sides} offset={photoOffset} credit={credit} />
      <EditorialFlow sections={restSections} />

      {factRows.length > 0 ? (
        <Band id="w-faktach" tone="sunken">
          <h2 id="w-faktach" className={H2}>
            {view.nameA} i {view.nameB} w faktach
          </h2>
          <div className="mt-8">
            <FactTable caption={`${view.nameA} i ${view.nameB} w faktach`} nameA={view.nameA} nameB={view.nameB} rows={factRows} />
          </div>
          <div className="mt-6 space-y-2 text-xs leading-6 text-ink-muted">
            {model.climatePeriodNote ? <p>{model.climatePeriodNote}</p> : null}
            {model.climate.map((entry) => (
              <ClimateSourceLine key={entry.side.profile.slug} source={entry.source} />
            ))}
            {model.missingClimate.map((side) => (
              <p key={side.profile.slug}>{side.name}: nie podajemy temperatur — brak zweryfikowanych danych klimatycznych.</p>
            ))}
          </div>
        </Band>
      ) : null}

      <LiveStatsTable liveStats={liveStats} sides={sides} />

      {model.faq.length > 0 ? (
        <Band id="faq">
          <Rail id="faq" heading="Najczęstsze pytania">
            <div className="divide-y divide-line border-y border-line">
              {model.faq.map((item) => (
                <details key={item.question} className="py-1">
                  <summary className="flex min-h-11 cursor-pointer items-center text-base font-semibold text-ink">{item.question}</summary>
                  <p className="max-w-[65ch] pb-4 text-base leading-7 text-ink-muted">{item.answer}</p>
                </details>
              ))}
            </div>
          </Rail>
        </Band>
      ) : null}

      <MagazineCta sides={sides} content={view.content} />

      <section aria-labelledby="czytaj-dalej" className="bg-surface-sunken">
        <div className={`${CONTAINER} grid gap-8 py-8 sm:py-12 lg:grid-cols-2 lg:gap-14`}>
          <div className="min-w-0">
            <h2 id="czytaj-dalej" className={H2}>
              Czytaj dalej
            </h2>
            <div className="mt-6 space-y-5">
              <LinkPills links={[...sides.map((side) => ({ href: side.guideHref, label: `${side.name} — przewodnik` })), ...articleLinks]} />
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">Podobne porównania</p>
                <CompactLinks links={view.relatedComparisons} />
                <p className="mt-3">
                  <Link href="/porownanie" className="text-sm font-semibold underline decoration-line underline-offset-4 transition hover:decoration-brand">
                    <span className="text-brand">Wszystkie porównania kierunków</span>
                  </Link>
                </p>
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <SourcesNote sources={view.sources} verifiedAt={view.verifiedAt} aiDisclosure={view.aiDisclosure} />
          </div>
        </div>
      </section>
    </main>
  );
}
