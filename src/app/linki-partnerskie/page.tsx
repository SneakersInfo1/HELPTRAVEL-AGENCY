import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Linki partnerskie",
  description: "Informacja o linkach partnerskich i przekierowaniach do zewnętrznych partnerów rezerwacyjnych.",
  alternates: {
    canonical: "/linki-partnerskie",
  },
  openGraph: {
    title: "Linki partnerskie | HelpTravel",
    description: "Jak działają linki partnerskie w HelpTravel i gdzie odbywa się finalna rezerwacja.",
    url: "/linki-partnerskie",
  },
};

export default function AffiliateDisclosurePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <h1 className="font-display text-5xl leading-[0.95] text-emerald-950">Informacja o linkach partnerskich</h1>
        <div className="mt-5 space-y-4 text-sm leading-7 text-emerald-900/78">
          <p>
            Na stronie mogą pojawiać się linki partnerskie i przyciski przekierowujące do zewnętrznych partnerów.
            Oznacza to, że po kliknięciu możesz przejść do serwisu partnera, który finalnie pokazuje ofertę albo
            obsługuje rezerwacje.
          </p>
          <p>
            Samo kliknięcie nie podnosi ceny oferty. W niektórych przypadkach HelpTravel może otrzymać prowizję, jeśli
            partner przewiduje taki model.
          </p>
          <p>
            To jeden ze sposobów finansowania serwisu, dlatego opisujemy go wprost i nie ukrywamy roli partnera w
            finalnym etapie rezerwacji.
          </p>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Jak to działa w praktyce</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Najpierw czytasz przewodnik albo korzystasz z planera.</p>
            <p>Potem wybierasz nocleg, lot albo kolejny krok i przechodzisz do partnera z ustawionym kierunkiem oraz terminem.</p>
            <p>Finalna rezerwacja, warunki i cena są zawsze po stronie partnera, nie po stronie HelpTravel.</p>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Co warto wiedziec przed kliknięciem</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Oferty, ceny i dostępność mogą zmieniać się po stronie partnera, dlatego finalne warunki zawsze warto sprawdzić przed zakupem.</p>
            <p>Nasza rola polega na uporządkowaniu wyboru kierunku i przeprowadzeniu Cię do kolejnego kroku bez chaosu.</p>
            <p>Finalna decyzja, warunki i obsługa transakcji zawsze należą do zewnętrznego partnera rezerwacyjnego.</p>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="text-2xl font-bold text-emerald-950">Jak czytac wyniki i przyciski ofertowe</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Przewodnik i poradnik</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">
              Te strony pomagają zrozumieć kierunek, budżet i styl wyjazdu zanim przejdziesz do ofert.
            </p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Planner i wyniki</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">
              Planner porządkuje termin, skład wyjazdu i następne kroki, ale nie zastępuje finalnej weryfikacji u partnera.
            </p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Klik i przejście</p>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">
              Po kliknięciu możemy zapisać kontekst wyjazdu i otworzyć partnera zewnętrznego, gdzie odbywa się finalny etap.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="text-2xl font-bold text-emerald-950">Powiązane strony</h2>
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
            Jak to działa
          </Link>
        </div>
      </section>
    </main>
  );
}


