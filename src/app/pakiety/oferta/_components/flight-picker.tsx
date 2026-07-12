"use client";

// Krok 2 „Wybierz lot". Hotel już wybrany (z kroku 1, dane w URL); tu user
// dobiera lot z realnych alternatyw. Taby Najlepsze/Najtańsze/Najszybsze
// (reuse sortOffers z flights/filters), delty vs najtańszy przelot (nigdy cena
// absolutna — §2), bagaż, cena pakietu aktualizowana przy wyborze. CTA Fazy 1 =
// ROZDZIELONE „Zarezerwuj hotel / lot" (legalnie bezpieczne, mierzy intencję;
// płatność pakietowa = Faza 2 po domknięciu prawnym). Mobile-first.

import { useMemo, useState } from "react";

import { fmtDuration, fmtTime, stopsLabel, type DisplayLeg, type DisplayOffer } from "@/lib/flights/display";
import { sortOffers, type SortKey } from "@/lib/flights/filters";
import { formatPLN } from "@/lib/money";

import { isDirectOffer, selectBaseFlight } from "@/modules/packages/services/bestFlight";

interface HotelCtx {
  id: string;
  name: string;
  pricePln: number;
  nights: number;
  stars?: number;
  board?: string;
  freeCancelUntil?: string;
}

const TABS: { key: SortKey; label: string }[] = [
  { key: "best", label: "Najlepsze" },
  { key: "price", label: "Najtańsze" },
  { key: "duration", label: "Najszybsze" },
];

function nightsLabel(n: number): string {
  if (n === 1) return "1 noc";
  if (n >= 2 && n <= 4) return `${n} noce`;
  return `${n} nocy`;
}

function LegLine({ leg, label }: { leg: DisplayLeg; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-14 shrink-0 text-[11px] font-semibold text-emerald-800">{label}</span>
      <span className="font-bold tabular-nums text-neutral-900">{fmtTime(leg.departureTime)}</span>
      <span className="text-[10px] text-neutral-500">{leg.originCode}</span>
      <span className="flex min-w-0 flex-1 flex-col items-center px-1">
        <span className="text-[10px] leading-none text-neutral-500">{fmtDuration(leg.durationMinutes)}</span>
        <span className="my-1 h-px w-full bg-neutral-200" />
        <span className={`text-[10px] leading-none ${leg.stops === 0 ? "text-emerald-700" : "text-neutral-500"}`}>
          {leg.stops === 0 ? "bezpośredni" : stopsLabel(leg.stops)}
        </span>
      </span>
      <span className="font-bold tabular-nums text-neutral-900">{fmtTime(leg.arrivalTime)}</span>
      <span className="text-[10px] text-neutral-500">{leg.destinationCode}</span>
    </div>
  );
}

