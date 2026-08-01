import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

import { MediaHero } from "@/components/site/media-hero";
import { FinalCtaBanner } from "@/components/site/final-cta-banner";
import { getDestinationProfileBySlug } from "@/lib/mvp/destinations";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { formatFlightHours } from "@/lib/home/deal-card";
import { getSiteUrl } from "@/lib/mvp/site";

// ISR: hero + zdjęcie przykładu pochodzą z Pexels — cache, odświeżanie dobowe.
export const revalidate = 86400;

// PRZEPISANE 2026-07-31. Stara wersja opisywała trzy kroki kończące się na
// „finalną rezerwację robisz u sprawdzonego partnera" i obiecywała plan dnia
// oraz zapis planu na później. Rezerwacja odbywa się tutaj, planera nie ma,
// a zapis planu opiera się o bazę, która nie jest podpięta (DATABASE_URL to
// placeholder) — czyli strona opisywała trzy funkcje, z których żadna nie
// działa tak, jak napisano. Poniżej jest przebieg, który faktycznie ma
// miejsce, krok po kroku, zgodnie z docs/booking-flow.md.

export const metadata: Metadata = {
  title: "Jak to działa",
  description:
    "Od wyszukania do potwierdzenia: pięć kroków rezerwacji na helptravel.pl. Kiedy podajesz dane, kiedy płacisz, kto pobiera pieniądze i co dostajesz na e-mail.",
  alternates: { canonical: "/jak-pracujemy" },
  openGraph: {
    title: "Jak to działa | HelpTravel",
    description: "Pięć kroków od wyszukania do potwierdzenia rezerwacji — bez niespodzianek przy płatności.",
    url: "/jak-pracujemy",
    type: "website",
    locale: "pl_PL",
  },
};

const HERO_SLUG = "rome-italy";
const EXAMPLE_SLUG = "lisbon-portugal";

const STEPS = [
  {
    title: "Szukasz",
    body: "Podajesz kierunek, termin i liczbę osób. Wyniki pokazują ceny przeliczone na złotówki, a filtrami zawężasz je do tego, co Cię interesuje — na przykład wyłącznie do ofert z bezpłatną anulacją.",
  },
  {
    title: "Wybierasz pokój",
    body: "Przy każdej ofercie widać cenę za cały pobyt i to, czy anulacja jest bezpłatna oraz do kiedy. Warunki ustala hotel w danej taryfie, więc dwa pokoje w tym samym obiekcie mogą mieć różne zasady.",
  },
  {
    title: "Podajesz dane gości",
    body: "Imię, nazwisko i adres e-mail osoby rezerwującej oraz dane pozostałych gości. Na tym etapie nadal nic nie płacisz i nic nie jest potwierdzone — możesz się wycofać.",
  },
  {
    title: "Płacisz",
    body: "Kartą lub portfelem cyfrowym, w formularzu naszego partnera rezerwacyjnego. Pola karty obsługuje Stripe, a rozliczenie prowadzi Nuitee Travel — dlatego na wyciągu zobaczysz NUITEE TRAVEL. BLIK-a na razie nie ma.",
  },
  {
    title: "Dostajesz potwierdzenie",
    body: "Zaraz po udanej płatności na Twój adres przychodzi e-mail z numerem rezerwacji, nazwą hotelu, terminem i zapłaconą kwotą. Rezerwacja jest w tym momencie złożona u obiektu.",
  },
];

const FAQ = [
  {
    question: "Czy muszę zakładać konto?",
    answer:
      "Nie. Do rezerwacji wystarczy imię, nazwisko i adres e-mail. Nie ma rejestracji, hasła ani aplikacji do zainstalowania.",
  },
  {
    question: "Komu właściwie płacę?",
    answer:
      "Płatność składasz na helptravel.pl, ale podmiotem rozliczającym jest Nuitee Travel — nasz partner rezerwacyjny. Dlatego na wyciągu z karty zobaczysz pozycję NUITEE TRAVEL, a nie HelpTravel. Pola karty obsługuje Stripe, więc numer karty nie przechodzi przez nasze serwery.",
  },
  {
    question: "Czy mogę zapłacić BLIK-iem?",
    answer:
      "Na razie nie. Dostępne są karty płatnicze i portfele cyfrowe. Piszemy o tym wcześniej, żeby nie okazało się to niespodzianką dopiero na ekranie płatności.",
  },
  {
    question: "Czy cena, którą widzę, jest ostateczna?",
    answer:
      "Kwota w podsumowaniu rezerwacji jest podana w złotówkach i zawiera podatki oraz opłaty. To ta kwota obciąża kartę. Niektóre obiekty pobierają na miejscu lokalną opłatę klimatyczną — jeśli tak jest, informacja pochodzi od obiektu i widnieje w warunkach oferty.",
  },
  {
    question: "Czy mogę anulować rezerwację?",
    answer:
      "To zależy od wybranej taryfy, nie od serwisu. Oferty z bezpłatną anulacją są oznaczone wprost, razem z datą, do której anulacja nic nie kosztuje. W wyszukiwarce możesz włączyć filtr pokazujący wyłącznie takie oferty.",
  },
  {
    question: "Czy lot i hotel to jedna rezerwacja?",
    answer:
      "Nie. To dwie osobne rezerwacje i dwie osobne płatności. Nie sprzedajemy lotu i hotelu jako jednego pakietu — kupujesz je niezależnie, każde z własnym potwierdzeniem.",
  },
];

