import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuthorByline } from "@/components/publisher/author-byline";
import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { EDITOR_IN_CHIEF, personSchema } from "@/lib/mvp/authors";
import {
  buildWarmValueRanking,
  getReportBySlug,
  reports,
  warmValueKeyFindings,
} from "@/lib/mvp/reports";
import { getSiteUrl } from "@/lib/mvp/site";

export const revalidate = 86400;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return reports.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const report = getReportBySlug(slug);
  if (!report) return { title: "Raport" };
  return {
    title: report.metaTitle,
    description: report.metaDescription,
    alternates: { canonical: `/raporty/${report.slug}` },
    openGraph: {
      title: report.metaTitle,
      description: report.metaDescription,
      url: `${getSiteUrl()}/raporty/${report.slug}`,
      type: "article",
      locale: "pl_PL",
    },
  };
}

export default async function ReportPage({ params }: PageProps) {
  const { slug } = await params;
  const report = getReportBySlug(slug);
  if (!report) notFound();

  const baseUrl = getSiteUrl();
  const year = new Date().getFullYear();
  const ranking = buildWarmValueRanking(30);
  const findings = warmValueKeyFindings();
  const nowISO = new Date().toISOString();
  const citation = `Źródło: HelpTravel — „${report.title} ${year}", ${baseUrl}/raporty/${report.slug}`;

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: `${report.title} ${year}`,
        description: report.metaDescription,
        url: `${baseUrl}/raporty/${report.slug}`,
        mainEntityOfPage: `${baseUrl}/raporty/${report.slug}`,
        inLanguage: "pl-PL",
        datePublished: report.publishedISO,
        dateModified: nowISO,
        author: personSchema(EDITOR_IN_CHIEF),
        publisher: { "@id": `${baseUrl}/#organization` },
      },
      {
        "@type": "Dataset",
        name: `${report.title} ${year} — dane HelpTravel`,
        description: report.metaDescription,
        url: `${baseUrl}/raporty/${report.slug}`,
        creator: { "@id": `${baseUrl}/#organization` },
        dateModified: nowISO,
        inLanguage: "pl-PL",
        isAccessibleForFree: true,
        license: `${baseUrl}/raporty/${report.slug}`,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: "Raporty", item: `${baseUrl}/raporty` },
          { "@type": "ListItem", position: 3, name: report.title, item: `${baseUrl}/raporty/${report.slug}` },
        ],
      },
    ],
  };

  const findingCards = [
    findings.longestWarm
      ? {
          kicker: "Najdłużej ciepło",
          value: findings.longestWarm.name,
          sub: `${findings.longestWarm.warmMonths} komfortowych miesięcy w roku (18-30°C)`,
        }
      : null,
    findings.cheapestWarm
      ? {
          kicker: "Najtaniej w cieple",
          value: findings.cheapestWarm.name,
          sub: `poziom kosztów na miejscu: ${findings.cheapestWarm.costLabel}`,
        }
      : null,
    findings.shortestFlight
      ? {
          kicker: "Najbliżej (najkrótszy lot)",
          value: findings.shortestFlight.name,
          sub: `ok. ${findings.shortestFlight.flightHours} h lotu z Polski`,
        }
      : null,
  ].filter(Boolean) as Array<{ kicker: string; value: string; sub: string }>;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      {/* HERO */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_20px_60px_rgba(16,84,48,0.06)] sm:p-8">
        <Breadcrumbs
          items={[{ label: "Start", href: "/" }, { label: "Raporty", href: "/raporty" }, { label: report.title }]}
        />
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{report.kicker}</p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl leading-[1.08] text-emerald-950 sm:text-4xl md:text-5xl md:leading-[0.95]">
          {report.title} ({year})
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">{report.dek}</p>
        <AuthorByline author={EDITOR_IN_CHIEF} updatedISO={nowISO} className="mt-6" />
      </section>

      {/* KEY FINDINGS — citable soundbites */}
      {findingCards.length > 0 && (
        <section className="grid gap-4 sm:grid-cols-3">
          {findingCards.map((card) => (
            <article
              key={card.kicker}
              className="rounded-[1.6rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-5"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{card.kicker}</p>
              <p className="mt-2 font-display text-2xl text-emerald-950">{card.value}</p>
              <p className="mt-1 text-xs leading-6 text-emerald-900/70">{card.sub}</p>
            </article>
          ))}
        </section>
      )}

      {/* RANKING TABLE */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <h2 className="font-display text-2xl text-emerald-950 sm:text-3xl">
          Ranking: top {ranking.length} kierunków na ciepło i tanio
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-emerald-900/72">
          Wynik łączny (0-100) premiuje liczbę komfortowych miesięcy, niższe koszty, krótszy lot i profil plażowy.
          Kliknij kierunek, aby zobaczyć pełny przewodnik i aktualne ceny.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left text-emerald-900/70">
                <th className="py-2 pr-3 font-semibold">#</th>
                <th className="py-2 pr-3 font-semibold">Kierunek</th>
                <th className="py-2 px-3 font-semibold">Indeks</th>
                <th className="py-2 px-3 font-semibold">Ciepłe mies.</th>
                <th className="py-2 px-3 font-semibold">Lato</th>
                <th className="py-2 px-3 font-semibold">Koszty</th>
                <th className="py-2 px-3 font-semibold">Lot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/10">
              {ranking.map((row) => (
                <tr key={row.slug} className="align-middle">
                  <td className="py-2 pr-3 font-bold text-emerald-700">{row.rank}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/kierunki/${row.slug}`} className="font-semibold underline-offset-2 hover:underline">
                      <span className="text-emerald-900">{row.name}</span>
                    </Link>
                    <span className="block text-xs text-emerald-900/55">{row.country}</span>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-emerald-100">
                        <span
                          className="block h-full rounded-full bg-emerald-600"
                          style={{ width: `${row.score100}%` }}
                        />
                      </span>
                      <span className="font-semibold text-emerald-950">{row.score100}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-emerald-900/85">{row.warmMonths}/12</td>
                  <td className="py-2 px-3 text-emerald-900/85">{row.avgSummer}°C</td>
                  <td className="py-2 px-3 capitalize text-emerald-900/85">{row.costLabel}</td>
                  <td className="py-2 px-3 text-emerald-900/85">~{row.flightHours} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* METODOLOGIA */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-emerald-50/60 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Metodologia</p>
        <h2 className="mt-2 font-display text-2xl text-emerald-950 sm:text-3xl">Jak liczyliśmy ten ranking</h2>
        <ul className="mt-4 space-y-2">
          {report.methodology.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-7 text-emerald-900/80">
              <span aria-hidden className="text-emerald-600">
                •
              </span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      {/* CYTUJ TEN RAPORT — digital-PR hook */}
      <section className="rounded-[2rem] border border-emerald-300/50 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Cytuj ten raport</p>
        <h2 className="mt-2 font-display text-2xl text-emerald-950 sm:text-3xl">Dla dziennikarzy i blogerów</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-900/78">
          Dane z tego raportu możesz wykorzystać za darmo — prosimy tylko o podanie źródła z linkiem do tej strony.
          Chętnie przygotujemy też wycinek danych dla konkretnego kierunku lub regionu.
        </p>
        <div className="mt-4 rounded-2xl bg-emerald-950 p-4 text-sm text-emerald-50">
          <code className="break-words">{citation}</code>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/kontakt"
            className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-700 px-6 text-sm font-bold transition hover:bg-emerald-800"
          >
            <span className="text-white">Poproś o dane / komentarz →</span>
          </Link>
          <Link
            href="/redakcja"
            className="inline-flex h-11 items-center justify-center rounded-full border border-emerald-900/15 bg-white px-6 text-sm font-semibold transition hover:bg-emerald-50"
          >
            <span className="text-emerald-900">Metodologia i redakcja</span>
          </Link>
        </div>
      </section>

      {/* WEWNĘTRZNE LINKI */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="font-display text-2xl text-emerald-950">Sprawdź dalej</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/porownanie"
            className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2 text-xs font-semibold transition hover:bg-emerald-100"
          >
            <span className="text-emerald-900">Porównania kierunków</span>
          </Link>
          <Link
            href="/wyjazdy/slonce-zima"
            className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2 text-xs font-semibold transition hover:bg-emerald-100"
          >
            <span className="text-emerald-900">Słońce zimą</span>
          </Link>
          <Link
            href="/kierunki"
            className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2 text-xs font-semibold transition hover:bg-emerald-100"
          >
            <span className="text-emerald-900">Wszystkie kierunki</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
