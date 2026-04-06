"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { buildAffiliateLinksWithContext } from "@/lib/mvp/affiliate-links";
import { buildCjStayLinks } from "@/lib/mvp/cj-stays";
import { buildRedirectHref } from "@/lib/mvp/providers";
import { addDaysToIsoDate, formatShortDate } from "@/lib/mvp/travel-dates";
import type { StaySearchResponse, StaySortMode } from "@/lib/mvp/types";

const INITIAL_VISIBLE_OFFERS = 24;
const VISIBLE_OFFERS_STEP = 24;
const MAX_VISIBLE_OFFERS = 500;

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
    requestError: "Nie udalo sie pobrac noclegow.",
    hotelEyebrow: "Hotele",
    compareEyebrow: "Porownaj tez",
    apartmentsEyebrow: "Apartamenty",
    sectionEyebrow: "Pobyt",
    sectionTitle: "Tutaj zaczyna sie booking flow dla",
    sectionBody: "Najpierw top pobyt, potem porownanie partnerow i reszta ofert dla tego samego terminu.",
    loadingState: "Szukamy dostepnosci",
    offersState: "ofert",
    readyState: "Gotowe",
    dateLabel: "Termin",
    guestsLabel: "Podrozni",
    guestsShort: "os.",
    roomsLabel: "Pokoje",
    priorityLabel: "Priorytet",
    priorityValue: "Hotele najpierw",
    sortCheap: "Najtansze",
    sortQuality: "Najlepszy standard",
    sortValue: "Najlepsza relacja ceny do jakosci",
    showMore: "Pokaz wiecej",
    partnersTitle: "Porownanie partnerow",
    topStayBadge: "Top pobyt",
    featuredOfferEyebrow: "Najmocniejsza oferta na start",
    stayPriceLabel: "Cena pobytu",
    ratingLabel: "Ocena",
    noData: "Brak danych",
    ratingStars: "gw.",
    showThisStay: "Zobacz ten pobyt",
    compareAlso: "Porownaj tez w",
    position: "Pozycja",
    stayLabel: "Pobyt",
    checkStay: "Sprawdz pobyt",
    compareIn: "Porownaj w",
    emptyState: "Nie znalezlismy dostepnych noclegow dla tego ukladu dat. Zmien termin albo otworz wyniki partnerow.",
    feedFallbackTitle: "Gotowe wyniki partnerow dla tego pobytu",
    feedFallbackBody:
      "Jesli bezposredni feed nie odda pelnej listy dla tego miasta, nadal mozesz od razu przejsc do gotowych wynikow hoteli i apartamentow dla tych samych dat.",
  },
  en: {
    requestError: "Could not load stay offers.",
    hotelEyebrow: "Hotels",
    compareEyebrow: "Also compare",
    apartmentsEyebrow: "Apartments",
    sectionEyebrow: "Stays",
    sectionTitle: "This is where the booking flow starts for",
    sectionBody: "Lead with the strongest stay, then compare partners and browse more options for the same dates.",
    loadingState: "Checking availability",
    offersState: "offers",
    readyState: "Ready",
    dateLabel: "Dates",
    guestsLabel: "Travelers",
    guestsShort: "trav.",
    roomsLabel: "Rooms",
    priorityLabel: "Priority",
    priorityValue: "Hotels first",
    sortCheap: "Lowest price",
    sortQuality: "Best quality",
    sortValue: "Best value",
    showMore: "Show more",
    partnersTitle: "Compare partners",
    topStayBadge: "Top stay",
    featuredOfferEyebrow: "Strongest opening offer",
    stayPriceLabel: "Stay price",
    ratingLabel: "Rating",
    noData: "No data",
    ratingStars: "stars",
    showThisStay: "Open this stay",
    compareAlso: "Also compare on",
    position: "Position",
    stayLabel: "Stay",
    checkStay: "Check stay",
    compareIn: "Compare on",
    emptyState: "We could not find available stays for these dates. Change the dates or open partner results.",
    feedFallbackTitle: "Partner results are ready for this stay window",
    feedFallbackBody:
      "If the direct feed does not return a full list for this city, you can still jump straight into ready hotel and apartment results for the same dates.",
  },
} as const;

