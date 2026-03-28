import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dla partnerow",
  description:
    "Publiczna informacja o modelu dzialania HelpTravel Agency, warstwie contentowej, plannerze i sciezkach przejscia do partnerow.",
};

const sections = [
  {
    title: "Jakim projektem jest ten serwis",
    body:
      "HelpTravel Agency laczy trzy warstwy: publiczny serwis travel contentowy, katalog kierunkow oraz planer wyjazdow prowadzacy do ofert i partnerow zewnetrznych. To nie jest pusty landing ani sam formularz, ale projekt z warstwa wydawnicza, SEO i praktycznym flow produktowym.",
  },
  {
    title: "Jak wyglada ruch i wejscia do tresci",
    body:
      "Czytelnik moze wejsc przez strone glow­na, kategorie, destination hub, artykul lub bezposrednio przez planner. Struktura serwisu jest budowana tak, by uzytkownik mogl najpierw przeczytac, potem porownac, a dopiero na koncu przejsc do partnera.",
  },
  {
    title: "Jak wyglada warstwa komercyjna",
    body:
      "Serwis otwarcie informuje o linkach partnerskich i przekierowaniach do dostawcow zewnetrznych. Nie deklaruje fikcyjnych partnerstw ani nie udaje pelnego booking engine. Finalna rezerwacja i warunki zawsze naleza do partnera zewnetrznego.",
  },
];

const reviewSignals = [
  "publiczne strony kierunkowe z FAQ, lokalnym kontekstem i CTA do planera",
  "indeksowalne artykuly i kategorie tematyczne pod realne frazy travelowe",
  "strony zaufania: o nas, kontakt, polityka prywatnosci, regulamin, disclosure",
  "wewnetrzne linkowanie miedzy contentem, plannerem i flow partnera",
];

export default function PartnersPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dla partnerow</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">
          Publiczna informacja dla partnerow, sieci afiliacyjnych i reklamodawcow
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-emerald-900/78">
          Ta strona istnieje po to, by jasno pokazac, jak dziala projekt, jaka tresc publikuje i w jaki sposob laczy
          warstwe wydawnicza z plannerem oraz przekierowaniami do partnerow. Nie ma tu fikcyjnych deklaracji ani pustych
          obietnic. Sa za to realne sekcje publiczne, indeksowalne strony i uczciwy model monetyzacji.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {sections.map((section) => (
          <article
            key={section.title}
            className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="text-2xl font-bold text-emerald-950">{section.title}</h2>
            <p className="mt-4 text-sm leading-7 text-emerald-900/78">{section.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Co jest juz publiczne</p>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            {reviewSignals.map((item) => (
              <li key={item} className="rounded-2xl bg-white px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Przydatne strony</p>
          <div className="mt-4 grid gap-3 text-sm">
            <Link href="/mapa-serwisu" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Mapa serwisu
            </Link>
            <Link href="/jak-pracujemy" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Jak pracujemy
            </Link>
            <Link href="/standard-redakcyjny" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Standard redakcyjny
            </Link>
            <Link href="/linki-partnerskie" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Linki partnerskie
            </Link>
            <Link href="/kontakt" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Kontakt
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
