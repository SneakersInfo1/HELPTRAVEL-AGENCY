import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Linki partnerskie",
  description: "Informacja o linkach partnerskich i przekierowaniach do zewnetrznych partnerow rezerwacyjnych.",
  alternates: {
    canonical: "/linki-partnerskie",
  },
};

export default function AffiliateDisclosurePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <h1 className="font-display text-5xl leading-[0.95] text-emerald-950">Informacja o linkach partnerskich</h1>
        <div className="mt-5 space-y-4 text-sm leading-7 text-emerald-900/78">
          <p>
            Na stronie moga pojawiac sie linki partnerskie i przyciski przekierowujace do zewnetrznych partnerow. Oznacza to,
            ze po kliknieciu uzytkownik moze przejsc do serwisu partnera, ktory finalnie obsluguje rezerwacje lub prezentuje
            szczegoly oferty.
          </p>
          <p>
            Klikniecia w takie linki moga byc mierzone na potrzeby analityki i rozliczen partnerskich. Samo klikniecie nie
            wplywa na cene oferty, ale moze oznaczac, ze serwis otrzyma prowizje, jesli partner przewiduje taki model.
          </p>
          <p>
            Linki partnerskie sa jednym z modeli monetyzacji serwisu i dlatego oznaczamy je w sposob przejrzysty,
            bez ukrywania roli partnera w finalnym etapie rezerwacji.
          </p>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Jak wyglada flow partnerski</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Uzytkownik czyta tresc albo korzysta z planera.</p>
            <p>Po kliknieciu w oferte przechodzi przez wewnetrzny redirect, ktory zapisuje kontekst i mierzy klikniecie.</p>
            <p>Finalna rezerwacja, warunki i cena sa zawsze po stronie partnera, nie po stronie tego serwisu.</p>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Co jest wazne dla uzytkownika</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Oferty, ceny i dostepnosc moga zmieniac sie po stronie partnera, dlatego finalne warunki zawsze warto sprawdzic przed zakupem.</p>
            <p>Nasza rola polega na uporzadkowaniu wyboru kierunku i przekazaniu uzytkownika do kolejnego kroku w czytelnym flow.</p>
            <p>Finalna decyzja, warunki i obsluga transakcji zawsze naleza do zewnetrznego partnera rezerwacyjnego.</p>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="text-2xl font-bold text-emerald-950">Jak czytac wyniki i przyciski ofertowe</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Artykul i przewodnik</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">
              Warstwa contentowa ma pomagac zrozumiec kierunek, budzet i styl wyjazdu zanim przejdziesz do ofert.
            </p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Planer i wyniki</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">
              Planer porzadkuje scenariusz i prowadzi do partnerow, ale nie zastepuje finalnej weryfikacji u zewnetrznego dostawcy.
            </p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Klik i przejscie</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">
              Po kliknieciu mozliwe jest zapisanie kontekstu wyjazdu i przejscie do partnera zewnetrznego, gdzie odbywa sie finalny etap.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="text-2xl font-bold text-emerald-950">Powiazane strony</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link href="/faq" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            FAQ
          </Link>
          <Link href="/cennik" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Cennik
          </Link>
          <Link href="/oferta" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Oferta
          </Link>
          <Link href="/jak-pracujemy" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Jak pracujemy
          </Link>
        </div>
      </section>
    </main>
  );
}

