import type { Metadata } from "next";
import Link from "next/link";

import { MediaHero } from "@/components/site/media-hero";
import { FinalCtaBanner } from "@/components/site/final-cta-banner";
import { DestinationTile } from "@/components/home/destination-tile";
import { getPublishedDestinations } from "@/lib/mvp/publisher-content";
import { getDestinationProfileBySlug } from "@/lib/mvp/destinations";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import type { DestinationProfile } from "@/lib/mvp/types";

// ISR: the hero + teaser tiles resolve Pexels media. Serve from the static
// cache and regenerate daily so we never hit Pexels on the request path.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "O serwisie",
  description:
    "HelpTravel to darmowy planner krótkich wyjazdów dla osób z Polski: kierunek, loty, hotel i plan dnia w jednym miejscu. Poznaj, jak działamy i czego nie udajemy.",
  alternates: {
    canonical: "/o-nas",
  },
  openGraph: {
    title: "O serwisie | HelpTravel",
    description:
      "Prosty, darmowy planner krótkich wyjazdów. Łączymy kierunek, loty, hotel i plan dnia — bez rejestracji i bez ściemy.",
    url: "/o-nas",
    type: "website",
    locale: "pl_PL",
  },
};

const HERO_SLUG = "barcelona-spain";
const TILE_SLUGS = ["malaga-spain", "lisbon-portugal", "rome-italy", "athens-greece"] as const;

const facts = [
  {
    icon: "🧭",
    title: "Dla kogo jest HelpTravel",
    body: "Dla osób z Polski, które planują krótkie i średnie wyjazdy: city break, ciepły wypad, weekend we dwoje albo prosty urlop 3-7 dni.",
  },
  {
    icon: "⚡",
    title: "Co robimy",
    body: "Pomagamy wybrać kierunek, ustawić podstawy wyjazdu i płynnie przejść do noclegów, lotów oraz kolejnych kroków — bez skakania po dziesięciu zakładkach.",
  },
  {
    icon: "🤝",
    title: "Czego nie udajemy",
    body: "Nie jesteśmy biurem podróży, nie wystawiamy fikcyjnych opinii i nie udajemy, że finalna rezerwacja odbywa się u nas.",
  },
];

const journey = [
  {
    step: "01",
    title: "Wybierasz kierunek",
    body: "Masz gotowe miasto albo tylko luźny pomysł typu „ciepło na 5 dni”. Pomagamy zawęzić wybór do kilku sensownych opcji.",
  },
  {
    step: "02",
    title: "Ustawiasz szczegóły",
    body: "Termin, lotnisko wylotu i liczba osób. Te same dane wędrują dalej, więc nie wpisujesz ich kilka razy.",
  },
  {
    step: "03",
    title: "Przechodzisz do oferty",
    body: "Sprawdzasz hotele i loty na wybrany termin, a finalną rezerwację robisz u sprawdzonego partnera.",
  },
];

async function resolveTile(slug: string): Promise<{ destination: DestinationProfile; heroImage: string } | null> {
  const destination = getDestinationProfileBySlug(slug);
  if (!destination) return null;
  const media = await resolveDestinationMedia(destination);
  return { destination, heroImage: media.heroImage };
}

