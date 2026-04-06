"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { buildCjStayLinks } from "@/lib/mvp/cj-stays";
import { buildRedirectHref } from "@/lib/mvp/providers";
import { addDaysToIsoDate, formatShortDate } from "@/lib/mvp/travel-dates";
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

function Spinner() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />;
}

export function StayOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  checkInDate: string;
  nights: number;
  guests: number;
  rooms: number;
}) {
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
            checkInDate: props.checkInDate,
            nights: props.nights,
            guests: props.guests,
            rooms: props.rooms,
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
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [props.checkInDate, props.destinationCity, props.destinationCountry, props.guests, props.nights, props.rooms, sortBy]);

  const displayedOffers = useMemo(() => data?.offers.slice(0, visibleCount) ?? [], [data?.offers, visibleCount]);
  const topOffer = displayedOffers[0] ?? null;
  const remainingOffers = topOffer ? displayedOffers.slice(1) : displayedOffers;
  const checkOutDate = useMemo(() => addDaysToIsoDate(props.checkInDate, props.nights), [props.checkInDate, props.nights]);

  const partnerLinks = useMemo(
    () =>
      buildCjStayLinks(props.destinationCity, props.destinationCountry, {
        checkIn: props.checkInDate,
        checkOut: checkOutDate,
        adults: props.guests,
        rooms: props.rooms,
      }),
    [checkOutDate, props.checkInDate, props.destinationCity, props.destinationCountry, props.guests, props.rooms],
  );

  const partnerButtons = useMemo(
    () =>
      partnerLinks
        ? [
            {
              eyebrow: "Hotele",
              label: getAffiliateBrandLabel(partnerLinks.hotels, "Hotels.com"),
              href: buildRedirectHref({
                providerKey: "stays",
                targetUrl: partnerLinks.hotels,
                city: props.destinationCity,
                country: props.destinationCountry,
                source: "stay_panel_hotels",
              }),
            },
            {
              eyebrow: "Porownaj tez",
              label: getAffiliateBrandLabel(partnerLinks.expedia, "Expedia"),
              href: buildRedirectHref({
                providerKey: "stays",
                targetUrl: partnerLinks.expedia,
                city: props.destinationCity,
                country: props.destinationCountry,
                source: "stay_panel_expedia",
              }),
            },
            {
              eyebrow: "Apartamenty",
              label: getAffiliateBrandLabel(partnerLinks.vrbo, "Vrbo"),
              href: buildRedirectHref({
                providerKey: "stays",
                targetUrl: partnerLinks.vrbo,
                city: props.destinationCity,
                country: props.destinationCountry,
                source: "stay_panel_vrbo",
              }),
            },
          ]
        : [],
    [partnerLinks, props.destinationCity, props.destinationCountry],
  );

  return (
    <section className="rounded-[1.9rem] border border-emerald-500/18 bg-[linear-gradient(180deg,rgba(247,252,249,0.98),rgba(235,247,239,0.96))] p-5 shadow-[0_18px_50px_rgba(16,84,48,0.08)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Pobyt</p>
          <h3 className="mt-2 text-3xl font-bold text-emerald-950">Tutaj zaczyna sie booking flow dla {props.destinationCity}</h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900/76">
            Najpierw top pobyt, potem porownanie partnerow i reszta ofert dla tego samego terminu.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm ring-1 ring-emerald-900/8">
          {loading ? <Spinner /> : null}
          {loading ? "Szukamy dostepnosci" : data ? `${data.offers.length} ofert` : "Gotowe"}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Termin</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">
            {formatShortDate(props.checkInDate)} - {formatShortDate(checkOutDate)}
          </p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Podrozni</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">{props.guests} os.</p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Pokoje</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">{props.rooms}</p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Priorytet</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">Hotele najpierw</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["cheap", "Najtansze"],
            ["quality", "Najlepszy standard"],
            ["value", "Najlepsza relacja ceny do jakosci"],
          ] as Array<[StaySortMode, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSortBy(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition duration-200 ${
              sortBy === key ? "bg-emerald-700 text-white" : "bg-white text-emerald-950 ring-1 ring-emerald-900/10 hover:bg-emerald-50"
            }`}
          >
            {label}
          </button>
        ))}
        {displayedOffers.length >= 20 && displayedOffers.length < 50 ? (
          <button
            type="button"
            onClick={() => setVisibleCount((value) => Math.min(50, value + 12))}
            className="rounded-full border border-emerald-900/12 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
          >
            Pokaz wiecej
          </button>
        ) : null}
      </div>

      {partnerButtons.length ? (
        <div className="mt-4 rounded-[1.5rem] border border-emerald-900/10 bg-white/88 p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Porownanie partnerow</p>
          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {partnerButtons.map((partner) => (
              <a
                key={partner.label}
                href={partner.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-[1.2rem] border border-emerald-900/10 bg-emerald-950 px-4 py-3 text-white transition hover:-translate-y-0.5 hover:bg-emerald-900"
              >
                <span className="block text-[11px] uppercase tracking-[0.16em] text-emerald-200">{partner.eyebrow}</span>
                <span className="mt-1 block text-sm font-semibold">{partner.label}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-[1.5rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="mt-5 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-[1.5rem] border border-emerald-900/10 bg-white/88 p-4">
              <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
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
          <>
            {topOffer ? (
              <article className="overflow-hidden rounded-[1.75rem] border border-emerald-900/10 bg-white shadow-[0_16px_45px_rgba(16,84,48,0.08)]">
                <div className="grid gap-0 lg:grid-cols-[320px_1fr]">
                  <div className="relative h-72 lg:h-full">
                    <Image
                      src={topOffer.imageUrl ?? "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80"}
                      alt={topOffer.name}
                      fill
                      className="object-cover transition duration-500 hover:scale-105"
                      sizes="(max-width: 1024px) 100vw, 320px"
                    />
                    <div className="absolute left-4 top-4 rounded-full bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-950 shadow-sm">
                      Top pobyt
                    </div>
                  </div>

                  <div className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="max-w-2xl">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Najmocniejsza oferta na start</p>
                        <h4 className="mt-2 text-3xl font-bold text-emerald-950">{topOffer.name}</h4>
                        <p className="mt-2 text-sm text-emerald-900/72">{topOffer.address || topOffer.city}</p>
                      </div>
                      <div className="rounded-[1.4rem] bg-emerald-950 px-4 py-3 text-right text-white">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">Cena pobytu</p>
                        <p className="mt-1 text-2xl font-bold">{formatMoney(topOffer.total_amount, topOffer.currency)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Termin</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          {formatShortDate(props.checkInDate)} - {formatShortDate(checkOutDate)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Ocena</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          {topOffer.reviewScore
                            ? `${topOffer.reviewScore.toFixed(1)}/10`
                            : topOffer.rating
                              ? `${topOffer.rating.toFixed(1)} gw.`
                              : "Brak danych"}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Goscie</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">{props.guests} os.</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Pokoje</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">{props.rooms}</p>
                      </div>
                    </div>

                    {topOffer.description ? <p className="mt-4 text-sm leading-6 text-emerald-900/80">{topOffer.description}</p> : null}

                    <div className="mt-5 flex flex-wrap gap-2">
                      {topOffer.bookingUrl ? (
                        <a
                          href={buildRedirectHref({
                            providerKey: "stays",
                            targetUrl: topOffer.bookingUrl,
                            city: props.destinationCity,
                            country: props.destinationCountry,
                            source: "stay_panel_featured_offer",
                          })}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-emerald-800"
                        >
                          Zobacz ten pobyt
                        </a>
                      ) : null}
                      {partnerButtons[0] ? (
                        <a
                          href={partnerButtons[0].href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-full border border-emerald-900/12 bg-white px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:-translate-y-0.5 hover:bg-emerald-50"
                        >
                          Porownaj tez w {partnerButtons[0].label}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ) : null}

            {remainingOffers.map((offer, index) => (
              <article key={offer.searchResultId} className="overflow-hidden rounded-[1.5rem] border border-emerald-900/10 bg-white">
                <div className="grid gap-0 lg:grid-cols-[240px_1fr]">
                  <div className="relative h-52 lg:h-full">
                    <Image
                      src={offer.imageUrl ?? "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80"}
                      alt={offer.name}
                      fill
                      className="object-cover transition duration-500 hover:scale-105"
                      sizes="(max-width: 1024px) 100vw, 240px"
                    />
                  </div>

                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Pozycja #{index + 2}</p>
                        <h4 className="mt-1 text-lg font-bold text-emerald-950">{offer.name}</h4>
                        <p className="mt-1 text-sm text-emerald-900/72">{offer.address || offer.city}</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Cena pobytu</p>
                        <p className="mt-1 text-lg font-bold text-emerald-950">{formatMoney(offer.total_amount, offer.currency)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Pobyt</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          {formatShortDate(props.checkInDate)} - {formatShortDate(checkOutDate)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Ocena</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          {offer.reviewScore ? `${offer.reviewScore.toFixed(1)}/10` : offer.rating ? `${offer.rating.toFixed(1)} gw.` : "Brak danych"}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Goscie</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">{props.guests} os.</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Pokoje</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">{props.rooms}</p>
                      </div>
                    </div>

                    {offer.description ? <p className="mt-3 text-sm leading-6 text-emerald-900/80">{offer.description}</p> : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {offer.bookingUrl ? (
                        <a
                          href={buildRedirectHref({
                            providerKey: "stays",
                            targetUrl: offer.bookingUrl,
                            city: props.destinationCity,
                            country: props.destinationCountry,
                            source: "stay_panel_offer",
                          })}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"
                        >
                          Sprawdz pobyt
                        </a>
                      ) : null}
                      {partnerButtons[0] ? (
                        <a
                          href={partnerButtons[0].href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-full border border-emerald-900/12 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
                        >
                          Porownaj w {partnerButtons[0].label}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-emerald-900/12 bg-white/88 px-4 py-6 text-sm text-emerald-900/72">
            Nie znalezlismy dostepnych noclegow dla tego ukladu dat. Zmien termin albo otworz wyniki partnerow.
          </div>
        )}
      </div>
    </section>
  );
}
