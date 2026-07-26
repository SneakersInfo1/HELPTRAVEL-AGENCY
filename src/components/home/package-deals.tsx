import Image from "next/image";
import { ArrowRight, Plane, RefreshCw, Search, Timer } from "lucide-react";

import { LocalizedLink } from "@/components/site/localized-link";
import { DestinationCarousel } from "./destination-carousel";
import {
  formatDateRange,
  formatPricePln,
  nightsBetween,
  nightsLabel,
  totalFor,
} from "@/lib/home/deal-card";

// Sekcja „Cały wyjazd w jednej cenie" (2026-07-03, wzór eSky/lastminute
// na prośbę właściciela). KAŻDA liczba pochodzi ze snapshotu dstprice:v1
// (pola pkg*): lot RT z Warszawy + noce hotelu z TEGO SAMEGO okna dat,
// policzone w cronie z realnych wyszukań. Brak pakietu = brak karty
// (uczciwość > kompletność); sekcja znika całkiem poniżej 3 kart, żeby
// nie świecić pustką.
//
// PRZEBUDOWA (faza 3b). Trzy rzeczy, które nie działały:
//
// 1. WYJAŚNIENIE PRODUKTU stało wyrównane do prawej w wierszu nagłówka —
//    na desktopie zaczynało się w 3/4 szerokości ekranu, czyli poza ścieżką
//    czytania, a na mobile ściskało się obok <h2>. Zdanie tłumaczące, CO to
//    za cena, jest najważniejszym tekstem tej sekcji; teraz stoi pod
//    nagłówkiem, wyrównane do lewej.
//
// 2. CTA było chipem „Zobacz →" wielkości etykiety. W sekcji, która ma
//    sprzedawać, przycisk musi wyglądać jak przycisk.
//
// 3. TREŚĆ CTA BYŁA NIEŚCISŁA. Karta obiecuje „Lot + hotel", a link prowadzi
//    do /hotele/szukaj, gdzie lotów nie ma wcale (strona wyników wprost ich
//    nie miesza do lejka hotelowego). „Zobacz wyjazd" byłoby obietnicą, której
//    następny ekran nie dotrzymuje. „Wybierz hotel" mówi dokładnie, co się
//    stanie po kliknięciu — cena zostaje punktem odniesienia dla całego
//    wyjazdu, a przycisk nie kłamie o kolejnym kroku.

export interface PackageDeal {
  slug: string;
  cityLabel: string;
  countryLabel: string;
  heroImage: string;
  perPersonPln: number;
  checkin: string;
  checkout: string;
  /** Link do wyników hoteli (BEZ dat — user wybiera termin sam). */
  href: string;
}

const MIN_DEALS = 3;
const MAX_DEALS = 10;

/**
 * Pasek pod kartami. Każdy punkt to WERYFIKOWALNY fakt o mechanice ceny,
 * a nie ogólnik zaufania — takie ogólniki („sprawdzeni partnerzy", „najlepsze
 * ceny") nic nie znaczą i nie da się ich sprawdzić.
 *
 * Świadomie ZERO powtórzeń z paska w hero (Trustpilot / Stripe / PLN / bez
 * konta): powtórzony sygnał zaufania się nie sumuje, tylko rozcieńcza. Tamten
 * mówi o firmie, ten o liczbie na karcie obok.
 *
 * Pokrycie w kodzie:
 *   • co 30 minut  → vercel.json: cron warm-rates co pół godziny, warm-flights
 *                    o :15 i :45 (też co pół godziny, z przesunięciem)
 *   • 48 godzin    → PRICE_FRESH_MS w lib/prices/destination-price-snapshot.ts
 *   • wyszukanie   → cron odpytuje LiteAPI; nie ma żadnego cennika ani stawek
 *                    liczonych lokalnie (fikcyjne „od X zł" usunięto 2026-06-11)
 */
const PRICE_FACTS = [
  { Icon: RefreshCw, text: "Ceny odświeżane co 30 minut" },
  { Icon: Timer, text: "Nie pokazujemy cen starszych niż 48 godzin" },
  { Icon: Search, text: "Każda cena z prawdziwego wyszukania" },
] as const;

