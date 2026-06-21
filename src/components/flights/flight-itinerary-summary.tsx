"use client";

// Podsumowanie wybranego lotu w checkoutcie (zadanie: „checkout jak w topowym
// serwisie lotniczym"). Per odcinek: logo linii, godziny wylotu/przylotu, kody
// lotnisk, DATA, czas trwania i przesiadki. Reużywane na „Bagaż i taryfa" oraz
// „Dane pasażerów" (sticky podsumowanie). Czyste, client-safe.

import { AirlineLogo } from "@/components/flights/airline-logo";
import { fmtDuration, fmtTime, stopsLabel, type DisplayLeg, type DisplayOffer } from "@/lib/flights/display";

/** "śr, 20 sie" — dzień tygodnia + data, locale pl. */
function fmtDayLabel(iso?: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pl-PL", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

function LegRow({ leg, dateIso }: { leg: DisplayLeg; dateIso?: string }) {
  const day = fmtDayLabel(dateIso);
  const carriers = leg.carriers.join(", ");
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
          {leg.direction === "OUTBOUND" ? "Wylot" : "Powrót"}
          {day && <span className="ml-1.5 font-medium normal-case tracking-normal text-neutral-500">· {day}</span>}
        </span>
        <span className="shrink-0 text-[11px] font-medium text-neutral-500">{fmtDuration(leg.durationMinutes)}</span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <AirlineLogo
          logoUrl={leg.carrierLogo}
          code={leg.carrierCode}
          name={leg.carriers[0]}
          size={34}
          className="ring-1 ring-neutral-200/70"
        />
        <div className="flex flex-1 items-center gap-2.5">
          <div className="text-right">
            <p className="text-lg font-bold leading-none text-neutral-900 tabular-nums">{fmtTime(leg.departureTime)}</p>
            <p className="mt-0.5 text-xs font-semibold text-neutral-500">{leg.originCode}</p>
          </div>
          <div className="flex flex-1 flex-col items-center">
            <span className="text-[10px] font-medium text-neutral-400">{stopsLabel(leg.stops)}</span>
            <div className="relative my-1 h-px w-full bg-neutral-200">
              <span aria-hidden className="absolute -top-[7px] right-0 text-[11px] text-emerald-600">✈</span>
            </div>
          </div>
          <div>
            <p className="text-lg font-bold leading-none text-neutral-900 tabular-nums">{fmtTime(leg.arrivalTime)}</p>
            <p className="mt-0.5 text-xs font-semibold text-neutral-500">{leg.destinationCode}</p>
          </div>
        </div>
      </div>

      {carriers && <p className="mt-1.5 text-[11px] text-neutral-500">{carriers}</p>}
    </div>
  );
}

export function FlightItinerarySummary({
  offer,
  depart,
  ret,
  className = "",
}: {
  offer: DisplayOffer;
  depart: string;
  ret?: string;
  className?: string;
}) {
  return (
    <div className={`divide-y divide-neutral-100 ${className}`}>
      {offer.legs.map((leg) => (
        <LegRow
          key={leg.direction}
          leg={leg}
          dateIso={leg.direction === "OUTBOUND" ? depart : ret}
        />
      ))}
    </div>
  );
}
