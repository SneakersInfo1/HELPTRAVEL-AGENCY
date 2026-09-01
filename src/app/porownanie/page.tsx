// /porownanie — hub index for all destination comparison pages. A rankable
// landing for "porównanie kierunków" queries and an internal-linking hub that
// passes equity to every /porownanie/[para] page. No per-destination images
// here (keeps it fast — the detail pages own the rich media).

import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { comparisonPairs } from "@/lib/mvp/comparisons";
import { getDestinationGuideBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";
import { SHELL_DISCOVERY } from "@/lib/ui/layout";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Porównania kierunków — który wybrać na wyjazd?",
  description:
    "Bezpośrednie porównania popularnych kierunków z Polski: pogoda, koszty, plaża, zwiedzanie i dolot. Kreta czy Turcja, Majorka czy Cypr, Rzym czy Ateny i wiele więcej.",
  alternates: { canonical: "/porownanie" },
  openGraph: {
    title: "Porównania kierunków — HelpTravel",
    description:
      "Konkretne porównania kierunków pod realną decyzję wyjazdową: pogoda, koszty, plaża, zwiedzanie i dolot z Polski.",
    url: `${getSiteUrl()}/porownanie`,
    type: "website",
  },
};

export default function ComparisonsHubPage() {
  const baseUrl = getSiteUrl();

  const items = comparisonPairs
    .map((p) => {
      const ga = getDestinationGuideBySlug(p.a);
      const gb = getDestinationGuideBySlug(p.b);
      if (!ga || !gb) return null;
      return {
        slug: p.slug,
        intent: p.intent,
        nameA: p.labelA ?? ga.destination.city,
        nameB: p.labelB ?? gb.destination.city,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => `${a.nameA} ${a.nameB}`.localeCompare(`${b.nameA} ${b.nameB}`, "pl"));

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Porównania kierunków",
        description:
          "Bezpośrednie porównania popularnych kierunków z Polski pod realną decyzję wyjazdową.",
        url: `${baseUrl}/porownanie`,
        inLanguage: "pl-PL",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: "Porównania", item: `${baseUrl}/porownanie` },
        ],
      },
      {
        "@type": "ItemList",
        name: "Porównania kierunków",
        itemListElement: items.map((it, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${baseUrl}/porownanie/${it.slug}`,
          name: `${it.nameA} vs ${it.nameB}`,
        })),
      },
    ],
  };

  return (
    <main className={`flex w-full flex-1 flex-col gap-8 py-6 ${SHELL_DISCOVERY}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <section className="rounded-[2.5rem] border border-line bg-surface-raised p-6 shadow-sm sm:p-9">
        <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: "Porównania" }]} />
        <h1 className="mt-3 max-w-4xl font-display text-4xl leading-[1.02] text-ink sm:text-5xl">
          Który kierunek wybrać? Porównaj je obok siebie
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">
          Nie wiesz, dokąd polecieć? Te porównania zestawiają dwa popularne kierunki na konkretach:
          pogoda miesiąc po miesiącu, orientacyjny budżet na 4 dni, profil plażowy i miejski oraz
          dolot z Polski. Każde kończy się jasnym wskazaniem, dla kogo lepszy będzie który kierunek.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 py-3 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-bold text-white">Otwórz wyszukiwarkę hoteli</span>
          </Link>
          <Link
            href="/kierunki"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-5 py-3 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-semibold text-ink">Wszystkie kierunki</span>
          </Link>
        </div>
        <p className="mt-5 text-sm text-ink-muted">{items.length} porównań i stale rośnie.</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Link
            key={it.slug}
            href={`/porownanie/${it.slug}`}
            className="group flex flex-col rounded-2xl border border-line bg-surface-raised p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-line hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <h2 className="font-display text-xl text-ink">
              {it.nameA} <span className="text-brand">vs</span> {it.nameB}
            </h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-ink-muted">{it.intent}.</p>
            <span className="mt-4 text-sm font-semibold text-brand transition group-hover:text-ink">
              Zobacz porównanie
            </span>
          </Link>
        ))}
      </section>

      <section className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-sm sm:p-8">
        <h2 className="font-display text-2xl text-ink sm:text-3xl">
          Jak korzystać z porównań?
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">
          Zacznij od tego, co jest dla Ciebie najważniejsze: jeśli liczy się plaża i pogoda — patrz
          na profil plażowy i temperatury w wybranym miesiącu. Jeśli zwiedzanie — na profil miejski i
          listę atrakcji w przewodnikach. Budżet na 4 dni jest orientacyjny (lot, nocleg, jedzenie,
          transport), a realne ceny sprawdzisz w wyszukiwarce w kilka sekund.
        </p>
      </section>
    </main>
  );
}
