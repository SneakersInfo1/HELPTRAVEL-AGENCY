import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Breadcrumbs } from "@/components/publisher/breadcrumbs";
import { EDITOR_IN_CHIEF, personSchema } from "@/lib/mvp/authors";
import { getSiteUrl } from "@/lib/mvp/site";

export const metadata: Metadata = {
  title: "Redakcja — kto tworzy HelpTravel",
  description:
    "Poznaj autora i metodologię HelpTravel: skąd biorą się ceny hoteli, dane o pogodzie i czasy lotów, i jak weryfikujemy treści, zanim trafią na stronę.",
  alternates: { canonical: "/redakcja" },
  openGraph: {
    title: "Redakcja HelpTravel",
    description: "Kto tworzy HelpTravel i na jakich danych opieramy przewodniki, porównania i raporty.",
    url: `${getSiteUrl()}/redakcja`,
    type: "profile",
    locale: "pl_PL",
  },
};

const dataSources = [
  {
    title: "Realne ceny i baza hoteli",
    body:
      "Dostępność, oceny gości i ceny w PLN pochodzą na żywo od globalnego dostawcy rezerwacyjnego (LiteAPI). Nie wpisujemy cen ręcznie — pokazujemy to, co faktycznie jest dostępne.",
  },
  {
    // Do 2026-09 stało tu „wieloletnie średnie dla każdego kierunku", podczas gdy
    // 212 z 235 kierunków miało jedną tablicę temperatur na cały region (audyt Faza 2.2).
    title: "Pogoda i sezon",
    body:
      "Temperatury i sezon podajemy tylko dla kierunków, dla których mamy ręcznie opracowane średnie miesięczne. Gdzie takich danych jeszcze nie ma, nie pokazujemy ani temperatury, ani sezonu. Temperatura morza to szacunek liczony z temperatur powietrza.",
  },
  {
    title: "Czasy lotów z Polski",
    body:
      "Czas lotu podajemy wprost tylko przy kierunkach z opracowanymi danymi. Przy pozostałych pokazujemy szacunek liczony z odległości od najbliższego lotniska w Polsce — zawsze oznaczony jako szacunek, bez uwzględnienia przesiadek i rozkładów.",
  },
  {
    title: "Indeks kosztów i profile kierunków",
    body:
      "Indeks kosztów oraz profil plażowy i miejski to nasza wewnętrzna, modelowana ocena. Pomaga porównywać kierunki jedną metodą, ale nie jest ceną ani pomiarem.",
  },
];

export default function RedakcjaPage() {
  const author = EDITOR_IN_CHIEF;
  const siteUrl = getSiteUrl();

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${siteUrl}/redakcja`,
        url: `${siteUrl}/redakcja`,
        name: "Redakcja HelpTravel",
        inLanguage: "pl-PL",
        mainEntity: personSchema(author),
        about: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Start", item: `${siteUrl}/` },
          { "@type": "ListItem", position: 2, name: "Redakcja", item: `${siteUrl}/redakcja` },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm sm:p-8">
        <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: "Redakcja" }]} />
        <h1 className="mt-3 font-display text-3xl leading-[1.08] text-ink sm:text-4xl md:text-5xl md:leading-[0.95]">
          Kto tworzy HelpTravel i na jakich danych
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">
          Wierzymy, że za treścią powinien stać człowiek i jasna metoda. Poniżej znajdziesz autora
          serwisu oraz dokładnie to, skąd biorą się nasze ceny, dane o pogodzie i rekomendacje.
        </p>
      </section>

      {/* AUTOR */}
      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-3xl font-bold text-white">
            {author.image ? (
              <Image
                src={author.image}
                alt={author.name}
                width={80}
                height={80}
                className="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              author.name.charAt(0).toUpperCase()
            )}
          </span>
          <div>
            <h2 className="font-display text-2xl text-ink sm:text-3xl">{author.name}</h2>
            <p className="mt-1 text-sm font-semibold text-brand">{author.role}</p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted">{author.bio}</p>
            {author.experience && author.experience.length > 0 && (
              <ul className="mt-4 space-y-2">
                {author.experience.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-7 text-ink-muted">
                    {item}
                  </li>
                ))}
              </ul>
            )}
            {author.sameAs && author.sameAs.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {author.sameAs.map((href) => (
                  <Link
                    key={href}
                    href={href}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-3 py-1.5 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
                  >
                    <span className="text-xs font-semibold text-ink">Profil</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* METODOLOGIA — skąd biorą się dane (silne E-E-A-T: transparentność) */}
      <section className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-sm sm:p-8">
        <h2 className="mt-2 font-display text-2xl text-ink sm:text-3xl">Skąd biorą się nasze dane</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">
          Poniżej opisujemy, skąd pochodzą dane na stronach kierunków i gdzie kończy się sprawdzona informacja, a zaczyna szacunek:
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {dataSources.map((source) => (
            <article key={source.title} className="rounded-2xl border border-line bg-white/85 p-5">
              <h3 className="text-sm font-bold text-ink">{source.title}</h3>
              <p className="mt-2 text-sm leading-7 text-ink-muted">{source.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ZASADY + LINKI */}
      <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="mt-2 font-display text-2xl text-ink">Czego nie robimy</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-ink-muted">
            <li className="rounded-2xl bg-surface-sunken px-4 py-3">
              Nie wymyślamy recenzji, partnerstw, nagród ani liczb. Jeśli czegoś nie mamy — nie udajemy, że mamy.
            </li>
            <li className="rounded-2xl bg-surface-sunken px-4 py-3">
              Nie budujemy pustych stron pod samo SEO. Każda strona ma realny powód istnienia i pomaga podjąć decyzję.
            </li>
            <li className="rounded-2xl bg-surface-sunken px-4 py-3">
              Jawnie informujemy o modelu afiliacyjnym: planowanie jest darmowe, płacisz wyłącznie u partnera rezerwacyjnego.
            </li>
          </ul>
        </article>

        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="font-display text-2xl text-ink">Powiązane</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <Link href="/standard-redakcyjny" className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-surface-sunken px-4 py-3 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100">
              <span className="text-ink-muted">Standard redakcyjny</span>
            </Link>
            <Link href="/jak-pracujemy" className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-surface-sunken px-4 py-3 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100">
              <span className="text-ink-muted">Jak działa HelpTravel</span>
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
