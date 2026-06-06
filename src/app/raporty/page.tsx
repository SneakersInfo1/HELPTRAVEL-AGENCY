import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { reports } from "@/lib/mvp/reports";
import { getSiteUrl } from "@/lib/mvp/site";

export const metadata: Metadata = {
  title: "Raporty i dane o podróżach",
  description:
    "Autorskie raporty HelpTravel oparte na własnych danych: gdzie z Polski jest ciepło i tanio, ile kosztują wyjazdy i kiedy lecieć. Dane do cytowania ze wskazaniem źródła.",
  alternates: { canonical: "/raporty" },
  openGraph: {
    title: "Raporty i dane HelpTravel",
    description: "Oryginalne analizy oparte na danych o 235+ kierunkach z Polski.",
    url: `${getSiteUrl()}/raporty`,
    type: "website",
    locale: "pl_PL",
  },
};

export default function ReportsHubPage() {
  const baseUrl = getSiteUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${baseUrl}/raporty`,
        url: `${baseUrl}/raporty`,
        name: "Raporty i dane o podróżach — HelpTravel",
        inLanguage: "pl-PL",
        isPartOf: { "@id": `${baseUrl}/#website` },
      },
      {
        "@type": "ItemList",
        numberOfItems: reports.length,
        itemListElement: reports.map((r, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: r.title,
          url: `${baseUrl}/raporty/${r.slug}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: "Raporty", item: `${baseUrl}/raporty` },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_20px_60px_rgba(16,84,48,0.06)] sm:p-8">
        <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: "Raporty" }]} />
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Raporty i dane</p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl leading-[1.08] text-emerald-950 sm:text-4xl md:text-5xl md:leading-[0.95]">
          Dane o podróżach z Polski — bez marketingu
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Liczymy to, o co naprawdę pytają podróżni: gdzie jest ciepło i tanio, ile kosztuje wyjazd, kiedy lecieć.
          Każdy raport opiera się na naszej bazie ponad 235 kierunków — możesz go cytować, podając źródło.
        </p>
      </section>

      <section className="grid gap-5 sm:grid-cols-2">
        {reports.map((report) => (
          <article
            key={report.slug}
            className="flex flex-col rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{report.kicker}</p>
            <h2 className="mt-2 font-display text-2xl text-emerald-950">{report.title}</h2>
            <p className="mt-3 flex-1 text-sm leading-7 text-emerald-900/76">{report.dek}</p>
            <Link
              href={`/raporty/${report.slug}`}
              className="mt-5 inline-flex h-11 w-fit items-center justify-center rounded-full bg-emerald-700 px-6 text-sm font-bold transition hover:bg-emerald-800"
            >
              <span className="text-white">Zobacz raport →</span>
            </Link>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-emerald-50/60 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <p className="text-sm leading-7 text-emerald-900/80">
          Jesteś dziennikarzem lub blogerem i potrzebujesz danych pod konkretny temat?{" "}
          <Link href="/kontakt" className="font-semibold underline-offset-2 hover:underline">
            <span className="text-emerald-700">Napisz do redakcji</span>
          </Link>{" "}
          — przygotujemy wycinek. Więcej o metodzie:{" "}
          <Link href="/redakcja" className="font-semibold underline-offset-2 hover:underline">
            <span className="text-emerald-700">redakcja i metodologia</span>
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
