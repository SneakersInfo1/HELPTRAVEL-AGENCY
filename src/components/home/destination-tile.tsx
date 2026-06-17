import Image from "next/image";

import { LocalizedLink } from "@/components/site/localized-link";
import { localizeCity, localizeCountry } from "@/lib/mvp/i18n-geo";
import { DEFAULT_ORIGIN_CITY } from "@/lib/mvp/origin-cities";
import type { DestinationProfile } from "@/lib/mvp/types";

// Honest destination tile (homepage, /kierunki, /o-nas, /inspiracje).
// 2026-06-11 cleanup: the previous version rendered ratings, review counts,
// "N planning now", discount badges and "od X zł" prices that were ALL
// hash-derived fiction (see deleted lib/mvp/destination-social-proof.ts).
// What remains is only what we can stand behind: photo, country, the city
// name (localised to Polish) and the typical flight time from Poland.
//
// `badge` is an OPTIONAL editorial tag (e.g. „Polecane") the caller can pass
// on curated surfaces like the homepage „Popularne kierunki" band — it is a
// truthful label about OUR selection, NOT a fabricated rating/review score.
// `size="lg"` renders a bigger card (homepage hero) with larger type.

interface DestinationTileProps {
  destination: DestinationProfile;
  heroImage: string;
  defaultNights?: number;
  defaultTravelers?: number;
  /** Optional editorial badge shown top-left (e.g. „Polecane"). */
  badge?: string;
  /** Visual scale. „lg" = bigger photo + larger heading (homepage). */
  size?: "default" | "lg";
}

export function DestinationTile({
  destination,
  heroImage,
  defaultNights = 4,
  defaultTravelers = 2,
  badge,
  size = "default",
}: DestinationTileProps) {
  const isLarge = size === "lg";
  // Sesja C1 FIX 7: chips link directly to the unified results page with
  // destination + country pre-filled. No dates → page renders the empty
  // prompt with the sticky search form ready for the user to pick dates.
  // (Old `/planner?mode=standard&...` shape was bouncing through middleware
  // 308 to /hotele/szukaj which didn't understand mode/nights, leaving the
  // user on a 404-feeling empty page.)
  void defaultNights; // dates intentionally not pre-filled — user picks them
  const params = new URLSearchParams({
    destination: destination.city,
    country: destination.country,
    origin: DEFAULT_ORIGIN_CITY,
    adults: String(defaultTravelers),
    rooms: "1",
  });
  const href = `/hotele/szukaj?${params.toString()}`;
  const flightHoursLabel = `~${destination.typicalFlightHoursFromPL.toFixed(1)} h z PL`;
  const cityLabel = localizeCity(destination.city);

  return (
    <LocalizedLink
      href={href}
      className={`group relative flex ${isLarge ? "aspect-[4/5]" : "aspect-[4/3]"} overflow-hidden rounded-2xl border border-emerald-900/10 bg-emerald-50 shadow-[0_8px_24px_rgba(16,84,48,0.08)] transition hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(16,84,48,0.16)]`}
    >
      <Image
        src={heroImage}
        alt={`${cityLabel}, ${localizeCountry(destination.country)}`}
        fill
        sizes={isLarge ? "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"}
        className="object-cover transition duration-300 group-hover:scale-[1.04]"
      />

      {/* Editorial badge (np. „Polecane") — prawdziwa etykieta o NASZYM
          wyborze, nie zmyślona ocena/recenzja. */}
      {badge ? (
        <span className="absolute left-2.5 top-2.5 z-20 inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm backdrop-blur-sm">
          <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 text-amber-300">
            <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.95 2.6.94-5.5-4-3.9 5.53-.8z" />
          </svg>
          {badge}
        </span>
      ) : null}

      {/* Bottom gradient + copy */}
      <div className="relative z-10 mt-auto w-full bg-[linear-gradient(180deg,rgba(5,18,11,0)_0%,rgba(5,18,11,0.9)_55%,rgba(5,18,11,0.95)_100%)] p-3 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
          {localizeCountry(destination.country)}
        </p>
        <h3 className={`mt-1 font-display leading-tight ${isLarge ? "text-2xl" : "text-xl"}`}>{cityLabel}</h3>
        <p className="mt-1.5 text-[11px] text-white/80">{flightHoursLabel}</p>
      </div>
    </LocalizedLink>
  );
}
