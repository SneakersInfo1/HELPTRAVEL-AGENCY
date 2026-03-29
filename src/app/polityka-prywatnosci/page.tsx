import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polityka prywatnosci",
  description: "Informacje o danych, analityce, plikach cookie i partnerach zewnetrznych w HelpTravel.",
};

const privacySections = [
  {
    title: "Jakie dane moga byc przetwarzane",
    body: "Serwis moze przetwarzac podstawowe dane techniczne niezbedne do dzialania strony, zapisu sesji, zapisanych planow oraz podstawowej analityki ruchu i klikniec afiliacyjnych. W praktyce chodzi glownie o dane potrzebne do utrzymania ciaglosci korzystania z produktu i bezpiecznej obslugi publicznej wersji strony.",
  },
  {
    title: "Cele przetwarzania",
    body: "Zapytania do planera, klikniecia w oferty partnerow i historia zapisanych planow moga byc przetwarzane po to, aby ulepszac dzialanie serwisu, mierzyc zainteresowanie tresciami, analizowac skutecznosc poszczegolnych sekcji i zachowac ciaglosc korzystania z produktu.",
  },
  {
    title: "Podmioty zewnetrzne",
    body: "Serwis moze korzystac z zewnetrznych uslug i partnerow, w tym dostawcow obrazow, danych geolokalizacyjnych, wyszukiwarki lotow, narzedzi analitycznych oraz partnerow afiliacyjnych. Po przejsciu do partnera obowiazuja takze jego zasady prywatnosci i regulaminy.",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Prywatnosc</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">Polityka prywatnosci</h1>
        <p className="mt-4 text-base leading-8 text-emerald-900/78">
          Ta strona opisuje podstawowe zasady przetwarzania danych w publicznym serwisie HelpTravel. Dokument ma
          charakter informacyjny i powinien zostac zaktualizowany po wdrozeniu dodatkowych narzedzi, takich jak formularz
          kontaktowy, newsletter albo rozszerzona analityka marketingowa.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {privacySections.map((section) => (
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
          <h2 className="text-2xl font-bold text-emerald-950">Pliki cookie i sesje</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Serwis moze korzystac z plikow cookie lub podobnych mechanizmow do utrzymania sesji i dzialania zapisanych planow.</p>
            <p>Jesli dodasz kolejne narzedzia, na przyklad analityke zewnetrzna albo widgety partnerow, warto opisac je tutaj osobno i jasno.</p>
            <p>Na obecnym etapie priorytetem jest przejrzystosc: lepiej komunikowac mniej, ale uczciwie i konkretnie.</p>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Aktualizacje dokumentu</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>W miare rozwoju serwisu i wdrazania kolejnych partnerow lub narzedzi zakres polityki prywatnosci powinien byc aktualizowany.</p>
            <p>To dotyczy szczegolnie nowych zrodel danych, dodatkowej analityki, mailingow, formularzy i integracji z partnerami zewnetrznymi.</p>
            <p>Przed wiekszym ruchem publicznym warto tez skonsultowac finalna wersje dokumentu pod katem prawnym i RODO.</p>
          </div>
        </article>
      </section>
    </main>
  );
}
