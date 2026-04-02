"use client";

import { useMemo, useState } from "react";

import { getAffiliateBrandLabel } from "@/lib/mvp/affiliate-brand";
import { buildRedirectHref } from "@/lib/mvp/providers";

function defaultDepartureDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

export function FlightOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  defaultOriginCity?: string;
  passengers?: number;
  partnerUrl: string;
}) {
  const [originCity, setOriginCity] = useState(props.defaultOriginCity ?? "Warszawa");
  const [departureDate, setDepartureDate] = useState(defaultDepartureDate());
  const [passengers, setPassengers] = useState(props.passengers ?? 2);

  const partnerLabel = getAffiliateBrandLabel(props.partnerUrl, "Partner lotniczy");
  const redirectHref = useMemo(
    () =>
      buildRedirectHref({
        providerKey: "flights",
        targetUrl: props.partnerUrl,
        city: props.destinationCity,
        country: props.destinationCountry,
        source: "flight_panel",
        query: `${originCity} ${props.destinationCity} ${departureDate} ${passengers}`,
      }),
    [departureDate, originCity, passengers, props.destinationCity, props.destinationCountry, props.partnerUrl],
  );

  return (
    <section className="rounded-[1.75rem] border border-emerald-900/10 bg-white p-5 shadow-[0_16px_45px_rgba(16,84,48,0.06)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Loty dla konkretnej trasy</p>
          <h3 className="mt-2 text-2xl font-bold text-emerald-950">
            {originCity} → {props.destinationCity}, {props.destinationCountry}
          </h3>
          <p className="mt-2 text-sm leading-6 text-emerald-900/72">
            Loty z Duffel zostaly usuniete. Zamiast pseudo-feedow ten blok zbiera trase i prowadzi uzytkownika prosto do aktywnego partnera lotniczego, gdzie moze zobaczyc finalne wyniki i ceny dla tej relacji.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          Partner: {partnerLabel}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Skad lecisz
          <input
            value={originCity}
            onChange={(event) => setOriginCity(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
            placeholder="np. Warszawa"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Dokad lecisz
          <input
            value={props.destinationCity}
            readOnly
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950 outline-none"
          />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Data wylotu
          <input
            type="date"
            value={departureDate}
            onChange={(event) => setDepartureDate(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Pasazerowie
          <input
            type="number"
            min={1}
            max={8}
            value={passengers}
            onChange={(event) => setPassengers(Number(event.target.value))}
            className="mt-2 w-full rounded-2xl border border-emerald-900/12 bg-white px-4 py-3 text-sm text-emerald-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-200/70"
          />
        </label>
        <div className="rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/70 px-4 py-4 text-sm leading-6 text-emerald-900/78">
          Gdy podepniemy drugi realny feed lotniczy z listą cen, ten blok moze znowu pokazywac shortlisty ofert. Teraz najuczciwszy i komercyjnie sensowny flow to szybkie przejscie do partnera dla ustawionej trasy.
        </div>
      </div>

      <div className="mt-5 rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/70 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Trasa</p>
            <p className="mt-1 text-sm font-semibold text-emerald-950">
              {originCity} → {props.destinationCity}
            </p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Termin</p>
            <p className="mt-1 text-sm font-semibold text-emerald-950">{departureDate}</p>
          </div>
          <div className="rounded-2xl bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Pasazerowie</p>
            <p className="mt-1 text-sm font-semibold text-emerald-950">{passengers}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a href={redirectHref} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">
            Szukaj lotow w {partnerLabel}
          </a>
        </div>
      </div>
    </section>
  );
}
