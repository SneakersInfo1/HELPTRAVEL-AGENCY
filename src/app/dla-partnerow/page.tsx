import type { Metadata } from "next";
import { LocalizedLink } from "@/components/site/localized-link";
import { getEditorialArticles, getEditorialCategories, getPublishedDestinations } from "@/lib/mvp/publisher-content";

const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

export const metadata: Metadata = {
  title: "Dla partnerów",
  description:
    "Informacje o współpracy z HelpTravel: do kogo dociera serwis, jak wygląda ekspozycja i gdzie napisać.",
  alternates: {
    canonical: "/dla-partnerow",
  },
  robots: {
    index: false,
    follow: true,
  },
  openGraph: {
    title: "Współpraca z HelpTravel",
    description: "Najważniejsze informacje o współpracy z HelpTravel i kontakt do pierwszej rozmowy.",
    url: "/dla-partnerow",
    type: "website",
  },
};

const audienceCards = [
  {
    title: "Polski odbiorca",
    body: "Serwis jest budowany dla osób z Polski, które szukają city breaków, krótkich urlopów, ciepłych kierunków i prostszej decyzji wyjazdowej.",
  },
  {
    title: "Ruch z intencja",
    body: "Treści i planner prowadzą użytkownika od pomysłu do konkretnego kierunku, a potem do partnera rezerwacyjnego. Chodzi o jasną decyzję, nie przypadkowy klik.",
  },
  {
    title: "Przejrzysty model",
    body: "HelpTravel nie udaje biura podróży. Pomagamy wybrać kierunek, ustawić plan i przejść do rezerwacji u partnera w przejrzysty sposób.",
  },
];

const placementFormats = [
  {
    title: "Strona kierunku",
    body:
      "Dla konkretnego miasta lub kierunku: opis, najlepszy czas, budżet, FAQ, noclegi i przejście do planera.",
  },
  {
    title: "Artykuł inspiracyjny",
    body:
      "Dla fraz typu 'gdzie polecieć zima z Polski' albo 'city break do 2000 zł'. Artykuł daje kontekst i otwiera dalszy wybór.",
  },
  {
    title: "Kategoria tematyczna",
    body:
      "Dla szerszego ruchu i segmentacji. Kategorie spinają treści, kierunki i planner pod konkretne potrzeby.",
  },
  {
    title: "Przejście do planera",
    body:
      "Przejście z treści do planera. Użytkownik wpisuje potrzebę, a serwis prowadzi go do uporządkowanego wyniku i partnera.",
  },
];

const reviewSignals = [
  "publiczne strony kierunków z FAQ, lokalnym kontekstem i CTA do planera",
  "indeksowalne artykuły i kategorie tematyczne pod realne frazy travelowe",
  "strony zaufania: o serwisie, kontakt, polityka prywatnosci, regulamin i disclosure",
  "wewnetrzne linkowanie między treścia, plannerem i partnerem rezerwacyjnym",
];

const partnerBenefits = [
  "serwis łączy planner, treści i linki partnerskie w jednym miejscu",
  "użytkownik dostaje kontekst przed kliknięciem w ofertę",
    "linki partnerskie są oznaczane publicznie i transparentnie",
  "całość jest po polsku i dopasowana do rynku PL",
];

