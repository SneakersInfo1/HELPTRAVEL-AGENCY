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
  /**
   * Pobierz zdjęcie od razu, bez czekania na zbliżenie do pola widzenia.
   *
   * BEZ `priority`: to podniosłoby `fetchpriority` na `high` i kafelek
   * konkurowałby wprost ze zdjęciem hero, czyli z elementem LCP strony.
   *
   * UWAGA, ZMIERZONE — `loading="eager"` NIE jest darmowe. Next dokłada dla
   * takiego obrazu `<link rel="preload" as="image">` w `<head>`, więc skaner
   * wstępny startuje z nim jeszcze PRZED odkryciem zdjęcia hero (zmierzone na
   * buildzie produkcyjnym: kafelki start 718 ms, hero 736 ms). Priorytet
   * zostaje niski, ale bajty są realne: przy DPR 2 jeden kafelek to ~92 kB,
   * bo `object-cover` każe pobrać plik 750 px szeroki, żeby pokazać pas
   * 378 px. Sześć takich kart = 550 kB pobrane przed zgięciem.
   *
   * Dlatego eager dostają WYŁĄCZNIE karty realnie widoczne na telefonie
   * (1,86 kafelka na 375 px), a nie cały pierwszy ekran desktopu. Desktop
   * i tak radzi sobie sam: przy samej leniwości przeglądarka wczytywała tam
   * 8 z 18 kafelków bez przewijania, podczas gdy na telefonie 0 z 18 — i to
   * telefon był problemem.
   */
  eager?: boolean;
}

/**
 * Krotność, o jaką `object-cover` powiększa zdjęcie względem szerokości karty.
 *
 * Kafelek jest kwadratowy (`aspect-square`, na mobile 9/10), a zdjęcia
 * z Pexels są panoramiczne — zmierzony oryginał kierunku to 3996 × 2248,
 * czyli 16:9. `object-cover` dopasowuje obraz do WYSOKOŚCI karty, więc
 * realnie renderowana szerokość zdjęcia to `wysokość karty × 1,78`, a nie
 * szerokość karty. Atrybut `sizes` opisuje właśnie renderowaną szerokość
 * obrazu — nie szerokość pudełka — więc wartości niżej są przemnożone o tę
 * krotność. Bez tego przeglądarka pobierała plik ~2× za wąski i skalowała go
 * w górę (zmierzone 2026-08-29: karta 239 px, plik 384 px, potrzeba 532 px →
 * rozciągnięcie 1,73× na desktopie i 2,08× przy DPR 1). To jest cała
 * przyczyna „rozpikselowanych" kafelków; kompresja i proxy nie miały z tym nic
 * wspólnego, dlatego wcześniejsze podbicia `quality` nic nie dały.
 *
 * Wartości są celowo minimalnie ZANIŻONE względem ideału (≤1,09×), żeby
 * przeglądarka trafiała w niższy szczebel drabinki `deviceSizes` — różnicy nie
 * widać, a plik jest o szczebel lżejszy. Przykład: 375 px @DPR 3 przy 104vw
 * łapie 1920w (~130 kB), przy 93vw — 1200w.
 */
const SIZES_KAFELKA =
  "(max-width: 639px) 93vw, (max-width: 767px) 59vw, (max-width: 1023px) 41vw, (max-width: 1279px) 32vw, 26vw";

