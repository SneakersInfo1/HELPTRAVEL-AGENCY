"use client";

// Rooms section — Booking-style grouping (zadanie 5, 2026-06-11).
//
// LiteAPI returns EVERY price variant as its own roomType/offer (faza 0:
// 200 offers / 25 room names on one hotel), so the old "card per roomType"
// render produced walls of identical cards. Now: groupRates() (pure,
// presentation-only — lib/hotels/group-rates.ts) folds offers into ONE CARD
// PER ROOM (normalized original name + capacity), dedupes condition-identical
// offers to the cheapest, and each option row links to the checkout with ITS
// OWN source offerId — the navigation contract is byte-identical to before.
//
// Collapsing: 3 cheapest options visible per group, the rest behind
// "Pokaż wszystkie opcje (N)". Exactly one option in the whole hotel wears
// the "Najtańsza opcja" badge.

import Image from "next/image";
import Link from "next/link";
import { BedDouble, ImageOff, Ruler, Users } from "lucide-react";
import { useMemo, useState } from "react";

import type { RoomProfile } from "@/lib/hotels/domain/types";
import type { LiteApiRoomType } from "@/lib/liteapi";
import { guestsLabel, optionsLabel, taxNoticeText } from "@/lib/hotels/domain/format";
import { honestDiscountFrom, mapTaxes, taxNoticeFrom } from "@/lib/hotels/domain/price";
import { topRoomAmenities } from "@/lib/hotels/domain/room-description";
import { groupRates, mergeGroupsByDisplayName, type RoomGroup, type RoomOption } from "@/lib/hotels/group-rates";
import { localizeBoard, localizeRoomName } from "@/lib/liteapi/translations";
import { formatPLN, fromMinor } from "@/lib/money";

import { RoomDetailDialog } from "./room-detail-dialog";

const VISIBLE_OPTIONS_DEFAULT = 3;

interface Props {
  hotelId: string;
  roomTypes: LiteApiRoomType[];
  /**
   * Profile pokoi z /data/hotel, zaindeksowane po `rooms[].id`.
   * Taryfa trafia w swój pokój przez `rate.mappedRoomId` — bez zgadywania po
   * nazwie (nazwy taryf są angielskie, nazwy pokoi bywają polskie).
   * Pusta mapa = brak powiązań → karty bez zdjęć, ale nigdy ze zdjęciem hotelu.
   */
  roomsById?: Record<string, RoomProfile>;
  searchQuery: string;
  nights: number;
  currency: string;
  // BOOKING_FLOW_MODE, resolved server-side on the hotel page. When false the
  // CTA renders a friendly "Wkrótce dostępne" disabled state (no navigation,
  // no API call, no 401) — this alone fixes today's visible bug.
  bookingLive: boolean;
}

const formatDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit" }).format(d);
};


export function RoomsSection({
  hotelId,
  roomTypes,
  roomsById,
  searchQuery,
  nights,
  currency,
  bookingLive,
}: Props) {
  // Pure presentation-layer fold — recomputed only when fresh rates arrive.
  // Bazowe grupowanie po nazwie EN, potem scalenie grup o identycznej nazwie PL
  // (FAZA 4) — żeby nie było kilku kart „Pokój dwuosobowy…" obok siebie.
  const groups = useMemo(
    () => mergeGroupsByDisplayName(groupRates(roomTypes).groups, localizeRoomName),
    [roomTypes],
  );

  if (!groups.length) {
    return (
      <section id="rooms" className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="text-xl font-bold text-neutral-900">Pokoje</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Brak dostępności dla wybranych dat. Spróbuj innego terminu lub mniejszej liczby gości.
        </p>
      </section>
    );
  }

  return (
    <section id="rooms" className="space-y-4">
      <h2 className="text-xl font-bold text-neutral-900">Pokoje i ceny</h2>
      {groups.map((group) => (
        <RoomGroupCard
          key={group.key}
          hotelId={hotelId}
          group={group}
          room={roomProfileForGroup(group, roomsById)}
          searchQuery={searchQuery}
          nights={nights}
          currency={currency}
          bookingLive={bookingLive}
        />
      ))}
    </section>
  );
}

