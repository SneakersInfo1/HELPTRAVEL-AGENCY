import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";

import { MediaHero } from "@/components/site/media-hero";
import { FinalCtaBanner } from "@/components/site/final-cta-banner";
import { getDestinationProfileBySlug } from "@/lib/mvp/destinations";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";

// ISR: hero + example photo come from Pexels — cache and regenerate daily.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Jak to działa",
  description:
    "Zobacz, jak HelpTravel prowadzi Cię od pomysłu na wyjazd do gotowego planu: wybierasz kierunek, ustawiasz termin i skład, a potem przechodzisz do hotelu i lotu. Za darmo, bez rejestracji.",
  alternates: {
    canonical: "/jak-pracujemy",
  },
  openGraph: {
    title: "Jak to działa | HelpTravel",
    description: "Od pomysłu na wyjazd do gotowego planu w 3 krokach — kierunek, termin, hotel i lot w jednym miejscu.",
    url: "/jak-pracujemy",
    type: "website",
    locale: "pl_PL",
  },
};

const HERO_SLUG = "rome-italy";
const EXAMPLE_SLUG = "lisbon-portugal";

const steps = [
  {
    step: "01",
    icon: "🧭",
    title: "Wybierasz kierunek",
    body: "Masz gotowe miasto albo tylko luźny pomysł, np. „ciepło na 5 dni”. Pomagamy zawęzić to do kilku konkretnych opcji.",
  },
  {
    step: "02",
    icon: "📅",
    title: "Ustawiasz termin i skład",
    body: "Daty, lotnisko wylotu i liczba osób. Wpisujesz raz — te same dane wędrują dalej do hotelu i lotu.",
  },
  {
    step: "03",
    icon: "🏨",
    title: "Przechodzisz do oferty",
    body: "Sprawdzasz hotele i loty na wybrany termin, a finalną rezerwację robisz u sprawdzonego partnera.",
  },
];

const perks = [
  { icon: "✈️", title: "Lot i hotel z jednego startu", body: "Mniej zakładek i mniej chaosu — wszystko trzyma się tego samego terminu." },
  { icon: "🗺️", title: "Plan dnia, nie sama rezerwacja", body: "Podpowiadamy, co zobaczyć i gdzie spać, a nie tylko gdzie kliknąć." },
  { icon: "💾", title: "Zapis planu na później", body: "Wracasz do wyjazdu, kiedy chcesz — nic nie ginie po zamknięciu karty." },
  { icon: "💰", title: "Ceny w PLN bez ściemy", body: "Pokazujemy realne ceny w złotówkach, bez ukrytych przeliczników karty." },
];

const faq = [
  {
    question: "Czy korzystanie z HelpTravel jest darmowe?",
    answer:
      "Tak. Planowanie wyjazdu, przeglądanie kierunków i porównywanie ofert jest w 100% darmowe. Płacisz dopiero za samą rezerwację u partnera, jeśli zdecydujesz się ją złożyć.",
  },
  {
    question: "Czy muszę zakładać konto?",
    answer:
      "Nie. Możesz zaplanować cały wyjazd bez rejestracji. Konto nie jest potrzebne, żeby sprawdzić kierunki, ceny i dostępność hoteli.",
  },
  {
    question: "Gdzie odbywa się finalna rezerwacja?",
    answer:
      "Hotel rezerwujesz bezpośrednio w HelpTravel, a w przypadku lotów i wybranych ofert finalny krok może prowadzić do sprawdzonego partnera. Zawsze warto potwierdzić cenę i warunki w ostatnim kroku.",
  },
  {
    question: "Czy ceny są w złotówkach?",
    answer:
      "Tak — ceny pokazujemy w PLN, bez ukrytych przeliczników. Dzięki temu od razu wiesz, ile realnie zapłacisz.",
  },
];

