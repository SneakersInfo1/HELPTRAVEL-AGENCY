import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cennik",
  description:
    "Przejrzyste zasady korzystania z HelpTravel: serwis jest bezplatny, a finalne ceny i warunki rezerwacji pochodza od partnerow.",
  alternates: {
    canonical: "/cennik",
  },
};

const pricingCards = [
  {
    title: "Korzystanie z serwisu",
    body: "Przegladanie kierunkow, inspiracji, FAQ i korzystanie z planera jest bezplatne. Nie ma abonamentu ani oplaty za samo uzycie produktu.",
  },
  {
    title: "Finalne ceny ofert",
    body: "Ceny hoteli, lotow i kolejnych uslug sa pokazywane przez partnerow. Finalna kwota moze zmienic sie wraz z dostepnoscia, waluta, podatkami albo polityka dostawcy.",
  },
  {
    title: "Model monetyzacji",
    body: "Serwis moze zarabiac przez linki partnerskie i przekierowania. Nie doliczamy wlasnej prowizji w interfejsie HelpTravel.",
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Cennik i platnosci</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">Jak wyglada koszt korzystania z HelpTravel</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          HelpTravel jest narzedziem do discovery i planowania wyjazdu, a nie platnym abonamentem. Ta strona jasno
          opisuje co jest bezplatne, skad biora sie ceny i gdzie finalnie sprawdzac warunki oferty.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {pricingCards.map((card) => (
          <article
            key={card.title}
            className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="text-2xl font-bold text-emerald-950">{card.title}</h2>
            <p className="mt-4 text-sm leading-7 text-emerald-900/78">{card.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Co warto wiedziec przed kliknieciem</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Cena widoczna w wynikach moze byc punktem wyjscia, ale finalny checkout i warunki zawsze naleza do partnera.</p>
            <p>Waluta, podatki lokalne, oplaty dodatkowe i polityka anulacji moga zalezec od partnera oraz momentu wyszukiwania.</p>
            <p>Jesli oferta jest wazna dla decyzji zakupowej, warto sprawdzic finalna wersje na stronie partnera przed platnoscia.</p>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Powiazane strony</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <Link href="/faq" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              FAQ o cenach, planach i partnerach
            </Link>
            <Link
              href="/linki-partnerskie"
              className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700"
            >
              Jak dzialaja linki partnerskie
            </Link>
            <Link href="/oferta" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Co oferuje HelpTravel
            </Link>
            <Link href="/planner" className="rounded-2xl bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800">
              Otworz planner
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
