"use client";

import { useEffect, useMemo, useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { useLanguage } from "@/components/site/language-provider";
import { PartnerLogoMark } from "@/components/site/partner-logo";
import { postJson } from "@/lib/fetch-json";
import { formatMoney } from "@/lib/format";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { buildRedirectHref } from "@/lib/mvp/providers";
import { formatShortDate } from "@/lib/mvp/travel-dates";
import type { TransferSearchResponse } from "@/lib/mvp/types";

const copy = {
  pl: {
    requestError: "Nie udalo sie pobrac transferów.",
    eyebrow: "Transfer po przylocie",
    title: "Dojazd z lotniska bez zgadywania",
    body: "Ten sam termin podróży, ten sam kierunek i szybkie porównańie dojazdu do miasta. Wybierasz godzine i od razu widzisz najbardziej praktyczne opcje.",
    loading: "Odswiezamy transfery",
    options: "opcji",
    ready: "Gotowe do wyszukania",
    date: "Data",
    arrivalTime: "Godzina przylotu",
    adults: "Dorośli",
    children: "Dzieci / niemowleta",
    option: "Opcja",
    price: "Cena",
    open: "Zobacz transfer",
    empty: "Nie znaleźliśmy jeszcze transferów dla tej konfiguracji. Zmień godzinę przylotu albo sprawdź ponownie za chwilę.",
  },
  en: {
    requestError: "Could not load transfers.",
    eyebrow: "Arrival transfer",
    title: "Airport to city without the guesswork",
    body: "The same travel dates, the same destination and a quick comparison of transfer options into town. Pick the arrival time and see the practical options right away.",
    loading: "Refreshing transfers",
    options: "options",
    ready: "Ready to search",
    date: "Date",
    arrivalTime: "Arrival time",
    adults: "Adults",
    children: "Children / infants",
    option: "Option",
    price: "Price",
    open: "View transfer",
    empty: "We could not find transfers for this setup yet. Change the arrival time or check again in a moment.",
  },
} as const;

export function TransferOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  outboundDate: string;
  adults: number;
}) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const dateLocale = locale === "en" ? "en-GB" : "pl-PL";
  const [departureHour, setDepartureHour] = useState("12:00");
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
            outboundDateTime: `${props.outboundDate}T${departureHour}:00`,
            adults: props.adults,
            children,
            infants,
          });

          if (!cancelled) {
            setData(result);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : text.requestError);
            setData(null);
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };

      void run();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [children, departureHour, infants, props.adults, props.destinationCity, props.destinationCountry, props.outboundDate, text.requestError]);

  const displayedOffers = useMemo(() => data?.offers.slice(0, 20) ?? [], [data?.offers]);

  return (
    <section className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{text.eyebrow}</p>
          <h3 className="mt-2 text-2xl font-bold text-emerald-950">{text.title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-900/72">{text.body}</p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          {loading ? <Spinner /> : null}
          {loading ? text.loading : data ? `${data.offers.length} ${text.options}` : text.ready}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-emerald-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.date}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">{formatShortDate(props.outboundDate, dateLocale)}</p>
        </div>

        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          {text.arrivalTime}
          <input
            type="time"
            value={departureHour}
            onChange={(event) => setDepartureHour(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>

        <div className="rounded-2xl bg-emerald-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.adults}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-950">{props.adults}</p>
        </div>

        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          {text.children}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              max={8}
              value={children}
              onChange={(event) => setChildren(Number(event.target.value) || 0)}
              className="w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
            />
            <input
              type="number"
              min={0}
              max={8}
              value={infants}
              onChange={(event) => setInfants(Number(event.target.value) || 0)}
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
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {text.option} #{index + 1}
                  </p>
                  <h4 className="mt-1 text-lg font-bold text-emerald-950">{offer.name}</h4>
                  <p className="mt-1 text-sm text-emerald-900/72">{offer.vehicle}</p>
                </div>

                <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{text.price}</p>
                  <p className="mt-1 text-lg font-bold text-emerald-950">{formatMoney(offer.price, offer.currency, locale)}</p>
                </div>
              </div>

              {offer.description ? <p className="mt-3 text-sm leading-6 text-emerald-900/80">{offer.description}</p> : null}
              {offer.duration ? (
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{offer.duration}</p>
              ) : null}

              {offer.bookingUrl ? (
                <div className="mt-4">
                  {(() => {
                    const transferPartnerLabel = getAffiliateBrandLabel(
                      offer.bookingUrl,
                      locale === "en" ? "Transfer partner" : "Partner transferu",
                    );
                    return (
                  <a
                    href={buildRedirectHref({
                      providerKey: "cars",
                      targetUrl: offer.bookingUrl,
                      city: props.destinationCity,
                      country: props.destinationCountry,
                      source: "transfer_panel",
                    })}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-emerald-800"
                  >
                    <PartnerLogoMark brand={transferPartnerLabel} size="sm" variant="contrast" />
                    {text.open}
                  </a>
                    );
                  })()}
                </div>
              ) : null}
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

