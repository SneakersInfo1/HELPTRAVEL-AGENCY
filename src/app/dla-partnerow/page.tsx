import type { Metadata } from "next";
import Link from "next/link";

import { EditorialMetaBar } from "@/components/publisher/editorial-meta-bar";
import { getEditorialArticles, getEditorialCategories, getPublishedDestinations } from "@/lib/mvp/publisher-content";

const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

export const metadata: Metadata = {
  title: "Dla partnerow",
  description:
    "Media kit i publiczna strona dla partnerow: model dzialania, typy ekspozycji, content inventory i punkt kontaktu.",
};

const audienceCards = [
  {
    title: "Polski odbiorca travelowy",
    body: "Projekt jest budowany dla osob z Polski, ktore szukaja city breakow, krotkich urlopow, cieplych kierunkow i prostych decyzji wyjazdowych.",
  },
  {
    title: "Intencja zakupu",
    body: "Treści i planner prowadza uzytkownika od inspiracji do konkretu. To nie jest ruch przypadkowy, tylko wejscia o wysokiej intencji.",
  },
  {
    title: "Format publishera",
    body: "Strona laczy destination huby, przewodniki, kategorie i strony zaufania. Dzięki temu wyglada jak serwis travelowy z redakcja, a nie tylko narzedzie.",
  },
];

const placementFormats = [
  {
    title: "Destination hub",
    body:
      "Dla konkretnego miasta lub kierunku: opis, dlaczego warto, najlepszy czas, budzet, FAQ, dzielnice, mini plan i przejscie do planera.",
  },
  {
    title: "Artykul inspiracyjny",
    body:
      "Dla fraz typu 'gdzie poleciec zimą z Polski' albo 'city break do 2000 zl'. Artykul buduje kontekst i otwiera sciezke do dalszego wyboru.",
  },
  {
    title: "Kategoria tematyczna",
    body:
      "Dla budowy szerszego ruchu i segmentacji. Kategorie spinaja content, kierunki i publiczne landing pages pod konkretne potrzeby.",
  },
  {
    title: "Planner flow",
    body:
      "Przejscie z tresci do planera. Uzytkownik moze wpisac potrzebe, a serwis prowadzi go do uporzadkowanych, realnych wynikow.",
  },
];

const reviewSignals = [
  "publiczne destination huby z FAQ, lokalnym kontekstem i CTA do planera",
  "indeksowalne artykuly i kategorie tematyczne pod realne frazy travelowe",
  "strony zaufania: o nas, kontakt, polityka prywatnosci, regulamin, disclosure",
  "wewnetrzne linkowanie miedzy contentem, plannerem i flow partnera",
];

const partnerBenefits = [
  "serwis jest zbudowany jako publisher i planera jednoczesnie",
  "uzytkownik dostaje kontekst przed kliknieciem w oferte",
  "linki partnerskie sa opisane publicznie i uczciwie",
  "content jest po polsku i dopasowany do polskiego rynku",
];

