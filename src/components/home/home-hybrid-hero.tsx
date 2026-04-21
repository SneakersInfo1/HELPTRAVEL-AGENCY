import { CinematicBackdrop } from "./cinematic-backdrop";
import { ConversionToasts } from "./conversion-toasts";
import { DestinationTile } from "./destination-tile";
import { LiveVisitorBadge } from "./live-visitor-badge";
import { MiniPlannerForm } from "./mini-planner-form";
import { MoodChips } from "./mood-chips";
import { UrgencyStrip } from "./urgency-strip";
import type { DestinationProfile } from "@/lib/mvp/types";

interface FeaturedTile {
  destination: DestinationProfile;
  heroImage: string;
}

interface HomeHybridHeroProps {
  featured: FeaturedTile[];
  destinationOptions: Array<Pick<DestinationProfile, "city" | "country">>;
}

export function HomeHybridHero({ featured, destinationOptions }: HomeHybridHeroProps) {
  const backdropImages = featured.slice(0, 6).map((tile) => ({
    src: tile.heroImage,
    alt: `${tile.destination.city}, ${tile.destination.country}`,
  }));

  return (
    <>
      {/* Urgency strip nad hero */}
      <UrgencyStrip />

      <section className="relative overflow-hidden rounded-b-[2rem] shadow-[0_30px_80px_rgba(16,84,48,0.22)] sm:rounded-[2rem]">
        {/* Cinematic tlo */}
        <CinematicBackdrop images={backdropImages} />

        {/* Live visitor badge (top-right, absolute) */}
        <LiveVisitorBadge />

        {/* Content — kompaktowe, form widoczny w pierwszym viewporcie */}
        <div className="relative z-10 flex min-h-[560px] flex-col gap-5 px-5 py-6 sm:min-h-[600px] sm:gap-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
          {/* Top row: badge + 100% DARMOWE */}
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white backdrop-blur-md sm:text-[11px]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              AI planer podrozy
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/50 bg-emerald-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-100 backdrop-blur-md sm:text-[11px]">
              <span aria-hidden>🎁</span>
              100% DARMOWE
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[10px] font-semibold text-white backdrop-blur-md sm:text-[11px]">
              <span aria-hidden className="text-amber-300">★</span>
              4.8/5 · 2341 planow w tym miesiacu
            </div>
          </div>

          {/* Mood chips */}
          <MoodChips />

          {/* Headline */}
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-display text-3xl font-semibold leading-[1.02] text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)] sm:text-4xl md:text-5xl lg:text-[3.5rem]">
              Gdzie{" "}
              <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 bg-clip-text text-transparent">
                uciekasz
              </span>{" "}
              tym razem?
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-xs leading-6 text-white/85 drop-shadow-md sm:mt-3 sm:text-sm sm:leading-7">
              Kierunek, daty, pasazerowie — w 3 minut gotowy plan z lotem i hotelem.
              Z Polski albo z calej Europy.
            </p>
          </div>

          {/* Form */}
          <div className="mt-auto">
            <MiniPlannerForm destinationOptions={destinationOptions} compact />
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[10px] text-white/80 sm:text-[11px]">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="text-amber-300">✦</span>
                Loty z 22 lotnisk (PL + EU)
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="text-amber-300">✦</span>
                Bez rejestracji
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="text-amber-300">✦</span>
                Bezpieczne platnosci u partnerow
              </span>
            </div>
          </div>
        </div>

        {/* Kafelki pod hero — "gotowy pomysl" */}
        <div className="relative z-10 border-t border-white/15 bg-gradient-to-b from-emerald-950/40 via-emerald-950/70 to-emerald-950/90 px-5 py-6 backdrop-blur-md sm:px-8 sm:py-8 lg:px-12">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
              Najczesciej wybierane w tym tygodniu
            </p>
            <span className="text-[11px] text-white/60">aktualizacja: co godzine</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {featured.map((tile) => (
              <DestinationTile
                key={tile.destination.slug}
                destination={tile.destination}
                heroImage={tile.heroImage}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Toasty konwersyjne (fixed, global) */}
      <ConversionToasts />
    </>
  );
}
