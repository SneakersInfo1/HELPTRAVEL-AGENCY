import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { notFound } from "next/navigation";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { comparisonPairs, getComparisonPairBySlug } from "@/lib/mvp/comparisons";
import { getArticlesForDestination, getDestinationGuideBySlug } from "@/lib/mvp/publisher-content";
import { polishMonthLabels, polishMonthSlugs } from "@/lib/mvp/months";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";
import { AviasalesCta } from "@/components/affiliate/aviasales-cta";
import type { DestinationProfile } from "@/lib/mvp/types";
import type { EditorialArticle } from "@/lib/mvp/publisher-content";

export const revalidate = 86400;

interface PageProps {
  params: Promise<{ para: string }>;
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

// Komfortowe miesiące (18-30°C) — ta sama heurystyka co na commercial landingach.
function bestMonths(d: DestinationProfile): string[] {
  return d.avgTempByMonth
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t >= 18 && t <= 30)
    .map(({ i }) => polishMonthLabels[polishMonthSlugs[i]]);
}

// Dla kogo dany kierunek — czytane z profilu (score 0-1), bez fabrykacji.
function audienceTags(d: DestinationProfile): string[] {
  const tags: string[] = [];
  if (d.beachScore >= 0.7) tags.push("plaży i wypoczynku nad morzem");
  if (d.cityScore >= 0.7) tags.push("klasycznego city breaku");
  if (d.sightseeingScore >= 0.7) tags.push("zwiedzania i zabytków");
  if (d.nightlifeScore >= 0.72) tags.push("nocnego życia");
  if (d.natureScore >= 0.78) tags.push("natury i krajobrazów");
  if (d.costIndex <= 1.0) tags.push("napiętego budżetu");
  if (d.typicalFlightHoursFromPL <= 3.3) tags.push("krótkiego wypadu (bliski lot)");
  if (tags.length === 0) tags.push("uniwersalnego wyjazdu na 3-5 dni");
  return tags.slice(0, 4);
}

function pickWinner(a: DestinationProfile, b: DestinationProfile, key: keyof DestinationProfile, higher = true) {
  const av = a[key] as number;
  const bv = b[key] as number;
  if (Math.abs(av - bv) < 0.05) return null;
  return (higher ? av > bv : av < bv) ? a : b;
}

// `nameA`/`nameB` to nazwy wyświetlane (etykieta wyspy lub miasto z profilu).
function buildVerdict(
  a: DestinationProfile,
  b: DestinationProfile,
  nameA: string,
  nameB: string,
): { title: string; body: string }[] {
  const verdicts: { title: string; body: string }[] = [];
  const nameOf = (d: DestinationProfile) => (d === a ? nameA : nameB);

  const cheaper = a.costIndex < b.costIndex - 0.05 ? a : b.costIndex < a.costIndex - 0.05 ? b : null;
  if (cheaper) {
    verdicts.push({
      title: "Budżet",
      body: `${nameOf(cheaper)} wypada zwykle taniej — przy podobnym planie łatwiej obronić tańszy kierunek.`,
    });
  } else {
    verdicts.push({
      title: "Budżet",
      body: `${nameA} i ${nameB} grają w podobnym pułapie cenowym, więc budżet rzadko jest decydujący.`,
    });
  }

  const beach = pickWinner(a, b, "beachScore");
  if (beach) {
    verdicts.push({
      title: "Plaża i klimat morski",
      body: `${nameOf(beach)} ma mocniejszy profil plażowy — to lepszy wybór pod reset nad morzem.`,
    });
  }

  const city = pickWinner(a, b, "cityScore");
  if (city) {
    verdicts.push({
      title: "City break i tło miejskie",
      body: `${nameOf(city)} jest mocniejszy jako klasyczny city break z gęstszym zwiedzaniem i klimatem ulicznym.`,
    });
  }

  const access = pickWinner(a, b, "accessScore");
  if (access) {
    verdicts.push({
      title: "Dolot z Polski",
      body: `${nameOf(access)} ma łatwiejszą i bardziej regularną logistykę z Polski — sensowny wybór pod krótki wyjazd.`,
    });
  }

  return verdicts;
}

