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
    title: "Wieloletnie średnie pogodowe",
    body:
      "Temperatury, sezonowość i temperatura morza opieramy na wieloletnich średnich miesięcznych dla każdego kierunku — nie na prognozie z jednego dnia.",
  },
  {
    title: "Czasy lotów z Polski",
    body:
      "Orientacyjne czasy bezpośrednich przelotów liczymy z polskich i europejskich lotnisk, żeby realnie ocenić, jak blisko jest dany kierunek.",
  },
  {
    title: "Indeks kosztów i profile kierunków",
    body:
      "Modelowany poziom cen na miejscu, profil plażowy i miejski oraz sezonowość pozwalają porównywać kierunki spójną metodą, a nie na wyczucie.",
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

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)] sm:p-8">
        <Breadcrumbs items={[{ label: "Start", href: "/" }, { label: "Redakcja" }]} />
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Redakcja</p>
        <h1 className="mt-3 font-display text-3xl leading-[1.08] text-emerald-950 sm:text-4xl md:text-5xl md:leading-[0.95]">
          Kto tworzy HelpTravel i na jakich danych
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Wierzymy, że za treścią powinien stać człowiek i jasna metoda. Poniżej znajdziesz autora
          serwisu oraz dokładnie to, skąd biorą się nasze ceny, dane o pogodzie i rekomendacje.
        </p>
      </section>

      {/* AUTOR */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-700 text-3xl font-bold text-white">
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
            <h2 className="font-display text-2xl text-emerald-950 sm:text-3xl">{author.name}</h2>
            <p className="mt-1 text-sm font-semibold text-emerald-700">{author.role}</p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-emerald-900/80">{author.bio}</p>
            {author.experience && author.experience.length > 0 && (
              <ul className="mt-4 space-y-2">
                {author.experience.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-7 text-emerald-900/82">
                    <span aria-hidden className="text-emerald-600">
                      ✓
                    </span>
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
                    className="rounded-full border border-emerald-900/10 bg-emerald-50 px-3 py-1.5 text-xs font-semibold"
                  >
                    <span className="text-emerald-800">Profil →</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* METODOLOGIA — skąd biorą się dane (silne E-E-A-T: transparentność) */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Metodologia</p>
        <h2 className="mt-2 font-display text-2xl text-emerald-950 sm:text-3xl">Skąd biorą się nasze dane</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-900/78">
          Każdy przewodnik, porównanie i raport opieramy na realnych, sprawdzalnych źródłach. Oto one:
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {dataSources.map((source) => (
            <article key={source.title} className="rounded-2xl border border-emerald-900/10 bg-white/85 p-5">
              <h3 className="text-sm font-bold text-emerald-950">{source.title}</h3>
              <p className="mt-2 text-sm leading-7 text-emerald-900/74">{source.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ZASADY + LINKI */}
      <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Nasze zasady</p>
          <h2 className="mt-2 font-display text-2xl text-emerald-950">Czego nie robimy</h2>
          <ul className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/80">
            <li className="rounded-2xl bg-emerald-50/70 px-4 py-3">
              Nie wymyślamy recenzji, partnerstw, nagród ani liczb. Jeśli czegoś nie mamy — nie udajemy, że mamy.
            </li>
            <li className="rounded-2xl bg-emerald-50/70 px-4 py-3">
              Nie budujemy pustych stron pod samo SEO. Każda strona ma realny powód istnienia i pomaga podjąć decyzję.
            </li>
            <li className="rounded-2xl bg-emerald-50/70 px-4 py-3">
              Jawnie informujemy o modelu afiliacyjnym: planowanie jest darmowe, płacisz wyłącznie u partnera rezerwacyjnego.
            </li>
          </ul>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Powiązane</p>
          <div className="mt-4 grid gap-3 text-sm">
            <Link href="/standard-redakcyjny" className="rounded-2xl bg-emerald-50/75 px-4 py-3 transition hover:bg-emerald-100">
              <span className="text-emerald-900/85">Standard redakcyjny</span>
            </Link>
            <Link href="/jak-pracujemy" className="rounded-2xl bg-emerald-50/75 px-4 py-3 transition hover:bg-emerald-100">
              <span className="text-emerald-900/85">Jak działa HelpTravel</span>
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
