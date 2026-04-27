"use client";

import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "@/components/site/language-provider";
import type { FlightSearchResponse, NormalizedFlightOffer } from "@/lib/mvp/types";

const INITIAL_VISIBLE = 10;
const STEP = 10;
const MAX_VISIBLE = 50;

const copy = {
  pl: {
    eyebrow: "Loty",
    title: "Konkretne oferty lotów",
    body: "Ceny orientacyjne z cache Travelpayouts. Finalna cena na stronie partnera.",
    bookNow: "Sprawdź lot",
    showMore: "Pokaż więcej lotów",
    empty: "Nie znaleźliśmy lotów dla tej trasy i daty. Zmień dzień wylotu.",
    requestError: "Nie udało się pobrać ofert lotów.",
    stops: (n: number) => (n === 0 ? "bezpośrednio" : n === 1 ? "1 przesiadka" : `${n} przesiadki`),
    duration: "Czas",
  },
  en: {
    eyebrow: "Flights",
    title: "Concrete flight offers",
    body: "Indicative prices cached by Travelpayouts. Final price on the partner site.",
    bookNow: "Check flight",
    showMore: "Show more flights",
    empty: "We couldn't find flights for this route and date. Try a different day.",
    requestError: "Could not load flight offers.",
    stops: (n: number) => (n === 0 ? "non-stop" : n === 1 ? "1 stop" : `${n} stops`),
    duration: "Duration",
  },
} as const;

function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => {
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Request failed (${response.status}).`);
    }
    return (await response.json()) as T;
  });
}

function formatPrice(value: number, currency: string, locale: "pl" | "en"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(value: string, locale: "pl" | "en"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

type Copy = (typeof copy)[keyof typeof copy];

function FlightCard({ offer, locale, t }: {
  offer: NormalizedFlightOffer;
  locale: "pl" | "en";
  t: Copy;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-[0_8px_24px_rgba(16,84,48,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(16,84,48,0.1)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{offer.airline}</p>
          <p className="mt-1 text-sm font-bold text-emerald-950">
            {offer.origin} → {offer.destination}
          </p>
        </div>
        <p className="whitespace-nowrap text-lg font-bold text-emerald-950">
          {formatPrice(offer.total_amount, offer.currency, locale)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-emerald-50/60 p-3 text-xs">
        <div>
          <p className="text-emerald-900/56">{formatTime(offer.departure_time, locale)}</p>
          <p className="font-semibold text-emerald-950">{offer.origin}</p>
        </div>
        <div className="text-center">
          <p className="text-emerald-900/56">{offer.total_duration || "—"}</p>
          <p className="font-semibold text-emerald-900">{t.stops(offer.number_of_stops)}</p>
        </div>
        <div className="text-right">
          <p className="text-emerald-900/56">{formatTime(offer.arrival_time, locale)}</p>
          <p className="font-semibold text-emerald-950">{offer.destination}</p>
        </div>
      </div>

      {offer.bookingUrl ? (
        <a
          href={offer.bookingUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-auto inline-flex items-center justify-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          {t.bookNow}
        </a>
      ) : null}
    </article>
  );
}

export function FlightOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  originCity: string;
  departureDate: string;
  returnDate: string;
  passengers: number;
}) {
  const { locale } = useLanguage();
  const t = copy[locale];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<FlightSearchResponse | null>(null);
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  useEffect(() => {
    if (!props.destinationCity || !props.originCity || !props.departureDate) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError("");
        try {
          const result = await postJson<FlightSearchResponse>("/api/flights/search", {
            origin: props.originCity,
            destination: props.destinationCity,
            departureDate: props.departureDate,
            passengers: props.passengers,
            cabinClass: "economy",
            sortBy: "balance",
          });
          if (!cancelled) {
            setData(result);
            setVisible(INITIAL_VISIBLE);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : t.requestError);
            setData(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    props.departureDate,
    props.destinationCity,
    props.originCity,
    props.passengers,
    t.requestError,
  ]);

  const allOffers = useMemo(() => data?.offers ?? [], [data?.offers]);
  const shown = allOffers.slice(0, Math.min(visible, MAX_VISIBLE));
  const canShowMore = visible < Math.min(allOffers.length, MAX_VISIBLE);

  return (
    <section className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-5 shadow-[0_12px_32px_rgba(16,84,48,0.06)]">
      <header className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{t.eyebrow}</p>
        <h2 className="mt-1 text-xl font-bold text-emerald-950">{t.title}</h2>
        <p className="mt-1 text-sm text-emerald-900/72">{t.body}</p>
      </header>

      {loading && shown.length === 0 ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="h-44 animate-pulse rounded-2xl bg-emerald-50" />
          ))}
        </div>
      ) : shown.length > 0 ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {shown.map((offer) => (
              <FlightCard key={offer.offerId} offer={offer} locale={locale} t={t} />
            ))}
          </div>
          {canShowMore ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisible((v) => Math.min(MAX_VISIBLE, v + STEP))}
                className="rounded-full border border-emerald-900/12 bg-white px-5 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
              >
                {t.showMore}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-2xl bg-emerald-50/60 p-5 text-sm text-emerald-900/76">
          {error || data?.error || t.empty}
        </div>
      )}
    </section>
  );
}