function buildFaq(
  a: DestinationProfile,
  b: DestinationProfile,
  nameA: string,
  nameB: string,
): { question: string; answer: string }[] {
  const budgetA = budget(a);
  const budgetB = budget(b);
  const cheaper = budgetA === budgetB ? null : budgetA < budgetB ? nameA : nameB;
  const beach = a.beachScore >= b.beachScore ? nameA : nameB;
  const cityWin = a.cityScore + a.sightseeingScore >= b.cityScore + b.sightseeingScore ? nameA : nameB;
  const easier = a.accessScore >= b.accessScore ? nameA : nameB;
  const sumA = summerAvg(a.avgTempByMonth);
  const sumB = summerAvg(b.avgTempByMonth);
  const warmer = sumA === sumB ? null : sumA > sumB ? nameA : nameB;
  const monthsA = bestMonths(a);
  const monthsB = bestMonths(b);

  return [
    {
      question: `${nameA} czy ${nameB} — co wybrać na pierwszy raz?`,
      answer: `Na prosty pierwszy wyjazd zwykle wygodniej wypada ${easier} (łatwiejszy dolot i logistyka z Polski). Jeśli zależy Ci głównie na plaży, lepszy będzie ${beach}; jeśli na zwiedzaniu i miejskim klimacie — ${cityWin}.`,
    },
    {
      question: `Gdzie cieplej i lepsza plaża — ${nameA} czy ${nameB}?`,
      answer:
        `Pod kątem plaży mocniej wypada ${beach}.` +
        (warmer
          ? ` Latem (czerwiec-sierpień) cieplej bywa w kierunku ${warmer} (${Math.max(sumA, sumB)}°C wobec ${Math.min(sumA, sumB)}°C).`
          : ` Latem oba kierunki mają podobne temperatury (ok. ${sumA}°C).`),
    },
    {
      question: `Co lepsze na zwiedzanie i city break — ${nameA} czy ${nameB}?`,
      answer: `${cityWin} ma mocniejszy profil miejski i więcej do zwiedzania, więc lepiej sprawdzi się przy planie pełnym atrakcji i spacerów po mieście.`,
    },
    {
      question: `Który wyjazd jest tańszy — ${nameA} czy ${nameB}?`,
      answer: `Orientacyjny budżet dla 2 osób na 4 dni: ${nameA} ~${budgetA.toLocaleString("pl-PL")} zł, ${nameB} ~${budgetB.toLocaleString("pl-PL")} zł (lot, nocleg, jedzenie, transport).${cheaper ? ` Taniej zwykle wypada ${cheaper}.` : " Oba kierunki są w podobnym pułapie."}`,
    },
    {
      question: "Kiedy najlepiej jechać?",
      answer: `${nameA}: najprzyjemniej ${monthsA.slice(0, 6).join(", ") || "przez cały sezon"}. ${nameB}: ${monthsB.slice(0, 6).join(", ") || "przez cały sezon"}. To miesiące z temperaturą ok. 18-30°C.`,
    },
  ];
}

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

  const nameA = pair.labelA ?? ga.destination.city;
  const nameB = pair.labelB ?? gb.destination.city;

  return {
    title: `${nameA} czy ${nameB}? Porównanie pod krótki wyjazd`,
    description: `${nameA} kontra ${nameB}: pogoda, koszty, dolot z Polski i charakter wyjazdu. ${pair.intent}.`,
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

  const a = ga.destination;
  const b = gb.destination;
  const nameA = pair.labelA ?? a.city;
  const nameB = pair.labelB ?? b.city;
  const verdicts = buildVerdict(a, b, nameA, nameB);
  const faq = buildFaq(a, b, nameA, nameB);
  const baseUrl = getSiteUrl();

  // Hero "vs" + image dla schema — realne foto Pexels obu kierunków (cache + ISR).
  // Obrazy są widoczne na stronie (zgodnie z wytycznymi Google dla pola image).
  const [mediaA, mediaB] = await Promise.all([resolveDestinationMedia(a), resolveDestinationMedia(b)]);
  const images = [mediaA.heroImage, mediaB.heroImage].filter((u): u is string => Boolean(u));

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

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: `${nameA} czy ${nameB}? Porównanie pod krótki wyjazd`,
        description: pair.intent,
        url: `${baseUrl}/porownanie/${pair.slug}`,
        mainEntityOfPage: `${baseUrl}/porownanie/${pair.slug}`,
        image: images,
        inLanguage: "pl-PL",
        author: { "@type": "Organization", "@id": `${baseUrl}/#organization`, name: "HelpTravel" },
        publisher: { "@id": `${baseUrl}/#organization` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: "Kierunki", item: `${baseUrl}/kierunki` },
          {
            "@type": "ListItem",
            position: 3,
            name: `${nameA} vs ${nameB}`,
            item: `${baseUrl}/porownanie/${pair.slug}`,
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((q) => ({
          "@type": "Question",
          name: q.question,
          acceptedAnswer: { "@type": "Answer", text: q.answer },
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
      label: "Średnia roczna temperatura",
      av: `${avgYear(a.avgTempByMonth)}°C`,
      bv: `${avgYear(b.avgTempByMonth)}°C`,
    },
    { label: "Lato (cze-sie)", av: `${summerAvg(a.avgTempByMonth)}°C`, bv: `${summerAvg(b.avgTempByMonth)}°C` },
    { label: "Zima (gru-lut)", av: `${winterAvg(a.avgTempByMonth)}°C`, bv: `${winterAvg(b.avgTempByMonth)}°C` },
    {
      label: "Budżet 2 os. / 4 dni",
      av: `~${budget(a).toLocaleString("pl-PL")} PLN`,
      bv: `~${budget(b).toLocaleString("pl-PL")} PLN`,
    },
    { label: "Profil plażowy", av: `${Math.round(a.beachScore * 100)}/100`, bv: `${Math.round(b.beachScore * 100)}/100` },
    { label: "City break", av: `${Math.round(a.cityScore * 100)}/100`, bv: `${Math.round(b.cityScore * 100)}/100` },
    {
      label: "Zwiedzanie",
      av: `${Math.round(a.sightseeingScore * 100)}/100`,
      bv: `${Math.round(b.sightseeingScore * 100)}/100`,
    },
    {
      label: "Dolot/dostępność",
      av: `${Math.round(a.accessScore * 100)}/100`,
      bv: `${Math.round(b.accessScore * 100)}/100`,
    },
  ];

  const destPanels = [
    { dest: a, guide: ga, name: nameA },
    { dest: b, guide: gb, name: nameB },
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <Script id={`compare-${pair.slug}-jsonld`} type="application/ld+json">
        {JSON.stringify(structuredData)}
      </Script>

      <section className="overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white/95 shadow-[0_20px_60px_rgba(16,84,48,0.06)]">
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
                className={`absolute bottom-3 ${align} font-display text-xl text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] sm:text-2xl`}
              >
                {name}
              </span>
            </div>
          ))}
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30 bg-white/95 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.1em] text-emerald-900 shadow-lg">
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
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Porównanie kierunków</p>
          <h1 className="mt-3 max-w-3xl font-display text-3xl leading-[1.08] text-emerald-950 sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">
            {nameA} czy {nameB}? Porównanie pod realną decyzję wyjazdową.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">{pair.intent}.</p>
        </div>
      </section>

      {/* TABELA RÓŻNIC */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] overflow-x-auto">
        <h2 className="mb-4 font-display text-2xl text-emerald-950">{nameA} vs {nameB} — tabela różnic</h2>
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-emerald-900/70">
              <th className="py-2 pr-4 font-semibold">Parametr</th>
              <th className="py-2 px-3 font-semibold text-emerald-950">{nameA}</th>
              <th className="py-2 px-3 font-semibold text-emerald-950">{nameB}</th>
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

      {/* W CZYM WYGRYWA KTÓRY KIERUNEK */}
      <section>
        <h2 className="mb-4 font-display text-2xl text-emerald-950 sm:text-3xl">W czym wygrywa który kierunek</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {verdicts.map((v) => (
            <article key={v.title} className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-50/72 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{v.title}</p>
              <p className="mt-2 text-sm leading-7 text-emerald-900/82">{v.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* DLA KOGO */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dla kogo</p>
        <h2 className="mt-2 font-display text-2xl text-emerald-950 sm:text-3xl">Dla kogo lepszy będzie każdy kierunek?</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {destPanels.map(({ dest, name }) => (
            <article key={dest.slug} className="rounded-2xl border border-emerald-900/10 bg-emerald-50/40 p-5">
              <h3 className="font-display text-xl text-emerald-950">{name}</h3>
              <p className="mt-1 text-sm text-emerald-900/70">Najlepszy wybór dla miłośników:</p>
              <ul className="mt-3 space-y-2">
                {audienceTags(dest).map((tag) => (
                  <li key={tag} className="flex gap-2 text-sm leading-6 text-emerald-900/82">
                    <span aria-hidden className="text-emerald-600">✓</span>
                    {tag}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* KIEDY JECHAĆ */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Kiedy jechać</p>
        <h2 className="mt-2 font-display text-2xl text-emerald-950 sm:text-3xl">Kiedy najlepiej jechać?</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {destPanels.map(({ dest, name }) => {
            const months = bestMonths(dest);
            return (
              <article key={dest.slug} className="rounded-2xl border border-emerald-900/10 bg-emerald-50/40 p-5">
                <h3 className="font-display text-xl text-emerald-950">{name}</h3>
                <p className="mt-2 text-sm leading-6 text-emerald-900/78">
                  Komfortowe miesiące (18-30°C). Lato ~{summerAvg(dest.avgTempByMonth)}°C, zima ~{winterAvg(dest.avgTempByMonth)}°C.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {months.length > 0 ? (
                    months.map((m) => (
                      <span key={m} className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                        {m}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-emerald-900/72">Cały rok bywa chłodniejszy — sprawdź szczegóły w przewodniku.</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* BUDŻET */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Koszty</p>
        <h2 className="mt-2 font-display text-2xl text-emerald-950 sm:text-3xl">Ile kosztuje wyjazd?</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-900/80">
          Orientacyjny budżet dla 2 osób na 4 dni (lot z Polski, nocleg, jedzenie, transport lokalny):
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {destPanels.map(({ dest, name }) => (
            <div key={dest.slug} className="rounded-2xl bg-white/80 px-5 py-4">
              <p className="text-sm font-semibold text-emerald-900/70">{name}</p>
              <p className="mt-1 font-display text-3xl text-emerald-800">~{budget(dest).toLocaleString("pl-PL")} zł</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-6 text-emerald-900/60">
          To szacunek orientacyjny — realne ceny zależą od terminu i standardu. Sprawdź aktualne stawki w wyszukiwarce poniżej.
        </p>
      </section>

      {/* PRZEWODNIKI + HOTELE */}
      <section className="grid gap-5 lg:grid-cols-2">
        {destPanels.map(({ dest, guide, name }) => (
          <article
            key={dest.slug}
            className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="font-display text-2xl text-emerald-950">{name}</h2>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">{guide.overview}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/kierunki/${dest.slug}`}
                className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800"
              >
                Pełny przewodnik
              </Link>
              <Link
                href={`/hotele/szukaj?${new URLSearchParams({
                  destination: dest.city,
                  country: dest.country,
                }).toString()}`}
                className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-100"
              >
                Sprawdź hotele i loty
              </Link>
            </div>
          </article>
        ))}
      </section>

      {/* 2 CTA per kierunek — wewnętrzne hotele + Aviasales (loty) */}
      <section className="grid gap-5 lg:grid-cols-2">
        {destPanels.map(({ dest, name }) => {
          const hotelHref = `/hotele/szukaj?${new URLSearchParams({
            destination: dest.city,
            country: dest.country,
          }).toString()}`;
          return (
            <div key={dest.slug} className="flex flex-col gap-4">
              <article className="rounded-[1.6rem] border border-emerald-900/10 bg-emerald-700 p-5 text-white">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">Hotele</p>
                <h3 className="mt-1 font-display text-2xl">Konkretne ceny — {name}</h3>
                <p className="mt-2 text-sm leading-7 text-emerald-50/85">
                  Sprawdź ceny noclegów w PLN dla swoich dat. Bez wychodzenia ze strony.
                </p>
                <Link
                  href={hotelHref}
                  className="mt-4 inline-flex w-fit rounded-full bg-white px-5 py-2.5 text-sm font-bold text-emerald-900 transition hover:bg-emerald-100"
                >
                  Zobacz hotele: {name}
                </Link>
              </article>
              <AviasalesCta
                city={dest.city}
                country={dest.country}
                campaign={`compare-${pair.slug}-${dest === a ? "a" : "b"}`}
                flightHours={dest.typicalFlightHoursFromPL}
              />
            </div>
          );
        })}
      </section>

      {/* FAQ — widoczny accordion + zgodny ze schema FAQPage */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="font-display text-2xl text-emerald-950 sm:text-3xl">Najczęściej zadawane pytania</h2>
        <div className="mt-5 space-y-3">
          {faq.map((item) => (
            <details key={item.question} className="rounded-2xl bg-emerald-50/60 px-5 py-4 transition hover:bg-emerald-50">
              <summary className="cursor-pointer text-base font-bold text-emerald-950">{item.question}</summary>
              <p className="mt-3 text-sm leading-7 text-emerald-900/82">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* POWIĄZANE ARTYKUŁY */}
      {articleLinks.length > 0 ? (
        <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="font-display text-2xl text-emerald-950">Powiązane poradniki</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {articleLinks.map((article) => (
              <Link
                key={article.slug}
                href={`/inspiracje/${article.slug}`}
                className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
              >
                {article.title}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* INNE PORÓWNANIA */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="font-display text-2xl text-emerald-950">Inne porównania</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {comparisonPairs
            .filter((p) => p.slug !== pair.slug)
            .slice(0, 12)
            .map((p) => {
              const ag = getDestinationGuideBySlug(p.a);
              const bg = getDestinationGuideBySlug(p.b);
              if (!ag || !bg) return null;
              const labelA = p.labelA ?? ag.destination.city;
              const labelB = p.labelB ?? bg.destination.city;
              return (
                <Link
                  key={p.slug}
                  href={`/porownanie/${p.slug}`}
                  className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100"
                >
                  {labelA} vs {labelB}
                </Link>
              );
            })}
        </div>
      </section>
    </main>
  );
}