export function FlightPicker({
  offers,
  hotel,
  origin,
  destination,
  dateFrom,
  dateTo,
  adults,
}: {
  offers: DisplayOffer[];
  hotel: HotelCtx;
  origin: { label: string; codes: string[] };
  destination: { city: string; iata: string };
  dateFrom: string;
  dateTo: string;
  adults: number;
}) {
  // GDS zwraca dziesiątki taryf tego SAMEGO lotu (te same godziny, różna klasa).
  // Dedup po rozkładzie (godziny tam/powrót + przewoźnik) → 1 wiersz na realny
  // lot, z NAJTAŃSZĄ taryfą. Bez tego lista to setki bliźniaczych wierszy.
  const flights = useMemo(() => {
    const byKey = new Map<string, DisplayOffer>();
    for (const o of offers) {
      if (o.total === null) continue;
      const ob = o.legs.find((l) => l.direction === "OUTBOUND") ?? o.legs[0];
      const ib = o.legs.find((l) => l.direction === "INBOUND");
      const key = `${ob?.departureTime}|${ob?.arrivalTime}|${ib?.departureTime}|${ob?.carrierCode}`;
      const prev = byKey.get(key);
      if (!prev || (o.total ?? Infinity) < (prev.total ?? Infinity)) byKey.set(key, o);
    }
    return [...byKey.values()];
  }, [offers]);

  const VISIBLE_CAP = 40;
  const cheapestTotal = useMemo(
    () => flights.reduce((m, o) => Math.min(m, o.total ?? Infinity), Infinity),
    [flights],
  );
  const [sort, setSort] = useState<SortKey>("best");
  const [selectedId, setSelectedId] = useState<string>(() => selectBaseFlight(flights)?.offerId ?? flights[0]?.offerId ?? "");

  const sorted = useMemo(() => sortOffers(flights, sort).slice(0, VISIBLE_CAP), [flights, sort]);
  const selected = flights.find((o) => o.offerId === selectedId) ?? flights[0];

  const flightTotal = selected?.total ?? 0;
  const packageTotal = hotel.pricePln + flightTotal;
  const perPerson = Math.ceil(packageTotal / Math.max(1, adults));

  // CTA Fazy 1 — istniejące, żywe flow (osobne usługi).
  const hotelHref = `/hotele/${encodeURIComponent(hotel.id)}?${new URLSearchParams({
    checkin: dateFrom,
    checkout: dateTo,
    adults: String(adults),
    rooms: "1",
  }).toString()}`;
  const flightHref = `/loty/wyniki?${new URLSearchParams({
    origin: origin.codes.join(","),
    destination: destination.iata,
    depart: dateFrom,
    return: dateTo,
    adults: String(adults),
    ...(origin.label ? { originLabel: origin.label } : {}),
    destLabel: destination.city,
  }).toString()}`;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      {/* Nagłówek: wybrany hotel */}
      <div className="mb-4">
        <a href="/pakiety/szukaj" className="text-xs font-medium text-emerald-700 hover:text-emerald-800">
          ← Wróć do pakietów
        </a>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">Wybierz lot</h1>
      </div>

      <div className="mb-5 rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-[0_4px_16px_rgba(16,84,48,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Twój hotel</div>
            <div className="truncate text-base font-semibold text-neutral-900">{hotel.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500">
              {hotel.stars ? <span className="text-amber-500">{"★".repeat(Math.round(hotel.stars))}</span> : null}
              <span>{destination.city}</span>
              <span aria-hidden>·</span>
              <span>{nightsLabel(hotel.nights)}</span>
              {hotel.board ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{hotel.board}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] text-neutral-500">Hotel</div>
            <div className="text-sm font-bold text-emerald-700">{formatPLN(hotel.pricePln)}</div>
          </div>
        </div>
      </div>

      {/* Taby sortowania lotów */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto">
        <div role="tablist" aria-label="Sortowanie lotów" className="flex gap-1 rounded-full bg-neutral-100 p-1">
          {TABS.map((t) => {
            const active = sort === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSort(t.key)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active ? "bg-white text-emerald-800 shadow-sm" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <span className="ml-auto shrink-0 text-xs text-neutral-500">{flights.length} lotów</span>
      </div>

      {/* Lista lotów */}
      <ol className="flex flex-col gap-3 pb-40">
        {sorted.map((offer) => {
          const active = offer.offerId === selectedId;
          const delta = (offer.total ?? 0) - cheapestTotal;
          const outbound = offer.legs.find((l) => l.direction === "OUTBOUND") ?? offer.legs[0];
          const inbound = offer.legs.find((l) => l.direction === "INBOUND");
          return (
            <li key={offer.offerId}>
              <button
                type="button"
                onClick={() => setSelectedId(offer.offerId)}
                aria-pressed={active}
                className={`w-full rounded-2xl border bg-white p-4 text-left transition-[border-color,box-shadow] ${
                  active
                    ? "border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.6),0_8px_24px_rgba(16,84,48,0.10)]"
                    : "border-emerald-900/10 hover:border-emerald-300 shadow-[0_4px_16px_rgba(16,84,48,0.06)]"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-medium text-neutral-600">
                    <span
                      aria-hidden
                      className={`grid h-4 w-4 place-items-center rounded-full border ${active ? "border-emerald-600 bg-emerald-600" : "border-neutral-300"}`}
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    {offer.legs[0]?.carriers?.[0] ?? "Przewoźnik"}
                    {isDirectOffer(offer) && <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">bezpośredni</span>}
                  </span>
                  <span className={`text-sm font-bold ${delta === 0 ? "text-emerald-700" : "text-neutral-900"}`}>
                    {delta === 0 ? "+0 zł" : `+${formatPLN(delta)}`}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {outbound && <LegLine leg={outbound} label="Tam" />}
                  {inbound && <LegLine leg={inbound} label="Powrót" />}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-neutral-100 pt-2 text-[11px] font-medium">
                  <span className={offer.hasCarryOnBag ? "text-emerald-800" : "text-neutral-400"}>
                    {offer.hasCarryOnBag ? "✓" : "✕"} Bagaż podręczny
                  </span>
                  <span className={offer.hasCheckedBag ? "text-emerald-800" : "text-neutral-400"}>
                    {offer.hasCheckedBag ? "✓" : "✕"} Bagaż rejestrowany
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Sticky podsumowanie pakietu + CTA (Faza 1: rozdzielone rezerwacje) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-emerald-900/10 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Pakiet od osoby</div>
            <div className="text-xl font-bold leading-tight text-emerald-700">
              {formatPLN(perPerson)}
              <span className="ml-1 text-xs font-semibold text-emerald-700/80">/ os.</span>
            </div>
            <div className="text-[11px] text-neutral-500">
              {formatPLN(packageTotal)} łącznie · hotel {formatPLN(hotel.pricePln)} + lot {formatPLN(flightTotal)}
            </div>
          </div>
          <div className="flex flex-1 gap-2 sm:justify-end">
            <a
              href={hotelHref}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-emerald-600 bg-white px-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 sm:flex-none"
            >
              Zarezerwuj hotel
            </a>
            <a
              href={flightHref}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 sm:flex-none"
            >
              Zarezerwuj lot
            </a>
          </div>
        </div>
        <p className="mx-auto max-w-3xl px-4 pb-2 text-[10px] leading-tight text-neutral-500">
          Hotel i lot rezerwujesz jako dwie osobne usługi. Ceny w PLN, re-weryfikowane przy rezerwacji.
        </p>
      </div>
    </div>
  );
}
