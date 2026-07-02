import Image from "next/image";
import Link from "next/link";

import type { MoodPick } from "@/lib/mvp/travel-moods";
import type { DestinationMedia } from "@/lib/mvp/visuals";

// One destination on a mood landing page. Server component (links only) — image
// + region/name overlay, honest one-line overview, tag chips, best-season line
// and CTAs to hotels (+flights) and, when available, the full guide.
export function MoodDestinationCard({
  pick,
  media,
  hotelsHref,
  guideHref,
  fromPricePerNight,
  flightFromPln,
  flightsHref,
}: {
  pick: MoodPick;
  media: DestinationMedia;
  hotelsHref: string;
  guideHref?: string;
  /** Prawdziwa cena ze snapshotu dstprice:v1 (tylko grzane kierunki; brak = brak linii). */
  fromPricePerNight?: number;
  /** Najtańszy lot w obie strony z WAW (total PLN/os., snapshot Faza 6). */
  flightFromPln?: number;
  /** CTA lotów — tylko gdy miasto ma IATA w słowniku lotnisk. */
  flightsHref?: string;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-[1.5rem] border border-emerald-900/10 bg-white shadow-[0_16px_40px_rgba(16,84,48,0.08)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_52px_rgba(16,84,48,0.14)]">
      <div className="relative h-52 overflow-hidden">
        <Image
          src={media.heroImage}
          alt={`${pick.name}, ${pick.countryPl}`}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,26,15,0.06)_0%,rgba(8,26,15,0.64)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
            {pick.region} · {pick.countryPl}
          </p>
          <h3 className="mt-1 font-display text-2xl leading-tight">{pick.name}</h3>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-sm leading-7 text-emerald-900/80">{pick.overview}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {pick.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800"
            >
              {t}
            </span>
          ))}
        </div>

        {typeof fromPricePerNight === "number" && (
          <p className="mt-3 text-sm font-bold text-emerald-700">
            Hotel od {fromPricePerNight} zł
            <span className="ml-1 text-[11px] font-medium text-emerald-900/70">/ noc</span>
          </p>
        )}
        {typeof flightFromPln === "number" && (
          <p className="mt-0.5 text-xs font-medium text-emerald-900/75">
            Lot z Warszawy od {flightFromPln} zł
          </p>
        )}

        <p className="mt-3 text-xs text-emerald-900/60">
          <span className="font-semibold text-emerald-800">Najlepszy czas:</span> {pick.season}
        </p>

        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          <Link
            href={hotelsHref}
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold transition hover:bg-emerald-800"
          >
            {/* span keeps the label white despite the global a{color:inherit} */}
            <span className="text-white">Zobacz hotele →</span>
          </Link>
          {flightsHref && (
            <Link
              href={flightsHref}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-emerald-900/10 bg-white px-4 py-2 text-sm font-semibold transition hover:bg-emerald-50"
            >
              <span className="text-emerald-950">Sprawdź loty</span>
            </Link>
          )}
          {guideHref && (
            <Link
              href={guideHref}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-emerald-900/10 bg-white px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
            >
              Przewodnik
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
