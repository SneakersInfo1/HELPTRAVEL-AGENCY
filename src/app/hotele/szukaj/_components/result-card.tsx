// Karta wyniku wyszukiwania hoteli.
//
// UX: CAŁA karta jest jednym `Link` — klik w zdjęcie, nazwę, ocenę, cenę,
// przycisk, cokolwiek, prowadzi do /hotele/[hotelId]. Wcześniej linkiem był
// tylko mały przycisk „Zobacz pokoje", więc klik w zdjęcie albo nazwę (czyli
// w naturalny cel) nic nie robił — zgłoszenie „dwa kliknięcia, żeby otworzyć
// ofertę" z 2026-05-28. Z tego samego powodu w środku NIE MA zagnieżdżonych
// linków ani przycisków: to nieprawidłowy HTML i pułapka dla czytników.
//
// `hover:-translate-y-0.5` zostało usunięte, bo transform na celu kliknięcia
// potrafi rozjechać mousedown z mouseup. Zmiana obramowania i cienia wystarczy.
//
// UKŁAD (przebudowa 2026-08-07, brief §17). Wcześniej treść była jedną kolumną
// z `mt-auto` przy cenie, więc na szerokim ekranie środek karty był pustym
// polem na ~200 px wysokości — „wygląda niedokończone". Teraz szersza karta
// dzieli treść na kolumnę informacji i wydzieloną SZYNĘ CENOWĄ po prawej:
// wzrok ma jedno miejsce, w którym szuka kwoty i przycisku, a wolna przestrzeń
// idzie na chipy z realnych danych zamiast na pustkę.
//
// KARTA MIERZY SIEBIE, NIE OKNO (poprawka 2026-08-08, zgłoszenie właściciela:
// „layout i mapa zachowują się inaczej przy 80% i przy 100% zoomu").
//
// Wszystkie progi układu są ZAPYTANIAMI KONTENEROWYMI, a nie punktami
// przełamania okna. Punkty okna były tu realną przyczyną błędu: w widoku
// dzielonym lista/mapa karta ma ZMIERZONE 955 px przy oknie 1920 px, ale okno
// raportuje `2xl`, więc karta dostawała układ zaprojektowany na 1408 px. Przy
// zoomie 125% (okno 1536 px) ta sama karta ma 788 px i wciąż `2xl` — zdjęcie
// zostawało na 352 px, czyli z 37% szerokości karty robiło się 45%. Stąd
// wrażenie, że „przy 100% jest inaczej niż przy 80%": zmieniał się stosunek
// zdjęcia do treści, bo dwie wielkości zmieniały się niezależnie od siebie.
//
// PROGI LICZĄ SIĘ OD TREŚCI, ALE MIERZY SIĘ KARTĘ — i to jest tu cała subtelność.
//
// Strefy (nazwa | chipy | szyna cenowa) dzielą KOLUMNĘ TREŚCI, czyli kartę
// MINUS zdjęcie. Pierwsze podejście keyowało je wprost do szerokości karty
// i rozpadło się w widoku dzielonym: przy karcie 955 px próg trzech stref był
// spełniony, ale po odjęciu zdjęcia 352 px na treść zostawało 603 px, z czego
// szyna cenowa zabierała 288 px — na nazwę hotelu zostawało ~153 px,
// „Kastro Boutique Suites" łamało się po JEDNYM SŁOWIE na linię, a plakietka
// oceny wchodziła na nazwę.
//
// Naturalny odruch — dać kolumnie treści własny `@container` — NIE DZIAŁA:
// element z `container-type` wyznacza kontekst dla POTOMKÓW, nigdy dla samego
// siebie, więc siatka postawiona na tym samym węźle co kontener jest martwa
// (sprawdzone: wszystkie karty wracały do układu jednokolumnowego).
//
// Dlatego kontener jest JEDEN (`@container/karta`), a progi treści są na niego
// przeliczone przez znaną szerokość zdjęcia:
//   karta ≥  576 px → zdjęcie obok treści (niżej: zdjęcie nad treścią)
//   karta ≥  872 px → zdjęcie 18rem;  karta ≥ 1152 px → zdjęcie 22rem
//   karta ≥  780 px → treść ≥ 540 px → szyna cenowa jako osobna kolumna z linią
//   karta ≥ 1064 px → treść ≥ 776 px → trzecia strefa: chipy z własną kolumną
//                     (260 px nazwa + 180 px chipy + 288 px szyna + odstępy)
//
// Skutek uboczny i zamierzony: to naprawia też widok listy przy oknie 1024 px,
// gdzie karta miała 652 px, zdjęcie 320 px i na kolumnę nazwy zostawało 36 px.
// Nikt tego nie zauważył, bo testy patrzyły tylko na 1920, 1440, 768 i 390.
//
// Dlatego NIE MA już propsa `dense`. Był jawną obejściówką tego samego
// problemu („karta stoi w wąskiej kolumnie, mimo że okno jest szerokie") —
// kontener mierzy to sam. `compact` zostaje, bo opisuje ROLĘ (podgląd nad
// mapą), a nie szerokość.

