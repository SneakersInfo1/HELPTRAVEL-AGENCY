import Image from "next/image";
import { Plane } from "lucide-react";

import { AirlineLogo } from "@/components/flights/airline-logo";
import { airportCityGenitive } from "@/lib/flights/airports";
import { LocalizedLink } from "@/components/site/localized-link";
import { FlightDealsGrid, TrackedDeal, type FlightDealItem } from "./flight-deals-client";
import { HOME_COPY, type SectionCopy } from "@/lib/home/copy";
import { formatDateRange, formatPricePln, nightsLabel } from "@/lib/home/deal-card";
import { fmtDuration, stopsLabel } from "@/lib/flights/display";
import { DEAL_MIN, type FlightDeal } from "@/lib/flights/flight-deals";

// Sekcja „Okazje lotnicze" (2026-08-02, prośba właściciela: „taka sama warstwa
// jak polecane hotele, tylko z lotami, zmieniana co dwie godziny, i żeby to
// były realne okazje").
//
// DLACZEGO TO NIE JEST CZWARTA KARUZELA ZE ZDJĘCIAMI
// Nad tą sekcją stoją już trzy pasy kart z fotografiami (kierunki w hero,
// ostatnio wyszukiwane, polecane hotele). Czwarty pas w tej samej skórce
// przestaje być sekcją, a staje się teksturą — użytkownik przewija wszystkie
// cztery jednym gestem. Ta sekcja jest więc SIATKĄ POZIOMYCH WIERSZY: zdjęcie
// zostaje (sprzedaje kierunek), ale prowadzą dane rejsu, bo o locie decyduje
// się liczbami, nie widokiem plaży. Efekt uboczny jest korzystny: osiem
// wierszy skanuje się na telefonie szybciej niż osiem kafli do przewinięcia.
//
// DLACZEGO NA KARCIE JEST DRUGA LICZBA
// „Zwykle ok. X zł" to mediana cen, które cron faktycznie znalazł na tej
// trasie w sześciu terminach (patrz lib/flights/flight-deals.ts). Bez tej
// liczby „okazja" jest wyłącznie naszym słowem. Z nią użytkownik widzi, wobec
// czego jest tania — i może to sprawdzić, zmieniając daty w wyszukiwarce.
// Liczba NIE jest przekreślona i nie udaje ceny sprzed obniżki: to nie była
// nigdy cena tej oferty, tylko poziom odniesienia. Przekreślenie zrobiłoby
// z niej pozorny rabat (dyrektywa Omnibus, PRODUCT.md → anti-references).

export interface FlightDealView extends FlightDeal {
  /** Zdjęcie kierunku (Pexels, rozwiązane na serwerze). Brak = kafel z ikoną. */
  imageUrl?: string;
}

/** Link odtwarzający DOKŁADNIE to wyszukanie, z którego pochodzi cena.
 *
 *  `adults=1` nie jest uproszczeniem — cron szuka dla jednego dorosłego, więc
 *  cena na karcie jest ceną za osobę. Gdyby link szedł z inną liczbą pasażerów,
 *  pierwszy ekran po kliknięciu pokazywałby inną kwotę niż karta. */
function dealHref(deal: FlightDeal): string {
  const params = new URLSearchParams({
    origin: deal.originIata,
    originLabel: deal.originCityLabel,
    destination: deal.destinationIata,
    destLabel: deal.cityLabel,
    depart: deal.depart,
    return: deal.returnDate,
    adults: "1",
  });
  return `/loty/wyniki?${params.toString()}`;
}

export function FlightDeals({
  deals,
  copy = HOME_COPY.flightDeals,
}: {
  deals: FlightDealView[];
  copy?: SectionCopy;
}) {
  // Mniej niż komplet = brak sekcji. Dwie karty pod nagłówkiem „Okazje
  // lotnicze" czytają się jak awaria zbierania danych, a nie jak wybór.
  if (deals.length < DEAL_MIN) return null;

  const items: FlightDealItem[] = deals.map((d) => ({
    routeKey: d.routeKey,
    cityLabel: d.cityLabel,
    countryLabel: d.countryLabel,
    pricePln: d.pricePln,
    savingPercent: d.savingPercent,
  }));

  return (
    <section aria-labelledby="flight-deals" className="mx-auto w-full max-w-[2160px] px-4 sm:px-6 xl:px-8">
      <div className="mb-4">
        <h2 id="flight-deals" className="font-display text-2xl leading-tight text-ink sm:text-3xl">
          {copy.heading}
        </h2>
        {copy.subheading ? (
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-ink-muted">{copy.subheading}</p>
        ) : null}
      </div>

      {/* Najwyżej TRZY kolumny, i to nie ze względów estetycznych. Zmierzone na
          1440 px: przy czterech kolumnach karta ma 328 px, kolumna tekstu 176 px,
          a wiersz ceny („1 342 zł/os." obok „zwykle ok. 2 064 zł") potrzebuje
          ok. 208 px — na czterech z sześciu kart ucinało się WŁAŚNIE odniesienie,
          czyli jedyną liczbę, która czyni słowo „okazja" sprawdzalnym.
          Sześć kart dzieli się bez reszty na 1, 2 i 3 kolumny, więc na żadnym
          progu nie zostaje sierocy wiersz. */}
      <FlightDealsGrid items={items} className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {deals.map((deal, index) => (
          <TrackedDeal key={deal.routeKey} item={items[index]} position={index + 1}>
            <FlightDealCard deal={deal} />
          </TrackedDeal>
        ))}
      </FlightDealsGrid>

      {/* Trzy warunki, bez których cena lotu jest nieporównywalna z żadną inną.
          Raz pod siatką, a nie osiem razy na kartach: powtórzony na każdym
          wierszu ten sam dopisek przestaje być czytany już przy drugim. */}
      <p className="mt-3 text-xs leading-5 text-ink-muted">
        Ceny za osobę, przelot w obie strony, z podatkami i opłatami lotniskowymi.
      </p>
    </section>
  );
}

