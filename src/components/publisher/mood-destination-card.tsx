import Image from "next/image";
import Link from "next/link";

import { formatPricePln } from "@/lib/home/deal-card";
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
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-sm transition duration-200 ease-out hover:-translate-y-1 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="relative aspect-[16/10] overflow-hidden">
        <Image
          src={media.heroImage}
          alt=""
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover"
        />
        {/* Scrim przypięty do tekstu, 0,72 = zmierzona podłoga dla 4,5:1 bieli
            na najjaśniejszym zdjęciu z puli. Wcześniej gradient startował od
            0,06 i nazwa miasta ginęła na jasnym kadrze. */}
        <div className="absolute inset-x-0 bottom-0">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-[linear-gradient(to_top,rgba(5,18,11,0.72),rgba(5,18,11,0))]"
          />
          <div className="relative bg-[linear-gradient(180deg,rgba(5,18,11,0.72)_0%,rgba(5,18,11,0.93)_45%,rgba(5,18,11,0.96)_100%)] p-4 text-white">
            <p className="text-xs text-white/85">
              {pick.region} · {pick.countryPl}
            </p>
            <h3 className="mt-0.5 font-display text-xl leading-tight text-white">{pick.name}</h3>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-sm leading-6 text-ink-muted">{pick.overview}</p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {pick.tags.map((t) => (
            <span key={t} className="rounded-sm bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-ink">
              {t}
            </span>
          ))}
        </div>

        {/* Ceny przez `formatPricePln`: `Intl` dla pl-PL domyślnie NIE grupuje
            kwot czterocyfrowych, więc cena lotu wychodziła jako „1500 zł". */}
        {typeof fromPricePerNight === "number" && (
          <p className="mt-4 text-base font-bold text-accent">
            Hotel od {formatPricePln(fromPricePerNight)}
            <span className="ml-1 text-sm font-medium text-ink-muted">/ noc</span>
          </p>
        )}
        {typeof flightFromPln === "number" && (
          <p className="mt-1 text-sm text-ink-muted">Lot z Warszawy od {formatPricePln(flightFromPln)}</p>
        )}

        <p className="mt-4 text-sm text-ink-muted">
          <span className="font-semibold text-ink">Najlepszy czas:</span> {pick.season}
        </p>

        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          <Link
            href={hotelsHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 transition duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            {/* Etykieta w <span> — globalne `a{color:inherit}` bije `text-*` na <a>. */}
            <span className="text-sm font-bold text-white">Zobacz hotele</span>
          </Link>
          {flightsHref && (
            <Link
              href={flightsHref}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-line px-5 transition duration-150 ease-out hover:bg-surface-sunken active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-semibold text-ink">Sprawdź loty</span>
            </Link>
          )}
          {guideHref && (
            <Link
              href={guideHref}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-line px-5 transition duration-150 ease-out hover:bg-surface-sunken active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <span className="text-sm font-semibold text-ink">Przewodnik</span>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
