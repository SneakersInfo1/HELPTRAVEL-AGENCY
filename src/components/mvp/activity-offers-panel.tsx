"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { buildRedirectHref } from "@/lib/mvp/providers";
import type { ActivitySearchResponse } from "@/lib/mvp/types";

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

function defaultDate(daysAhead = 30): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

function Spinner() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />;
}

export function ActivityOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  defaultTravelers?: number;
}) {
  const [fromDate, setFromDate] = useState(defaultDate(30));
  const [toDate, setToDate] = useState(defaultDate(34));
  const [travelers, setTravelers] = useState(props.defaultTravelers ?? 2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ActivitySearchResponse | null>(null);

  useEffect(() => {
    if (!props.destinationCity) return;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      const run = async () => {
        setLoading(true);
        setError("");
        try {
          const result = await postJson<ActivitySearchResponse>("/api/activities/search", {
            city: props.destinationCity,
            country: props.destinationCountry,
            fromDate,
            toDate,
            travelers,
          });
          if (!cancelled) setData(result);
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Nie udało się pobrać atrakcji.");
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
  }, [props.destinationCity, props.destinationCountry, fromDate, toDate, travelers]);

  const displayedOffers = useMemo(() => data?.offers.slice(0, 50) ?? [], [data?.offers]);

  return (
    <section className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Realne atrakcje</p>
          <h3 className="mt-2 text-2xl font-bold text-emerald-950">
            Atrakcje w {props.destinationCity}, {props.destinationCountry}
          </h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900/72">
            Ceny pobierane z Hotelbeds. Pokazujemy tylko realne oferty, bez zgadywania.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {loading ? <Spinner /> : null}
          {loading ? "Odświeżanie atrakcji" : data ? `Źródło: ${data.source === "hotelbeds" ? "Hotelbeds" : "brak feedu"}` : "Gotowe do wyszukiwania"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Od
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Do
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Liczba osób
          <input
            type="number"
            min={1}
            max={8}
            value={travelers}
            onChange={(event) => setTravelers(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
      </div>

      {error ? <div className="mt-4 rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-5 grid gap-3">
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
            <article key={offer.activityCode} className="overflow-hidden rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/70">
              <div className="grid gap-0 lg:grid-cols-[220px_1fr]">
                <div className="relative h-48 lg:h-full">
                  <Image
                    src={offer.imageUrl ?? "https://images.unsplash.com/photo-1505238680356-667803448bb6?auto=format&fit=crop&w=1200&q=80"}
                    alt={offer.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 220px"
                  />
                </div>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Pozycja #{index + 1}</p>
                      <h4 className="mt-1 text-lg font-bold text-emerald-950">{offer.name}</h4>
                      <p className="mt-1 text-sm text-emerald-900/72">{offer.category}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Cena</p>
                      <p className="mt-1 text-lg font-bold text-emerald-950">{formatMoney(offer.priceFrom, offer.currency)}</p>
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
                          source: "activity_panel",
                        })}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"
                      >
                        Zobacz ofertę
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-emerald-900/12 bg-emerald-50/60 px-4 py-6 text-sm text-emerald-900/70">
            Brak wyników atrakcji dla tego kierunku. Spróbuj zmienić zakres dat.
          </div>
        )}
      </div>

      {data?.offers?.length ? (
        <p className="mt-3 text-xs leading-6 text-emerald-900/60">
          Pokazano {Math.min(50, data.offers.length)} z {data.offers.length} realnych ofert atrakcji.
        </p>
      ) : null}
    </section>
  );
}
