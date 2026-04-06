"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { PartnerLogoMark } from "@/components/site/partner-logo";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { buildRedirectHref } from "@/lib/mvp/providers";
import { formatShortDate } from "@/lib/mvp/travel-dates";
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
      throw new Error(payload?.error ?? `Request failed (${response.status}).`);
    }
    return (await response.json()) as T;
  });
}

function formatMoney(value: number, currency: string, locale: "pl" | "en"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function Spinner() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />;
}

const copy = {
  pl: {
    requestError: "Nie udalo sie pobrac atrakcji.",
    eyebrow: "Atrakcje",
    title: "Co robic na miejscu",
    body: "Pokazujemy wybrane atrakcje dla tego samego terminu wyjazdu, zeby caly plan byl spojny od startu do konca.",
    loading: "Szukamy atrakcji",
    offers: "ofert",
    ready: "Gotowe",
    dates: "Zakres dat",
    travelers: "Podrozni",
    travelersShort: "os.",
    city: "Miasto",
    position: "Pozycja",
    price: "Cena",
    open: "Zobacz atrakcje",
    empty: "Na ten termin nie znalezlismy jeszcze atrakcji do pokazania. Zmien daty albo wroc za chwile.",
  },
  en: {
    requestError: "Could not load activities.",
    eyebrow: "Activities",
    title: "What to do on the ground",
    body: "We show curated activities for the same travel window so the entire plan stays coherent from start to finish.",
    loading: "Searching activities",
    offers: "offers",
    ready: "Ready",
    dates: "Date range",
    travelers: "Travelers",
    travelersShort: "trav.",
    city: "City",
    position: "Position",
    price: "Price",
    open: "View activity",
    empty: "We could not find activities for these dates yet. Change the dates or check back in a moment.",
  },
} as const;

export function ActivityOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  fromDate: string;
  toDate: string;
  travelers: number;
}) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const dateLocale = locale === "en" ? "en-GB" : "pl-PL";
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
            fromDate: props.fromDate,
            toDate: props.toDate,
            travelers: props.travelers,
          });

          if (!cancelled) setData(result);
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : text.requestError);
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
  }, [props.destinationCity, props.destinationCountry, props.fromDate, props.toDate, props.travelers, text.requestError]);

  const displayedOffers = useMemo(() => data?.offers.slice(0, 20) ?? [], [data?.offers]);

  return (
    <section className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.eyebrow}</p>
          <h3 className="mt-2 text-2xl font-bold text-emerald-950">{text.title}</h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900/72">{text.body}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {loading ? <Spinner /> : null}
          {loading ? text.loading : data ? `${data.offers.length} ${text.offers}` : text.ready}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-emerald-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.dates}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">
            {formatShortDate(props.fromDate, dateLocale)} - {formatShortDate(props.toDate, dateLocale)}
          </p>
        </div>
        <div className="rounded-2xl bg-emerald-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.travelers}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">
            {props.travelers} {text.travelersShort}
          </p>
        </div>
        <div className="rounded-2xl bg-emerald-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.city}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">{props.destinationCity}</p>
        </div>
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
              <div className="grid gap-0 lg:grid-cols-[200px_1fr]">
                <div className="relative h-44 lg:h-full">
                  <Image
                    src={offer.imageUrl ?? "https://images.unsplash.com/photo-1505238680356-667803448bb6?auto=format&fit=crop&w=1200&q=80"}
                    alt={offer.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 200px"
                  />
                </div>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        {text.position} #{index + 1}
                      </p>
                      <h4 className="mt-1 text-lg font-bold text-emerald-950">{offer.name}</h4>
                      <p className="mt-1 text-sm text-emerald-900/72">{offer.category}</p>
                    </div>
                    <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.price}</p>
                      <p className="mt-1 text-lg font-bold text-emerald-950">{formatMoney(offer.priceFrom, offer.currency, locale)}</p>
                    </div>
                  </div>
                  {offer.description ? <p className="mt-3 text-sm leading-6 text-emerald-900/80">{offer.description}</p> : null}
                  {offer.duration ? <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{offer.duration}</p> : null}
                  {offer.bookingUrl ? (
                    <div className="mt-4">
                      {(() => {
                        const activityPartnerLabel = getAffiliateBrandLabel(
                          offer.bookingUrl,
                          locale === "en" ? "Activity partner" : "Partner atrakcji",
                        );
                        return (
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
                        className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800"
                      >
                        <PartnerLogoMark brand={activityPartnerLabel} size="sm" variant="contrast" />
                        {text.open}
                      </a>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-emerald-900/12 bg-emerald-50/60 px-4 py-6 text-sm text-emerald-900/70">
            {text.empty}
          </div>
        )}
      </div>
    </section>
  );
}
