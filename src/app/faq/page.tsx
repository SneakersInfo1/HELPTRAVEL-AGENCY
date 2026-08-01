import type { Metadata } from "next";
import Link from "next/link";

import { TRUSTED_TRAVEL_RESOURCES } from "@/lib/mvp/trusted-resources";

const faqItems = [
  {
    question: "Czy korzystanie z HelpTravel jest płatne?",
    answer:
      "Nie. Korzystanie z katalogu kierunków, treści i planera jest bezpłatne. Finalne ceny i warunki rezerwacji są zawsze pokazywane i obsługiwane przez zewnętrznego partnera.",
  },
  {
    question: "Czy rezerwacja odbywa się bezpośrednio na HelpTravel?",
    answer:
      "Nie zawsze. HelpTravel pomaga wybrać kierunek, uporządkować plan i przejść do kolejnego kroku. Finalna rezerwacja może odbywać się po stronie zewnętrznego partnera.",
  },
  {
    question: "Skąd biorą się ceny i dostępność ofert?",
    answer:
      "Ceny, dostępność i finalne warunki pochodzą od partnerów rezerwacyjnych. Dlatego zawsze warto sprawdzić ostatni krok u partnera przed płatnością.",
  },
  {
    question: "Czy mogę zapisać plan i wrócić do niego później?",
    answer:
      "Tak. HelpTravel zapisuje plan, kontekst podróży i wybrane kierunki, aby łatwiej było wrócić do porównania albo dalszego planowania.",
  },
  {
    question: "Czy planner pomaga, jeśli nie wiem jeszcze dokąd polecieć?",
    answer:
      "Tak. Możesz opisać styl wyjazdu, budżet albo potrzebę, a planner przygotuje shortlistę kierunków i przejście do kolejnych kroków.",
  },
  {
    question: "Czy HelpTravel pokazuje fikcyjne opinie albo sztuczne rankingi?",
    answer:
      "Nie. Serwis nie publikuje fikcyjnych recenzji, nagród ani partnerstw. Stawiamy na jawny model afiliacyjny, metodę pracy i praktyczne odpowiedzi.",
  },
  {
    question: "Dla kogo jest ten serwis?",
    answer:
      "Głównie dla osób z Polski planujących krótkie i średnie wyjazdy wypoczynkowe: city breaki, ciepłe wypady, weekendy i praktyczne wyjazdy 3-7 dni.",
  },
  {
    question: "Gdzie znaleźć oficjalne informacje o warunkach podróży?",
    answer:
      "Na dole tej strony znajdziesz oficjalne źródła dotyczące komunikatów podróżnych, EKUZ i praw pasażera w Unii Europejskiej.",
  },
];

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Najczęstsze pytania o HelpTravel, planner, linki partnerskie, ceny, zapisywanie planów i sposób działania serwisu.",
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    title: "FAQ - HelpTravel",
    description:
      "Odpowiedzi na najczęstsze pytania o planner, partnerów rezerwacyjnych, zapis planów i korzystanie z HelpTravel.",
    url: "/faq",
    type: "website",
  },
};

export default function FaqPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <section className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
        <h1 className="mt-3 font-display text-3xl leading-[1.08] text-ink sm:text-4xl sm:leading-[1.0] md:text-5xl md:leading-[0.95]">Najczęstsze pytania o HelpTravel</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-ink-muted">
          To miejsce dla osób, które chcą szybko sprawdzić, jak działa planner, gdzie trafia finalna rezerwacja i co
          warto wiedzieć przed kliknięciem w ofertę.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-strong"
          >
            Otwórz wyszukiwarkę hoteli
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {faqItems.map((item) => (
          <article
            key={item.question}
            className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm"
          >
            <h2 className="text-2xl font-bold text-ink">{item.question}</h2>
            <p className="mt-4 text-sm leading-7 text-ink-muted">{item.answer}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-line bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-sm">
          <h2 className="font-display text-2xl text-ink">Powiązane strony</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link href="/oferta" className="rounded-2xl bg-white px-4 py-3 text-sm text-ink-muted transition hover:text-brand">
              Oferta i główne funkcje
            </Link>
            <Link href="/cennik" className="rounded-2xl bg-white px-4 py-3 text-sm text-ink-muted transition hover:text-brand">
              Cennik i model płatności
            </Link>
          </div>
        </article>

        <article className="rounded-[2rem] border border-line bg-surface-raised p-6 shadow-sm">
          <h2 className="font-display text-2xl text-ink">Oficjalne źródła</h2>
          <div className="mt-4 grid gap-3">
            {TRUSTED_TRAVEL_RESOURCES.map((resource) => (
              <a
                key={resource.href}
                href={resource.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border border-line bg-surface-sunken px-4 py-4 transition hover:border-brand hover:bg-brand-soft"
              >
                <p className="text-sm font-semibold text-ink">{resource.label.pl}</p>
                <p className="mt-1 text-sm leading-6 text-ink-muted">{resource.description.pl}</p>
              </a>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