import type { ReactNode } from "react";
import Link from "next/link";

import { ArrowRight, CalendarCheck, Landmark, MapPin, UtensilsCrossed, Waves } from "lucide-react";

import { hotelDistanceLabels } from "@/lib/geo/distance-label";
import { nightsWord, reviewsLabel, taxNoticeFromSlim, taxNoticeText } from "@/lib/hotels/domain/format";
import { discountPercent } from "@/lib/hotels/domain/price";
import { offerHighlights } from "@/lib/hotels/facility-filters";
import { ratingLabel } from "@/lib/hotels/rating";
import { localizeBoard } from "@/lib/liteapi/translations";
import { localizeCountry } from "@/lib/mvp/i18n-geo";
import { formatPLN } from "@/lib/money";
import { FavoriteButton } from "@/components/hotels/favorite-button";
import { HotelCardImage } from "./hotel-card-image";

interface OfferCard {
  hotelId: string;
  name: string;
  city: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  thumbnailUrl?: string;
  /** Udogodnienia z `/data/hotels` — źródło chipów. Brak = brak chipów. */
  facilityIds?: number[];
  // Opcjonalne: gdy pominięte, karta renderuje `priceSlot` (progresywne
  // ładowanie cen po stronie klienta) zamiast ceny z serwera.
  cheapestRate?: {
    rateId: string;
    offerId: string;
    boardName?: string;
    refundableTag?: string;
    totalAmount: number;
    currency: string;
    cancellationDeadline?: string;
    /** Patrz SlimRate w rate-cache.ts — `undefined` = brak danych, milczymy. */
    taxesIncluded?: boolean;
    taxExtraAmount?: number;
    /** Cena wyjściowa TEJ SAMEJ taryfy, gdy dostawca ją obniżył. */
    originalAmount?: number;
  };
}

/**
 * Chipy z tego, co gość faktycznie dostaje.
 *
 * Wydzielone, bo renderują się w DWÓCH miejscach: do xl w kolumnie z nazwą,
 * od xl w osobnej strefie karty. Jedna definicja, żeby dwa warianty nie
 * rozjechały się przy pierwszej zmianie.
 *
 * Każdy chip pochodzi z danych dostawcy — wyżywienie i anulacja z taryfy,
 * reszta z `facilityIds`. Nic nie jest dopisane „dla wyglądu": pusta karta
 * jest lepsza niż karta z wymyśloną obietnicą.
 */
function Chipy({
  boardName,
  isFreeCancel,
  freeCancelDate,
  highlights,
}: {
  boardName?: string;
  isFreeCancel: boolean;
  freeCancelDate: string | null;
  highlights: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {boardName && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-600/15">
          <UtensilsCrossed aria-hidden className="h-3 w-3" />
          {localizeBoard(boardName)}
        </span>
      )}
      {isFreeCancel && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-600/15">
          <CalendarCheck aria-hidden className="h-3 w-3" />
          {freeCancelDate ? `Bezpłatna anulacja do ${freeCancelDate}` : "Bezpłatna anulacja"}
        </span>
      )}
      {highlights.map((h) => (
        <span
          key={h}
          className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-700"
        >
          {h}
        </span>
      ))}
    </div>
  );
}

const formatDate = (iso: string | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit" }).format(d);
};

interface BadgeKind {
  cheapest?: boolean;
  topRated?: boolean;
  freeCancel?: boolean;
}

