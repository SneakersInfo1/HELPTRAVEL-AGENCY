import type { Metadata } from "next";

const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Kontakt w sprawie serwisu HelpTravel, tresci, wspolpracy i uwag do dzialania strony.",
};

const contactTopics = [
  "uwagi do tresci, przewodnikow i destination hubow",
  "bledy w wynikach planera albo redirectach partnerskich",
  "propozycje nowych kierunkow, kategorii i scenariuszy wyjazdow",
  "kontakt w sprawie wspolpracy afiliacyjnej lub wydawniczej",
];

export default function ContactPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Kontakt</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">Kontakt i sprawy serwisu</h1>
        <p className="mt-4 text-base leading-8 text-emerald-900/78">
          Ta strona sluzy do kontaktu w sprawie tresci, sugestii dotyczacych kierunkow, uwag do dzialania planerow oraz
          rozmow o wspolpracy afiliacyjnej i wydawniczej. To publiczny punkt kontaktu dla osob korzystajacych z serwisu
          oraz partnerow, ktorzy chca sprawdzic, ze projekt ma realna warstwe organizacyjna.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Dane kontaktowe</h2>
          {contactEmail ? (
            <p className="mt-3 text-sm leading-7 text-emerald-900/78">
              Napisz na:{" "}
              <a className="font-semibold text-emerald-800 underline-offset-4 hover:underline" href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
            </p>
          ) : (
            <p className="mt-3 text-sm leading-7 text-emerald-900/78">
              Adres kontaktowy nie jest jeszcze ustawiony w konfiguracji publicznej. Przed docelowa publikacja warto uzupelnic
              zmienna <code>NEXT_PUBLIC_CONTACT_EMAIL</code>, zeby ta strona byla kompletna biznesowo.
            </p>
          )}

          <div className="mt-5 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Najlatwiej opisac temat konkretnie: link do strony, miasto, scenariusz wyjazdu albo przyklad problemu.</p>
            <p>Jesli sprawa dotyczy tresci, dobrze wskazac adres konkretnej podstrony i to, co wymaga doprecyzowania.</p>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Najczestsze tematy</h2>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            {contactTopics.map((topic) => (
              <li key={topic} className="rounded-2xl bg-white px-4 py-3">
                {topic}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="text-2xl font-bold text-emerald-950">Zakres tej strony</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-emerald-50/75 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Tresci</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">
              Przyjmujemy uwagi do przewodnikow, inspiracji, sekcji FAQ i destination hubow.
            </p>
          </div>
          <div className="rounded-2xl bg-emerald-50/75 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Produkt</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">
              Mozna zglaszac bledy w wynikach, przeplywie planera, redirectach i publicznych stronach.
            </p>
          </div>
          <div className="rounded-2xl bg-emerald-50/75 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Wspolpraca</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">
              Strona jest przygotowana pod partnerstwa afiliacyjne i rozwoj wydawniczy bez fikcyjnych deklaracji.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
