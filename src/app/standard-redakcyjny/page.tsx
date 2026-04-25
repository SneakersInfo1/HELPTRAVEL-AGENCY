import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Standard redakcyjny",
  description: "Jak przygotowujemy opisy kierunków, artykuły i treści praktyczne w HelpTravel.",
  alternates: {
    canonical: "/standard-redakcyjny",
  },
};

const standards = [
  {
    title: "Kazda strona musi miec realny powod istnienia",
    body:
      "Nie budujemy pustych landingow tylko po to, by zwiekszyc liczbę URL-i. Kazda strona ma odpowiadac na konkretna potrzebę: wybór kierunku, porównańie formatu wyjazdu, przewodnik po miescie albo przejście do planera.",
  },
  {
    title: "Treści mają byc praktyczne i czytelne",
    body:
      "Kazdy material powinien miec krótkie wprowadzenie, sekcje tematyczne, FAQ, sensowne linkowanie wewnetrzne i jasny kolejny krok. Chodzi o uzytecznosc, nie o sztuczne napompowanie tekstu.",
  },
  {
    title: "Nie pokazujemy fikcyjnej wiarygodnosci",
    body:
      "Nie dodajemy fikcyjnych partnerstw, ruchu, recenzji, nagrod ani liczb. W publicznej warstwie serwisu stawiamy na przejrzystosc, praktyczne informacje i jawny model afiliacyjny.",
  },
];

const editorialChecklist = [
  "czy strona odpowiada na konkretne pytanie użytkownika",
  "czy czytelnik dostaje praktyczne sekcje, a nie tylko ogolny opis",
  "czy jest jasny kolejny krok do planera, kierunku albo powiazanych treści",
  "czy copy nie udaje autorytetu, którego projekt jeszcze nie ma",
  "czy w publicznej warstwie nie ma fikcyjnych cen ani fikcyjnych partnerstw",
];

export default function EditorialStandardPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Standard redakcyjny</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">
          Jak przygotowujemy przewodniki, artykuły i praktyczne opisy kierunków
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-emerald-900/78">
          To proste wyjasnienie, jak przygotowujemy treści w HelpTravel. Zalezy nam, żeby użytkownik wiedzial, skąd
          biorą sie opisy kierunków, jak podchodzimy do porównań i dlaczego nie wypełniamy serwisu pustymi stronami.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {standards.map((item) => (
          <article
            key={item.title}
            className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="text-2xl font-bold text-emerald-950">{item.title}</h2>
            <p className="mt-4 text-sm leading-7 text-emerald-900/78">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Checklist przed publikacja</p>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            {editorialChecklist.map((item) => (
              <li key={item} className="rounded-2xl bg-white px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Powiązane strony</p>
          <div className="mt-4 grid gap-3 text-sm">
            <Link href="/jak-pracujemy" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Jak to działa
            </Link>
            <Link href="/o-nas" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              O serwisie
            </Link>
            <Link href="/kierunki" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Kierunki
            </Link>
            <Link href="/inspiracje" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Pomysły na wyjazd
            </Link>
            <Link href="/kontakt" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Kontakt
            </Link>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="text-2xl font-bold text-emerald-950">Dodatkowe strony wspierajace decyzje i zaufanie</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/faq" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            FAQ
          </Link>
          <Link href="/cennik" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Cennik
          </Link>
          <Link href="/oferta" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Oferta
          </Link>
          <Link href="/mapa-serwisu" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Mapa serwisu
          </Link>
        </div>
      </section>
    </main>
  );
}


