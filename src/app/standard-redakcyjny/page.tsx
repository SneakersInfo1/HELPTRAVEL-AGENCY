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
    title: "Kazda strona musi mieć realny powod istnienia",
    body:
      "Nie budujemy pustych landingow tylko po to, by zwiekszyc liczbę URL-i. Kazda strona ma odpowiadac na konkretna potrzebę: wybór kierunku, porównańie formatu wyjazdu, przewodnik po miescie albo przejście do planera.",
  },
  {
    title: "Treści mają być praktyczne i czytelne",
    body:
      "Kazdy material powinien mieć krótkie wprowadzenie, sekcje tematyczne, FAQ, sensowne linkowanie wewnetrzne i jasny kolejny krok. Chodzi o uzytecznosc, nie o sztuczne napompowanie tekstu.",
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
      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h1 className="mt-3 font-display text-3xl leading-[1.08] text-ink sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">
          Jak przygotowujemy przewodniki, artykuły i praktyczne opisy kierunków
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-8 text-ink-muted">
          To proste wyjasnienie, jak przygotowujemy treści w HelpTravel. Zalezy nam, żeby użytkownik wiedzial, skąd
          biorą się opisy kierunków, jak podchodzimy do porównań i dlaczego nie wypełniamy serwisu pustymi stronami.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {standards.map((item) => (
          <article
            key={item.title}
            className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm"
          >
            <h2 className="text-2xl font-bold text-ink">{item.title}</h2>
            <p className="mt-4 text-sm leading-7 text-ink-muted">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-sm">
          <h2 className="font-display text-2xl text-ink">Checklist przed publikacja</h2>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-ink-muted">
            {editorialChecklist.map((item) => (
              <li key={item} className="rounded-2xl bg-white px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="font-display text-2xl text-ink">Powiązane strony</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <Link href="/jak-pracujemy" className="rounded-2xl bg-surface-sunken px-4 py-3 text-ink-muted transition hover:text-brand">
              Jak to działa
            </Link>
            <Link href="/o-nas" className="rounded-2xl bg-surface-sunken px-4 py-3 text-ink-muted transition hover:text-brand">
              O serwisie
            </Link>
            <Link href="/kierunki" className="rounded-2xl bg-surface-sunken px-4 py-3 text-ink-muted transition hover:text-brand">
              Kierunki
            </Link>
            <Link href="/inspiracje" className="rounded-2xl bg-surface-sunken px-4 py-3 text-ink-muted transition hover:text-brand">
              Pomysły na wyjazd
            </Link>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-ink">Dodatkowe strony wspierajace decyzje i zaufanie</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/faq" className="rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted transition hover:text-brand">
            FAQ
          </Link>
          <Link href="/cennik" className="rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted transition hover:text-brand">
            Cennik
          </Link>
          <Link href="/oferta" className="rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted transition hover:text-brand">
            Oferta
          </Link>
          <Link href="/mapa-serwisu" className="rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted transition hover:text-brand">
            Mapa serwisu
          </Link>
        </div>
      </section>
    </main>
  );
}


