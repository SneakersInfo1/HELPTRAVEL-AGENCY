// Wspólne bloki szablonów redakcyjnych (porównanie, miesiąc, hub).
//
// Zasady z DESIGN_QUALITY_STANDARD: treść prowadzi typografia i linie
// włoskowe, nie stos identycznych kart; jedna para głównych CTA na widok;
// każda liczba ma podpisane pochodzenie; cele dotykowe ≥ 44 px.

import Image from "next/image";
import Link from "next/link";
import { Check, X } from "lucide-react";

import { SeoCtaLink, type SeoContentContext } from "@/components/analytics/seo-cta-link";
import type { Section, Source } from "@/lib/content-engine/schema";
import type { ComparisonVerdictOption } from "@/lib/seo/comparison-view";

export interface SideInfo {
  name: string;
  slug: string;
  hotelHref: string;
  /** Wyszukiwarka lotów z wpisanym celem (lib/flights/prefill-link.ts). */
  flightHref: string;
  guideHref: string;
  image: string | null;
  /** Opis kierunku z przewodnika (publisher-content) — treść redakcyjna, bez liczb. */
  overview: string;
}

const DATE_FORMAT = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" });

export function formatReviewDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/** Dwa zdjęcia obok siebie z nazwami kierunków. `tall` — wariant plakatowy. */
export function SplitPhotos({ sides, tall = false }: { sides: [SideInfo, SideInfo]; tall?: boolean }) {
  return (
    <div className="relative grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line">
      {sides.map((side, index) => (
        <div key={side.slug} className={`relative ${tall ? "h-52 sm:h-72" : "h-36 sm:h-52"}`}>
          {side.image ? (
            <Image
              src={side.image}
              alt={`${side.name} — zdjęcie kierunku`}
              fill
              priority={index === 0}
              loading={index === 0 ? undefined : "eager"}
              sizes="(min-width: 768px) 420px, 64vw"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-brand-strong" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,.72)_0%,rgba(0,0,0,.28)_42%,transparent_70%)]" />
          <span className={`absolute bottom-3 font-display text-xl font-semibold text-white sm:text-2xl ${index === 0 ? "left-4" : "right-4"}`}>
            {side.name}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Para głównych CTA: hotele dla każdego kierunku, ze stanem kierunku w adresie. */
export function DualHotelCta({
  sides,
  placement,
  contentType = "comparison",
  content = null,
}: {
  sides: [SideInfo, SideInfo];
  placement: "hero_search" | "final_cta";
  contentType?: "comparison";
  content?: SeoContentContext | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {sides.map((side) => (
        <SeoCtaLink
          key={side.slug}
          href={side.hotelHref}
          typTresci={contentType}
          ctaType={placement}
          destinationSlug={side.slug}
          content={content}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-brand px-4 text-center transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <span className="text-sm font-bold leading-tight text-white">Hotele: {side.name}</span>
        </SeoCtaLink>
      ))}
    </div>
  );
}

export function VerdictColumns({ options, compact = false }: { options: ComparisonVerdictOption[]; compact?: boolean }) {
  return (
    <div className={`grid gap-x-8 gap-y-8 ${compact ? "grid-cols-2 gap-x-4" : "sm:grid-cols-2"}`}>
      {options.map((option) => (
        <div key={option.label}>
          {/* Nazwa zostaje w mianowniku: „Wybierz Barcelona" byłoby błędem (biernik:
              „Barcelonę"), a odmiany nazw nie mamy w danych. */}
          <h3 className={`font-display font-semibold text-ink ${compact ? "text-lg" : "text-xl"}`}>{option.label} — wybierz, jeśli</h3>
          <ul className={`mt-3 space-y-3 ${compact ? "text-sm leading-6" : "text-base leading-7"}`}>
            {option.chooseIf.map((item) => (
              <li key={item} className="flex gap-2.5 text-ink">
                <Check aria-hidden className="mt-1 h-4 w-4 shrink-0 text-brand" strokeWidth={2.5} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {option.skipIf.length > 0 ? (
            <ul className={`mt-3 space-y-3 ${compact ? "text-sm leading-6" : "text-base leading-7"}`}>
              {option.skipIf.map((item) => (
                <li key={item} className="flex gap-2.5 text-ink-muted">
                  <X aria-hidden className="mt-1 h-4 w-4 shrink-0 text-ink-muted" strokeWidth={2.5} />
                  <span>
                    <span className="font-semibold text-ink">Odpuść, jeśli</span> {item}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export interface FactRow {
  label: string;
  a: string;
  b: string;
}

/**
 * Tabela porównawcza czytelna na 390 px: etykieta w osobnym wierszu, pod nią
 * dwie wartości obok siebie. Zero przewijania w poziomie, nic nie ginie.
 * W HTML to prawdziwa <table> — czytniki ekranu dostają nagłówki kolumn.
 */
export function FactTable({ caption, nameA, nameB, rows, note }: { caption: string; nameA: string; nameB: string; rows: FactRow[]; note?: string }) {
  return (
    <div>
      {/* Na telefonie tabela jest układem blokowym (etykieta nad parą wartości),
          od `sm` zwykłą tabelą. `display:block` zdejmuje z <table> semantykę
          w części przeglądarek, dlatego role ARIA są podane jawnie. */}
      <table role="table" className="block w-full border-collapse text-left sm:table">
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup" className="block sm:table-header-group">
          <tr role="row" className="grid grid-cols-2 border-b border-ink/80 sm:table-row">
            {/* sr-only zamiast hidden: przy display:none czytnik przypisywał wartości
                strony A do nagłówka strony B (wiersze mają trzy komórki). */}
            <th role="columnheader" scope="col" className="sr-only w-[30%] py-2 pr-4 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted sm:not-sr-only sm:table-cell">
              Kryterium
            </th>
            <th role="columnheader" scope="col" className="py-2 pr-3 font-display text-lg font-semibold text-ink sm:w-[35%]">
              {nameA}
            </th>
            <th role="columnheader" scope="col" className="py-2 pl-3 font-display text-lg font-semibold text-ink sm:w-[35%] sm:pl-0">
              {nameB}
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup" className="block sm:table-row-group">
          {rows.map((row) => (
            <tr key={row.label} role="row" className="grid grid-cols-2 border-b border-line py-3 sm:table-row sm:py-0">
              <th role="rowheader" scope="row" className="col-span-2 pb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted sm:py-3 sm:pr-4 sm:align-top">
                {row.label}
              </th>
              <td role="cell" className="pr-3 text-sm leading-6 text-ink sm:py-3 sm:align-top sm:text-base">
                {row.a}
              </td>
              <td role="cell" className="border-l border-line pl-3 text-sm leading-6 text-ink sm:border-l-0 sm:py-3 sm:pl-0 sm:align-top sm:text-base">
                {row.b}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {note ? <p className="mt-3 text-xs leading-6 text-ink-muted">{note}</p> : null}
    </div>
  );
}

/** „Taśma": wartość A | etykieta | wartość B — do krótkich wartości liczbowych. */
export function TapeTable({ caption, nameA, nameB, rows, note }: { caption: string; nameA: string; nameB: string; rows: FactRow[]; note?: string }) {
  return (
    <div>
      <table className="w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-ink/80">
            <th scope="col" className="w-[36%] py-2 text-right font-display text-lg font-semibold text-ink">{nameA}</th>
            <th scope="col" className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
              <span className="sr-only">Kryterium</span>
            </th>
            <th scope="col" className="w-[36%] py-2 text-left font-display text-lg font-semibold text-ink">{nameB}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-line">
              <td className="py-3 text-right text-base font-semibold tabular-nums text-ink">{row.a}</td>
              <th scope="row" className="px-2 py-3 text-center text-xs font-medium leading-4 text-ink-muted">{row.label}</th>
              <td className="py-3 text-left text-base font-semibold tabular-nums text-ink">{row.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {note ? <p className="mt-3 text-xs leading-6 text-ink-muted">{note}</p> : null}
    </div>
  );
}

type EditorialSection = Exclude<Section, { kind: "verdict" }>;

/** Sekcje redakcyjne z dokumentu treści: proza, lista, tabela faktów, FAQ. */
export function EditorialSections({ sections, nameA, nameB }: { sections: EditorialSection[]; nameA: string; nameB: string }) {
  return (
    <>
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`sekcja-${section.id}`}>
          <h2 id={`sekcja-${section.id}`} className="font-display text-2xl font-semibold text-ink sm:text-3xl">
            {section.heading}
          </h2>
          {section.kind === "prose" ? (
            <div className="mt-4 max-w-[65ch] space-y-4">
              {section.paragraphs.map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 24)}`} className="text-base leading-7 text-ink">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : null}
          {section.kind === "list" ? (
            <div className="mt-4 max-w-[65ch]">
              {section.intro ? <p className="text-base leading-7 text-ink">{section.intro}</p> : null}
              <ul className="mt-3 space-y-2.5">
                {section.items.map((item, index) => (
                  <li key={`${index}-${item.slice(0, 24)}`} className="flex gap-3 text-base leading-7 text-ink">
                    <span aria-hidden className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {section.kind === "table" ? (
            <div className="mt-4">
              {section.intro ? <p className="mb-3 max-w-[65ch] text-base leading-7 text-ink">{section.intro}</p> : null}
              <FactTable
                caption={section.heading}
                nameA={section.columns[1] ?? nameA}
                nameB={section.columns[2] ?? nameB}
                rows={section.rows.map((row) => ({ label: row.label, a: row.cells[0] ?? "—", b: row.cells[1] ?? "—" }))}
                note={section.note}
              />
            </div>
          ) : null}
          {section.kind === "faq" ? (
            <div className="mt-4 divide-y divide-line border-y border-line">
              {section.items.map((item) => (
                <details key={item.question} className="group py-1">
                  <summary className="flex min-h-11 cursor-pointer items-center text-base font-semibold text-ink">{item.question}</summary>
                  <p className="pb-4 text-base leading-7 text-ink-muted">{item.answer}</p>
                </details>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </>
  );
}

/** Jawne źródła, data sprawdzenia i informacja o udziale AI. */
export function SourcesNote({
  sources,
  verifiedAt,
  aiDisclosure,
}: {
  sources: Source[];
  verifiedAt: string | null;
  aiDisclosure: string | null;
}) {
  if (sources.length === 0) return null;
  return (
    <section aria-labelledby="zrodla" className="border-t border-line pt-6">
      <h2 id="zrodla" className="text-sm font-semibold uppercase tracking-[0.12em] text-ink-muted">
        Źródła i sposób pracy
      </h2>
      {verifiedAt ? (
        <p className="mt-3 text-sm leading-6 text-ink">
          Źródła sprawdzone <time dateTime={verifiedAt}>{formatReviewDate(verifiedAt)}</time>.
        </p>
      ) : null}
      <ol className="mt-3 space-y-1.5 text-sm leading-6 text-ink-muted">
        {sources.map((source) => (
          <li key={source.id}>
            <a href={source.url} rel="noopener nofollow" target="_blank" className="underline decoration-line underline-offset-4 transition hover:decoration-brand">
              <span className="text-ink">{source.title}</span>
            </a>{" "}
            — {source.publisher}
          </li>
        ))}
      </ol>
      {aiDisclosure ? <p className="mt-4 max-w-[65ch] text-xs leading-6 text-ink-muted">{aiDisclosure}</p> : null}
    </section>
  );
}

export function LinkPills({ links }: { links: Array<{ href: string; label: string }> }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface-raised px-4 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-semibold text-ink">{link.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
