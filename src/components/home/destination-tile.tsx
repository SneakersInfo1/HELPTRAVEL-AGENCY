import Image from "next/image";

import { LocalizedLink } from "@/components/site/localized-link";
import {
  formatPricePLN,
  getDestinationSocialProof,
} from "@/lib/mvp/destination-social-proof";
import { DEFAULT_ORIGIN_CITY } from "@/lib/mvp/origin-cities";
import type { DestinationProfile } from "@/lib/mvp/types";

interface DestinationTileProps {
  destination: DestinationProfile;
  heroImage: string;
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

  const sp = getDestinationSocialProof(destination.slug);
  const reviewsShort =
    sp.reviewsCount >= 1000
      ? `${(sp.reviewsCount / 1000).toFixed(1)}k`
      : String(sp.reviewsCount);

  // Pokaz tylko jeden badge na raz (priorytet: HotDeal > Bestseller)
  const topBadge = sp.discountPct
    ? { label: `-${sp.discountPct}%`, cls: "bg-rose-500 text-white" }
    : sp.isHotDeal
    ? { label: "🔥 Hot", cls: "bg-amber-500 text-white" }
    : sp.isBestseller
    ? { label: "⭐ Bestseller", cls: "bg-emerald-500 text-white" }
    : null;

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

      {/* Top-left: rating pill */}
      <div className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-emerald-950 shadow-md backdrop-blur-sm">
        <span aria-hidden className="text-amber-500">★</span>
        <span className="tabular-nums">{sp.rating.toFixed(1)}</span>
        <span className="text-emerald-900/60 font-medium">({reviewsShort})</span>
      </div>

      {/* Top-right: badge (bestseller / hot / deal %) */}
      {topBadge && (
        <div
          className={`absolute right-2 top-2 z-10 inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold shadow-md ${topBadge.cls}`}
        >
          {topBadge.label}
        </div>
      )}

      {/* Bottom gradient + copy */}
      <div className="relative z-10 mt-auto w-full bg-[linear-gradient(180deg,rgba(5,18,11,0)_0%,rgba(5,18,11,0.9)_55%,rgba(5,18,11,0.95)_100%)] p-3 text-white">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
            {destination.country}
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-100 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            {sp.planningNow}
          </span>
        </div>
        <h3 className="mt-1 font-display text-xl leading-tight">{destination.city}</h3>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-[11px] text-white/80">{flightHoursLabel}</p>
          <p className="text-[11px] font-bold text-amber-200">
            od <span className="tabular-nums">{formatPricePLN(sp.priceFromPLN)}</span> zl
          </p>
        </div>
      </div>
    </LocalizedLink>
  );
}
