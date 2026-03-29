import type { Metadata } from "next";
import Link from "next/link";

import { getEditorialArticles, getEditorialCategories, getPublishedDestinations } from "@/lib/mvp/publisher-content";

const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

export const metadata: Metadata = {
  title: "Dla partnerow",
  description:
    "Publiczna strona o modelu dzialania HelpTravel Agency, warstwie contentowej, plannerze i sciezkach przejscia do partnerow.",
};

const reviewSignals = [
  "publiczne destination huby z FAQ, lokalnym kontekstem i CTA do planera",
  "indeksowalne artykuly i kategorie tematyczne pod realne frazy travelowe",
  "strony zaufania: o nas, kontakt, polityka prywatnosci, regulamin, disclosure",
  "wewnetrzne linkowanie miedzy contentem, plannerem i flow partnera",
];

const placementFormats = [
  {
    title: "Content i przewodniki",
    body:
      "Artykuly i destination huby sa projektowane tak, by naturalnie kierowac do konkretnego scenariusza wyjazdu, a nie tylko do generycznej strony glowniej.",
  },
  {
    title: "Punkty wejscia z intencja",
    body:
      "Strony kategorii i tematyczne entry points pomagaja trafic w wysokointencyjne frazy typu city break, bez wizy, tanie podróże czy kierunki na 4 dni.",
  },
  {
    title: "Planner i redirect",
    body:
      "Planner sluzy jako finalny krok po stronie uzytkownika: porzadkuje potrzebe, a potem prowadzi do wynikow i zewnetrznych partnerow.",
  },
];

const partnerBenefits = [
  "serwis ma wyrazna warstwe travel contentu i jest budowany jako publisher, nie sam widget",
  "uzytkownik dostaje kontekst przed kliknieciem w oferte, co poprawia jakosc przejscia",
  "linki partnerskie sa jawne i opisane publicznie",
  "content jest po polsku i dopasowany do polskiego odbiorcy",
];

export default function PartnersPage() {
  const destinations = getPublishedDestinations();
  const articles = getEditorialArticles();
  const categories = getEditorialCategories();
  const emailHref = contactEmail ? `mailto:${contactEmail}?subject=Wspolpraca%20HelpTravel%20Agency` : "/kontakt";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dla partnerow</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">
          Travel publisher z plannerem i realna warstwa przejscia do ofert
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-emerald-900/78">
          HelpTravel Agency laczy publiczny serwis travel contentowy, katalog kierunkow i planer wyjazdow. Strona jest
          budowana tak, by czytelnik najpierw dostal kontekst, potem porownanie, a na koncu mial uczciwe przejscie do
          partnera zewnetrznego. Nie deklarujemy fikcyjnego ruchu ani nie udajemy pelnego booking engine.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={emailHref}
            className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            Skontaktuj sie w sprawie wspolpracy
          </Link>
          <Link
            href="/standard-redakcyjny"
            className="rounded-full border border-emerald-900/10 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
          >
            Zobacz standard redakcyjny
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-[1.75rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Kierunki</p>
          <p className="mt-2 text-3xl font-bold text-emerald-950">{destinations.length}</p>
          <p className="mt-1 text-sm text-emerald-900/72">destination hubow z lokalnym opisem i CTA do planera.</p>
        </article>
        <article className="rounded-[1.75rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Artykuly</p>
          <p className="mt-2 text-3xl font-bold text-emerald-950">{articles.length}</p>
          <p className="mt-1 text-sm text-emerald-900/72">scenariuszy i przewodnikow pod intencje wyszukiwania.</p>
        </article>
        <article className="rounded-[1.75rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Kategorie</p>
          <p className="mt-2 text-3xl font-bold text-emerald-950">{categories.length}</p>
          <p className="mt-1 text-sm text-emerald-900/72">glowne wejsciowe huby tematyczne.</p>
        </article>
        <article className="rounded-[1.75rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Kontakt</p>
          <p className="mt-2 text-3xl font-bold text-emerald-950">{contactEmail ? "aktywny" : "przez formularz"}</p>
          <p className="mt-1 text-sm text-emerald-900/72">jawny punkt kontaktu do rozmowy o wspolpracy.</p>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {placementFormats.map((format) => (
          <article
            key={format.title}
            className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="text-2xl font-bold text-emerald-950">{format.title}</h2>
            <p className="mt-4 text-sm leading-7 text-emerald-900/78">{format.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
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
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Jak wyglada wspolpraca</p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>1. Sprawdzamy, czy typ kampanii pasuje do modelu serwisu i do polskiego odbiorcy.</p>
            <p>2. Ustalamy format ekspozycji: content, sekcja tematyczna, destination hub albo planowany redirect flow.</p>
            <p>3. Weryfikujemy, czy partner ma realny feed, deeplink lub regulamin zgodny z modelem publicznego serwisu.</p>
            <p>4. Po stronie serwisu utrzymujemy jawna oznaczenia linkow i uczciwy model przekierowan.</p>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(7,30,18,0.96),rgba(8,40,24,0.92))] p-6 text-white shadow-[0_20px_54px_rgba(8,40,24,0.18)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Nastepny krok</p>
          <h2 className="mt-3 font-display text-4xl">Jesli chcesz, napiszemy konkretny plan wejscia dla jednej marki albo jednej kategorii.</h2>
          <p className="mt-4 text-sm leading-7 text-white/82">
            Ta strona ma sluzyc jako punkt startowy do rozmowy z afiliacja. Po stronie contentu projekt jest juz
            przygotowany do prowadzenia ruchu, publikacji i kierowania do partnerow zewnętrznych.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={emailHref}
              className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
            >
              Napisz do nas
            </Link>
            <Link
              href="/mapa-serwisu"
              className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
            >
              Zobacz mape serwisu
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
