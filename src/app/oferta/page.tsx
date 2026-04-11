import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Oferta",
  description:
    "Oferta HelpTravel: discovery kierunkow, planner wyjazdow, strony kierunkow, inspiracje i przejscia do partnerow rezerwacyjnych.",
  alternates: {
    canonical: "/oferta",
  },
};

const productBlocks = [
  {
    title: "Discovery dla niezdecydowanych",
    body:
      "Uzytkownik moze opisac czego szuka, a planner buduje shortlist kierunkow, argumenty wyboru i kolejne kroki wyjazdu.",
  },
  {
    title: "Planner dla osob z konkretnym kierunkiem",
    body:
      "Po wybraniu miasta produkt prowadzi do pobytu, lotow, atrakcji i dalszych decyzji w jednym, uporzadkowanym flow.",
  },
  {
    title: "Warstwa contentowa",
    body:
      "Destination huby, przewodniki i kategorie tematyczne pomagaja podjac decyzje zanim uzytkownik przejdzie do wynikow partnera.",
  },
  {
    title: "Kontynuacja planowania",
    body:
      "Produkt zapisuje plan, scenariusze i kierunki, dzieki czemu latwiej wrocic do poprzednich wyborow i porownan.",
  },
];

export default function OfferPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Oferta produktu</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">Co faktycznie oferuje HelpTravel</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          HelpTravel nie jest tylko blogiem ani tylko zbiorem linkow afiliacyjnych. To polski serwis do discovery,
          decision support i planowania wyjazdu, ktory laczy tresc, planner i przejscie do partnera rezerwacyjnego.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        {productBlocks.map((block) => (
          <article
            key={block.title}
            className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="text-2xl font-bold text-emerald-950">{block.title}</h2>
            <p className="mt-4 text-sm leading-7 text-emerald-900/78">{block.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Najwazniejsze wejscia do produktu</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <Link href="/planner?mode=discovery" className="rounded-2xl bg-white px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Nie wiem dokad leciec
            </Link>
            <Link href="/planner?mode=standard" className="rounded-2xl bg-white px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Mam kierunek
            </Link>
            <Link href="/kierunki" className="rounded-2xl bg-white px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Katalog kierunkow
            </Link>
            <Link href="/inspiracje" className="rounded-2xl bg-white px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Inspiracje i blog travelowy
            </Link>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Powiazane strony zaufania</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <Link href="/faq" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              FAQ
            </Link>
            <Link href="/cennik" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Cennik
            </Link>
            <Link href="/jak-pracujemy" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Jak pracujemy
            </Link>
            <Link href="/linki-partnerskie" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Linki partnerskie
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
