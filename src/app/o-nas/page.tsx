import type { Metadata } from "next";
import Link from "next/link";

import { MediaHero } from "@/components/site/media-hero";
import { FinalCtaBanner } from "@/components/site/final-cta-banner";
import { DestinationTile } from "@/components/home/destination-tile";
import { getEditorialArticles, getPublishedDestinations } from "@/lib/mvp/publisher-content";
import { getDestinationProfileBySlug } from "@/lib/mvp/destinations";
import { resolveDestinationMedia } from "@/lib/mvp/pexels-media";
import type { DestinationProfile } from "@/lib/mvp/types";

// ISR: hero + kafelki rozwiązują media z Pexels. Serwuj z cache, odświeżaj raz
// na dobę, żeby nie odpytywać Pexels na ścieżce żądania.
export const revalidate = 86400;

// PRZEPISANE 2026-07-31. Poprzednia wersja opisywała serwis, którego nie ma:
// „darmowy planner", „plan dnia", „finalną rezerwację robisz u sprawdzonego
// partnera", „0 zł", „3 min od pomysłu do gotowego planu", „ponad 80 lotnisk".
// Planera nie ma od czasu zwrotu na rezerwacje, rezerwacja hotelu i lotu
// odbywa się na helptravel.pl, a „3 min" i „80 lotnisk" to liczby bez źródła —
// czyli dokładnie to, czego PRODUCT.md zabrania w sekcji anti-references.
//
// Zadanie tej strony wynika z profilu użytkownika w PRODUCT.md: „jest nieufny
// wobec nowych serwisów — zanim poda kartę, sprawdza, kto za tym stoi".
// Dlatego rdzeniem jest teraz podział ról (kto przyjmuje pieniądze, kto widnieje
// na wyciągu, kto dotyka danych karty), a nie kafelki z hasłami.

export const metadata: Metadata = {
  title: "O serwisie",
  description:
    "HelpTravel to polski serwis rezerwacji hoteli i lotów. Sprawdź, kto przyjmuje płatność, dlaczego na wyciągu widnieje NUITEE TRAVEL i czego na tej stronie nie robimy.",
  alternates: { canonical: "/o-nas" },
  openGraph: {
    title: "O serwisie | HelpTravel",
    description:
      "Kto prowadzi serwis, kto obsługuje rezerwację i płatność, i jakich chwytów tu nie znajdziesz.",
    url: "/o-nas",
    type: "website",
    locale: "pl_PL",
  },
};

const HERO_SLUG = "barcelona-spain";
const TILE_SLUGS = ["malaga-spain", "lisbon-portugal", "rome-italy", "athens-greece"] as const;

const ROLES = [
  {
    name: "HelpTravel",
    role: "prowadzi serwis",
    body: "Wyszukiwarka, ceny przeliczone na złotówki, opisy pokoi i udogodnień po polsku, kontakt w sprawie rezerwacji. To wszystko jest po naszej stronie.",
  },
  {
    name: "Nuitee Travel (LiteAPI)",
    role: "przyjmuje rezerwację i rozlicza płatność",
    body: "Dostarcza oferty hoteli i lotów, potwierdza rezerwację u obiektu i jest podmiotem rozliczającym płatność. Dlatego na wyciągu z karty zobaczysz NUITEE TRAVEL, a nie HelpTravel.",
  },
  {
    name: "Stripe",
    role: "obsługuje pola karty",
    body: "Numer karty wpisujesz w komponencie Stripe osadzonym w formularzu płatności. Dane karty nie przechodzą przez serwery HelpTravel i nie są u nas zapisywane.",
  },
];