export function PackageDeals({ deals }: { deals: PackageDeal[] }) {
  const sorted = [...deals].sort((a, b) => a.perPersonPln - b.perPersonPln).slice(0, MAX_DEALS);
  if (sorted.length < MIN_DEALS) return null;

  return (
    <section aria-labelledby="package-deals" className="mx-auto w-full max-w-[2160px] px-4 sm:px-6 xl:px-8">
      {/* Ta sama karuzela (Embla) co pas „Popularne kierunki" nad nią —
          inaczej dwa sąsiadujące pasy kart wyglądały jak z dwóch różnych
          produktów: jeden ze strzałkami i snapem, drugi z szarym paskiem
          przewijania systemu. */}
      <DestinationCarousel
        tone="light"
        listId="home_packages"
        listName="Cały wyjazd w jednej cenie"
        ariaLabel={{ prev: "Poprzednie pakiety", next: "Następne pakiety" }}
        slideClassName="min-w-0 shrink-0 basis-[82%] pl-3 sm:basis-[46%] sm:pl-4 lg:basis-[31%] xl:basis-[23.5%]"
        header={
          <div>
            <h2 id="package-deals" className="font-display text-2xl leading-tight text-ink sm:text-3xl">
              Cały wyjazd w jednej cenie
            </h2>
            {/* Zdanie, które tłumaczy CO to za liczba — pod nagłówkiem,
                w ścieżce czytania, nie w prawym górnym rogu. */}
            <p className="mt-1 max-w-[62ch] text-sm leading-6 text-ink-muted">
              Lot z Warszawy w obie strony plus hotel — za osobę przy dwóch osobach, z terminu
              podanego na karcie. Klikasz i wybierasz hotel na swoje daty.
            </p>
          </div>
        }
        items={sorted.map((deal) => {
          const nights = nightsBetween(deal.checkin, deal.checkout);
          const range = formatDateRange(deal.checkin, deal.checkout);
          return {
            slug: deal.slug,
            pricePerPerson: deal.perPersonPln,
            kind: "package" as const,
            name: deal.cityLabel,
            category: deal.countryLabel,
            node: (
              <LocalizedLink
                href={deal.href}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-[var(--shadow-md)] transition duration-200 ease-out hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image
                    src={deal.heroImage}
                    alt={`${deal.cityLabel}, ${deal.countryLabel}`}
                    fill
                    sizes="(max-width: 640px) 82vw, (max-width: 1024px) 46vw, 24vw"
                    className="object-cover transition duration-200 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm">
                    <Plane aria-hidden strokeWidth={2} className="h-3.5 w-3.5" /> Lot + hotel
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate font-display text-xl leading-tight text-ink">
                      {deal.cityLabel}
                    </h3>
                    {/* Zapis zdaniowy, tak samo jak na kafelkach sekcji A —
                        ta sama informacja ma mieć ten sam kształt w obu pasach. */}
                    <span className="shrink-0 text-xs text-ink-muted">{deal.countryLabel}</span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {range} · {nightsLabel(nights)}
                  </p>

                  <div className="mt-3 border-t border-line pt-3">
                    {/* Cena i jednostka jako jeden niełamliwy token. */}
                    <p className="text-2xl font-bold leading-tight text-brand">
                      <span className="whitespace-nowrap">
                        od {formatPricePln(deal.perPersonPln)}
                        <span className="ml-0.5 text-xs font-semibold text-brand/80">/os.</span>
                      </span>
                    </p>
                    {/* Kwota, którą realnie się płaci. Cena „za osobę" jest
                        standardem branży, ale to nie jest liczba, którą widzi
                        się na wyciągu — a pytanie „ile to razem?" i tak pada.
                        Mnożenie żyje w totalFor(), nie jako „× 2" w widoku. */}
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {formatPricePln(totalFor(deal.perPersonPln))} za dwie osoby
                    </p>

                    {/* <span>, nie <button>/<a>: cały kafelek jest linkiem, więc
                        zagnieżdżony element interaktywny dałby drugi tab-stop
                        prowadzący w to samo miejsce. Wysokość 44 px = próg
                        dotykowy, mimo że celem dotyku jest cała karta. */}
                    {/* `group-hover:opacity-90`, a nie własne przyciemnienie:
                        to jest wzorzec przycisku podstawowego w tym repo
                        (dobieracz, konsjerż, pasek nawigacji). Czwarty wariant
                        hovera na piątym przycisku to początek dryfu. */}
                    <span className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-brand text-sm font-bold text-white transition duration-200 ease-out group-hover:opacity-90 motion-reduce:transition-none">
                      Wybierz hotel
                      <ArrowRight aria-hidden strokeWidth={2.5} className="h-4 w-4 shrink-0" />
                    </span>
                  </div>
                </div>
              </LocalizedLink>
            ),
          };
        })}
      />

      {/* Pod kartami, nie nad: obiekcję („skąd ta cena?") obsługuje się PO
          tym, jak użytkownik zobaczył liczbę, a nie zanim ją zobaczy. */}
      <ul className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-ink-muted">
        {PRICE_FACTS.map(({ Icon, text }) => (
          <li key={text} className="inline-flex items-center gap-1.5">
            <Icon aria-hidden strokeWidth={2} className="h-3.5 w-3.5 shrink-0 text-brand" />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
