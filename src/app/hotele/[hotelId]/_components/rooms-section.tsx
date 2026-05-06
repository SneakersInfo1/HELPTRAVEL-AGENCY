// Rooms section — server component. Groups by roomType.offerId per master
// spec §5.3. Each rate row CTA links to /hotele/rezerwacja with offerId
// (NOT rateId — see FIXES_LOG.md prebook hotfix).

import Link from "next/link";

import type { LiteApiRate, LiteApiRoomType } from "@/lib/liteapi";
import { rateTotalMinor, isFreeCancellation, rateCancellationDeadline } from "@/lib/hotels/normalize";
import { fromMinor } from "@/lib/money";

interface Props {
  hotelId: string;
  roomTypes: LiteApiRoomType[];
  searchQuery: string;
  nights: number;
  currency: string;
}

const formatPLN = (amount: number, currency: string) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

const formatDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit" }).format(d);
};

const polishBoard = (raw?: string): string => {
  if (!raw) return "Bez wyżywienia";
  const r = raw.toLowerCase();
  if (r.includes("breakfast")) return "Ze śniadaniem";
  if (r.includes("all-inclusive") || r.includes("all_inclusive") || r.includes("ai")) return "All Inclusive";
  if (r.includes("half")) return "Wyżywienie HB (śniadanie + obiadokolacja)";
  if (r.includes("full")) return "Pełne wyżywienie (FB)";
  if (r.includes("room only") || r.includes("ro")) return "Bez wyżywienia";
  return raw;
};

export function RoomsSection({ hotelId, roomTypes, searchQuery, nights, currency }: Props) {
  if (!roomTypes.length) {
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
      {roomTypes.map((rt, i) => (
        <RoomTypeCard
          key={`${rt.offerId}-${i}`}
          hotelId={hotelId}
          roomType={rt}
          searchQuery={searchQuery}
          nights={nights}
          currency={currency}
        />
      ))}
    </section>
  );
}

function RoomTypeCard({
  hotelId,
  roomType,
  searchQuery,
  nights,
  currency,
}: {
  hotelId: string;
  roomType: LiteApiRoomType;
  searchQuery: string;
  nights: number;
  currency: string;
}) {
  const headerName = roomType.rates[0]?.name ?? "Pokój";
  return (
    <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <header className="border-b border-neutral-100 bg-neutral-50 px-5 py-3">
        <h3 className="text-base font-semibold text-neutral-900">{headerName}</h3>
      </header>
      <ul className="divide-y divide-neutral-100">
        {roomType.rates.map((rate, idx) => (
          <RateRow
            key={`${rate.rateId}-${idx}`}
            hotelId={hotelId}
            offerId={roomType.offerId}
            rate={rate}
            searchQuery={searchQuery}
            nights={nights}
            currency={currency}
          />
        ))}
      </ul>
    </article>
  );
}

function RateRow({
  hotelId,
  offerId,
  rate,
  searchQuery,
  nights,
  currency,
}: {
  hotelId: string;
  offerId: string;
  rate: LiteApiRate;
  searchQuery: string;
  nights: number;
  currency: string;
}) {
  const minor = rateTotalMinor(rate);
  const total = minor !== null ? fromMinor(minor) : null;
  const perNight = total !== null && nights > 0 ? Math.round(total / nights) : null;
  const free = isFreeCancellation(rate);
  const cancelDate = formatDate(rateCancellationDeadline(rate));
  const rateCurrency = rate.retailRate?.total?.[0]?.currency ?? currency;

  const params = new URLSearchParams(searchQuery);
  params.set("hotelId", hotelId);
  params.set("offerId", offerId);
  const reservationHref = `/hotele/rezerwacja?${params.toString()}`;

  return (
    <li className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-neutral-900">{polishBoard(rate.boardName ?? rate.boardType)}</div>
        <div className="mt-1 text-xs">
          {free ? (
            <span className="font-medium text-emerald-700">
              Bezpłatna anulacja{cancelDate ? ` do ${cancelDate}` : ""}
            </span>
          ) : (
            <span className="text-neutral-500">Bezzwrotne — najtańsza opcja</span>
          )}
        </div>
        {rate.maxOccupancy && (
          <div className="mt-1 text-xs text-neutral-500">
            Maks. gości: {rate.maxOccupancy}
          </div>
        )}
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
        <Link
          href={reservationHref}
          className="mt-2 inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Wybierz
        </Link>
      </div>
    </li>
  );
}
