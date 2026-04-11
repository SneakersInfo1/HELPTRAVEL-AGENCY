import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

import { TRUSTED_TRAVEL_RESOURCES } from "@/lib/mvp/trusted-resources";

const faqItems = [
  {
    question: "Czy korzystanie z HelpTravel jest platne?",
    answer:
      "Nie. Korzystanie z katalogu kierunkow, tresci i planera jest bezplatne. Finalne ceny i warunki rezerwacji sa zawsze pokazywane i obslugiwane przez zewnetrznego partnera.",
  },
  {
    question: "Czy rezerwacja odbywa sie bezposrednio na HelpTravel?",
    answer:
      "Nie zawsze. HelpTravel pomaga wybrac kierunek, uporzadkowac plan i przejsc do kolejnego kroku. Finalna rezerwacja moze odbywac sie po stronie zewnetrznego partnera.",
  },
  {
    question: "Skad biora sie ceny i dostepnosc ofert?",
    answer:
      "Ceny, dostepnosc i finalne warunki pochodza od partnerow rezerwacyjnych. Dlatego zawsze warto sprawdzic ostatni krok u partnera przed platnoscia.",
  },
  {
    question: "Czy moge zapisac plan i wrocic do niego pozniej?",
    answer:
      "Tak. HelpTravel zapisuje plan, kontekst podrozy i wybrane kierunki, aby latwiej bylo wrocic do porownania lub kontynuacji planowania.",
  },
  {
    question: "Czy planner pomaga, jesli nie wiem jeszcze dokad poleciec?",
    answer:
      "Tak. To jedna z glownych funkcji produktu. Mozesz opisac styl wyjazdu, budzet lub potrzebe, a planer przygotuje shortlist kierunkow i przejscie do kolejnych krokow.",
  },
  {
    question: "Czy HelpTravel pokazuje fikcyjne opinie albo sztuczne rankingi?",
    answer:
      "Nie. Serwis nie publikuje fikcyjnych recenzji, nagrod ani partnerstw. Stawiamy na jawny model afiliacyjny, metodologie i praktyczne guidance.",
  },
  {
    question: "Dla kogo jest ten serwis?",
    answer:
      "Glownie dla osob z Polski planujacych krotkie i srednie wyjazdy wypoczynkowe: city breaki, cieple wypady, weekendy i praktyczne wyjazdy 3-7 dni.",
  },
  {
    question: "Gdzie znalezc wiecej informacji o warunkach podrozy i prawach pasazera?",
    answer:
      "Na dole tej strony znajdziesz oficjalne zrodla dotyczace komunikatow podroznych, EKUZ i praw pasazera w Unii Europejskiej.",
  },
];

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Najczestsze pytania o HelpTravel, planer, linki partnerskie, ceny, zapisywanie planow i sposob dzialania serwisu.",
  alternates: {
    canonical: "/faq",
  },
  openGraph: {
    title: "FAQ - HelpTravel",
    description:
      "Odpowiedzi na najczestsze pytania o planner, partnerow rezerwacyjnych, zapis planow i korzystanie z HelpTravel.",
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Pomoc i przejrzystosc</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] text-emerald-950">Najczestsze pytania o HelpTravel</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-emerald-900/78">
          Ta strona zbiera odpowiedzi na pytania o planer, linki partnerskie, zapisywanie planow, ceny, jezyki i
          sposob dzialania serwisu. To punkt startowy dla czytelnika, partnera i robota wyszukiwarki, ktory chce
          zrozumiec jak dziala produkt.
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Powiazane strony</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link href="/oferta" className="rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
              Oferta i glowne funkcje
            </Link>
            <Link href="/cennik" className="rounded-2xl bg-white px-4 py-3 text-sm text-emerald-900/78 transition hover:text-emerald-700">
              Cennik i model platnosci
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Oficjalne zrodla</p>
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
