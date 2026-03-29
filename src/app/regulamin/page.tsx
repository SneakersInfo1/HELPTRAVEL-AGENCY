import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Regulamin",
  description: "Podstawowe zasady korzystania z serwisu HelpTravel.",
  alternates: {
    canonical: "/regulamin",
  },
};

const rules = [
  "Serwis ma charakter informacyjny, wydawniczy i pomocniczy. Nie jest samodzielnym biurem podrozy ani pelnym systemem rezerwacyjnym.",
  "Wyniki planera, przewodniki i artykuly maja pomagac w podjeciu decyzji, ale finalne warunki oferty zawsze nalezy sprawdzic u partnera, do ktorego prowadzi link zewnetrzny.",
  "Korzystanie z serwisu oznacza akceptacje zasad zgodnego i legalnego korzystania z publikowanych tresci, interfejsu i narzedzi.",
  "Wlasciciel serwisu moze aktualizowac tresci, strukture strony i zakres dostepnych partnerow, gdy jest to potrzebne dla rozwoju projektu lub poprawnosci informacji.",
];

export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Warunki korzystania</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">Regulamin</h1>
        <p className="mt-4 text-base leading-8 text-emerald-900/78">
          Ten dokument opisuje podstawowe zasady korzystania z serwisu publicznego HelpTravel. Jego celem jest
          uczciwe wyjasnienie, czym jest projekt, czego moze oczekiwac uzytkownik i jak rozumiec tresci oraz wyniki
          prezentowane na stronie.
        </p>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <h2 className="text-2xl font-bold text-emerald-950">Najwazniejsze zasady</h2>
        <div className="mt-4 space-y-3">
          {rules.map((rule) => (
            <div key={rule} className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm leading-7 text-emerald-900/78">
              {rule}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Odpowiedzialnosc za oferty i ceny</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Serwis moze prezentowac wyniki i linki do partnerow zewnetrznych, ale nie gwarantuje niezmiennosci ceny, dostepnosci ani warunkow oferty.</p>
            <p>Ostateczna cena, regulamin i proces rezerwacji zawsze naleza do partnera, do ktorego prowadzi klikniecie.</p>
            <p>Jesli feed partnera chwilowo nie jest dostepny, serwis moze pokazac brak danych zamiast tworzyc sztuczne oferty.</p>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <h2 className="text-2xl font-bold text-emerald-950">Tresci i prawa do korzystania</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p>Tresci, opisy, uklady stron i materialy opublikowane w serwisie maja sluzyc do korzystania z projektu i nie powinny byc kopiowane bez zgody wlasciciela.</p>
            <p>Dopuszczalne jest zwykle cytowanie i linkowanie do podstron zgodnie z normalnym obiegiem internetowym, ale nie masowe kopiowanie tresci czy ofert.</p>
            <p>Przy rozwoju projektu warto doprecyzowac ten dokument pod finalny model biznesowy i wlasnosc marki.</p>
          </div>
        </article>
      </section>
    </main>
  );
}