export default function PartnersPage() {
  const destinations = getPublishedDestinations();
  const articles = getEditorialArticles();
  const categories = getEditorialCategories();
  const emailHref = contactEmail ? `mailto:${contactEmail}?subject=Współpraca%20HelpTravel` : "/kontakt";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white/95 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="p-6 sm:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Współpraca</p>
            <h1 className="mt-3 max-w-3xl font-display text-5xl leading-[0.95] text-emerald-950">
              Współpraca z HelpTravel
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
              HelpTravel to serwis dla osób, które chcą szybciej wybrać kierunek, ustawić plan i przejść do rezerwacji u partnera. Ta strona zbiera najważniejsze informacje dla partnerów, bez ukrywania modelu afiliacyjnego.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LocalizedLink
                href={emailHref}
                className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800"
              >
                Napisz w sprawie współpracy
              </LocalizedLink>
              <LocalizedLink
                href="/linki-partnerskie"
                className="rounded-full border border-emerald-900/10 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100"
              >
                Jak oznaczamy linki partnerskie
              </LocalizedLink>
            </div>
          </div>

          <div className="border-t border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 sm:p-8 lg:border-l lg:border-t-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Serwis w liczbach</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(16,84,48,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Kierunki</p>
                <p className="mt-2 text-3xl font-bold text-emerald-950">{destinations.length}</p>
                <p className="mt-1 text-sm text-emerald-900/72">stron kierunków z lokalnym opisem i FAQ.</p>
              </div>
              <div className="rounded-[1.5rem] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(16,84,48,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Artykuły</p>
                <p className="mt-2 text-3xl font-bold text-emerald-950">{articles.length}</p>
                <p className="mt-1 text-sm text-emerald-900/72">praktycznych tekstow wokół wyjazdów i kierunków.</p>
              </div>
              <div className="rounded-[1.5rem] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(16,84,48,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Kategorie</p>
                <p className="mt-2 text-3xl font-bold text-emerald-950">{categories.length}</p>
                <p className="mt-1 text-sm text-emerald-900/72">główne wejscia tematyczne dla czytelnika.</p>
              </div>
              <div className="rounded-[1.5rem] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(16,84,48,0.05)]">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Kontakt</p>
                <p className="mt-2 text-3xl font-bold text-emerald-950">{contactEmail ? "aktywny" : "przez formularz"}</p>
                <p className="mt-1 text-sm text-emerald-900/72">jawny punkt kontaktu dla partnerów.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {audienceCards.map((card) => (
          <article
            key={card.title}
            className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="text-2xl font-bold text-emerald-950">{card.title}</h2>
            <p className="mt-4 text-sm leading-7 text-emerald-900/78">{card.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Gdzie możemy pokazać partnera</p>
          <div className="mt-4 grid gap-3">
            {placementFormats.map((format) => (
              <div key={format.title} className="rounded-2xl bg-emerald-50/75 px-4 py-4">
                <h3 className="text-lg font-bold text-emerald-950">{format.title}</h3>
                <p className="mt-2 text-sm leading-7 text-emerald-900/78">{format.body}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dlaczego to ma sens</p>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            {partnerBenefits.map((item) => (
              <li key={item} className="rounded-2xl bg-white px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Co jest już publiczne</p>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-emerald-900/78">
            {reviewSignals.map((item) => (
              <li key={item} className="rounded-2xl bg-emerald-50/75 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(7,30,18,0.96),rgba(8,40,24,0.92))] p-6 text-white shadow-[0_20px_54px_rgba(8,40,24,0.18)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Jak wygląda współpraca</p>
          <div className="mt-4 space-y-3 text-sm leading-7 text-white/82">
            <p>1. Ustalamy, czy chodzi o treść, planner, kierunek czy konkretny scenariusz wyjazdu.</p>
            <p>2. Dobieramy miejsce widocznosci i sposób przejścia do partnera.</p>
            <p>3. Sprawdzamy deeplinki, routing i oznaczenia partnerskie.</p>
            <p>4. Zostawiamy całość czytelną dla użytkownika, bez udawania czegoś większego niż serwis jest.</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <LocalizedLink
              href={emailHref}
              className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
            >
              Napisz do nas
            </LocalizedLink>
            <LocalizedLink
              href="/kontakt"
              className="rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/12"
            >
              Kontakt i szczegoly
            </LocalizedLink>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Dodatkowe wejscia</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950">Strony, które warto sprawdzić przed rozmową.</h2>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <LocalizedLink href="/mapa-serwisu" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Mapa serwisu
          </LocalizedLink>
          <LocalizedLink href="/oferta" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Oferta
          </LocalizedLink>
          <LocalizedLink href="/faq" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            FAQ
          </LocalizedLink>
          <LocalizedLink href="/standard-redakcyjny" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Standard redakcyjny
          </LocalizedLink>
          <LocalizedLink href="/jak-pracujemy" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Jak pracujemy
          </LocalizedLink>
          <LocalizedLink href="/linki-partnerskie" className="rounded-2xl bg-emerald-50/75 px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
            Linki partnerskie
          </LocalizedLink>
        </div>
      </section>
    </main>
  );
}