// Karta NIE ma osobnego przycisku „Zobacz lot", choć ma go karta hotelu obok.
// Powód: tam etykieta stoi w wysokim kaflu i ma dla siebie miejsce, tutaj
// byłaby piątą linią w wierszu, który i tak w całości jest linkiem. Afordancję
// niesie uniesienie karty i stan wciśnięcia (`active:`), obecne także na
// dotyku — czyli tam, gdzie jest 90% ruchu.
function FlightDealCard({ deal }: { deal: FlightDealView }) {
  const href = dealHref(deal);
  const dates = formatDateRange(deal.depart, deal.returnDate);

  return (
    <article className="group relative flex overflow-hidden rounded-md border border-line bg-surface-raised shadow-[var(--shadow-sm)] transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] active:scale-[0.995] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:active:scale-100">
      <div className="relative w-28 shrink-0 self-stretch overflow-hidden bg-surface-sunken sm:w-32">
        {deal.imageUrl ? (
          <Image
            src={deal.imageUrl}
            // Nazwa kierunku jedzie w nagłówku obok — powtórzenie jej w opisie
            // zdjęcia kazałoby czytnikowi ekranu przeczytać to samo dwa razy.
            alt=""
            fill
            // `sizes` jest CELOWO większe od szerokości boksu (112/128 px).
            // Kadr jest pionowy, a zdjęcia z Pexels są poziome 3:2, więc przy
            // `object-fit: cover` przeglądarka skaluje źródło do WYSOKOŚCI
            // kafla i przycina boki: dla boksu 112×130 potrzebuje ok. 195 px
            // szerokości źródła. Zmierzone przy `sizes="96px"`: pobierany plik
            // miał 96×64 i był rozciągany dwukrotnie w pionie — na telefonie
            // z gęstym ekranem (czyli u 90% ruchu) to widoczna papka.
            sizes="(max-width: 640px) 200px, 240px"
            className="object-cover transition duration-200 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <span className="grid h-full w-full place-items-center bg-brand-soft">
            <Plane aria-hidden className="h-5 w-5 text-brand" strokeWidth={1.75} />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="flex items-center justify-between gap-2">
          {/* Nagłówek niesie JEDYNY link karty, rozciągnięty pseudo-elementem
              na cały wiersz — jeden przystanek tabulatora zamiast trzech
              prowadzących pod ten sam adres. */}
          <h3 className="min-w-0 font-display text-lg leading-tight text-ink">
            <LocalizedLink href={href} className="before:absolute before:inset-0">
              <span className="block truncate">{deal.cityLabel}</span>
            </LocalizedLink>
          </h3>
          <span className="shrink-0 rounded-sm bg-brand-soft px-1.5 py-0.5 text-[11px] font-bold leading-5 text-brand-strong">
            <span aria-hidden>−{deal.savingPercent}%</span>
            {/* Plakietka „−35%" bez kontekstu jest dla czytnika ekranu pustym
                sygnałem sprzedażowym. Ten opis mówi WOBEC CZEGO jest taniej
                i na ilu pomiarach stoi porównanie. */}
            <span className="sr-only">
              Cena o {deal.savingPercent}% niższa od mediany cen tej trasy, policzonej
              z {deal.sampleCount} sprawdzonych terminów.
            </span>
          </span>
        </div>

        <p className="truncate text-xs leading-5 text-ink-muted">
          {/* Dopełniacz, nie etykieta z bazy: „z Warszawa" natychmiast czyta się
              jak tekst wygenerowany, a nie napisany (patrz airports.ts). */}
          z {airportCityGenitive(deal.originIata)}
          {dates ? ` · ${dates}` : ""} · {nightsLabel(deal.nights)}
        </p>

        <p className="flex min-w-0 items-center gap-1.5 text-xs leading-5 text-ink-muted">
          <AirlineLogo logoUrl={deal.airlineLogo} code={deal.airlineCode} name={deal.airlineName} size={16} />
          <span className="truncate">
            {deal.airlineName} · {stopsLabel(deal.stops)}
            {/* Czas dotyczy przelotu TAM — na wąskim ekranie ustępuje miejsca
                informacji o przesiadkach, która waży w decyzji więcej.
                Dopisek dla czytnika ekranu siedzi WEWNĄTRZ tego samego
                `hidden sm:inline`: gdyby stał obok, na telefonie zapowiadałby
                czas, którego na ekranie nie ma. */}
            <span className="hidden sm:inline">
              {" · "}
              {fmtDuration(deal.durationMinutes)}
              <span className="sr-only"> w jedną stronę</span>
            </span>
          </span>
        </p>

        <div className="mt-auto flex items-baseline justify-between gap-2 border-t border-line pt-2">
          <p className="whitespace-nowrap text-base font-bold leading-tight text-ink">
            {formatPricePln(deal.pricePln)}
            <span className="text-[11px] font-medium text-ink-muted">/os.</span>
          </p>
          <p className="truncate text-[11px] leading-tight text-ink-muted">
            zwykle ok. {formatPricePln(deal.typicalPln)}
          </p>
        </div>
      </div>
    </article>
  );
}
