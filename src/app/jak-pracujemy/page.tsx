import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Jak pracujemy",
  description: "Jak HelpTravel buduje przewodniki, strony kierunkowe i publiczna warstwe travel contentu.",
};

const principles = [
  {
    title: "Najpierw intencja uzytkownika",
    body: "Kazda nowa tresc ma odpowiadac na realne pytanie: jaki kierunek wybrac, kiedy leciec, ile dni zaplanowac i jak nie przepalic budzetu.",
  },
  {
    title: "Najpierw struktura, potem skala",
    body: "Nie stawiamy na dziesiatki pustych landingow. Kazda strona ma miec intro, sekcje praktyczne, FAQ, linkowanie i jasny powod istnienia.",
  },
  {
    title: "Najpierw wiarygodnosc, potem obietnice",
    body: "Nie dodajemy fikcyjnych liczb, partnerstw, ruchu czy nagrod. Wolimy pokazywac mniej, ale uczciwie i z naciskiem na przydatnosc.",
  },
];

const workflow = [
  "wybieramy temat z realnym potencjalem dla czytelnika i wyszukiwarki",
  "okreslamy, czy lepsza bedzie strona kierunku, artykul, kategoria czy sekcja planera",
  "budujemy tresc tak, by dalo sie z niej przejsc do kolejnego kroku: podobnego kierunku, planera albo partnera",
  "sprawdzamy, czy strona nie jest cienka i czy faktycznie wnosi wartosc sama w sobie",
];

export default function HowWeWorkPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Metodologia</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">Jak pracujemy nad tresciami i produktem</h1>
        <p className="mt-4 text-base leading-8 text-emerald-900/78">
          HelpTravel ma byc jednoczesnie planeriem wyjazdow i publicznym serwisem travelowym. Ta strona pokazuje,
          jak podchodzimy do budowy contentu, kierunkow i sciezek, ktore prowadza czytelnika od inspiracji do realnej decyzji.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {principles.map((principle) => (
          <article
            key={principle.title}
            className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="text-2xl font-bold text-emerald-950">{principle.title}</h2>
            <p className="mt-4 text-sm leading-7 text-emerald-900/78">{principle.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Jak powstaje nowa tresc</h2>
          <div className="mt-4 space-y-3">
            {workflow.map((step, index) => (
              <div key={step} className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm leading-7 text-emerald-900/78">
                <span className="mr-2 font-semibold text-emerald-800">{index + 1}.</span>
                {step}
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Co oznacza to dla czytelnika i partnera</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Czytelnik ma dostac konkret: nie tylko ladny landing, ale rzeczywiscie przydatny przewodnik lub porownanie.</p>
            <p>Partner afiliacyjny ma widziec projekt, ktory ma architekture contentowa, strony zaufania, indeksowalne huby i prawdziwa logike przejscia do oferty.</p>
            <p>Produkt ma rozwijac sie jak marka travel contentowa, a nie jak samotny widget lub jednorazowy eksperyment.</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/inspiracje"
              className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              Zobacz inspiracje
            </Link>
            <Link
              href="/standard-redakcyjny"
              className="rounded-full border border-emerald-900/10 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
            >
              Standard redakcyjny
            </Link>
            <Link
              href="/mapa-serwisu"
              className="rounded-full border border-emerald-900/10 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
            >
              Otworz mape serwisu
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
