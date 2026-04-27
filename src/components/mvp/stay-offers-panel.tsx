"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { countNightsBetweenIsoDates } from "@/lib/mvp/travel-dates";
import type { NormalizedStayOffer, StaySearchResponse } from "@/lib/mvp/types";

const INITIAL_VISIBLE = 10;
const STEP = 10;
const MAX_VISIBLE = 50;

const copy = {
  pl: {
    eyebrow: "Hotele",
    title: "Konkretne oferty hoteli",
    body: "Ceny pobytu w PLN. Klik prowadzi do partnera, gdzie finalizujesz rezerwację.",
    loading: "Sprawdzamy dostępność...",
    nights: (n: number) => `${n} ${n === 1 ? "noc" : n < 5 ? "noce" : "nocy"}`,
    bookNow: "Rezerwuj",
    noPrice: "Cena u partnera",
    showMore: "Pokaż więcej hoteli",
    jumpToFlights: "Skocz do lotów",
    empty: "Nie znaleźliśmy ofert dla tych dat. Zmień termin lub liczbę gości.",
    requestError: "Nie udało się pobrać ofert hoteli.",
    starsLabel: (s: number) => `${s}★`,
  },
  en: {
    eyebrow: "Stays",
    title: "Concrete hotel offers",
    body: "Stay prices in PLN. Clicks lead to the partner where booking is finalized.",
    loading: "Checking availability...",
    nights: (n: number) => `${n} ${n === 1 ? "night" : "nights"}`,
    bookNow: "Book",
    noPrice: "Price at partner",
    showMore: "Show more stays",
    jumpToFlights: "Jump to flights",
    empty: "We couldn't find offers for these dates. Try different dates or guest count.",
    requestError: "Could not load stay offers.",
    starsLabel: (s: number) => `${s}★`,
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

type Copy = (typeof copy)[keyof typeof copy];

function StayCard({ offer, nights, locale, t }: {
  offer: NormalizedStayOffer;
  nights: number;
  locale: "pl" | "en";
  t: Copy;
}) {
  const stars = offer.rating ?? 0;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-[0_8px_24px_rgba(16,84,48,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(16,84,48,0.1)]">
      <div className="relative h-40 w-full bg-emerald-50">
        {offer.imageUrl ? (
          <Image
            src={offer.imageUrl}
            alt={offer.name}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover"
          />
        ) : null}
        {stars > 0 ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2 py-1 text-xs font-bold text-emerald-900 shadow">
            {t.starsLabel(stars)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-bold text-emerald-950">{offer.name}</h3>
        <p className="line-clamp-1 text-xs text-emerald-900/64">{offer.address}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div>
            {offer.total_amount > 0 ? (
              <>
                <p className="text-lg font-bold text-emerald-950">
                  {formatPrice(offer.total_amount, offer.currency, locale)}
                </p>
                <p className="text-[11px] text-emerald-900/60">{t.nights(nights)}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-emerald-900/72">{t.noPrice}</p>
            )}
          </div>
          {offer.bookingUrl ? (
            <a
              href={offer.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800"
            >
              {t.bookNow}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function StayOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  checkInDate: string;
  checkOutDate: string;
  guests: number;
  rooms: number;
}) {
  const { locale } = useLanguage();
  const t = copy[locale];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<StaySearchResponse | null>(null);
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  const nights = useMemo(
    () => countNightsBetweenIsoDates(props.checkInDate, props.checkOutDate, 4),
    [props.checkInDate, props.checkOutDate],
  );

  useEffect(() => {
    if (!props.destinationCity) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError("");
        try {
          const result = await postJson<StaySearchResponse>("/api/stays/search", {
            city: props.destinationCity,
            country: props.destinationCountry,
            checkInDate: props.checkInDate,
            nights,
            guests: props.guests,
            rooms: props.rooms,
            sortBy: "cheap",
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
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    nights,
    props.checkInDate,
    props.destinationCity,
    props.destinationCountry,
    props.guests,
    props.rooms,
    t.requestError,
  ]);

  const allOffers = data?.offers ?? [];
  const shown = allOffers.slice(0, Math.min(visible, MAX_VISIBLE));
  const canShowMore = visible < Math.min(allOffers.length, MAX_VISIBLE);

  return (
    <section className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-5 shadow-[0_12px_32px_rgba(16,84,48,0.06)]">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{t.eyebrow}</p>
          <h2 className="mt-1 text-xl font-bold text-emerald-950">{t.title}</h2>
          <p className="mt-1 text-sm text-emerald-900/72">{t.body}</p>
        </div>
        {shown.length > 0 ? (
          <a
            href="#planner-flights"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            {t.jumpToFlights}
            <span aria-hidden>↓</span>
          </a>
        ) : null}
      </header>

      {loading && shown.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="h-64 animate-pulse rounded-2xl bg-emerald-50" />
          ))}
        </div>
      ) : shown.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {shown.map((offer) => (
              <StayCard key={offer.searchResultId} offer={offer} nights={nights} locale={locale} t={t} />
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