export function StayOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  checkInDate: string;
  nights: number;
  guests: number;
  rooms: number;
}) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const requestErrorText = text.requestError;
  const [sortBy, setSortBy] = useState<StaySortMode>("value");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<StaySearchResponse | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_OFFERS);

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
            setVisibleCount(INITIAL_VISIBLE_OFFERS);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : requestErrorText);
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
  }, [props.checkInDate, props.destinationCity, props.destinationCountry, props.guests, props.nights, props.rooms, requestErrorText, sortBy]);

  const availableOffers = useMemo(() => data?.offers.slice(0, MAX_VISIBLE_OFFERS) ?? [], [data?.offers]);
  const displayedOffers = useMemo(() => availableOffers.slice(0, visibleCount), [availableOffers, visibleCount]);
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
  const genericAffiliateLinks = useMemo(
    () =>
      buildAffiliateLinksWithContext({
        city: props.destinationCity,
        country: props.destinationCountry,
        checkInDate: props.checkInDate,
        checkOutDate,
        passengers: props.guests,
        rooms: props.rooms,
      }),
    [checkOutDate, props.checkInDate, props.destinationCity, props.destinationCountry, props.guests, props.rooms],
  );

  const partnerButtons = useMemo(
    () =>
      [
            {
              eyebrow: text.hotelEyebrow,
              label: getAffiliateBrandLabel(partnerLinks?.hotels ?? genericAffiliateLinks.stays, "Hotels.com"),
              href: buildRedirectHref({
                providerKey: "stays",
                targetUrl: partnerLinks?.hotels ?? genericAffiliateLinks.stays,
                city: props.destinationCity,
                country: props.destinationCountry,
                source: "stay_panel_hotels",
              }),
            },
            ...(partnerLinks
              ? [
                  {
              eyebrow: text.compareEyebrow,
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
              eyebrow: text.apartmentsEyebrow,
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
              : []),
          ],
    [genericAffiliateLinks.stays, partnerLinks, props.destinationCity, props.destinationCountry, text.apartmentsEyebrow, text.compareEyebrow, text.hotelEyebrow],
  );

  return (
    <section className="rounded-[1.9rem] border border-emerald-500/18 bg-[linear-gradient(180deg,rgba(247,252,249,0.98),rgba(235,247,239,0.96))] p-5 shadow-[0_18px_50px_rgba(16,84,48,0.08)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.sectionEyebrow}</p>
          <h3 className="mt-2 text-3xl font-bold text-emerald-950">
            {text.sectionTitle} {props.destinationCity}
          </h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900/76">
            {text.sectionBody}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm ring-1 ring-emerald-900/8">
          {loading ? <Spinner /> : null}
          {loading ? text.loadingState : data ? `${availableOffers.length} ${text.offersState}` : text.readyState}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.dateLabel}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">
            {formatShortDate(props.checkInDate, locale === "en" ? "en-GB" : "pl-PL")} - {formatShortDate(checkOutDate, locale === "en" ? "en-GB" : "pl-PL")}
          </p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.guestsLabel}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">{props.guests} {text.guestsShort}</p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.roomsLabel}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">{props.rooms}</p>
        </div>
        <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-emerald-900/8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.priorityLabel}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">{text.priorityValue}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["cheap", text.sortCheap],
            ["quality", text.sortQuality],
            ["value", text.sortValue],
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
        {displayedOffers.length >= INITIAL_VISIBLE_OFFERS && displayedOffers.length < availableOffers.length ? (
          <button
            type="button"
            onClick={() => setVisibleCount((value) => Math.min(MAX_VISIBLE_OFFERS, value + VISIBLE_OFFERS_STEP))}
            className="rounded-full border border-emerald-900/12 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
          >
            {text.showMore}
          </button>
        ) : null}
      </div>

      {partnerButtons.length ? (
        <div className="mt-4 rounded-[1.5rem] border border-emerald-900/10 bg-white/88 p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.partnersTitle}</p>
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
      {data?.error ? (
        <div className="mt-4 rounded-[1.5rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {text.feedFallbackBody}
        </div>
      ) : null}

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
                      {text.topStayBadge}
                    </div>
                  </div>

                  <div className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="max-w-2xl">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.featuredOfferEyebrow}</p>
                        <h4 className="mt-2 text-3xl font-bold text-emerald-950">{topOffer.name}</h4>
                        <p className="mt-2 text-sm text-emerald-900/72">{topOffer.address || topOffer.city}</p>
                      </div>
                      <div className="rounded-[1.4rem] bg-emerald-950 px-4 py-3 text-right text-white">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.stayPriceLabel}</p>
                        <p className="mt-1 text-2xl font-bold">{formatMoney(topOffer.total_amount, topOffer.currency, locale)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.dateLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          {formatShortDate(props.checkInDate, locale === "en" ? "en-GB" : "pl-PL")} - {formatShortDate(checkOutDate, locale === "en" ? "en-GB" : "pl-PL")}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.ratingLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          {topOffer.reviewScore
                            ? `${topOffer.reviewScore.toFixed(1)}/10`
                            : topOffer.rating
                              ? `${topOffer.rating.toFixed(1)} ${text.ratingStars}`
                              : text.noData}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.guestsLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">{props.guests} {text.guestsShort}</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.roomsLabel}</p>
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
                          {text.showThisStay}
                        </a>
                      ) : null}
                      {partnerButtons[0] ? (
                        <a
                          href={partnerButtons[0].href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-full border border-emerald-900/12 bg-white px-5 py-3 text-sm font-semibold text-emerald-950 transition hover:-translate-y-0.5 hover:bg-emerald-50"
                        >
                          {text.compareAlso} {partnerButtons[0].label}
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
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.position} #{index + 2}</p>
                        <h4 className="mt-1 text-lg font-bold text-emerald-950">{offer.name}</h4>
                        <p className="mt-1 text-sm text-emerald-900/72">{offer.address || offer.city}</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.stayPriceLabel}</p>
                        <p className="mt-1 text-lg font-bold text-emerald-950">{formatMoney(offer.total_amount, offer.currency, locale)}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.dateLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          {formatShortDate(props.checkInDate, locale === "en" ? "en-GB" : "pl-PL")} - {formatShortDate(checkOutDate, locale === "en" ? "en-GB" : "pl-PL")}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.ratingLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          {offer.reviewScore ? `${offer.reviewScore.toFixed(1)}/10` : offer.rating ? `${offer.rating.toFixed(1)} ${text.ratingStars}` : text.noData}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.guestsLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">{props.guests} {text.guestsShort}</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50/70 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.roomsLabel}</p>
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
                          {text.checkStay}
                        </a>
                      ) : null}
                      {partnerButtons[0] ? (
                        <a
                          href={partnerButtons[0].href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-full border border-emerald-900/12 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-50"
                        >
                          {text.compareIn} {partnerButtons[0].label}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </>
        ) : partnerButtons.length ? (
          <div className="rounded-[1.75rem] border border-dashed border-emerald-900/12 bg-white/88 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{text.feedFallbackTitle}</p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-900/76">{text.feedFallbackBody}</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {partnerButtons.map((partner) => (
                <a
                  key={`fallback-${partner.label}`}
                  href={partner.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[1.35rem] border border-emerald-900/10 bg-emerald-950 px-4 py-4 text-white transition hover:-translate-y-0.5 hover:bg-emerald-900"
                >
                  <span className="block text-[11px] uppercase tracking-[0.16em] text-emerald-200">{partner.eyebrow}</span>
                  <span className="mt-2 block text-base font-semibold">{partner.label}</span>
                  <span className="mt-2 block text-sm text-white/72">
                    {formatShortDate(props.checkInDate, locale === "en" ? "en-GB" : "pl-PL")} - {formatShortDate(checkOutDate, locale === "en" ? "en-GB" : "pl-PL")}
                  </span>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-emerald-900/12 bg-white/88 px-4 py-6 text-sm text-emerald-900/72">
            {text.emptyState}
          </div>
        )}
      </div>
    </section>
  );
}
