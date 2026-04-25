import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

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
      <Script id="faq-jsonld" type="application/ld+json">
        {JSON.stringify(structuredData)}
      </Script>

      <section className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_50px_rgba(16,84,48,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Pomoc i przejrzystość</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">Najczęstsze pytania o HelpTravel</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          To miejsce dla osób, które chcą szybko sprawdzić, jak działa planner, gdzie trafia finalna rezerwacja i co
          warto wiedzieć przed kliknięciem w ofertę.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {faqItems.map((item) => (
          <article
            key={item.question}
            className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <h2 className="text-2xl font-bold text-emerald-950">{item.question}</h2>
            <p className="mt-4 text-sm leading-7 text-emerald-900/78">{item.answer}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Powiązane strony</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link href="/oferta" className="rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
              Oferta i główne funkcje
            </Link>
            <Link href="/cennik" className="rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
              Cennik i model płatności
            </Link>
            <Link href="/linki-partnerskie" className="rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
              Linki partnerskie
            </Link>
            <Link href="/kontakt" className="rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
              Kontakt
            </Link>
          </div>
        </article>

        <article className="rounded-[2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Oficjalne źródła</p>
          <div className="mt-4 grid gap-3">
            {TRUSTED_TRAVEL_RESOURCES.map((resource) => (
              <a
                key={resource.href}
                href={resource.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border border-emerald-900/10 bg-emerald-50/70 px-4 py-4 transition hover:border-emerald-500/40 hover:bg-emerald-100"
              >
                <p className="text-sm font-semibold text-emerald-950">{resource.label.pl}</p>
                <p className="mt-1 text-sm leading-6 text-emerald-900/74">{resource.description.pl}</p>
              </a>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

