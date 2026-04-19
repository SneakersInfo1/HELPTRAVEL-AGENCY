import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { comparisonPairs, getComparisonPairBySlug } from "@/lib/mvp/comparisons";
import { getDestinationGuideBySlug } from "@/lib/mvp/publisher-content";
import { getSiteUrl } from "@/lib/mvp/site";
import { getAffiliateConfig } from "@/lib/mvp/affiliate-config";
import { Stay22Widget } from "@/components/affiliate/stay22-widget";
import { AviasalesCta } from "@/components/affiliate/aviasales-cta";
import type { DestinationProfile } from "@/lib/mvp/types";

export const revalidate = 86400;

interface PageProps {
  params: Promise<{ para: string }>;
}

export async function generateStaticParams() {
  return comparisonPairs.map((pair) => ({ para: pair.slug }));
}

function avgYear(temps: number[]) {
  return Math.round(temps.reduce((a, b) => a + b, 0) / temps.length);
}

function summerAvg(temps: number[]) {
  return Math.round((temps[5] + temps[6] + temps[7]) / 3);
}

function winterAvg(temps: number[]) {
  return Math.round((temps[11] + temps[0] + temps[1]) / 3);
}

function budget(d: DestinationProfile) {
  const days = 4;
  const travelers = 2;
  const flightBase = 380 + d.typicalFlightHoursFromPL * 70;
  const stay = 170 * d.costIndex;
  const local = 65 * d.costIndex;
  const total = travelers * flightBase + travelers * days * stay + days * local;
  return Math.round(total);
}

function pickWinner(a: DestinationProfile, b: DestinationProfile, key: keyof DestinationProfile, higher = true) {
  const av = a[key] as number;
  const bv = b[key] as number;
  if (Math.abs(av - bv) < 0.05) return null;
  return (higher ? av > bv : av < bv) ? a : b;
}

