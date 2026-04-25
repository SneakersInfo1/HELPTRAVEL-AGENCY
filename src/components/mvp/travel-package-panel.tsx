"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { buildRedirectHref } from "@/lib/mvp/providers";
import type { FlightSearchResponse, NormalizedFlightOffer, NormalizedStayOffer, StaySearchResponse, TravelPackageOffer } from "@/lib/mvp/types";

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

function defaultDepartureDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

function addNights(value: string, nights: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  date.setDate(date.getDate() + Math.max(1, nights));
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "short" }).format(date);
}

function Spinner() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />;
}

function combinePackages(flights: NormalizedFlightOffer[], stays: NormalizedStayOffer[]): TravelPackageOffer[] {
  const flightPool = flights.slice(0, 8);
  const stayPool = stays.slice(0, 8);
  const packages: TravelPackageOffer[] = [];

  for (const flight of flightPool) {
    for (const stay of stayPool) {
      const sameCurrency = flight.currency === stay.currency;
      packages.push({
        packageId: `${flight.offerId}-${stay.searchResultId}`,
        title: `${flight.airline} + ${stay.name}`,
        flight,
        stay,
        combined: sameCurrency,
        totalAmount: sameCurrency ? flight.total_amount + stay.total_amount : undefined,
        currency: sameCurrency ? flight.currency : undefined,
        description: sameCurrency
          ? "Lot i hotel w jednej walucie. To realny pakiet, który można porównać jednym rzutem oka."
          : "Obie ceny sa realne, ale występują w różnych walutach. Pokazujemy je osobno, żeby nie zafałszować sumy.",
      });
    }
  }

  return packages
    .sort((a, b) => {
      if (a.combined && b.combined) return (a.totalAmount ?? 0) - (b.totalAmount ?? 0);
      if (a.combined) return -1;
      if (b.combined) return 1;
      return a.flight.total_amount + a.stay.total_amount - (b.flight.total_amount + b.stay.total_amount);
    })
    .slice(0, 6);
}

