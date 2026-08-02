import Image from "next/image";
import { ChevronRight, Plane } from "lucide-react";

import { LocalizedLink } from "@/components/site/localized-link";
import { formatFlightHours, formatPricePln } from "@/lib/home/deal-card";
import { localizeCity, localizeCountry } from "@/lib/mvp/i18n-geo";
import { DEFAULT_ORIGIN_CITY } from "@/lib/mvp/origin-cities";
import type { DestinationProfile } from "@/lib/mvp/types";

// Kafelek pasa „Popularne kierunki" (sekcja A).
//
// DLACZEGO OSOBNY KOMPONENT, a nie zmiana w DestinationTile: tamten renderuje
// się także na /kierunki, /o-nas i /inspiracje, gdzie dostaje SAM kierunek bez
// cen. Przebudowa pod potrzeby strony głównej zmieniłaby trzy strony spoza
// zakresu tego zadania. Wspólne zostaje to, co i tak było wspólne — model
// i formatowanie z lib/home/deal-card.
//
// CO ODRÓŻNIA TĘ SEKCJĘ OD SEKCJI B (największy problem poprzedniej wersji:
// dwa sąsiadujące pasy kart pokazywały tę samą treść w dwóch skórkach):
//   • sekcja A odpowiada na „DOKĄD" → chip z czasem lotu z Polski, bo to jest
//     realny czynnik wyboru kierunku i jedyna twarda liczba, której sekcja B
//     nie ma;
//   • sekcja B odpowiada na „ZA ILE" → okno dat, liczba nocy, cena łączna
//     i przycisk.
//
// Czas lotu pochodzi z profilu kierunku (`typicalFlightHoursFromPL`), a nie
// z oferty — stąd tylda w `formatFlightHours`.

interface InspireTileProps {
  destination: DestinationProfile;
  heroImage: string;
  defaultTravelers?: number;
  /** Cena hotelu „od X zł/noc" ze snapshotu dstprice:v1. */
  fromPricePerNight?: number;
  /** Najtańszy lot w obie strony z Warszawy (total PLN/os., snapshot). */
  flightFromPln?: number;
}