export default async function AboutPage() {
  const heroProfile = getDestinationProfileBySlug(HERO_SLUG);
  const heroMedia = heroProfile ? await resolveDestinationMedia(heroProfile) : null;
  const tiles = (await Promise.all(TILE_SLUGS.map(resolveTile))).filter(
    (tile): tile is { destination: DestinationProfile; heroImage: string } => tile !== null,
  );
  const destinationCount = getPublishedDestinations().length;

  const stats = [
    { value: "0 zł", label: "tyle płacisz za korzystanie z serwisu" },
    { value: "3 min", label: "od pomysłu do gotowego planu wyjazdu" },
    { value: `${destinationCount}+`, label: "kierunków z gotowymi przewodnikami" },
    { value: "PLN", label: "ceny bez ukrytych przeliczników" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <MediaHero
        imageUrl={heroMedia?.heroImage ?? null}
        imageAlt="Barcelona — panorama miasta"
        eyebrow="O serwisie"
        title={
          <>
            Cały wyjazd ogarnięty{" "}
            <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 bg-clip-text text-transparent">
              w jednym miejscu
            </span>{" "}
            — szybciej i bez chaosu.
          </>
        }
        intro="HelpTravel łączy planner, katalog kierunków i praktyczne treści, żebyś szybko wiedział dokąd warto lecieć, na ile dni i od czego zacząć — a potem płynnie przeszedł do hotelu i lotu."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/hotele/szukaj"
            className="inline-flex h-12 items-center justify-center rounded-full bg-emerald-400 px-6 text-sm font-bold text-emerald-950 transition hover:bg-emerald-300"
          >
            Zaplanuj wyjazd →
          </Link>
          <Link
            href="/kierunki"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/30 bg-white/10 px-6 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            Zobacz kierunki
          </Link>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/90">
          <span className="rounded-full bg-white/12 px-3 py-1">100% darmowe</span>
          <span className="rounded-full bg-white/12 px-3 py-1">bez rejestracji</span>
          <span className="rounded-full bg-white/12 px-3 py-1">ceny w PLN</span>
          <span className="rounded-full bg-white/12 px-3 py-1">ponad 80 lotnisk PL, EU i świat</span>
        </div>
      </MediaHero>

      {/* MISJA — dlaczego powstał HelpTravel */}
      <section className="relative overflow-hidden rounded-[2rem] border border-emerald-900/20 bg-emerald-950 px-6 py-9 text-white shadow-[0_28px_80px_rgba(6,29,16,0.22)] sm:px-10 sm:py-11">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(110,231,183,0.20),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.14),transparent_30%)]"
        />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200">Po co powstaliśmy</p>
          <h2 className="mt-3 max-w-4xl font-display text-3xl leading-[1.15] sm:text-4xl md:text-[2.75rem]">
            <span className="text-white/75">Booking pokaże hotel. Wyszukiwarka pokaże lot.</span>
            <br />
            My układamy Ci{" "}
            <span className="text-amber-300">cały wyjazd</span> — w kilka minut i za 0 zł.
          </h2>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: "✈️",
                title: "Lot i hotel z jednego startu",
                body: "Mniej zakładek, mniej chaosu i szybsza decyzja na podstawie tych samych dat.",
              },
              {
                icon: "🗺️",
                title: "Plan dnia, nie sama rezerwacja",
                body: "Co zobaczyć, gdzie spać i jak przejść do kolejnych kroków bez zgadywania.",
              },
              {
                icon: "🌍",
                title: "Start z Polski i Europy",
                body: "Dla krótkich wyjazdów, city breaków i ciepłych kierunków na 3-7 dni.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm transition hover:border-emerald-300/40 hover:bg-white/[0.08]"
              >
                <span aria-hidden className="text-2xl">
                  {item.icon}
                </span>
                <p className="mt-2 text-base font-bold text-white">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-emerald-50/75">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATY */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[1.5rem] border border-emerald-900/10 bg-[linear-gradient(180deg,rgba(236,249,240,0.98),rgba(226,244,232,0.92))] p-5 text-center shadow-[0_14px_36px_rgba(16,84,48,0.06)]"
          >
            <p className="font-display text-3xl text-emerald-800 sm:text-4xl">{stat.value}</p>
            <p className="mt-2 text-xs leading-5 text-emerald-900/70">{stat.label}</p>
          </div>
        ))}
      </section>

      {/* DLA KOGO / CO ROBIMY / CZEGO NIE UDAJEMY */}
      <section className="grid gap-4 lg:grid-cols-3">
        {facts.map((item) => (
          <article
            key={item.title}
            className="rounded-[1.8rem] border border-emerald-900/10 bg-white p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
              {item.icon}
            </div>
            <h2 className="mt-4 text-xl font-bold text-emerald-950">{item.title}</h2>
            <p className="mt-2 text-sm leading-7 text-emerald-900/78">{item.body}</p>
          </article>
        ))}
      </section>

      {/* TYPOWA ŚCIEŻKA + UCZCIWY MODEL */}
      <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <article className="rounded-[2rem] border border-emerald-900/10 bg-white p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Jak to wygląda</p>
          <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">Typowa ścieżka w 3 krokach</h2>
          <div className="mt-6 space-y-3">
            {journey.map((item) => (
              <div
                key={item.step}
                className="flex gap-4 rounded-2xl border border-emerald-900/10 bg-emerald-50/50 p-4 transition hover:border-emerald-300 hover:bg-emerald-50"
              >
                <span className="font-display text-3xl leading-none text-emerald-300">{item.step}</span>
                <div>
                  <h3 className="text-base font-bold text-emerald-950">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-emerald-900/75">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="flex flex-col rounded-[2rem] border border-emerald-900/10 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Uczciwy model</p>
          <h2 className="mt-2 font-display text-3xl text-emerald-950">Jak na tym zarabiamy</h2>
          <div className="mt-4 space-y-3 text-sm leading-7 text-emerald-900/78">
            <p className="flex gap-2">
              <span aria-hidden className="text-emerald-600">✓</span>
              Korzystanie z HelpTravel jest darmowe — nie pobieramy opłat od użytkowników.
            </p>
            <p className="flex gap-2">
              <span aria-hidden className="text-emerald-600">✓</span>
              Gdy przechodzisz do oferty, finalna rezerwacja może odbywać się u partnera.
            </p>
            <p className="flex gap-2">
              <span aria-hidden className="text-emerald-600">✓</span>
              Ceny i warunki zawsze warto sprawdzić w ostatnim kroku po stronie partnera.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/linki-partnerskie"
              className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800"
            >
              Jak działają linki partnerskie
            </Link>
            <Link
              href="/faq"
              className="rounded-full border border-emerald-900/10 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
            >
              FAQ
            </Link>
          </div>
        </article>
      </section>

      {/* POPULARNE KIERUNKI — realne zdjęcia + przejście do oferty */}
      {tiles.length > 0 && (
        <section className="rounded-[2rem] border border-emerald-900/10 bg-white p-6 shadow-[0_16px_42px_rgba(16,84,48,0.06)] sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">Zacznij od pomysłu</p>
              <h2 className="mt-2 font-display text-3xl text-emerald-950 sm:text-4xl">Popularne kierunki na start</h2>
            </div>
            <Link
              href="/kierunki"
              className="rounded-full border border-emerald-900/10 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-50"
            >
              Wszystkie kierunki →
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map((tile) => (
              <DestinationTile key={tile.destination.slug} destination={tile.destination} heroImage={tile.heroImage} />
            ))}
          </div>
        </section>
      )}

      <FinalCtaBanner
        eyebrow="Gotowy na wyjazd?"
        title="Zacznij planować w kilka minut"
        body="Wpisz kierunek albo opisz pomysł na wyjazd. Resztę — termin, hotel, lot i plan dnia — ułożysz w jednym miejscu."
        primaryHref="/hotele/szukaj"
        primaryLabel="Zaplanuj wyjazd"
        secondaryHref="/inspiracje"
        secondaryLabel="Zobacz pomysły na wyjazd"
      />
    </main>
  );
}
