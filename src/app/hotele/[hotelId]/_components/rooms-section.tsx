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

import Link from "next/link";
import { useMemo, useState } from "react";

import type { LiteApiRoomType } from "@/lib/liteapi";
import { groupRates, mergeGroupsByDisplayName, type RoomGroup, type RoomOption } from "@/lib/hotels/group-rates";
import { localizeBoard, localizeRoomName } from "@/lib/liteapi/translations";
import { formatPLN, fromMinor } from "@/lib/money";

const VISIBLE_OPTIONS_DEFAULT = 3;

interface Props {
  hotelId: string;
  roomTypes: LiteApiRoomType[];
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

const optionsNoun = (n: number): string =>
  n === 1 ? "opcja" : n < 5 ? "opcje" : "opcji";

export function RoomsSection({
  hotelId,
  roomTypes,
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
          searchQuery={searchQuery}
          nights={nights}
          currency={currency}
          bookingLive={bookingLive}
        />
      ))}
    </section>
  );
}

function RoomGroupCard({
  hotelId,
  group,
  searchQuery,
  nights,
  currency,
  bookingLive,
}: {
  hotelId: string;
  group: RoomGroup;
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

  return (
    <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-neutral-100 bg-neutral-50 px-5 py-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-neutral-900">{localizeRoomName(group.name)}</h3>
          {typeof group.maxOccupancy === "number" && group.maxOccupancy > 0 && (
            <p className="mt-0.5 text-xs text-neutral-500">Maks. gości: {group.maxOccupancy}</p>
          )}
        </div>
        <p className="shrink-0 text-xs font-medium text-neutral-600">
          {[fromLabel, `${group.options.length} ${optionsNoun(group.options.length)}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>
      <ul className="divide-y divide-neutral-100">
        {visible.map((option) => (
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
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full border-t border-neutral-100 bg-neutral-50 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 hover:text-emerald-800"
        >
          Pokaż wszystkie opcje ({group.options.length}) ↓
        </button>
      )}
      {expanded && group.options.length > VISIBLE_OPTIONS_DEFAULT && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="w-full border-t border-neutral-100 bg-neutral-50 px-5 py-2.5 text-sm font-semibold text-neutral-600 transition hover:bg-neutral-100"
        >
          Zwiń ↑
        </button>
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
    <li className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
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
            <span className="text-[11px] text-neutral-400">
              +{formatPLN(fromMinor(cancelPremiumMinor), rateCurrency)} za możliwość anulowania
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end">
        {total !== null ? (
          <>
            <div className="text-lg font-bold text-neutral-900">{formatPLN(total, rateCurrency)}</div>
            {perNight !== null && (
              <div className="text-[11px] text-neutral-500">
                {formatPLN(perNight, rateCurrency)} / noc · wł. podatków
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-neutral-500">Cena u dostawcy</div>
        )}
        {bookingLive ? (
          <Link
            href={reservationHref}
            className="mt-2 inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Wybierz
          </Link>
        ) : (
          <span
            aria-disabled="true"
            title="Rezerwacja online będzie dostępna wkrótce"
            className="mt-2 inline-flex h-10 cursor-not-allowed items-center justify-center rounded-lg bg-neutral-200 px-5 text-sm font-semibold text-neutral-500"
          >
            Wkrótce dostępne
          </span>
        )}
      </div>
    </li>
  );
}