/**
 * Wybiera profil pokoju dla grupy taryf.
 *
 * Grupa powstaje z kilku taryf tego samego pokoju, więc bierzemy `mappedRoomId`
 * z PIERWSZEJ opcji, która je ma (opcje są posortowane od najtańszej).
 * Gdy żadna nie ma powiązania → `null` → karta bez zdjęcia. Nigdy nie
 * podstawiamy zdjęcia hotelu (brief §12.1).
 */
function roomProfileForGroup(
  group: RoomGroup,
  roomsById: Record<string, RoomProfile> | undefined,
): RoomProfile | null {
  if (!roomsById) return null;
  for (const option of group.options) {
    const id = option.rate.mappedRoomId;
    if (id === null || id === undefined) continue;
    const room = roomsById[String(id)];
    if (room) return room;
  }
  return null;
}

/** Metryki pokoju w jednym wierszu — pomijamy te, których dostawca nie podał. */
function RoomSpecs({ room }: { room: RoomProfile }) {
  const beds = room.beds
    .map((b) => [b.quantity && b.quantity > 1 ? `${b.quantity}×` : null, b.type].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");

  const specs: { icon: typeof Ruler; text: string }[] = [];
  if (room.sizeSquareMeters) specs.push({ icon: Ruler, text: `${room.sizeSquareMeters} m²` });
  if (room.maxOccupancy) specs.push({ icon: Users, text: `do ${guestsLabel(room.maxOccupancy)}` });
  if (beds) specs.push({ icon: BedDouble, text: beds });
  if (!specs.length) return null;

  return (
    <ul className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600">
      {specs.map(({ icon: Icon, text }) => (
        <li key={text} className="inline-flex items-center gap-1">
          <Icon aria-hidden className="h-3.5 w-3.5 text-neutral-400" />
          {text}
        </li>
      ))}
    </ul>
  );
}

function RoomGroupCard({
  hotelId,
  group,
  room,
  searchQuery,
  nights,
  currency,
  bookingLive,
}: {
  hotelId: string;
  group: RoomGroup;
  room: RoomProfile | null;
  searchQuery: string;
  nights: number;
  currency: string;
  bookingLive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? group.options : group.options.slice(0, VISIBLE_OPTIONS_DEFAULT);
  const hidden = group.options.length - visible.length;
  const fromLabel =
    group.cheapestMinor !== null
      ? `od ${formatPLN(fromMinor(group.cheapestMinor), currency)}`
      : null;

  // FAZA 4 — „+X zł za możliwość anulowania": dla oferty zwrotnej porównujemy
  // z NAJTAŃSZĄ bezzwrotną o TYM SAMYM wyżywieniu, żeby różnica wynikała z
  // samej polityki anulacji (a nie np. z innego wyżywienia). Brak takiego
  // odpowiednika → nie pokazujemy nic (uczciwie, bez zmyślania).
  const boardOf = (o: RoomOption) => (o.rate.boardName ?? o.rate.boardType ?? "").toLowerCase().trim();
  const cheapestNrfByBoard = new Map<string, bigint>();
  for (const o of group.options) {
    if (!o.freeCancellation && o.totalMinor !== null) {
      const b = boardOf(o);
      const cur = cheapestNrfByBoard.get(b);
      if (cur === undefined || o.totalMinor < cur) cheapestNrfByBoard.set(b, o.totalMinor);
    }
  }
  const premiumFor = (o: RoomOption): bigint | null => {
    if (!o.freeCancellation || o.totalMinor === null) return null;
    const nrf = cheapestNrfByBoard.get(boardOf(o));
    return nrf !== undefined && o.totalMinor > nrf ? o.totalMinor - nrf : null;
  };
  const cheapestOfferId = group.options[0]?.offerId; // opcje są posortowane rosnąco
  const groupHasMultiple = group.options.length > 1;
  const [detailOpen, setDetailOpen] = useState(false);
  const displayName = localizeRoomName(group.name);

  // Ten sam zestaw wierszy trafia na kartę i do modalu — jedno źródło prawdy
  // dla ceny, anulacji i linku do checkoutu. Rozjazd między kartą a modalem
  // byłby dokładnie tym rodzajem błędu, którego gość nie wybaczy.
  const optionRows = (options: RoomOption[]) =>
    options.map((option) => (
      <OptionRow
        key={option.offerId}
        hotelId={hotelId}
        option={option}
        searchQuery={searchQuery}
        nights={nights}
        currency={currency}
        bookingLive={bookingLive}
        cancelPremiumMinor={premiumFor(option)}
        isGroupCheapest={option.offerId === cheapestOfferId}
        groupHasMultiple={groupHasMultiple}
      />
    ));

  const wazneUdogodnienia = topRoomAmenities(room?.amenities ?? [], 6);

  return (
    // UKŁAD V3 (brief §22). Wcześniej pokój był wąskim paskiem nagłówka nad
    // listą taryf: miniatura 96×80 px i cztery pierwsze udogodnienia z API.
    // Na stronie o szerokości 1760 px wyglądało to jak notatka, a nie jak
    // opis produktu za kilka tysięcy złotych. Teraz od `lg` pokój ma dwie
    // kolumny: po lewej DUŻE zdjęcie i to, czym pokój jest, po prawej —
    // warianty cenowe, które zajmują resztę szerokości.
    <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="lg:grid lg:grid-cols-[minmax(0,34%)_minmax(0,1fr)]">
        <div className="border-b border-neutral-100 bg-neutral-50 p-4 sm:p-5 lg:border-b-0 lg:border-r">
          {/* Zdjęcie TEGO pokoju (przez rate.mappedRoomId → rooms[].id).
              Brak powiązania → neutralny zastępnik, NIGDY zdjęcie hotelu. */}
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            aria-label={`Zobacz szczegóły pokoju: ${displayName}`}
            className="group relative block aspect-[16/10] w-full overflow-hidden rounded-xl bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            {room?.photos.length ? (
              // `sizes` policzone z realnej geometrii: kolumna to 34% powłoki
              // 1760 px, czyli ~540 px. Wcześniej stało tu `128px` pod
              // miniaturę — po powiększeniu kafla zdjęcie byłoby rozmyte.
              <Image
                src={room.photos[0].url}
                // `??` nie wystarczy: dostawca zwraca PUSTY STRING, a nie null,
                // więc zdjęcie wychodziło z `alt=""` (czyli oznaczone jako
                // dekoracyjne) mimo że niesie treść.
                alt={
                  room.photos[0].description?.trim() ||
                  `Zdjęcie pokoju: ${localizeRoomName(group.name)}`
                }
                fill
                sizes="(max-width: 1023px) 92vw, (max-width: 1759px) 32vw, 560px"
                className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                loading="lazy"
              />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center text-neutral-400"
                aria-label="Brak zdjęcia tego pokoju"
              >
                <ImageOff aria-hidden className="h-8 w-8" />
              </span>
            )}
            {room && room.photos.length > 1 && (
              <span className="absolute bottom-2 right-2 rounded-md bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">
                {room.photos.length} zdjęć
              </span>
            )}
          </button>

          <div className="mt-3 min-w-0">
            {/* Nazwa też otwiera szczegóły — drugi naturalny cel kliknięcia. */}
            <h3 className="text-base font-semibold text-neutral-900 sm:text-lg">
              <button
                type="button"
                onClick={() => setDetailOpen(true)}
                className="rounded text-left transition hover:text-emerald-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                {displayName}
              </button>
            </h3>
            {room ? (
              <RoomSpecs room={room} />
            ) : (
              typeof group.maxOccupancy === "number" &&
              group.maxOccupancy > 0 && (
                <p className="mt-1 text-xs text-neutral-500">do {guestsLabel(group.maxOccupancy)}</p>
              )
            )}

            {/* Udogodnienia wybrane po WAŻNOŚCI, nie po kolejności z API.
                Cztery pierwsze pozycje dostawcy potrafiły dać „papier
                toaletowy" zamiast „klimatyzacji" (brief §24). */}
            {wazneUdogodnienia.length > 0 && (
              <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-neutral-600 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {wazneUdogodnienia.map((a) => (
                  <li key={a} className="flex items-start gap-1.5">
                    <span aria-hidden className="mt-[2px] text-emerald-600">
                      ✓
                    </span>
                    <span className="min-w-0 truncate">{a}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Trzeci, jawny cel — dla gościa, który nie zgaduje, że zdjęcie
                jest klikalne (brief §11). */}
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700 underline-offset-2 transition hover:text-emerald-800 hover:underline"
            >
              Zobacz szczegóły pokoju
            </button>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 border-b border-neutral-100 px-4 py-2.5 sm:px-5">
            <p className="text-sm font-semibold text-neutral-900">Warianty cenowe</p>
            <p className="shrink-0 text-xs font-medium text-neutral-600">
              {[fromLabel, optionsLabel(group.options.length)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <ul className="divide-y divide-neutral-100">{optionRows(visible)}</ul>
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="w-full border-t border-neutral-100 bg-neutral-50 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 hover:text-emerald-800"
            >
              Pokaż wszystkie opcje ({group.options.length}) ↓
            </button>
          )}
        </div>
      </div>
      {expanded && group.options.length > VISIBLE_OPTIONS_DEFAULT && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full border-t border-neutral-100 bg-neutral-50 px-5 py-2.5 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100"
        >
          Zwiń ↑
        </button>
      )}

      {/* Modal montujemy dopiero po pierwszym otwarciu — dla hotelu z 25
          pokojami trzymanie 25 uśpionych dialogów w drzewie to czysty koszt. */}
      {detailOpen && (
        <RoomDetailDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          title={displayName}
          room={room}
          fallbackMaxOccupancy={group.maxOccupancy ?? undefined}
          options={optionRows(group.options)}
        />
      )}
    </article>
  );
}

function OptionRow({
  hotelId,
  option,
  searchQuery,
  nights,
  currency,
  bookingLive,
  cancelPremiumMinor,
  isGroupCheapest,
  groupHasMultiple,
}: {
  hotelId: string;
  option: RoomOption;
  searchQuery: string;
  nights: number;
  currency: string;
  bookingLive: boolean;
  /** Dopłata (grosze) za bezpłatne anulowanie vs najtańsza bezzwrotna o tym samym wyżywieniu; null = nie pokazuj. */
  cancelPremiumMinor: bigint | null;
  /** Czy to najtańsza opcja w tej grupie (do etykiety „· najniższa cena"). */
  isGroupCheapest: boolean;
  /** Czy grupa ma >1 opcję (etykieta „najniższa cena" ma sens tylko wtedy). */
  groupHasMultiple: boolean;
}) {
  const { rate } = option;
  const total = option.totalMinor !== null ? fromMinor(option.totalMinor) : null;
  const perNight = total !== null && nights > 0 ? Math.round(total / nights) : null;
  const cancelDate = formatDate(option.cancellationDeadline);
  const rateCurrency = rate.retailRate?.total?.[0]?.currency ?? currency;
  // Pełne rozbicie jest tu dostępne (strona hotelu ma surowe taryfy), więc
  // korzystamy z niego wprost — bez uproszczenia stosowanego na liście.
  const taxText = taxNoticeText(taxNoticeFrom(mapTaxes(rate)));
  const discount = honestDiscountFrom(rate);

  // Checkout link — identical contract as before grouping: the option's OWN
  // offerId + display params (price/cur/board/cancel) on top of searchQuery.
  const params = new URLSearchParams(searchQuery);
  params.set("hotelId", hotelId);
  params.set("offerId", option.offerId);
  if (total !== null) params.set("price", String(Math.round(total)));
  params.set("cur", rateCurrency);
  const boardLabel = rate.boardName ?? rate.boardType ?? "";
  if (boardLabel) params.set("board", boardLabel);
  params.set("cancel", option.freeCancellation ? "free" : "nrf");
  if (option.freeCancellation && option.cancellationDeadline) {
    params.set("cancelUntil", option.cancellationDeadline);
  }
  const reservationHref = `/hotele/rezerwacja?${params.toString()}`;

  return (
    // TRZY SEKCJE (brief §25): oferta | cena | akcja.
    //
    // `justify-between` na całej szerokości rozpychało „Bez wyżywienia" i cenę
    // na przeciwległe krawędzie, zostawiając między nimi metr pustki. Siatka
    // o stałych kolumnach po prawej trzyma cenę i przycisk zawsze w tym samym
    // miejscu — wzrok nie musi ich szukać przy każdym wierszu.
    <li className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:p-5 lg:grid-cols-[minmax(0,1fr)_11rem_10rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-neutral-900">
            {localizeBoard(rate.boardName ?? rate.boardType)}
          </span>
          {option.cheapestOfHotel && (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
              Najtańsza opcja
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-col gap-0.5 text-xs">
          {option.freeCancellation ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
              <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M8.05 13.6 4.4 9.95l1.4-1.4 2.25 2.25 6.15-6.15 1.4 1.4z" />
              </svg>
              Bezpłatne anulowanie{cancelDate ? ` do ${cancelDate}` : ""}
            </span>
          ) : (
            <span className="text-neutral-500">
              Bezzwrotna{isGroupCheapest && groupHasMultiple ? " · najniższa cena" : ""}
            </span>
          )}
          {cancelPremiumMinor !== null && (
            <span className="text-[11px] text-neutral-600">
              +{formatPLN(fromMinor(cancelPremiumMinor), rateCurrency)} za możliwość anulowania
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-start sm:items-end lg:text-right">
        {total !== null ? (
          <>
            {/* Przecena (brief §15C) — wyłącznie z `initialPrice` TEJ taryfy.
                Cena konkurenta (`suggestedSellingPrice`) nigdy tu nie trafia. */}
            {discount && (
              <div className="mb-0.5 flex items-center gap-2">
                <span className="rounded-md bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                  −{discount.percent}%
                </span>
                <span className="text-xs text-neutral-500 line-through">
                  {formatPLN(fromMinor(discount.originalMinor), rateCurrency)}
                </span>
              </div>
            )}
            <div className="text-lg font-bold text-neutral-900">{formatPLN(total, rateCurrency)}</div>
            {perNight !== null && (
              <div className="text-[11px] text-neutral-500">{formatPLN(perNight, rateCurrency)} / noc</div>
            )}
            {/* Etykieta podatkowa wynika z `taxesAndFees` tej konkretnej taryfy.
                Dawne bezwarunkowe „wł. podatków" było nieprawdą dla ~52% ofert
                (209/400 pozycji ma `included: false` — gość dopłaca w hotelu). */}
            {taxText && <div className="text-[11px] text-neutral-500">{taxText}</div>}
          </>
        ) : (
          <div className="text-sm text-neutral-500">Cena u dostawcy</div>
        )}
      </div>

      {/* Akcja w OSOBNEJ kolumnie — przycisk stoi w tej samej pionowej linii
          we wszystkich wierszach, niezależnie od długości opisu taryfy. */}
      <div className="sm:col-span-2 lg:col-span-1">
        {bookingLive ? (
          <Link
            href={reservationHref}
            // prefetch OFF (incydent 2026-07-19): każdy widok strony hotelu
            // prefetchował N linków taryf → N SSR-ów /hotele/rezerwacja
            // (26,7k renderów w 2 dni = top ścieżka serwisu) + wywołania
            // LiteAPI. Checkout ładuje się dopiero po realnym kliknięciu.
            prefetch={false}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            Wybierz
          </Link>
        ) : (
          <span
            aria-disabled="true"
            title="Rezerwacja online będzie dostępna wkrótce"
            className="inline-flex h-11 w-full cursor-not-allowed items-center justify-center rounded-lg bg-neutral-200 px-5 text-sm font-semibold text-neutral-500"
          >
            Wkrótce dostępne
          </span>
        )}
      </div>
    </li>
  );
}
