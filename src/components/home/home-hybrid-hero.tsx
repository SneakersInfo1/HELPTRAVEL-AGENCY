import { CinematicBackdrop } from "./cinematic-backdrop";
import { DestinationTile } from "./destination-tile";
import { MiniPlannerForm } from "./mini-planner-form";
import { MoodChips } from "./mood-chips";
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
    <section className="relative overflow-hidden rounded-[2rem] shadow-[0_30px_80px_rgba(16,84,48,0.22)]">
      {/* Cinematic tlo */}
      <CinematicBackdrop images={backdropImages} />

      {/* Content */}
      <div className="relative z-10 flex min-h-[620px] flex-col justify-between px-5 py-10 sm:px-8 sm:py-14 lg:min-h-[680px] lg:px-12 lg:py-16">
        {/* Gorna czesc — badge + mood chips */}
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white backdrop-blur-md">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            HelpTravel · Twoj AI planer podrozy
          </div>
          <MoodChips />
        </div>

        {/* Srodek — headline */}
        <div className="mx-auto mt-8 max-w-3xl text-center sm:mt-10">
          <h1 className="font-display text-4xl font-semibold leading-[1.02] text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.4)] sm:text-5xl md:text-6xl lg:text-[4.25rem]">
            Gdzie{" "}
            <span className="bg-gradient-to-r from-amber-300 via-orange-300 to-rose-300 bg-clip-text text-transparent">
              uciekasz
            </span>{" "}
            tym razem?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/85 drop-shadow-md sm:text-base sm:leading-8">
            Wybierz kierunek, daty i pasazerow — w 3 minut znajdziemy Ci najlepszy lot, hotel i
            pomysl na wyjazd z Polski lub z calej Europy.
          </p>
        </div>

        {/* Dolna czesc — form + trust signals */}
        <div className="mt-8 space-y-5 sm:mt-10">
          <MiniPlannerForm destinationOptions={destinationOptions} compact />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-white/75 sm:text-xs">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="text-amber-300">✦</span>
              Darmowe planowanie
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="text-amber-300">✦</span>
              Loty z 22 lotnisk (Polska + Europa)
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="text-amber-300">✦</span>
              {featured.length > 0 ? `${destinationOptions.length}+` : "100+"} sprawdzonych kierunkow
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="text-amber-300">✦</span>
              Bez rejestracji
            </span>
          </div>
        </div>
      </div>

      {/* Kafelki pod hero — "gotowy pomysl" */}
      <div className="relative z-10 border-t border-white/15 bg-gradient-to-b from-emerald-950/40 via-emerald-950/70 to-emerald-950/90 px-5 py-6 backdrop-blur-md sm:px-8 sm:py-8 lg:px-12">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
            Albo zacznij od gotowego pomyslu
          </p>
          <span className="text-[11px] text-white/60">najczesciej wybierane</span>
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
  );
}