export function InspireTile({
  destination,
  heroImage,
  defaultTravelers = 2,
  fromPricePerNight,
  flightFromPln,
  eager = false,
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
      // PROPORCJE: kwadrat od `sm`, 9/10 na mobile (było 3/4 i 4/5).
      // Karta pionowa 4:5 miała 299 px wysokości na desktopie, z czego 110 px
      // zajmował sam blok tekstu — 37% kafelka było ciemną płachtą, a na
      // mobile 44%. Kwadrat oddaje pasowi ~60 px na kartę (desktop) i ~40 px
      // (mobile), a zdjęcie nadal dostaje ponad połowę kafelka. Przy okazji
      // spada krotność `object-cover` (2,22 → 1,78), czyli plik potrzebny do
      // ostrości jest o jeden szczebel lżejszy — patrz SIZES_KAFELKA.
      //
      // TŁO POD ZDJĘCIEM: ciemna zieleń marki, nie `brand-soft`. Pas ma tło
      // `emerald-950`, więc jasny mięsisty prostokąt świecił na nim przez cały
      // czas ładowania i to on odpowiadał za wrażenie „migających" kafelków.
      // Ciemne tło znika w pasie — karta pojawia się, zamiast błyskać.
      //
      // `ring` zamiast cienia: `--shadow-md` jest liczony z `ink` przy kryciu
      // 0,08, czyli na `emerald-950` jest fizycznie niewidoczny. Włoskowy
      // biały ring realnie oddziela kartę od pasa.
      className="group relative flex aspect-[9/10] overflow-hidden rounded-md bg-brand-strong ring-1 ring-white/10 transition duration-200 ease-out hover:-translate-y-0.5 hover:ring-white/25 active:scale-[0.985] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100 sm:aspect-square"
    >
      <Image
        src={heroImage}
        alt={`${cityLabel}, ${countryLabel}`}
        fill
        sizes={SIZES_KAFELKA}
        loading={eager ? "eager" : "lazy"}
        className="object-cover transition duration-200 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />

      {/* Czas lotu jako CHIP na zdjęciu, nie kolejny wiersz tekstu. Powód:
          w bloku tekstowym konkurowałby z ceną o tę samą uwagę, a jako chip
          jest SKANOWALNY — przewijając pas widać od razu, który kierunek jest
          blisko. Wcześniej ta informacja znikała całkowicie, gdy kierunek miał
          cenę pakietu, czyli akurat na kartach, które klika się najczęściej. */}
      {flightHours ? (
        <span className="absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
          <Plane aria-hidden strokeWidth={2} className="h-3 w-3 shrink-0" />
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
        {/* p-2.5 na mobile: te 4 px z każdej strony to nie kosmetyka, tylko
            szerokość dla linii ceny. Przy karcie 189 px i odjętym chevronie
            wiersz ceny ma 169 px zamiast 125 px — czterocyfrowa cena za dobę
            (a takie realnie wychodzą, 198–1166 zł) przestaje się łamać. */}
        <div className="relative bg-[linear-gradient(180deg,rgba(5,18,11,0.72)_0%,rgba(5,18,11,0.93)_45%,rgba(5,18,11,0.96)_100%)] p-2.5 sm:p-3">
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
        {/* Interlinie w tym bloku są ciaśniejsze niż domyślne z tokenów: cztery
            wiersze po 1,5 dawały 104 px na karcie wysokiej 210 px, czyli
            połowę kafelka zjadała płachta tekstu. Ciaśniejsze wiodące oddaje
            8 px z powrotem zdjęciu i nie rusza ROZMIARÓW pisma — te były
            dobierane pomiarem (12 px dla kraju, 18 px dla miasta). */}
        <p className="text-xs font-semibold leading-[1.35] text-white/70">{countryLabel}</p>
        {/* 18 px na KAŻDYM ekranie, bez skoku do 24 px wyżej. Kafelek w tym
            pasie nie robi się szerszy wraz z ekranem — na 1280 px ma ~197 px,
            czyli mniej niż na telefonie ma proporcjonalnie. Przy 24 px „Palma
            de Mallorca" łamała się na dwie linie i scrim TEJ JEDNEJ karty rósł
            o ćwierć wysokości, więc pas wyglądał na zepsuty. Zmierzone na
            375 / 768 / 1280 px. */}
        <h3 className="mt-0.5 text-lg font-semibold leading-[1.15] tracking-[-0.01em]">{cityLabel}</h3>

        <div className="mt-1 flex items-end justify-between gap-2">
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
              <p className="text-sm font-bold leading-tight text-accent-bright">
                Hotel{" "}
                <span className="whitespace-nowrap">
                  od {formatPricePln(fromPricePerNight)}
                  <span className="text-[11px] font-medium text-white/75">/noc</span>
                </span>
              </p>
            )}
            {typeof flightFromPln === "number" && (
              <p className="mt-0.5 text-xs font-medium leading-tight text-white/85">
                Lot<span className="hidden sm:inline"> z Warszawy</span>{" "}
                <span className="whitespace-nowrap">od {formatPricePln(flightFromPln)}</span>
              </p>
            )}
          </div>

          {/* Afordancja „to jest klikalne". Cały kafelek jest linkiem, więc to
              tylko znacznik wizualny (aria-hidden) — nie osobny cel dotykowy
              i nie drugi tab-stop.
              OD `sm` W GÓRĘ, nie na mobile: znacznik reaguje na `hover`, czyli
              komunikuje coś wyłącznie na desktopie, a na telefonie zabierał
              36 px z wiersza ceny — tam, gdzie karta ma 189 px szerokości
              i to właśnie cena walczy o miejsce. Na mobile afordancję niesie
              `active:scale` całej karty, które działa pod palcem. */}
          <span
            aria-hidden
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition duration-200 ease-out group-hover:bg-accent-bright group-hover:text-brand-strong motion-reduce:transition-none sm:flex"
          >
            <ChevronRight strokeWidth={2.5} className="h-4 w-4" />
          </span>
        </div>
        </div>
      </div>
    </LocalizedLink>
  );
}
