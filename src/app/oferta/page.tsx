import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Oferta",
  description: "Zobacz, co daje HelpTravel: planner, katalog kierunków, pomysły na wyjazd i przejście do partnerów.",
  alternates: {
    canonical: "/oferta",
  },
};

const productBlocks = [
  {
    title: "Masz kierunek",
    body: "Wpisujesz miasto, ustawiasz termin i przechodzisz dalej do noclegów, lotów i kolejnych kroków.",
  },
  {
    title: "Nie wiesz, dokąd lecieć",
    body: "Opisujesz, jakiego wyjazdu szukasz, a katalog pomaga zawęzić kierunki i porównać kilka sensownych opcji.",
  },
  {
    title: "Kierunki i pomysły",
    body: "Możesz przejść przez przewodniki, scenariusze i kategorie, zanim sprawdzisz hotele i loty.",
  },
  {
    title: "Powrót do planu",
    body: "Zapisany plan i ostatnie wyszukiwania pozwalają wracać bez zaczynania od zera.",
  },
];

export default function OfferPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h1 className="mt-3 font-display text-3xl leading-[1.08] text-ink sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">
          HelpTravel pomaga wybrać kierunek i przejść do kolejnych kroków wyjazdu.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">
          Nie trzeba znać całej trasy od razu. Możesz zacząć od miasta albo tylko od potrzeby, a dalej przejść do noclegów, lotów i rzeczy, które pomagają domknąć wyjazd.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 py-3 transition duration-150 ease-out hover:bg-brand-strong active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-bold text-white">Otwórz wyszukiwarkę hoteli</span>
          </Link>
          <Link
            href="/kierunki"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface-sunken px-5 py-3 transition duration-150 ease-out hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm font-semibold text-ink">Nie wiem dokąd lecieć</span>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {productBlocks.map((block) => (
          <article
            key={block.title}
            className="rounded-2xl border border-line bg-surface-raised p-5 shadow-sm"
          >
            <h2 className="text-2xl font-bold text-ink">{block.title}</h2>
            <p className="mt-3 text-sm leading-7 text-ink-muted">{block.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-ink">Najprostsze wejścia do serwisu</h2>
          <div className="mt-4 grid gap-3 text-sm">
              <Link href="/hotele/szukaj" className="group inline-flex min-h-11 items-center justify-center rounded-2xl bg-surface-raised px-4 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100">
                <span className="text-ink-muted transition group-hover:text-brand">Mam kierunek</span>
              </Link>
            <Link href="/kierunki" className="group inline-flex min-h-11 items-center justify-center rounded-2xl bg-surface-raised px-4 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100">
              <span className="text-ink-muted transition group-hover:text-brand">Pomóż mi wybrać</span>
            </Link>
            <Link href="/kierunki" className="group inline-flex min-h-11 items-center justify-center rounded-2xl bg-surface-raised px-4 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100">
              <span className="text-ink-muted transition group-hover:text-brand">Katalog kierunków</span>
            </Link>
            <Link href="/inspiracje" className="group inline-flex min-h-11 items-center justify-center rounded-2xl bg-surface-raised px-4 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100">
              <span className="text-ink-muted transition group-hover:text-brand">Pomysły na wyjazd</span>
            </Link>
          </div>
        </article>

        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-ink">Ważne ograniczenia</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-ink-muted">
            <p>Nie każdy kierunek ma taki sam poziom rozbudowania treści.</p>
            <p>Finalna rezerwacja może odbywać się u partnera, nie w samym HelpTravel.</p>
            <p>Ceny i dostępność potrafią zmieniać się po stronie partnera.</p>
          </div>
        </article>
      </section>
    </main>
  );
}

