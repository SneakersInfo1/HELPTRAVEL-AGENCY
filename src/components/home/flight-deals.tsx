import { OfferImage } from "@/components/ui/offer-image";

import { AirlineLogo } from "@/components/flights/airline-logo";
import { airportCityGenitive } from "@/lib/flights/airports";
import { LocalizedLink } from "@/components/site/localized-link";
import { FlightDealsGrid, TrackedDeal, type FlightDealItem } from "./flight-deals-client";
import { HOME_COPY, type SectionCopy } from "@/lib/home/copy";
import { formatDateRange, formatPricePln, nightsLabel } from "@/lib/home/deal-card";
import { fmtDuration, stopsLabel } from "@/lib/flights/display";
import { DEAL_MIN, hasMeaningfulSpread, type FlightDeal } from "@/lib/flights/flight-deals";

// Sekcja „Tanie loty z Polski" (2026-08-02).
//
// HISTORIA, KTÓRA TŁUMACZY KSZTAŁT — przerabiana trzy razy w jeden dzień:
//   1. „Okazje lotnicze" z plakietką „−35%" i doborem po WIELKOŚCI różnicy
//      między terminami. Formalnie poprawne, praktycznie bezużyteczne: karty
//      pokazywały efektowne „−34%" na locie za 2 828 zł.
//   2. Nazwa padła z powodu prawa. UOKiK wymienia słowo „okazja" dosłownie
//      obok „obniżki" i „promocji" jako komunikat wymagający najniższej ceny
//      z 30 dni przed obniżką — historii, której nie mamy. Zniknęły procenty.
//   3. Dobór padł z powodu ceny. Właściciel: „zależy mi na ofertach od 200 do
//      800, 900 zł maksymalnie". Sonda po 30 kierunkach (90 realnych wycen)
//      pokazała, że takie ceny są na KRÓTKICH trasach miejskich, a nie nad
//      Morzem Śródziemnym. Kryterium jest dziś sufit ceny, a sortowanie idzie
//      od najtańszego.
// Różnica wobec pozostałych terminów została jako informacja dodatkowa —
// pokazywana tylko wtedy, gdy jest realna (patrz `hasMeaningfulSpread`).
//
// DLACZEGO TO NIE JEST KOLEJNA KARUZELA ZE ZDJĘCIAMI
// Nad tą sekcją stoją już trzy pasy kart z fotografiami. Czwarty w tej samej
// skórce przestaje być sekcją, a staje się teksturą — użytkownik przewija
// wszystkie jednym gestem. Stąd siatka poziomych wierszy: zdjęcie zostaje
// (sprzedaje kierunek), ale prowadzą dane rejsu i cena.

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
  // Mniej niż komplet = brak sekcji. Dwie karty pod nagłówkiem „Tanie loty"
  // czytają się jak awaria zbierania danych, a nie jak wybór. Przy twardym
  // sufcie 900 zł taki stan jest realny i to jest poprawne zachowanie: brak
  // tanich lotów tego dnia lepiej przemilczeć niż uzupełnić drogimi.
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
        <h2 id="flight-deals" className="text-2xl font-bold leading-tight tracking-[-0.02em] text-ink sm:text-3xl">
          {copy.heading}
        </h2>
        {copy.subheading ? (
          <p className="mt-1 max-w-[62ch] text-sm leading-6 text-ink-muted">{copy.subheading}</p>
        ) : null}
      </div>

      {/* Najwyżej TRZY kolumny, i to nie ze względów estetycznych. Zmierzone na
          1440 px: przy czterech kolumnach karta ma 328 px, a kolumna tekstu
          176 px — wiersz z ceną i odniesieniem potrzebował ok. 208 px i ucinał
          się na czterech z sześciu kart. Sześć kart dzieli się bez reszty na
          1, 2 i 3 kolumny, więc na żadnym progu nie zostaje sierocy wiersz. */}
      <FlightDealsGrid items={items} className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {deals.map((deal, index) => (
          <TrackedDeal key={deal.routeKey} item={items[index]} position={index + 1}>
            <FlightDealCard deal={deal} />
          </TrackedDeal>
        ))}
      </FlightDealsGrid>

      {/* Trzy warunki, bez których cena lotu jest nieporównywalna z żadną inną,
          plus jedno zastrzeżenie, którego brak byłby cichą obietnicą. Ceny
          pochodzą ze sprawdzenia sprzed najwyżej kilkunastu godzin, a bilety
          zmieniają się w godzinach — po kliknięciu wyszukujemy je od nowa,
          więc mogą się różnić. Lepiej napisać to raz tutaj niż tłumaczyć się
          z tego na ekranie wyników. */}
      <p className="mt-3 max-w-[80ch] text-xs leading-5 text-ink-muted">
        Ceny za osobę, przelot w obie strony, z podatkami i opłatami lotniskowymi. Sprawdzamy je
        co dwie godziny, a po kliknięciu wyszukujemy od nowa — mogą się różnić.
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
      {/* 96 px na najwęższych telefonach: przy 112 px kolumna tekstu schodziła
          do ~152 px i ucinała się data wyjazdu (zmierzone na 320 px). Zdjęcie
          jest tu ilustracją, data — treścią. */}
      <div className="relative w-24 shrink-0 self-stretch overflow-hidden bg-surface-sunken sm:w-32">
        <OfferImage
          src={deal.imageUrl}
          // Nazwa kierunku jedzie w nagłówku obok — powtórzenie jej w opisie
          // zdjęcia kazałoby czytnikowi ekranu przeczytać to samo dwa razy.
          alt=""
          kluczZastepnika={deal.destinationId || deal.destinationIata}
          wariant="lot"
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
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <div className="flex items-center justify-between gap-2">
          {/* Nagłówek niesie JEDYNY link karty, rozciągnięty pseudo-elementem
              na cały wiersz — jeden przystanek tabulatora zamiast trzech
              prowadzących pod ten sam adres. */}
          <h3 className="min-w-0 text-lg font-bold leading-tight tracking-[-0.01em] text-ink">
            <LocalizedLink href={href} className="before:absolute before:inset-0">
              <span className="block truncate">{deal.cityLabel}</span>
            </LocalizedLink>
          </h3>
          {/* BEZ PLAKIETKI „−35%" — usunięta świadomie po review prawnym.
              Procent w takiej ramce to gramatyka rabatu, a rabatu tu nie ma:
              nikt nie obniżył ceny, po prostu inne daty kosztują więcej.
              Informację niesie zestawienie dwóch kwot w wierszu ceny, gdzie
              druga jest wprost podpisana jako „inne terminy". Szczegóły
              i podstawa prawna — komentarz przy `flightDeals` w lib/home/copy.ts. */}
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

        {/* Cena i odniesienie JEDNO POD DRUGIM, nie obok siebie. Zmierzone:
            w układzie w wierszu podpis „inne terminy ok. 2 064 zł" ucinał się
            na pięciu z sześciu kart — a to jest dokładnie ta liczba, która
            czyni całe porównanie sprawdzalnym. Wyższa karta jest tańsza niż
            urwane odniesienie. */}
        <div className="mt-auto border-t border-line pt-2">
          {/* Akcent jest w tym systemie zarezerwowany dla ceny — i to jedyne
              miejsce na karcie, gdzie kolor cokolwiek znaczy. */}
          <p className="whitespace-nowrap text-lg font-bold leading-tight text-accent">
            {formatPricePln(deal.pricePln)}
            <span className="text-[11px] font-medium text-ink-muted">/os.</span>
          </p>
          {/* Wiersz odniesienia POJAWIA SIĘ WARUNKOWO. Gdy wszystkie sprawdzone
              terminy kosztują mniej więcej tyle samo (a tak bywa na najtańszych
              trasach), dopisek „inne terminy ok. tyle samo" nic nie wnosi
              i tylko udaje porównanie. Wtedy zostaje sama cena.
              „Inne terminy", a nie „zwykle": nazywa wprost, co jest podstawą —
              inne DATY tej samej trasy, a nie wcześniejsza cena tej oferty.
              Bez przekreślenia, bo nikt tej ceny nie obniżał. */}
          {hasMeaningfulSpread(deal.pricePln, deal.typicalPln) ? (
            <p className="truncate text-[11px] leading-tight text-ink-muted">
              inne terminy <span className="sr-only">kosztują </span>ok. {formatPricePln(deal.typicalPln)}
            </p>
          ) : (
            // Zamiennik NIE może powtarzać tego, co stoi wiersz wyżej („7 nocy"
            // jest już przy datach). Ta linia dokłada jedyną informację, której
            // nigdzie indziej nie ma: ile terminów za tą ceną stoi.
            <p className="truncate text-[11px] leading-tight text-ink-muted">
              najtańszy z {deal.sampleCount} terminów
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
