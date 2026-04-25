import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Jak to działa",
  description: "Prosty opis tego, jak HelpTravel pomaga przejść od pomysłu na wyjazd do kolejnych kroków.",
  alternates: {
    canonical: "/jak-pracujemy",
  },
};

const principles = [
  "Najpierw pomagamy wybrać kierunek albo zawęzić pomysł na wyjazd.",
  "Potem porządkujemy termin, skład podróży i kolejne decyzje.",
  "Na końcu przechodzisz do noclegów, lotów i dalszych kroków u partnera.",
];

export default function HowItWorksPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Jak to działa</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">
          Pomagamy przejść od pomysłu na wyjazd do konkretnego następnego kroku.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Nie trzeba zaczynać od idealnego planu. Możesz mieć gotowy kierunek albo tylko ogólny pomysł typu
          &quot;ciepły wypad na 5 dni&quot;. Serwis ma pomóc uporządkować to w lekkiej i czytelnej kolejności.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {principles.map((item, index) => (
          <article
            key={item}
            className="rounded-[1.8rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-5 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Krok {index + 1}</p>
            <p className="mt-3 text-sm leading-7 text-emerald-900/78">{item}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Co dostajesz po kliknięciu</h2>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            <li className="rounded-2xl bg-emerald-50/75 px-4 py-3">Prostszy wybór kierunku albo krótka shortlista kilku opcji.</li>
            <li className="rounded-2xl bg-emerald-50/75 px-4 py-3">Gotowe przejście do noclegów i lotów z tym samym terminem.</li>
          <li className="rounded-2xl bg-emerald-50/75 px-4 py-3">Możliwość zapisania planu i powrotu do niego później.</li>
          </ul>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Czego nie robimy</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Nie udajemy biura podróży ani nie obiecujemy cen, których nie kontrolujemy.</p>
            <p>Nie wypełniamy serwisu fikcyjnymi opiniami ani sztucznym social proof.</p>
            <p>Nie chowamy przed użytkownikiem tego, że końcowy krok rezerwacji może prowadzić do partnera.</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/planner" className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">
              Otwórz planner
            </Link>
            <Link href="/linki-partnerskie" className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100">
              Zobacz zasady partnerów
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}