export default async function HowItWorksPage() {
  const heroProfile = getDestinationProfileBySlug(HERO_SLUG);
  const heroMedia = heroProfile ? await resolveDestinationMedia(heroProfile) : null;

  const exampleProfile = getDestinationProfileBySlug(EXAMPLE_SLUG);
  const exampleMedia = exampleProfile ? await resolveDestinationMedia(exampleProfile) : null;
  const exampleFlightHours = exampleProfile ? exampleProfile.typicalFlightHoursFromPL.toFixed(1) : "3.5";
  const exampleSearchHref = `/hotele/szukaj?${new URLSearchParams({
    destination: exampleProfile?.city ?? "Lisbon",
    country: exampleProfile?.country ?? "Portugal",
    adults: "2",
    rooms: "1",
  }).toString()}`;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
    url: `${getSiteUrl()}/jak-pracujemy`,
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <Script id="how-it-works-faq-jsonld" type="application/ld+json">
        {JSON.stringify(faqJsonLd)}
      </Script>

      <MediaHero
        imageUrl={heroMedia?.heroImage ?? null}
        imageAlt="Rzym — uliczki starego miasta"
        eyebrow="Jak to działa"
        title={
          <>
            Od pomysłu na wyjazd do{" "}
            <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 bg-clip-text text-transparent">
              gotowego planu
            </span>
            .
          </>
        }
        intro="Nie musisz zaczynać od idealnego planu. Wystarczy kierunek albo luźny pomysł — resztę układamy razem, w lekkiej i czytelnej kolejności."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-400 px-6 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
          >
            Otwórz wyszukiwarkę →
          </Link>
          <Link
            href="/kierunki"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 bg-white/10 px-6 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Nie wiem dokąd lecieć
          </Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/90">
          <span className="rounded-full bg-white/12 px-3 py-1">3 minuty</span>
          <span className="rounded-full bg-white/12 px-3 py-1">bez rejestracji</span>
          <span className="rounded-full bg-white/12 px-3 py-1">100% darmowe</span>
        </div>
      </MediaHero>

      {/* 3 KROKI */}
      <section>
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Trzy kroki</p>
          <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">Jak przejść do konkretu</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((item) => (
            <article
              key={item.step}
              className="relative overflow-hidden rounded-[1.8rem] border border-emerald-900/10 bg-white p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-2 -top-4 font-display text-[5.5rem] leading-none text-emerald-100"
              >
                {item.step}
              </span>
              <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
                  {item.icon}
                </div>
                <h3 className="mt-4 text-lg font-bold text-emerald-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-7 text-emerald-900/78">{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* CO DOSTAJESZ */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Co dostajesz po kliknięciu</p>
        <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">Konkrety, nie kolejna zakładka</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {perks.map((perk) => (
            <div key={perk.title} className="rounded-2xl border border-emerald-900/10 bg-emerald-50/40 p-5">
              <span aria-hidden className="text-2xl">
                {perk.icon}
              </span>
              <h3 className="mt-2 text-sm font-bold text-emerald-950">{perk.title}</h3>
              <p className="mt-2 text-xs leading-6 text-emerald-900/72">{perk.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRZYKŁAD NA ŻYWO */}
      <section className="overflow-hidden rounded-[2rem] border border-emerald-900/10 bg-white shadow-[0_16px_42px_rgba(16,84,48,0.06)]">
        <div className="grid lg:grid-cols-2">
          <div className="relative min-h-[16rem] lg:min-h-full">
            {exampleMedia?.heroImage ? (
              <Image
                src={exampleMedia.heroImage}
                alt="Lizbona — widok na miasto"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 to-emerald-900" />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,11,0.1)_0%,rgba(5,18,11,0.5)_100%)]" />
            <div className="absolute bottom-0 left-0 p-6 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">Przykład</p>
              <p className="mt-1 font-display text-3xl">Lizbona, 4 dni</p>
            </div>
          </div>
          <div className="p-6 sm:p-8">
            <h2 className="font-display text-2xl text-emerald-950 sm:text-3xl">Zobacz to na konkrecie</h2>
            <p className="mt-2 text-sm leading-7 text-emerald-900/75">
              Masz pomysł: <em>„ciepło, niedaleko, na 4 dni we dwoje”</em>. Oto jak wygląda to w HelpTravel:
            </p>
            <ol className="mt-5 space-y-3 text-sm leading-7 text-emerald-900/80">
              <li className="flex gap-3 rounded-2xl bg-emerald-50/60 px-4 py-3">
                <span className="font-bold text-emerald-700">1.</span>
                Wpisujesz pomysł — podpowiadamy Lizbonę (lot z Polski ok. {exampleFlightHours} h, łagodny klimat).
              </li>
              <li className="flex gap-3 rounded-2xl bg-emerald-50/60 px-4 py-3">
                <span className="font-bold text-emerald-700">2.</span>
                Ustawiasz: 4 dni, 2 osoby, wylot z Twojego lotniska.
              </li>
              <li className="flex gap-3 rounded-2xl bg-emerald-50/60 px-4 py-3">
                <span className="font-bold text-emerald-700">3.</span>
                Sprawdzasz hotele blisko centrum i lot na ten sam termin — gotowe.
              </li>
            </ol>
            <Link
              href={exampleSearchHref}
              className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-emerald-700 px-6 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              Zobacz hotele w Lizbonie →
            </Link>
          </div>
        </div>
      </section>

      {/* CZEGO NIE ROBIMY */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Gramy w otwarte karty</p>
        <h2 className="mt-2 font-display text-3xl text-emerald-950">Czego nie robimy</h2>
        <div className="mt-4 grid gap-3 text-sm leading-7 text-emerald-900/78 sm:grid-cols-3">
          <p className="rounded-2xl bg-white/70 px-4 py-3">Nie udajemy biura podróży ani nie obiecujemy cen, których nie kontrolujemy.</p>
          <p className="rounded-2xl bg-white/70 px-4 py-3">Nie wypełniamy serwisu fikcyjnymi opiniami ani sztucznym social proof.</p>
          <p className="rounded-2xl bg-white/70 px-4 py-3">Nie chowamy tego, że końcowy krok rezerwacji może prowadzić do partnera.</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="rounded-[2rem] border border-emerald-900/10 bg-white p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
        <h2 className="font-display text-3xl text-emerald-950">Najczęściej zadawane pytania</h2>
        <div className="mt-5 space-y-3">
          {faq.map((item) => (
            <details key={item.question} className="rounded-2xl bg-emerald-50/60 px-5 py-4 transition hover:bg-emerald-50">
              <summary className="cursor-pointer text-base font-bold text-emerald-950">{item.question}</summary>
              <p className="mt-3 text-sm leading-7 text-emerald-900/82">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <FinalCtaBanner
        eyebrow="Wszystko jasne?"
        title="Sprawdź, jak szybko to działa"
        body="Otwórz wyszukiwarkę i ustaw kierunek oraz termin. Hotel, lot i plan dnia ułożysz w jednym miejscu — za 0 zł."
        primaryHref="/hotele/szukaj"
        primaryLabel="Otwórz wyszukiwarkę"
        secondaryHref="/kierunki"
        secondaryLabel="Przeglądaj kierunki"
      />
    </main>
  );
}
