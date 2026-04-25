import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cennik",
  description: "Korzystanie z HelpTravel jest darmowe. Zobacz, co jest bezpłatne i kiedy finalna cena zależy od partnera.",
  alternates: {
    canonical: "/cennik",
  },
  openGraph: {
    title: "Cennik | HelpTravel",
    description: "Korzystanie z HelpTravel jest darmowe. Finalne ceny i warunki zawsze sprawdzasz u partnera.",
    url: "/cennik",
  },
};

const cards = [
  {
    title: "Korzystanie z serwisu",
    body: "Planner, katalog kierunków i treści są darmowe. Nie ma abonamentu ani opłaty za samo planowanie wyjazdu.",
  },
  {
    title: "Skąd biorą się ceny",
    body: "Ceny noclegów, lotów i innych usług pochodzą od partnerów. Ostatni krok i finalna cena są zawsze po ich stronie.",
  },
  {
    title: "Jak zarabia serwis",
    body: "Częściowo przez linki partnerskie. Kliknięcie nie powinno podnosić ceny, ale może oznaczać prowizję dla serwisu.",
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Cennik</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">Korzystanie z HelpTravel jest darmowe.</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Pomagamy planować wyjazd i prowadzimy do kolejnych kroków. Gdy przechodzisz do konkretnej oferty, cena i
          warunki są już po stronie partnera rezerwacyjnego.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {cards.map((card) => (
          <article key={card.title} className="rounded-[1.8rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
            <h2 className="text-2xl font-bold text-emerald-950">{card.title}</h2>
            <p className="mt-3 text-sm leading-7 text-emerald-900/78">{card.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Co warto sprawdzić przed rezerwacją</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Walutę, politykę anulacji i ewentualne opłaty dodatkowe.</p>
            <p>To, czy termin, liczba osób i typ pokoju zgadzają się w ostatnim kroku.</p>
            <p>Czy oferta nie zmieniła się od momentu pierwszego wyszukania.</p>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Powiązane strony</h2>
          <div className="mt-4 grid gap-3 text-sm">
            <Link href="/faq" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              FAQ
            </Link>
            <Link href="/linki-partnerskie" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-emerald-900/78 transition hover:text-emerald-700">
              Linki partnerskie
            </Link>
            <Link href="/planner" className="rounded-2xl bg-emerald-700 px-4 py-3 font-semibold text-white transition hover:bg-emerald-800">
              Otwórz planner
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}


