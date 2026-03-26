"use client";

import { useEffect, useMemo, useState } from "react";

import { buildRedirectHref } from "@/lib/mvp/providers";
import type { TransferSearchResponse } from "@/lib/mvp/types";

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

export function TransferOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  defaultPassengers?: number;
}) {
  const [outboundDate, setOutboundDate] = useState(defaultDepartureDate());
  const [departureHour, setDepartureHour] = useState("12:00");
  const [adults, setAdults] = useState(props.defaultPassengers ?? 2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<TransferSearchResponse | null>(null);

  useEffect(() => {
    if (!props.destinationCity) return;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      const run = async () => {
        setLoading(true);
        setError("");
        try {
          const result = await postJson<TransferSearchResponse>("/api/transfers/search", {
            city: props.destinationCity,
            country: props.destinationCountry,
            outboundDateTime: `${outboundDate}T${departureHour}:00`,
            adults,
            children,
            infants,
          });
          if (!cancelled) setData(result);
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Nie udało się pobrać transferów.");
            setData(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      };
      void run();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [props.destinationCity, props.destinationCountry, outboundDate, departureHour, adults, children, infants]);

  const displayedOffers = useMemo(() => data?.offers.slice(0, 50) ?? [], [data?.offers]);

  return (
    <section className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Transfery lotniskowe</p>
          <h3 className="mt-2 text-2xl font-bold text-emerald-950">
            Transfer do {props.destinationCity}, {props.destinationCountry}
          </h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900/72">
            Realne ceny transferów z Hotelbeds. To wygodny dodatek do lotu i noclegu.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {loading ? <Spinner /> : null}
          {loading ? "Odświeżanie transferów" : data ? `Źródło: ${data.source === "hotelbeds" ? "Hotelbeds" : "brak feedu"}` : "Gotowe do wyszukiwania"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-4">
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Data
          <input
            type="date"
            value={outboundDate}
            onChange={(event) => setOutboundDate(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Godzina
          <input
            type="time"
            value={departureHour}
            onChange={(event) => setDepartureHour(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Dorośli
          <input
            type="number"
            min={1}
            max={8}
            value={adults}
            onChange={(event) => setAdults(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Dzieci / niemowlęta
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              max={8}
              value={children}
              onChange={(event) => setChildren(Number(event.target.value))}
              className="w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
            />
            <input
              type="number"
              min={0}
              max={8}
              value={infants}
              onChange={(event) => setInfants(Number(event.target.value))}
              className="w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
            />
          </div>
        </label>
      </div>

      {error ? <div className="mt-4 rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-5 grid gap-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/50 p-4">
              <div className="h-5 w-48 rounded-full bg-emerald-100" />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="h-12 rounded-2xl bg-emerald-100" />
                <div className="h-12 rounded-2xl bg-emerald-100" />
              </div>
            </div>
          ))
        ) : displayedOffers.length ? (
          displayedOffers.map((offer, index) => (
            <article key={offer.transferId} className="rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Pozycja #{index + 1}</p>
                  <h4 className="mt-1 text-lg font-bold text-emerald-950">{offer.name}</h4>
                  <p className="mt-1 text-sm text-emerald-900/72">{offer.vehicle}</p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Cena</p>
                  <p className="mt-1 text-lg font-bold text-emerald-950">{formatMoney(offer.price, offer.currency)}</p>
                </div>
              </div>

              {offer.description ? <p className="mt-3 text-sm leading-6 text-emerald-900/80">{offer.description}</p> : null}
              {offer.duration ? <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{offer.duration}</p> : null}

              {offer.bookingUrl ? (
                <div className="mt-4">
                  <a
                    href={buildRedirectHref({
                      providerKey: "attractions",
                      targetUrl: offer.bookingUrl,
                      city: props.destinationCity,
                      country: props.destinationCountry,
                      source: "transfer_panel",
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
            Brak wyników transferów dla tego kierunku. Spróbuj zmienić datę.
          </div>
        )}
      </div>

      {data?.offers?.length ? (
        <p className="mt-3 text-xs leading-6 text-emerald-900/60">
          Pokazano {Math.min(50, data.offers.length)} z {data.offers.length} realnych ofert transferów.
        </p>
      ) : null}
    </section>
  );
}