export function ResultCard({
  offer,
  searchQuery,
  nights,
  badges,
  imagePriority = false,
  priceSlot,
  compact = false,
}: {
  offer: OfferCard;
  searchQuery: string;
  nights: number;
  badges?: BadgeKind;
  imagePriority?: boolean;
  priceSlot?: ReactNode;
  /**
   * Wariant PODGLĄDU na mapie mobilnej — karta ma zajmować pas u dołu, nie pół
   * telefonu.
   *
   * Pełna karta ma na 390 px zdjęcie 4:3, komplet chipów i odległości; jako
   * podgląd wybranego znacznika zasłaniała mapę prawie w całości, więc gość
   * tracił z oczu to, na co właśnie patrzył. Tu zdjęcie jest miniaturą obok
   * treści, a odległości i nadmiar chipów schodzą — wszystko to jest na stronie
   * obiektu, jedno dotknięcie dalej.
   */
  compact?: boolean;
}) {
  const rate = offer.cheapestRate;
  const total = rate ? formatPLN(rate.totalAmount, rate.currency) : null;
  const perNight = rate
    ? formatPLN(Math.round(rate.totalAmount / Math.max(1, nights)), rate.currency)
    : null;
  const freeCancelDate = rate ? formatDate(rate.cancellationDeadline) : null;
  const isFreeCancel = (rate?.refundableTag === "RFN" || badges?.freeCancel) ?? false;
  // `null` gdy dostawca nie podał rozbicia — wtedy o podatkach MILCZYMY.
  const taxText = rate
    ? taxNoticeText(taxNoticeFromSlim(rate.taxesIncluded, rate.taxExtraAmount, rate.currency))
    : null;
  const percent =
    rate?.originalAmount !== undefined
      ? discountPercent(rate.originalAmount, rate.totalAmount)
      : null;
  const distances = hotelDistanceLabels(
    { lat: offer.latitude, lng: offer.longitude },
    offer.city,
    offer.countryCode ?? offer.country,
  );
  // 6 zamiast domyślnych 4: od xl chipy mają własną strefę karty i przy
  // czterech pozycjach ta strefa świeciła pustką. Źródło danych bez zmian —
  // pokazujemy więcej TEGO, co dostawca faktycznie podał, nie więcej ozdób.
  const highlights = offerHighlights(offer.facilityIds, 6);

  return (
    // KONTENER JEST OPAKOWANIEM, NIE SAMĄ KARTĄ — i to nie jest kosmetyka.
    //
    // Element z `container-type` wyznacza kontekst dla swoich POTOMKÓW, ale nie
    // dla samego siebie: własne klasy `@min-[…]` na kontenerze NIGDY się nie
    // stosują. Pierwsza wersja tej poprawki miała `@container` na `<Link>`,
    // więc `@min-[576px]:flex-row` na karcie było martwe — karta zostawała
    // `flex-col`, a zdjęcie (już jako potomek) traciło `aspect-[4/3]` i miało
    // ZMIERZONE 352×0 px. Treść nachodziła wtedy na całą kartę i przykrywała
    // przycisk polubienia; wyłapał to `v3.spec.ts` („serce zapisuje obiekt").
    <div className="@container/karta">
      <Link
        href={`/hotele/${encodeURIComponent(offer.hotelId)}?${searchQuery}`}
        aria-label={`Zobacz ofertę: ${offer.name}, ${offer.city}`}
        // `sm:min-h-*` — karta ma WYSOKOŚĆ, nie tylko treść. Bez tego wysokość
        // dyktowała najkrótsza możliwa kolumna tekstu (~130 px na 1920 px) i rząd
        // kart czytał się jak tabela, a nie jak oferty (zgłoszenie 2026-08-08:
        // „oferty zrobiły się ściśnięte", „pole oferty ma wyglądać pełniej").
        className={`group flex overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-[0_4px_16px_rgba(16,84,48,0.06)] transition-colors transition-shadow duration-200 hover:border-emerald-300 hover:shadow-[0_12px_28px_rgba(16,84,48,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
          compact
            ? "flex-row"
            : "flex-col @min-[576px]/karta:min-h-[12.5rem] @min-[576px]/karta:flex-row @min-[1152px]/karta:min-h-[14rem]"
        }`}
      >
        {/* Zdjęcie rośnie razem z KARTĄ, nie z oknem — patrz blok o zapytaniach
            kontenerowych nad `ResultCard`. */}
        <div
          className={`relative shrink-0 overflow-hidden bg-neutral-100 ${
            compact
              ? "aspect-square w-24 self-stretch sm:w-28"
              : "aspect-[4/3] w-full @min-[576px]/karta:aspect-auto @min-[576px]/karta:w-60 @min-[872px]/karta:w-72 @min-[1152px]/karta:w-[22rem]"
          }`}
        >
          <HotelCardImage
            thumbnailUrl={offer.thumbnailUrl}
            name={offer.name}
            city={offer.city}
            country={offer.country}
            priority={imagePriority}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/30 to-transparent" />
          {/* Serce w rogu zdjęcia — wzorzec, którego gość szuka odruchowo.
              Wewnątrz linku karty, więc przycisk zatrzymuje zdarzenie sam. */}
          <div className={compact ? "hidden" : "absolute right-2 top-2"}>
            <FavoriteButton
              hotel={{
                id: offer.hotelId,
                name: offer.name,
                city: offer.city,
                country: offer.country,
                image: offer.thumbnailUrl,
                rating: offer.rating,
                stars: offer.stars,
                href: `/hotele/${encodeURIComponent(offer.hotelId)}?${searchQuery}`,
              }}
            />
          </div>
          <div className="absolute left-2 top-2 flex flex-col gap-1">
            {badges?.cheapest && (
              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
                Najtańsze
              </span>
            )}
            {badges?.topRated && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
                Najlepsza ocena
              </span>
            )}
          </div>
        </div>

        {/* UKŁAD TREŚCI (przebudowa 2026-08-08).
            Wcześniej: `[1fr | 248px]`, czyli na 1920 px kolumna informacji miała
            ~1090 px, a mieściła nazwę i jeden rządek chipów — środek karty był
            pustym polem. Zmierzone: karta 1408 px, treść kończyła się w połowie.
            Teraz od xl wchodzi TRZECIA strefa: nazwa i lokalizacja | udogodnienia
            | szyna cenowa. Ta sama treść, ta sama prawda o danych — tylko
            rozłożona tak, że szerokość na coś idzie. */}
        <div
          className={`flex min-w-0 flex-1 flex-col ${
            compact
              ? "gap-1.5 p-3"
              : "gap-3 p-4 @min-[576px]/karta:p-5 @min-[780px]/karta:grid @min-[780px]/karta:items-stretch @min-[780px]/karta:gap-6"
          } ${
            compact
              ? ""
              : "@min-[780px]/karta:grid-cols-[minmax(0,1fr)_17rem] @min-[1064px]/karta:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_18rem]"
          }`}
        >
          {/* ── Strefa 1: tożsamość obiektu ──────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-2">
            {/* `flex-nowrap`, nie `flex-wrap`. Przy zawijaniu ocena raz stała
                obok nazwy, a raz zeskakiwała pod nią — zależnie od DŁUGOŚCI
                NAZWY HOTELU. Rząd kart wyglądał wtedy jak zbiór różnych
                szablonów zamiast jednego. Nazwa dostaje `min-w-0` i zawija się
                sama, ocena `shrink-0` i zostaje na miejscu. */}
            <div className="flex flex-nowrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3
                  className={`font-bold leading-snug text-neutral-900 ${
                    // W podglądzie na mapie nazwa musi zająć najwyżej dwie linie —
                    // „All Senses Nautica Blue Exclusive Resort & Spa - All
                    // Inclusive" rozłożyło się na cztery i zepchnęło cenę poza pas.
                    compact ? "line-clamp-2 text-sm" : "text-base @min-[576px]/karta:text-lg @min-[1152px]/karta:text-xl"
                  }`}
                >
                  {offer.name}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-600">
                  {offer.stars !== undefined && offer.stars > 0 && (
                    <span className="text-amber-500" aria-label={`${offer.stars} gwiazdek`}>
                      {"★".repeat(Math.round(offer.stars))}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <MapPin aria-hidden className="h-3.5 w-3.5 text-emerald-600" />
                    {offer.city}
                    {offer.country ? `, ${localizeCountry(offer.country)}` : ""}
                  </span>
                </div>
                {!compact && (distances.center || distances.beach) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-neutral-700">
                    {distances.center && (
                      <span className="inline-flex items-center gap-1">
                        <Landmark aria-hidden className="h-3.5 w-3.5 text-emerald-600" />
                        {distances.center}
                      </span>
                    )}
                    {distances.beach && (
                      <span className="inline-flex items-center gap-1">
                        <Waves aria-hidden className="h-3.5 w-3.5 text-emerald-600" />
                        {distances.beach}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* Ocena — WIĘKSZA i zwarta. Wcześniej mała pigułka z liczbą
                  w jeszcze mniejszym prostokącie ginęła na tle nazwy hotelu,
                  choć to drugi po cenie powód, dla którego ktoś klika. */}
              {offer.rating !== undefined && offer.rating > 0 && (
                <div className="flex shrink-0 items-center gap-2 rounded-xl bg-emerald-50 px-2.5 py-1.5 ring-1 ring-emerald-600/15">
                  <span className="rounded-lg bg-emerald-700 px-2 py-1 text-sm font-bold tabular-nums text-white">
                    {offer.rating.toFixed(1)}
                  </span>
                  <span className="leading-tight">
                    <span className="block text-xs font-bold text-emerald-900">{ratingLabel(offer.rating)}</span>
                    {offer.reviewCount !== undefined && offer.reviewCount > 0 && (
                      <span className="block text-[10px] text-emerald-800/70">{reviewsLabel(offer.reviewCount)}</span>
                    )}
                  </span>
                </div>
              )}
            </div>

            {/* W wąskiej karcie chipy zostają tutaj — trzecia strefa istnieje
                dopiero przy karcie ≥872 px, gdzie jest na nią miejsce. */}
            <div className={compact ? "hidden" : "@min-[1064px]/karta:hidden"}>
              <Chipy
                boardName={rate?.boardName}
                isFreeCancel={isFreeCancel}
                freeCancelDate={freeCancelDate}
                highlights={highlights}
              />
            </div>
          </div>

          {/* ── Strefa 2: co gość dostaje (tylko w szerokiej karcie) ─────── */}
          <div className={compact ? "hidden" : "hidden min-w-0 @min-[1064px]/karta:block"}>
            <Chipy
              boardName={rate?.boardName}
              isFreeCancel={isFreeCancel}
              freeCancelDate={freeCancelDate}
              highlights={highlights}
            />
          </div>

          {/* ── Strefa 3: szyna cenowa ───────────────────────────────────────
              Przy karcie ≥648 px wydzielona pionową linią i wyrównana do dołu:
              cena i CTA zawsze w tym samym miejscu, niezależnie od długości
              nazwy hotelu. */}
          <div className={`mt-auto flex flex-wrap items-end justify-between gap-3 ${
              compact
                ? "gap-2 pt-1"
                : "pt-2 @min-[780px]/karta:mt-0 @min-[780px]/karta:flex-col @min-[780px]/karta:items-stretch @min-[780px]/karta:justify-end @min-[780px]/karta:gap-3 @min-[780px]/karta:border-l @min-[780px]/karta:border-neutral-100 @min-[780px]/karta:pl-6 @min-[780px]/karta:pt-0"
            }`}>
            {rate ? (
              <div className="@min-[780px]/karta:text-right">
                {/* Przecena — tylko przy REALNEJ obniżce tej samej taryfy.
                    Źródłem jest `initialPrice`, nigdy cena konkurenta. */}
                {percent !== null && rate.originalAmount !== undefined && (
                  <div className="mb-1 flex items-center gap-2 @min-[780px]/karta:justify-end">
                    <span className="rounded-md bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                      −{percent}%
                    </span>
                    <span className="text-xs text-neutral-500 line-through">
                      {formatPLN(rate.originalAmount, rate.currency)}
                    </span>
                  </div>
                )}
                {/* Hierarchia §8.5: cena CAŁEGO pobytu dominuje, „za noc" pomocnicza. */}
                <div className={`font-bold leading-none text-emerald-700 ${compact ? "text-xl" : "text-2xl @min-[1152px]/karta:text-[1.75rem]"}`}>{total}</div>
                <div className="mt-1.5 text-xs text-neutral-600">
                  za {nights} {nightsWord(nights)} · <span className="font-semibold">{perNight}</span> / noc
                </div>
                {taxText && <div className="mt-0.5 text-[11px] text-neutral-500">{taxText}</div>}
              </div>
            ) : (
              <div className="min-w-[10rem] @min-[780px]/karta:w-full">{priceSlot}</div>
            )}
            {/* CTA jest `span`, NIE zagnieżdżonym linkiem — nawigację obsługuje
                cała karta. Przycisk zostaje, bo kotwiczy wzrok. */}
            <span
              aria-hidden
              className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-sm transition-colors group-hover:bg-emerald-700 ${compact ? "px-4" : "px-5 @min-[780px]/karta:w-full"}`}
            >
              Zobacz pokoje
              <ArrowRight aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