function buildVerdict(a: DestinationProfile, b: DestinationProfile): { title: string; body: string }[] {
  const verdicts: { title: string; body: string }[] = [];

  const cheaper = a.costIndex < b.costIndex - 0.05 ? a : b.costIndex < a.costIndex - 0.05 ? b : null;
  if (cheaper) {
    const other = cheaper === a ? b : a;
    verdicts.push({
      title: "Budzet",
      body: `${cheaper.city} wypada zwykle taniej niz ${other.city} — przy podobnym briefie latwiej obronic kierunek tanszy.`,
    });
  } else {
    verdicts.push({
      title: "Budzet",
      body: `${a.city} i ${b.city} graja w podobnym pulapie cenowym, wiec budzet rzadko jest decydujacy.`,
    });
  }

  const beach = pickWinner(a, b, "beachScore");
  if (beach) {
    verdicts.push({
      title: "Plaza i klimat morski",
      body: `${beach.city} ma mocniejszy profil plazowy — to lepszy wybor pod reset nad morzem.`,
    });
  }

  const city = pickWinner(a, b, "cityScore");
  if (city) {
    verdicts.push({
      title: "City break i tlo miejskie",
      body: `${city.city} jest mocniejszy jako klasyczny city break z gestszym zwiedzaniem i klimatem ulicznym.`,
    });
  }

  const access = pickWinner(a, b, "accessScore");
  if (access) {
    verdicts.push({
      title: "Dolot z Polski",
      body: `${access.city} ma latwiejsza i bardziej regularna logistyke z Polski — sensowny wybor pod krotki wyjazd.`,
    });
  }

  return verdicts;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { para } = await params;
  const pair = getComparisonPairBySlug(para);
  if (!pair) return { title: "Porownanie kierunkow" };
  const ga = getDestinationGuideBySlug(pair.a);
  const gb = getDestinationGuideBySlug(pair.b);
  if (!ga || !gb) return { title: "Porownanie kierunkow" };

  return {
    title: `${ga.destination.city} czy ${gb.destination.city}? Porownanie pod krotki wyjazd`,
    description: `${ga.destination.city} kontra ${gb.destination.city}: pogoda, koszty, dolot z Polski i charakter wyjazdu. ${pair.intent}.`,
    alternates: { canonical: `/porownanie/${pair.slug}` },
    openGraph: {
      title: `${ga.destination.city} vs ${gb.destination.city} — porownanie HelpTravel`,
      description: `Konkretne porownanie ${ga.destination.city} i ${gb.destination.city} pod realna decyzje wyjazdowa.`,
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

  const a = ga.destination;
  const b = gb.destination;
  const verdicts = buildVerdict(a, b);
  const baseUrl = getSiteUrl();
  const config = getAffiliateConfig();

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: `${a.city} czy ${b.city}? Porownanie pod krotki wyjazd`,
        description: pair.intent,
        url: `${baseUrl}/porownanie/${pair.slug}`,
        inLanguage: "pl-PL",
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: "Kierunki", item: `${baseUrl}/kierunki` },
          {
            "@type": "ListItem",
            position: 3,
            name: `${a.city} vs ${b.city}`,
            item: `${baseUrl}/porownanie/${pair.slug}`,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: verdicts.map((v) => ({
          "@type": "Question",
          name: `${a.city} czy ${b.city} — ${v.title}?`,
          acceptedAnswer: { "@type": "Answer", text: v.body },
        })),
      },
    ],
  };

  const compareRows = [
    {
      label: "Lot z Polski (h)",
      av: `~${a.typicalFlightHoursFromPL.toFixed(1)} h`,
      bv: `~${b.typicalFlightHoursFromPL.toFixed(1)} h`,
    },
    {
      label: "Srednia roczna temperatura",
      av: `${avgYear(a.avgTempByMonth)}°C`,
      bv: `${avgYear(b.avgTempByMonth)}°C`,
    },
    { label: "Lato (cze-sie)", av: `${summerAvg(a.avgTempByMonth)}°C`, bv: `${summerAvg(b.avgTempByMonth)}°C` },
    { label: "Zima (gru-lut)", av: `${winterAvg(a.avgTempByMonth)}°C`, bv: `${winterAvg(b.avgTempByMonth)}°C` },
    {
      label: "Budzet 2 os / 4 dni",
      av: `~${budget(a).toLocaleString("pl-PL")} PLN`,
      bv: `~${budget(b).toLocaleString("pl-PL")} PLN`,
    },
    { label: "Profil plazowy", av: `${Math.round(a.beachScore * 100)}/100`, bv: `${Math.round(b.beachScore * 100)}/100` },
    { label: "City break", av: `${Math.round(a.cityScore * 100)}/100`, bv: `${Math.round(b.cityScore * 100)}/100` },
    {
      label: "Zwiedzanie",
      av: `${Math.round(a.sightseeingScore * 100)}/100`,
      bv: `${Math.round(b.sightseeingScore * 100)}/100`,
    },
    {
      label: "Dolot/dostepnosc",
      av: `${Math.round(a.accessScore * 100)}/100`,
      bv: `${Math.round(b.accessScore * 100)}/100`,
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <Script id={`compare-${pair.slug}-jsonld`} type="application/ld+json">
        {JSON.stringify(structuredData)}
      </Script>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_20px_60px_rgba(16,84,48,0.06)]">
        <Breadcrumbs
          items={[
            { label: "Start", href: "/" },
            { label: "Kierunki", href: "/kierunki" },
            { label: `${a.city} vs ${b.city}` },
          ]}
        />
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Porownanie kierunkow</p>
        <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[0.95] text-emerald-950">
          {a.city} czy {b.city}? Porownanie pod realna decyzje wyjazdowa.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">{pair.intent}.</p>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-emerald-900/70">
              <th className="py-2 pr-4 font-semibold">Parametr</th>
              <th className="py-2 px-3 font-semibold text-emerald-950">{a.city}</th>
              <th className="py-2 px-3 font-semibold text-emerald-950">{b.city}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-900/10">
            {compareRows.map((row) => (
              <tr key={row.label}>
                <td className="py-2 pr-4 text-emerald-900/80">{row.label}</td>
                <td className="py-2 px-3 font-semibold text-emerald-950">{row.av}</td>
                <td className="py-2 px-3 font-semibold text-emerald-950">{row.bv}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {verdicts.map((v) => (
          <article key={v.title} className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-50/72 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{v.title}</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900/82">{v.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {[
          { dest: a, guide: ga },
          { dest: b, guide: gb },
        ].map(({ dest, guide }) => (
          <article
            key={dest.slug}
            className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="font-display text-2xl text-emerald-950">{dest.city}</h2>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">{guide.overview}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/kierunki/${dest.slug}`}
                className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800"
              >
                Pelny przewodnik
              </Link>
              <Link
                href={`/planner?destination=${encodeURIComponent(dest.city)}`}
                className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-100"
              >
                Zaplanuj wyjazd
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {[
          { dest: a, campaign: `compare-${pair.slug}-a` },
          { dest: b, campaign: `compare-${pair.slug}-b` },
        ].map(({ dest, campaign }) => (
          <div key={dest.slug} className="flex flex-col gap-4">
            <Stay22Widget
              city={dest.city}
              country={dest.country}
              aid={config.stay22Aid}
              campaign={campaign}
              height={360}
            />
            <AviasalesCta
              city={dest.city}
              country={dest.country}
              campaign={campaign}
              flightHours={dest.typicalFlightHoursFromPL}
            />
          </div>
        ))}
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="font-display text-2xl text-emerald-950">Inne porownania</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {comparisonPairs
            .filter((p) => p.slug !== pair.slug)
            .slice(0, 12)
            .map((p) => {
              const ag = getDestinationGuideBySlug(p.a);
              const bg = getDestinationGuideBySlug(p.b);
              if (!ag || !bg) return null;
              return (
                <Link
                  key={p.slug}
                  href={`/porownanie/${p.slug}`}
                  className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
                >
                  {ag.destination.city} vs {bg.destination.city}
                </Link>
              );
            })}
        </div>
      </section>
    </main>
  );
}
