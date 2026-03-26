"use client";

import { useEffect, useState } from "react";

import { buildRedirectHref } from "@/lib/mvp/providers";
import type { CabinClass, FlightSearchResponse, FlightSortMode } from "@/lib/mvp/types";

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
      throw new Error(payload?.error ?? `Zapytanie nie powiodło się (${response.status}).`);
    }
    return (await response.json()) as T;
  });
}

function formatDate(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function defaultDepartureDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function Spinner() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />;
}

export function FlightOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  defaultOriginCity?: string;
  passengers?: number;
}) {
  const [originCity, setOriginCity] = useState(props.defaultOriginCity ?? "Warszawa");
  const [departureDate, setDepartureDate] = useState(defaultDepartureDate());
  const [passengers, setPassengers] = useState(props.passengers ?? 2);
  const [cabinClass, setCabinClass] = useState<CabinClass>("economy");
  const [sortBy, setSortBy] = useState<FlightSortMode>("cheap");
  const [searchTick, setSearchTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<FlightSearchResponse | null>(null);

  useEffect(() => {
    setOriginCity(props.defaultOriginCity ?? "Warszawa");
  }, [props.defaultOriginCity]);

  useEffect(() => {
    setPassengers(props.passengers ?? 2);
  }, [props.passengers]);

  useEffect(() => {
    if (!props.destinationCity) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await postJson<FlightSearchResponse>("/api/flights/search", {
          origin: originCity,
          destination: props.destinationCity,
          departureDate,
          passengers,
          cabinClass,
          sortBy,
        });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Nie udało się pobrać lotów.");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [props.destinationCity, originCity, departureDate, passengers, cabinClass, sortBy, searchTick]);

  const displayedOffers = data?.offers?.slice(0, 50) ?? [];

  return (
    <section className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Realne loty</p>
          <h3 className="mt-2 text-2xl font-bold text-emerald-950">
            Oferty do {props.destinationCity}, {props.destinationCountry}
          </h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900/72">
            Pobrane z Duffel w czasie rzeczywistym. Możesz zmieniać sortowanie i parametry wyjazdu.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {loading ? <Spinner /> : null}
          {loading
            ? "Odświeżanie wyników"
            : data
              ? `Aktualizacja ${new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit" }).format(new Date(data.fetchedAt))}`
              : "Gotowe do wyszukiwania"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Skąd lecisz
          <input
            value={originCity}
            onChange={(event) => setOriginCity(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
            placeholder="np. Warszawa"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Data wylotu
          <input
            type="date"
            value={departureDate}
            onChange={(event) => setDepartureDate(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Pasażerowie
          <input
            type="number"
            min={1}
            max={8}
            value={passengers}
            onChange={(event) => setPassengers(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Klasa podróży
          <select
            value={cabinClass}
            onChange={(event) => setCabinClass(event.target.value as CabinClass)}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          >
            <option value="economy">Ekonomiczna</option>
            <option value="premium_economy">Premium economy</option>
            <option value="business">Biznes</option>
            <option value="first">Pierwsza</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {([
          ["cheap", "Najtańsze"],
          ["balance", "Balans cena / czas"],
          ["direct", "Najmniej przesiadek"],
        ] as Array<[FlightSortMode, string]>).map(([key, label]) => (
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
          onClick={() => setSearchTick((value) => value + 1)}
          className="rounded-full border border-emerald-900/12 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
        >
          Szukaj lotów
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mt-5 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/50 p-4">
              <div className="h-5 w-40 rounded-full bg-emerald-100" />
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="h-10 rounded-2xl bg-emerald-100" />
                <div className="h-10 rounded-2xl bg-emerald-100" />
                <div className="h-10 rounded-2xl bg-emerald-100" />
              </div>
            </div>
          ))
        ) : displayedOffers.length ? (
          displayedOffers.map((offer, index) => (
            <article key={offer.offerId} className="rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Pozycja #{index + 1}</p>
                  <h4 className="mt-1 text-lg font-bold text-emerald-950">{offer.airline}</h4>
                  <p className="mt-1 text-sm text-emerald-900/72">
                    {props.destinationCity} · {offer.origin} → {offer.destination}
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Cena całkowita</p>
                  <p className="mt-1 text-lg font-bold text-emerald-950">{formatMoney(offer.total_amount, offer.currency)}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-white px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Wylot</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-950">{formatDate(offer.departure_time)}</p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Przylot</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-950">{formatDate(offer.arrival_time)}</p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Czas</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-950">{offer.total_duration || "Brak danych"}</p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Przesiadki</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-950">
                    {offer.number_of_stops === 0 ? "Bez przesiadek" : `${offer.number_of_stops} przesiad${offer.number_of_stops === 1 ? "ka" : "ki"}`}
                  </p>
                </div>
              </div>

              {offer.bookingUrl ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={buildRedirectHref({
                      providerKey: "flights",
                      targetUrl: offer.bookingUrl,
                      city: props.destinationCity,
                      country: props.destinationCountry,
                      source: "flight_panel",
                      query: `${originCity} ${props.destinationCity} ${departureDate}`,
                    })}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"
                  >
                    Zobacz ofertę
                  </a>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-emerald-900/12 bg-emerald-50/60 px-4 py-6 text-sm text-emerald-900/70">
            Brak wyników lotów dla tego kierunku. Spróbuj zmienić datę, klasę podróży albo punkt wylotu.
          </div>
        )}
      </div>

      {data?.offers?.length ? (
        <p className="mt-3 text-xs leading-6 text-emerald-900/60">
          Pokazano {Math.min(50, data.offers.length)} z {data.offers.length} realnych ofert lotów.
        </p>
      ) : null}
    </section>
  );
}
