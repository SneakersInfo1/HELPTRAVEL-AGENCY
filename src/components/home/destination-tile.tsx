import Image from "next/image";

import { LocalizedLink } from "@/components/site/localized-link";
import { DEFAULT_ORIGIN_CITY } from "@/lib/mvp/origin-cities";
import type { DestinationProfile } from "@/lib/mvp/types";

interface DestinationTileProps {
  destination: DestinationProfile;
  heroImage: string;
  // Domyslnie 4 noce, 2 osoby — taki sam set jak w destination-page.tsx,
  // zeby uzytkownik dostal w plannerze juz wypelniony rozsadny scenariusz.
  defaultNights?: number;
  defaultTravelers?: number;
}

export function DestinationTile({
  destination,
  heroImage,
  defaultNights = 4,
  defaultTravelers = 2,
}: DestinationTileProps) {
  const params = new URLSearchParams({
    mode: "standard",
    destination: destination.city,
    origin: DEFAULT_ORIGIN_CITY,
    nights: String(defaultNights),
    travelers: String(defaultTravelers),
  });
  const href = `/planner?${params.toString()}`;
  const flightHoursLabel = `~${destination.typicalFlightHoursFromPL.toFixed(1)} h z PL`;

  return (
    <LocalizedLink
      href={href}
      className="group relative flex aspect-[4/3] overflow-hidden rounded-2xl border border-emerald-900/10 bg-emerald-50 shadow-[0_8px_24px_rgba(16,84,48,0.08)] transition hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(16,84,48,0.16)]"
    >
      <Image
        src={heroImage}
        alt={`${destination.city}, ${destination.country}`}
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        className="object-cover transition duration-300 group-hover:scale-[1.04]"
      />
      <div className="relative z-10 mt-auto w-full bg-[linear-gradient(180deg,rgba(5,18,11,0)_0%,rgba(5,18,11,0.78)_100%)] p-3 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
          {destination.country}
        </p>
        <h3 className="mt-1 font-display text-xl leading-tight">{destination.city}</h3>
        <p className="mt-1 text-[11px] text-white/80">{flightHoursLabel}</p>
      </div>
    </LocalizedLink>
  );
}