export default async function HowItWorksPage() {
  const heroProfile = getDestinationProfileBySlug(HERO_SLUG);
  const heroMedia = heroProfile ? await resolveDestinationMedia(heroProfile) : null;

  const exampleProfile = getDestinationProfileBySlug(EXAMPLE_SLUG);
  const exampleMedia = exampleProfile ? await resolveDestinationMedia(exampleProfile) : null;
  const exampleFlight = exampleProfile ? formatFlightHours(exampleProfile.typicalFlightHoursFromPL) : "";
  const exampleSearchHref = `/hotele/szukaj?${new URLSearchParams({
    destination: exampleProfile?.city ?? "Lisbon",
    country: exampleProfile?.country ?? "Portugal",
    adults: "2",
    rooms: "1",
  }).toString()}`;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
    url: `${getSiteUrl()}/jak-pracujemy`,
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-6 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      <MediaHero
        imageUrl={heroMedia?.heroImage ?? null}
        imageAlt="Rzym — uliczki starego miasta"
        title="Pięć kroków do potwierdzonej rezerwacji"
        intro="Rezerwujesz i płacisz na helptravel.pl. Poniżej jest dokładnie to, co się dzieje po kolei — łącznie z tym, w którym momencie pobierane są pieniądze i czyja nazwa pojawi się na wyciągu."
      >
        <Link
          href="/hotele/szukaj"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <span className="text-sm font-bold text-brand-strong">Otwórz wyszukiwarkę</span>
        </Link>
      </MediaHero>

      {/* Numery są tu zasłużone: to naprawdę jest sekwencja, a kolejność niesie
          informację (kiedy jeszcze nie płacisz, kiedy już tak). */}
      <section>
        <h2 className="font-display text-2xl text-ink sm:text-3xl">Przebieg rezerwacji</h2>
        <ol className="mt-7 space-y-7 border-l border-line pl-6 sm:pl-8">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative">
              <span
                aria-hidden
                className="absolute -left-[1.9rem] top-0.5 flex size-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white sm:-left-[2.4rem]"
              >
                {index + 1}
              </span>
              <h3 className="text-lg font-bold text-ink">{step.title}</h3>
              <p className="mt-2 max-w-[65ch] text-base leading-7 text-ink">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-line bg-surface-raised shadow-sm">
        <div className="grid lg:grid-cols-2">
          <div className="relative min-h-[14rem] lg:min-h-full">
            {exampleMedia?.heroImage ? (
              <Image
                src={exampleMedia.heroImage}
                alt="Lizbona — widok na miasto"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-brand-strong" />
            )}
          </div>
          <div className="p-6 sm:p-10">
            <h2 className="font-display text-2xl text-ink sm:text-3xl">Zobacz to na konkrecie</h2>
            <p className="mt-3 max-w-[65ch] text-base leading-7 text-ink">
              Lizbona, dwie osoby, jeden pokój{exampleFlight ? `, lot z Polski ${exampleFlight}` : ""}. Poniższy
              link otwiera wyszukiwarkę z już ustawionym kierunkiem i składem — zostaje wybrać termin.
            </p>
            <Link
              href={exampleSearchHref}
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-6 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-bold text-white">Zobacz hotele w Lizbonie</span>
            </Link>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink sm:text-3xl">Częste pytania</h2>
        <div className="mt-6 divide-y divide-line border-y border-line">
          {FAQ.map((item) => (
            <details key={item.question} className="group py-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center text-base font-bold text-ink marker:content-none">
                {item.question}
              </summary>
              <p className="mt-3 max-w-[65ch] text-base leading-7 text-ink-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <FinalCtaBanner
        title="Wpisz kierunek i termin"
        body="Ceny zmieniają się z datami, więc jedyny sposób, żeby poznać swoją, to ją sprawdzić. Zajmuje to tyle, co wpisanie miasta."
        primaryHref="/hotele/szukaj"
        primaryLabel="Otwórz wyszukiwarkę"
        secondaryHref="/cennik"
        secondaryLabel="Ile to kosztuje"
      />
    </main>
  );
}
