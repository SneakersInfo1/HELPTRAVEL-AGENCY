import type { Metadata } from "next";
import Link from "next/link";

import { PremiumHomeHero } from "@/components/home/premium-home-hero";
import { DestinationGuideCard } from "@/components/publisher/destination-guide-card";
import { EditorialArticleCard } from "@/components/publisher/editorial-article-card";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { getDestinationStory } from "@/lib/mvp/destination-content";
import { buildAffiliateLinks } from "@/lib/mvp/affiliate-links";
import {
  getEditorialArticles,
  getLatestEditorialArticles,
  getPublishedDestinations,
} from "@/lib/mvp/publisher-content";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import { getSiteUrl } from "@/lib/mvp/site";
import type { DestinationProfile } from "@/lib/mvp/types";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: "HelpTravel - wybierz kierunek i zaplanuj wyjazd",
  description:
    "Wpisz miasto albo opisz idealny wyjazd. HelpTravel prowadzi od inspiracji do lotow, noclegow, atrakcji i wygodnych dodatkow podrozy.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "HelpTravel - wybierz kierunek i zaplanuj wyjazd",
    description:
      "Nowoczesna strona startowa do wyboru kierunku, discovery mode i szybkiego przejscia do lotow, hoteli oraz uslug wyjazdowych.",
    url: siteUrl,
    type: "website",
  },
};

const heroDestinationSlugs = [
  "malaga-spain",
  "barcelona-spain",
  "lisbon-portugal",
  "rome-italy",
  "valencia-spain",
  "athens-greece",
] as const;

const valueCards = [
  {
    eyebrow: "Dwa starty",
    title: "Jeden dla zdecydowanych, drugi dla tych, ktorzy chca dopiero odkryc kierunek.",
    text: "Strona od pierwszego ekranu pokazuje zarowno mocne wyszukiwanie miasta, jak i tryb discovery dla niezdecydowanych.",
  },
  {
    eyebrow: "Autocomplete",
    title: "Podpowiedzi kierunkow sa szybkie, czytelne i gotowe pod miasta z calego swiata.",
    text: "Sugestie korzystaja z API-backed flow, a nie z malej, recznie wpisanej listy kilku miast.",
  },
  {
    eyebrow: "Pelny funnel",
    title: "Po wyborze kierunku naturalnie przechodzisz dalej do lotow, hoteli i uslug wyjazdowych.",
    text: "Homepage ma prowadzic do dzialania, nie zatrzymywac na samym czytaniu inspiracji.",
  },
  {
    eyebrow: "Premium feel",
    title: "Warstwa wizualna ma inspirowac, ale nadal byc praktyczna i bardzo czytelna.",
    text: "Mocna typografia, ruchome tlo, hierarchia akcji i sekcje zbudowane pod klikniecia oraz dalsze planowanie.",
  },
];

const inspirationCards = [
  {
    title: "City breaki",
    description: "Kierunki na 3-5 dni, gdy chcesz zobaczyc duzo i nie tracic czasu na nadmiar logistyki.",
    href: "/city-breaki",
    accent: "miasto, jedzenie, szybka decyzja",
  },
  {
    title: "Cieple kierunki",
    description: "Slonce, plaza i prostszy reset glowy. Dobre, gdy liczy sie klimat i lekki wyjazd.",
    href: "/cieple-kierunki",
    accent: "slonce, morze, wygoda",
  },
  {
    title: "Bez wizy",
    description: "Sciezki dla osob, ktore chca uniknac dodatkowych formalnosci i szybciej kliknac dalej.",
    href: "/bez-wizy",
    accent: "mniej formalnosci, szybszy start",
  },
  {
    title: "Weekendowe wyjazdy",
    description: "Mocne kierunki na krotki urlop, gdy liczy sie tempo, prosty plan i sensowny budzet.",
    href: "/weekendowe-wyjazdy",
    accent: "2-4 dni, malo logistyki, szybki efekt",
  },
];

const processSteps = [
  {
    step: "01",
    title: "Wybierasz kierunek albo opisujesz wyjazd",
    text: "Strona glowna nie ukrywa glownej akcji. Albo od razu wpisujesz miasto, albo wchodzisz w discovery mode.",
  },
  {
    step: "02",
    title: "Dostajesz sensowny kierunek i lokalny kontekst",
    text: "Planner zbiera miejsce, zdjecia, przewodnik, atrakcje i argumenty, ktore pomagaja podjac decyzje.",
  },
  {
    step: "03",
    title: "Przechodzisz dalej do realnych ofert i dodatkow",
    text: "Loty, noclegi, atrakcje, auta i kolejne kroki wyjazdu sa gotowe do klikniecia bez chaosu i skakania po serwisie.",
  },
];

