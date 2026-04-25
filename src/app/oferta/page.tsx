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
    body: "Opisujesz, jakiego wyjazdu szukasz, a planner pomaga zawęzić kierunki i porównać kilka sensownych opcji.",
  },
  {
    title: "Kierunki i pomysły",
    body: "Możesz przejść przez przewodniki, scenariusze i kategorie, zanim wejdziesz w sam planner.",
  },
  {
    title: "Powrót do planu",
    body: "Zapisany plan i ostatnie wyszukiwania pozwalają wracać bez zaczynania od zera.",
  },
];

export default function OfferPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Oferta</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">
          HelpTravel pomaga wybrać kierunek i przejść do kolejnych kroków wyjazdu.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Nie trzeba znać całej trasy od razu. Możesz zacząć od miasta albo tylko od potrzeby, a dalej przejść do noclegów, lotów i rzeczy, które pomagają domknąć wyjazd.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {productBlocks.map((block) => (
          <article
            key={block.title}
            className="rounded-[1.8rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="text-2xl font-bold text-emerald-950">{block.title}</h2>
            <p className="mt-3 text-sm leading-7 text-emerald-900/78">{block.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Najprostsze wejścia do serwisu</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <Link href="/planner?mode=standard" className="rounded-2xl bg-white px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Mam kierunek
            </Link>
            <Link href="/planner?mode=discovery" className="rounded-2xl bg-white px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Pomóż mi wybrać
            </Link>
            <Link href="/kierunki" className="rounded-2xl bg-white px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Katalog kierunków
            </Link>
            <Link href="/inspiracje" className="rounded-2xl bg-white px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Pomysły na wyjazd
            </Link>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Ważne ograniczenia</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Nie każdy kierunek ma taki sam poziom rozbudowania treści.</p>
            <p>Finalna rezerwacja może odbywać się u partnera, nie w samym HelpTravel.</p>
            <p>Ceny i dostępność potrafią zmieniać się po stronie partnera.</p>
          </div>
        </article>
      </section>
    </main>
  );
}


