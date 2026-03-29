import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "O nas",
  description: "Poznaj HelpTravel - polski serwis do odkrywania kierunkow, planowania wyjazdow i przechodzenia do ofert partnerow.",
  alternates: {
    canonical: "/o-nas",
  },
};

const pillars = [
  {
    title: "Warstwa tresciowa",
    body: "Serwis publikuje destination huby, przewodniki i scenariusze wyjazdow dla polskiego odbiorcy. Tresci maja pomagac w realnej decyzji, a nie tylko wspierac SEO.",
  },
  {
    title: "Warstwa produktowa",
    body: "Planer ma pomagac przejsc od potrzeby do konkretnego kierunku. W efekcie projekt nie jest tylko blogiem ani tylko narzedziem, ale hybryda obu tych swiatow.",
  },
  {
    title: "Warstwa publiczna",
    body: "Nie dodajemy fikcyjnych rankingow, ruchu ani opinii. Zamiast tego budujemy serwis stopniowo, opierajac sie na realnych integracjach, praktycznych tresciach i otwartym modelu afiliacyjnym.",
  },
];

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">O marce</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">HelpTravel</h1>
        <p className="mt-4 text-base leading-8 text-emerald-900/78">
          HelpTravel laczy dwie warstwy: praktyczny planer wyjazdow i publiczny serwis travelowy z tresciami o
          kierunkach, scenariuszach wyjazdow i city breakach. Celem projektu jest pomagac w szybszym wyborze kierunku i
          prowadzeniu do sensownych, partnerskich ofert rezerwacyjnych.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Jak dziala serwis</h2>
          <p className="mt-3 text-sm leading-7 text-emerald-900/78">
            Na stronie znajdziesz katalog kierunkow, praktyczne inspiracje, podstrony z opisami wyjazdow oraz planer,
            ktory pomaga przejsc od ogolnej potrzeby do konkretnego scenariusza. W glownym flow nie pokazujemy
            wymyslonych cen jako realnych ofert.
          </p>
          <p className="mt-3 text-sm leading-7 text-emerald-900/78">
            Chcemy, zeby serwis byl jednoczesnie uzyteczny dla czytelnika i wiarygodny dla partnerow. Dlatego warstwa
            tresciowa i planer pracuja razem, a nie osobno.
          </p>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Jak zarabia projekt</h2>
          <p className="mt-3 text-sm leading-7 text-emerald-900/78">
            Serwis moze korzystac z linkow partnerskich i przekierowan do zewnetrznych partnerow. Oznacza to, ze po
            kliknieciu w oferte uzytkownik moze przejsc do zewnetrznego serwisu rezerwacyjnego. Szczegoly sa opisane na
            stronie o linkach partnerskich.
          </p>
          <Link href="/linki-partnerskie" className="mt-4 inline-flex text-sm font-semibold text-emerald-800 hover:text-emerald-700">
            Zobacz informacje o linkach partnerskich
          </Link>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {pillars.map((pillar) => (
          <article
            key={pillar.title}
            className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{pillar.title}</p>
            <p className="mt-3 text-sm leading-7 text-emerald-900/78">{pillar.body}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="text-2xl font-bold text-emerald-950">Co ma budowac wiarygodnosc tej strony</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-emerald-50/75 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Jawny model</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">
              Strona otwarcie komunikuje, ze korzysta z partnerow zewnetrznych i nie udaje pelnego booking engine.
            </p>
          </div>
          <div className="rounded-2xl bg-emerald-50/75 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Prawdziwy content</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">
              Kierunki, przewodniki, FAQ i strony kategorii sa publiczne, indeksowalne i przydatne same w sobie.
            </p>
          </div>
          <div className="rounded-2xl bg-emerald-50/75 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Bez fikcji</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">
              Nie ma tu fikcyjnych liczb, nagrod, partnerstw ani sztucznej warstwy social proof.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