export function TravelPackagePanel(props: {
  destinationCity: string;
  destinationCountry: string;
  destinationImage?: string;
  defaultOriginCity?: string;
  defaultPassengers?: number;
}) {
  const [originCity, setOriginCity] = useState(props.defaultOriginCity ?? "Warszawa");
  const [departureDate, setDepartureDate] = useState(defaultDepartureDate());
  const [nights, setNights] = useState(4);
  const [passengers, setPassengers] = useState(props.defaultPassengers ?? 2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [flights, setFlights] = useState<FlightSearchResponse | null>(null);
  const [stays, setStays] = useState<StaySearchResponse | null>(null);

  useEffect(() => {
    if (!props.destinationCity) return;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      const run = async () => {
        setLoading(true);
        setError("");
        try {
          const [flightResult, stayResult] = await Promise.all([
            postJson<FlightSearchResponse>("/api/flights/search", {
              origin: originCity,
              destination: props.destinationCity,
              departureDate,
              passengers,
              cabinClass: "economy",
              sortBy: "cheap",
            }),
            postJson<StaySearchResponse>("/api/stays/search", {
              city: props.destinationCity,
              country: props.destinationCountry,
              checkInDate: departureDate,
              nights,
              guests: passengers,
              rooms: 1,
              sortBy: "value",
            }),
          ]);

          if (!cancelled) {
            setFlights(flightResult);
            setStays(stayResult);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Nie udalo sie pobrac pakietow.");
            setFlights(null);
            setStays(null);
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
  }, [props.destinationCity, props.destinationCountry, originCity, departureDate, nights, passengers]);

  const packages = useMemo(() => {
    if (!flights?.offers?.length || !stays?.offers?.length) return [];
    return combinePackages(flights.offers, stays.offers);
  }, [flights?.offers, stays?.offers]);

  return (
    <section className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Pakiety lot + hotel</p>
          <h3 className="mt-2 text-2xl font-bold text-emerald-950">
            Kompletny wyjazd do {props.destinationCity}, {props.destinationCountry}
          </h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900/72">
            Łączymy realne loty z dostępnym dostawcą noclegów. Jeśli waluty się zgadzają, pokazujemy też realną sumę pakietu.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {loading ? <Spinner /> : null}
          {loading ? "Liczenie pakietów" : packages.length ? `${packages.length} realnych zestawów` : "Gotowe do odświeżenia"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
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
          Wylot
          <input
            type="date"
            value={departureDate}
            onChange={(event) => setDepartureDate(event.target.value)}
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
      </div>

      {error ? <div className="mt-4 rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-5 grid gap-4">
        {loading ? (
          Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/50 p-4">
              <div className="h-5 w-52 rounded-full bg-emerald-100" />
              <div className="mt-3 h-40 rounded-[1.25rem] bg-emerald-100" />
            </div>
          ))
        ) : packages.length ? (
          packages.map((pkg) => (
            <article key={pkg.packageId} className="overflow-hidden rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/70">
              <div className="grid gap-0 lg:grid-cols-[220px_1fr]">
                <div className="relative h-48 lg:h-full">
                  <Image
                    src={props.destinationImage ?? pkg.stay.imageUrl ?? "https://images.unsplash.com/photo-1502920917128-1aa500764b3a?auto=format&fit=crop&w=1200&q=80"}
                    alt={pkg.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 220px"
                  />
                </div>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Prawdziwy pakiet</p>
                      <h4 className="mt-1 text-lg font-bold text-emerald-950">{pkg.title}</h4>
                      <p className="mt-1 text-sm text-emerald-900/72">{pkg.description}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Suma</p>
                      <p className="mt-1 text-lg font-bold text-emerald-950">
                        {pkg.combined && pkg.currency && pkg.totalAmount ? formatMoney(pkg.totalAmount, pkg.currency) : "Różne waluty"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Lot</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-950">
                        {pkg.flight.airline} · {formatMoney(pkg.flight.total_amount, pkg.flight.currency)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Hotel</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-950">
                        {pkg.stay.name} · {formatMoney(pkg.stay.total_amount, pkg.stay.currency)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Wylot</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-950">{formatDate(pkg.flight.departure_time)}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Check-in</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-950">
                        {formatDate(departureDate)} - {formatDate(addNights(departureDate, nights))}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-emerald-900/80">
                    {pkg.combined
                      ? "To realny zestaw, w którym obie ceny są w tej samej walucie i można od razu porównać pełny koszt wyjazdu."
                      : "To realny zestaw, ale waluty się różnią. Pokazujemy ceny osobno, żeby nie fałszować sumy."}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {pkg.flight.bookingUrl ? (
                      <a
                        href={buildRedirectHref({
                          providerKey: "flights",
                          targetUrl: pkg.flight.bookingUrl,
                          city: props.destinationCity,
                          country: props.destinationCountry,
                          source: "package_panel",
                        })}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"
                      >
                        Zobacz lot
                      </a>
                    ) : null}
                    {pkg.stay.bookingUrl ? (
                      <a
                        href={buildRedirectHref({
                          providerKey: "stays",
                          targetUrl: pkg.stay.bookingUrl,
                          city: props.destinationCity,
                          country: props.destinationCountry,
                          source: "package_panel",
                        })}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full border border-emerald-900/12 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
                      >
                        Zobacz hotel
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-emerald-900/12 bg-emerald-50/60 px-4 py-6 text-sm text-emerald-900/70">
            Pakiety pojawią się po załadowaniu realnych lotów i noclegów dla tego kierunku.
          </div>
        )}
      </div>

      <p className="mt-4 text-xs leading-6 text-emerald-900/60">
        {flights?.offers?.length ? `${flights.offers.length} realnych ofert lotów` : "Loty jeszcze się ładują."} ·{" "}
        {stays?.offers?.length ? `${stays.offers.length} realnych ofert noclegów` : "Noclegi jeszcze się ładują."} · Pakiety liczymy tylko z aktualnych feedów.
      </p>
    </section>
  );
}

