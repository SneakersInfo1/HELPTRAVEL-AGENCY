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

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Porównania kierunków — który wybrać na wyjazd? | HelpTravel",
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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <section className="rounded-[2.5rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_20px_60px_rgba(16,84,48,0.06)] sm:p-9">
        <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: "Porównania" }]} />
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
          Porównania kierunków
        </p>
        <h1 className="mt-3 max-w-4xl font-display text-4xl leading-[1.02] text-emerald-950 sm:text-5xl">
          Który kierunek wybrać? Porównaj je obok siebie
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Nie wiesz, dokąd polecieć? Te porównania zestawiają dwa popularne kierunki na konkretach:
          pogoda miesiąc po miesiącu, orientacyjny budżet na 4 dni, profil plażowy i miejski oraz
          dolot z Polski. Każde kończy się jasnym wskazaniem, dla kogo lepszy będzie który kierunek.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold transition hover:bg-emerald-800"
          >
            <span className="text-white">Otwórz wyszukiwarkę hoteli →</span>
          </Link>
          <Link
            href="/kierunki"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-emerald-900/10 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
          >
            Wszystkie kierunki
          </Link>
        </div>
        <p className="mt-5 text-sm text-emerald-900/60">{items.length} porównań i stale rośnie.</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Link
            key={it.slug}
            href={`/porownanie/${it.slug}`}
            className="group flex flex-col rounded-[1.5rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_12px_32px_rgba(16,84,48,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-emerald-300 hover:shadow-[0_20px_44px_rgba(16,84,48,0.12)]"
          >
            <h2 className="font-display text-xl text-emerald-950">
              {it.nameA} <span className="text-emerald-600">vs</span> {it.nameB}
            </h2>
            <p className="mt-2 flex-1 text-sm leading-6 text-emerald-900/72">{it.intent}.</p>
            <span className="mt-4 text-sm font-semibold text-emerald-700 transition group-hover:text-emerald-800">
              Zobacz porównanie →
            </span>
          </Link>
        ))}
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <h2 className="font-display text-2xl text-emerald-950 sm:text-3xl">
          Jak korzystać z porównań?
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-900/80">
          Zacznij od tego, co jest dla Ciebie najważniejsze: jeśli liczy się plaża i pogoda — patrz
          na profil plażowy i temperatury w wybranym miesiącu. Jeśli zwiedzanie — na profil miejski i
          listę atrakcji w przewodnikach. Budżet na 4 dni jest orientacyjny (lot, nocleg, jedzenie,
          transport), a realne ceny sprawdzisz w wyszukiwarce w kilka sekund.
        </p>
      </section>
    </main>
  );
}