const HONESTY = [
  {
    title: "Nie wymyślamy cen",
    body: "Każda kwota pochodzi z realnego zapytania do dostawcy. Jeśli dla kierunku nie mamy świeżej ceny, kafelek jest bez ceny — zamiast pokazać liczbę „mniej więcej”.",
  },
  {
    title: "Nie robimy sztucznej presji",
    body: "Żadnych odliczanych zegarów, „ostatni pokój” ani „7 osób ogląda teraz tę ofertę”, o ile nie stoją za tym prawdziwe dane. Zwykle nie stoją, więc tego nie ma.",
  },
  {
    title: "Nie publikujemy opinii, których nie zebraliśmy",
    body: "Nie ma tu wystawionych przez nas gwiazdek ani cytatów od zmyślonych klientów. Oceny obiektów pochodzą od dostawcy i są opisane jako jego oceny.",
  },
  {
    title: "Nie chowamy tego, czego nie umiemy",
    body: "BLIK-a na razie nie obsługujemy i piszemy o tym na stronie z cenami, a nie dopiero na ekranie płatności.",
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

  // Obie liczby są liczone z zacommitowanego seeda, nie wpisane z ręki.
  const destinationCount = getPublishedDestinations().length;
  const articleCount = getEditorialArticles().length;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-6 sm:px-6 lg:px-8">
      <MediaHero
        imageUrl={heroMedia?.heroImage ?? null}
        imageAlt="Barcelona — panorama miasta"
        title="Kto stoi za Twoją rezerwacją"
        intro="HelpTravel to polski serwis rezerwacji hoteli i lotów. Rezerwujesz i płacisz tutaj, w złotówkach, bez zakładania konta — a poniżej piszemy wprost, kto obsługuje którą część tej transakcji."
      >
        <Link
          href="/hotele/szukaj"
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-3 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <span className="text-sm font-bold text-brand-strong">Otwórz wyszukiwarkę</span>
        </Link>
      </MediaHero>

      <section>
        <h2 className="font-display text-2xl text-ink sm:text-3xl">Co tu znajdziesz</h2>
        <div className="mt-5 max-w-[65ch] space-y-4 text-base leading-8 text-ink">
          <p>
            Serwis powstał dla jednej konkretnej sytuacji: chcesz gdzieś polecieć, masz mniej więcej termin
            i budżet, i nie chcesz spędzić wieczoru na przeskakiwaniu między pięcioma zakładkami, żeby na
            końcu zobaczyć cenę w euro.
          </p>
          <p>
            Hotele i loty pochodzą od jednego dostawcy, więc daty i liczba osób nie gubią się po drodze.
            Ceny są przeliczone na złotówki. Do rezerwacji nie trzeba konta ani aplikacji. Poza samą
            wyszukiwarką mamy {destinationCount} kierunków z opisami i {articleCount} artykułów, które
            pomagają wybrać, jeśli jeszcze nie wiesz dokąd.
          </p>
        </div>
      </section>

      {/* Rdzeń strony. Trzy role, nie trzy kafelki z ikonką — bo tu liczy się
          rozgraniczenie odpowiedzialności, a nie wyliczanka zalet. */}
      <section>
        <h2 className="font-display text-2xl text-ink sm:text-3xl">Kto obsługuje którą część</h2>
        <p className="mt-3 max-w-[65ch] text-base leading-7 text-ink-muted">
          Pytanie „komu właściwie płacę?” jest przy nowym serwisie całkowicie zasadne. Oto pełna odpowiedź.
        </p>
        <dl className="mt-7 divide-y divide-line border-y border-line">
          {ROLES.map((item) => (
            <div key={item.name} className="grid gap-2 py-6 sm:grid-cols-[15rem_1fr] sm:gap-8">
              <dt>
                <span className="block text-base font-bold text-ink">{item.name}</span>
                <span className="mt-0.5 block text-sm text-ink-muted">{item.role}</span>
              </dt>
              <dd className="max-w-[65ch] text-base leading-7 text-ink">{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-[2rem] bg-brand-strong p-6 text-white [--focus-ring:#fff] sm:p-10">
        <h2 className="max-w-2xl text-balance font-display text-2xl sm:text-3xl">Czego tu nie ma</h2>
        <p className="mt-3 max-w-[60ch] text-sm leading-7 text-white/85">
          Deklaracja „jesteśmy uczciwi” nic nie znaczy, dopóki nie powie się, z czego konkretnie się
          rezygnuje. Cztery rzeczy, których na tej stronie nie znajdziesz:
        </p>
        <div className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {HONESTY.map((item) => (
            <div key={item.title}>
              <h3 className="text-base font-bold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-7 text-white/85">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {tiles.length > 0 && (
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-2xl text-ink sm:text-3xl">Popularne kierunki</h2>
            <Link href="/kierunki" className="underline underline-offset-4">
              <span className="text-sm font-semibold text-brand">Wszystkie kierunki</span>
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {tiles.map((tile) => (
              <DestinationTile key={tile.destination.slug} destination={tile.destination} heroImage={tile.heroImage} />
            ))}
          </div>
        </section>
      )}

      <FinalCtaBanner
        title="Sprawdź, czy mamy coś na Twój termin"
        body="Wpisz kierunek i daty. Zobaczysz realne ceny w złotówkach, z podatkami i opłatami — bez zakładania konta."
        primaryHref="/hotele/szukaj"
        primaryLabel="Otwórz wyszukiwarkę"
        secondaryHref="/cennik"
        secondaryLabel="Ile to kosztuje"
      />
    </main>
  );
}
