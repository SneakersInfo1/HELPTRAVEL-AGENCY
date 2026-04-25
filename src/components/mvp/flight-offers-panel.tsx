"use client";

import { useEffect, useMemo, useState } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { PartnerLogoMark } from "@/components/site/partner-logo";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { buildRedirectHref } from "@/lib/mvp/providers";
import { countNightsBetweenIsoDates, formatShortDate } from "@/lib/mvp/travel-dates";
import type { FlightSearchResponse, FlightSortMode, NormalizedFlightOffer } from "@/lib/mvp/types";

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

function formatMoney(value: number, currency: string, locale: "pl" | "en") {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(value: string, locale: "pl" | "en") {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function stopLabel(stops: number, locale: "pl" | "en") {
  if (locale === "en") {
    if (stops === 0) return "Direct";
    if (stops === 1) return "1 stop";
    return `${stops} stops`;
  }

  if (stops === 0) return "Bez przesiadek";
  if (stops === 1) return "1 przesiadka";
  return `${stops} przesiadki`;
}

function Spinner() {
  return <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />;
}

const copy = {
  pl: {
    eyebrow: "Loty",
    body: "Najpierw pokazujemy sygnał trasy i realne opcje lotu na wylot. Finalny klik nadal prowadzi do partnera z ustawionym wyszukiwaniem.",
    partner: "Partner",
    route: "Trasa",
    departure: "Wylot",
    return: "Powrot",
    tripWindow: "Zakres podróży",
    travelers: "Podróżni",
    travelersShort: "os.",
    liveBadge: "Realny shortlist",
    fallbackBadge: "Wyniki partnera",
    flightSignals: "Jak wygląda ten kierunek lotniczo",
    flightSignalsBody: "Jeśli live feed odpowiada, pokazujemy najmocniejsze opcje na dzień wylotu. Jeśli nie, otwierasz od razu gotowe wyniki partnera dla tej samej trasy.",
    topFlight: "Najmocniejsza opcja na start",
    moreFlights: "Kolejne opcje",
    airline: "Linia",
    price: "Cena",
    duration: "Czas lotu",
    stops: "Przesiadki",
    times: "Godziny",
    openFlight: "Otwórz ten lot",
    openFlights: "Otwórz loty w",
    liveHint: "To realne opcje na wylot dla wybranego dnia. Partner otwiera pełne wyniki dla całej trasy.",
    fallbackTitle: "Gotowe wyniki lotów nadal są dostępne",
    fallbackBody:
      "Jeśli live feed nie zwraca jeszcze shortlisty na stronie, nie gubimy kontekstu. Klik otwiera partnera z ustawiona trasa, data i liczba podróżnych.",
    fallbackStatus: "Trasa i daty są już ustawione",
    sortCheap: "Najtansze",
    sortBalance: "Najlepszy balans",
    sortDirect: "Najmniej przesiadek",
    liveCount: "realnych opcji",
    routeReady: "Wyniki partnera zachowują trasę i datę.",
    noFlightUrl: "Ta opcja nie ma jeszcze bezpośredniego linku do zakupu, ale partner otwórzy pełny wynik dla tej samej trasy.",
    resultsHint: "Po kliknięciu lądujesz na wynikach z ustawionym wyszukiwaniem.",
  },
  en: {
    eyebrow: "Flights",
    body: "We start with route signal and live outbound options when available. The final click still opens a partner with the same search context applied.",
    partner: "Partner",
    route: "Route",
    departure: "Departure",
    return: "Return",
    tripWindow: "Trip window",
    travelers: "Travelers",
    travelersShort: "trav.",
    liveBadge: "Live shortlist",
    fallbackBadge: "Partner results",
    flightSignals: "What the route looks like",
    flightSignalsBody: "When the live feed responds, we show the strongest outbound options for your departure day. If not, you still open a partner with the same route and timing.",
    topFlight: "Strongest opening option",
    moreFlights: "More options",
    airline: "Airline",
    price: "Price",
    duration: "Duration",
    stops: "Stops",
    times: "Times",
    openFlight: "Open this flight",
    openFlights: "Open flights on",
    liveHint: "These are live outbound options for the selected day. The partner still opens full results for the whole trip.",
    fallbackTitle: "Ready flight results are still available",
    fallbackBody:
      "If the live feed does not return an on-page shortlist yet, we keep the next step clear. The click opens a partner with the route, date and traveler count already applied.",
    fallbackStatus: "The route and dates are already set",
    sortCheap: "Lowest price",
    sortBalance: "Best balance",
    sortDirect: "Fewest stops",
    liveCount: "live options",
    routeReady: "Partner results keep the route and date context.",
    noFlightUrl: "This option does not expose a direct booking link yet, but the partner will still open the same route.",
    resultsHint: "After the click you land directly on prefilled flight results.",
  },
} as const;

export function FlightOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  originCity: string;
  departureDate: string;
  returnDate: string;
  passengers: number;
  partnerUrl: string;
}) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const dateLocale = locale === "en" ? "en-GB" : "pl-PL";
  const [sortBy, setSortBy] = useState<FlightSortMode>("balance");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<FlightSearchResponse | null>(null);

  const tripNights = countNightsBetweenIsoDates(props.departureDate, props.returnDate, 4);
  const partnerLabel = getAffiliateBrandLabel(props.partnerUrl, locale === "en" ? "Flight partner" : "Partner lotniczy");
  const redirectHref = useMemo(
    () =>
      buildRedirectHref({
        providerKey: "flights",
        targetUrl: props.partnerUrl,
        city: props.destinationCity,
        country: props.destinationCountry,
        source: "flight_panel",
        query: `${props.originCity} ${props.destinationCity} ${props.departureDate} ${props.returnDate} ${props.passengers}`,
      }),
    [
      props.departureDate,
      props.destinationCity,
      props.destinationCountry,
      props.originCity,
      props.partnerUrl,
      props.passengers,
      props.returnDate,
    ],
  );

  useEffect(() => {
    if (!props.destinationCity || !props.originCity || !props.departureDate) return;

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      const run = async () => {
        setLoading(true);
        setError("");

        try {
          const result = await postJson<FlightSearchResponse>("/api/flights/search", {
            origin: props.originCity,
            destination: props.destinationCity,
            departureDate: props.departureDate,
            passengers: props.passengers,
            cabinClass: "economy",
            sortBy,
          });

          if (!cancelled) {
            setData(result);
          }
        } catch (requestError) {
          if (!cancelled) {
            setData(null);
            setError(requestError instanceof Error ? requestError.message : text.fallbackBody);
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

      void run();
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [props.departureDate, props.destinationCity, props.originCity, props.passengers, sortBy, text.fallbackBody]);

  const liveOffers = data?.offers ?? [];
  const topOffer = liveOffers[0] ?? null;
  const secondaryOffers = liveOffers.slice(1, 4);
  const hasLiveShortlist = data?.source === "duffel" && liveOffers.length > 0;
  const fallbackMessage = error || data?.error || text.fallbackBody;

  const buildFlightHref = (offer?: NormalizedFlightOffer | null, source = "flight_panel_live") =>
    offer?.bookingUrl
      ? buildRedirectHref({
          providerKey: "flights",
          targetUrl: offer.bookingUrl,
          city: props.destinationCity,
          country: props.destinationCountry,
          source,
          query: `${props.originCity} ${props.destinationCity} ${props.departureDate} ${props.returnDate} ${props.passengers}`,
        })
      : redirectHref;

  return (
    <section className="overflow-hidden rounded-[1.9rem] border border-emerald-900/10 bg-emerald-950 p-5 text-white shadow-[0_20px_60px_rgba(7,31,18,0.18)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">{text.eyebrow}</p>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
              {hasLiveShortlist ? text.liveBadge : text.fallbackBadge}
            </span>
          </div>
          <h3 className="mt-2 text-2xl font-bold text-white">
            {props.originCity} - {props.destinationCity}
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/72">{text.body}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white">
          {loading ? <Spinner /> : null}
          <PartnerLogoMark brand={partnerLabel} size="sm" variant="contrast" />
          {hasLiveShortlist ? `${liveOffers.length} ${text.liveCount}` : `${text.partner}: ${partnerLabel}`}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white/8 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.route}</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {props.originCity} - {props.destinationCity}
          </p>
        </div>
        <div className="rounded-2xl bg-white/8 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.departure}</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatShortDate(props.departureDate, dateLocale)}</p>
        </div>
        <div className="rounded-2xl bg-white/8 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.return}</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatShortDate(props.returnDate, dateLocale)}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white/8 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.tripWindow}</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {tripNights} {locale === "en" ? "nights" : "nocy"}
          </p>
        </div>
        <div className="rounded-2xl bg-white/8 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.travelers}</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {props.passengers} {text.travelersShort}
          </p>
        </div>
        <div className="rounded-2xl bg-emerald-400/12 px-4 py-3 ring-1 ring-emerald-300/20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.partner}</p>
          <p className="mt-1 text-sm font-semibold text-white">{hasLiveShortlist ? text.liveHint : text.fallbackStatus}</p>
        </div>
      </div>

      <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-white/6 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">{text.flightSignals}</p>
            <p className="mt-2 text-sm leading-6 text-white/74">{text.flightSignalsBody}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["cheap", text.sortCheap],
                ["balance", text.sortBalance],
                ["direct", text.sortDirect],
              ] as Array<[FlightSortMode, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortBy(key)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  sortBy === key ? "bg-emerald-400 text-emerald-950" : "bg-white/10 text-white hover:bg-white/14"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-[1.35rem] border border-white/10 bg-white/6 p-4">
              <div className="h-5 w-44 rounded-full bg-white/10" />
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="h-10 rounded-2xl bg-white/10" />
                <div className="h-10 rounded-2xl bg-white/10" />
                <div className="h-10 rounded-2xl bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      ) : hasLiveShortlist && topOffer ? (
        <div className="mt-4 space-y-4">
          <article className="rounded-[1.6rem] border border-white/10 bg-white/8 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">{text.topFlight}</p>
                <h4 className="mt-2 text-2xl font-bold text-white">{topOffer.airline}</h4>
                <p className="mt-2 text-sm leading-6 text-white/72">{text.liveHint}</p>
              </div>
              <div className="rounded-[1.3rem] bg-emerald-400 px-4 py-3 text-right text-emerald-950">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">{text.price}</p>
                <p className="mt-1 text-2xl font-bold">{formatMoney(topOffer.total_amount, topOffer.currency, locale)}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-2xl bg-white/8 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.times}</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {formatTime(topOffer.departure_time, locale)} - {formatTime(topOffer.arrival_time, locale)}
                </p>
              </div>
              <div className="rounded-2xl bg-white/8 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.duration}</p>
                <p className="mt-1 text-sm font-semibold text-white">{topOffer.total_duration || "—"}</p>
              </div>
              <div className="rounded-2xl bg-white/8 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.stops}</p>
                <p className="mt-1 text-sm font-semibold text-white">{stopLabel(topOffer.number_of_stops, locale)}</p>
              </div>
              <div className="rounded-2xl bg-white/8 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.airline}</p>
                <p className="mt-1 text-sm font-semibold text-white">{topOffer.origin} - {topOffer.destination}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a
                href={buildFlightHref(topOffer, "flight_panel_featured_offer")}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-300"
              >
                <PartnerLogoMark brand={partnerLabel} size="sm" variant="neutral" />
                {text.openFlight}
              </a>
              <span className="text-sm text-white/68">
                {topOffer.bookingUrl ? text.routeReady : text.noFlightUrl}
              </span>
            </div>
          </article>

          {secondaryOffers.length ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {secondaryOffers.map((offer) => (
                <article key={offer.offerId} className="rounded-[1.35rem] border border-white/10 bg-white/6 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.moreFlights}</p>
                  <h4 className="mt-2 text-lg font-bold text-white">{offer.airline}</h4>
                  <div className="mt-3 space-y-2 text-sm text-white/78">
                    <p>{text.price}: {formatMoney(offer.total_amount, offer.currency, locale)}</p>
                    <p>{text.times}: {formatTime(offer.departure_time, locale)} - {formatTime(offer.arrival_time, locale)}</p>
                    <p>{text.duration}: {offer.total_duration || "--"}</p>
                    <p>{text.stops}: {stopLabel(offer.number_of_stops, locale)}</p>
                  </div>
                  <a
                    href={buildFlightHref(offer, "flight_panel_secondary_offer")}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/14"
                  >
                    {text.openFlight}
                  </a>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-white/6 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">{text.fallbackTitle}</p>
          <p className="mt-2 text-sm leading-7 text-white/76">{fallbackMessage}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white/8 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.route}</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {props.originCity} - {props.destinationCity}
              </p>
            </div>
            <div className="rounded-2xl bg-white/8 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.resultsHint}</p>
              <p className="mt-1 text-sm font-semibold text-white">{text.routeReady}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href={redirectHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-bold text-emerald-950 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-300"
            >
              <PartnerLogoMark brand={partnerLabel} size="sm" variant="neutral" />
              {text.openFlights} {partnerLabel}
            </a>
            <span className="text-sm text-white/68">{text.resultsHint}</span>
          </div>
        </div>
      )}
    </section>
  );
}