export default function PartnersPage() {
  const destinations = getPublishedDestinations();
  const articles = getEditorialArticles();
  const categories = getEditorialCategories();
  const emailHref = contactEmail ? `mailto:${contactEmail}?subject=Wspolpraca%20HelpTravel%20Agency` : "/kontakt";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white/95 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="p-6 sm:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Media kit</p>
            <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[0.95] text-emerald-950">
              Travel publisher z plannerem, contentem i uczciwym flow do partnerow
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
              HelpTravel Agency laczy publiczny serwis travelowy, destination huby i planer wyjazdow. Projekt jest
              budowany tak, by czytelnik najpierw dostal wartosc redakcyjna, potem porownanie, a na koncu uczciwe
              przejscie do partnera zewnetrznego. Nie pokazujemy fikcyjnego ruchu ani nie udajemy pelnego booking engine.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={emailHref}
                className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
              >
                Napisz w sprawie wspolpracy
              </Link>
              <Link
                href="/standard-redakcyjny"
                className="rounded-full border border-emerald-900/10 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
              >
                Standard redakcyjny
              </Link>
            </div>
          </div>

          <div className="border-t border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 sm:p-8 lg:border-l lg:border-t-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Serwis w liczbach</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(16,84,48,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Kierunki</p>
                <p className="mt-2 text-3xl font-bold text-emerald-950">{destinations.length}</p>
                <p className="mt-1 text-sm text-emerald-900/72">destination hubow z lokalnym opisem i FAQ.</p>
              </div>
              <div className="rounded-[1.5rem] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(16,84,48,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Artykuly</p>
                <p className="mt-2 text-3xl font-bold text-emerald-950">{articles.length}</p>
                <p className="mt-1 text-sm text-emerald-900/72">scenariuszy i przewodnikow pod wysoka intencje.</p>
              </div>
              <div className="rounded-[1.5rem] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(16,84,48,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Kategorie</p>
                <p className="mt-2 text-3xl font-bold text-emerald-950">{categories.length}</p>
                <p className="mt-1 text-sm text-emerald-900/72">glowne wejscia tematyczne dla czytelnika.</p>
              </div>
              <div className="rounded-[1.5rem] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(16,84,48,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Kontakt</p>
                <p className="mt-2 text-3xl font-bold text-emerald-950">{contactEmail ? "aktywny" : "przez formularz"}</p>
                <p className="mt-1 text-sm text-emerald-900/72">jawny punkt kontaktu dla partnerow.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <EditorialMetaBar
        eyebrow="Pozycjonowanie serwisu"
        title="Publiczna warstwa contentowa przygotowana pod review afiliacyjny i direct outreach"
        items={[`${destinations.length} kierunkow`, `${articles.length} artykulow`, `${categories.length} kategorii`]}
      />

      <section className="grid gap-5 lg:grid-cols-3">
        {audienceCards.map((card) => (
          <article
            key={card.title}
            className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="text-2xl font-bold text-emerald-950">{card.title}</h2>
            <p className="mt-4 text-sm leading-7 text-emerald-900/78">{card.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Formaty ekspozycji</p>
          <div className="mt-4 grid gap-3">
            {placementFormats.map((format) => (
              <div key={format.title} className="rounded-2xl bg-emerald-50/75 px-4 py-4">
                <h3 className="text-lg font-bold text-emerald-950">{format.title}</h3>
                <p className="mt-2 text-sm leading-7 text-emerald-900/78">{format.body}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dlaczego to ma sens</p>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            {partnerBenefits.map((item) => (
              <li key={item} className="rounded-2xl bg-white px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Co jest juz publiczne</p>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            {reviewSignals.map((item) => (
              <li key={item} className="rounded-2xl bg-emerald-50/75 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(7,30,18,0.96),rgba(8,40,24,0.92))] p-6 text-white shadow-[0_20px_54px_rgba(8,40,24,0.18)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Jak wygląda wspolpraca</p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-white/82">
            <p>1. Dobieramy format kampanii do struktury serwisu i typu intencji użytkownika.</p>
            <p>2. Ustalamy najlepsze miejsca ekspozycji: content, hub, planner albo kierunek.</p>
            <p>3. Weryfikujemy feed, deeplinki lub model przekierowania.</p>
            <p>4. Zachowujemy jawne oznaczenia partnerstwa i przejrzysty flow dla czytelnika.</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={emailHref}
              className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
            >
              Napisz do nas
            </Link>
            <Link
              href="/kontakt"
              className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
            >
              Kontakt i szczegoly
            </Link>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dodatkowe wejscia</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Miejsca, ktore partner moze szybko sprawdzic przed rozmowa.</h2>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/mapa-serwisu" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Mapa serwisu
          </Link>
          <Link href="/standard-redakcyjny" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Standard redakcyjny
          </Link>
          <Link href="/jak-pracujemy" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Jak pracujemy
          </Link>
          <Link href="/linki-partnerskie" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Linki partnerskie
          </Link>
        </div>
      </section>
    </main>
  );
}
