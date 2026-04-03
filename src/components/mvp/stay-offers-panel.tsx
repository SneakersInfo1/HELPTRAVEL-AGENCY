"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { buildCjStayLinks } from "@/lib/mvp/cj-stays";
import { buildRedirectHref } from "@/lib/mvp/providers";
import type { StaySearchResponse, StaySortMode } from "@/lib/mvp/types";

function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then(async (response) => {
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Zapytanie nie powiodlo sie (${response.status}).`);
    }
    return (await response.json()) as T;
  });
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "short" }).format(date);
}

function defaultDepartureDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function addNights(dateValue: string, nights: number): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  date.setDate(date.getDate() + nights);
  return date.toISOString().slice(0, 10);
}

function Spinner() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />;
}

export function StayOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  defaultPassengers?: number;
}) {
  const [checkInDate, setCheckInDate] = useState(defaultDepartureDate());
  const [nights, setNights] = useState(4);
  const [guests, setGuests] = useState(props.defaultPassengers ?? 2);
  const [rooms, setRooms] = useState(1);
  const [sortBy, setSortBy] = useState<StaySortMode>("value");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<StaySearchResponse | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    if (!props.destinationCity) return;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      const run = async () => {
        setLoading(true);
        setError("");
        try {
          const result = await postJson<StaySearchResponse>("/api/stays/search", {
            city: props.destinationCity,
            country: props.destinationCountry,
            checkInDate,
            nights,
            guests,
            rooms,
            sortBy,
          });
          if (!cancelled) {
            setData(result);
            setVisibleCount(20);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Nie udalo sie pobrac noclegow.");
            setData(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      };

      void run();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [props.destinationCity, props.destinationCountry, checkInDate, nights, guests, rooms, sortBy]);

  const displayedOffers = useMemo(() => data?.offers.slice(0, visibleCount) ?? [], [data?.offers, visibleCount]);
  const fallbackPartnerLinks = useMemo(
    () =>
      buildCjStayLinks(props.destinationCity, props.destinationCountry, {
        checkIn: checkInDate,
        checkOut: addNights(checkInDate, nights),
        adults: guests,
        rooms,
      }),
    [checkInDate, guests, nights, props.destinationCity, props.destinationCountry, rooms],
  );
  const fallbackPartnerButtons = useMemo(
    () =>
      fallbackPartnerLinks
        ? [
            {
              label: getAffiliateBrandLabel(fallbackPartnerLinks.hotels, "Hotels.com"),
              href: buildRedirectHref({
                providerKey: "stays",
                targetUrl: fallbackPartnerLinks.hotels,
                city: props.destinationCity,
                country: props.destinationCountry,
                source: "stay_panel_hotels",
              }),
            },
            {
              label: getAffiliateBrandLabel(fallbackPartnerLinks.expedia, "Expedia"),
              href: buildRedirectHref({
                providerKey: "stays",
                targetUrl: fallbackPartnerLinks.expedia,
                city: props.destinationCity,
                country: props.destinationCountry,
                source: "stay_panel_expedia",
              }),
            },
            {
              label: getAffiliateBrandLabel(fallbackPartnerLinks.vrbo, "Vrbo"),
              href: buildRedirectHref({
                providerKey: "stays",
                targetUrl: fallbackPartnerLinks.vrbo,
                city: props.destinationCity,
                country: props.destinationCountry,
                source: "stay_panel_vrbo",
              }),
            },
          ]
        : [],
    [fallbackPartnerLinks, props.destinationCity, props.destinationCountry],
  );

  return (
    <section className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Noclegi</p>
          <h3 className="mt-2 text-2xl font-bold text-emerald-950">
            20 najlepiej dopasowanych hoteli w {props.destinationCity}, {props.destinationCountry}
          </h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900/72">
            Realne ceny z aktywnego dostawcy noclegów albo bezpieczny fallback, jeśli feed nie jest jeszcze dostępny.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {loading ? <Spinner /> : null}
          {loading
            ? "Odświeżanie noclegów"
            : data
              ? `Źródło: ${data.source === "duffel" ? "Duffel Stays" : data.source === "hotelbeds" ? "Hotelbeds" : "brak aktywnego feedu"}`
              : "Gotowe do wyszukiwania"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Check-in
          <input
            type="date"
            value={checkInDate}
            onChange={(event) => setCheckInDate(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Nocy
          <input
            type="number"
            min={1}
            max={30}
            value={nights}
            onChange={(event) => setNights(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Goście
          <input
            type="number"
            min={1}
            max={8}
            value={guests}
            onChange={(event) => setGuests(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Pokoje
          <input
            type="number"
            min={1}
            max={8}
            value={rooms}
            onChange={(event) => setRooms(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["cheap", "Najtańsze"],
            ["quality", "Najlepsza jakość"],
            ["value", "Najlepszy stosunek cena / jakość"],
          ] as Array<[StaySortMode, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSortBy(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition duration-200 ${
              sortBy === key ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setVisibleCount((value) => Math.min(50, value + 12))}
          className="rounded-full border border-emerald-900/12 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
        >
          Pokaż więcej
        </button>
      </div>

      {error ? <div className="mt-4 rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {fallbackPartnerButtons.length ? (
        <div className="mt-4 rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Szybkie przejscia partnerow</p>
          <p className="mt-2 text-sm leading-6 text-emerald-900/78">
            Dla top kierunkow system automatycznie buduje gotowe przejscia do wynikow w Hotels.com, Expedia i Vrbo dla wybranych dat i liczby gosci.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {fallbackPartnerButtons.map((partner) => (
              <a
                key={partner.label}
                href={partner.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-emerald-950 ring-1 ring-emerald-900/10 hover:bg-emerald-100"
              >
                Otworz w {partner.label}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/50 p-4">
              <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
                <div className="h-36 rounded-[1.25rem] bg-emerald-100" />
                <div className="space-y-3">
                  <div className="h-5 w-48 rounded-full bg-emerald-100" />
                  <div className="h-7 w-2/3 rounded-full bg-emerald-100" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="h-10 rounded-2xl bg-emerald-100" />
                    <div className="h-10 rounded-2xl bg-emerald-100" />
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : displayedOffers.length ? (
          displayedOffers.map((offer, index) => (
            <article key={offer.searchResultId} className="overflow-hidden rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/70">
              <div className="grid gap-0 lg:grid-cols-[220px_1fr]">
                <div className="relative h-48 lg:h-full">
                  <Image
                    src={offer.imageUrl ?? "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80"}
                    alt={offer.name}
                    fill
                    className="object-cover transition duration-500 hover:scale-105"
                    sizes="(max-width: 1024px) 100vw, 220px"
                  />
                </div>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Pozycja #{index + 1}</p>
                      <h4 className="mt-1 text-lg font-bold text-emerald-950">{offer.name}</h4>
                      <p className="mt-1 text-sm text-emerald-900/72">{offer.address || offer.city}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Cena pobytu</p>
                      <p className="mt-1 text-lg font-bold text-emerald-950">{formatMoney(offer.total_amount, offer.currency)}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Pobyt</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-950">
                        {formatDate(data?.checkInDate ?? checkInDate)} - {formatDate(data?.checkOutDate ?? addNights(checkInDate, nights))}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Ocena</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-950">
                        {offer.reviewScore ? `${offer.reviewScore.toFixed(1)}/10` : offer.rating ? `${offer.rating.toFixed(1)} gw.` : "Brak danych"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Goście</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-950">{guests} os.</p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Pokoje</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-950">{rooms}</p>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-emerald-900/80">
                    {data?.source === "duffel"
                      ? "Realna stawka z Duffel Stays."
                      : data?.source === "hotelbeds"
                        ? "Realna stawka z Hotelbeds."
                        : "W tej chwili nie ma aktywnego feedu noclegów dla tego kierunku."}
                  </p>

                  {offer.bookingUrl ? (
                    <div className="mt-4">
                      <a
                        href={buildRedirectHref({
                          providerKey: "stays",
                          targetUrl: offer.bookingUrl,
                          city: props.destinationCity,
                          country: props.destinationCountry,
                          source: "stay_panel",
                        })}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"
                      >
                        Zobacz nocleg
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-emerald-900/12 bg-emerald-50/60 px-4 py-6 text-sm text-emerald-900/70">
            Brak wyników noclegów dla tego kierunku. Spróbuj zmienić datę lub liczbę nocy.
          </div>
        )}
      </div>
    </section>
  );
}