export function InspireTile({
  destination,
  heroImage,
  defaultTravelers = 2,
  fromPricePerNight,
  flightFromPln,
}: InspireTileProps) {
  // Daty ŚWIADOMIE niewypełnione — użytkownik wybiera termin sam na wynikach
  // (decyzja właściciela 2026-07-04: termin ceny zostaje na karcie).
  const params = new URLSearchParams({
    destination: destination.city,
    country: destination.country,
    origin: DEFAULT_ORIGIN_CITY,
    adults: String(defaultTravelers),
    rooms: "1",
  });
  const href = `/hotele/szukaj?${params.toString()}`;
  const cityLabel = localizeCity(destination.city);
  const countryLabel = localizeCountry(destination.country);
  const flightHours = formatFlightHours(destination.typicalFlightHoursFromPL);

  return (
    <LocalizedLink
      href={href}
      // `active:` NIE jest ozdobnikiem: 90% ruchu to telefon, gdzie `hover:`
      // nie istnieje. Bez stanu wciśnięcia cała informacja zwrotna karty jest
      // widoczna wyłącznie dla 10% użytkowników, a pozostali dotykają kafelka
      // i do momentu nawigacji nie dostają żadnego potwierdzenia.
      className="group relative flex aspect-[3/4] overflow-hidden rounded-md bg-brand-soft shadow-[var(--shadow-md)] transition duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] active:scale-[0.985] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 sm:aspect-[4/5]"
    >
      <Image
        src={heroImage}
        alt={`${cityLabel}, ${countryLabel}`}
        fill
        sizes="(max-width: 640px) 58vw, (max-width: 1024px) 27vw, 17vw"
        className="object-cover transition duration-200 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />

      {/* Czas lotu jako CHIP na zdjęciu, nie kolejny wiersz tekstu. Powód:
          w bloku tekstowym konkurowałby z ceną o tę samą uwagę, a jako chip
          jest SKANOWALNY — przewijając pas widać od razu, który kierunek jest
          blisko. Wcześniej ta informacja znikała całkowicie, gdy kierunek miał
          cenę pakietu, czyli akurat na kartach, które klika się najczęściej. */}
      {flightHours ? (
        <span className="absolute left-2.5 top-2.5 z-20 inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm">
          <Plane aria-hidden strokeWidth={2} className="h-3.5 w-3.5 shrink-0" />
          {flightHours}
          <span className="sr-only"> lotu z Polski</span>
        </span>
      ) : null}

      {/* PRZEJŚCIE SCRIMU JEST NAD TEKSTEM, nie pod nim.
          Wcześniej gradient zaczynał się od przezroczystości w GÓRNEJ krawędzi
          bloku tekstowego — dokładnie tam, gdzie stoi nazwa kraju i miasta.
          Na jasnym zdjęciu (plaża, niebo, biały mur) krycie w tym miejscu było
          bliskie zeru, więc kontrast spadał do ~1,3:1 przy wymaganych 4,5:1.
          Policzone: dopiero krycie 0,72 daje 4,81:1 dla bieli 70% na
          NAJJAŚNIEJSZYM możliwym tle. Blok tekstowy startuje więc od 0,72,
          a łagodne wejście robi osobny pasek nad nim. */}
      <div className="relative z-10 mt-auto w-full text-white">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-[linear-gradient(to_top,rgba(5,18,11,0.72),rgba(5,18,11,0))]"
        />
        <div className="relative bg-[linear-gradient(180deg,rgba(5,18,11,0.72)_0%,rgba(5,18,11,0.93)_45%,rgba(5,18,11,0.96)_100%)] p-3">
        {/* 12 px zamiast 10 px: kraj był najmniejszym tekstem na całej stronie
            głównej, a niesie kontekst potrzebny przy miastach, których nazwa
            nie mówi, gdzie leżą (Faro, Kos, Bari).
            Zapis zdaniowy, nie WERSALIKI z rozstrzeleniem: wersaliki czyta się
            wolniej, a osiemnaście identycznych mikroetykiet nad każdą kartą to
            szablon, nie hierarchia. Odróżnienie od nazwy miasta niosą rodzina
            (grotesk vs szeryf), rozmiar i krycie — nie kształt liter.
            Kolor z krycia bieli, nie `emerald-200`: zieleń poza tokenami
            konkurowała z bursztynem ceny, a akcent użyty gdziekolwiek indziej
            przestaje znaczyć „tu jest pieniądz". */}
        <p className="text-xs font-semibold text-white/70">{countryLabel}</p>
        {/* 18 px na KAŻDYM ekranie, bez skoku do 24 px wyżej. Kafelek w tym
            pasie nie robi się szerszy wraz z ekranem — na 1280 px ma ~197 px,
            czyli mniej niż na telefonie ma proporcjonalnie. Przy 24 px „Palma
            de Mallorca" łamała się na dwie linie i scrim TEJ JEDNEJ karty rósł
            o ćwierć wysokości, więc pas wyglądał na zepsuty. Zmierzone na
            375 / 768 / 1280 px. */}
        <h3 className="mt-0.5 font-display text-lg leading-tight">{cityLabel}</h3>

        <div className="mt-1.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            {/* DWIE OSOBNE LICZBY, nigdy ich suma.
                Do 2026-08-02 kafelek pokazywał tu jedną cenę pakietu
                („lot + 7 nocy · od 1431 zł/os."), bo jeden komplet liczb czyta
                się łatwiej niż dwa. Problem był w tym, dokąd ten kafelek
                prowadzi: `/hotele/szukaj` świadomie nie miesza lotów do lejka
                hotelowego, więc obietnica lotu nie miała pokrycia na następnym
                ekranie — a tak wygląda utrata zaufania w serwisie, w którym za
                chwilę podaje się kartę.
                Hotel i lot pochodzą z RÓŻNYCH okien dat, więc nie wolno ich tu
                dodać — suma byłaby liczbą, której nikt nie policzył. */}
            {typeof fromPricePerNight === "number" && (
              <p className="text-sm font-bold leading-snug text-accent-bright">
                Hotel{" "}
                <span className="whitespace-nowrap">
                  od {formatPricePln(fromPricePerNight)}
                  <span className="text-[11px] font-medium text-white/75">/noc</span>
                </span>
              </p>
            )}
            {typeof flightFromPln === "number" && (
              <p className="mt-0.5 text-xs font-medium leading-snug text-white/85">
                Lot<span className="hidden sm:inline"> z Warszawy</span>{" "}
                <span className="whitespace-nowrap">od {formatPricePln(flightFromPln)}</span>
              </p>
            )}
          </div>

          {/* Afordancja „to jest klikalne". Cały kafelek jest linkiem, więc to
              tylko znacznik wizualny (aria-hidden) — nie osobny cel dotykowy
              i nie drugi tab-stop. Pełny przycisk zjadłby szerokość, której
              na 375 px nie ma. */}
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition duration-200 ease-out group-hover:bg-accent-bright group-hover:text-brand-strong motion-reduce:transition-none"
          >
            <ChevronRight strokeWidth={2.5} className="h-4 w-4" />
          </span>
        </div>
        </div>
      </div>
    </LocalizedLink>
  );
}
