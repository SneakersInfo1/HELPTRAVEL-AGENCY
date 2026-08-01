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
  // Fallback na adres, nie na stronę /kontakt — ta została zdjęta 2026-07-30,
  // a link do nieistniejącej strony jest gorszy niż domyślny e-mail.
  const emailHref = `mailto:${contactEmail || "kontakt@helptravel.pl"}?subject=Współpraca%20HelpTravel`;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <section className="overflow-hidden rounded-[2rem] border border-line bg-surface-raised shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="p-6 sm:p-8">
            <h1 className="mt-3 max-w-3xl font-display text-3xl leading-[1.08] text-ink sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">
              Współpraca z HelpTravel
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">
              HelpTravel to serwis dla osób, które chcą szybciej wybrać kierunek, ustawić plan i przejść do rezerwacji u partnera. Ta strona zbiera najważniejsze informacje dla partnerów, bez ukrywania modelu afiliacyjnego.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <LocalizedLink
                href={emailHref}
                className="rounded-full bg-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-strong"
              >
                Napisz w sprawie współpracy
              </LocalizedLink>
            </div>
          </div>

          <div className="border-t border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 sm:p-8 lg:border-l lg:border-t-0">
            <h2 className="font-display text-2xl text-ink">Serwis w liczbach</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white px-4 py-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Kierunki</p>
                <p className="mt-2 text-3xl font-bold text-ink">{destinations.length}</p>
                <p className="mt-1 text-sm text-ink-muted">stron kierunków z lokalnym opisem i FAQ.</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Artykuły</p>
                <p className="mt-2 text-3xl font-bold text-ink">{articles.length}</p>
                <p className="mt-1 text-sm text-ink-muted">praktycznych tekstow wokół wyjazdów i kierunków.</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Kategorie</p>
                <p className="mt-2 text-3xl font-bold text-ink">{categories.length}</p>
                <p className="mt-1 text-sm text-ink-muted">główne wejscia tematyczne dla czytelnika.</p>
              </div>
              <div className="rounded-2xl bg-white px-4 py-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Kontakt</p>
                <p className="mt-2 text-3xl font-bold text-ink">{contactEmail ? "aktywny" : "przez formularz"}</p>
                <p className="mt-1 text-sm text-ink-muted">jawny punkt kontaktu dla partnerów.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        {audienceCards.map((card) => (
          <article
            key={card.title}
            className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm"
          >
            <h2 className="text-2xl font-bold text-ink">{card.title}</h2>
            <p className="mt-4 text-sm leading-7 text-ink-muted">{card.body}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
            <h2 className="font-display text-2xl text-ink">Gdzie możemy pokazać partnera</h2>
          <div className="mt-4 grid gap-3">
            {placementFormats.map((format) => (
              <div key={format.title} className="rounded-2xl bg-surface-sunken px-4 py-4">
                <h3 className="text-lg font-bold text-ink">{format.title}</h3>
                <p className="mt-2 text-sm leading-7 text-ink-muted">{format.body}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-sm">
          <h2 className="font-display text-2xl text-ink">Dlaczego to ma sens</h2>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-ink-muted">
            {partnerBenefits.map((item) => (
              <li key={item} className="rounded-2xl bg-white px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="font-display text-2xl text-ink">Co jest już publiczne</h2>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-ink-muted">
            {reviewSignals.map((item) => (
              <li key={item} className="rounded-2xl bg-surface-sunken px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(7,30,18,0.96),rgba(8,40,24,0.92))] p-6 text-white shadow-sm">
          <h2 className="font-display text-2xl text-ink">Jak wygląda współpraca</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-white/82">
            <p>1. Ustalamy, czy chodzi o treść, planner, kierunek czy konkretny scenariusz wyjazdu.</p>
            <p>2. Dobieramy miejsce widocznosci i sposób przejścia do partnera.</p>
            <p>3. Sprawdzamy deeplinki, routing i oznaczenia partnerskie.</p>
            <p>4. Zostawiamy całość czytelną dla użytkownika, bez udawania czegoś większego niż serwis jest.</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <LocalizedLink
              href={emailHref}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-bold text-white transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              Napisz do nas
            </LocalizedLink>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="mt-2 font-display text-4xl text-ink">Strony, które warto sprawdzić przed rozmową.</h2>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <LocalizedLink href="/mapa-serwisu" className="rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted transition hover:text-brand">
            Mapa serwisu
          </LocalizedLink>
          <LocalizedLink href="/oferta" className="rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted transition hover:text-brand">
            Oferta
          </LocalizedLink>
          <LocalizedLink href="/faq" className="rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted transition hover:text-brand">
            FAQ
          </LocalizedLink>
          <LocalizedLink href="/standard-redakcyjny" className="rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted transition hover:text-brand">
            Standard redakcyjny
          </LocalizedLink>
          <LocalizedLink href="/jak-pracujemy" className="rounded-2xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted transition hover:text-brand">
            Jak pracujemy
          </LocalizedLink>
        </div>
      </section>
    </main>
  );
}



