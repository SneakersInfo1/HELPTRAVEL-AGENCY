"use client";

import { useMemo } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { PartnerLogoMark } from "@/components/site/partner-logo";
import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { buildRedirectHref } from "@/lib/mvp/providers";
import { formatShortDate } from "@/lib/mvp/travel-dates";

const copy = {
  pl: {
    eyebrow: "Loty",
    body: "Otwierasz gotowe wyniki lotow z ustawiona trasa, terminem i liczba podroznych. Bez wracania do pustego startu.",
    partner: "Partner",
    route: "Trasa",
    departure: "Wylot",
    travelers: "Podrozni",
    travelersShort: "os.",
    openFlights: "Otworz loty w",
    resultsHint: "Po kliknieciu lądujesz na wynikach z ustawionym wyszukiwaniem.",
  },
  en: {
    eyebrow: "Flights",
    body: "You open ready flight results with the route, date and traveler count already filled in. No empty homepage in between.",
    partner: "Partner",
    route: "Route",
    departure: "Departure",
    travelers: "Travelers",
    travelersShort: "trav.",
    openFlights: "Open flights on",
    resultsHint: "After the click you land directly on prefilled flight results.",
  },
} as const;

export function FlightOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  originCity: string;
  departureDate: string;
  passengers: number;
  partnerUrl: string;
}) {
  const { locale } = useLanguage();
  const text = copy[locale];
  const dateLocale = locale === "en" ? "en-GB" : "pl-PL";
  const partnerLabel = getAffiliateBrandLabel(props.partnerUrl, locale === "en" ? "Flight partner" : "Partner lotniczy");
  const redirectHref = useMemo(
    () =>
      buildRedirectHref({
        providerKey: "flights",
        targetUrl: props.partnerUrl,
        city: props.destinationCity,
        country: props.destinationCountry,
        source: "flight_panel",
        query: `${props.originCity} ${props.destinationCity} ${props.departureDate} ${props.passengers}`,
      }),
    [props.departureDate, props.destinationCity, props.destinationCountry, props.originCity, props.partnerUrl, props.passengers],
  );

  return (
    <section className="overflow-hidden rounded-[1.9rem] border border-emerald-900/10 bg-emerald-950 p-5 text-white shadow-[0_20px_60px_rgba(7,31,18,0.18)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">{text.eyebrow}</p>
          <h3 className="mt-2 text-2xl font-bold text-white">
            {props.originCity} - {props.destinationCity}
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/72">{text.body}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white">
          <PartnerLogoMark brand={partnerLabel} size="sm" variant="contrast" />
          {text.partner}: {partnerLabel}
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-200">{text.travelers}</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {props.passengers} {text.travelersShort}
          </p>
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
    </section>
  );
}
