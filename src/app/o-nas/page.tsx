import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "O serwisie",
  description: "Czym jest HelpTravel, dla kogo powstał i czego nie udaje.",
  alternates: {
    canonical: "/o-nas",
  },
  openGraph: {
    title: "O serwisie | HelpTravel",
    description: "Poznaj HelpTravel: prosty planner krótkich wyjazdów dla osób z Polski.",
    url: "/o-nas",
  },
};

const facts = [
  {
    title: "Dla kogo jest HelpTravel",
    body: "Głównie dla osób z Polski, które planują krótkie lub średnie wyjazdy: city break, ciepły wypad, weekend we dwoje albo prosty urlop 3-7 dni.",
  },
  {
    title: "Co robimy",
    body: "Pomagamy wybrać kierunek, ustawić podstawy wyjazdu i przejść do noclegów, lotów oraz kolejnych kroków bez skakania po wielu zakładkach.",
  },
  {
    title: "Czego nie udajemy",
    body: "Nie jesteśmy biurem podróży, nie wystawiamy fikcyjnych opinii i nie udajemy, że finalna rezerwacja odbywa się u nas.",
  },
];

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">O serwisie</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">HelpTravel ma pomagać szybciej wybrać wyjazd i nie komplikować go od pierwszej minuty.</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Łączymy planner, katalog kierunków i praktyczne treści po to, żeby nowy użytkownik mógł szybko zrozumieć, dokąd warto lecieć, na ile dni i od czego zacząć dalsze planowanie.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {facts.map((item) => (
          <article
            key={item.title}
            className="rounded-[1.8rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-5 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="text-2xl font-bold text-emerald-950">{item.title}</h2>
            <p className="mt-3 text-sm leading-7 text-emerald-900/78">{item.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Jak wygląda typowa ścieżka</h2>
          <ol className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <li className="rounded-2xl bg-emerald-50/75 px-4 py-3">1. Wybierasz kierunek albo prosisz o pomysł na wyjazd.</li>
            <li className="rounded-2xl bg-emerald-50/75 px-4 py-3">2. Ustawiasz termin, wylot i liczbę osób.</li>
            <li className="rounded-2xl bg-emerald-50/75 px-4 py-3">3. Przechodzisz do noclegów, lotów i kolejnych kroków.</li>
          </ol>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Uczciwy model serwisu</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Korzystanie z HelpTravel jest darmowe.</p>
            <p>Gdy przechodzisz do oferty, finalna rezerwacja może odbywać się u partnera.</p>
            <p>Ceny i warunki zawsze warto sprawdzić w ostatnim kroku po stronie partnera.</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/linki-partnerskie" className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">
              Jak działają linki partnerskie
            </Link>
            <Link href="/faq" className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100">
              FAQ
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}