export default async function Home() {
  const editorialArticles = getEditorialArticles();
  const latestArticles = getLatestEditorialArticles(4);
  const publishedDestinations = getPublishedDestinations();
  const destinationCount = publishedDestinations.length;
  const articleCount = editorialArticles.length;

  const selectedHeroDestinations = heroDestinationSlugs
    .map((slug) => publishedDestinations.find((destination) => destination.slug === slug))
    .filter((destination): destination is DestinationProfile => Boolean(destination));

  const resolvedHeroDestinations = await Promise.all(
    selectedHeroDestinations.map(async (destination) => ({
      destination,
      story: getDestinationStory(destination),
      media: await resolveDestinationMedia(destination),
    })),
  );

  const featuredGuides = resolvedHeroDestinations.slice(0, 4);
  const heroSlides = resolvedHeroDestinations.slice(0, 5).map((item) => ({
    id: item.destination.slug,
    city: item.destination.city,
    country: item.destination.country,
    label: `${item.destination.city}, ${item.destination.country}`,
    title: item.destination.city,
    description: item.story.tagline,
    image: item.media.heroImage,
    href: `/kierunki/${item.destination.slug}`,
    tags: item.story.bestFor.slice(0, 3),
    meta: `lot ok. ${item.destination.typicalFlightHoursFromPL.toFixed(1)} h z Polski`,
  }));
  const partnerPreviewLinks = buildAffiliateLinks("Malaga", "Spain");
  const serviceCards = [
    {
      title: "Loty",
      description: "Szybkie przejscie do wyszukiwania polaczen i dalszego porownywania ofert partnerow.",
      partner: getAffiliateBrandLabel(partnerPreviewLinks.flights, "Partner lotniczy"),
      cta: "/planner?mode=standard&q=Malaga",
    },
    {
      title: "Noclegi",
      description: "Naturalny kolejny krok po wyborze miasta: hotele, apartamenty i miejsce, od ktorego zalezy komfort calego wyjazdu.",
      partner: getAffiliateBrandLabel(partnerPreviewLinks.stays, "Partner hotelowy"),
      cta: "/planner?mode=standard&q=Barcelona",
    },
    {
      title: "Atrakcje",
      description: "Lokalne miejsca, bilety i podpowiedzi, ktore zmieniaja zwykle wyszukiwanie w prawdziwy plan wyjazdu.",
      partner: getAffiliateBrandLabel(partnerPreviewLinks.attractions, "Partner atrakcji"),
      cta: "/planner?mode=standard&q=Rome",
    },
    {
      title: "Auta",
      description: "Wygodny dodatek dla osob, ktore chca domknac mobilnosc od razu po wyborze kierunku.",
      partner: getAffiliateBrandLabel(partnerPreviewLinks.cars, "Partner aut"),
      cta: "/planner?mode=standard&q=Lisbon",
    },
    {
      title: "Plan calego wyjazdu",
      description: "Najlepszy wynik daje polaczenie wyboru miasta, hoteli, lotow i dodatkow w jednym flow.",
      partner: "Planner + partnerzy",
      cta: "/planner?mode=discovery",
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <PremiumHomeHero slides={heroSlides} destinationCount={destinationCount} articleCount={articleCount} />

      <section className="rounded-[1.9rem] border border-emerald-900/10 bg-white/95 p-4 shadow-[0_18px_48px_rgba(16,84,48,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Aktywne przejscia komercyjne</p>
            <h2 className="mt-2 text-2xl font-bold text-emerald-950">Po wyborze kierunku prowadzimy dalej do aktywnych partnerow.</h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-emerald-900/72">
            Loty, noclegi i auta sa juz podpiete. To nie jest martwy landing, tylko wejscie w realny funnel wyjazdowy.
          </p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Loty", partner: getAffiliateBrandLabel(partnerPreviewLinks.flights, "Partner lotniczy") },
            { label: "Noclegi", partner: getAffiliateBrandLabel(partnerPreviewLinks.stays, "Partner hotelowy") },
            { label: "Auta", partner: getAffiliateBrandLabel(partnerPreviewLinks.cars, "Partner aut") },
            { label: "Atrakcje", partner: getAffiliateBrandLabel(partnerPreviewLinks.attractions, "Partner atrakcji") },
          ].map((item) => (
            <article key={item.label} className="rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/70 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{item.label}</p>
              <p className="mt-2 text-xl font-bold text-emerald-950">{item.partner}</p>
              <p className="mt-2 text-sm text-emerald-900/72">Widoczne w plannerze i gotowe do klikniecia po wyborze kierunku.</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {valueCards.map((card) => (
          <article
            key={card.title}
            className="rounded-[1.85rem] border border-emerald-900/10 bg-white/94 p-5 shadow-[0_18px_50px_rgba(16,84,48,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_58px_rgba(16,84,48,0.11)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">{card.eyebrow}</p>
            <h2 className="mt-3 text-2xl font-bold leading-tight text-emerald-950">{card.title}</h2>
            <p className="mt-3 text-sm leading-7 text-emerald-900/76">{card.text}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[2.2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Popularne kierunki</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">
              Najmocniejsze kierunki, od ktorych najlatwiej zaczac.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-emerald-900/74">
              To sekcja pod osoby, ktore chca zobaczyc kilka mocnych opcji od razu, bez przekopywania calego serwisu.
            </p>
          </div>
          <Link href="/kierunki" className="rounded-full bg-emerald-100 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-200">
            Zobacz wszystkie kierunki
          </Link>
        </div>

        <div className="mt-6 grid gap-5 xl:grid-cols-4">
          {featuredGuides.map((item) => (
            <DestinationGuideCard
              key={item.destination.slug}
              destination={item.destination}
              media={item.media}
              summary={item.story.summary}
            />
          ))}
        </div>
      </section>

      <section className="rounded-[2.2rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(235,248,239,0.98),rgba(225,242,232,0.92))] p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Start od potrzeby</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">
              Klikaj od nastroju wyjazdu, nie od przypadkowej podstrony.
            </h2>
          </div>
          <Link href="/inspiracje" className="rounded-full border border-emerald-900/10 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50">
            Otworz inspiracje
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {inspirationCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-[1.75rem] border border-emerald-900/10 bg-white/90 p-5 shadow-[0_16px_42px_rgba(16,84,48,0.06)] transition duration-300 hover:-translate-y-1 hover:border-emerald-500/45 hover:shadow-[0_22px_56px_rgba(16,84,48,0.11)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">{card.accent}</p>
              <h3 className="mt-3 text-2xl font-bold text-emerald-950">{card.title}</h3>
              <p className="mt-3 text-sm leading-7 text-emerald-900/76">{card.description}</p>
              <span className="mt-5 inline-flex rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition group-hover:bg-emerald-800">
                Otworz sekcje
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-emerald-950 p-6 text-white shadow-[0_24px_70px_rgba(6,29,16,0.18)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200">Jak to dziala</p>
          <h2 className="mt-3 font-display text-4xl sm:text-5xl">Nowoczesna strona startowa ma od razu prowadzic do decyzji.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-8 text-emerald-50/78">
            Najpierw wybierasz kierunek albo opisujesz potrzebe. Potem dostajesz lokalny kontekst, przewodnik i wejscie w kolejne uslugi wyjazdowe. Bez slabej, prototypowej pierwszej impresji.
          </p>
        </article>

        <div className="grid gap-4">
          {processSteps.map((step) => (
            <article
              key={step.step}
              className="rounded-[1.8rem] border border-emerald-900/10 bg-white/95 p-5 shadow-[0_16px_44px_rgba(16,84,48,0.06)]"
            >
              <div className="flex items-start gap-4">
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-sm font-extrabold text-emerald-950">
                  {step.step}
                </span>
                <div>
                  <h3 className="text-2xl font-bold text-emerald-950">{step.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-emerald-900/76">{step.text}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[2.2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Pelny funnel wyjazdu</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">
              Od miasta do uslug, ktore domykaja podroz.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-emerald-900/74">
              Homepage ma zapowiadac caly produkt: nie tylko inspiracje, ale tez przejscie do lotow, noclegow i wygodnych dodatkow.
            </p>
          </div>
          <Link href="/planner" className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">
            Wejdz do planera
          </Link>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {serviceCards.map((card) => (
            <Link
              key={card.title}
              href={card.cta}
              className="rounded-[1.75rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(245,252,247,0.98),rgba(234,247,239,0.92))] p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_52px_rgba(16,84,48,0.1)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Usluga</p>
              <h3 className="mt-3 text-2xl font-bold text-emerald-950">{card.title}</h3>
              <p className="mt-3 text-sm leading-7 text-emerald-900/76">{card.description}</p>
              <div className="mt-5 flex items-center justify-between gap-3">
                <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-900 shadow-sm">
                  {card.partner}
                </span>
                <span className="text-sm font-bold text-emerald-800">Otworz flow</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-[2.2rem] border border-emerald-900/10 bg-white/95 p-6 shadow-[0_18px_56px_rgba(16,84,48,0.06)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Nowe przewodniki i inspiracje</p>
            <h2 className="mt-2 font-display text-4xl text-emerald-950 sm:text-5xl">
              Tresci, ktore podbijaja decyzje, a nie rozpraszaja.
            </h2>
          </div>
          <Link href="/inspiracje" className="rounded-full border border-emerald-900/10 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100">
            Zobacz cala biblioteke
          </Link>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          {latestArticles.map((article) => (
            <EditorialArticleCard key={article.slug} article={article} compact />
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2.3rem] border border-emerald-900/10 bg-emerald-950 px-6 py-8 text-white shadow-[0_28px_80px_rgba(6,29,16,0.18)] sm:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.22),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(52,211,153,0.18),transparent_26%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">Mocne wejscie w produkt</p>
            <h2 className="mt-3 font-display text-4xl sm:text-5xl">
              Ta strona glowna ma od razu uruchamiac planowanie i dawc chec do klikniecia.
            </h2>
            <p className="mt-4 text-sm leading-8 text-emerald-50/78">
              Wpisz miasto, wybierz discovery mode albo wejdz w katalog kierunkow. Wszystko dalej ma prowadzic do realnego planu wyjazdu.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/planner?mode=standard"
              className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-300"
            >
              Wpisz kierunek
            </Link>
            <Link
              href="/planner?mode=discovery"
              className="rounded-full border border-white/14 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/14"
            >
              Opisz idealny wyjazd
            </Link>
            <Link
              href="/kierunki"
              className="rounded-full border border-white/14 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-white/14"
            >
              Przejdz do kierunkow
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
